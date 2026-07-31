do $$
declare
  admin_user_id constant uuid := 'cebfc824-ee1a-4682-a6c9-e052c5b78edf';
  expected_email constant text := 'niktraitor651@gmail.com';
  default_level_id uuid;
begin
  if exists (
    select 1
    from auth.users
    where id = admin_user_id
      and email is distinct from expected_email
  ) then
    raise exception 'Admin user % exists with an unexpected email address', admin_user_id;
  end if;

  if not exists (
    select 1
    from auth.users
    where id = admin_user_id
      and email = expected_email
  ) then
    raise notice 'Admin user % is not present; skipping project-specific ownership assignment', admin_user_id;
    return;
  end if;

  update auth.users
  set raw_app_meta_data =
        (coalesce(raw_app_meta_data, '{}'::jsonb) - 'role')
        || jsonb_build_object('role', 'admin'),
      updated_at = now()
  where id = admin_user_id;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role',
      updated_at = now()
  where id <> admin_user_id
    and raw_app_meta_data ->> 'role' = 'admin';

  select versions.level_id
  into default_level_id
  from public.app_config as config
  join public.level_versions as versions
    on versions.id = config.default_level_version_id
  where config.id = 'game';

  if default_level_id is null then
    raise exception 'The Default level is not configured';
  end if;

  update public.levels
  set owner_id = admin_user_id,
      updated_at = now()
  where id = default_level_id;

  update public.level_versions
  set created_by = admin_user_id
  where level_id = default_level_id
    and created_by is null;
end
$$;
