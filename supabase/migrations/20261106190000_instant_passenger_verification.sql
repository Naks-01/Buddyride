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
    if new.role::text in ('passenger', 'rider') then
      new.is_verified := true;
      new.id_verified := false;
      new.verification_status := 'verified';
    else
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
    and new.role is not distinct from old.role
    and new.is_verified is true
    and new.verification_status = 'verified'
    and new.id_verified is not distinct from old.id_verified
    and new.is_banned is not distinct from old.is_banned
    and new.wallet_balance is not distinct from old.wallet_balance
    and new.trips_completed is not distinct from old.trips_completed
    and new.rating is not distinct from old.rating
    and new.car_model is not distinct from old.car_model
    and new.car_plate is not distinct from old.car_plate
    and new.car_color is not distinct from old.car_color then
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

  if new.is_online and (new.role::text <> 'driver' or not new.is_verified or new.is_banned) then
    raise exception 'Only a verified, active driver can go online';
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, role, full_name, phone, phone_number, is_verified, verification_status
  )
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
    case when new.raw_user_meta_data->>'role' = 'driver' then false else true end,
    case when new.raw_user_meta_data->>'role' = 'driver' then 'not_started' else 'verified' end
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    phone_number = excluded.phone_number,
    is_verified = excluded.is_verified,
    verification_status = excluded.verification_status;
  return new;
end;
$$;

update public.profiles
set verification_status = 'verified',
    is_verified = true
where role::text in ('passenger', 'rider')
  and (verification_status is null or verification_status = 'pending_verification');

drop policy if exists "rides_passenger_insert" on public.rides;
create policy "rides_passenger_insert" on public.rides for insert with check (
  public.is_admin()
  or (
    auth.uid() = passenger_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('passenger', 'rider')
        and p.is_verified = true
        and p.verification_status in ('verified', 'approved')
        and not p.is_banned
    )
  )
);

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
      or caller_profile.role::text not in ('passenger', 'rider') then
      raise exception 'Only a passenger can request a ride';
    end if;
    if caller_profile.is_verified is not true
      or caller_profile.verification_status not in ('verified', 'approved')
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
