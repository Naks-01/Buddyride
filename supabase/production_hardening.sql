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

-- Use a narrow RPC for counterpart details instead of exposing entire profile rows.
drop policy if exists "profiles_select_ride_counterpart" on public.profiles;
drop function if exists public.buddyride_can_view_counterpart_profile(uuid);
alter table public.ride_ratings add column if not exists passenger_comment text;
alter table public.ride_ratings add column if not exists driver_comment text;
alter type public.ride_status add value if not exists 'rated';

create or replace function public.get_ride_counterpart_profile(p_ride_id uuid)
returns table (
  full_name text,
  rating numeric,
  phone text,
  phone_number text,
  avatar_url text,
  car_model text,
  car_plate text,
  car_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name, p.rating, p.phone, p.phone_number, p.avatar_url,
         p.car_model, p.car_plate, p.car_color
  from public.rides r
  join public.profiles p on p.id = case when auth.uid() = r.passenger_id then r.driver_id else r.passenger_id end
  where r.id = p_ride_id
    and auth.uid() is not null
    and r.status in ('searching','accepted','driver_arriving','driver_arrived','arrived','picked_up','en_route','in_progress','completed','rated')
    and (
      r.passenger_id = auth.uid()
      or r.driver_id = auth.uid()
      or (r.status = 'searching' and r.offered_driver_id = auth.uid())
    )
    and (auth.uid() <> r.passenger_id or r.driver_id is not null)
  limit 1;
$$;
revoke all on function public.get_ride_counterpart_profile(uuid) from public;
grant execute on function public.get_ride_counterpart_profile(uuid) to authenticated;

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

-- Enforce the agreed 80/20 driver/platform split for future trips.
update public.app_settings set commission = 20, updated_at = now() where commission <> 20;
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.app_settings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%commission%'
  loop
    execute format('alter table public.app_settings drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.app_settings
  add constraint app_settings_commission_fixed check (commission = 20);

create or replace function public.save_fare_settings(p_categories jsonb, p_commission numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  updated_count integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_commission is distinct from 20
    or jsonb_typeof(p_categories) <> 'array'
    or jsonb_array_length(p_categories) = 0
    or not exists (
      select 1 from jsonb_array_elements(p_categories) as entries(value)
      where (entries.value->>'active')::boolean
    ) then
    raise exception 'Invalid fare settings; commission is fixed at 20 percent';
  end if;

  for item in select value from jsonb_array_elements(p_categories)
  loop
    update public.fare_categories
    set label = item->>'label',
        base_fare = (item->>'base_fare')::numeric,
        per_km = (item->>'per_km')::numeric,
        per_min = (item->>'per_min')::numeric,
        min_fare = (item->>'min_fare')::numeric,
        max_fare = (item->>'max_fare')::numeric,
        active = (item->>'active')::boolean
    where id = item->>'id';
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'Unknown fare category: %', item->>'id'; end if;
  end loop;

  update public.app_settings set commission = 20, updated_at = now() where id = 1;
end;
$$;
revoke all on function public.save_fare_settings(jsonb, numeric) from public;
grant execute on function public.save_fare_settings(jsonb, numeric) to authenticated;

-- Store both participants' ratings/comments and mark a ride rated after passenger feedback.
drop function if exists public.submit_ride_rating(uuid, integer);
create or replace function public.submit_ride_rating(p_ride_id uuid, p_rating integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ride_row public.rides%rowtype;
  existing_rating public.ride_ratings%rowtype;
  is_passenger boolean;
  old_rating integer;
begin
  if auth.uid() is null or p_rating < 1 or p_rating > 5
    or length(trim(coalesce(p_comment, ''))) > 1000 then
    raise exception 'Provide a rating from 1 to 5 and a comment of at most 1000 characters';
  end if;

  select * into ride_row from public.rides where id = p_ride_id for update;
  if not found or ride_row.status not in ('completed', 'rated') then
    raise exception 'Only completed rides can be rated';
  end if;
  if ride_row.driver_id is null then raise exception 'This ride has no assigned driver'; end if;
  is_passenger := ride_row.passenger_id = auth.uid();
  if not is_passenger and ride_row.driver_id is distinct from auth.uid() then
    raise exception 'Only a ride participant can submit a rating';
  end if;

  select * into existing_rating from public.ride_ratings where ride_id = p_ride_id for update;
  if found then
    old_rating := case when is_passenger then existing_rating.passenger_rating else existing_rating.driver_rating end;
    if old_rating is not null then
      raise exception 'You have already rated this ride';
    end if;
    update public.ride_ratings
    set passenger_rating = case when is_passenger then p_rating else passenger_rating end,
        driver_rating = case when not is_passenger then p_rating else driver_rating end,
        passenger_comment = case when is_passenger then nullif(trim(p_comment), '') else passenger_comment end,
        driver_comment = case when not is_passenger then nullif(trim(p_comment), '') else driver_comment end
    where ride_id = p_ride_id;
  else
    insert into public.ride_ratings (
      ride_id, passenger_id, driver_id, passenger_rating, driver_rating, passenger_comment, driver_comment
    ) values (
      p_ride_id, ride_row.passenger_id, ride_row.driver_id,
      case when is_passenger then p_rating end,
      case when not is_passenger then p_rating end,
      case when is_passenger then nullif(trim(p_comment), '') end,
      case when not is_passenger then nullif(trim(p_comment), '') end
    );
  end if;

  if is_passenger then
    perform set_config('buddyride.internal_profile_update', 'on', true);
    update public.profiles
    set rating = (select round(avg(passenger_rating)::numeric, 2) from public.ride_ratings where driver_id = ride_row.driver_id),
        trips_completed = trips_completed + 1
    where id = ride_row.driver_id;
  else
    perform set_config('buddyride.internal_profile_update', 'on', true);
    update public.profiles
    set rating = (select round(avg(driver_rating)::numeric, 2) from public.ride_ratings where passenger_id = ride_row.passenger_id),
        trips_completed = trips_completed + 1
    where id = ride_row.passenger_id;
  end if;

  select * into existing_rating from public.ride_ratings where ride_id = p_ride_id;
  perform set_config('buddyride.internal_ride_update', 'on', true);
  update public.rides
  set driver_rating = existing_rating.driver_rating,
      status = case when existing_rating.passenger_rating is not null then 'rated' else status end
  where id = p_ride_id and status in ('completed', 'rated');
end;
$$;

revoke all on function public.submit_ride_rating(uuid, integer, text) from public;
grant execute on function public.submit_ride_rating(uuid, integer, text) to authenticated;
