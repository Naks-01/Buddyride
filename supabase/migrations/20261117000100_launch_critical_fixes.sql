-- BuddyRide1 launch-critical fixes
-- Apply after the existing migrations. This migration intentionally requires
-- verified passenger identity and verified mobile numbers before account use.

create table if not exists public.sms_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  verified boolean not null default false,
  attempts integer not null default 0 check (attempts between 0 and 5),
  created_at timestamptz not null default now()
);
alter table public.sms_otps add column if not exists id uuid default gen_random_uuid();
alter table public.sms_otps add column if not exists phone text;
alter table public.sms_otps add column if not exists code_hash text;
alter table public.sms_otps add column if not exists expires_at timestamptz;
alter table public.sms_otps add column if not exists verified boolean not null default false;
alter table public.sms_otps add column if not exists attempts integer not null default 0;
alter table public.sms_otps add column if not exists created_at timestamptz not null default now();
-- Remove legacy plaintext OTP storage if the older client-created table exists.
alter table public.sms_otps drop column if exists code;
alter table public.sms_otps enable row level security;
revoke all on public.sms_otps from anon, authenticated;
grant all on public.sms_otps to service_role;
create index if not exists sms_otps_phone_created_idx on public.sms_otps(phone, created_at desc);

create table if not exists public.phone_verifications (
  phone text primary key,
  verified_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from anon, authenticated;
grant all on public.phone_verifications to service_role;

create or replace function public.require_verified_phone_on_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_phone text;
  normalized_phone text;
begin
  if new.role not in ('passenger', 'driver') then
    return new;
  end if;
  raw_phone := coalesce(nullif(btrim(new.phone_number), ''), nullif(btrim(new.phone), ''));
  if raw_phone is null then
    raise exception 'A verified mobile number is required';
  end if;
  normalized_phone := regexp_replace(raw_phone, '[[:space:]-]', '', 'g');
  if normalized_phone like '0%' then normalized_phone := '+27' || substr(normalized_phone, 2);
  elsif normalized_phone like '27%' then normalized_phone := '+' || normalized_phone;
  end if;
  if normalized_phone !~ '^\+27[0-9]{9}$' then
    raise exception 'Enter a valid South African mobile number';
  end if;
  perform 1 from public.phone_verifications
    where phone = normalized_phone
      and consumed_at is null
      and verified_at > now() - interval '15 minutes'
    for update;
  if not found then
    raise exception 'Verify your mobile number by SMS before creating your account';
  end if;
  update public.phone_verifications set consumed_at = now() where phone = normalized_phone and consumed_at is null;
  return new;
end;
$$;
revoke all on function public.require_verified_phone_on_profile_insert() from public;
drop trigger if exists require_verified_phone_on_profile_insert on public.profiles;
create trigger require_verified_phone_on_profile_insert
before insert on public.profiles
for each row execute function public.require_verified_phone_on_profile_insert();

-- Require a live selfie and both ID number + ID photo. The stored paths are
-- checked against private Storage objects; a profile URL alone is insufficient.
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
  selfie_value text;
  id_value text;
  selfie_path text;
  id_path text;
  previous_profile_update_setting text;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_method is distinct from 'id_both' then raise exception 'Both ID number and ID document are required'; end if;
  if p_id_number is null or btrim(p_id_number) = '' then raise exception 'An ID or passport number is required'; end if;
  if btrim(p_id_number) ~ '^[0-9]{13}$' and not public.is_valid_sa_id_number(btrim(p_id_number)) then
    raise exception 'Invalid South African ID number';
  end if;
  if p_id_document_url is null or btrim(p_id_document_url) = '' then raise exception 'A photo of your ID or passport is required'; end if;

  select selfie_url into selfie_value from public.profiles
    where id = caller_id and role = 'passenger' for update;
  if not found then raise exception 'Passenger account required'; end if;
  if selfie_value is null or btrim(selfie_value) = '' then raise exception 'A live selfie is required'; end if;

  if selfie_value like 'passenger-photos:%' then
    selfie_path := split_part(selfie_value, ':', 2);
  else
    selfie_path := regexp_replace(selfie_value, '^.*?/passenger-photos/', '');
  end if;
  if id_value is null then id_value := p_id_document_url; end if;
  if id_value like 'passenger-ids:%' then
    id_path := split_part(id_value, ':', 2);
  else
    id_path := regexp_replace(id_value, '^.*?/passenger-ids/', '');
  end if;
  if selfie_path = selfie_value or selfie_path = '' or id_path = id_value or id_path = '' then
    raise exception 'Verification document storage path is invalid';
  end if;
  if selfie_path not like caller_id::text || '/%' or id_path not like caller_id::text || '/%' then
    raise exception 'Verification documents must belong to your own account';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'safety-selfies' and name = selfie_path) then
    raise exception 'Selfie photo upload is missing from private storage';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'passenger-ids' and name = id_path) then
    raise exception 'ID document upload is missing from private storage';
  end if;

  previous_profile_update_setting := current_setting('buddyride.internal_profile_update', true);
  perform set_config('buddyride.internal_profile_update', 'on', true);
  update public.profiles
    set id_verified = false,
        is_verified = false,
        verification_status = 'pending_verification',
        id_number = btrim(p_id_number),
        id_document_url = p_id_document_url,
        id_verification_method = 'id_both'
    where id = caller_id;
  perform set_config('buddyride.internal_profile_update', coalesce(previous_profile_update_setting, 'off'), true);
exception when others then
  perform set_config('buddyride.internal_profile_update', coalesce(previous_profile_update_setting, 'off'), true);
  raise;
end;
$$;
revoke all on function public.verify_passenger_safety(text, text, text) from public;
grant execute on function public.verify_passenger_safety(text, text, text) to authenticated;

-- SOS reports must support the type field already written by the driver client,
-- and location fields so support can identify the last reported position.
alter table public.sos_reports add column if not exists type text;
alter table public.sos_reports add column if not exists latitude double precision;
alter table public.sos_reports add column if not exists longitude double precision;

-- Recover driver offers even when the offered driver's app has been closed.
create or replace function public.recover_expired_ride_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_row record;
  recovered integer := 0;
begin
  perform set_config('buddyride.internal_dispatch', 'on', true);
  for expired_row in
    select id from public.rides
    where status = 'searching'
      and offered_driver_id is not null
      and offer_expires_at is not null
      and offer_expires_at <= now()
    order by offer_expires_at
    limit 100
    for update skip locked
  loop
    begin
      perform public.dispatch_ride(expired_row.id);
      recovered := recovered + 1;
    exception when others then
      raise warning 'Could not recover expired BuddyRide offer %: %', expired_row.id, sqlerrm;
    end;
  end loop;
  perform set_config('buddyride.internal_dispatch', 'off', true);
  return recovered;
end;
$$;
revoke all on function public.recover_expired_ride_offers() from public, anon, authenticated;

-- Supabase commonly provides pg_cron. If it is not enabled, the migration still
-- succeeds and the operator can enable pg_cron then schedule this function.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable; expired offers require manual scheduling: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(jobid) from cron.job where jobname = 'buddyride-expired-offer-recovery';
      perform cron.schedule('buddyride-expired-offer-recovery', '* * * * *', 'select public.recover_expired_ride_offers();');
    exception when others then
      raise notice 'Could not schedule BuddyRide expired-offer recovery: %', sqlerrm;
    end;
  end if;
end;
$$;

-- A failed/expired Paystack checkout must never be treated as a paid ride.
create index if not exists rides_pending_paystack_idx
  on public.rides(passenger_id, created_at desc)
  where payment_method = 'paystack' and payment_status = 'awaiting_payment';
