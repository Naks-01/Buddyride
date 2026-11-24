-- BuddyRide bundle-only commercial model.
-- Drivers retain 100% of ride fares. Paystack is exclusively for bundle purchases.
-- Apply after the existing BuddyRide migrations. Requires profiles, rides, is_admin().

create table if not exists public.bundle_prices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  label text not null,
  category text not null default 'buddy_plus' check (category in ('buddy_lite','buddy_plus','buddy_max')),
  trips integer not null check (trips between 1 and 10000),
  price numeric(10,2) not null check (price > 0),
  active boolean not null default true,
  popular boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bundle_prices add column if not exists name text;
alter table public.bundle_prices add column if not exists label text;
alter table public.bundle_prices add column if not exists category text default 'buddy_plus';
alter table public.bundle_prices add column if not exists active boolean not null default true;
alter table public.bundle_prices add column if not exists popular boolean not null default false;
update public.bundle_prices set name=coalesce(nullif(name,''),nullif(label,''),trips::text || ' trips'),
  label=coalesce(nullif(label,''),nullif(name,''),trips::text || ' trips'),
  category=case when category in ('buddy_lite','buddy_plus','buddy_max') then category else 'buddy_plus' end;
alter table public.bundle_prices alter column name set not null;
alter table public.bundle_prices alter column label set not null;
alter table public.bundle_prices alter column category set not null;

-- Keep the legacy price column used by the admin finance screen, and amount used by the payment ledger.
create table if not exists public.bundle_purchases (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  bundle_price_id text not null,
  category text not null default 'buddy_plus',
  bundle_name text not null default 'Bundle',
  trips integer not null default 1,
  amount numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  currency text not null default 'ZAR',
  paystack_reference text,
  status text not null default 'pending',
  paystack_transaction_id bigint,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  activated_bundle_id uuid
);
alter table public.bundle_purchases add column if not exists bundle_price_id text;
alter table public.bundle_purchases add column if not exists category text default 'buddy_plus';
alter table public.bundle_purchases add column if not exists bundle_name text default 'Legacy bundle';
alter table public.bundle_purchases add column if not exists trips integer default 1;
alter table public.bundle_purchases add column if not exists amount numeric(10,2);
alter table public.bundle_purchases add column if not exists price numeric(10,2);
alter table public.bundle_purchases add column if not exists currency text default 'ZAR';
alter table public.bundle_purchases add column if not exists paystack_reference text;
alter table public.bundle_purchases add column if not exists status text default 'paid';
alter table public.bundle_purchases add column if not exists paystack_transaction_id bigint;
alter table public.bundle_purchases add column if not exists paid_at timestamptz;
alter table public.bundle_purchases add column if not exists created_at timestamptz not null default now();
alter table public.bundle_purchases add column if not exists activated_bundle_id uuid;
alter table public.bundle_purchases alter column bundle_price_id type text using bundle_price_id::text;
update public.bundle_purchases set amount=coalesce(amount,price,0), price=coalesce(price,amount,0),
  category=case when category in ('buddy_lite','buddy_plus','buddy_max') then category else 'buddy_plus' end,
  bundle_name=coalesce(nullif(bundle_name,''),'Legacy bundle'), trips=greatest(coalesce(trips,1),1), currency='ZAR',
  status=case when status in ('pending','paid','failed','abandoned','refunded') then status else 'paid' end;
alter table public.bundle_purchases alter column status set default 'pending';
create unique index if not exists bundle_purchases_paystack_reference_uidx on public.bundle_purchases(paystack_reference) where paystack_reference is not null;

