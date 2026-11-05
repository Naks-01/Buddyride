alter table public.profiles
  add column if not exists id_document_url text,
  add column if not exists id_number text,
  add column if not exists id_verification_method text,
  add column if not exists id_verified boolean not null default false;

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles
  add constraint profiles_verification_status_check
  check (verification_status in ('not_started', 'pending_verification', 'approved', 'rejected', 'verified'));

update public.profiles p
set id_document_url = coalesce(p.id_document_url, d.file_url),
    id_number = coalesce(p.id_number, d.id_number),
    id_verified = true,
    id_verification_method = coalesce(
      p.id_verification_method,
      case when d.id_number is not null then 'id_number' else 'id_photo' end
    )
from public.passenger_documents d
where p.id = coalesce(d.passenger_id, d.user_id)
  and p.role = 'passenger'
  and p.is_verified = true
  and d.doc_type = 'passenger_id'
  and d.status = 'approved';

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if current_setting('buddyride.internal_profile_update', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_verified := false;
    new.id_verified := false;
    new.verification_status := 'not_started';
    new.is_banned := false;
    new.wallet_balance := 0;
    new.trips_completed := 0;
    new.rating := 5.00;
    return new;
  end if;

  if new.role is distinct from old.role
    or new.is_verified is distinct from old.is_verified
    or new.id_verified is distinct from old.id_verified
    or new.verification_status is distinct from old.verification_status
    or new.is_banned is distinct from old.is_banned
    or new.wallet_balance is distinct from old.wallet_balance
    or new.trips_completed is distinct from old.trips_completed
    or new.rating is distinct from old.rating
    or new.car_model is distinct from old.car_model
    or new.car_plate is distinct from old.car_plate
    or new.car_color is distinct from old.car_color then
    raise exception 'Only an admin can change protected profile fields';
  end if;

  if new.is_online and (new.role <> 'driver' or not new.is_verified or new.is_banned) then
    raise exception 'Only a verified, active driver can go online';
  end if;

  return new;
end;
$$;

create or replace function public.sync_passenger_verification_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_passenger_id uuid;
  has_required_documents boolean;
  previous_profile_update_setting text;
begin
  if tg_op = 'DELETE' then
    target_passenger_id := coalesce(old.passenger_id, old.user_id);
  else
    target_passenger_id := coalesce(new.passenger_id, new.user_id);
  end if;
  select count(distinct doc_type) = 3 into has_required_documents
  from public.passenger_documents
  where passenger_id = target_passenger_id
    and status = 'approved'
    and file_url is not null
    and doc_type in ('passenger_id', 'passenger_selfie_holding_id', 'passenger_profile');

  previous_profile_update_setting := current_setting('buddyride.internal_profile_update', true);
  perform set_config('buddyride.internal_profile_update', 'on', true);
  update public.profiles
  set is_verified = (
    coalesce(has_required_documents, false)
    or (
      id_verified
      and avatar_url is not null
      and (id_document_url is not null or id_number is not null)
    )
  )
  where id = target_passenger_id and role = 'passenger';
  perform set_config('buddyride.internal_profile_update', coalesce(previous_profile_update_setting, 'off'), true);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.is_valid_sa_id_number(p_id text)
returns boolean
language plpgsql
stable
as $$
declare
  current_year integer := extract(year from current_date)::integer;
  yy integer;
  birth_year integer;
  birth_date date;
  digit integer;
  luhn_sum integer := 0;
  double_digit boolean := true;
  digit_position integer;
begin
  if p_id is null or p_id !~ '^[0-9]{13}$' then
    return false;
  end if;

  yy := substring(p_id from 1 for 2)::integer;
  birth_year := case
    when yy <= current_year % 100 then 2000 + yy
    else 1900 + yy
  end;
  begin
    birth_date := make_date(
      birth_year,
      substring(p_id from 3 for 2)::integer,
      substring(p_id from 5 for 2)::integer
    );
  exception when others then
    return false;
  end;
  if birth_date > current_date then
    return false;
  end if;

  for digit_position in reverse 12..1 loop
    digit := substring(p_id from digit_position for 1)::integer;
    if double_digit then
      digit := digit * 2;
      if digit > 9 then digit := digit - 9; end if;
    end if;
    luhn_sum := luhn_sum + digit;
    double_digit := not double_digit;
  end loop;

  return mod(luhn_sum + substring(p_id from 13 for 1)::integer, 10) = 0;
end;
$$;

create or replace function public.verify_passenger_safety(
  p_method text,
  p_id_number text default null,
  p_id_document_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  passenger_avatar_url text;
  previous_profile_update_setting text;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select avatar_url into passenger_avatar_url
  from public.profiles
  where id = caller_id and role = 'passenger'
  for update;
  if not found then
    raise exception 'Passenger account required';
  end if;
  if passenger_avatar_url is null or btrim(passenger_avatar_url) = '' then
    raise exception 'A selfie is required';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'passenger-photos'
      and name = (caller_id::text || '.jpg')
  ) then
    raise exception 'Selfie photo upload is missing';
  end if;

  if p_method = 'id_number' then
    if p_id_number is null or btrim(p_id_number) = '' then
      raise exception 'An ID or passport number is required';
    end if;
    if btrim(p_id_number) ~ '^[0-9]{13}$'
      and not public.is_valid_sa_id_number(btrim(p_id_number)) then
      raise exception 'Invalid South African ID number';
    end if;
  elsif p_method = 'id_photo' then
    if p_id_document_url is distinct from (caller_id::text || '.jpg') then
      raise exception 'A photo of your ID or passport is required';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'passenger-ids'
        and name = (caller_id::text || '.jpg')
    ) then
      raise exception 'ID photo upload is missing';
    end if;
  else
    raise exception 'Unsupported ID verification method';
  end if;

  previous_profile_update_setting := current_setting('buddyride.internal_profile_update', true);
  perform set_config('buddyride.internal_profile_update', 'on', true);
  update public.profiles
  set id_verified = false,
      is_verified = false,
      verification_status = 'pending_verification',
      id_number = case when p_method = 'id_number' then btrim(p_id_number) else null end,
      id_document_url = case when p_method = 'id_photo' then p_id_document_url else null end,
      id_verification_method = p_method
  where id = caller_id;
  perform set_config('buddyride.internal_profile_update', coalesce(previous_profile_update_setting, 'off'), true);
