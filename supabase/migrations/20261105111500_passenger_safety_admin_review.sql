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

drop trigger if exists sync_passenger_verification_status on public.passenger_documents;

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
    if new.passenger_id <> auth.uid()
      or caller_profile.role <> 'passenger'
      or (
        not caller_profile.is_verified
        and caller_profile.verification_status <> 'pending_verification'
      )
      or caller_profile.is_banned
      or new.status not in ('searching','awaiting_payment')
      or new.driver_id is not null then
      raise exception 'Only an approved or pending passenger can request a ride';
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
