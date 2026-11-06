-- BUDDYRIDE1 CLEAN DATABASE
-- Run this in Supabase SQL Editor on a NEW project.

create extension if not exists pgcrypto;

create type public.user_role as enum ('passenger','driver','admin');
create type public.ride_status as enum (
  'searching','accepted','driver_arriving','driver_arrived',
  'awaiting_payment','arrived','picked_up','en_route','in_progress','completed','rated','cancelled'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role public.user_role not null,
  full_name text,
  phone text,
  phone_number text,
  avatar_url text,
  selfie_url text,
  id_document_url text,
  id_number text,
  id_verification_method text,
  id_verified boolean not null default false,
  is_verified boolean not null default false,
  verification_status text not null default 'pending',
  verification_rejection_reason text,
  verified_at timestamptz,
  is_banned boolean not null default false,
  is_online boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  wallet_balance numeric(10,2) not null default 0,
  trips_completed integer not null default 0,
  rating numeric(3,2) not null default 5.00,
  car_model text,
  car_plate text,
  car_color text,
  bank_name text,
  bank_account_holder text,
  bank_account_number text,
  bank_branch_code text,
  last_selfie_date date,
  last_selfie_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles alter column role drop default;
alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists id_document_url text;
alter table public.profiles add column if not exists selfie_url text;
alter table public.profiles add column if not exists id_number text;
alter table public.profiles add column if not exists id_verification_method text;
alter table public.profiles add column if not exists id_verified boolean not null default false;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists verification_status text not null default 'not_started';
alter table public.profiles add column if not exists verification_rejection_reason text;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists is_banned boolean not null default false;
alter table public.profiles add column if not exists is_online boolean not null default false;
alter table public.profiles add column if not exists current_lat double precision;
alter table public.profiles add column if not exists current_lng double precision;
alter table public.profiles add column if not exists wallet_balance numeric(10,2) not null default 0;
alter table public.profiles add column if not exists trips_completed integer not null default 0;
alter table public.profiles add column if not exists rating numeric(3,2) not null default 5.00;
alter table public.profiles add column if not exists car_model text;
alter table public.profiles add column if not exists car_plate text;
alter table public.profiles add column if not exists car_color text;
alter table public.profiles add column if not exists bank_name text;
alter table public.profiles add column if not exists bank_account_holder text;
alter table public.profiles add column if not exists bank_account_number text;
alter table public.profiles add column if not exists bank_branch_code text;
alter table public.profiles add column if not exists last_selfie_date date;
alter table public.profiles add column if not exists last_selfie_url text;
alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles
  add constraint profiles_verification_status_check
  check (verification_status in ('not_started', 'pending', 'pending_verification', 'approved', 'rejected', 'verified'));

create or replace function public.sync_profile_phone_columns()
returns trigger language plpgsql as $$
begin
  if new.phone_number is null and new.phone is not null then new.phone_number := new.phone;
  elsif new.phone is null and new.phone_number is not null then new.phone := new.phone_number;
  elsif tg_op = 'UPDATE' and new.phone_number is distinct from old.phone_number and new.phone_number is not null then new.phone := new.phone_number;
  elsif tg_op = 'UPDATE' and new.phone is distinct from old.phone and new.phone is not null then new.phone_number := new.phone;
  end if;
  return new;
end; $$;
drop trigger if exists sync_profile_phone_columns on public.profiles;
create trigger sync_profile_phone_columns before insert or update on public.profiles
for each row execute function public.sync_profile_phone_columns();

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null,
  file_url text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now(),
  unique (driver_id, doc_type)
);
alter table public.driver_documents add column if not exists file_path text;
alter table public.driver_documents add column if not exists storage_path text;
alter table public.driver_documents add column if not exists file_name text;
alter table public.driver_documents add column if not exists file_size bigint;
alter table public.driver_documents add column if not exists file_type text;
alter table public.driver_documents add column if not exists expiry_date date;
alter table public.driver_documents add column if not exists rejection_reason text;
alter table public.driver_documents add column if not exists reviewed_at timestamptz;
alter table public.driver_documents add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.driver_documents add column if not exists prdp_number text;
alter table public.driver_documents add column if not exists document_hash text;

create table if not exists public.passenger_documents (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  doc_type text not null,
  file_url text not null,
  id_number text,
  phone text,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (passenger_id, doc_type)
);
alter table public.passenger_documents add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.passenger_documents alter column status set default 'approved';
update public.passenger_documents set user_id = passenger_id where user_id is null;
create unique index if not exists passenger_documents_user_doc_type_uidx on public.passenger_documents(user_id, doc_type);
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

create or replace function public.sync_passenger_document_user_id()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id and new.user_id is not null then
    new.passenger_id := new.user_id;
  elsif tg_op = 'UPDATE' and new.passenger_id is distinct from old.passenger_id and new.passenger_id is not null then
    new.user_id := new.passenger_id;
  else
    new.passenger_id := coalesce(new.passenger_id, new.user_id);
    new.user_id := coalesce(new.user_id, new.passenger_id);
  end if;
  return new;
