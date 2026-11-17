-- BuddyRide historical migration safety replacement (17 Nov 2026).
-- The previous draft of this file dropped EVERY public table and deleted files
-- from several Storage buckets. That behaviour is unsafe and must never run in
-- a production project. This migration is intentionally non-destructive.
-- Apply actual RLS/Storage hardening only through reviewed, additive migrations.
DO $$
BEGIN
  RAISE NOTICE 'BuddyRide storage hardening placeholder: no data or schema objects were changed.';
END;
$$;
