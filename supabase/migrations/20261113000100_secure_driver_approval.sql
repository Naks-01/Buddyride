-- Secure driver approval: only an authenticated BuddyRide admin can approve,
-- and approval is blocked until all 15 required documents are individually approved.
create or replace function public.admin_set_driver_verification(
  p_driver_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  required_types text[] := array[
    'sa_id', 'drivers_license', 'prdp', 'profile_photo', 'selfie',
    'vehicle_registration', 'license_disc', 'vehicle_photo_1',
    'vehicle_photo_2', 'vehicle_photo_3', 'vehicle_photo_4',
    'vehicle_interior_photo_1', 'vehicle_interior_photo_2',
    'huru_criminal_check', 'vehicle_inspection_report'
  ];
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_driver_id and role = 'driver'
  ) then
    raise exception 'Driver profile not found';
  end if;

  if p_approve then
    if (
      select count(distinct doc_type)
      from public.driver_documents
      where driver_id = p_driver_id
        and doc_type = any(required_types)
        and status = 'APPROVED'
        and nullif(btrim(file_url), '') is not null
        and (
          doc_type not in (
            'drivers_license', 'prdp', 'license_disc',
            'huru_criminal_check', 'vehicle_inspection_report'
          )
          or (expiry_date is not null and expiry_date >= current_date)
        )
    ) <> 15 then
      raise exception 'All 15 required documents must be uploaded, current, and individually approved';
    end if;

    perform set_config('buddyride.internal_profile_update', 'on', true);
    update public.profiles
    set is_verified = true,
        verification_status = 'approved',
        verification_rejection_reason = null,
        verified_at = now()
    where id = p_driver_id and role = 'driver';
  else
    perform set_config('buddyride.internal_profile_update', 'on', true);
    update public.profiles
    set is_verified = false,
        verification_status = 'rejected',
        verification_rejection_reason = nullif(btrim(p_rejection_reason), ''),
        verified_at = null,
        is_online = false
    where id = p_driver_id and role = 'driver';
  end if;
end;
$$;

revoke all on function public.admin_set_driver_verification(uuid, boolean, text) from public;
grant execute on function public.admin_set_driver_verification(uuid, boolean, text) to authenticated;


-- Enforce driver eligibility in the database too, so stale clients cannot bypass
-- the UI's Go Online check or go online after a required document expires.
create or replace function public.enforce_driver_online_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  required_types text[] := array[
    'sa_id', 'drivers_license', 'prdp', 'profile_photo', 'selfie',
    'vehicle_registration', 'license_disc', 'vehicle_photo_1',
    'vehicle_photo_2', 'vehicle_photo_3', 'vehicle_photo_4',
    'vehicle_interior_photo_1', 'vehicle_interior_photo_2',
    'huru_criminal_check', 'vehicle_inspection_report'
  ];
begin
  if new.is_online is not true or public.is_admin() then
    return new;
  end if;

  if new.role <> 'driver'
    or new.is_verified is not true
    or lower(coalesce(new.verification_status, '')) not in ('approved', 'verified')
    or coalesce(new.is_banned, false) then
    raise exception 'Driver approval is required before going online';
  end if;

  if (
    select count(distinct doc_type)
    from public.driver_documents
    where driver_id = new.id
      and doc_type = any(required_types)
      and status = 'APPROVED'
      and nullif(btrim(file_url), '') is not null
      and (
        doc_type not in (
          'drivers_license', 'prdp', 'license_disc',
          'huru_criminal_check', 'vehicle_inspection_report'
        )
        or (expiry_date is not null and expiry_date >= current_date)
      )
  ) <> 15 then
    raise exception 'All 15 required driver documents must remain approved and current';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_driver_online_eligibility on public.profiles;
create trigger enforce_driver_online_eligibility
before update of is_online on public.profiles
for each row execute function public.enforce_driver_online_eligibility();


-- Re-submitting any required document revokes the previous approval and
-- forces the driver offline until an administrator reviews the replacement.
create or replace function public.revoke_driver_approval_on_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_driver_id uuid;
  target_doc_type text;
  target_status text;
  target_expiry date;
  required_types text[] := array[
    'sa_id', 'drivers_license', 'prdp', 'profile_photo', 'selfie',
    'vehicle_registration', 'license_disc', 'vehicle_photo_1',
    'vehicle_photo_2', 'vehicle_photo_3', 'vehicle_photo_4',
    'vehicle_interior_photo_1', 'vehicle_interior_photo_2',
    'huru_criminal_check', 'vehicle_inspection_report'
  ];
  expiring_types text[] := array[
    'drivers_license', 'prdp', 'license_disc',
    'huru_criminal_check', 'vehicle_inspection_report'
  ];
begin
  if tg_op = 'DELETE' then
    target_driver_id := old.driver_id;
    target_doc_type := old.doc_type;
    target_status := null;
    target_expiry := null;
  else
    target_driver_id := new.driver_id;
    target_doc_type := new.doc_type;
    target_status := new.status;
    target_expiry := new.expiry_date;
  end if;

  if target_driver_id is null or not (target_doc_type = any(required_types)) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if exists (
    select 1 from public.profiles
    where id = target_driver_id
      and role = 'driver'
      and (is_verified is true or lower(coalesce(verification_status, '')) in ('approved', 'verified'))
  ) and (
    tg_op = 'DELETE'
    or target_status is distinct from 'APPROVED'
    or (target_doc_type = any(expiring_types) and (target_expiry is null or target_expiry < current_date))
  ) then
    perform set_config('buddyride.internal_profile_update', 'on', true);
    update public.profiles
    set is_verified = false,
        verification_status = 'pending_verification',
        verification_rejection_reason = null,
        verified_at = null,
        is_online = false
    where id = target_driver_id;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists revoke_driver_approval_on_document_change on public.driver_documents;
create trigger revoke_driver_approval_on_document_change
after insert or update or delete on public.driver_documents
for each row execute function public.revoke_driver_approval_on_document_change();
