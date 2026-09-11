-- =============================================================================
--  SAMIKSHA · 0012 · Presence, Admin Provisioning, Adaptive Assessment
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  1. PRESENCE
--
--  Supabase Realtime has an ephemeral presence channel, but an admin needs to
--  answer "who was active this week", not just "who is connected right now" —
--  and that has to survive a page reload. So presence is a table the client
--  heartbeats into, with Realtime replication on top for live push.
--
--  `status` is derived, never trusted from the client: anything that hasn't
--  heartbeat in 2 minutes is away, 10 minutes is offline. A client that
--  crashes cannot leave itself showing as online forever.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.user_presence (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at     timestamptz not null default now(),
  session_started_at timestamptz not null default now(),

  -- What they are doing right now, for the admin live feed
  current_activity text check (current_activity in
                     ('idle','reviewing','quiz','reading','video','tutor','assessment','browsing')),
  current_entity   text,        -- human-readable: "Sampling Design quiz"
  current_competency_id uuid references public.competencies(id) on delete set null,

  device           text,
  app_version      text,
  updated_at       timestamptz not null default now()
);
create index presence_last_seen_idx on public.user_presence(last_seen_at desc);

comment on table public.user_presence is
  'Heartbeat-backed presence. Status is derived from last_seen_at, never trusted from the client.';

alter table public.user_presence enable row level security;
create policy "presence self write" on public.user_presence
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "presence staff read org" on public.user_presence
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

/** Derived status. Two minutes idle = away, ten = offline. */
create or replace function public.presence_status(p_last_seen timestamptz)
returns text language sql immutable set search_path = ''
as $$
  select case
    when p_last_seen is null then 'offline'
    when p_last_seen > now() - interval '2 minutes'  then 'online'
    when p_last_seen > now() - interval '10 minutes' then 'away'
    else 'offline'
  end;
$$;

/** Client heartbeat. Called every ~45s while the app is foregrounded. */
create or replace function public.heartbeat(
  p_activity text default 'browsing',
  p_entity   text default null,
  p_competency_id uuid default null,
  p_device   text default null
)
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then return; end if;

  insert into public.user_presence as up (
    user_id, last_seen_at, current_activity, current_entity, current_competency_id, device
  ) values (
    v_user, now(), p_activity, p_entity, p_competency_id, p_device
  )
  on conflict (user_id) do update set
    last_seen_at          = now(),
    current_activity      = excluded.current_activity,
    current_entity        = excluded.current_entity,
    current_competency_id = excluded.current_competency_id,
    device                = coalesce(excluded.device, up.device),
    -- A gap of more than 30 minutes counts as a new session.
    session_started_at    = case
                              when up.last_seen_at < now() - interval '30 minutes'
                              then now() else up.session_started_at end,
    updated_at            = now();
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  2. ADMIN-PROVISIONED ACCOUNTS
--
--  Officers do not self-register. An administrator creates the account against
--  a verified employee ID, which is how access control actually works inside a
--  ministry — and it means the competency record is tied to a real post from
--  day one rather than to whoever typed an email address.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists provisioned_by uuid references public.profiles(id) on delete set null,
  add column if not exists provisioned_at timestamptz,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_login_at timestamptz;

-- Employee code is the real identifier inside the department.
create unique index if not exists profiles_employee_code_uniq
  on public.profiles(employee_code) where employee_code is not null;

create policy "profile admin write" on public.profiles
  for all to authenticated
  using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
--  3. ADAPTIVE ASSESSMENT
--
--  A fixed 20-question test spends most of its items telling you what you
--  already knew after question six. Adaptive testing picks each next item to
--  maximise information about where the learner actually sits, so it reaches
--  the same measurement confidence in roughly half the questions.
--
--  We use a 2PL IRT model. Ability (theta) is on the same 0..4 proficiency
--  scale as the rest of the system so the result drops straight into
--  user_competency_scores without a translation step.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.adaptive_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  competency_ids  uuid[] not null default '{}',

  -- Running ability estimate and its uncertainty
  theta           real not null default 2.0,   -- prior: mid-scale
  standard_error  real not null default 1.6,   -- wide prior
  items_administered int not null default 0,

  -- Stop when SE is small enough, or we hit the item ceiling
  target_se       real not null default 0.45,
  max_items       int  not null default 20,
  min_items       int  not null default 6,

  status          text not null default 'active'
                  check (status in ('active','completed','abandoned')),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index adaptive_user_idx on public.adaptive_sessions(user_id, started_at desc);

alter table public.adaptive_sessions enable row level security;
create policy "adaptive self" on public.adaptive_sessions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "adaptive staff read org" on public.adaptive_sessions
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

