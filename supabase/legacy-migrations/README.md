# Legacy BuddyRide SQL scripts — do not apply automatically

These scripts are retained for historical reference only. They are not part of
BuddyRide's current ordered migration chain:

- `add_missing_doc_columns.sql` contains a DELETE that removes duplicate driver-document rows.
- `driver_onboarding_sa_compliance.sql` implements an older 11-document onboarding requirement and can replace newer 15-document rules if run later.
- `passenger_safety_id_fallback.sql` implements older passenger verification and Storage-path rules that conflict with the current passenger selfie + ID workflow.

Do not execute these scripts on production. Use the timestamped migrations and
`supabase/schema.sql` as the current reviewed schema reference. Back up and
review existing data before any manual repair.
