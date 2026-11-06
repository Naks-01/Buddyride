# BuddyRide1

Clean rebuild of the BuddyRide1 ride-hailing web app.

## Stack

- React + Vite + TypeScript
- Supabase Auth + Postgres + Realtime
- Mapbox Maps / Geocoding / Directions
- Vercel deployment

No Firebase and no Google Maps are used.

## 1. Install

```bash
npm install
```

## 2. Configure

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then enter:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`

Never put a Supabase service-role key in Vite frontend code.

## 3. Create the database

Open Supabase SQL Editor and run:

`supabase/schema.sql`

For a clean rebuild, use a fresh Supabase project or remove old conflicting BuddyRide tables first.
The canonical schema includes the document compatibility, rating, security, storage, and Realtime definitions.

## 4. Start

```bash
npm run dev
```

## 5. Build

```bash
npm run build
```

## 6. Vercel

Import the project into Vercel and add the same three environment variables.

## Fare rules

Active category rates and commission are stored in Supabase and are editable
from Admin Settings. Fare amounts and driver/platform shares are recalculated
by the database on ride creation; the client cannot choose the stored fare.

## What is included

Passenger:
- login/signup
- current location
- pickup/destination
- Mapbox route
- fare estimate
- request ride
- realtime ride status
- cancel
- rate a completed ride

Driver:
- login/signup
- online/offline
- live driver location
- realtime ride requests
- accept ride
- arrival/trip status
- complete ride

Admin:
- dashboard and ride/driver/passenger management
- users/rides/revenue overview

The Supabase schema also creates the driver-offer, live-location, chat, SOS,
and app-settings tables. Driver offers are assigned to one eligible online
driver at a time; declining or expiring an offer advances to the next eligible
driver. Profile privilege fields and ride status changes are guarded by
database triggers, and ratings are recorded through a participant-checked RPC.

Passenger accounts start unverified. Passengers must submit safety details and
wait for admin approval before they can request a ride. The database enforces
this gate in both profile updates and ride-insert RLS.

Passenger fare estimates and ride inserts use the authenticated
`calculate-fare` Supabase Edge Function. It requests a route from Mapbox using
the server-only `MAPBOX_ACCESS_TOKEN`, saves a short-lived, single-use fare
quote, and returns the verified route and fare. The ride insert trigger checks
that quote against the authenticated passenger, category, and coordinates and
sets the stored fare and distance from the quote. Configure the Edge Function
with `MAPBOX_ACCESS_TOKEN` and `APP_BASE_URL`; do not use the frontend
`VITE_MAPBOX_TOKEN` as a server secret.

For an existing Supabase project, apply the migrations in order, including
`20261107000000_remove_instant_passenger_verification.sql` and
`20261107000100_server_verified_fare_quotes.sql`. Deploy the `calculate-fare`
Edge Function after setting its secrets. The consolidated `schema.sql` remains
for fresh projects; do not run it as an incremental production migration.

## Still required before launch

The app currently supports cash fares only. Before a public launch, complete
and test:
- a payment provider integration and real driver payout/settlement flow
- independent server-side route-distance validation (the route distance is
  still supplied by the client)
- independent identity/liveness verification and operational driver KYC
- push notifications for backgrounded/closed apps
- a passenger/driver SOS reporting flow and staffed emergency response
- trip sharing, audit logs, rate limiting, and error monitoring
- legal, privacy, terms, and consent screens appropriate for the operating area

The matching function uses the stored driver coordinates to select an eligible
driver; confirm its operational coverage and matching policy before launch.
The SQL file is intended for a fresh Supabase project as described above.