create table public.adaptive_responses (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.adaptive_sessions(id) on delete cascade,
  question_id   uuid not null references public.questions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  is_correct    boolean not null,
  confidence    int check (confidence between 1 and 5),
  time_taken_ms int,
  theta_before  real,
  theta_after   real,
  se_after      real,
  answered_at   timestamptz not null default now(),
  unique (session_id, question_id)
);
create index adaptive_resp_session_idx on public.adaptive_responses(session_id);

alter table public.adaptive_responses enable row level security;
create policy "adaptive_resp self" on public.adaptive_responses
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

/**
 * Fisher information of a 2PL item at ability theta.
 * Peaks when item difficulty matches ability — which is exactly the item that
 * tells us the most, and why adaptive tests converge so much faster.
 */
create or replace function public.item_information(
  p_difficulty real, p_theta real, p_discrimination real default 1.2
)
returns real language sql immutable set search_path = ''
as $$
  select (
    p_discrimination * p_discrimination
    * (1.0 / (1.0 + exp(-p_discrimination * (p_theta - p_difficulty))))
    * (1.0 - 1.0 / (1.0 + exp(-p_discrimination * (p_theta - p_difficulty))))
  )::real;
$$;

/**
 * Next item: the unanswered question carrying the most information at the
 * learner's current ability estimate, restricted to the competencies under
 * assessment. Ties break randomly so two officers with identical records do
 * not see an identical question order.
 */
create or replace function public.next_adaptive_item(p_session_id uuid)
returns table (
  question_id uuid, stem text, options jsonb, kind public.question_kind,
  difficulty real, bloom public.bloom_level, competency_id uuid, information real
)
language sql stable security invoker set search_path = ''
as $$
  with sess as (
    select s.theta, s.competency_ids, s.user_id
    from public.adaptive_sessions s
    where s.id = p_session_id and s.user_id = (select auth.uid())
  )
  select
    q.id, q.stem, q.options, q.kind, q.difficulty, q.bloom, q.competency_id,
    public.item_information(q.difficulty, (select theta from sess)) as information
  from public.questions q, sess
  where q.is_active
    and q.competency_id is not null
    and (cardinality(sess.competency_ids) = 0 or q.competency_id = any(sess.competency_ids))
    and not exists (
      select 1 from public.adaptive_responses r
      where r.session_id = p_session_id and r.question_id = q.id
    )
  order by information desc, random()
  limit 1;
$$;

/**
 * Update the ability estimate after one response.
 *
 * Newton-Raphson step on the 2PL likelihood, which is the standard EAP/MLE
 * update for adaptive testing. SE shrinks as sqrt(1 / accumulated
 * information), so it falls fastest when items are well matched to ability —
 * the whole point of choosing them that way.
 */
