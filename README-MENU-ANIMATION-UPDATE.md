# BuddyRide1 menu and splash-screen update

This update is based on the latest `BuddyRide1-repair-step1.zip` project. It adds a role-aware navigation drawer to the passenger, driver, and admin headers, and an animated startup splash screen using the existing BuddyRide logo assets.

## Included
- Hamburger menu / side drawer with role-specific links.
- Profile summary and sign out.
- Trip history read from Supabase `rides` table.
- Driver earnings summary using the existing `driver_earnings` field; admin platform earnings uses `buddyride_commission`.
- Passenger saved Home/Work fields (currently session-only; not persisted to Supabase yet).
- Settings toggles (currently session-only; they do not change device permissions or server notifications).
- Safety and help information screens.
- Animated logo intro screen on app startup.
- Existing Supabase, Mapbox, ride booking, and 80% driver / 20% BuddyRide fare logic retained.

## Setup
1. Extract the ZIP over a copy of your current project, or copy the changed source files into the same project. Do not delete your existing `.env.local`.
2. Ensure `.env.local` contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAPBOX_TOKEN`.
3. In VS Code terminal at the project root, run `npm install`, then `npm run dev`.
4. Run `npm run build` to perform the full TypeScript/Vite build in your environment.

## Important limitations
This is a menu and startup-animation upgrade, not a claim that every Uber/Bolt production service is implemented. Real payment processing, payouts, emergency calling, persistent saved places/settings, support workflows, and production safety features still require backend/provider integration and testing. The menu reads trip data from the existing `public.rides` table and therefore relies on correct Supabase schema and Row Level Security policies.
