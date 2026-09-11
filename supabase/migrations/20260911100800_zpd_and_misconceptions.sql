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
