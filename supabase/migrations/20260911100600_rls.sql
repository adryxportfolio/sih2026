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