create table if not exists public.driver_bundles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  purchase_id uuid,
  bundle_id text,
  category text not null default 'buddy_plus',
  trips_total integer not null default 1,
  trips_remaining integer not null default 0,
  amount_paid numeric(10,2) not null default 0,
  status text not null default 'active',
  payment_reference text,
  expires_at timestamptz not null default (now() + interval '31 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.driver_bundles add column if not exists purchase_id uuid;
alter table public.driver_bundles add column if not exists bundle_id text;
alter table public.driver_bundles add column if not exists category text default 'buddy_plus';
alter table public.driver_bundles add column if not exists trips_total integer default 1;
alter table public.driver_bundles add column if not exists trips_remaining integer default 0;
alter table public.driver_bundles add column if not exists amount_paid numeric(10,2) default 0;
alter table public.driver_bundles add column if not exists status text default 'active';
alter table public.driver_bundles add column if not exists payment_reference text;
alter table public.driver_bundles add column if not exists expires_at timestamptz default (now()+interval '31 days');
alter table public.driver_bundles add column if not exists created_at timestamptz not null default now();
alter table public.driver_bundles add column if not exists updated_at timestamptz not null default now();
alter table public.driver_bundles alter column bundle_id type text using bundle_id::text;
update public.driver_bundles set category=case when category in ('buddy_lite','buddy_plus','buddy_max') then category else 'buddy_plus' end,
  trips_total=greatest(coalesce(trips_total,1),1), trips_remaining=greatest(coalesce(trips_remaining,0),0),
  amount_paid=coalesce(amount_paid,0), status=coalesce(status,'active'), expires_at=coalesce(expires_at,now()+interval '31 days');
create unique index if not exists driver_bundles_purchase_uidx on public.driver_bundles(purchase_id) where purchase_id is not null;

-- Invalidate browser-simulated bundle credits from the old demo purchase path.
update public.driver_bundles set trips_remaining=0, status='active', updated_at=now()
  where payment_reference like 'sim_%' or payment_reference like 'sim-%';
update public.bundle_purchases set status='failed'
  where paystack_reference like 'sim_%' or paystack_reference like 'sim-%';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='bundle_purchases_activated_bundle_fk') then
    alter table public.bundle_purchases add constraint bundle_purchases_activated_bundle_fk
      foreign key (activated_bundle_id) references public.driver_bundles(id) on delete set null;
  end if;
end $$;

create index if not exists driver_bundles_active_driver_idx
  on public.driver_bundles(driver_id, category, expires_at, created_at)
  where status = 'active' and trips_remaining > 0;
create index if not exists bundle_purchases_driver_created_idx
  on public.bundle_purchases(driver_id, created_at desc);

-- Clear legacy permissive policies on the three bundle tables before applying the strict policy set.
do $$ declare pol record; begin
  for pol in select tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('bundle_prices','bundle_purchases','driver_bundles')
  loop execute format('drop policy if exists %I on public.%I',pol.policyname,pol.tablename); end loop;
end $$;

alter table public.bundle_prices enable row level security;
alter table public.bundle_purchases enable row level security;
alter table public.driver_bundles enable row level security;

revoke all on public.bundle_prices, public.bundle_purchases, public.driver_bundles from anon;
revoke insert, update, delete on public.bundle_purchases, public.driver_bundles from authenticated;
grant select on public.bundle_prices, public.bundle_purchases, public.driver_bundles to authenticated;
grant insert, update, delete on public.bundle_prices to authenticated;
grant all on public.bundle_prices, public.bundle_purchases, public.driver_bundles to service_role;

drop policy if exists bundle_prices_read_active on public.bundle_prices;
create policy bundle_prices_read_active on public.bundle_prices for select to authenticated
  using (active or public.is_admin());
drop policy if exists bundle_prices_admin_manage on public.bundle_prices;
create policy bundle_prices_admin_manage on public.bundle_prices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists bundle_purchases_driver_read on public.bundle_purchases;
create policy bundle_purchases_driver_read on public.bundle_purchases for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());
drop policy if exists driver_bundles_driver_read on public.driver_bundles;
create policy driver_bundles_driver_read on public.driver_bundles for select to authenticated
  using (driver_id = auth.uid() or public.is_admin());

-- Only service_role Edge Functions can create purchases or activate purchased credits.
-- This function is deliberately not executable by authenticated clients.
create or replace function public.activate_paid_bundle_purchase(p_reference text, p_transaction_id bigint)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  purchase public.bundle_purchases%rowtype;
  new_bundle_id uuid;
begin
  select * into purchase from public.bundle_purchases
    where paystack_reference = p_reference for update;
  if not found then raise exception 'Bundle purchase reference not found'; end if;
  if purchase.status = 'paid' then
    if purchase.paystack_transaction_id is distinct from p_transaction_id then
      raise exception 'Reference already paid with a different transaction';
    end if;
    return purchase.activated_bundle_id;
  end if;
  if purchase.status <> 'pending' then raise exception 'Bundle purchase is not pending'; end if;

  update public.bundle_purchases set status = 'paid', paid_at = now(),
    paystack_transaction_id = p_transaction_id
    where id = purchase.id;

  insert into public.driver_bundles (
    driver_id, purchase_id, bundle_id, category, trips_total, trips_remaining,
    amount_paid, status, payment_reference, expires_at
  ) values (
    purchase.driver_id, purchase.id, purchase.bundle_price_id, purchase.category,
    purchase.trips, purchase.trips, purchase.amount, 'active', purchase.paystack_reference,
    now() + interval '31 days'
  ) returning id into new_bundle_id;

  update public.bundle_purchases set activated_bundle_id = new_bundle_id where id = purchase.id;
  return new_bundle_id;
