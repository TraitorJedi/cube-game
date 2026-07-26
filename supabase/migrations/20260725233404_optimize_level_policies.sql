create index app_config_default_level_version_id_idx
  on public.app_config(default_level_version_id);
create index app_config_updated_by_idx
  on public.app_config(updated_by);

alter policy "Creators and admins read levels"
on public.levels
using (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

alter policy "Creators create owned levels"
on public.levels
with check (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

alter policy "Creators and admins update levels"
on public.levels
using (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
)
with check (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

alter policy "Creators admins and players read permitted versions"
on public.level_versions
using (
  id = (select default_level_version_id from public.app_config where id = 'game')
  or exists (
    select 1 from public.levels
    where levels.id = level_versions.level_id
      and levels.owner_id = (select auth.uid())
  )
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

alter policy "Creators and admins save immutable versions"
on public.level_versions
with check (
  created_by = (select auth.uid())
  and (
    exists (
      select 1 from public.levels
      where levels.id = level_versions.level_id
        and levels.owner_id = (select auth.uid())
    )
    or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
  )
);

alter policy "Admins change game configuration"
on public.app_config
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');
