-- =============================================================================
--  SAMIKSHA · COMPLETE DATABASE SCHEMA (all migrations, in order)
--  Generated 2026-09-11 11:33
--
--  HOW TO APPLY:
--    Supabase Dashboard -> SQL Editor -> New query -> paste this whole file
--    -> Run.  Safe to run once on a fresh project.
-- =============================================================================


-- ######################################################################
-- ##  SOURCE: migrations/20260911100000_extensions_and_identity.sql
-- ######################################################################

-- =============================================================================
--  SAMIKSHA · 0001 · Extensions, Enums, Identity
--  AI-enabled capacity building for India's Official Statistical System
-- =============================================================================

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "vector"    with schema extensions;
create extension if not exists "pg_trgm"   with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
--  ENUMS
-- ─────────────────────────────────────────────────────────────────────────────

-- Roles mirror the MoSPI / NSSTA training hierarchy
create type public.app_role as enum (
  'learner',        -- statistical officer / official undergoing capacity building
  'trainer',        -- NSSTA faculty, course creator
  'nodal_officer',  -- ministry/state nodal officer: sees aggregate dashboards
  'admin'           -- platform administrator
);

-- FRAC competency taxonomy (Framework of Roles, Activities and Competencies)
-- The four competency families the National Statistical System actually
-- needs. 'functional' and 'domain' together cover statistical craft; the
-- other two cover the modern skills the workforce is being asked to acquire.
create type public.competency_type as enum (
  'behavioural',        -- Communication, Decision Making, Ethics
  'functional',         -- Sampling Design, Data Quality Assurance
  'domain',             -- National Accounts, Price Statistics, PLFS
  'technical',          -- Python, R, SQL, GIS, ML, Cloud
  'digital_governance'  -- Cybersecurity, DPDP Act, e-Sign, DPI
);

-- Proficiency ladder used across FRAC
create type public.proficiency_level as enum (
  'unskilled',      -- 0
  'beginner',       -- 1
  'practitioner',   -- 2
  'proficient',     -- 3
  'expert'          -- 4
);

create type public.material_status as enum (
  'uploaded', 'extracting', 'chunking', 'embedding', 'ready', 'failed'
);

create type public.content_source as enum (
  'igot', 'internal', 'youtube', 'user_upload'
);

create type public.bloom_level as enum (
  'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'
);

create type public.question_kind as enum (
  'mcq_single', 'mcq_multi', 'true_false', 'numeric', 'short_answer', 'assertion_reason'
);

-- FSRS card lifecycle
create type public.card_state as enum ('new', 'learning', 'review', 'relearning');

create type public.path_item_kind as enum (
  'course', 'video', 'quiz', 'material', 'flashcard_deck', 'practice', 'reflection'
);

-- ─────────────────────────────────────────────────────────────────────────────
--  ORGANIZATIONS  — ministries, state directorates, NSSTA centres
-- ─────────────────────────────────────────────────────────────────────────────
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  short_name    text,
  org_type      text not null default 'department'
                check (org_type in ('ministry','department','state_directorate','training_institute','field_office')),
  parent_id     uuid references public.organizations(id) on delete set null,
  state_code    text,
  created_at    timestamptz not null default now()
);
comment on table public.organizations is
  'Ministries, state statistical directorates and NSSTA training centres.';

create index organizations_parent_idx on public.organizations(parent_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  PROFILES  — 1:1 with auth.users
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text,
  email               text,
  avatar_url          text,
  role                public.app_role not null default 'learner',

  -- Service identity
  employee_code       text,
  designation         text,
  cadre               text,
  organization_id     uuid references public.organizations(id) on delete set null,
  job_role_id         uuid,  -- FK added in 0002 once job_roles exists
  years_of_service    int check (years_of_service >= 0 and years_of_service <= 60),

  -- Personalisation
  preferred_language  text not null default 'en',
  date_of_birth       date,

  -- Learning-science profile
  daily_goal_minutes  int  not null default 20 check (daily_goal_minutes between 5 and 480),
  desired_retention   real not null default 0.90 check (desired_retention between 0.70 and 0.99),
  study_reminder_at   time,
  timezone            text not null default 'Asia/Kolkata',

  -- Gamification
  xp                  bigint not null default 0,
  streak_current      int    not null default 0,
  streak_longest      int    not null default 0,
  last_active_date    date,

  onboarded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on column public.profiles.desired_retention is
  'FSRS target recall probability. Higher = more frequent reviews.';

create index profiles_org_idx      on public.profiles(organization_id);
create index profiles_job_role_idx on public.profiles(job_role_id);
create index profiles_role_idx     on public.profiles(role);

-- ─────────────────────────────────────────────────────────────────────────────
--  updated_at trigger helper
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
--  Auto-provision a profile whenever a user signs up
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
--  Role helper — used by RLS policies throughout.
--  SECURITY DEFINER so policies can read profiles without recursive RLS.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = (select auth.uid())),
    'learner'::public.app_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role() in ('trainer','nodal_officer','admin');
$$;

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organization_id from public.profiles p where p.id = (select auth.uid());
$$;


-- ######################################################################
-- ##  SOURCE: migrations/20260911100100_frac_competency.sql
-- ######################################################################

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


-- ######################################################################
-- ##  SOURCE: migrations/20260911100200_content.sql
-- ######################################################################

-- =============================================================================
--  SAMIKSHA · 0003 · Learning Content
--  Courses (iGOT-synced), uploaded materials + RAG chunks, curated YouTube.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  COURSES  — mirrored from iGOT Karmayogi via the adapter, or authored here
-- ─────────────────────────────────────────────────────────────────────────────
create table public.courses (
  id                uuid primary key default gen_random_uuid(),
  external_id       text,                       -- iGOT/Sunbird `identifier`
  source            public.content_source not null default 'internal',

  title             text not null,
  description       text,
  provider          text,                       -- 'NSSTA', 'Karmayogi Bharat', …
  thumbnail_url     text,
  content_url       text,                       -- deep-link into iGOT
  language          text not null default 'en',

  duration_minutes  int check (duration_minutes >= 0),
  difficulty        public.proficiency_level not null default 'practitioner',
  rating            real check (rating >= 0 and rating <= 5),
  enrolled_count    int not null default 0,

  -- Raw payload from the source system, kept for lossless round-trip
  raw               jsonb not null default '{}'::jsonb,

  is_active         boolean not null default true,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (source, external_id)
);
create index courses_source_idx on public.courses(source);
create index courses_title_trgm on public.courses using gin (title extensions.gin_trgm_ops);

