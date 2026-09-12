-- ─────────────────────────────────────────────────────────────────────────────
-- The competency loop, half two: what the officer delegates, fed back as evidence.
--
-- The workspace lets an officer hand repetitive analytical work to an agent.
-- That is useful on its own, but the more interesting signal is which work they
-- hand over. An officer who delegates every Python task is telling us something
-- their assessment score cannot: not just that they are weak at it, but that the
-- weakness is costing them autonomy on real work, every week.
--
-- A gap measured in a diagnostic is hypothetical until it shows up in the job.
-- These rows are where it shows up, and they are what turns "you scored low on
-- Python" into "you delegated 23 Python tasks this month; closing this gap would
-- give you that work back".
-- ─────────────────────────────────────────────────────────────────────────────

create table public.agent_delegations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  -- Stable key of the agent (e.g. 'samiksha.data-analyst'), plus the name shown
  -- at the time: officers rename their agents, and a renamed agent must not
  -- orphan the history that explains a recommendation.
  agent_key     text not null,
  agent_name    text not null,

  -- What competency the delegated task exercised. Null when the work did not map
  -- onto a measured competency; those rows still count as automation, just not
  -- as evidence about a particular skill.
  competency_id uuid references public.competencies(id) on delete set null,

  task_summary  text,
  -- Wall-clock seconds the agent spent. The productivity half of the story:
  -- time the officer did not spend on work that did not need their judgement.
  duration_sec  int not null default 0,
  succeeded     boolean not null default true,

  occurred_at   timestamptz not null default now()
);

create index agent_deleg_user_time_idx on public.agent_delegations(user_id, occurred_at desc);
create index agent_deleg_comp_idx      on public.agent_delegations(user_id, competency_id);

alter table public.agent_delegations enable row level security;

create policy "delegations self" on public.agent_delegations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "delegations staff read org" on public.agent_delegations
  for select to authenticated
  using (public.is_staff() and public.same_org_as(user_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Where delegation and measured gap point at the same competency.
--
-- Ordered so the strongest case sits first: frequently delegated, and a gap the
-- post actually requires closing. A competency the officer delegates constantly
-- but is already proficient at is not a training need — it is just a task worth
-- automating, and the ordering keeps those two apart.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_officer_dependency
with (security_invoker = true)
as
select
  d.user_id,
  c.id                            as competency_id,
  c.code                          as competency_code,
  c.name                          as competency_name,
  c.comp_type,
  count(*)                        as delegations,
  count(*) filter (where d.occurred_at > now() - interval '30 days') as delegations_30d,
  sum(d.duration_sec)             as seconds_automated,
  max(d.occurred_at)              as last_delegated_at,
  g.gap_size,
  g.is_critical,
  -- Evidence of dependency: repeated delegation of work the officer is not yet
  -- measured able to do alone. No gap means no dependency, however often it is
  -- delegated, so those score zero rather than topping the list.
  case when g.gap_size > 0
       then count(*) filter (where d.occurred_at > now() - interval '30 days') * g.gap_size
       else 0 end                 as dependency_score
from public.agent_delegations d
join public.competencies c on c.id = d.competency_id
left join public.competency_gaps g
       on g.user_id = d.user_id and g.competency_id = d.competency_id
group by d.user_id, c.id, c.code, c.name, c.comp_type, g.gap_size, g.is_critical;

comment on view public.v_officer_dependency is
  'Delegation volume joined to measured gap. Ranks where automating work is masking a competency the officer is expected to hold.';
