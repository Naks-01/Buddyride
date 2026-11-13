alter table public.profiles add column if not exists bank_name text;
alter table public.profiles add column if not exists bank_account_holder text;
alter table public.profiles add column if not exists bank_account_number text;
alter table public.profiles add column if not exists bank_branch_code text;

alter table public.driver_documents add column if not exists expiry_date date;
alter table public.driver_documents add column if not exists prdp_number text;
alter table public.driver_documents add column if not exists document_hash text;

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
    select 1
    from public.profiles
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