end;
$$;
drop trigger if exists sync_passenger_document_user_id on public.passenger_documents;
create trigger sync_passenger_document_user_id
before insert or update on public.passenger_documents
for each row execute function public.sync_passenger_document_user_id();

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
drop trigger if exists sync_passenger_verification_status on public.passenger_documents;

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

  perform set_config('buddyride.internal_profile_update', 'on', true);
  update public.profiles
  set id_verified = false,
      is_verified = false,
      verification_status = 'pending_verification',
      id_number = case when p_method = 'id_number' then btrim(p_id_number) else null end,
      id_document_url = case when p_method = 'id_photo' then p_id_document_url else null end,
      id_verification_method = p_method
  where id = caller_id;
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
  previous_approval_setting text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  previous_profile_update_setting := current_setting('buddyride.internal_profile_update', true);
  previous_approval_setting := current_setting('buddyride.passenger_approval', true);
  perform set_config('buddyride.internal_profile_update', 'on', true);
  perform set_config('buddyride.passenger_approval', 'on', true);
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
    perform set_config('buddyride.passenger_approval', coalesce(previous_approval_setting, 'off'), true);
    raise exception 'Pending passenger safety verification not found';
  end if;
  perform set_config('buddyride.internal_profile_update', coalesce(previous_profile_update_setting, 'off'), true);
  perform set_config('buddyride.passenger_approval', coalesce(previous_approval_setting, 'off'), true);
end;
$$;
revoke all on function public.approve_passenger_safety(uuid) from public;
grant execute on function public.approve_passenger_safety(uuid) to authenticated;

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed double precision,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.driver_locations add column if not exists heading double precision;
alter table public.driver_locations add column if not exists speed double precision;

