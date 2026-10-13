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

## Current fare rules

- Base: R15
- R7.50/km
- Booking fee: R5
- Minimum fare: R35
- Driver receives 80% of total
- BuddyRide keeps 20%

Change these in `src/lib/fare.ts`.

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

Driver:
- login/signup
- online/offline
- live driver location
- realtime ride requests
- accept ride
- arrival/trip status
- complete ride

Admin:
- basic dashboard
- users/rides/revenue overview

## Production hardening still recommended

Before taking real money or launching publicly, add:
- payment provider integration
- server-side fare calculation
- secure driver assignment/nearest-driver matching
- driver KYC/document verification
- push notifications
- emergency/SOS
- trip sharing
- stronger admin RLS
- audit logs
- rate limiting
- error monitoring
- legal/privacy/terms screens
