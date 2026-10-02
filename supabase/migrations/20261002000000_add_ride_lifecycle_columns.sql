alter table public.rides
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists status text,
  add column if not exists driver_id uuid,
  add column if not exists passenger_id uuid,
  add column if not exists pickup_lng double precision,
  add column if not exists pickup_lat double precision,
  add column if not exists dropoff_lng double precision,
  add column if not exists dropoff_lat double precision,
  add column if not exists arrived_at timestamptz,
  add column if not exists cancelled_at timestamptz;