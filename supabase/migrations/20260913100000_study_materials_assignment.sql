-- =============================================================================
--  SAMIKSHA · 0014 · Department study materials and assignment
--
--  Administrators publish training material — PDFs, slide decks, videos and
--  YouTube links — to a department, or to every department, and choose which
--  officers inside it receive it. Assignment is stored per officer rather than
--  as a rule, because "everyone in the directorate except the two on field
--  deputation" is exactly the choice an administrator makes, and a rule cannot
--  express an exception without becoming a second, hidden list.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
--  MATERIALS  — what kind of thing it is and where it came from
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.materials
  add column if not exists kind text not null default 'document'
    check (kind in ('pdf','pptx','docx','video','youtube','link','image','document')),
  add column if not exists external_url  text,
  add column if not exists youtube_id    text,
  add column if not exists audience      text not null default 'owner'
    check (audience in ('owner','all_departments','department')),
  add column if not exists department_id uuid references public.organizations(id) on delete set null;

comment on column public.materials.audience is
  'owner = personal upload; all_departments / department = published by an administrator. Who actually receives it lives in material_assignments.';

create index if not exists materials_department_idx on public.materials(department_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  MATERIAL ASSIGNMENTS  — one row per officer who was given the material
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.material_assignments (
  material_id   uuid not null references public.materials(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  assigned_by   uuid references public.profiles(id) on delete set null,
  assigned_at   timestamptz not null default now(),
  opened_at     timestamptz,
  completed_at  timestamptz,
  primary key (material_id, user_id)
);
create index if not exists material_assignments_user_idx on public.material_assignments(user_id);

alter table public.material_assignments enable row level security;

create policy "assignments self read" on public.material_assignments
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff());

-- Officers may only stamp their own progress; assignment itself goes through
-- assign_material(), which checks the caller's role.
create policy "assignments self progress" on public.material_assignments
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "assignments staff delete" on public.material_assignments
  for delete to authenticated
  using (public.is_staff());

-- ─────────────────────────────────────────────────────────────────────────────
--  Readability — an assigned officer, and staff, can read a material
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
        or  public.is_staff()
        or  exists (select 1 from public.material_assignments a
                    where a.material_id = m.id and a.user_id = (select auth.uid()))
        or (m.visibility = 'organization'
            and me.organization_id is not null
            and me.organization_id = (
              select p2.organization_id from public.profiles p2 where p2.id = m.owner_id
            ))
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  admin_directory()  — departments and the officers in each, for the picker
--  Administrators see every department; a nodal officer sees their own.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_directory()
returns table (
  user_id         uuid,
  full_name       text,
  employee_code   text,
  designation     text,
  role            public.app_role,
  is_active       boolean,
  department_id   uuid,
  department_name text,
  department_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.employee_code, p.designation, p.role,
         coalesce(p.is_active, true),
         o.id, o.name, o.org_type
  from public.profiles p
  left join public.organizations o on o.id = p.organization_id
  where public.is_staff()
    and (public.current_app_role() = 'admin'
         or p.organization_id = public.current_org_id())
  order by o.name nulls last, p.full_name;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
--  assign_material()  — publish a material to a set of officers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.assign_material(
  p_material_id   uuid,
  p_user_ids      uuid[],
  p_audience      text default 'department',
  p_department_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_staff() then
    raise exception 'Administrator role required to assign material' using errcode = '42501';
  end if;
  if p_audience not in ('all_departments','department') then
    raise exception 'audience must be all_departments or department';
  end if;

  update public.materials
     set audience = p_audience,
         department_id = case when p_audience = 'department' then p_department_id else null end
   where id = p_material_id;
  if not found then
    raise exception 'Material not found';
  end if;

  insert into public.material_assignments (material_id, user_id, assigned_by)
  select p_material_id, u, (select auth.uid())
  from unnest(coalesce(p_user_ids, '{}')) as u
  where exists (select 1 from public.profiles p where p.id = u)
  on conflict (material_id, user_id) do nothing;

  select count(*) into v_count from public.material_assignments where material_id = p_material_id;
  return v_count;
end;
$$;

revoke all on function public.assign_material(uuid, uuid[], text, uuid) from public, anon;
grant execute on function public.assign_material(uuid, uuid[], text, uuid) to authenticated;
revoke all on function public.admin_directory() from public, anon;
grant execute on function public.admin_directory() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
--  STORAGE  — the `materials` bucket the processing pipeline already reads
--  Objects live under <uploader uid>/..., so ownership is legible from the path.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy "materials upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materials'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "materials read permitted" on storage.objects
  for select to authenticated
  using (bucket_id = 'materials'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or exists (select 1 from public.materials m
                         where m.storage_path = name and public.can_read_material(m.id))));

create policy "materials delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materials'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────────────────────
--  SERVER SECRETS  — read from Vault by Edge Functions only
--  Lets a deployment keep the model key server-side without the Supabase CLI.
--  Never granted to anon or authenticated: an APK can never reach it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_service_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

revoke all on function public.get_service_secret(text) from public, anon, authenticated;
grant execute on function public.get_service_secret(text) to service_role;
