-- =============================================================================
--  SAMIKSHA · 0006 · Analytics, Gamification, AI Audit, Tutor
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  ACTIVITY EVENTS  — append-only behavioural stream
-- ─────────────────────────────────────────────────────────────────────────────
create table public.activity_events (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  event_type    text not null,           -- 'quiz_submitted','card_reviewed','video_watched',…
  entity_type   text,
  entity_id     uuid,
  competency_id uuid references public.competencies(id) on delete set null,
  value_num     real,
  meta          jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);
create index activity_user_time_idx on public.activity_events(user_id, occurred_at desc);
create index activity_type_idx      on public.activity_events(event_type);

-- ─────────────────────────────────────────────────────────────────────────────
--  DAILY STATS  — per-user per-day rollup powering streaks + heatmap
-- ─────────────────────────────────────────────────────────────────────────────
create table public.daily_stats (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  stat_date         date not null,
  minutes_studied   int not null default 0,
  cards_reviewed    int not null default 0,
  cards_correct     int not null default 0,
  questions_answered int not null default 0,
  questions_correct int not null default 0,
  videos_watched    int not null default 0,
  xp_earned         int not null default 0,
  goal_met          boolean not null default false,
  primary key (user_id, stat_date)
);
create index daily_stats_date_idx on public.daily_stats(stat_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  record_study_progress()  — single entry point for progress + streak.
--  Streak rule: a day counts once the learner's daily goal is met, which
--  ties the habit loop to real effort rather than app-opens.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_study_progress(
  p_minutes    int  default 0,
  p_cards      int  default 0,
  p_cards_ok   int  default 0,
  p_questions  int  default 0,
  p_questions_ok int default 0,
  p_videos     int  default 0,
  p_xp         int  default 0
)
returns table (streak_current int, goal_met boolean, xp bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user   uuid := (select auth.uid());
  v_tz     text;
  v_today  date;
  v_goal   int;
  v_mins   int;
  v_met    boolean;
  v_last   date;
  v_streak int;
  v_longest int;
  v_xp     bigint;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(timezone,'Asia/Kolkata'), daily_goal_minutes,
         last_active_date, streak_current, streak_longest
    into v_tz, v_goal, v_last, v_streak, v_longest
  from public.profiles where id = v_user;

  v_today := (now() at time zone v_tz)::date;

  insert into public.daily_stats as d (
    user_id, stat_date, minutes_studied, cards_reviewed, cards_correct,
    questions_answered, questions_correct, videos_watched, xp_earned
  ) values (
    v_user, v_today, p_minutes, p_cards, p_cards_ok,
    p_questions, p_questions_ok, p_videos, p_xp
  )
  on conflict (user_id, stat_date) do update set
    minutes_studied    = d.minutes_studied    + excluded.minutes_studied,
    cards_reviewed     = d.cards_reviewed     + excluded.cards_reviewed,
    cards_correct      = d.cards_correct      + excluded.cards_correct,
    questions_answered = d.questions_answered + excluded.questions_answered,
    questions_correct  = d.questions_correct  + excluded.questions_correct,
    videos_watched     = d.videos_watched     + excluded.videos_watched,
    xp_earned          = d.xp_earned          + excluded.xp_earned
  returning d.minutes_studied into v_mins;

  v_met := v_mins >= coalesce(v_goal, 20);

  update public.daily_stats set goal_met = v_met
   where user_id = v_user and stat_date = v_today;

  -- Advance the streak only on the first goal-met moment of a new day
  if v_met and (v_last is null or v_last < v_today) then
    if v_last = v_today - 1 then
      v_streak := coalesce(v_streak,0) + 1;
    else
      v_streak := 1;                       -- streak broken (or first ever)
    end if;
    v_longest := greatest(coalesce(v_longest,0), v_streak);

    update public.profiles
       set streak_current   = v_streak,
           streak_longest   = v_longest,
           last_active_date = v_today
     where id = v_user;
  end if;

  update public.profiles
     set xp = xp + greatest(0, p_xp)
   where id = v_user
  returning public.profiles.xp into v_xp;

  return query select coalesce(v_streak,0), v_met, coalesce(v_xp,0);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  ACHIEVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.achievements (
  id           text primary key,           -- 'streak_7', 'first_100_cards', …
  title        text not null,
  description  text not null,
  icon         text,
  tier         text not null default 'bronze' check (tier in ('bronze','silver','gold','platinum')),
  xp_reward    int not null default 0
);

create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
--  AI GENERATIONS  — audit + cost control.
--  Every model call is logged: which model, tokens, latency, cost, outcome.
--  Lets us prove routing decisions and keep spend visible.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.ai_generations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  task            text not null,           -- 'generate_mcq','diagnose_gaps','tutor_reply',…
  model           text not null,
  prompt_tokens   int,
  completion_tokens int,
  total_cost_usd  numeric(12,6),
  latency_ms      int,
  success         boolean not null default true,
  error_message   text,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index ai_gen_user_idx on public.ai_generations(user_id, created_at desc);
create index ai_gen_task_idx on public.ai_generations(task);

-- ─────────────────────────────────────────────────────────────────────────────
--  AI TUTOR  — grounded chat over the learner's own material
-- ─────────────────────────────────────────────────────────────────────────────
create table public.tutor_conversations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null default 'New conversation',
  material_id   uuid references public.materials(id) on delete set null,
  competency_id uuid references public.competencies(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tutor_conv_user_idx on public.tutor_conversations(user_id, updated_at desc);

create trigger tutor_conv_set_updated_at
  before update on public.tutor_conversations
  for each row execute function public.tg_set_updated_at();

create table public.tutor_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tutor_conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  -- Retrieved chunks backing the answer → inline citations in the UI
  citations       jsonb not null default '[]'::jsonb,
  model           text,
  created_at      timestamptz not null default now()
);
create index tutor_msg_conv_idx on public.tutor_messages(conversation_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
--  NOTIFICATIONS  — study reminders, path updates, achievements
-- ─────────────────────────────────────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  deep_link   text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  ORG DASHBOARD VIEW  — aggregate competency health for nodal officers.
--  Aggregate-only by construction: no individual learner is identifiable here.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_org_competency_health
with (security_invoker = true)
as
select
  p.organization_id,
  c.id                       as competency_id,
  c.code                     as competency_code,
  c.name                     as competency_name,
  c.comp_type,
  count(distinct g.user_id)  as learners_assessed,
  avg(g.gap_size)            as avg_gap,
  avg(ucs.score)             as avg_score,
  count(*) filter (where g.gap_size > 1)   as learners_with_major_gap,
  count(*) filter (where g.is_critical and g.gap_size > 0) as critical_gap_count
from public.competency_gaps g
join public.profiles p on p.id = g.user_id
join public.competencies c on c.id = g.competency_id
left join public.user_competency_scores ucs
       on ucs.user_id = g.user_id and ucs.competency_id = g.competency_id
group by p.organization_id, c.id, c.code, c.name, c.comp_type;

comment on view public.v_org_competency_health is
  'Aggregate competency health per organisation for nodal officers. Exposes no individual learner rows.';
