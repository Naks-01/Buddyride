-- Reverse the instant-verification behavior introduced by
-- 20261106190000_instant_passenger_verification.sql. Keep the historical
-- migration record; this migration reverses its effects for future requests.

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles
  add constraint profiles_verification_status_check
  check (verification_status in (
    'not_started', 'pending', 'pending_verification', 'approved', 'rejected', 'verified'
  ));
alter table public.profiles alter column verification_status set default 'pending';

-- Revoke only the instant approvals that have no admin-recorded ID approval.
update public.profiles
set is_verified = false,
    verification_status = 'pending'
where role::text in ('passenger', 'rider')
  and verification_status = 'verified'
  and id_verified is not true;

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
declare
  new_role public.user_role;
begin
  new_role := case
    when new.raw_user_meta_data->>'role' = 'driver' then 'driver'::public.user_role
    else 'passenger'::public.user_role
  end;

  insert into public.profiles (
    id, email, role, full_name, phone, phone_number, is_verified, id_verified, verification_status
  )
  values (
    new.id,
    new.email,
    new_role,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'phone_number', new.raw_user_meta_data->>'phone'),
    coalesce(new.raw_user_meta_data->>'phone_number', new.raw_user_meta_data->>'phone'),
    false,
    false,
    case when new_role = 'driver' then 'not_started' else 'pending' end
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
    and role::text in ('passenger', 'rider')
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

drop policy if exists "rides_passenger_insert" on public.rides;
create policy "rides_passenger_insert" on public.rides
for insert with check (
  public.is_admin()
  or (
    auth.uid() = passenger_id
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('passenger', 'rider')
        and p.is_verified is true
        and p.id_verified is true
        and p.verification_status = 'verified'
        and p.is_banned is false
    )
  )
);