create table if not exists public.driver_status (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id integer primary key check (id = 1),
  base_fare numeric(10,2) not null default 15 check (base_fare >= 0),
  per_km numeric(10,2) not null default 8 check (per_km >= 0),
  per_min numeric(10,2) not null default 0.5 check (per_min >= 0),
  min_fare numeric(10,2) not null default 27 check (min_fare >= 0),
  commission numeric(5,2) not null default 20 check (commission = 20),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.fare_categories (
  id text primary key,
  label text not null,
  base_fare numeric(10,2) not null check (base_fare >= 0),
  per_km numeric(10,2) not null check (per_km >= 0),
  per_min numeric(10,2) not null check (per_min >= 0),
  min_fare numeric(10,2) not null check (min_fare >= 0),
  max_fare numeric(10,2) not null default 350 check (max_fare >= min_fare),
  active boolean not null default true
);
insert into public.fare_categories (id,label,base_fare,per_km,per_min,min_fare) values
  ('buddy_go','Go',15,8,0.5,27),
  ('buddy_comfort','Comfort',18,10,0.7,35),
  ('buddy_xl','XL',22,12,1,50)
on conflict (id) do nothing;

create table if not exists public.fare_quotes (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  ride_category text not null references public.fare_categories(id),
  pickup_lng double precision,
  pickup_lat double precision,
  dropoff_lng double precision,
  dropoff_lat double precision,
  distance_km numeric not null check (distance_km > 0 and distance_km <= 500),
  duration_min numeric not null check (duration_min >= 0 and duration_min <= 600),
  fare numeric(10,2) not null check (fare >= 0),
  booking_fee numeric(10,2) not null default 0,
  total_fare numeric(10,2) not null,
  commission_rate numeric(5,2) not null,
  buddyride_commission numeric(10,2) not null,
  driver_earnings numeric(10,2) not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.fare_quotes enable row level security;
revoke all on public.fare_quotes from anon, authenticated;
grant all on public.fare_quotes to service_role;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  make text not null,
  model text not null,
  year integer,
  color text,
  plate_number text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  fare_quote_id uuid references public.fare_quotes(id),
  driver_id uuid references public.profiles(id) on delete set null,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  distance_km numeric(10,2) not null default 0,
  duration_min numeric(8,2) not null default 5,
  fare numeric(10,2) not null default 0,
  booking_fee numeric(10,2) not null default 0,
  total_fare numeric(10,2) not null default 0,
  driver_earnings numeric(10,2) not null default 0,
  buddyride_commission numeric(10,2) not null default 0,
  offer_expires_at timestamptz,
  offered_driver_id uuid references public.profiles(id) on delete set null,
  tried_driver_ids uuid[] not null default '{}',
  payment_method text not null default 'cash',
  payment_status text not null default 'cash_due' check (payment_status in ('awaiting_payment','paid','cash_due','failed','refunded')),
  payment_reference text unique,
  ride_category text not null default 'buddy_go',
  cancelled_by text check (cancelled_by in ('passenger', 'driver', 'admin')),
  cancel_reason text,
  driver_lat double precision,
  driver_lng double precision,
  driver_rating integer check (driver_rating between 1 and 5),
  status public.ride_status not null default 'searching',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
alter table public.rides add column if not exists offer_expires_at timestamptz;
alter table public.rides add column if not exists fare_quote_id uuid references public.fare_quotes(id);
alter table public.rides add column if not exists duration_min numeric(8,2) not null default 5;
alter table public.rides add column if not exists offered_driver_id uuid references public.profiles(id) on delete set null;
alter table public.rides add column if not exists tried_driver_ids uuid[] not null default '{}';
alter table public.rides add column if not exists payment_method text not null default 'cash';
alter table public.rides add column if not exists payment_status text not null default 'cash_due';
alter table public.rides add column if not exists payment_reference text unique;
alter table public.rides add column if not exists ride_category text not null default 'buddy_go';
alter table public.rides add column if not exists cancelled_by text;
alter table public.rides add column if not exists cancel_reason text;
alter table public.rides add column if not exists driver_lat double precision;
alter table public.rides add column if not exists driver_lng double precision;
alter table public.rides add column if not exists driver_rating integer;
alter table public.rides add column if not exists accepted_at timestamptz;
alter table public.rides add column if not exists started_at timestamptz;
alter table public.rides add column if not exists completed_at timestamptz;
alter table public.rides add column if not exists cancelled_at timestamptz;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.sos_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete set null,
  message text not null check (length(trim(message)) between 1 and 4000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.ride_ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid unique not null references public.rides(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  passenger_rating integer check (passenger_rating between 1 and 5),
  driver_rating integer check (driver_rating between 1 and 5),
  passenger_comment text,
  driver_comment text,
  created_at timestamptz not null default now()
);
alter table public.ride_ratings add column if not exists passenger_comment text;
alter table public.ride_ratings add column if not exists driver_comment text;

create index if not exists rides_status_idx on public.rides(status);
create index if not exists rides_passenger_idx on public.rides(passenger_id);
create index if not exists rides_driver_idx on public.rides(driver_id);
create index if not exists driver_locations_online_idx on public.driver_locations(is_online);
create index if not exists driver_status_online_idx on public.driver_status(is_online);
create index if not exists messages_ride_created_idx on public.messages(ride_id, created_at);
create index if not exists sos_reports_created_idx on public.sos_reports(created_at desc);

alter table public.profiles enable row level security;
alter table public.driver_locations enable row level security;
alter table public.driver_status enable row level security;
alter table public.app_settings enable row level security;
alter table public.fare_categories enable row level security;
alter table public.messages enable row level security;
alter table public.sos_reports enable row level security;
alter table public.vehicles enable row level security;
alter table public.rides enable row level security;
alter table public.ride_ratings enable row level security;
alter table public.driver_documents enable row level security;
alter table public.passenger_documents enable row level security;

-- Profiles: users can read/update their own profile.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and lower(coalesce(auth.jwt()->>'email', '')) = 'buddyride@outlook.com'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

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

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role::text in ('passenger', 'rider') then
      new.is_verified := false;
      new.id_verified := false;
      new.verification_status := 'pending';
    elsif new.role::text = 'driver' then
      new.is_verified := false;
      new.id_verified := false;
      new.verification_status := 'not_started';
    end if;
    new.is_banned := false;
    new.wallet_balance := 0;
    new.trips_completed := 0;
    new.rating := 5.00;
    return new;
  end if;

  if new.role::text in ('passenger', 'rider')
    and new.verification_status = 'verified'
    and old.verification_status is distinct from 'verified'
    and (
      not public.is_admin()
      or current_setting('buddyride.passenger_approval', true) is distinct from 'on'
    ) then
    raise exception 'Passenger verification must be granted by the admin approval function';
  end if;

  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if current_setting('buddyride.internal_profile_update', true) = 'on' then
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

drop trigger if exists guard_profile_changes on public.profiles;
create trigger guard_profile_changes
before insert or update on public.profiles
for each row execute function public.guard_profile_changes();

create or replace function public.submit_driver_documents_for_review()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null or not exists (
    select 1 from public.profiles where id = caller_id and role = 'driver'
  ) then
    raise exception 'Driver account required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = caller_id
      and nullif(btrim(bank_name), '') is not null
      and nullif(btrim(bank_account_holder), '') is not null
      and nullif(btrim(bank_account_number), '') is not null
      and nullif(btrim(bank_branch_code), '') is not null
  ) then
    raise exception 'Complete all required bank details before submitting';
  end if;

  if not exists (
    select 1
    from public.driver_documents
    where driver_id = caller_id
      and file_url is not null
      and nullif(btrim(file_url), '') is not null
    group by driver_id
    having count(distinct doc_type) filter (where doc_type in (
      'sa_id', 'drivers_license', 'prdp', 'profile_photo', 'selfie_holding_id',
      'vehicle_registration', 'license_disc', 'vehicle_photos_1', 'vehicle_photos_2',
      'vehicle_photos_3', 'vehicle_photos_4'
    )) = 11
      and count(distinct file_url) filter (where doc_type in (
        'sa_id', 'drivers_license', 'prdp', 'profile_photo', 'selfie_holding_id',
        'vehicle_registration', 'license_disc', 'vehicle_photos_1', 'vehicle_photos_2',
        'vehicle_photos_3', 'vehicle_photos_4'
      )) = 11
      and count(distinct document_hash) filter (where doc_type in ('profile_photo', 'selfie_holding_id')) = 2
      and bool_and(expiry_date is not null and expiry_date >= current_date) filter (where doc_type in ('drivers_license', 'prdp', 'license_disc'))
      and bool_and(nullif(btrim(prdp_number), '') is not null) filter (where doc_type = 'prdp')
      and bool_and(status <> 'REJECTED') filter (where doc_type in (
        'sa_id', 'drivers_license', 'prdp', 'profile_photo', 'selfie_holding_id',
        'vehicle_registration', 'license_disc', 'vehicle_photos_1', 'vehicle_photos_2',
        'vehicle_photos_3', 'vehicle_photos_4'
      ))
  ) then
    raise exception 'Upload each required driver document separately and complete expiry and PrDP details';
  end if;

  perform set_config('buddyride.internal_profile_update', 'on', true);
  update public.profiles
  set verification_status = 'pending_verification'
  where id = caller_id;
end;
$$;
revoke all on function public.submit_driver_documents_for_review() from public;
grant execute on function public.submit_driver_documents_for_review() to authenticated;

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change a profile role';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_role_change on public.profiles;
create trigger prevent_profile_role_change
before update of role on public.profiles
for each row execute function public.prevent_profile_role_change();

create or replace function public.guard_ride_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile public.profiles%rowtype;
  fare_row public.fare_categories%rowtype;
  commission_rate numeric(5,2);
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if current_setting('buddyride.internal_ride_update', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into caller_profile from public.profiles where id = auth.uid();
    if new.passenger_id is distinct from auth.uid()
      or caller_profile.id is null
      or caller_profile.role <> 'passenger' then
      raise exception 'Only a passenger can request a ride';
    end if;
    if caller_profile.is_verified is not true
      or caller_profile.id_verified is not true
      or caller_profile.verification_status <> 'verified'
      or caller_profile.is_banned then
      raise exception 'Passenger not approved';
    end if;
    if new.status not in ('searching','awaiting_payment')
      or new.driver_id is not null then
      raise exception 'Invalid ride request';
    end if;
    if (new.payment_method = 'paystack' and new.status <> 'awaiting_payment')
      or (new.payment_method <> 'paystack' and (new.payment_method <> 'cash' or new.status <> 'searching')) then
      raise exception 'Invalid ride payment state';
    end if;
    new.payment_status := case when new.payment_method = 'paystack' then 'awaiting_payment' else 'cash_due' end;
    new.payment_reference := null;
    if new.distance_km <= 0 or new.distance_km > 500
      or new.duration_min < 0 or new.duration_min > 600 then
      raise exception 'Invalid route distance or duration';
    end if;
    select * into fare_row from public.fare_categories
    where id = new.ride_category and active;
    if not found then raise exception 'Selected ride category is unavailable'; end if;
    select commission into commission_rate from public.app_settings where id = 1;
    new.fare := round(least(fare_row.max_fare, greatest(
      fare_row.min_fare,
      fare_row.base_fare + new.distance_km * fare_row.per_km + new.duration_min * fare_row.per_min
    )));
    new.booking_fee := 0;
    new.total_fare := new.fare;
    new.buddyride_commission := round(new.total_fare * coalesce(commission_rate, 20) / 100);
    new.driver_earnings := new.total_fare - new.buddyride_commission;
    new.driver_id := null;
    new.offered_driver_id := null;
    new.offer_expires_at := null;
    new.tried_driver_ids := '{}';
    new.driver_lat := null;
    new.driver_lng := null;
    new.cancelled_by := null;
    new.cancel_reason := null;
    return new;
  end if;

  if new.passenger_id is distinct from old.passenger_id
    or new.pickup_address is distinct from old.pickup_address
    or new.dropoff_address is distinct from old.dropoff_address
    or new.pickup_lat is distinct from old.pickup_lat
    or new.pickup_lng is distinct from old.pickup_lng
    or new.dropoff_lat is distinct from old.dropoff_lat
    or new.dropoff_lng is distinct from old.dropoff_lng
    or new.distance_km is distinct from old.distance_km
    or new.duration_min is distinct from old.duration_min
    or new.fare is distinct from old.fare
    or new.booking_fee is distinct from old.booking_fee
    or new.total_fare is distinct from old.total_fare
    or new.driver_earnings is distinct from old.driver_earnings
    or new.buddyride_commission is distinct from old.buddyride_commission
    or new.payment_method is distinct from old.payment_method
    or new.payment_status is distinct from old.payment_status
    or new.payment_reference is distinct from old.payment_reference
    or new.ride_category is distinct from old.ride_category then
    raise exception 'Ride details and fare cannot be changed after a request is created';
  end if;

  if auth.uid() = old.passenger_id then
    if new.driver_id is distinct from old.driver_id
      or new.offered_driver_id is distinct from old.offered_driver_id
      or new.offer_expires_at is distinct from old.offer_expires_at
      or new.driver_lat is distinct from old.driver_lat
      or new.driver_lng is distinct from old.driver_lng then
      raise exception 'Passenger cannot change driver assignment or location';
    end if;
    if new.status <> old.status and not (
      new.status = 'cancelled' and old.status in ('searching','awaiting_payment','accepted','arrived','driver_arrived')
    ) then
      raise exception 'Passenger cannot make this ride status change';
    end if;
    if new.status = 'cancelled' then
      new.cancelled_by := 'passenger';
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
    return new;
  end if;

  select * into caller_profile from public.profiles where id = auth.uid();
  if caller_profile.role <> 'driver' or not caller_profile.is_verified or caller_profile.is_banned then
    raise exception 'Only an approved, active driver can update a ride';
  end if;

  if old.driver_id is null and old.status = 'searching' then
    if new.driver_id <> auth.uid()
      or old.offered_driver_id is distinct from auth.uid()
      or old.offer_expires_at is null
      or old.offer_expires_at < now()
      or new.status <> 'accepted' then
      raise exception 'This ride offer is not assigned to you or has expired';
    end if;
    new.accepted_at := now();
  elsif old.driver_id = auth.uid() then
    if new.driver_id is distinct from old.driver_id
      or new.offered_driver_id is distinct from old.offered_driver_id
      or new.offer_expires_at is distinct from old.offer_expires_at
      or new.cancelled_by is distinct from old.cancelled_by and new.status <> 'cancelled'
      or new.status not in ('accepted','arrived','driver_arrived','in_progress','picked_up','en_route','completed','cancelled')
      or (new.status = 'arrived' and old.status <> 'accepted')
      or (new.status = 'in_progress' and old.status not in ('arrived','driver_arrived','picked_up','en_route'))
      or (new.status = 'completed' and old.status not in ('in_progress','picked_up','en_route'))
      or (new.status = 'cancelled' and old.status not in ('accepted','arrived','driver_arrived','in_progress','picked_up','en_route')) then
      raise exception 'Driver cannot make this ride status change';
    end if;
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    elsif new.status = 'cancelled' then
      new.cancelled_by := 'driver';
      new.cancelled_at := coalesce(new.cancelled_at, now());
    end if;
  else
    raise exception 'Only a ride participant can update this ride';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_ride_changes on public.rides;
create trigger guard_ride_changes
before insert or update on public.rides
for each row execute function public.guard_ride_changes();

create or replace function public.apply_server_fare_quote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.fare_quotes%rowtype;
begin
  if new.fare_quote_id is null then
    if public.is_admin() then return new; end if;
    raise exception 'A valid server-calculated fare quote is required';
  end if;

  select * into quote_row
  from public.fare_quotes
  where id = new.fare_quote_id
  for update;
  if not found
    or quote_row.passenger_id is distinct from new.passenger_id
    or quote_row.passenger_id is distinct from auth.uid()
    or quote_row.ride_category is distinct from new.ride_category
    or quote_row.pickup_lng is distinct from new.pickup_lng
    or quote_row.pickup_lat is distinct from new.pickup_lat
    or quote_row.dropoff_lng is distinct from new.dropoff_lng
    or quote_row.dropoff_lat is distinct from new.dropoff_lat
    or quote_row.expires_at <= now()
    or quote_row.used_at is not null then
    raise exception 'Fare quote is missing, expired, already used, or does not match this ride';
  end if;

  new.distance_km := quote_row.distance_km;
  new.duration_min := quote_row.duration_min;
  new.fare := quote_row.fare;
  new.booking_fee := quote_row.booking_fee;
  new.total_fare := quote_row.total_fare;
  new.buddyride_commission := quote_row.buddyride_commission;
  new.driver_earnings := quote_row.driver_earnings;
  update public.fare_quotes
  set used_at = now(),
      pickup_lng = null,
      pickup_lat = null,
      dropoff_lng = null,
      dropoff_lat = null
  where id = quote_row.id;
  return new;
end;
$$;
drop trigger if exists rides_apply_server_fare_quote on public.rides;
create trigger rides_apply_server_fare_quote
before insert on public.rides
for each row execute function public.apply_server_fare_quote();

create or replace function public.prevent_ride_fare_quote_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fare_quote_id is distinct from old.fare_quote_id then
    raise exception 'A ride fare quote cannot be changed after creation';
  end if;
  return new;
end;
$$;
drop trigger if exists rides_fare_quote_immutable on public.rides;
create trigger rides_fare_quote_immutable
before update on public.rides
for each row execute function public.prevent_ride_fare_quote_change();

create or replace function public.guard_driver_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  driver_profile public.profiles%rowtype;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.driver_id <> auth.uid() then raise exception 'Drivers can only update their own location'; end if;
  select * into driver_profile from public.profiles where id = auth.uid();
  if driver_profile.role <> 'driver' or driver_profile.is_banned
    or (new.is_online and not driver_profile.is_verified) then
    raise exception 'Only an approved, active driver can publish an online location';
  end if;
  if new.lat not between -90 and 90 or new.lng not between -180 and 180 then
    raise exception 'Invalid driver coordinates';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_driver_status_location on public.driver_status;
create trigger guard_driver_status_location
before insert or update on public.driver_status
for each row execute function public.guard_driver_location();
drop trigger if exists guard_driver_live_location on public.driver_locations;
create trigger guard_driver_live_location
before insert or update on public.driver_locations
for each row execute function public.guard_driver_location();

create or replace function public.dispatch_ride(p_ride_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ride_row public.rides%rowtype;
  driver_id uuid;
  internal_dispatch boolean := coalesce(current_setting('buddyride.internal_dispatch', true) = 'on', false);
begin
  if auth.uid() is null and not internal_dispatch then raise exception 'Authentication required'; end if;
  select * into ride_row from public.rides where id = p_ride_id for update;
  if not found or ride_row.status <> 'searching' then
    raise exception 'Ride is not available for dispatch';
  end if;
  if not internal_dispatch and ride_row.passenger_id <> auth.uid()
    and not (auth.uid() = any(ride_row.tried_driver_ids) and ride_row.offered_driver_id is null) then
    raise exception 'Only the passenger or a driver who declined this ride can dispatch it';
  end if;
  if ride_row.driver_id is not null then
    raise exception 'Ride already has a driver';
  end if;
  if ride_row.offered_driver_id is not null and ride_row.offer_expires_at > now() then
    return ride_row.offered_driver_id;
  end if;

  if ride_row.offered_driver_id is not null then
    ride_row.tried_driver_ids := array_append(ride_row.tried_driver_ids, ride_row.offered_driver_id);
    perform set_config('buddyride.internal_ride_update', 'on', true);
    update public.rides
      set tried_driver_ids = array_append(tried_driver_ids, offered_driver_id),
          offered_driver_id = null, offer_expires_at = null
    where id = p_ride_id;
  end if;

  select ds.driver_id into driver_id
  from public.driver_status ds
  join public.profiles p on p.id = ds.driver_id
  where ds.is_online
    and ds.updated_at > now() - interval '5 minutes'
    and p.role = 'driver'
    and p.is_verified
    and not p.is_banned
    and not (ds.driver_id = any(ride_row.tried_driver_ids))
    and not exists (
      select 1 from public.rides active
      where active.driver_id = ds.driver_id
        and active.status in ('accepted','arrived','driver_arrived','picked_up','en_route','in_progress')
    )
    and not exists (
      select 1 from public.rides offered
      where offered.offered_driver_id = ds.driver_id
        and offered.status = 'searching'
        and offered.offer_expires_at > now()
    )
  order by power(ds.lat - ride_row.pickup_lat, 2) + power(ds.lng - ride_row.pickup_lng, 2)
  limit 1
  for update of ds skip locked;

  if driver_id is null then return null; end if;
  perform set_config('buddyride.internal_ride_update', 'on', true);
  update public.rides
    set offered_driver_id = driver_id, offer_expires_at = now() + interval '15 seconds'
  where id = p_ride_id;
  return driver_id;
end;
$$;

create or replace function public.auto_dispatch_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_dispatch boolean := false;
begin
  if new.status = 'searching' then
    if tg_op = 'INSERT' then
      should_dispatch := true;
    elsif old.status is distinct from new.status then
      should_dispatch := true;
    end if;
  end if;

  if should_dispatch then
    perform set_config('buddyride.internal_dispatch', 'on', true);
    perform public.dispatch_ride(new.id);
    perform set_config('buddyride.internal_dispatch', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_auto_dispatch on public.rides;
create trigger trigger_auto_dispatch
after insert or update on public.rides
for each row execute function public.auto_dispatch_ride();

create or replace function public.decline_ride(p_ride_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ride_row public.rides%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into ride_row from public.rides where id = p_ride_id for update;
  if not found or ride_row.status <> 'searching' or ride_row.offered_driver_id <> auth.uid() then
    raise exception 'Ride offer is no longer assigned to you';
  end if;
  perform set_config('buddyride.internal_ride_update', 'on', true);
  update public.rides
    set tried_driver_ids = array_append(tried_driver_ids, auth.uid()),
        offered_driver_id = null, offer_expires_at = null
  where id = p_ride_id;
  return public.dispatch_ride(p_ride_id);
end;
$$;

revoke all on function public.dispatch_ride(uuid) from public;
revoke all on function public.decline_ride(uuid) from public;
grant execute on function public.dispatch_ride(uuid) to authenticated;
grant execute on function public.decline_ride(uuid) to authenticated;

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

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles for select using (public.is_admin());
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id and role <> 'admin');
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "driver_documents_select" on public.driver_documents;
create policy "driver_documents_select" on public.driver_documents
for select to authenticated using (auth.uid() = driver_id or public.is_admin());
drop policy if exists "driver_documents_insert" on public.driver_documents;
create policy "driver_documents_insert" on public.driver_documents
for insert to authenticated with check (auth.uid() = driver_id and status = 'PENDING');
drop policy if exists "driver_documents_update" on public.driver_documents;
create policy "driver_documents_update" on public.driver_documents
for update to authenticated
using (auth.uid() = driver_id or public.is_admin())
with check (public.is_admin() or (auth.uid() = driver_id and status = 'PENDING'));

drop policy if exists "passenger_documents_select" on public.passenger_documents;
create policy "passenger_documents_select" on public.passenger_documents
for select to authenticated using (auth.uid() = passenger_id or auth.uid() = user_id or public.is_admin());
drop policy if exists "passenger_documents_insert" on public.passenger_documents;
create policy "passenger_documents_insert" on public.passenger_documents
for insert to authenticated with check (
  (auth.uid() = passenger_id or auth.uid() = user_id) and status in ('pending', 'approved')
);
drop policy if exists "passenger_documents_update" on public.passenger_documents;
create policy "passenger_documents_update" on public.passenger_documents
for update to authenticated
using (auth.uid() = passenger_id or auth.uid() = user_id or public.is_admin())
with check (
  public.is_admin()
  or ((auth.uid() = passenger_id or auth.uid() = user_id) and status in ('pending', 'approved'))
);

-- Drivers need their own location row; passengers can read online driver locations.
create policy "driver_locations_own_write" on public.driver_locations
for all using (auth.uid() = driver_id) with check (auth.uid() = driver_id);
create policy "driver_locations_read_authenticated" on public.driver_locations
for select to authenticated using (is_online or auth.uid() = driver_id or public.is_admin());

drop policy if exists "driver_status_own_write" on public.driver_status;
create policy "driver_status_own_write" on public.driver_status
for all using (auth.uid() = driver_id) with check (auth.uid() = driver_id);
drop policy if exists "driver_status_read_authenticated" on public.driver_status;
create policy "driver_status_read_authenticated" on public.driver_status
for select to authenticated using (is_online or auth.uid() = driver_id or public.is_admin());

drop policy if exists "app_settings_read_authenticated" on public.app_settings;
create policy "app_settings_read_authenticated" on public.app_settings
for select to authenticated using (true);
drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "fare_categories_read_authenticated" on public.fare_categories;
create policy "fare_categories_read_authenticated" on public.fare_categories
for select to authenticated using (active or public.is_admin());
drop policy if exists "fare_categories_admin_write" on public.fare_categories;
create policy "fare_categories_admin_write" on public.fare_categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());

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
    raise exception 'Invalid fare settings';
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

drop policy if exists "messages_participant_select" on public.messages;
create policy "messages_participant_select" on public.messages for select to authenticated
using (exists (
  select 1 from public.rides r where r.id = ride_id
    and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
));
drop policy if exists "messages_participant_insert" on public.messages;
create policy "messages_participant_insert" on public.messages for insert to authenticated
with check (sender_id = auth.uid() and exists (
  select 1 from public.rides r where r.id = ride_id
    and r.status in ('accepted','driver_arriving','driver_arrived','arrived','picked_up','en_route','in_progress')
    and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
));

drop policy if exists "sos_reports_owner_select" on public.sos_reports;
create policy "sos_reports_owner_select" on public.sos_reports for select to authenticated
using (user_id = auth.uid() or public.is_admin());
drop policy if exists "sos_reports_owner_insert" on public.sos_reports;
create policy "sos_reports_owner_insert" on public.sos_reports for insert to authenticated
with check (user_id = auth.uid() and (ride_id is null or exists (
  select 1 from public.rides r where r.id = ride_id
    and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
)));
drop policy if exists "sos_reports_admin_update" on public.sos_reports;
create policy "sos_reports_admin_update" on public.sos_reports for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Vehicles: driver owns their vehicle.
create policy "vehicles_own" on public.vehicles
for all using (auth.uid() = driver_id) with check (auth.uid() = driver_id);

-- Rides: passengers see their rides; drivers see searching rides and their accepted rides.
create policy "rides_passenger_select" on public.rides for select using (auth.uid() = passenger_id);
drop policy if exists "rides_passenger_insert" on public.rides;
create policy "rides_passenger_insert" on public.rides for insert with check (
  public.is_admin()
  or (
    auth.uid() = passenger_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'passenger'
        and p.is_verified = true
        and p.id_verified = true
        and p.verification_status = 'verified'
        and p.is_banned = false
    )
  )
);
create policy "rides_passenger_update" on public.rides for update to authenticated
using (auth.uid() = passenger_id)
with check (auth.uid() = passenger_id and status = 'cancelled');
create policy "rides_driver_select" on public.rides for select using (
  auth.uid() = driver_id
  or (
    status = 'searching'
    and offered_driver_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'driver' and p.is_verified and not p.is_banned)
  )
);
create policy "rides_driver_update" on public.rides for update to authenticated
using (
  auth.uid() = driver_id
  or (driver_id is null and status = 'searching' and offered_driver_id = auth.uid())
)
with check (
  auth.uid() = driver_id
  or (driver_id = auth.uid() and status = 'accepted')
);
drop policy if exists "rides_admin_select" on public.rides;
create policy "rides_admin_select" on public.rides for select to authenticated using (public.is_admin());
drop policy if exists "rides_admin_update" on public.rides;
create policy "rides_admin_update" on public.rides for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Ratings: participants can read/write their own ride rating.
create policy "ratings_participant_select" on public.ride_ratings
for select using (auth.uid() = passenger_id or auth.uid() = driver_id);
create policy "ratings_participant_insert" on public.ride_ratings
for insert with check (false);
drop policy if exists "ratings_participant_update" on public.ride_ratings;
create policy "ratings_participant_update" on public.ride_ratings
for update using (false) with check (false);

-- Realtime
alter table public.rides replica identity full;
alter table public.driver_locations replica identity full;
alter table public.driver_status replica identity full;
alter table public.messages replica identity full;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides'
    ) then alter publication supabase_realtime add table public.rides; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_locations'
    ) then alter publication supabase_realtime add table public.driver_locations; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_status'
    ) then alter publication supabase_realtime add table public.driver_status; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then alter publication supabase_realtime add table public.messages; end if;
  end if;
