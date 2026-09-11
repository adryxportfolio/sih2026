-- =============================================================================
--  SAMIKSHA · 0002 · FRAC — Framework of Roles, Activities and Competencies
--
--  FRAC is the competency backbone of iGOT Karmayogi / Mission Karmayogi.
--  It maps, for every government position:
--      ROLE  →  ACTIVITIES  →  COMPETENCIES (at a required proficiency)
--  We model it natively so our gap analysis speaks the Ministry's own language
--  and so records round-trip cleanly through the iGOT adapter.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  COMPETENCIES  (self-referencing hierarchy: area → competency → sub)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.competencies (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,           -- e.g. 'FUN-SAMP-01'
  name            text not null,
  description     text,
  comp_type       public.competency_type not null,
  category        text,                           -- 'Statistical Methods', 'Data Governance', …
  parent_id       uuid references public.competencies(id) on delete set null,

  -- iGOT round-trip
  igot_id         text,                           -- external FRAC competency id
  source          public.content_source not null default 'internal',

  -- Level descriptors: what each rung actually looks like in practice
  level_descriptors jsonb not null default '{}'::jsonb,

  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
comment on column public.competencies.level_descriptors is
  'JSON map proficiency_level -> observable behaviour, e.g. {"practitioner":"Can design a stratified sample …"}';

create index competencies_parent_idx on public.competencies(parent_id);
create index competencies_type_idx   on public.competencies(comp_type);
create index competencies_igot_idx   on public.competencies(igot_id);
create index competencies_name_trgm  on public.competencies using gin (name extensions.gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
--  JOB ROLES  (positions in the statistical system)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.job_roles (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,           -- e.g. 'JSO'
  name            text not null,                  -- 'Junior Statistical Officer'
  description     text,
  organization_id uuid references public.organizations(id) on delete set null,
  grade_level     text,                           -- 'Group B', 'Group A' …
  igot_id         text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Deferred FK from profiles → job_roles
alter table public.profiles
  add constraint profiles_job_role_fk
  foreign key (job_role_id) references public.job_roles(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
--  ACTIVITIES  (what a role actually does, day to day)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  job_role_id   uuid not null references public.job_roles(id) on delete cascade,
  code          text not null,
  name          text not null,
  description   text,
  igot_id       text,
  sort_order    int not null default 0,
  unique (job_role_id, code)
);
create index activities_role_idx on public.activities(job_role_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  ROLE ⇄ COMPETENCY  — the required proficiency bar for each position
-- ─────────────────────────────────────────────────────────────────────────────
create table public.role_competencies (
  id                  uuid primary key default gen_random_uuid(),
  job_role_id         uuid not null references public.job_roles(id) on delete cascade,
  competency_id       uuid not null references public.competencies(id) on delete cascade,
  required_level      public.proficiency_level not null default 'practitioner',
  -- weight lets gap scoring reflect that some competencies matter more
  weight              real not null default 1.0 check (weight > 0 and weight <= 5),
  is_critical         boolean not null default false,
  activity_id         uuid references public.activities(id) on delete set null,
  unique (job_role_id, competency_id)
);
create index role_comp_role_idx on public.role_competencies(job_role_id);
create index role_comp_comp_idx on public.role_competencies(competency_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  Numeric ordinal for proficiency — lets us do arithmetic on the ladder
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.proficiency_ordinal(p public.proficiency_level)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'unskilled'    then 0
    when 'beginner'     then 1
    when 'practitioner' then 2
    when 'proficient'   then 3
    when 'expert'       then 4
  end;
$$;

create or replace function public.ordinal_to_proficiency(n int)
returns public.proficiency_level
language sql
immutable
set search_path = ''
as $$
  select case greatest(0, least(4, n))
    when 0 then 'unskilled'::public.proficiency_level
    when 1 then 'beginner'::public.proficiency_level
    when 2 then 'practitioner'::public.proficiency_level
    when 3 then 'proficient'::public.proficiency_level
    when 4 then 'expert'::public.proficiency_level
  end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  USER COMPETENCY SCORES  — current, evidence-backed proficiency
-- ─────────────────────────────────────────────────────────────────────────────
create table public.user_competency_scores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  competency_id   uuid not null references public.competencies(id) on delete cascade,

  -- Continuous 0..4 mastery estimate; the enum is the rounded, human-facing view
  score           real not null default 0 check (score >= 0 and score <= 4),
  current_level   public.proficiency_level not null default 'unskilled',

  -- How much we trust the estimate (0..1). Grows with evidence volume/recency.
  confidence      real not null default 0 check (confidence >= 0 and confidence <= 1),

  -- Evidence counters feeding the Bayesian-ish update
  evidence_count  int  not null default 0,
  correct_count   int  not null default 0,
  total_count     int  not null default 0,

  last_assessed_at timestamptz,
  updated_at       timestamptz not null default now(),
  unique (user_id, competency_id)
);
create index ucs_user_idx on public.user_competency_scores(user_id);
create index ucs_comp_idx on public.user_competency_scores(competency_id);

create trigger ucs_set_updated_at
  before update on public.user_competency_scores
  for each row execute function public.tg_set_updated_at();

-- Keep the enum view in sync with the continuous score automatically
create or replace function public.tg_sync_competency_level()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.current_level := public.ordinal_to_proficiency(round(new.score)::int);
  return new;
end;
$$;

create trigger ucs_sync_level
  before insert or update of score on public.user_competency_scores
  for each row execute function public.tg_sync_competency_level();

-- ─────────────────────────────────────────────────────────────────────────────
--  COMPETENCY GAPS  — materialised so dashboards stay fast
-- ─────────────────────────────────────────────────────────────────────────────
create table public.competency_gaps (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  competency_id    uuid not null references public.competencies(id) on delete cascade,
  job_role_id      uuid references public.job_roles(id) on delete set null,

  required_level   public.proficiency_level not null,
  current_level    public.proficiency_level not null,
  gap_size         real not null,        -- required_ordinal - current_score (can be <= 0)

  -- gap_size × weight × criticality — what we sort the learning path by
  priority_score   real not null default 0,
  is_critical      boolean not null default false,

  -- AI-authored, human-readable rationale shown to the learner
  rationale        text,

  computed_at      timestamptz not null default now(),
  unique (user_id, competency_id)
);
create index gaps_user_idx     on public.competency_gaps(user_id);
create index gaps_priority_idx on public.competency_gaps(user_id, priority_score desc);

-- ─────────────────────────────────────────────────────────────────────────────
--  recompute_competency_gaps(user)
--  Diffs the user's role requirements against measured proficiency.
--  Called after every assessment / quiz attempt.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.recompute_competency_gaps(p_user_id uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job_role_id uuid;
  v_count int;
begin
  select job_role_id into v_job_role_id
  from public.profiles where id = p_user_id;

  if v_job_role_id is null then
    return 0;
  end if;

  with req as (
    select
      rc.competency_id,
      rc.required_level,
      rc.weight,
      rc.is_critical,
      public.proficiency_ordinal(rc.required_level) as req_ord
    from public.role_competencies rc
    where rc.job_role_id = v_job_role_id
  ),
  cur as (
    select
      r.competency_id,
      r.required_level,
      r.weight,
      r.is_critical,
      r.req_ord,
      coalesce(u.score, 0)      as cur_score,
      coalesce(u.confidence, 0) as confidence,
      coalesce(u.current_level, 'unskilled'::public.proficiency_level) as cur_level
    from req r
    left join public.user_competency_scores u
      on u.competency_id = r.competency_id and u.user_id = p_user_id
  )
  insert into public.competency_gaps (
    user_id, competency_id, job_role_id, required_level, current_level,
    gap_size, priority_score, is_critical, computed_at
  )
  select
    p_user_id,
    c.competency_id,
    v_job_role_id,
    c.required_level,
    c.cur_level,
    (c.req_ord - c.cur_score) as gap_size,
    -- Priority blends: size of gap × importance × criticality bump,
    -- damped by how unsure we are (low confidence ⇒ assess before prescribing).
    greatest(0, c.req_ord - c.cur_score)
      * c.weight
      * (case when c.is_critical then 1.5 else 1.0 end)
      * (0.5 + 0.5 * c.confidence)                    as priority_score,
    c.is_critical,
    now()
  from cur c
  on conflict (user_id, competency_id) do update set
    required_level = excluded.required_level,
    current_level  = excluded.current_level,
    gap_size       = excluded.gap_size,
    priority_score = excluded.priority_score,
    is_critical    = excluded.is_critical,
    job_role_id    = excluded.job_role_id,
    computed_at    = excluded.computed_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
