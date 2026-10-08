# BuddyRide1 repair notes

This patch repairs the broken application entry point so it uses the existing Supabase client and existing PassengerHome, DriverHome, and AdminHome screens. It removes the stale Auth page that imported deleted files, and removes the duplicate BrowserRouter / obsolete Capacitor imports from the startup path.

## Apply safely
1. Back up your current `src` folder.
2. Copy the patched `src/App.tsx`, `src/main.tsx`, and `src/styles.css` into your local project.
3. The old `src/pages/Auth.tsx` is no longer used and can be removed.
4. Keep your local `.env.local` file private; this patch does not include it.
5. From the project folder run `npm install`, then `npm run build`, then `npm run dev`.

Required local environment variable names are in `.env.example`. Never publish `.env.local` or share a service-role key.

## Validation status
- TypeScript project build (`tsc -b`) passed in the audit environment.
- Vite production build could not complete in the audit environment because the uploaded `node_modules` lacked Rollup's Linux optional native package. Reinstall dependencies on the target computer (`npm install`, or if needed remove `node_modules` and run `npm install`) and rerun `npm run build`.
- Supabase credentials, policies, Realtime configuration, and Mapbox token were not tested against the live services.
- Do not run `supabase/schema.sql` against an existing database without comparing it to the live schema first.