end $$;

-- Automatically create a profile using the role explicitly selected at signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id,email,role,full_name,phone,phone_number,is_verified,id_verified,verification_status)
  values (
    new.id,
    new.email,
    case
      when new.raw_user_meta_data->>'role' = 'driver' then 'driver'::public.user_role
      else 'passenger'::public.user_role
    end,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'phone_number', new.raw_user_meta_data->>'phone'),
    coalesce(new.raw_user_meta_data->>'phone_number', new.raw_user_meta_data->>'phone'),
    false,
    false,
    case when new.raw_user_meta_data->>'role' = 'driver' then 'not_started' else 'pending' end
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    phone_number = excluded.phone_number;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Identity documents and safety selfies are private; profile photos are public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-documents', 'driver-documents', false, 52428800, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('safety-selfies', 'safety-selfies', false, 10485760, array['image/jpeg'])
on conflict (id) do update
set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 52428800, array['image/jpeg'])
on conflict (id) do update
set public = true, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passenger-photos', 'passenger-photos', true, 10485760, array['image/jpeg'])
on conflict (id) do update
set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passenger-ids', 'passenger-ids', false, 10485760, array['image/jpeg'])
on conflict (id) do update
set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-documents', 'vehicle-documents', false, 52428800, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "driver_documents_storage_select" on storage.objects;
create policy "driver_documents_storage_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'driver-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "driver_documents_storage_insert" on storage.objects;
create policy "driver_documents_storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "driver_documents_storage_update" on storage.objects;
create policy "driver_documents_storage_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "driver_documents_storage_delete" on storage.objects;
create policy "driver_documents_storage_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'driver-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "vehicle_documents_storage_select" on storage.objects;
create policy "vehicle_documents_storage_select" on storage.objects
for select to authenticated using (
  bucket_id = 'vehicle-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
drop policy if exists "vehicle_documents_storage_insert" on storage.objects;
create policy "vehicle_documents_storage_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'vehicle-documents' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "vehicle_documents_storage_update" on storage.objects;
create policy "vehicle_documents_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'vehicle-documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'vehicle-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "vehicle_documents_storage_delete" on storage.objects;
create policy "vehicle_documents_storage_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'vehicle-documents' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "selfies_storage_select" on storage.objects;
drop policy if exists "safety_selfies_storage_select" on storage.objects;
create policy "safety_selfies_storage_select" on storage.objects
for select to authenticated using (
  bucket_id = 'safety-selfies' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "selfies_storage_insert" on storage.objects;
drop policy if exists "safety_selfies_storage_insert" on storage.objects;
create policy "safety_selfies_storage_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'safety-selfies' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "selfies_storage_update" on storage.objects;
drop policy if exists "safety_selfies_storage_update" on storage.objects;
create policy "safety_selfies_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'safety-selfies' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'safety-selfies' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "selfies_storage_delete" on storage.objects;
drop policy if exists "safety_selfies_storage_delete" on storage.objects;
create policy "safety_selfies_storage_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'safety-selfies' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_photos_storage_select" on storage.objects;
create policy "profile_photos_storage_select" on storage.objects
for select using (bucket_id = 'profile-photos');
drop policy if exists "profile_photos_storage_insert" on storage.objects;
create policy "profile_photos_storage_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "profile_photos_storage_update" on storage.objects;
create policy "profile_photos_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "profile_photos_storage_delete" on storage.objects;
create policy "profile_photos_storage_delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

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

-- IMPORTANT:
-- For production, move fare calculation and driver assignment into trusted
-- Edge Functions/RPCs so clients cannot manipulate fare/commission values.