-- Which competencies a course actually develops, and to what level
create table public.course_competencies (
  course_id       uuid not null references public.courses(id) on delete cascade,
  competency_id   uuid not null references public.competencies(id) on delete cascade,
  targets_level   public.proficiency_level not null default 'practitioner',
  relevance       real not null default 1.0 check (relevance between 0 and 1),
  primary key (course_id, competency_id)
);
create index course_comp_comp_idx on public.course_competencies(competency_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  ENROLMENTS  — local mirror of iGOT progress
-- ─────────────────────────────────────────────────────────────────────────────
create table public.enrollments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  course_id      uuid not null references public.courses(id) on delete cascade,
  status         text not null default 'enrolled'
                 check (status in ('enrolled','in_progress','completed','dropped')),
  progress_pct   real not null default 0 check (progress_pct between 0 and 100),
  started_at     timestamptz default now(),
  completed_at   timestamptz,
  last_synced_at timestamptz,
  unique (user_id, course_id)
);
create index enrollments_user_idx on public.enrollments(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  MATERIALS  — user-uploaded PDFs / DOCX / PPTX / images
--  This is the input side of "generate quizzes from uploaded learning material".
-- ─────────────────────────────────────────────────────────────────────────────
create table public.materials (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,

  title           text not null,
  description     text,
  storage_path    text,                    -- Supabase Storage object path
  mime_type       text,
  file_size_bytes bigint,
  page_count      int,

  status          public.material_status not null default 'uploaded',
  error_message   text,

  -- Extracted plain text. DeepSeek v4 Flash's 1M context means we can often
  -- pass the whole document in one call rather than stitching chunks.
  extracted_text  text,
  word_count      int,

  -- AI-derived metadata
  summary         text,
  key_topics      text[] not null default '{}',
  detected_language text,

  visibility      text not null default 'private'
                  check (visibility in ('private','organization','public')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index materials_owner_idx  on public.materials(owner_id);
create index materials_status_idx on public.materials(status);

create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.tg_set_updated_at();

-- Competencies a material covers (AI-tagged)
create table public.material_competencies (
  material_id   uuid not null references public.materials(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  relevance     real not null default 1.0 check (relevance between 0 and 1),
  primary key (material_id, competency_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
--  MATERIAL CHUNKS  — semantic retrieval (RAG) for grounded Q&A + citations
--  384-dim to match Supabase Edge Runtime's built-in `gte-small` embedder,
--  which is free and runs in-process — no external embedding API needed.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.material_chunks (
  id            uuid primary key default gen_random_uuid(),
  material_id   uuid not null references public.materials(id) on delete cascade,
  chunk_index   int not null,
  content       text not null,
  token_count   int,
  page_from     int,
  page_to       int,
  heading       text,
  embedding     extensions.vector(384),
  created_at    timestamptz not null default now(),
  unique (material_id, chunk_index)
);
create index material_chunks_material_idx on public.material_chunks(material_id);

-- HNSW beats IVFFlat for our size/latency profile and needs no training step
create index material_chunks_embedding_idx
  on public.material_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ─────────────────────────────────────────────────────────────────────────────
--  match_material_chunks()  — cosine KNN used by the tutor for citations
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.match_material_chunks(
  p_material_id   uuid,
  p_query_embedding extensions.vector(384),
  p_match_count   int default 6,
  p_min_similarity real default 0.25
)
returns table (
  id          uuid,
  content     text,
  chunk_index int,
  page_from   int,
  page_to     int,
  heading     text,
  similarity  real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    mc.id,
    mc.content,
    mc.chunk_index,
    mc.page_from,
    mc.page_to,
    mc.heading,
    (1 - (mc.embedding operator(extensions.<=>) p_query_embedding))::real as similarity
  from public.material_chunks mc
  where mc.material_id = p_material_id
    and mc.embedding is not null
    and (1 - (mc.embedding operator(extensions.<=>) p_query_embedding)) >= p_min_similarity
  order by mc.embedding operator(extensions.<=>) p_query_embedding
  limit p_match_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  VIDEOS  — AI-curated YouTube tutoring content
--  We store only metadata + IDs and play via the official YouTube IFrame
--  player. We never download or re-host streams (YouTube ToS).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.videos (
  id                uuid primary key default gen_random_uuid(),
  youtube_id        text not null unique,
  title             text not null,
  channel_title     text,
  channel_id        text,
  description       text,
  thumbnail_url     text,
  duration_seconds  int,
  published_at      timestamptz,
  view_count        bigint,
  language          text default 'en',

  -- AI quality gate: is this actually good pedagogy for this topic?
  quality_score     real check (quality_score between 0 and 1),
  quality_rationale text,
  is_vetted         boolean not null default false,

  -- AI-generated chapter markers → learners jump to the exact concept
  chapters          jsonb not null default '[]'::jsonb,

  search_query      text,
  created_at        timestamptz not null default now()
);
create index videos_quality_idx on public.videos(quality_score desc);

create table public.video_competencies (
  video_id      uuid not null references public.videos(id) on delete cascade,
  competency_id uuid not null references public.competencies(id) on delete cascade,
  relevance     real not null default 1.0 check (relevance between 0 and 1),
  primary key (video_id, competency_id)
);
create index video_comp_comp_idx on public.video_competencies(competency_id);

-- Watch progress — feeds the analytics engine
create table public.video_progress (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  video_id          uuid not null references public.videos(id) on delete cascade,
  seconds_watched   int not null default 0,
  last_position_sec int not null default 0,
  completed         boolean not null default false,
  updated_at        timestamptz not null default now(),
  unique (user_id, video_id)
);
create index video_progress_user_idx on public.video_progress(user_id);

create trigger video_progress_set_updated_at
  before update on public.video_progress
  for each row execute function public.tg_set_updated_at();


-- ######################################################################
-- ##  SOURCE: migrations/20260911100300_assessment_quiz.sql
-- ######################################################################

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


-- ######################################################################
-- ##  SOURCE: migrations/20260911100400_learning_engine.sql
-- ######################################################################

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


-- ######################################################################
-- ##  SOURCE: migrations/20260911100500_analytics_ai.sql
-- ######################################################################

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


-- ######################################################################
-- ##  SOURCE: migrations/20260911100600_rls.sql
-- ######################################################################

-- =============================================================================
--  SAMIKSHA · 0007 · Row Level Security
--
--  The Android app ships with the anon/publishable key, which is PUBLIC by
--  definition. RLS — not the client — is the real access boundary. Every
--  table below is deny-by-default; each policy is an explicit grant.
--
--  Note: auth.uid() is wrapped in (select …) throughout so Postgres evaluates
--  it once per statement (initplan) instead of once per row.
-- =============================================================================

-- ── Enable RLS everywhere ────────────────────────────────────────────────────
alter table public.organizations          enable row level security;
alter table public.profiles               enable row level security;
alter table public.competencies           enable row level security;
alter table public.job_roles              enable row level security;
alter table public.activities             enable row level security;
alter table public.role_competencies      enable row level security;
alter table public.user_competency_scores enable row level security;
alter table public.competency_gaps        enable row level security;
alter table public.courses                enable row level security;
alter table public.course_competencies    enable row level security;
alter table public.enrollments            enable row level security;
alter table public.materials              enable row level security;
alter table public.material_competencies  enable row level security;
alter table public.material_chunks        enable row level security;
alter table public.videos                 enable row level security;
alter table public.video_competencies     enable row level security;
alter table public.video_progress         enable row level security;
alter table public.quizzes                enable row level security;
alter table public.questions              enable row level security;
alter table public.quiz_attempts          enable row level security;
alter table public.question_responses     enable row level security;
alter table public.decks                  enable row level security;
alter table public.flashcards             enable row level security;
alter table public.review_logs            enable row level security;
alter table public.study_sessions         enable row level security;
alter table public.learning_paths         enable row level security;
alter table public.path_items             enable row level security;
alter table public.activity_events        enable row level security;
alter table public.daily_stats            enable row level security;
alter table public.achievements           enable row level security;
alter table public.user_achievements      enable row level security;
alter table public.ai_generations         enable row level security;
alter table public.tutor_conversations    enable row level security;
alter table public.tutor_messages         enable row level security;
alter table public.notifications          enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
--  Helper: can the caller see this material?
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_read_material(p_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materials m
    left join public.profiles me on me.id = (select auth.uid())
    where m.id = p_material_id
      and (
            m.owner_id = (select auth.uid())
        or  m.visibility = 'public'
        or (m.visibility = 'organization'
            and me.organization_id is not null
            and me.organization_id = (
              select p2.organization_id from public.profiles p2 where p2.id = m.owner_id
            ))
      )
  );
$$;

create or replace function public.can_read_quiz(p_quiz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quizzes q
    left join public.profiles me on me.id = (select auth.uid())
    where q.id = p_quiz_id
      and (
            q.owner_id = (select auth.uid())
        or  q.visibility = 'public'
        or (q.visibility = 'organization'
            and me.organization_id is not null
            and me.organization_id = (
              select p2.organization_id from public.profiles p2 where p2.id = q.owner_id
            ))
      )
  );
$$;

-- Is the target user inside the caller's organisation? (for nodal dashboards)
create or replace function public.same_org_as(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles a, public.profiles b
    where a.id = (select auth.uid())
      and b.id = p_user_id
      and a.organization_id is not null
      and a.organization_id = b.organization_id
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  REFERENCE DATA — readable by every signed-in user, written by staff
-- ─────────────────────────────────────────────────────────────────────────────
create policy "org readable by authenticated" on public.organizations
  for select to authenticated using (true);
create policy "org writable by admin" on public.organizations
  for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy "competencies readable" on public.competencies
  for select to authenticated using (true);
create policy "competencies writable by staff" on public.competencies
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "job_roles readable" on public.job_roles
  for select to authenticated using (true);
create policy "job_roles writable by staff" on public.job_roles
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "activities readable" on public.activities
  for select to authenticated using (true);
create policy "activities writable by staff" on public.activities
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "role_competencies readable" on public.role_competencies
  for select to authenticated using (true);
create policy "role_competencies writable by staff" on public.role_competencies
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "achievements readable" on public.achievements
  for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
--  PROFILES
-- ─────────────────────────────────────────────────────────────────────────────
create policy "profile self read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profile staff read same org" on public.profiles
  for select to authenticated
  using (public.is_staff() and public.same_org_as(id));
create policy "profile admin read all" on public.profiles
  for select to authenticated using (public.current_app_role() = 'admin');
create policy "profile self update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy "profile self insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
--  COMPETENCY STATE — own rows; nodal officers see their org for dashboards
-- ─────────────────────────────────────────────────────────────────────────────
create policy "ucs self all" on public.user_competency_scores
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "ucs staff read org" on public.user_competency_scores
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

create policy "gaps self all" on public.competency_gaps
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "gaps staff read org" on public.competency_gaps
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

-- ─────────────────────────────────────────────────────────────────────────────
--  COURSES / VIDEOS — catalogue readable to all; curated by staff+service role
-- ─────────────────────────────────────────────────────────────────────────────
create policy "courses readable" on public.courses
  for select to authenticated using (true);
create policy "courses writable by staff" on public.courses
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "course_comp readable" on public.course_competencies
  for select to authenticated using (true);
create policy "course_comp writable by staff" on public.course_competencies
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "videos readable" on public.videos
  for select to authenticated using (true);
create policy "videos writable by staff" on public.videos
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "video_comp readable" on public.video_competencies
  for select to authenticated using (true);
create policy "video_comp writable by staff" on public.video_competencies
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────────────────────────────────────────────────────────────────────────
--  PER-USER OWNED DATA — the bulk of the app
-- ─────────────────────────────────────────────────────────────────────────────
create policy "enrollments self" on public.enrollments
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "video_progress self" on public.video_progress
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "materials owner all" on public.materials
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "materials shared read" on public.materials
  for select to authenticated using (public.can_read_material(id));

create policy "material_comp read" on public.material_competencies
  for select to authenticated using (public.can_read_material(material_id));
create policy "material_comp owner write" on public.material_competencies
  for all to authenticated
  using (exists (select 1 from public.materials m
                 where m.id = material_id and m.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.materials m
                 where m.id = material_id and m.owner_id = (select auth.uid())));

create policy "chunks read" on public.material_chunks
  for select to authenticated using (public.can_read_material(material_id));
create policy "chunks owner write" on public.material_chunks
  for all to authenticated
  using (exists (select 1 from public.materials m
                 where m.id = material_id and m.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.materials m
                 where m.id = material_id and m.owner_id = (select auth.uid())));

create policy "quizzes owner all" on public.quizzes
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "quizzes shared read" on public.quizzes
  for select to authenticated using (public.can_read_quiz(id));

create policy "questions read" on public.questions
  for select to authenticated using (public.can_read_quiz(quiz_id));
create policy "questions owner write" on public.questions
  for all to authenticated
  using (exists (select 1 from public.quizzes q
                 where q.id = quiz_id and q.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.quizzes q
                 where q.id = quiz_id and q.owner_id = (select auth.uid())));

create policy "attempts self" on public.quiz_attempts
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "responses self" on public.question_responses
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "decks self" on public.decks
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "flashcards self" on public.flashcards
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "review_logs self" on public.review_logs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "study_sessions self" on public.study_sessions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "paths self" on public.learning_paths
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "path_items via path" on public.path_items
  for all to authenticated
  using (exists (select 1 from public.learning_paths lp
                 where lp.id = path_id and lp.user_id = (select auth.uid())))
  with check (exists (select 1 from public.learning_paths lp
                 where lp.id = path_id and lp.user_id = (select auth.uid())));

create policy "events self" on public.activity_events
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "events staff read org" on public.activity_events
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

create policy "daily_stats self" on public.daily_stats
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "daily_stats staff read org" on public.daily_stats
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

create policy "user_achievements self" on public.user_achievements
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- AI logs: readable by the user they belong to; written server-side only
-- (Edge Functions use the service_role key, which bypasses RLS entirely).
create policy "ai_gen self read" on public.ai_generations
  for select to authenticated using (user_id = (select auth.uid()));

create policy "tutor_conv self" on public.tutor_conversations
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "tutor_msg self" on public.tutor_messages
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "notifications self" on public.notifications
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));


-- ######################################################################
-- ##  SOURCE: migrations/20260911100700_seed_frac.sql
-- ######################################################################

-- =============================================================================
--  SAMIKSHA · 0008 · FRAC Seed — India's Official Statistical System
--
--  Competency taxonomy grounded in:
--    · Mission Karmayogi FRAC (behavioural / functional / domain split)
--    · MoSPI Capacity Development scheme & NSSTA training curricula
--    · Statistical Quality Assurance Framework (SQAF)
--    · National Metadata Structure (NMDS 2.0)
--    · UN Generic Statistician Competency Framework
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  ORGANIZATIONS
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.organizations (name, short_name, org_type, state_code) values
  ('Ministry of Statistics and Programme Implementation', 'MoSPI', 'ministry', null),
  ('National Statistical Office',                          'NSO',   'department', null),
  ('National Statistical Systems Training Academy',         'NSSTA', 'training_institute', null),
  ('Directorate of Economics and Statistics, Maharashtra',  'DES-MH','state_directorate', 'MH'),
  ('Directorate of Economics and Statistics, Tamil Nadu',   'DES-TN','state_directorate', 'TN'),
  ('Directorate of Economics and Statistics, West Bengal',  'DES-WB','state_directorate', 'WB')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  COMPETENCIES
--  level_descriptors make each rung observable rather than vague — this is
--  what lets the AI assess against a rubric instead of a vibe.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.competencies (code, name, comp_type, category, description, level_descriptors, sort_order) values

-- ── BEHAVIOURAL ─────────────────────────────────────────────────────────────
('BEH-COM-01','Communication','behavioural','Personal Effectiveness',
 'Conveys statistical findings clearly to technical and non-technical audiences, in writing and speech.',
 '{"beginner":"Writes clear factual notes and emails.","practitioner":"Explains survey results to non-specialists without distortion.","proficient":"Drafts press notes and briefs senior officers on complex releases.","expert":"Represents the department publicly and handles contested statistical questions."}'::jsonb, 10),

('BEH-COL-01','Collaboration and Teamwork','behavioural','Personal Effectiveness',
 'Works effectively across divisions, states and partner agencies to deliver statistical outputs.',
 '{"beginner":"Contributes reliably to a team task.","practitioner":"Coordinates with field staff and other divisions.","proficient":"Leads cross-divisional data initiatives.","expert":"Builds inter-ministerial and centre-state statistical partnerships."}'::jsonb, 20),

('BEH-DEC-01','Decision Making','behavioural','Leadership',
 'Makes sound, evidence-based decisions under uncertainty and time pressure.',
 '{"beginner":"Follows defined decision rules.","practitioner":"Weighs trade-offs in survey operations.","proficient":"Decides on methodology changes with documented justification.","expert":"Sets departmental policy on contested methodological questions."}'::jsonb, 30),

('BEH-INT-01','Integrity and Statistical Ethics','behavioural','Ethos',
 'Upholds professional independence, impartiality and confidentiality in official statistics.',
 '{"beginner":"Knows the confidentiality obligations under the Collection of Statistics Act.","practitioner":"Applies disclosure rules correctly in routine work.","proficient":"Identifies and resists pressure that would compromise impartiality.","expert":"Sets and enforces the ethical framework for the organisation."}'::jsonb, 40),

('BEH-RES-01','Result Orientation','behavioural','Personal Effectiveness',
 'Delivers statistical outputs on schedule and to required quality.',
 '{"beginner":"Completes assigned tasks on time.","practitioner":"Manages own workload against release calendars.","proficient":"Owns delivery of a recurring statistical product.","expert":"Drives timeliness reform across multiple products."}'::jsonb, 50),

('BEH-PPL-01','People Management','behavioural','Leadership',
 'Builds, motivates and develops statistical teams including field staff.',
 '{"beginner":"Supports colleagues on shared tasks.","practitioner":"Supervises a small field or processing team.","proficient":"Manages performance and development of a unit.","expert":"Shapes cadre-wide capability strategy."}'::jsonb, 60),

-- ── FUNCTIONAL ──────────────────────────────────────────────────────────────
('FUN-SAMP-01','Sampling Design and Estimation','functional','Statistical Methods',
 'Designs probability samples and constructs valid estimators with measures of precision.',
 '{"beginner":"Explains SRS and the idea of a sampling frame.","practitioner":"Implements stratified and multi-stage designs; computes design weights.","proficient":"Designs complex rotational panels; derives variance estimators for multi-stage designs.","expert":"Advises on national sample design and reviews methodology for major surveys."}'::jsonb, 100),

('FUN-QUES-01','Questionnaire and Instrument Design','functional','Statistical Methods',
 'Designs schedules and CAPI instruments that minimise measurement and response error.',
 '{"beginner":"Understands question wording pitfalls.","practitioner":"Drafts and pre-tests schedules with skip logic.","proficient":"Designs CAPI instruments with embedded validations.","expert":"Sets instrument design standards across surveys."}'::jsonb, 110),

('FUN-COLL-01','Data Collection and Field Operations','functional','Operations',
 'Plans and supervises field enumeration, including training, logistics and non-response follow-up.',
 '{"beginner":"Conducts enumeration per the manual.","practitioner":"Supervises enumerators and resolves field issues.","proficient":"Plans district-level field operations and manages non-response.","expert":"Designs national field operations and quality control protocols."}'::jsonb, 120),

('FUN-CLEAN-01','Data Cleaning, Editing and Imputation','functional','Data Processing',
 'Detects and treats errors, outliers and missing values using defensible, documented methods.',
 '{"beginner":"Runs prescribed validation checks.","practitioner":"Designs edit rules and applies standard imputation.","proficient":"Selects and evaluates imputation strategies; quantifies their impact.","expert":"Defines organisation-wide editing and imputation policy."}'::jsonb, 130),

('FUN-ANAL-01','Statistical Analysis and Inference','functional','Statistical Methods',
 'Applies inferential and modelling techniques correctly, respecting the survey design.',
 '{"beginner":"Computes descriptive statistics correctly.","practitioner":"Runs design-based estimation and hypothesis tests.","proficient":"Builds regression and time-series models with correct standard errors.","expert":"Develops new analytical methodology for official statistics."}'::jsonb, 140),

('FUN-VIZ-01','Data Visualisation and Statistical Storytelling','functional','Communication',
 'Presents statistical results in visual forms that are accurate, accessible and not misleading.',
 '{"beginner":"Produces correct basic charts.","practitioner":"Chooses appropriate chart types and annotates uncertainty.","proficient":"Builds dashboards and designs release graphics.","expert":"Sets visual standards for national data products."}'::jsonb, 150),

('FUN-QUAL-01','Statistical Quality Assurance (SQAF)','functional','Data Governance',
 'Applies the Statistical Quality Assurance Framework across the statistical production cycle.',
 '{"beginner":"Knows the SQAF quality dimensions.","practitioner":"Applies SQAF checks to a product.","proficient":"Conducts quality assessments and drives remediation.","expert":"Leads national quality assessment and certification."}'::jsonb, 160),

('FUN-META-01','Metadata and Statistical Standards (NMDS 2.0)','functional','Data Governance',
 'Documents data using the National Metadata Structure and standard classifications (NIC, NCO, COICOP).',
 '{"beginner":"Records basic metadata fields.","practitioner":"Applies NMDS 2.0 and standard classifications correctly.","proficient":"Designs metadata workflows and harmonises across products.","expert":"Contributes to national and international standard-setting."}'::jsonb, 170),

('FUN-DISS-01','Data Dissemination and Access','functional','Data Governance',
 'Publishes statistics through catalogues and APIs so they are findable and usable.',
 '{"beginner":"Publishes tables per template.","practitioner":"Manages release calendars and catalogue entries.","proficient":"Designs microdata access and API-based dissemination.","expert":"Sets national open-data and dissemination policy."}'::jsonb, 180),

('FUN-TOOL-01','Statistical Computing','functional','Digital Skills',
 'Uses R, Python, SPSS or STATA for reproducible statistical production.',
 '{"beginner":"Runs existing scripts.","practitioner":"Writes scripts for tabulation and estimation.","proficient":"Builds reproducible, version-controlled pipelines.","expert":"Architects the organisation''s analytical computing stack."}'::jsonb, 190),

('FUN-BIGD-01','Big Data and Alternative Data Sources','functional','Emerging Methods',
 'Evaluates administrative, scanner, satellite and web data for official statistics.',
 '{"beginner":"Aware of alternative data source types.","practitioner":"Links administrative data to survey frames.","proficient":"Assesses fitness-for-use and integrates alternative sources.","expert":"Leads modernisation using non-traditional data."}'::jsonb, 200),

('FUN-CONF-01','Confidentiality and Disclosure Control','functional','Data Governance',
 'Protects respondent identity through statistical disclosure control.',
 '{"beginner":"Knows legal confidentiality duties.","practitioner":"Applies suppression and aggregation rules.","proficient":"Implements SDC methods for microdata release.","expert":"Defines national disclosure control policy."}'::jsonb, 210),

-- ── DOMAIN ──────────────────────────────────────────────────────────────────
('DOM-NAS-01','National Accounts Statistics','domain','Macro Statistics',
 'Compiles GDP, GVA and related aggregates per the SNA framework.',
 '{"beginner":"Understands GDP vs GVA.","practitioner":"Compiles sectoral estimates from source data.","proficient":"Handles base-year revision and deflation.","expert":"Leads national accounts methodology."}'::jsonb, 300),

('DOM-PRICE-01','Price Statistics (CPI and WPI)','domain','Macro Statistics',
 'Constructs and maintains consumer and wholesale price indices.',
 '{"beginner":"Understands index number basics.","practitioner":"Compiles CPI from collected price data.","proficient":"Manages weight revision and item substitution.","expert":"Leads price index methodology reform."}'::jsonb, 310),

('DOM-IND-01','Industrial Statistics (ASI and IIP)','domain','Sectoral Statistics',
 'Conducts the Annual Survey of Industries and compiles the Index of Industrial Production.',
 '{"beginner":"Knows ASI scope and coverage.","practitioner":"Processes ASI returns and compiles IIP.","proficient":"Manages frame maintenance and base revision.","expert":"Leads industrial statistics methodology."}'::jsonb, 320),

('DOM-AGRI-01','Agricultural Statistics','domain','Sectoral Statistics',
 'Produces crop area, yield and production estimates including crop-cutting experiments.',
 '{"beginner":"Understands area-yield-production identity.","practitioner":"Supervises crop-cutting experiments.","proficient":"Designs state-level agricultural estimation.","expert":"Leads national agricultural statistics reform."}'::jsonb, 330),

('DOM-SOC-01','Social and Demographic Statistics','domain','Social Statistics',
 'Produces employment, consumption, health and education statistics (PLFS, HCES).',
 '{"beginner":"Knows PLFS and HCES scope.","practitioner":"Computes standard labour and consumption indicators.","proficient":"Analyses distributional and poverty measures.","expert":"Leads social statistics methodology."}'::jsonb, 340),

('DOM-NSS-01','NSS Survey Methodology','domain','Survey Systems',
 'Applies National Sample Survey design, schedules and estimation procedures.',
 '{"beginner":"Knows NSS round structure.","practitioner":"Applies NSS schedules and multipliers.","proficient":"Designs NSS sub-samples and validates estimates.","expert":"Shapes NSS round design."}'::jsonb, 350),

('DOM-SDG-01','SDG Indicator Framework','domain','Monitoring',
 'Maps, compiles and reports National Indicator Framework indicators for the SDGs.',
 '{"beginner":"Knows the NIF structure.","practitioner":"Compiles assigned SDG indicators.","proficient":"Resolves data gaps and metadata for SDG reporting.","expert":"Leads national SDG statistical reporting."}'::jsonb, 360),

('DOM-ENV-01','Environment and Climate Statistics','domain','Emerging Domains',
 'Compiles environment accounts and climate-related statistics (FDES / SEEA).',
 '{"beginner":"Aware of FDES structure.","practitioner":"Compiles basic environment statistics.","proficient":"Builds SEEA-aligned accounts.","expert":"Leads environmental-economic accounting."}'::jsonb, 370)

on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  JOB ROLES
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.job_roles (code, name, grade_level, description) values
  ('FI',  'Field Investigator',                    'Group C',
   'Conducts household and establishment enumeration for national surveys.'),
  ('JSO', 'Junior Statistical Officer',            'Group B',
   'Compiles and validates statistical returns; supervises field enumeration.'),
  ('SSO', 'Senior Statistical Officer',            'Group B',
   'Leads tabulation, estimation and quality checks for statistical products.'),
  ('ASD', 'Assistant Director (Statistics)',       'Group A',
   'Manages a statistical product end to end including methodology decisions.'),
  ('DD',  'Deputy Director (NSO)',                 'Group A',
   'Oversees survey design, estimation and release for a statistical division.'),
  ('DIR', 'Director (Statistics)',                 'Group A',
   'Sets divisional statistical policy, quality standards and dissemination strategy.')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  ROLE ⇄ COMPETENCY REQUIREMENTS
--  The proficiency bar rises with seniority — this is what gap analysis
--  measures every learner against.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  m record;
begin
  for m in
    select * from (values
      -- role, competency, required_level, weight, critical
      ('FI','BEH-COM-01','beginner',1.0,false),
      ('FI','BEH-INT-01','practitioner',2.0,true),
      ('FI','FUN-COLL-01','practitioner',2.5,true),
      ('FI','FUN-QUES-01','beginner',1.0,false),
      ('FI','FUN-CONF-01','beginner',1.5,true),
      ('FI','DOM-NSS-01','beginner',1.5,false),

      ('JSO','BEH-COM-01','practitioner',1.5,false),
      ('JSO','BEH-RES-01','practitioner',1.0,false),
      ('JSO','BEH-INT-01','practitioner',2.0,true),
      ('JSO','FUN-SAMP-01','beginner',2.0,true),
      ('JSO','FUN-COLL-01','proficient',2.0,true),
      ('JSO','FUN-CLEAN-01','practitioner',2.0,true),
      ('JSO','FUN-TOOL-01','beginner',1.5,false),
      ('JSO','FUN-META-01','beginner',1.5,false),
      ('JSO','FUN-CONF-01','practitioner',1.5,true),
      ('JSO','DOM-NSS-01','practitioner',2.0,false),

      ('SSO','BEH-COM-01','proficient',1.5,false),
      ('SSO','BEH-DEC-01','practitioner',1.5,false),
      ('SSO','BEH-INT-01','proficient',2.0,true),
      ('SSO','FUN-SAMP-01','practitioner',2.5,true),
      ('SSO','FUN-CLEAN-01','proficient',2.0,true),
      ('SSO','FUN-ANAL-01','practitioner',2.5,true),
      ('SSO','FUN-QUAL-01','practitioner',2.0,true),
      ('SSO','FUN-TOOL-01','practitioner',2.0,false),
      ('SSO','FUN-VIZ-01','practitioner',1.5,false),
      ('SSO','FUN-META-01','practitioner',1.5,false),
      ('SSO','DOM-NSS-01','proficient',2.0,false),

      ('ASD','BEH-COM-01','proficient',2.0,false),
      ('ASD','BEH-DEC-01','proficient',2.0,true),
      ('ASD','BEH-PPL-01','practitioner',1.5,false),
      ('ASD','BEH-INT-01','proficient',2.0,true),
      ('ASD','FUN-SAMP-01','proficient',2.5,true),
      ('ASD','FUN-ANAL-01','proficient',2.5,true),
      ('ASD','FUN-QUAL-01','proficient',2.5,true),
      ('ASD','FUN-META-01','proficient',2.0,true),
      ('ASD','FUN-DISS-01','practitioner',1.5,false),
      ('ASD','FUN-TOOL-01','proficient',2.0,false),
      ('ASD','FUN-BIGD-01','practitioner',1.5,false),
      ('ASD','DOM-SOC-01','proficient',2.0,false),

      ('DD','BEH-DEC-01','expert',2.5,true),
      ('DD','BEH-PPL-01','proficient',2.0,true),
      ('DD','BEH-COL-01','proficient',1.5,false),
      ('DD','BEH-INT-01','expert',2.5,true),
      ('DD','FUN-SAMP-01','expert',3.0,true),
      ('DD','FUN-ANAL-01','proficient',2.5,true),
      ('DD','FUN-QUAL-01','expert',2.5,true),
      ('DD','FUN-CONF-01','proficient',2.0,true),
      ('DD','FUN-BIGD-01','proficient',2.0,false),
      ('DD','DOM-NAS-01','proficient',2.0,false),
      ('DD','DOM-SDG-01','practitioner',1.5,false),

      ('DIR','BEH-DEC-01','expert',3.0,true),
      ('DIR','BEH-PPL-01','expert',2.5,true),
      ('DIR','BEH-COL-01','expert',2.0,true),
      ('DIR','BEH-INT-01','expert',3.0,true),
      ('DIR','FUN-QUAL-01','expert',3.0,true),
      ('DIR','FUN-DISS-01','expert',2.5,true),
      ('DIR','FUN-META-01','expert',2.0,true),
      ('DIR','FUN-BIGD-01','proficient',2.0,false),
      ('DIR','DOM-NAS-01','expert',2.5,false),
      ('DIR','DOM-SDG-01','proficient',2.0,false)
    ) as t(role_code, comp_code, req_level, wt, crit)
  loop
    insert into public.role_competencies (job_role_id, competency_id, required_level, weight, is_critical)
    select jr.id, c.id, m.req_level::public.proficiency_level, m.wt, m.crit
    from public.job_roles jr, public.competencies c
    where jr.code = m.role_code and c.code = m.comp_code
    on conflict (job_role_id, competency_id) do nothing;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  ACHIEVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.achievements (id, title, description, icon, tier, xp_reward) values
  ('first_steps',    'First Steps',        'Completed your very first study session.',            'footsteps',    'bronze',   50),
  ('streak_3',       'Building Momentum',  'Met your daily goal 3 days in a row.',                'flame',        'bronze',  100),
  ('streak_7',       'Week Warrior',       'Met your daily goal 7 days in a row.',                'flame',        'silver',  250),
  ('streak_30',      'Unstoppable',        'Met your daily goal 30 days in a row.',               'flame',        'gold',   1000),
  ('cards_100',      'Century of Recall',  'Reviewed 100 flashcards.',                            'layers',       'bronze',  150),
  ('cards_1000',     'Memory Architect',   'Reviewed 1,000 flashcards.',                          'layers',       'gold',   1200),
  ('quiz_perfect',   'Flawless',           'Scored 100% on a quiz of 10 or more questions.',      'checkmark',    'silver',  300),
  ('well_calibrated','Know What You Know', 'Finished a quiz with calibration error under 0.15.',  'compass',      'gold',    500),
  ('gap_closed',     'Gap Closer',         'Raised a competency to its required proficiency.',    'trending-up',  'gold',    750),
  ('first_upload',   'Bring Your Own',     'Generated a quiz from your own uploaded material.',   'cloud-upload', 'bronze',  100),
  ('path_complete',  'Path Finisher',      'Completed an entire personalised learning path.',     'trophy',       'platinum',2000),
  ('polyglot',       'In Your Language',   'Studied in more than one language.',                  'language',     'silver',  200)
on conflict (id) do nothing;


-- ######################################################################
-- ##  SOURCE: migrations/20260911100800_zpd_and_misconceptions.sql
-- ######################################################################

-- =============================================================================
--  SAMIKSHA · 0009 · Prerequisite Graph (ZPD) + Misconception Tracking
--
--  Two additions that make recommendations sharper than "sort gaps by size".
--
--  1. ZONE OF PROXIMAL DEVELOPMENT
--     Vygotsky's observation, operationalised: the most learnable thing is not
--     the biggest gap, it is the biggest gap whose PREREQUISITES are already
--     met. Teaching variance estimation to someone who cannot yet compute a
--     design weight wastes their time and dents their confidence.
--     We model competencies as a DAG and recommend only the reachable frontier.
--
--  2. MISCONCEPTION TRACKING
--     A wrong answer tells you someone failed. WHICH wrong answer tells you
--     what they believe instead. Our MCQ generator already labels every
--     distractor with the specific misconception it represents, so when a
--     learner picks option (a) we know precisely which false model they hold.
--     Persisting that turns a score into a diagnosis, and recurring
--     misconceptions become the thing the tutor targets directly.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  PREREQUISITE GRAPH
-- ─────────────────────────────────────────────────────────────────────────────
create table public.competency_prerequisites (
  competency_id     uuid not null references public.competencies(id) on delete cascade,
  prerequisite_id   uuid not null references public.competencies(id) on delete cascade,
  -- How strictly the prerequisite gates the target:
  --   1.0 = hard gate (cannot meaningfully start without it)
  --   0.5 = helpful but not blocking
  strength          real not null default 1.0 check (strength > 0 and strength <= 1),
  -- Minimum proficiency in the prerequisite before the target is approachable
  min_level         public.proficiency_level not null default 'beginner',
  rationale         text,
  primary key (competency_id, prerequisite_id),
  -- A competency cannot require itself
  constraint no_self_prerequisite check (competency_id <> prerequisite_id)
);
create index comp_prereq_target_idx on public.competency_prerequisites(competency_id);
create index comp_prereq_source_idx on public.competency_prerequisites(prerequisite_id);

comment on table public.competency_prerequisites is
  'Directed acyclic graph of competency dependencies. Drives ZPD-based sequencing.';

alter table public.competency_prerequisites enable row level security;
create policy "prereqs readable" on public.competency_prerequisites
  for select to authenticated using (true);
create policy "prereqs writable by staff" on public.competency_prerequisites
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ─────────────────────────────────────────────────────────────────────────────
--  get_zpd_competencies()
--
--  Returns the learnable frontier: competencies the officer still needs, whose
--  prerequisites they already hold. `readiness` is the fraction of prerequisite
--  weight satisfied — 1.0 means fully unblocked.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_zpd_competencies(
  p_user_id uuid,
  p_limit int default 10
)
returns table (
  competency_id     uuid,
  code              text,
  name              text,
  comp_type         public.competency_type,
  current_score     real,
  required_ordinal  int,
  gap_size          real,
  priority_score    real,
  is_critical       boolean,
  readiness         real,
  blocked_by        text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with gaps as (
    select
      g.competency_id,
      c.code, c.name, c.comp_type,
      coalesce(u.score, 0)::real                      as current_score,
      public.proficiency_ordinal(g.required_level)    as required_ordinal,
      g.gap_size, g.priority_score, g.is_critical
    from public.competency_gaps g
    join public.competencies c on c.id = g.competency_id
    left join public.user_competency_scores u
      on u.competency_id = g.competency_id and u.user_id = p_user_id
    where g.user_id = p_user_id
      and g.gap_size > 0
  ),
  prereq_state as (
    select
      cp.competency_id,
      cp.strength,
      cp.prerequisite_id,
      pc.name as prereq_name,
      -- Is this prerequisite satisfied?
      (coalesce(pu.score, 0) >= public.proficiency_ordinal(cp.min_level)) as satisfied
    from public.competency_prerequisites cp
    join public.competencies pc on pc.id = cp.prerequisite_id
    left join public.user_competency_scores pu
      on pu.competency_id = cp.prerequisite_id and pu.user_id = p_user_id
  ),
  readiness as (
    select
      g.competency_id,
      -- No prerequisites at all ⇒ fully ready
      coalesce(
        sum(ps.strength) filter (where ps.satisfied) / nullif(sum(ps.strength), 0),
        1.0
      )::real as readiness,
      coalesce(
        array_agg(ps.prereq_name) filter (where not ps.satisfied),
        '{}'::text[]
      ) as blocked_by
    from gaps g
    left join prereq_state ps on ps.competency_id = g.competency_id
    group by g.competency_id
  )
  select
    g.competency_id, g.code, g.name, g.comp_type,
    g.current_score, g.required_ordinal, g.gap_size,
    g.priority_score, g.is_critical,
    r.readiness,
    r.blocked_by
  from gaps g
  join readiness r on r.competency_id = g.competency_id
  -- Rank by priority scaled by how reachable it actually is. A critical gap
  -- you cannot yet start is not the right next step.
  order by (g.priority_score * (0.25 + 0.75 * r.readiness)) desc
  limit p_limit;
$$;

comment on function public.get_zpd_competencies is
  'Learnable frontier: needed competencies whose prerequisites are already met, ranked by priority scaled by readiness.';

-- ─────────────────────────────────────────────────────────────────────────────
--  MISCONCEPTION EVENTS
-- ─────────────────────────────────────────────────────────────────────────────
create table public.misconception_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  attempt_id     uuid references public.quiz_attempts(id) on delete cascade,
  competency_id  uuid references public.competencies(id) on delete set null,

  -- Which distractor was chosen, and what false belief it encodes
  option_id      text not null,
  misconception  text not null,

  occurred_at    timestamptz not null default now()
);
create index misconception_user_idx on public.misconception_events(user_id, occurred_at desc);
create index misconception_comp_idx on public.misconception_events(user_id, competency_id);

comment on table public.misconception_events is
  'One row per wrong answer where the chosen distractor has a labelled misconception. Turns a score into a diagnosis.';

alter table public.misconception_events enable row level security;
create policy "misconceptions self" on public.misconception_events
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "misconceptions staff read org" on public.misconception_events
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

-- ─────────────────────────────────────────────────────────────────────────────
--  record_misconceptions(attempt)
--  Reads the attempt's wrong answers and logs the labelled misconception for
--  each chosen distractor.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_misconceptions(p_attempt_id uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_count   int := 0;
begin
  select a.user_id into v_user_id
  from public.quiz_attempts a where a.id = p_attempt_id;

  if v_user_id is null then return 0; end if;

  insert into public.misconception_events (
    user_id, question_id, attempt_id, competency_id, option_id, misconception
  )
  select
    r.user_id,
    r.question_id,
    p_attempt_id,
    q.competency_id,
    sel.option_id,
    q.distractor_rationales ->> sel.option_id
  from public.question_responses r
  join public.questions q on q.id = r.question_id
  cross join lateral unnest(r.selected_option_ids) as sel(option_id)
  where r.attempt_id = p_attempt_id
    and r.is_correct = false
    -- only distractors that actually carry a labelled misconception
    and q.distractor_rationales ? sel.option_id
    and coalesce(q.distractor_rationales ->> sel.option_id, '') <> '';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Hook it into the existing submission RPC.
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

  select count(*) filter (where r2.is_correct), count(*)
    into v_correct, v_total
  from public.question_responses r2
  where r2.attempt_id = p_attempt_id;

  v_score := case when v_total > 0 then v_correct::real / v_total else 0 end;

  select avg(abs(((r3.confidence - 1)::real / 4.0) - (case when r3.is_correct then 1.0 else 0.0 end)))
    into v_cal
  from public.question_responses r3
  where r3.attempt_id = p_attempt_id and r3.confidence is not null;

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

  -- NEW: capture which false models the wrong answers revealed
  perform public.record_misconceptions(p_attempt_id);

  perform public.recompute_competency_gaps(v_user_id);

  return query
    select v_score, v_correct, v_total,
           (v_score >= coalesce(v_threshold, 0.7)), v_cal;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  RECURRING MISCONCEPTIONS
--  A one-off slip is noise. The same false belief three times is the thing
--  worth teaching against.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_recurring_misconceptions
with (security_invoker = true)
as
select
  m.user_id,
  m.competency_id,
  c.code   as competency_code,
  c.name   as competency_name,
  m.misconception,
  count(*)            as occurrences,
  max(m.occurred_at)  as last_seen,
  min(m.occurred_at)  as first_seen
from public.misconception_events m
left join public.competencies c on c.id = m.competency_id
group by m.user_id, m.competency_id, c.code, c.name, m.misconception
having count(*) >= 2
order by count(*) desc, max(m.occurred_at) desc;

comment on view public.v_recurring_misconceptions is
  'Misconceptions a learner has demonstrated more than once — the highest-yield teaching targets.';

-- ─────────────────────────────────────────────────────────────────────────────
--  SEED — prerequisite edges for the statistical competency set
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare m record;
begin
  for m in
    select * from (values
      -- target,          prerequisite,     strength, min_level,      rationale
      ('FUN-ANAL-01','FUN-SAMP-01', 1.0,'practitioner','Design-based inference is meaningless without understanding how the sample was drawn.'),
      ('FUN-ANAL-01','FUN-CLEAN-01',0.6,'beginner',     'Analysis on unedited data propagates errors silently.'),
      ('FUN-SAMP-01','DOM-NSS-01',  0.5,'beginner',     'NSS structures make sampling concepts concrete.'),
      ('FUN-CLEAN-01','FUN-COLL-01',0.7,'beginner',     'Knowing how data was collected is what tells you which values are implausible.'),
      ('FUN-QUAL-01','FUN-CLEAN-01',0.8,'practitioner', 'Quality assessment assumes you can recognise and treat data defects.'),
      ('FUN-QUAL-01','FUN-META-01', 0.6,'beginner',     'Quality reporting is expressed through metadata.'),
      ('FUN-VIZ-01','FUN-ANAL-01',  0.7,'beginner',     'You cannot honestly visualise uncertainty you have not estimated.'),
      ('FUN-DISS-01','FUN-META-01', 0.9,'practitioner', 'Dissemination without standard metadata produces unusable releases.'),
      ('FUN-DISS-01','FUN-CONF-01', 1.0,'practitioner', 'Publishing before you can apply disclosure control risks a statutory breach.'),
      ('FUN-CONF-01','FUN-META-01', 0.4,'beginner',     'Disclosure rules are applied against documented variable definitions.'),
      ('FUN-BIGD-01','FUN-QUAL-01', 0.8,'practitioner', 'Alternative sources are only usable once you can assess fitness-for-use.'),
      ('FUN-BIGD-01','FUN-TOOL-01', 0.7,'practitioner', 'Non-traditional data volumes require programmatic handling.'),
      ('DOM-NAS-01','FUN-ANAL-01',  0.8,'practitioner', 'National accounts compilation rests on estimation technique.'),
      ('DOM-PRICE-01','FUN-SAMP-01',0.7,'practitioner', 'Price collection is a sample design problem before it is an index problem.'),
      ('DOM-IND-01','FUN-COLL-01',  0.6,'practitioner', 'ASI is a field operation before it is a statistical product.'),
      ('DOM-SDG-01','FUN-META-01',  0.9,'practitioner', 'SDG reporting is largely a metadata and mapping exercise.'),
      ('DOM-SOC-01','DOM-NSS-01',   0.8,'practitioner', 'PLFS and HCES are NSS instruments.'),
      ('FUN-TOOL-01','FUN-CLEAN-01',0.4,'beginner',     'Scripting is learned fastest against a real cleaning task.'),
      ('BEH-DEC-01','BEH-COM-01',   0.5,'practitioner', 'Decisions that cannot be explained do not survive scrutiny.'),
      ('BEH-PPL-01','BEH-COM-01',   0.7,'practitioner', 'Managing people is mostly communication under pressure.')
    ) as t(target, prereq, strength, min_level, rationale)
  loop
    insert into public.competency_prerequisites
      (competency_id, prerequisite_id, strength, min_level, rationale)
    select tc.id, pc.id, m.strength, m.min_level::public.proficiency_level, m.rationale
    from public.competencies tc, public.competencies pc
    where tc.code = m.target and pc.code = m.prereq
    on conflict (competency_id, prerequisite_id) do nothing;
  end loop;
end $$;


-- ######################################################################
-- ##  SOURCE: migrations/20260911100900_technical_digital_competencies.sql
-- ######################################################################

-- =============================================================================
--  SAMIKSHA · 0010 · Technical & Digital Governance Competencies
--
--  SIH26101 targets officials whose skill requirements are shifting toward
--  AI/ML, Python/R, GIS, cloud and big-data methods. Modelling only statistical
--  craft and behaviour would miss the half of the problem the Ministry is
--  actually worried about — an officer can be an excellent sampling
--  statistician and still be unable to query the database their data sits in.
--
--  Two families added:
--    TECHNICAL           the tooling the modern statistical workflow runs on
--    DIGITAL_GOVERNANCE  the obligations that come with handling citizen data
--
--  Safe to run against a database created before the enum was widened.
-- =============================================================================

-- Idempotent for databases provisioned from the earlier 3-value enum.
alter type public.competency_type add value if not exists 'technical';
alter type public.competency_type add value if not exists 'digital_governance';

-- Reclassify: this was always a technical skill sitting in the wrong family.
update public.competencies
   set comp_type = 'technical',
       name = 'Reproducible Statistical Computing',
       description = 'Builds auditable, version-controlled analytical pipelines rather than one-off spreadsheets.'
 where code = 'FUN-TOOL-01';

-- ─────────────────────────────────────────────────────────────────────────────
--  TECHNICAL
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.competencies (code, name, comp_type, category, description, level_descriptors, sort_order) values

('TEC-PY-01','Python for Data Analysis','technical','Programming',
 'Uses Python (pandas, numpy, statsmodels) for data preparation, estimation and automation of statistical production.',
 '{"beginner":"Reads and runs an existing script; understands variables and loops.","practitioner":"Writes pandas pipelines to clean and tabulate survey data independently.","proficient":"Builds survey-weighted estimation in Python with correct standard errors; writes reusable modules.","expert":"Architects the division''s Python stack and sets code review standards."}'::jsonb, 400),

('TEC-R-01','R for Statistical Analysis','technical','Programming',
 'Uses R and the survey package for design-based estimation and statistical modelling.',
 '{"beginner":"Runs prepared R scripts and reads output.","practitioner":"Uses dplyr and the survey package for weighted tabulation.","proficient":"Specifies complex survey designs in svydesign() and validates against published multipliers.","expert":"Authors internal R packages for the organisation''s recurring estimation tasks."}'::jsonb, 410),

('TEC-SQL-01','SQL and Database Querying','technical','Data Engineering',
 'Retrieves and joins data from relational stores without depending on someone else to extract it.',
 '{"beginner":"Writes SELECT with WHERE and ORDER BY.","practitioner":"Joins across tables, aggregates with GROUP BY, understands NULL semantics.","proficient":"Writes window functions and CTEs; reasons about query cost on large tables.","expert":"Designs the schema and access patterns for a statistical data warehouse."}'::jsonb, 420),

('TEC-GIS-01','Geospatial Analysis and GIS','technical','Spatial Methods',
 'Uses QGIS/ArcGIS and spatial data for mapping, small-area estimation and frame construction.',
 '{"beginner":"Opens a shapefile and produces a basic choropleth.","practitioner":"Joins statistical tables to boundary files and produces correct district maps.","proficient":"Performs spatial joins and area-weighted apportionment for small-area estimates.","expert":"Leads geospatial integration of the statistical frame."}'::jsonb, 430),

('TEC-ML-01','Machine Learning for Official Statistics','technical','Emerging Methods',
 'Applies and critically evaluates ML where it genuinely improves official statistics — imputation, coding, nowcasting.',
 '{"beginner":"Distinguishes supervised from unsupervised learning; knows overfitting exists.","practitioner":"Trains and validates a classifier for automatic NIC/NCO code assignment.","proficient":"Evaluates model bias and explains why a black-box model may be unacceptable for an official release.","expert":"Sets policy on where ML is and is not admissible in statistical production."}'::jsonb, 440),

('TEC-VIZ-01','Dashboards and Business Intelligence','technical','Dissemination Tech',
 'Builds interactive dashboards (Power BI, Superset, Tableau) over statistical outputs.',
 '{"beginner":"Navigates an existing dashboard and exports a view.","practitioner":"Builds a dashboard from a clean dataset with correct filters.","proficient":"Designs performant data models behind a dashboard and handles disclosure limits.","expert":"Defines the organisation''s BI architecture and governance."}'::jsonb, 450),

('TEC-API-01','APIs and Data Interoperability','technical','Data Engineering',
 'Consumes and publishes data through APIs and standard exchange formats (SDMX, JSON, CSV-W).',
 '{"beginner":"Understands what an API endpoint returns.","practitioner":"Calls a REST API and parses the response into a usable table.","proficient":"Designs an SDMX-compliant dissemination API for a statistical product.","expert":"Sets interoperability standards across the statistical system."}'::jsonb, 460),

('TEC-CLOUD-01','Cloud and Scalable Computing','technical','Infrastructure',
 'Uses government cloud (MeghRaj) and scalable compute for large statistical workloads.',
 '{"beginner":"Knows what cloud storage and compute are.","practitioner":"Runs a processing job on a provisioned cloud VM.","proficient":"Designs a cost-aware pipeline using object storage and managed compute.","expert":"Plans the division''s cloud migration and capacity."}'::jsonb, 470),

('TEC-BIGD-01','Big Data Processing','technical','Data Engineering',
 'Handles datasets that exceed a single machine — scanner data, mobile network data, satellite imagery.',
 '{"beginner":"Recognises when a dataset will not fit in Excel or memory.","practitioner":"Processes large files in chunks; uses columnar formats like Parquet.","proficient":"Builds distributed processing jobs and validates results against a sample.","expert":"Leads the technical design of alternative-data statistical products."}'::jsonb, 480),

-- ─────────────────────────────────────────────────────────────────────────────
--  DIGITAL GOVERNANCE
-- ─────────────────────────────────────────────────────────────────────────────
('DIG-CYBER-01','Cybersecurity Awareness','digital_governance','Security',
 'Recognises and mitigates cyber risk in day-to-day handling of official statistical data.',
 '{"beginner":"Identifies phishing attempts and uses strong unique passwords.","practitioner":"Applies secure file transfer and access-control practice for microdata.","proficient":"Conducts risk assessment for a statistical system and enforces controls.","expert":"Owns the security posture of the division''s data assets."}'::jsonb, 500),

('DIG-PRIV-01','Data Privacy and the DPDP Act','digital_governance','Law & Compliance',
 'Applies the Digital Personal Data Protection Act 2023 and the Collection of Statistics Act to statistical work.',
 '{"beginner":"Knows that respondent data is personal data with legal protection.","practitioner":"Applies purpose limitation and data minimisation to a survey design.","proficient":"Conducts a data protection impact assessment for a new collection.","expert":"Advises the Ministry on privacy-compliant statistical practice."}'::jsonb, 510),

('DIG-ESIGN-01','Digital Signatures and e-Office','digital_governance','Digital Workflow',
 'Uses DSC/eSign and the e-Office system for authenticated official statistical workflows.',
 '{"beginner":"Signs a document using a DSC token.","practitioner":"Routes files through e-Office with correct authentication.","proficient":"Designs an authenticated approval workflow for statistical releases.","expert":"Sets digital authentication policy for the organisation."}'::jsonb, 520),

('DIG-DPI-01','Digital Public Infrastructure','digital_governance','Ecosystem',
 'Understands India Stack (Aadhaar, UPI, DigiLocker, Account Aggregator) as both a data source and a governance model.',
 '{"beginner":"Names the main DPI components.","practitioner":"Explains how DPI transaction data could inform statistics, and its coverage limits.","proficient":"Assesses DPI-derived data for statistical fitness-for-use and consent constraints.","expert":"Shapes how the statistical system draws on DPI responsibly."}'::jsonb, 530),

('DIG-OPEN-01','Open Data and Data Sharing Policy','digital_governance','Policy',
 'Applies NDSAP and government data-sharing policy when releasing statistical assets.',
 '{"beginner":"Knows data.gov.in exists and what NDSAP is for.","practitioner":"Publishes a dataset with correct licence and metadata.","proficient":"Designs a tiered access model spanning open, restricted and safe-room data.","expert":"Sets the organisation''s open-data strategy."}'::jsonb, 540)

on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
--  ROLE REQUIREMENTS for the new families
--  The technical bar rises sharply with seniority — an Assistant Director is
--  now expected to reason about ML admissibility, not just read a tabulation.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare m record;
begin
  for m in
    select * from (values
      -- Field Investigator: digital hygiene, minimal tooling
      ('FI','DIG-CYBER-01','beginner',1.5,true),
      ('FI','DIG-PRIV-01','beginner',2.0,true),
      ('FI','TEC-SQL-01','unskilled',0.5,false),

      -- Junior Statistical Officer
      ('JSO','TEC-SQL-01','beginner',2.0,true),
      ('JSO','TEC-PY-01','beginner',1.5,false),
      ('JSO','TEC-VIZ-01','beginner',1.0,false),
      ('JSO','DIG-CYBER-01','practitioner',1.5,true),
      ('JSO','DIG-PRIV-01','practitioner',2.0,true),
      ('JSO','DIG-ESIGN-01','beginner',1.0,false),

      -- Senior Statistical Officer
      ('SSO','TEC-SQL-01','practitioner',2.0,true),
      ('SSO','TEC-PY-01','practitioner',2.0,true),
      ('SSO','TEC-R-01','beginner',1.5,false),
      ('SSO','TEC-VIZ-01','practitioner',1.5,false),
      ('SSO','TEC-GIS-01','beginner',1.5,false),
      ('SSO','DIG-CYBER-01','practitioner',1.5,true),
      ('SSO','DIG-PRIV-01','practitioner',2.0,true),

      -- Assistant Director
      ('ASD','TEC-PY-01','proficient',2.5,true),
      ('ASD','TEC-SQL-01','proficient',2.0,true),
      ('ASD','TEC-GIS-01','practitioner',2.0,false),
      ('ASD','TEC-ML-01','beginner',1.5,false),
      ('ASD','TEC-API-01','practitioner',1.5,false),
      ('ASD','DIG-PRIV-01','proficient',2.5,true),
      ('ASD','DIG-CYBER-01','proficient',2.0,true),
      ('ASD','DIG-OPEN-01','practitioner',1.5,false),

      -- Deputy Director
      ('DD','TEC-ML-01','practitioner',2.0,false),
      ('DD','TEC-CLOUD-01','beginner',1.5,false),
      ('DD','TEC-BIGD-01','practitioner',2.0,false),
      ('DD','TEC-API-01','proficient',2.0,true),
      ('DD','DIG-PRIV-01','expert',2.5,true),
      ('DD','DIG-DPI-01','practitioner',1.5,false),
      ('DD','DIG-OPEN-01','proficient',2.0,true),

      -- Director
      ('DIR','TEC-ML-01','proficient',2.0,false),
      ('DIR','TEC-CLOUD-01','practitioner',2.0,false),
      ('DIR','DIG-PRIV-01','expert',3.0,true),
      ('DIR','DIG-CYBER-01','expert',2.5,true),
      ('DIR','DIG-DPI-01','proficient',2.0,false),
      ('DIR','DIG-OPEN-01','expert',2.5,true)
    ) as t(role_code, comp_code, req_level, wt, crit)
  loop
    insert into public.role_competencies (job_role_id, competency_id, required_level, weight, is_critical)
    select jr.id, c.id, m.req_level::public.proficiency_level, m.wt, m.crit
    from public.job_roles jr, public.competencies c
    where jr.code = m.role_code and c.code = m.comp_code
    on conflict (job_role_id, competency_id) do nothing;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
--  PREREQUISITES for the new competencies
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare m record;
begin
  for m in
    select * from (values
      ('TEC-PY-01','TEC-SQL-01',      0.4,'beginner',     'Getting data out is the first step; most Python work starts with a query.'),
      ('TEC-ML-01','TEC-PY-01',       1.0,'practitioner', 'ML in practice is written in Python — the tooling is not optional.'),
      ('TEC-ML-01','FUN-ANAL-01',     0.9,'practitioner', 'Without inference, a model is a black box you cannot defend to a reviewer.'),
      ('TEC-BIGD-01','TEC-SQL-01',    0.7,'practitioner', 'Large-scale processing is query thinking at a different scale.'),
      ('TEC-BIGD-01','TEC-CLOUD-01',  0.6,'beginner',     'Data beyond one machine implies managed infrastructure.'),
      ('TEC-VIZ-01','TEC-SQL-01',     0.6,'beginner',     'A dashboard is only as good as the query behind it.'),
      ('TEC-GIS-01','TEC-SQL-01',     0.4,'beginner',     'Spatial joins are joins.'),
      ('TEC-API-01','TEC-SQL-01',     0.3,'beginner',     'Both are about moving structured data between systems.'),
      ('FUN-BIGD-01','TEC-BIGD-01',   0.8,'practitioner', 'Assessing alternative data requires being able to process it first.'),
      ('DIG-PRIV-01','FUN-CONF-01',   0.7,'practitioner', 'Statutory confidentiality is the statistical expression of data protection.'),
      ('DIG-OPEN-01','FUN-DISS-01',   0.8,'practitioner', 'Open data policy governs the dissemination you already do.'),
      ('DIG-OPEN-01','DIG-PRIV-01',   0.9,'practitioner', 'You cannot decide what is safe to open without knowing what is protected.'),
      ('DIG-DPI-01','DIG-PRIV-01',    0.7,'practitioner', 'DPI data is consent-bound; privacy comes first.'),
      ('TEC-CLOUD-01','DIG-CYBER-01', 0.8,'practitioner', 'Moving official data to cloud without security literacy is a breach waiting to happen.')
    ) as t(target, prereq, strength, min_level, rationale)
  loop
    insert into public.competency_prerequisites
      (competency_id, prerequisite_id, strength, min_level, rationale)
    select tc.id, pc.id, m.strength, m.min_level::public.proficiency_level, m.rationale
    from public.competencies tc, public.competencies pc
    where tc.code = m.target and pc.code = m.prereq
    on conflict (competency_id, prerequisite_id) do nothing;
  end loop;
end $$;

