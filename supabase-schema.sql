create table if not exists public.app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_states enable row level security;

drop policy if exists "Users can read own app state" on public.app_states;
create policy "Users can read own app state"
  on public.app_states for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own app state" on public.app_states;
create policy "Users can insert own app state"
  on public.app_states for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own app state" on public.app_states;
create policy "Users can update own app state"
  on public.app_states for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('user-files', 'user-files', false, 10485760)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760;

drop policy if exists "Users can read own files" on storage.objects;
create policy "Users can read own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload own files" on storage.objects;
create policy "Users can upload own files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own files" on storage.objects;
create policy "Users can update own files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own files" on storage.objects;
create policy "Users can delete own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
