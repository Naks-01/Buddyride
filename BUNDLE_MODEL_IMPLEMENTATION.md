# BuddyRide1 bundle-only model change — 24 November 2026

## Commercial rules implemented
- Drivers receive 100% of each trip fare. New trip completion records `driver_earnings = total_fare` and `buddyride_commission = 0`.
- Paystack is used only for driver bundle purchases. Passenger trips are cash-only in the UI and are rejected by a database trigger if a non-cash payment method is submitted.
- A driver must be KYC-approved, online, not banned, not already on another active trip, and have enough unexpired credits for the requested ride category before the server accepts the ride.
- Credits are consumed once, in the database `complete_ride` transaction. Trips under 100 km use one credit; trips of 100 km or longer use two.
- A bundle purchase is pending until Paystack confirms it through server-side transaction verification or the signed webhook. Only the service-role activation RPC creates driver credits. Browser code cannot mint credits.
- Bundle prices are not seeded with sample prices. An administrator must configure the actual commercial prices in Admin Settings.

## Changed code
- `src/pages/DriverBundlePurchase.tsx`: removed fake/simulated purchase and hard-coded fallback packs; uses `start-bundle-checkout` and `verify-bundle-payment`.
- `src/pages/DriverHome.tsx`: acceptance now calls `accept_ride_with_bundle` instead of a client-side rides update.
- `src/pages/AdminSettings.tsx`: bundle prices now include vehicle category and do not seed a made-up price.
- `src/pages/PassengerHome.tsx` and `src/components/PassengerSafetyModal.tsx`: removed Paystack passenger ride payment selection; cash only.
- `src/components/NavigationMenu.tsx`, `src/pages/TermsPage.tsx`, `src/pages/LandingPage.tsx`, finance/admin screens: fare earnings and payment descriptions updated for the bundle model.
- `supabase/functions/start-bundle-checkout`, `verify-bundle-payment`, `bundle-paystack-webhook`, and `_shared/bundle-payments.ts`: real server-side Paystack flow with signed webhook and amount/currency/reference/metadata checks.
- Removed the old passenger-ride Paystack Edge Function source files. Delete already-deployed legacy ride-payment functions using the commands in `DEPLOYMENT_STEPS.md`.
- `supabase/migrations/20261124000200_bundle_model_paystack.sql`: bundle tables, RLS, acceptance/completion RPCs, commission-zero compatibility, cash-only ride payment trigger, and Storage bucket/policies for all six app buckets.

## Required deployment steps
1. Back up the Supabase database and apply `supabase_migration_bundle_model.sql` in SQL Editor after the earlier BuddyRide migrations.
2. Configure actual bundle prices by vehicle category in Admin Settings. No prices are invented or preloaded.
3. Set `APP_BASE_URL=https://buddyride.co.za` and `PAYSTACK_SECRET_KEY` as Supabase Edge Function secrets. Never expose the secret as a `VITE_` variable.
4. Deploy `start-bundle-checkout`, `verify-bundle-payment`, and `bundle-paystack-webhook` (webhook with `--no-verify-jwt`). Configure the Paystack webhook to the bundle webhook URL.
5. Delete legacy ride-payment functions if they were previously deployed.
6. Test with Paystack test credentials and separate passenger, approved driver, and admin accounts before enabling live mode.

## Verification status
- Node regression tests: 13 passed, 0 failed.
- Production TypeScript/Vite build: not verified. `npm ci` timed out in this environment and the project dependencies were not installed, so no successful build claim is made.
- SQL was reviewed structurally but was not executed against the user's live Supabase database. Run it against a backup/staging project first and inspect any schema-specific migration error before production.
- Paystack, RLS, Storage and trip lifecycle have not been live-tested against the user's Supabase project.
