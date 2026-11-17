# BuddyRide1 — second-pass source repair and control audit
Date: 17 November 2026

## Scope and important limitation

This pass reviewed the uploaded BuddyRide1 source archive and made source-level repairs. It did not connect to or change the live Supabase project, Paystack, Twilio, Vercel, TomTom, Mapbox, or an Android device. It is not a production-launch certification.

## Additional source repairs in this pass

- Removed the remaining client-side path that could create a passenger as verified. New passenger profiles now start `not_started` and `is_verified = false`.
- Removed browser-side administrator promotion and login-time passenger/driver role changes. Admin profiles must already be provisioned securely in the database.
- Replaced a dangerous historical migration draft that dropped every `public` table and deleted Storage objects with a non-destructive notice-only migration.
- Moved three unversioned legacy SQL scripts out of the active migrations folder. They are retained under `supabase/legacy-migrations/` with warnings because they contain data deletion or older verification/document rules.
- Connected Passenger → My Trips to the passenger's actual `rides` rows instead of showing a placeholder.
- Added driver profile name/phone editing to the driver menu.
- Connected the driver menu's theme selection to the actual driver screen; the setting persists.
- Made the driver navigation preference persist and control the navigation action for pickup and destination. Removed the Google Maps option; current choices are BuddyRide Navigation and Waze.
- Made driver earnings use the configured commission rather than a hardcoded 80% fallback.
- Made Finance use the configured commission when a stored per-ride commission is unavailable.
- Restricted bulk “Mark Paid” to the exact unpaid ride IDs currently shown by the date/search filter. Added checks so the UI does not mark a payout paid when the database updates zero rows.
- Prevented the driver app from showing ONLINE unless the dispatch `driver_status` write succeeds.
- Corrected Admin Home wording: service zones can be edited, but ride dispatch does not yet enforce zone boundaries.
- Restricted Admin Settings' direct-write fallback to a genuinely missing RPC; permission and validation errors are no longer bypassed.
- Changed fare-category deletion so the row remains visible if the database delete fails.

## Static UI control inventory

TypeScript JSX AST scan of `src/` found:

- 216 `<button>` elements: 214 have `onClick` handlers and 2 are form submit buttons.
- 80 anchor links: all 80 have an `href`.
- 2 forms.
- 45 input/select/textarea controls.

This proves controls are wired in source syntax; it does **not** prove that every action succeeds at runtime. Runtime success depends on authentication, Supabase schema/RLS, Storage, external providers, device permissions, and real passenger/driver accounts.

## Automated checks run

- TypeScript project check (`npx tsc -b`): passed.
- Node test suite: 11 passed, 0 failed. This includes the original four driver-routing tests plus seven regression checks for passenger verification, role security, destructive migration safety, passenger trip history, driver availability writes, payout scoping, and driver settings.
- Vite dev server / production bundle: not verified in this environment. The uploaded `node_modules` contains Windows Rollup optional packages but is missing `@rollup/rollup-linux-x64-gnu`, so Vite cannot start/build in this Linux environment. Run a clean `npm ci` on the target Windows machine and then `npm run build`.
- SQL migrations: not executed against live or staging Supabase.
- Twilio OTP, Paystack checkout/webhook/refunds, map routing, GPS, realtime dispatch, Storage access, and Android: not live-tested.

## Known functionality boundaries / remaining launch gates

1. **Driver payouts:** manual bank EFT tracking only. “Mark Paid” records a payment that has already been made; it does not transfer money.
2. **Push notifications:** no verified background push provider. Browser notifications while the app is open are not equivalent.
3. **Emergency response:** passenger/driver SOS records a report for BuddyRide support. It does not contact SAPS/ambulance and cannot guarantee a human response.
4. **Service zones:** Admin can edit and save zone records, but dispatch does not enforce zone boundaries yet.
5. **Language:** English is currently supported. Other languages are not presented as working settings.
6. **Campaigns:** the driver Campaigns view is informational; no live campaign/bonus engine is implemented.
7. **External providers:** SMS and Paystack require real secrets, webhook setup, and test transactions. No live transaction was made.
8. **Supabase:** apply and verify migrations in a staging project first. Confirm RLS, private Storage access, buckets, triggers, functions, and `pg_cron` schedule. Never run legacy SQL scripts.
9. **Full UI acceptance:** every control still needs manual end-to-end acceptance testing with separate passenger, driver, and admin accounts on real devices. The current test suite is not a full browser click-through suite.

## Verdict

**Not certified for public launch yet.** Source-level defects were corrected and regression checks pass, but no live service integration or full browser/device acceptance test has been completed. Do not accept live passenger payments or rely on SOS until all staging and operational checks pass.
