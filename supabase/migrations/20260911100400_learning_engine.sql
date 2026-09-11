-- =============================================================================
--  SAMIKSHA · 0005 · Learning Science Engine
--
--  Implements four interventions with the strongest evidence base in the
--  cognitive-psychology literature:
--    1. Spaced repetition      — FSRS-6 (Free Spaced Repetition Scheduler)
--    2. Retrieval practice     — active recall over re-reading (testing effect)
--    3. Interleaving           — mixing competencies within a session
--    4. Metacognitive calibration — confidence rated before reveal
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  DECKS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.decks (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  description   text,
  material_id   uuid references public.materials(id) on delete cascade,
  competency_id uuid references public.competencies(id) on delete set null,
  color         text default '#2563EB',
  icon          text,
  created_at    timestamptz not null default now()
);
create index decks_owner_idx on public.decks(owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  FLASHCARDS  (FSRS-6 memory state lives on the row)
--
--  FSRS models memory with three variables:
--    Stability (S)      — days until recall probability decays to 90%
--    Difficulty (D)     — 1..10, intrinsic hardness of the item
--    Retrievability (R) — current recall probability, derived from S and elapsed
-- ─────────────────────────────────────────────────────────────────────────────
create table public.flashcards (
  id              uuid primary key default gen_random_uuid(),
  deck_id         uuid not null references public.decks(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,

  front           text not null,
  back            text not null,
  hint            text,
  -- Elaborative "why" — answering why-questions strengthens encoding
  elaboration     text,

  competency_id   uuid references public.competencies(id) on delete set null,
  source_material_id uuid references public.materials(id) on delete set null,
  source_quote    text,
  bloom           public.bloom_level not null default 'remember',

  -- ── FSRS state ────────────────────────────────────────────────────────────
  state           public.card_state not null default 'new',
  stability       real not null default 0,
  difficulty      real not null default 0,
  due             timestamptz not null default now(),
  last_review     timestamptz,
  reps            int not null default 0,
  lapses          int not null default 0,
  -- position within learning/relearning step ladder
  step            int not null default 0,

  suspended       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index flashcards_due_idx  on public.flashcards(user_id, due) where suspended = false;
create index flashcards_deck_idx on public.flashcards(deck_id);
create index flashcards_comp_idx on public.flashcards(competency_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  REVIEW LOGS  — immutable history. Required to re-optimise FSRS weights
--  against the learner's own data later.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.review_logs (
  id                uuid primary key default gen_random_uuid(),
  flashcard_id      uuid not null references public.flashcards(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,

  -- 1=Again 2=Hard 3=Good 4=Easy
  rating            int not null check (rating between 1 and 4),
  state_before      public.card_state not null,
  stability_before  real,
  difficulty_before real,
  stability_after   real,
  difficulty_after  real,
  elapsed_days      real,
  scheduled_days    real,
  retrievability    real,
  duration_ms       int,
  reviewed_at       timestamptz not null default now()
);
create index review_logs_user_idx on public.review_logs(user_id, reviewed_at desc);
create index review_logs_card_idx on public.review_logs(flashcard_id, reviewed_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  get_due_cards()  — interleaved by competency.
--
--  Interleaving (mixing topics) produces better transfer than blocking
--  (one topic at a time), even though it feels harder — a "desirable
--  difficulty". We rotate competencies round-robin rather than returning
--  all of competency A then all of B.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_due_cards(
  p_limit int default 30,
  p_deck_id uuid default null
)
returns setof public.flashcards
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked as (
    select
      f.id,
      f.due,
      row_number() over (
        partition by coalesce(f.competency_id, '00000000-0000-0000-0000-000000000000'::uuid)
        order by f.due asc
      ) as rn_in_comp
    from public.flashcards f
    where f.user_id = (select auth.uid())
      and f.suspended = false
      and f.due <= now()
      and (p_deck_id is null or f.deck_id = p_deck_id)
  )
  select f.*
  from public.flashcards f
  join ranked r on r.id = f.id
  -- round-robin across competencies, then by urgency
  order by r.rn_in_comp asc, r.due asc
  limit p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  STUDY SESSIONS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.study_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  session_kind    text not null default 'review'
                  check (session_kind in ('review','quiz','video','reading','tutor','assessment')),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  duration_sec    int not null default 0,
  items_completed int not null default 0,
  items_correct   int not null default 0,
  xp_earned       int not null default 0,
  competency_ids  uuid[] not null default '{}',
  meta            jsonb not null default '{}'::jsonb
);
create index study_sessions_user_idx on public.study_sessions(user_id, started_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  LEARNING PATHS  — the personalised training recommendation
-- ─────────────────────────────────────────────────────────────────────────────
create table public.learning_paths (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  title           text not null,
  summary         text,
  -- AI's stated reasoning for this path. Shown to the learner — a recommender
  -- that explains itself is trusted and acted on far more often.
  rationale       text,

  target_competency_ids uuid[] not null default '{}',
  status          text not null default 'active'
                  check (status in ('active','completed','archived','superseded')),

  estimated_minutes int,
  progress_pct    real not null default 0 check (progress_pct between 0 and 100),

  generated_model text,
  generation_meta jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index paths_user_idx on public.learning_paths(user_id, status);

create trigger paths_set_updated_at
  before update on public.learning_paths
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  PATH ITEMS  — the ordered steps
-- ─────────────────────────────────────────────────────────────────────────────
create table public.path_items (
  id              uuid primary key default gen_random_uuid(),
  path_id         uuid not null references public.learning_paths(id) on delete cascade,

  kind            public.path_item_kind not null,
  title           text not null,
  description     text,
  why_this        text,             -- per-step justification

  course_id       uuid references public.courses(id)     on delete set null,
  video_id        uuid references public.videos(id)      on delete set null,
  quiz_id         uuid references public.quizzes(id)     on delete set null,
  material_id     uuid references public.materials(id)   on delete set null,
  deck_id         uuid references public.decks(id)       on delete set null,
  competency_id   uuid references public.competencies(id) on delete set null,

  estimated_minutes int,
  sort_order      int not null default 0,

  status          text not null default 'pending'
                  check (status in ('pending','in_progress','completed','skipped')),
  completed_at    timestamptz,

  created_at      timestamptz not null default now()
);
create index path_items_path_idx on public.path_items(path_id, sort_order);

-- Roll step completion up into path progress automatically
create or replace function public.tg_recalc_path_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path uuid := coalesce(new.path_id, old.path_id);
  v_total int;
  v_done  int;
begin
  select count(*), count(*) filter (where status in ('completed','skipped'))
    into v_total, v_done
  from public.path_items where path_id = v_path;

  update public.learning_paths
     set progress_pct = case when v_total > 0 then (v_done::real / v_total) * 100 else 0 end,
         status = case
           when v_total > 0 and v_done = v_total then 'completed'
           else status end
   where id = v_path;

  return null;
end;
$$;

create trigger path_items_recalc_progress
  after insert or update of status or delete on public.path_items
  for each row execute function public.tg_recalc_path_progress();
