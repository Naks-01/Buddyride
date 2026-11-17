# BuddyRide1 Full Source Audit — 13 November 2026

## Scope
- Reviewed the 46 files under `src/`.
- Checked relative source imports: no missing relative imports found.
- Verified `src/lib/driverDocuments.ts` still contains exactly the original 15 required driver document entries.
- Verified TymeBank and Discovery Bank remain in the onboarding bank list.
- No CSS, colour tokens, layout, icon, or visual styling files were changed.

## Files Fixed

1. `src/pages/DriverHome.tsx` — removed client-side auto-approval; checks all 15 required documents, required expiry dates and admin profile approval before allowing Go Online; takes a driver offline if eligibility is lost.
2. `src/pages/DriverDashboardGuard.tsx` — requires admin approval plus all 15 valid, approved documents before rendering the driver dashboard; refreshes after overlapping realtime events instead of silently dropping them.
3. `src/pages/DriverOnboarding.tsx` — Applicant Pending progress now counts the 15 required document types rather than whatever number happened to be uploaded; requires all 15 for approval; cleans up newly uploaded storage files if the database save fails; surfaces lookup errors.
4. `src/pages/AdminDocuments.tsx` — admin cannot approve a driver until all 15 documents are individually approved; removed the unsafe direct-profile-update fallback when the approval RPC is missing.
5. `tests/driverRouting.test.mjs` — corrected the pending-dashboard route assertion to match the actual guard-owned pending screen behavior.
6. `supabase/migrations/20261113000100_secure_driver_approval.sql` — adds the secure admin approval RPC, server-side 15-document validation, database-level Go Online enforcement, and automatic revocation/offline behavior when an approved driver re-submits a required document.

## Important behavior after applying the migration

- Driver uploads the 15 existing required documents and submits the application.
- Driver sees Applicant Pending while documents are reviewed.
- Admin approves each document individually.
- Admin's final Approve to Drive action calls `admin_set_driver_verification`.
- The database function independently checks all 15 document records and expiry dates before approving the profile.
- Driver dashboard and Go Online remain blocked unless profile approval and all 15 document checks pass.
- Re-uploading a required document after approval revokes approval and turns the driver offline until the replacement is reviewed.
- The database also rejects attempts to set a driver's profile online when the driver is not eligible.

## Validation

- `npm test`: PASS — 4 tests passed, 0 failed.
- Relative import check: PASS — no missing relative imports found.
- Required documents: PASS — exactly 15 entries; the original `driverDocuments.ts` was not modified.
- Bank list: PASS — TymeBank and Discovery Bank remain present.
- Colour/UI preservation: PASS — no CSS or visual styling files were modified.
- `npm run build`: NOT VERIFIED. Dependency installation (`npm ci`) timed out in this environment, leaving incomplete `node_modules`; the subsequent TypeScript build stopped because type definition packages were missing. This is an environment/dependency-install limitation, not a successful production build.

## Required deployment action

Apply `supabase/migrations/20261113000100_secure_driver_approval.sql` to the BuddyRide Supabase project before testing the final Admin Approve to Drive action. The frontend intentionally fails closed if the secure approval RPC is unavailable; it will not fall back to directly editing a driver's approval fields.

## Credential hygiene

The uploaded archive included `.env` and `.env.local`, including a `VERCEL_OIDC_TOKEN` variable. Those environment files are intentionally excluded from the fixed source archive. If the token value was valid when the archive was shared, revoke/rotate it in Vercel. Do not commit `.env` or `.env.local`; keep real secrets in local environment files and Vercel environment settings.
