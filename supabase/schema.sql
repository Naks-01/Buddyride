-- BUDDYRIDE1 CLEAN DATABASE
-- Run this in Supabase SQL Editor on a NEW project.

create extension if not exists pgcrypto;

create type public.user_role as enum ('passenger','driver','admin');
create type public.ride_status as enum (
  'searching','accepted','driver_arriving','driver_arrived',
  'in_progress','completed','cancelled'
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role public.user_role not null default 'passenger',
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);

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
  driver_id uuid references public.profiles(id) on delete set null,
  pickup_address text not null,
  dropoff_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  distance_km numeric(10,2) not null default 0,
  fare numeric(10,2) not null default 0,
  booking_fee numeric(10,2) not null default 0,
  total_fare numeric(10,2) not null default 0,
  driver_earnings numeric(10,2) not null default 0,
  buddyride_commission numeric(10,2) not null default 0,
  status public.ride_status not null default 'searching',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
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

create index if not exists rides_status_idx on public.rides(status);
create index if not exists rides_passenger_idx on public.rides(passenger_id);
create index if not exists rides_driver_idx on public.rides(driver_id);
create index if not exists driver_locations_online_idx on public.driver_locations(is_online);

alter table public.profiles enable row level security;
alter table public.driver_locations enable row level security;
alter table public.vehicles enable row level security;
alter table public.rides enable row level security;
alter table public.ride_ratings enable row level security;

-- Profiles: users can read/update their own profile.
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Drivers need their own location row; passengers can read online driver locations.
create policy "driver_locations_own_write" on public.driver_locations
for all using (auth.uid() = driver_id) with check (auth.uid() = driver_id);
create policy "driver_locations_read_authenticated" on public.driver_locations
for select using (auth.uid() is not null);

-- Vehicles: driver owns their vehicle.
create policy "vehicles_own" on public.vehicles
for all using (auth.uid() = driver_id) with check (auth.uid() = driver_id);

-- Rides: passengers see their rides; drivers see searching rides and their accepted rides.
create policy "rides_passenger_select" on public.rides for select using (auth.uid() = passenger_id);
create policy "rides_passenger_insert" on public.rides for insert with check (auth.uid() = passenger_id);
create policy "rides_passenger_update" on public.rides for update using (auth.uid() = passenger_id);
create policy "rides_driver_select" on public.rides for select using (auth.uid() = driver_id or status = 'searching');
create policy "rides_driver_update" on public.rides for update using (auth.uid() = driver_id or (driver_id is null and status = 'searching'));

-- Ratings: participants can read/write their own ride rating.
create policy "ratings_participant_select" on public.ride_ratings
for select using (auth.uid() = passenger_id or auth.uid() = driver_id);
create policy "ratings_participant_insert" on public.ride_ratings
for insert with check (auth.uid() = passenger_id or auth.uid() = driver_id);

-- Realtime
alter table public.rides replica identity full;
alter table public.driver_locations replica identity full;
alter publication supabase_realtime add table public.rides;
alter publication supabase_realtime add table public.driver_locations;

-- Automatically create a passenger profile after signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id,email,role,full_name,phone)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'passenger'),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- IMPORTANT:
-- For production, move fare calculation and driver assignment into trusted
-- Edge Functions/RPCs so clients cannot manipulate fare/commission values.
