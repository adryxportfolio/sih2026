-- =============================================================================
--  SAMIKSHA · 0004 · Assessment, Quizzes & MCQ Generation
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  QUIZZES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.quizzes (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references public.profiles(id) on delete set null,

  title           text not null,
  description     text,

  -- Provenance: what was this generated from?
  material_id     uuid references public.materials(id) on delete cascade,
  course_id       uuid references public.courses(id) on delete set null,

  quiz_kind       text not null default 'practice'
                  check (quiz_kind in ('diagnostic','practice','assessment','adaptive','daily_review')),

  -- Adaptive quizzes pick the next question from live ability estimates
  is_adaptive     boolean not null default false,

  time_limit_sec  int check (time_limit_sec > 0),
  pass_threshold  real not null default 0.7 check (pass_threshold between 0 and 1),
  shuffle_questions boolean not null default true,

  -- Generation audit
  generated_by_ai boolean not null default false,
  generation_model text,
  generation_meta jsonb not null default '{}'::jsonb,

  visibility      text not null default 'private'
                  check (visibility in ('private','organization','public')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index quizzes_owner_idx    on public.quizzes(owner_id);
create index quizzes_material_idx on public.quizzes(material_id);

create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  QUESTIONS
--  `options` shape: [{ "id":"a", "text":"…" }, …]
--  `correct_option_ids`: array of option ids (supports multi-select)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  quiz_id            uuid not null references public.quizzes(id) on delete cascade,

  kind               public.question_kind not null default 'mcq_single',
  stem               text not null,
  options            jsonb not null default '[]'::jsonb,
  correct_option_ids text[] not null default '{}',
  numeric_answer     real,
  numeric_tolerance  real default 0,

  -- Pedagogy metadata — what elevates this above a generic quiz generator
  explanation        text not null default '',
  bloom              public.bloom_level not null default 'understand',
  difficulty         real not null default 2.0 check (difficulty between 0 and 4),
  competency_id      uuid references public.competencies(id) on delete set null,

  -- Why each wrong option is wrong: {"b":"Confuses mean with median …"}
  distractor_rationales jsonb not null default '{}'::jsonb,

  -- Grounding: exact source span, so every question is traceable to the upload
  source_chunk_id    uuid references public.material_chunks(id) on delete set null,
  source_quote       text,
  source_page        int,

  -- Live difficulty calibration from real responses
  times_answered     int not null default 0,
  times_correct      int not null default 0,

  sort_order         int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);
create index questions_quiz_idx on public.questions(quiz_id, sort_order);
create index questions_comp_idx on public.questions(competency_id);

comment on column public.questions.source_quote is
  'Verbatim span from the uploaded material that justifies the answer. Powers the "Show me where this came from" affordance and guards against hallucination.';

-- Observed difficulty (p-value inverted onto the 0..4 ladder)
create or replace function public.question_observed_difficulty(q public.questions)
returns real
language sql
immutable
set search_path = ''
as $$
  select case
    when q.times_answered < 5 then q.difficulty
    else (4.0 * (1.0 - (q.times_correct::real / nullif(q.times_answered,0))))::real
  end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  QUIZ ATTEMPTS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,

  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  duration_sec    int,

  score           real,                  -- 0..1
  correct_count   int not null default 0,
  total_count     int not null default 0,
  passed          boolean,

  -- Metacognition: |confidence - correctness|. High values = dangerous
  -- overconfidence, which we surface explicitly to the learner.
  calibration_error real,

  ai_feedback     text,
  created_at      timestamptz not null default now()
);
create index attempts_user_idx on public.quiz_attempts(user_id, created_at desc);
create index attempts_quiz_idx on public.quiz_attempts(quiz_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  QUESTION RESPONSES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.question_responses (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id     uuid not null references public.questions(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,

  selected_option_ids text[] not null default '{}',
  numeric_response    real,
  text_response       text,

  is_correct      boolean not null default false,
  time_taken_ms   int,

  -- Learner's self-rated confidence 1..5, captured BEFORE reveal.
  -- Enables calibration feedback — a proven metacognitive intervention.
  confidence      int check (confidence between 1 and 5),

  answered_at     timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index responses_attempt_idx  on public.question_responses(attempt_id);
create index responses_user_idx     on public.question_responses(user_id, answered_at desc);
create index responses_question_idx on public.question_responses(question_id);

-- Keep per-question calibration stats current
create or replace function public.tg_update_question_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.questions
     set times_answered = times_answered + 1,
         times_correct  = times_correct + (case when new.is_correct then 1 else 0 end)
   where id = new.question_id;
  return new;
end;
$$;

create trigger responses_update_question_stats
  after insert on public.question_responses
  for each row execute function public.tg_update_question_stats();

-- ─────────────────────────────────────────────────────────────────────────────
--  apply_response_to_competency()
--  Turns one answered question into evidence about a competency.
--
--  Model: each response implies an ability level. Answering a difficulty-d
--  item correctly implies ability ≳ d; failing it implies ability ≲ d. We
--  blend that implied level into the running estimate with a learning rate
--  that decays as evidence accumulates (Robbins–Monro style), so early
--  answers move the needle fast and later ones refine rather than thrash.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.apply_response_to_competency(
  p_user_id       uuid,
  p_competency_id uuid,
  p_difficulty    real,
  p_is_correct    boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_score real;
  v_n         int;
  v_implied   real;
  v_alpha     real;
  v_new_score real;
  v_conf      real;
begin
  if p_competency_id is null then
    return;
  end if;

  insert into public.user_competency_scores (user_id, competency_id)
  values (p_user_id, p_competency_id)
  on conflict (user_id, competency_id) do nothing;

  select score, evidence_count
    into v_old_score, v_n
  from public.user_competency_scores
  where user_id = p_user_id and competency_id = p_competency_id;

  -- Implied ability from this single item
  v_implied := case
    when p_is_correct then least(4.0, p_difficulty + 0.6)
    else greatest(0.0, p_difficulty - 1.0)
  end;

  -- Decaying learning rate: 0.5 at n=0 → ~0.08 at n=20. Floor keeps it adaptive.
  v_alpha := greatest(0.08, 1.0 / (2.0 + v_n));

  v_new_score := greatest(0.0, least(4.0, v_old_score * (1 - v_alpha) + v_implied * v_alpha));

  -- Confidence saturates with evidence: n/(n+8)
  v_conf := (v_n + 1)::real / ((v_n + 1) + 8.0);

  update public.user_competency_scores
     set score            = v_new_score,
         confidence       = v_conf,
         evidence_count   = v_n + 1,
         total_count      = total_count + 1,
         correct_count    = correct_count + (case when p_is_correct then 1 else 0 end),
         last_assessed_at = now()
   where user_id = p_user_id and competency_id = p_competency_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  submit_quiz_attempt()  — grade, score competencies, recompute gaps.
--  One transactional RPC so the client can't desync scoring state.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_quiz_attempt(p_attempt_id uuid)
returns table (
  score          real,
  correct_count  int,
  total_count    int,
  passed         boolean,
  calibration_error real
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid;
  v_quiz_id   uuid;
  v_threshold real;
  v_correct   int;
  v_total     int;
  v_score     real;
  v_cal       real;
  v_started   timestamptz;
  r           record;
begin
  select a.user_id, a.quiz_id, a.started_at
    into v_user_id, v_quiz_id, v_started
  from public.quiz_attempts a where a.id = p_attempt_id;

  if v_user_id is null then
    raise exception 'Attempt % not found', p_attempt_id;
  end if;

  if v_user_id <> (select auth.uid()) then
    raise exception 'Not authorised to submit this attempt';
  end if;

  select q.pass_threshold into v_threshold from public.quizzes q where q.id = v_quiz_id;

  select count(*) filter (where r2.is_correct),
         count(*)
    into v_correct, v_total
  from public.question_responses r2
  where r2.attempt_id = p_attempt_id;

  v_score := case when v_total > 0 then v_correct::real / v_total else 0 end;

  -- Mean |normalised confidence − correctness| over answered, confidence-rated items
  select avg(abs(((r3.confidence - 1)::real / 4.0) - (case when r3.is_correct then 1.0 else 0.0 end)))
    into v_cal
  from public.question_responses r3
  where r3.attempt_id = p_attempt_id and r3.confidence is not null;

  -- Feed every response into the competency model
  for r in
    select r4.is_correct, q.competency_id, q.difficulty
    from public.question_responses r4
    join public.questions q on q.id = r4.question_id
    where r4.attempt_id = p_attempt_id
  loop
    perform public.apply_response_to_competency(
      v_user_id, r.competency_id, r.difficulty, r.is_correct
    );
  end loop;

  update public.quiz_attempts
     set submitted_at      = now(),
         duration_sec      = greatest(0, extract(epoch from (now() - v_started))::int),
         score             = v_score,
         correct_count     = v_correct,
         total_count       = v_total,
         passed            = (v_score >= coalesce(v_threshold, 0.7)),
         calibration_error = v_cal
   where id = p_attempt_id;

  perform public.recompute_competency_gaps(v_user_id);

  return query
    select v_score, v_correct, v_total,
           (v_score >= coalesce(v_threshold, 0.7)), v_cal;
end;
$$;
