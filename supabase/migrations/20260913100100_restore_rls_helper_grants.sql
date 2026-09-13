-- =============================================================================
--  SAMIKSHA · 0015 · Let signed-in users evaluate the RLS helpers again
--
--  0011 revoked EXECUTE on the row-level-security helpers from `authenticated`
--  on the belief that policy evaluation does not consult the caller's EXECUTE
--  privilege. It does: a policy expression runs as the querying role, so every
--  table whose policies call one of these raised
--
--      permission denied for function is_staff
--
--  for every signed-in user — including a learner reading their own profile.
--  Demo mode reads no tables, which is how it went unnoticed.
--
--  These helpers only answer questions about the caller (their role, their
--  organisation, whether they may read a row), so signed-in users may run
--  them. Anonymous callers still may not.
-- =============================================================================

grant execute on function public.is_staff()               to authenticated;
grant execute on function public.current_app_role()       to authenticated;
grant execute on function public.current_org_id()         to authenticated;
grant execute on function public.same_org_as(uuid)        to authenticated;
grant execute on function public.can_read_material(uuid)  to authenticated;
grant execute on function public.can_read_quiz(uuid)      to authenticated;
