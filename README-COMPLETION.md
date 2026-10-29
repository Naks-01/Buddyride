# BuddyRide1 - completion pass

## Setup
1. Copy `.env.example` to `.env.local` in the project root (not inside `src/`).
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAPBOX_TOKEN`.
3. Run `npm ci`.
4. Run `npm run build`.
5. Run `npm run dev`.

Never commit real keys. The Supabase anon/publishable key and Mapbox public token may be present in frontend env, but Supabase RLS must enforce access. Never put a Supabase service-role key in Vite variables.

## SQL
- `supabase/schema.sql` is the clean-database schema and should only be used for a new database after review.
- `supabase/patch_driver_documents.sql` is the compatibility migration for driver document columns.
- `supabase/production_hardening.sql` adds bucket limits, profile counterpart visibility, ride update policy restrictions and realtime publication membership. Test it on a staging database before applying to production.

## Important
This is a source-level repair pass, not a certified production release. This environment did not have a complete, writable `node_modules`, and dependency installation did not finish; therefore `npm run build` could not be verified here. Real Supabase Auth, Storage, RLS, Realtime, payment-provider, and Vercel deployment tests still require your project credentials and authenticated test accounts.