create or replace function public.submit_adaptive_response(
  p_session_id uuid,
  p_question_id uuid,
  p_is_correct boolean,
  p_confidence int default null,
  p_time_ms int default null
)
returns table (theta real, standard_error real, items int, should_stop boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_theta real; v_se real; v_n int; v_target real; v_max int; v_min int;
  v_diff real; v_a real := 1.2;
  v_p real; v_info real; v_total_info real; v_new_theta real; v_new_se real;
  v_comp uuid;
begin
  select s.theta, s.standard_error, s.items_administered, s.target_se, s.max_items, s.min_items
    into v_theta, v_se, v_n, v_target, v_max, v_min
  from public.adaptive_sessions s
  where s.id = p_session_id and s.user_id = v_user;

  if v_theta is null then raise exception 'Adaptive session not found'; end if;

  select q.difficulty, q.competency_id into v_diff, v_comp
  from public.questions q where q.id = p_question_id;

  -- 2PL probability of a correct response at current ability
  v_p := 1.0 / (1.0 + exp(-v_a * (v_theta - v_diff)));
  v_info := v_a * v_a * v_p * (1.0 - v_p);

  -- Accumulated information so far, from the prior plus this item
  v_total_info := (1.0 / (v_se * v_se)) + v_info;

  -- Newton step, clamped to the 0..4 proficiency scale
  v_new_theta := v_theta + (v_a * ((case when p_is_correct then 1.0 else 0.0 end) - v_p)) / v_total_info;
  v_new_theta := greatest(0.0, least(4.0, v_new_theta));
  v_new_se := sqrt(1.0 / v_total_info);

  insert into public.adaptive_responses (
    session_id, question_id, user_id, is_correct, confidence, time_taken_ms,
    theta_before, theta_after, se_after
  ) values (
    p_session_id, p_question_id, v_user, p_is_correct, p_confidence, p_time_ms,
    v_theta, v_new_theta, v_new_se
  )
  on conflict (session_id, question_id) do nothing;

  update public.adaptive_sessions
     set theta = v_new_theta,
         standard_error = v_new_se,
         items_administered = v_n + 1
   where id = p_session_id;

  -- Feed the competency model too, so one assessment updates everything.
  perform public.apply_response_to_competency(v_user, v_comp, v_diff, p_is_correct);

  return query select
    v_new_theta,
    v_new_se,
    v_n + 1,
    ((v_n + 1) >= v_min and (v_new_se <= v_target or (v_n + 1) >= v_max));
end;
$$;

/** Close the session and write the measured ability into the competency profile. */
create or replace function public.complete_adaptive_session(p_session_id uuid)
returns table (theta real, standard_error real, items int)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_theta real; v_se real; v_n int;
begin
  update public.adaptive_sessions
     set status = 'completed', completed_at = now()
   where id = p_session_id and user_id = v_user
  returning adaptive_sessions.theta, adaptive_sessions.standard_error, adaptive_sessions.items_administered
    into v_theta, v_se, v_n;

  if v_theta is null then raise exception 'Adaptive session not found'; end if;

  perform public.recompute_competency_gaps(v_user);
  return query select v_theta, v_se, v_n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  4. ADMIN OVERVIEW
--
--  One row per officer with everything the admin dashboard needs, so the app
--  makes a single query rather than N+1 round trips per learner.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_admin_officer_overview
with (security_invoker = true)
as
select
  p.id                as user_id,
  p.full_name,
  p.email,
  p.employee_code,
  p.designation,
  p.organization_id,
  jr.code             as role_code,
  jr.name             as role_name,
  p.years_of_service,
  p.xp,
  p.streak_current,
  p.last_login_at,
  p.is_active,
  p.onboarded_at,

  public.presence_status(up.last_seen_at) as presence,
  up.last_seen_at,
  up.current_activity,
  up.current_entity,

  -- Competency position
  (select count(*) from public.competency_gaps g
    where g.user_id = p.id)                              as competencies_mapped,
  (select count(*) from public.competency_gaps g
    where g.user_id = p.id and g.gap_size <= 0)          as competencies_met,
  (select count(*) from public.competency_gaps g
    where g.user_id = p.id and g.is_critical and g.gap_size > 0) as critical_gaps,
  (select avg(u.score) from public.user_competency_scores u
    where u.user_id = p.id)                              as avg_score,
  (select avg(u.confidence) from public.user_competency_scores u
    where u.user_id = p.id)                              as avg_confidence,

  -- The single biggest gap — "where this officer is lacking"
  (select c.name from public.competency_gaps g
     join public.competencies c on c.id = g.competency_id
    where g.user_id = p.id and g.gap_size > 0
    order by g.priority_score desc limit 1)              as top_gap_name,
  (select c.code from public.competency_gaps g
     join public.competencies c on c.id = g.competency_id
    where g.user_id = p.id and g.gap_size > 0
    order by g.priority_score desc limit 1)              as top_gap_code,

  -- The next step already prescribed — "what they should do next"
  (select pi.title from public.path_items pi
     join public.learning_paths lp on lp.id = pi.path_id
    where lp.user_id = p.id and lp.status = 'active' and pi.status <> 'completed'
    order by pi.sort_order limit 1)                      as next_step,

  -- Engagement
  (select coalesce(sum(d.minutes_studied), 0) from public.daily_stats d
    where d.user_id = p.id and d.stat_date > current_date - 7)  as minutes_last_7d,
  (select count(*) from public.quiz_attempts a
    where a.user_id = p.id and a.submitted_at is not null)      as quizzes_completed,
  (select count(*) from public.flashcards f
    where f.user_id = p.id and f.due <= now() and not f.suspended) as cards_due

from public.profiles p
left join public.job_roles jr    on jr.id = p.job_role_id
left join public.user_presence up on up.user_id = p.id
where p.role = 'learner';

comment on view public.v_admin_officer_overview is
  'One row per officer: presence, competency position, biggest gap, prescribed next step and engagement. security_invoker means RLS still applies — staff see only their own organisation.';

-- Realtime push for the admin live feed.
alter publication supabase_realtime add table public.user_presence;
alter publication supabase_realtime add table public.activity_events;

grant execute on function public.heartbeat(text,text,uuid,text)                     to authenticated;
grant execute on function public.next_adaptive_item(uuid)                           to authenticated;
grant execute on function public.submit_adaptive_response(uuid,uuid,boolean,int,int) to authenticated;
grant execute on function public.complete_adaptive_session(uuid)                    to authenticated;
grant execute on function public.presence_status(timestamptz)                       to authenticated;
revoke execute on function public.item_information(real,real,real) from public;
grant  execute on function public.item_information(real,real,real) to authenticated;
