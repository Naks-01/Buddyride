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
alter table public.rides add column if not exists fare_quote_id uuid references public.fare_quotes(id);

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