end;
$$;
revoke all on function public.verify_passenger_safety(text, text, text) from public;
grant execute on function public.verify_passenger_safety(text, text, text) to authenticated;

create or replace function public.approve_passenger_safety(p_passenger_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_profile_update_setting text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  previous_profile_update_setting := current_setting('buddyride.internal_profile_update', true);
  perform set_config('buddyride.internal_profile_update', 'on', true);
  update public.profiles
  set id_verified = true,
      is_verified = true,
      verification_status = 'verified'
  where id = p_passenger_id
    and role = 'passenger'
    and verification_status = 'pending_verification'
    and (id_document_url is not null or id_number is not null);
  if not found then
    perform set_config('buddyride.internal_profile_update', coalesce(previous_profile_update_setting, 'off'), true);
    raise exception 'Pending passenger safety verification not found';
  end if;
  perform set_config('buddyride.internal_profile_update', coalesce(previous_profile_update_setting, 'off'), true);
end;
$$;
revoke all on function public.approve_passenger_safety(uuid) from public;
grant execute on function public.approve_passenger_safety(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passenger-photos', 'passenger-photos', true, 10485760, array['image/jpeg'])
on conflict (id) do update
set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passenger-ids', 'passenger-ids', false, 10485760, array['image/jpeg'])
on conflict (id) do update
set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

drop policy if exists "passenger_photos_storage_select" on storage.objects;
create policy "passenger_photos_storage_select" on storage.objects
for select using (bucket_id = 'passenger-photos');
drop policy if exists "passenger_photos_storage_insert" on storage.objects;
create policy "passenger_photos_storage_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'passenger-photos' and name = (auth.uid()::text || '.jpg')
);
drop policy if exists "passenger_photos_storage_update" on storage.objects;
create policy "passenger_photos_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'passenger-photos' and name = (auth.uid()::text || '.jpg'))
with check (bucket_id = 'passenger-photos' and name = (auth.uid()::text || '.jpg'));
drop policy if exists "passenger_photos_storage_delete" on storage.objects;
create policy "passenger_photos_storage_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'passenger-photos' and name = (auth.uid()::text || '.jpg')
);

drop policy if exists "passenger_ids_storage_select" on storage.objects;
create policy "passenger_ids_storage_select" on storage.objects
for select to authenticated using (
  bucket_id = 'passenger-ids'
  and (name = (auth.uid()::text || '.jpg') or public.is_admin())
);
drop policy if exists "passenger_ids_storage_insert" on storage.objects;
create policy "passenger_ids_storage_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'passenger-ids' and name = (auth.uid()::text || '.jpg')
);
drop policy if exists "passenger_ids_storage_update" on storage.objects;
create policy "passenger_ids_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'passenger-ids' and name = (auth.uid()::text || '.jpg'))
with check (bucket_id = 'passenger-ids' and name = (auth.uid()::text || '.jpg'));
drop policy if exists "passenger_ids_storage_delete" on storage.objects;
create policy "passenger_ids_storage_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'passenger-ids' and name = (auth.uid()::text || '.jpg')
);

drop policy if exists "rides_passenger_insert" on public.rides;
create policy "rides_passenger_insert" on public.rides for insert with check (
  auth.uid() = passenger_id
  and (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'passenger'
        and (
          p.is_verified
          or p.verification_status = 'pending_verification'
        )
        and not p.is_banned
    )
  )
);
