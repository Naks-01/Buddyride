# BuddyRide1 source audit and patch report

Audit date: 8 November 2026  
Scope: uploaded source archive, React/TypeScript frontend, Supabase schema and migrations, Vercel configuration, driver onboarding and admin flows.

## Summary

The uploaded project was **not launch-ready**. The source review found security and workflow defects in driver document storage, authentication/profile creation, admin counts and approvals, and driver routing. The fixes below have been applied to the source tree in this package.

This is not a certification of production readiness. The live Supabase project, deployed RLS policies, Storage buckets, Edge Function secrets, Vercel environment, payment provider, real accounts and mobile devices were not accessible for end-to-end verification. Apply the new migration and test in a staging project before launch.

## Fixes applied

1. **Private driver evidence**
   - Driver IDs, licences, PrDPs, criminal checks, vehicle papers, vehicle photos and selfies now upload to the private `driver-documents` bucket.
   - Only profile photos remain in the public `profile-photos` bucket.
   - The database stores a bucket-qualified storage reference and object path, not a public URL for private documents.
   - Admin previews create short-lived signed URLs.
   - Uploads use unique object names, `upsert: false`, allowed MIME types and a 20 MB limit; failed database writes clean up the newly uploaded object.
   - The legacy DriverDocuments screen was fixed too; it now saves profile-photo document metadata and invokes the actual submit-for-review RPC rather than displaying a button that only navigated away.

2. **Server-side upload verification**
   - New migration replaces `submit_driver_documents_for_review()` so it checks that all 15 required records point to real objects in the correct Storage bucket.
   - It checks required document dates, five expiry dates, bank details and rejects expired files using the South African calendar date.
   - A selfie is no longer stored in a public photo bucket.

3. **Authentication/profile creation**
   - Removed the conflicting frontend profile upsert after Supabase Auth signup. The database `auth.users` trigger is the single profile creator, preserving its server-enforced verification defaults.
   - Removed client-side promotion of an account to `admin`. Admin access must be provisioned in Supabase through a trusted administrator process; a browser client must never grant itself admin privileges.

4. **Admin dashboard counts and revenue**
   - Added `admin_dashboard_stats()` to calculate exact counts in PostgreSQL, avoiding the default REST row limit and incomplete client-side counts.
   - Platform revenue uses BuddyRide commission, with a 20% fallback only when the commission field is null; the dashboard no longer labels gross passenger fare as platform revenue.
   - Both admin overview screens use the same authoritative metrics.

5. **Driver approval**
   - Added `admin_set_driver_verification()` as a server-side, admin-only operation.
   - A driver cannot be approved to go online unless all 15 required document types exist, are approved, and required expiry dates are current.
   - Rejection and profile status updates are handled together in the RPC.
   - The dashboard's quick-approval action now calls this RPC instead of directly changing profile and document rows.

6. **Other fixes**
   - Fixed the pending-driver routing defect detected by the existing tests.
   - Fixed the Admin Dashboard's broken “View Docs” URL to open the real Admin Documents screen.
   - Limited the driver-document admin join to necessary profile columns rather than fetching the full profile, including banking fields.
   - Added an `npm test` script.

## Validation performed

- TypeScript project check: **passed** (`tsc -b`).
- Existing Node tests: **4 passed, 0 failed** after fixing the pending-driver route.
- Vite production bundle: **not verified** in this environment. The uploaded `node_modules` was a Windows install and omitted the Linux Rollup optional binary; the network is unavailable here to install the matching binary. Run `npm ci` and `npm run build` on the deployment machine/CI after extracting this package.

## Required before launch

1. Apply `supabase/migrations/20261108000100_storage_and_admin_hardening.sql` to the correct Supabase project. Do not deploy the frontend before the RPCs and bucket policies exist.
2. Verify the resulting bucket visibility and Storage policies in the live Supabase dashboard. Test uploads and signed previews using separate passenger, driver and admin accounts.
3. Provision the admin profile in Supabase using a trusted SQL/admin process. The client no longer attempts to promote the owner email to admin.
4. The uploaded archive included `.env.local` with a `VERCEL_OIDC_TOKEN` variable. This patched package excludes `.env.local`, `.git`, `.vercel` and `node_modules`. Revoke/rotate that Vercel credential if it was valid when the archive was shared. Keep all secrets in provider dashboards, not ZIP files or Git.
5. Run `npm ci`, `npm test`, and `npm run build` in a clean Linux/Windows CI environment; then perform live staging tests.
6. Remaining previously identified launch blockers outside this focused patch include independent server-side route-distance verification/fare validation, complete Paystack payment/refund and driver payout reconciliation tests, WhatsApp OTP provider integration (if required), reviewed and working legal pages, production monitoring/rate limiting, backup/restore verification, and native mobile/background-location/push testing.

## Important limitation

The package contains the full patched project source and the new database migration. It cannot apply SQL to your live Supabase project, configure Vercel secrets, rotate credentials, or prove payment/OTP delivery from this chat. “100% production ready” cannot honestly be claimed until those live checks pass.