end;
$$;
revoke all on function public.activate_paid_bundle_purchase(text,bigint) from public, anon, authenticated;
grant execute on function public.activate_paid_bundle_purchase(text,bigint) to service_role;

-- Atomic trip acceptance and credit reservation/consumption. A driver cannot
-- accept a ride without approval, an active matching bundle and enough credits.
create or replace function public.accept_ride_with_bundle(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path = public
as $$
declare
  driver_uuid uuid := auth.uid();
  driver_profile public.profiles%rowtype;
  ride_row public.rides%rowtype;
  needed integer;
  remaining integer;
  bundle_row record;
  updated_ride public.rides%rowtype;
begin
  if driver_uuid is null then raise exception 'Authentication required'; end if;
  select * into driver_profile from public.profiles where id = driver_uuid for update;
  if not found or driver_profile.role <> 'driver' then raise exception 'Driver account required'; end if;
  if driver_profile.is_banned or driver_profile.is_verified is not true
    or driver_profile.verification_status not in ('approved','verified') then
    raise exception 'Driver is not approved to accept trips';
  end if;
  if driver_profile.is_online is not true then raise exception 'Go online before accepting a trip'; end if;
  if exists (select 1 from public.rides where driver_id=driver_uuid and status in ('accepted','driver_arriving','driver_arrived','arrived','picked_up','en_route','in_progress')) then
    raise exception 'Finish or cancel your current trip before accepting another';
  end if;

  select * into ride_row from public.rides where id = p_ride_id for update;
  if not found or ride_row.status <> 'searching' or ride_row.driver_id is not null then
    raise exception 'Ride is no longer available';
  end if;
  if ride_row.offered_driver_id is not null and ride_row.offered_driver_id <> driver_uuid then
    raise exception 'This ride offer belongs to another driver';
  end if;
  if coalesce(ride_row.ride_category, 'buddy_plus') not in ('buddy_lite','buddy_plus','buddy_max') then
    raise exception 'Ride category is invalid';
  end if;
  needed := case when coalesce(ride_row.distance_km,0) >= 100 then 2 else 1 end;
  select coalesce(sum(trips_remaining),0) into remaining from public.driver_bundles
    where driver_id = driver_uuid and category = ride_row.ride_category
      and status = 'active' and expires_at > now() and trips_remaining > 0;
  if remaining < needed then raise exception 'An active bundle with enough credits for this ride is required'; end if;

  -- Credits are consumed by the complete_ride transaction, not at acceptance.

  perform set_config('buddyride.internal_ride_update','on',true);
  update public.rides set driver_id = driver_uuid, status = 'accepted',
    accepted_at = now(), offered_driver_id = null, offer_expires_at = null
    where id = p_ride_id and status = 'searching' and driver_id is null
    returning * into updated_ride;
  if not found then raise exception 'Ride was accepted by another driver'; end if;
  update public.profiles set is_online = false where id = driver_uuid;
  update public.driver_status set is_online = false, updated_at = now() where driver_id = driver_uuid;
  return updated_ride;
end;
$$;
revoke all on function public.accept_ride_with_bundle(uuid) from public, anon;
grant execute on function public.accept_ride_with_bundle(uuid) to authenticated;

-- Bundle prices are deliberately not seeded with made-up pricing. Admin must
-- enter approved commercial prices in Admin Settings or insert them below.

-- Storage buckets used by the uploaded app. Identity and KYC material is private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('driver-documents','driver-documents',false,52428800,array['image/jpeg','image/png','image/webp','application/pdf']),
 ('vehicle-documents','vehicle-documents',false,52428800,array['image/jpeg','image/png','image/webp','application/pdf']),
 ('safety-selfies','safety-selfies',false,10485760,array['image/jpeg','image/png','image/webp']),
 ('passenger-ids','passenger-ids',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']),
 ('profile-photos','profile-photos',true,10485760,array['image/jpeg','image/png','image/webp']),
 ('passenger-photos','passenger-photos',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Remove all previous policies for these buckets to avoid permissive policy ORs.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
    and (qual ilike '%driver-documents%' or with_check ilike '%driver-documents%'
      or qual ilike '%vehicle-documents%' or with_check ilike '%vehicle-documents%'
      or qual ilike '%safety-selfies%' or with_check ilike '%safety-selfies%'
      or qual ilike '%passenger-ids%' or with_check ilike '%passenger-ids%'
      or qual ilike '%profile-photos%' or with_check ilike '%profile-photos%'
      or qual ilike '%passenger-photos%' or with_check ilike '%passenger-photos%')
  loop execute format('drop policy if exists %I on storage.objects',p.policyname); end loop;
end $$;

drop policy if exists br_driver_docs_select on storage.objects;
drop policy if exists br_driver_docs_insert on storage.objects;
drop policy if exists br_driver_docs_update on storage.objects;
drop policy if exists br_driver_docs_delete on storage.objects;
drop policy if exists br_vehicle_docs_select on storage.objects;
drop policy if exists br_vehicle_docs_insert on storage.objects;
drop policy if exists br_vehicle_docs_update on storage.objects;
drop policy if exists br_vehicle_docs_delete on storage.objects;
drop policy if exists br_selfies_select on storage.objects;
drop policy if exists br_selfies_insert on storage.objects;
drop policy if exists br_selfies_update on storage.objects;
drop policy if exists br_selfies_delete on storage.objects;
drop policy if exists br_passenger_ids_select on storage.objects;
drop policy if exists br_passenger_ids_insert on storage.objects;
drop policy if exists br_passenger_ids_update on storage.objects;
drop policy if exists br_passenger_ids_delete on storage.objects;
drop policy if exists br_profile_photos_public_read on storage.objects;
drop policy if exists br_profile_photos_insert on storage.objects;
drop policy if exists br_profile_photos_update on storage.objects;
drop policy if exists br_profile_photos_delete on storage.objects;
drop policy if exists br_passenger_photos_public_read on storage.objects;
drop policy if exists br_passenger_photos_insert on storage.objects;
drop policy if exists br_passenger_photos_update on storage.objects;
drop policy if exists br_passenger_photos_delete on storage.objects;

-- Private driver KYC files: owner uploads/reads; admins read; owner cannot overwrite or delete reviewed files.
create policy br_driver_docs_select on storage.objects for select to authenticated using
 (bucket_id='driver-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy br_driver_docs_insert on storage.objects for insert to authenticated with check
 (bucket_id='driver-documents' and (storage.foldername(name))[1]=auth.uid()::text);
-- No owner UPDATE policy for private identity/KYC files: uploads use unique immutable paths.
-- br_driver_docs_update intentionally not recreated.
create policy br_driver_docs_delete on storage.objects for delete to authenticated using
 (bucket_id='driver-documents' and public.is_admin());

create policy br_vehicle_docs_select on storage.objects for select to authenticated using
 (bucket_id='vehicle-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy br_vehicle_docs_insert on storage.objects for insert to authenticated with check
 (bucket_id='vehicle-documents' and (storage.foldername(name))[1]=auth.uid()::text);
-- No owner UPDATE policy for private identity/KYC files: uploads use unique immutable paths.
-- br_vehicle_docs_update intentionally not recreated.
create policy br_vehicle_docs_delete on storage.objects for delete to authenticated using
 (bucket_id='vehicle-documents' and public.is_admin());

create policy br_selfies_select on storage.objects for select to authenticated using
 (bucket_id='safety-selfies' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy br_selfies_insert on storage.objects for insert to authenticated with check
 (bucket_id='safety-selfies' and (storage.foldername(name))[1]=auth.uid()::text);
-- No owner UPDATE policy for private identity/KYC files: uploads use unique immutable paths.
-- br_selfies_update intentionally not recreated.
create policy br_selfies_delete on storage.objects for delete to authenticated using
 (bucket_id='safety-selfies' and public.is_admin());

create policy br_passenger_ids_select on storage.objects for select to authenticated using
 (bucket_id='passenger-ids' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy br_passenger_ids_insert on storage.objects for insert to authenticated with check
 (bucket_id='passenger-ids' and (storage.foldername(name))[1]=auth.uid()::text);
-- No owner UPDATE policy for private identity/KYC files: uploads use unique immutable paths.
-- br_passenger_ids_update intentionally not recreated.
create policy br_passenger_ids_delete on storage.objects for delete to authenticated using
 (bucket_id='passenger-ids' and public.is_admin());

-- Public avatar buckets only expose public-read; writes remain owner-folder scoped.
create policy br_profile_photos_public_read on storage.objects for select to public using (bucket_id='profile-photos');
create policy br_profile_photos_insert on storage.objects for insert to authenticated with check
 (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy br_profile_photos_update on storage.objects for update to authenticated using
 (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check
 (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy br_profile_photos_delete on storage.objects for delete to authenticated using
 (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create policy br_passenger_photos_public_read on storage.objects for select to public using (bucket_id='passenger-photos');
create policy br_passenger_photos_insert on storage.objects for insert to authenticated with check
 (bucket_id='passenger-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy br_passenger_photos_update on storage.objects for update to authenticated using
 (bucket_id='passenger-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check
 (bucket_id='passenger-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy br_passenger_photos_delete on storage.objects for delete to authenticated using
 (bucket_id='passenger-photos' and (storage.foldername(name))[1]=auth.uid()::text);

-- Remove commission from all live fare calculation settings. Existing historical
-- columns remain for compatibility, but every new trip records zero commission.
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid='public.app_settings'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%commission%'
  loop execute format('alter table public.app_settings drop constraint %I',c.conname); end loop;
end $$;
alter table public.app_settings alter column commission set default 0;
update public.app_settings set commission=0;

-- Any legacy fare_rules commission field is hard-set to zero.
do $$ begin
  if to_regclass('public.fare_rules') is not null then
    execute 'update public.fare_rules set commission_percent=0 where commission_percent is distinct from 0';
  end if;
end $$;

create or replace function public.save_fare_settings(p_categories jsonb, p_commission numeric default 0)
returns void language plpgsql security definer set search_path=public
as $$
declare item jsonb; changed integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_commission is distinct from 0 or jsonb_typeof(p_categories)<>'array' or jsonb_array_length(p_categories)=0 then
    raise exception 'Commission is disabled; provide valid fare categories and a zero commission';
  end if;
  for item in select value from jsonb_array_elements(p_categories) loop
    update public.fare_categories set label=item->>'label',base_fare=(item->>'base_fare')::numeric,
      per_km=(item->>'per_km')::numeric,per_min=(item->>'per_min')::numeric,
      min_fare=(item->>'min_fare')::numeric,max_fare=(item->>'max_fare')::numeric,
      active=(item->>'active')::boolean where id=item->>'id';
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'Unknown fare category: %',item->>'id'; end if;
  end loop;
  update public.app_settings set commission=0,updated_at=now() where id=1;
end $$;
revoke all on function public.save_fare_settings(jsonb,numeric) from public;
grant execute on function public.save_fare_settings(jsonb,numeric) to authenticated;

-- Bundle ledger is the sole source of BuddyRide platform revenue.

-- Complete a trip and consume its bundle credits exactly once. No fare split:
-- the driver's recorded earnings equal the full fare and BuddyRide commission is zero.
drop function if exists public.complete_ride(uuid);
create function public.complete_ride(p_ride_id uuid)
returns public.rides language plpgsql security definer set search_path=public
as $$
declare
  caller uuid := auth.uid();
  r public.rides%rowtype;
  needed integer;
  available integer;
  b record;
  take_count integer;
  result public.rides%rowtype;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  select * into r from public.rides where id=p_ride_id for update;
  if not found or r.driver_id is distinct from caller then raise exception 'Trip not found for this driver'; end if;
  if r.status in ('completed','rated') then return r; end if;
  if r.status not in ('picked_up','in_progress','en_route') then raise exception 'Trip must be in progress before completion'; end if;
  needed := case when coalesce(r.distance_km,0)>=100 then 2 else 1 end;
  select coalesce(sum(trips_remaining),0) into available from public.driver_bundles
    where driver_id=caller and category=r.ride_category and status='active'
      and expires_at>now() and trips_remaining>0;
  if available<needed then raise exception 'Insufficient active bundle credits'; end if;
  for b in select id,trips_remaining from public.driver_bundles
    where driver_id=caller and category=r.ride_category and status='active'
      and expires_at>now() and trips_remaining>0
    order by expires_at,created_at for update
  loop
    exit when needed<=0;
    take_count:=least(needed,b.trips_remaining);
    update public.driver_bundles set trips_remaining=trips_remaining-take_count,
      status='active',
      updated_at=now() where id=b.id;
    needed:=needed-take_count;
  end loop;
  perform set_config('buddyride.internal_ride_update','on',true);
  update public.rides set status='completed',completed_at=coalesce(completed_at,now()),
    driver_earnings=total_fare,buddyride_commission=0
    where id=p_ride_id returning * into result;
  update public.profiles set trips_completed=trips_completed+1 where id=caller;
  return result;
end;
$$;
revoke all on function public.complete_ride(uuid) from public, anon;
grant execute on function public.complete_ride(uuid) to authenticated;

-- Prevent Paystack from being used for passenger rides; it is exclusively a bundle gateway.
create or replace function public.enforce_cash_only_ride_payment()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.payment_method is distinct from 'cash' then
    raise exception 'Passenger trip payments are cash-only. Paystack is reserved for driver bundle purchases.';
  end if;
  return new;
end $$;
drop trigger if exists enforce_cash_only_ride_payment on public.rides;
create trigger enforce_cash_only_ride_payment
before insert or update of payment_method on public.rides
for each row execute function public.enforce_cash_only_ride_payment();
