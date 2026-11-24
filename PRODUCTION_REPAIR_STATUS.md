# BuddyRide1 repair status — 24 November 2026

## What was changed in this repair pass

1. **Administrator privilege escalation removed from the browser.** The prior `App.tsx` promoted any account using the configured admin email to `role: 'admin'` in client state even when the database profile was a passenger/driver. The app now requires an existing database profile whose role is already `admin`, as well as the matching configured email. The browser no longer elevates account roles.
2. **Missing Supabase configuration now fails closed.** Removed the fabricated `placeholder.supabase.co` URL and placeholder anon key. The app now stops with an explicit configuration error instead of attempting requests to a fake project.
3. **Passenger selfie verification storage mismatch fixed.** Passenger selfies are uploaded to `safety-selfies`, but the launch SQL was checking for objects in `passenger-photos`. The SQL now checks `safety-selfies`.
4. **Passenger safety selfies are private.** Added `20261124000100_private_passenger_selfies.sql` to make `safety-selfies` private and allow read access only to the owner or a database-authorized administrator. The base schema policy was corrected too. No Storage objects are deleted or moved.
5. **Admin signed-URL support confirmed for safety selfies.** The document signed-URL helper recognizes the `safety-selfies` bucket.
6. **Driver availability error clarified.** Failed dispatch-status writes now return an explicit availability synchronization error.
7. **Stale tests corrected.** Driver pending-route expectations now match the actual `/driver/pending` route. Finance test now reflects the current bundle model, not an obsolete bulk-payout screen.

## Checks completed

- Node regression tests: **11 passed, 0 failed** (`node --test tests/*.test.mjs`).
- TypeScript/build: **NOT VERIFIED**. `npm ci` timed out twice in this environment. The partially created `node_modules` is incomplete; `npx --no-install tsc -b` consequently reported missing type definitions. This is an environment/dependency-install failure, not a successful build.
- Vite production bundle: **NOT VERIFIED**.
- Supabase SQL: **NOT EXECUTED** against staging or production.
- Live Auth/SMS, RLS, Storage, Edge Functions, TomTom routing, Paystack payments/webhooks, realtime dispatch, GPS, and mobile/browser end-to-end: **NOT LIVE-TESTED**.

## Launch blockers — do not treat this archive as launch-certified

- Apply migrations to a staging Supabase project in order, including the new `20261124000100_private_passenger_selfies.sql`, and verify all RLS policies with separate passenger, driver, and admin accounts.
- Confirm the existing admin account is actually provisioned with `profiles.role = 'admin'`; the client no longer grants admin role based on email alone.
- Verify passenger selfie and ID gallery uploads, signed previews, and admin review using real files. The selfie bucket is now private; verify any UI that renders the passenger's own selfie uses an authenticated fetch/signed URL rather than assuming a public URL works.
- Verify all required driver documents, expiry checks, vehicle photos, approval, and online eligibility against the live database.
- Verify SMS OTP delivery and abuse limits with the configured Twilio account.
- Verify Paystack test checkout, signature validation, duplicate webhook handling, refunds/cancellations, and callback refresh before enabling live payments.
- Verify real TomTom API key restrictions, geocoding coverage, route calculation, GPS permissions, and poor-network behavior.
- Confirm scheduled expired-offer recovery is actually installed and running in Supabase.
- Run `npm ci`, `npm test`, and `npm run build` on the deployment environment, then complete passenger-to-driver trip acceptance, arrival, start, completion, cancellation, chat, and rating on real devices.
- The current finance UI is a **driver bundle model** (driver keeps 100% of fare and BuddyRide earns from bundles), not a standard 80/20 fare commission. Confirm this is the intended commercial model before launch.
- SOS records are not emergency-service dispatch; staff coverage and response procedures must be operational before presenting SOS as a safety service.

**Verdict: not launch-ready/certified yet.** This pass fixed specific source-level security and passenger verification defects and the included Node tests pass. It cannot truthfully guarantee production readiness or a tomorrow launch without successful clean build, database migration verification, provider setup, and live end-to-end testing.
