create type public.level_item_kind as enum ('obstacle', 'golden_banana', 'door', 'spawn');

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.level_modules (
  level_id uuid not null references public.levels(id) on delete cascade,
  module_id text not null,
  label text not null,
  position jsonb not null,
  colors jsonb not null,
  primary key (level_id, module_id),
  check (jsonb_typeof(position) = 'object' and jsonb_typeof(colors) = 'array')
);
create table public.level_items (
  id text primary key,
  level_id uuid not null references public.levels(id) on delete cascade,
  module_id text not null,
  kind public.level_item_kind not null,
  coordinate jsonb not null check (jsonb_typeof(coordinate) = 'array' and jsonb_array_length(coordinate) = 6),
  target_module_id text,
  foreign key (level_id, module_id) references public.level_modules(level_id, module_id) on delete cascade
);
create index level_modules_level_id_idx on public.level_modules(level_id);
create index level_items_level_id_idx on public.level_items(level_id);

alter table public.levels enable row level security;
alter table public.level_modules enable row level security;
alter table public.level_items enable row level security;
grant select on public.levels, public.level_modules, public.level_items to anon, authenticated;
grant insert, update, delete on public.levels, public.level_modules, public.level_items to authenticated;
create policy "Published level metadata is readable" on public.levels for select to anon, authenticated using (true);
create policy "Owners manage levels" on public.levels for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Level modules are readable" on public.level_modules for select to anon, authenticated using (true);
create policy "Level owners manage modules" on public.level_modules for all to authenticated using (exists (select 1 from public.levels where id = level_modules.level_id and owner_id = (select auth.uid()))) with check (exists (select 1 from public.levels where id = level_modules.level_id and owner_id = (select auth.uid())));
create policy "Level items are readable" on public.level_items for select to anon, authenticated using (true);
create policy "Level owners manage items" on public.level_items for all to authenticated using (exists (select 1 from public.levels where id = level_items.level_id and owner_id = (select auth.uid()))) with check (exists (select 1 from public.levels where id = level_items.level_id and owner_id = (select auth.uid())));
