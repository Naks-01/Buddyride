# BuddyRide1 – deployment steps for the repair

## Migration safety warning

- Back up the live database and Storage before any SQL change.
- Apply only the timestamped migrations in the intended order after checking the Supabase migration history.
- `supabase/legacy-migrations/` is historical reference only; do not run those scripts.
- The former `20261108000100_storage_and_admin_hardening.sql` draft was destructive. It has been replaced in this source package with a non-destructive no-op. If that old draft was already executed on a live project, this replacement cannot restore deleted tables or files; check the live database and backups.
- Do not run `supabase/schema.sql` over a populated production database as a reset. Use a staging project first.

## 1. Apply the SQL migration

In Supabase Dashboard → SQL Editor, open and run:

`supabase/migrations/20261117000100_launch_critical_fixes.sql`

Run it only after the existing BuddyRide migrations have been applied in order. Back up the database first and test this migration in a staging project before production. It removes the legacy plaintext `sms_otps.code` column and prevents new passenger/driver profiles from being inserted without a recently verified phone number.

## 2. Set Supabase Edge Function secrets

Set these as Supabase Edge Function secrets. Do not put them in `.env.local`, Vercel browser variables, or any `VITE_` variable.

- `APP_BASE_URL` – `https://buddyride.co.za`
- `MAPBOX_ACCESS_TOKEN` – server-side Mapbox Directions token
- `OTP_HASH_SECRET` – a long, randomly generated secret used to hash OTPs
- `TWILIO_ACCOUNT_SID` – Twilio account SID
- `TWILIO_AUTH_TOKEN` – Twilio auth token
- `TWILIO_FROM_NUMBER` – active Twilio sender number
- `PAYSTACK_SECRET_KEY` – Paystack secret key (test key in staging)

Example (replace every placeholder locally; never paste actual secrets into chat):

```bash
supabase secrets set APP_BASE_URL=https://buddyride.co.za MAPBOX_ACCESS_TOKEN=YOUR_MAPBOX_SERVER_TOKEN OTP_HASH_SECRET=YOUR_LONG_RANDOM_SECRET TWILIO_ACCOUNT_SID=YOUR_TWILIO_SID TWILIO_AUTH_TOKEN=YOUR_TWILIO_TOKEN TWILIO_FROM_NUMBER=YOUR_TWILIO_SENDER PAYSTACK_SECRET_KEY=YOUR_PAYSTACK_SECRET
```

## 3. Deploy Edge Functions

Link the CLI to the correct Supabase project first. Then deploy:

```bash
supabase functions deploy calculate-fare
supabase functions deploy send-sms-otp
supabase functions deploy verify-sms-otp
supabase functions deploy start-paystack-checkout
supabase functions deploy verify-paystack-payment
supabase functions deploy paystack-webhook --no-verify-jwt
```

Configure the Paystack webhook in the Paystack dashboard to the deployed `paystack-webhook` URL. The webhook function validates the Paystack signature itself, which is why gateway JWT verification is disabled for that one function only.

## 4. Configure frontend environment variables

Set these for local development and the Vercel production build:

```dotenv
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_TOMTOM_API_KEY=YOUR_TOMTOM_API_KEY
```

The Mapbox token is used only by the server fare function. The TomTom key is browser-visible and must be restricted in the TomTom console where supported.

## 5. Clean install and build

From the project folder:

```bash
npm ci
npm test
npm run build
```

The supplied ZIP deliberately excludes `node_modules`; do not copy the old `node_modules` folder from the uploaded archive. `npm ci` recreates platform-specific optional dependencies for your computer.

## 6. Required staging checks

- Sign up a passenger with SMS OTP; confirm an incorrect, expired, and over-attempted OTP is rejected.
- Confirm a profile cannot be created with an unverified phone number.
- Submit passenger selfie + ID details; confirm passenger remains pending until admin approval.
- Confirm pending/rejected passenger ride insert is rejected by the database.
- Approve passenger; calculate a server quote; book cash ride; confirm assigned driver receives it.
- Book Paystack test ride; test success, cancel, failed payment, duplicate webhook and callback refresh.
- Close the offered driver's app; confirm the scheduled recovery function reassigns the expired offer.
- Submit passenger and driver SOS; confirm reports appear in Admin → SOS Support and include the available coordinates.
- Verify document storage buckets are private and test owner/admin-only access with separate accounts.
- Confirm manual EFT payout reconciliation and support staffing. Do not represent payouts or SOS response as automated.
