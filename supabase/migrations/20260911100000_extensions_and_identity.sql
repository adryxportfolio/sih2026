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
