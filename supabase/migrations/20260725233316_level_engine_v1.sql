create table public.levels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid references auth.users(id) on delete cascade,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.level_versions (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.levels(id) on delete cascade,
  revision bigint generated always as identity,
  definition jsonb not null
    check (
      jsonb_typeof(definition) = 'object'
      and definition ->> 'schemaVersion' = '1'
      and jsonb_typeof(definition -> 'pieces') = 'array'
      and jsonb_typeof(definition -> 'rotationScript') = 'string'
    ),
  diagnostics jsonb not null default '[]'::jsonb check (jsonb_typeof(diagnostics) = 'array'),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (level_id, revision)
);

create table public.app_config (
  id text primary key check (id = 'game'),
  default_level_version_id uuid not null references public.level_versions(id),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index levels_owner_id_idx on public.levels(owner_id);
create index level_versions_level_id_revision_idx on public.level_versions(level_id, revision desc);
create index level_versions_created_by_idx on public.level_versions(created_by);
create index app_config_default_level_version_id_idx on public.app_config(default_level_version_id);
create index app_config_updated_by_idx on public.app_config(updated_by);

alter table public.levels enable row level security;
alter table public.level_versions enable row level security;
alter table public.app_config enable row level security;

revoke all on table public.levels, public.level_versions, public.app_config from anon, authenticated;
grant select on table public.app_config to anon, authenticated;
grant select on table public.level_versions to anon, authenticated;
grant select, insert, update on table public.levels to authenticated;
grant insert on table public.level_versions to authenticated;
grant update on table public.app_config to authenticated;
grant usage, select on sequence public.level_versions_revision_seq to authenticated;

create policy "Creators and admins read levels"
on public.levels for select
to authenticated
using (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

create policy "Creators create owned levels"
on public.levels for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

create policy "Creators and admins update levels"
on public.levels for update
to authenticated
using (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
)
with check (
  owner_id = (select auth.uid())
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

create policy "Anonymous users read the Default version"
on public.level_versions for select
to anon
using (
  id = (select default_level_version_id from public.app_config where id = 'game')
);

create policy "Creators admins and players read permitted versions"
on public.level_versions for select
to authenticated
using (
  id = (select default_level_version_id from public.app_config where id = 'game')
  or exists (
    select 1 from public.levels
    where levels.id = level_versions.level_id
      and levels.owner_id = (select auth.uid())
  )
  or coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
);

create policy "Creators and admins save immutable versions"
on public.level_versions for insert
to authenticated
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

create policy "Everyone reads game configuration"
on public.app_config for select
to anon, authenticated
using (true);

create policy "Admins change game configuration"
on public.app_config for update
to authenticated
using (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
with check (coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');

do $security$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$security$;

with tutorial_level as (
  insert into public.levels (slug, name, owner_id)
  values ('tutorial', 'Tutorial', null)
  returning id
),
tutorial_pieces as (
  select jsonb_agg(
    jsonb_build_object(
      'id',
      coalesce(
        nullif(
          concat_ws('/',
            case when x = 1 then 'r' when x = -1 then 'o' end,
            case when z = 1 then 'w' when z = -1 then 'y' end,
            case when y = 1 then 'b' when y = -1 then 'g' end
          ),
          ''
        ),
        'core'
      ),
      'label',
      coalesce(
        nullif(
          concat_ws(' / ',
            case when x = 1 then 'Red' when x = -1 then 'Orange' end,
            case when z = 1 then 'White' when z = -1 then 'Yellow' end,
            case when y = 1 then 'Blue' when y = -1 then 'Green' end
          ),
          ''
        ),
        'Core'
      ),
      'position', jsonb_build_array(x, y, z),
      'items',
      case
        when x = 1 and y = 1 and z = 1 then jsonb_build_array(
          jsonb_build_object('id', 'spawn', 'kind', 'spawn', 'cell', jsonb_build_array(1, 1, 0)),
          jsonb_build_object('id', 'obstacle', 'kind', 'obstacle', 'cell', jsonb_build_array(0, 0, 0)),
          jsonb_build_object('id', 'banana', 'kind', 'golden_banana', 'cell', jsonb_build_array(0, 0, 1)),
          jsonb_build_object('id', 'door-rwb', 'kind', 'door', 'cell', jsonb_build_array(0, 3, 0), 'face', 'orange')
        )
        when x = 0 and y = 1 and z = 1 then jsonb_build_array(
          jsonb_build_object('id', 'door-wb', 'kind', 'door', 'cell', jsonb_build_array(3, 3, 0), 'face', 'red')
        )
        else '[]'::jsonb
      end
    )
    order by x, y, z
  ) as pieces
  from generate_series(-1, 1) as x
  cross join generate_series(-1, 1) as y
  cross join generate_series(-1, 1) as z
),
tutorial_version as (
  insert into public.level_versions (level_id, definition, diagnostics, note, created_by)
  select
    tutorial_level.id,
    jsonb_build_object(
      'schemaVersion', 1,
      'coordinateFrame', 'orange-red_green-blue_yellow-white',
      'name', 'Tutorial',
      'pieces', tutorial_pieces.pieces,
      'rotationScript', $dsl$move red {
  select x = 1
  pivot (1, 0, 0)
  rotate x by -90
  trigger grab y drag z
  trigger grab z drag y
}

move orange {
  select x = -1
  pivot (-1, 0, 0)
  rotate x by 90
  trigger grab y drag z
  trigger grab z drag y
}

move blue {
  select y = 1
  pivot (0, 1, 0)
  rotate y by -90
  trigger grab x drag z
  trigger grab z drag x
}

move green {
  select y = -1
  pivot (0, -1, 0)
  rotate y by 90
  trigger grab x drag z
  trigger grab z drag x
}

move white {
  select z = 1
  pivot (0, 0, 1)
  rotate z by -90
  trigger grab x drag y
  trigger grab y drag x
}

move yellow {
  select z = -1
  pivot (0, 0, -1)
  rotate z by 90
  trigger grab x drag y
  trigger grab y drag x
}

move middle-x {
  select x = 0
  pivot (0, 0, 0)
  rotate x by 90
  trigger grab y drag z
  trigger grab z drag y
}

move middle-y {
  select y = 0
  pivot (0, 0, 0)
  rotate y by 90
  trigger grab x drag z
  trigger grab z drag x
}

move middle-z {
  select z = 0
  pivot (0, 0, 0)
  rotate z by 90
  trigger grab x drag y
  trigger grab y drag x
}$dsl$
    ),
    '[]'::jsonb,
    'Initial Tutorial level',
    null
  from tutorial_level, tutorial_pieces
  returning id
)
insert into public.app_config (id, default_level_version_id)
select 'game', tutorial_version.id
from tutorial_version;
