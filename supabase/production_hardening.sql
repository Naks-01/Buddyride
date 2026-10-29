-- BuddyRide1 production hardening migration (review before running on live data).
-- Non-destructive: does not delete profiles, rides, or uploaded files.
begin;

-- Keep legacy and current profile column names synchronized.
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists avatar_url text;
update public.profiles set phone_number = coalesce(phone_number, phone), phone = coalesce(phone, phone_number)
where phone_number is null or phone is null;

-- Explicitly set storage limits (50 MiB) and accepted file types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 52428800, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-documents', 'driver-documents', false, 52428800, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- Current UI names and older database names coexist during migration.
alter table public.driver_documents add column if not exists document_type text;
alter table public.driver_documents add column if not exists file_path text;
update public.driver_documents
set document_type = coalesce(document_type, doc_type),
    file_path = coalesce(file_path, file_url)
where document_type is null or file_path is null;

create or replace function public.buddyride_sync_driver_document_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.document_type := coalesce(new.document_type, new.doc_type);
    new.doc_type := coalesce(new.doc_type, new.document_type);
    new.file_path := coalesce(new.file_path, new.file_url);
    new.file_url := coalesce(new.file_url, new.file_path);
  else
    if new.document_type is distinct from old.document_type and new.document_type is not null then
      new.doc_type := new.document_type;
    elsif new.doc_type is distinct from old.doc_type and new.doc_type is not null then
      new.document_type := new.doc_type;
    end if;
    if new.file_path is distinct from old.file_path and new.file_path is not null then
      new.file_url := new.file_path;
    elsif new.file_url is distinct from old.file_url and new.file_url is not null then
      new.file_path := new.file_url;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists buddyride_sync_driver_document_columns on public.driver_documents;
create trigger buddyride_sync_driver_document_columns
before insert or update on public.driver_documents
for each row execute function public.buddyride_sync_driver_document_columns();

-- Profile visibility: authenticated users can see their own profile; trip participants
-- can see only the counterpart profile for a ride they are assigned/offered.
create or replace function public.buddyride_can_view_counterpart_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rides r
    where (
      (r.passenger_id = p_profile_id and (r.driver_id = auth.uid() or r.offered_driver_id = auth.uid()))
      or
      (r.driver_id = p_profile_id and r.passenger_id = auth.uid())
    )
    and r.status in ('searching','accepted','driver_arriving','driver_arrived','arrived','picked_up','en_route','in_progress','completed')
  );
$$;
revoke all on function public.buddyride_can_view_counterpart_profile(uuid) from public;
grant execute on function public.buddyride_can_view_counterpart_profile(uuid) to authenticated;

drop policy if exists "profiles_select_ride_counterpart" on public.profiles;
create policy "profiles_select_ride_counterpart" on public.profiles
for select to authenticated using (public.buddyride_can_view_counterpart_profile(id));

-- Driver cannot claim arbitrary searching rides: the dispatch offer must belong to them.
drop policy if exists "rides_driver_update" on public.rides;
create policy "rides_driver_update" on public.rides for update to authenticated
using (
  auth.uid() = driver_id
  or (driver_id is null and status = 'searching' and offered_driver_id = auth.uid())
)
with check (
  (auth.uid() = driver_id)
  or (driver_id = auth.uid() and status = 'accepted')
);

-- Passenger direct updates are for cancellation only; trip state is controlled by the assigned driver.
drop policy if exists "rides_passenger_update" on public.rides;
create policy "rides_passenger_update" on public.rides for update to authenticated
using (auth.uid() = passenger_id)
with check (auth.uid() = passenger_id and status = 'cancelled');

-- Storage ownership rules for private driver documents.
drop policy if exists "driver_documents_storage_insert" on storage.objects;
create policy "driver_documents_storage_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'driver-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "driver_documents_storage_update" on storage.objects;
create policy "driver_documents_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'driver-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "driver_documents_storage_select" on storage.objects;
create policy "driver_documents_storage_select" on storage.objects
for select to authenticated using (
  bucket_id = 'driver-documents' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()
  )
);

-- Realtime subscriptions require rides and driver_status to be in the publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides') then
      alter publication supabase_realtime add table public.rides;
    end if;
    if to_regclass('public.driver_status') is not null and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_status'
    ) then
      alter publication supabase_realtime add table public.driver_status;
    end if;
    if to_regclass('public.messages') is not null and not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end $$;

commit;
