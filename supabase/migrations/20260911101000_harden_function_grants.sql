-- =============================================================================
--  SAMIKSHA · 0011 · Lock down SECURITY DEFINER function grants
--
--  Postgres grants EXECUTE to PUBLIC on every new function by default, and
--  `anon`/`authenticated` inherit that. PostgREST then exposes each one as a
--  callable RPC endpoint at /rest/v1/rpc/<name>. Two groups should never have
--  been reachable that way:
--
--    TRIGGER FUNCTIONS   invoked by the trigger machinery as the table owner.
--                        A client calling them directly is meaningless at best.
--
--    RLS HELPERS         exist so policies can read across tables without
--                        recursing. Exposed, `same_org_as(<uuid>)` becomes an
--                        oracle for probing organisation membership.
--
--  Revoking from anon/authenticated alone is a no-op — the grant lives on
--  PUBLIC and is inherited. It has to come off PUBLIC.
--
--  Nothing breaks: triggers run as the table owner, and RLS policy evaluation
--  calls these internally without consulting the caller's EXECUTE privilege.
-- =============================================================================

revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.tg_recalc_path_progress()  from public, anon, authenticated;
revoke execute on function public.tg_update_question_stats() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at()        from public, anon, authenticated;
revoke execute on function public.tg_sync_competency_level() from public, anon, authenticated;

revoke execute on function public.can_read_material(uuid)    from public, anon, authenticated;
revoke execute on function public.can_read_quiz(uuid)        from public, anon, authenticated;
revoke execute on function public.same_org_as(uuid)          from public, anon, authenticated;
revoke execute on function public.current_app_role()         from public, anon, authenticated;
revoke execute on function public.current_org_id()           from public, anon, authenticated;
revoke execute on function public.is_staff()                 from public, anon, authenticated;
revoke execute on function public.apply_response_to_competency(uuid,uuid,real,boolean)
  from public, anon, authenticated;

-- ── Learner-facing RPCs: signed-in only ──────────────────────────────────────
revoke execute on function public.submit_quiz_attempt(uuid)       from public, anon;
revoke execute on function public.recompute_competency_gaps(uuid) from public, anon;
revoke execute on function public.get_zpd_competencies(uuid,int)  from public, anon;
revoke execute on function public.get_due_cards(int,uuid)         from public, anon;
revoke execute on function public.record_misconceptions(uuid)     from public, anon;
revoke execute on function public.record_study_progress(int,int,int,int,int,int,int)
  from public, anon;
revoke execute on function public.match_material_chunks(uuid, extensions.vector, int, real)
  from public, anon;

grant execute on function public.submit_quiz_attempt(uuid)       to authenticated;
grant execute on function public.recompute_competency_gaps(uuid) to authenticated;
grant execute on function public.get_zpd_competencies(uuid,int)  to authenticated;
grant execute on function public.get_due_cards(int,uuid)         to authenticated;
grant execute on function public.record_study_progress(int,int,int,int,int,int,int)
  to authenticated;
grant execute on function public.match_material_chunks(uuid, extensions.vector, int, real)
  to authenticated;

-- ── Pure lookup helpers: fine for signed-in users, not for anonymous ─────────
revoke execute on function public.proficiency_ordinal(public.proficiency_level) from public, anon;
revoke execute on function public.ordinal_to_proficiency(int)                   from public, anon;
grant  execute on function public.proficiency_ordinal(public.proficiency_level) to authenticated;
grant  execute on function public.ordinal_to_proficiency(int)                   to authenticated;
