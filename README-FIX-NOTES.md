# BuddyRide1 audit and repair notes

## Change made
- Fixed profile creation in `src/App.tsx` so a newly registered driver/admin profile uses the selected role and signup metadata instead of silently defaulting to passenger when the profile row is missing.
- Kept `.env.local` out of this delivery bundle because it contains private project credentials.

## Build/test status
- The source was inspected, but a clean `npm ci` could not finish in this audit environment. The existing dependency install was incomplete, so `npm run build` stopped with missing TypeScript type definitions. This is an environment/dependency installation failure, not proof that all application source is correct.
- Supabase credentials, schema, Row Level Security, Realtime, Storage buckets, Mapbox token, driver/passenger live ride flow, and production behavior have NOT been verified against your actual services.
- Therefore, I cannot honestly claim the app works 100% yet.

## Test on your Windows computer
1. Back up `D:\BuddyPlus\Buddyride`.
2. Extract this archive to a separate folder first and compare it with your project before replacing anything.
3. Copy your own `.env.local` into the project root (do not share or publish it). It needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAPBOX_TOKEN`.
4. In the project folder, run:
   ```powershell
   npm ci
   npm run build
   npm run dev
   ```
5. If `npm ci` fails, close VS Code/dev servers, remove `node_modules` only, then run `npm install` and `npm run build`.
6. Test signup/login for passenger and driver, request a ride, driver sees and accepts it, passenger sees status changes, start/end trip, both sides can message if that feature is implemented, complete trip, rating, cancellation, and refresh/re-login persistence.
7. Do not run `supabase/schema.sql` on your existing database without comparing it with your live schema first; it is intended for a new project and may conflict with existing objects.

## Security
- Never put a Supabase service-role key in browser environment variables. The browser must use the anon/publishable key with correct RLS policies.
- Rotate any credential that was accidentally shared publicly.
