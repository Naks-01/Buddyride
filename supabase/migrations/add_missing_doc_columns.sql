ALTER TABLE public.driver_documents
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Keep the newest record per driver/document pair so the unique key supports
-- deterministic upserts. This also removes the reported duplicates for
-- mokgalaka.nt@gmail.com.
WITH ranked_documents AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY driver_id, doc_type
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS row_number
  FROM public.driver_documents
)
DELETE FROM public.driver_documents AS duplicate
USING ranked_documents AS ranked
WHERE duplicate.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_driver_doc_latest
  ON public.driver_documents (driver_id, doc_type);

CREATE OR REPLACE FUNCTION public.submit_driver_documents_for_review()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = caller_id AND role = 'driver'
  ) THEN
    RAISE EXCEPTION 'Driver account required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.driver_documents
    WHERE driver_id = caller_id AND file_url IS NOT NULL
    GROUP BY driver_id
    HAVING (
      BOOL_OR(doc_type = 'drivers_license' AND status = 'APPROVED')
      OR COUNT(DISTINCT doc_type) FILTER (WHERE doc_type IN ('drivers_license', 'prdp')) = 2
    )
    AND COUNT(DISTINCT doc_type) FILTER (WHERE doc_type IN (
      'profile_photo', 'selfie_holding_id', 'vehicle_registration', 'license_disc',
      'car_photo_1', 'car_photo_2', 'car_photo_3', 'car_photo_4'
    )) = 8
  ) THEN
    RAISE EXCEPTION 'Complete all four required document groups, including four vehicle photos';
  END IF;

  PERFORM set_config('buddyride.internal_profile_update', 'on', true);
  UPDATE public.profiles
  SET verification_status = 'pending_verification'
  WHERE id = caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_driver_documents_for_review() FROM public;
GRANT EXECUTE ON FUNCTION public.submit_driver_documents_for_review() TO authenticated;
