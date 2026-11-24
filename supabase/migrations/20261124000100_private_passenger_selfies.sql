-- BuddyRide: keep passenger safety selfies private and allow admin review.
-- Existing files are retained; this does not delete or move Storage objects.
update storage.buckets
set public = false
where id = 'safety-selfies';

drop policy if exists "safety_selfies_storage_select" on storage.objects;
create policy "safety_selfies_storage_select" on storage.objects
for select to authenticated using (
  bucket_id = 'safety-selfies'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- The passenger client uploads selfie evidence to safety-selfies/<user-id>/...
-- Keep the ID document bucket private and admin-reviewable.
update storage.buckets
set public = false
where id = 'passenger-ids';
