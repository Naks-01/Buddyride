alter table public.driver_documents
  add column if not exists document_type text,
  add column if not exists document_url text,
  add column if not exists document_date date,
  add column if not exists expiry_date date;

create or replace function public.driver_document_type_slug(p_document_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(btrim(coalesce(p_document_type, '')))
    when 'sa id' then 'sa_id'
    when 'sa_id' then 'sa_id'
    when 'drivers license' then 'drivers_license'
    when 'driver''s license' then 'drivers_license'
    when 'drivers licence' then 'drivers_license'
    when 'drivers_license' then 'drivers_license'
    when 'pdp / prdp' then 'prdp'
    when 'pdp' then 'prdp'
    when 'prdp' then 'prdp'
    when 'profile photo' then 'profile_photo'
    when 'profile_photo' then 'profile_photo'
    when 'selfie (face verification)' then 'selfie'
    when 'selfie' then 'selfie'
    when 'vehicle registration papers' then 'vehicle_registration'
    when 'vehicle registration' then 'vehicle_registration'
    when 'vehicle_registration' then 'vehicle_registration'
    when 'licence disc' then 'license_disc'
    when 'license disc' then 'license_disc'
    when 'license_disc' then 'license_disc'
    when 'vehicle photo 1' then 'vehicle_photo_1'
    when 'vehicle_photos_1' then 'vehicle_photo_1'
    when 'car_photo_1' then 'vehicle_photo_1'
    when 'vehicle photo 2' then 'vehicle_photo_2'
    when 'vehicle_photos_2' then 'vehicle_photo_2'
    when 'car_photo_2' then 'vehicle_photo_2'
    when 'vehicle photo 3' then 'vehicle_photo_3'
    when 'vehicle_photos_3' then 'vehicle_photo_3'
    when 'car_photo_3' then 'vehicle_photo_3'
    when 'vehicle photo 4' then 'vehicle_photo_4'
    when 'vehicle_photos_4' then 'vehicle_photo_4'
    when 'car_photo_4' then 'vehicle_photo_4'
    when 'vehicle interior photo 1' then 'vehicle_interior_photo_1'
    when 'vehicle_interior_photo_1' then 'vehicle_interior_photo_1'
    when 'vehicle interior photo 2' then 'vehicle_interior_photo_2'
    when 'vehicle_interior_photo_2' then 'vehicle_interior_photo_2'
    when 'huru criminal check' then 'huru_criminal_check'
    when 'huru check' then 'huru_criminal_check'
    when 'huru_check' then 'huru_criminal_check'
    when 'huru_criminal_check' then 'huru_criminal_check'
    when 'vehicle inspection report' then 'vehicle_inspection_report'
    when 'vehicle_inspection_report' then 'vehicle_inspection_report'
    else lower(btrim(coalesce(p_document_type, '')))
  end;
$$;

create or replace function public.driver_document_type_label(p_doc_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case public.driver_document_type_slug(p_doc_type)
    when 'sa_id' then 'SA ID'
    when 'drivers_license' then 'Drivers License'
    when 'prdp' then 'PDP / PrDP'
    when 'profile_photo' then 'Profile Photo'
    when 'selfie' then 'Selfie (face verification)'
    when 'vehicle_registration' then 'Vehicle Registration Papers'
    when 'license_disc' then 'Licence Disc'
    when 'vehicle_photo_1' then 'Vehicle Photo 1'
    when 'vehicle_photo_2' then 'Vehicle Photo 2'
    when 'vehicle_photo_3' then 'Vehicle Photo 3'
    when 'vehicle_photo_4' then 'Vehicle Photo 4'
    when 'vehicle_interior_photo_1' then 'Vehicle Interior Photo 1'
    when 'vehicle_interior_photo_2' then 'Vehicle Interior Photo 2'
    when 'huru_criminal_check' then 'Huru Criminal Check'
    when 'vehicle_inspection_report' then 'Vehicle Inspection Report'
    else null
  end;
$$;

create or replace function public.sync_driver_document_names_and_urls()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.document_type is not null then
    new.doc_type := public.driver_document_type_slug(new.document_type);
  elsif new.doc_type is not null then
    new.document_type := public.driver_document_type_label(new.doc_type);
  end if;

  if new.document_url is not null then
    new.file_url := new.document_url;
  elsif new.file_url is not null then
    new.document_url := new.file_url;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_driver_document_names_and_urls on public.driver_documents;
create trigger sync_driver_document_names_and_urls
before insert or update on public.driver_documents
for each row execute function public.sync_driver_document_names_and_urls();

update public.driver_documents
set document_type = public.driver_document_type_label(doc_type),
    document_url = file_url
where document_type is distinct from public.driver_document_type_label(doc_type)
   or document_url is distinct from file_url;

delete from public.driver_documents
where coalesce(document_type, '') ilike '%police%'
   or coalesce(doc_type, '') ilike '%police%'
   or coalesce(document_type, '') ilike '%holding%'
   or coalesce(doc_type, '') ilike '%holding%'
   or replace(coalesce(document_type, ''), '_', ' ') ilike '%selfie with id%'
   or replace(coalesce(doc_type, ''), '_', ' ') ilike '%selfie with id%';

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
      and doc_type in (
        'sa_id', 'drivers_license', 'prdp', 'profile_photo', 'selfie',
        'vehicle_registration', 'license_disc', 'vehicle_photo_1', 'vehicle_photo_2',
        'vehicle_photo_3', 'vehicle_photo_4', 'vehicle_interior_photo_1',
        'vehicle_interior_photo_2', 'huru_criminal_check', 'vehicle_inspection_report'
      )
      and nullif(btrim(file_url), '') is not null
    group by driver_id
    having count(distinct doc_type) = 15
      and bool_and(document_date is not null)
      and bool_and(expiry_date is not null and expiry_date >= current_date)
        filter (where doc_type in (
          'drivers_license', 'prdp', 'license_disc',
          'huru_criminal_check', 'vehicle_inspection_report'
        ))
      and bool_and(status <> 'REJECTED')
  ) then
    raise exception 'Upload all 15 required documents with document dates and valid expiry dates';
  end if;

  perform set_config('buddyride.internal_profile_update', 'on', true);
  update public.profiles
  set verification_status = 'pending_verification'
  where id = caller_id;
end;
$$;

revoke all on function public.submit_driver_documents_for_review() from public;
grant execute on function public.submit_driver_documents_for_review() to authenticated;
