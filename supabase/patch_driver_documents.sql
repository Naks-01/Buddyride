-- BuddyRide1 compatibility migration: driver document column names + storage limits.
-- Safe to run on the existing schema. Does not delete profiles or rides.

alter table public.driver_documents add column if not exists document_type text;
alter table public.driver_documents add column if not exists file_path text;

update public.driver_documents
set document_type = coalesce(document_type, doc_type),
    file_path = coalesce(file_path, file_url)
where document_type is null or file_path is null;

create unique index if not exists driver_documents_driver_document_type_uidx
  on public.driver_documents(driver_id, document_type);

create or replace function public.sync_driver_document_columns()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.document_type := coalesce(new.document_type, new.doc_type);
    new.doc_type := coalesce(new.doc_type, new.document_type);
    new.file_path := coalesce(new.file_path, new.file_url);
    new.file_url := coalesce(new.file_url, new.file_path);
  else
    if new.document_type is distinct from old.document_type and new.document_type is not null then
      new.doc_type := new.document_type;
    elsif new.doc_type is distinct from old.doc_type and new.doc_type is not null then
      new.document_type := new.doc_type;
    end if;
    if new.file_path is distinct from old.file_path and new.file_path is not null then
      new.file_url := new.file_path;
    elsif new.file_url is distinct from old.file_url and new.file_url is not null then
      new.file_path := new.file_url;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_driver_document_columns on public.driver_documents;
create trigger sync_driver_document_columns
before insert or update
on public.driver_documents for each row execute function public.sync_driver_document_columns();

update storage.buckets
set public = false,
    file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
where id = 'driver-documents';

update storage.buckets
set public = true,
    file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg']
where id = 'profile-photos';

-- Keep phone_number and phone synchronized for legacy app screens.
update public.profiles
set phone_number = coalesce(phone_number, phone),
    phone = coalesce(phone, phone_number)
where phone_number is null or phone is null;
