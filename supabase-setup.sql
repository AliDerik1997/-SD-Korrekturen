create table if not exists public.fdn_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.fdn_backups enable row level security;

drop policy if exists "fdn_read_own_backup" on public.fdn_backups;
create policy "fdn_read_own_backup"
on public.fdn_backups for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "fdn_insert_own_backup" on public.fdn_backups;
create policy "fdn_insert_own_backup"
on public.fdn_backups for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "fdn_update_own_backup" on public.fdn_backups;
create policy "fdn_update_own_backup"
on public.fdn_backups for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "fdn_delete_own_backup" on public.fdn_backups;
create policy "fdn_delete_own_backup"
on public.fdn_backups for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.fdn_backups to authenticated;
revoke all on public.fdn_backups from anon;
