# BuddyRide1 audit and patch notes

## Source reviewed
React + Vite + TypeScript source, Supabase schema, driver/passenger document upload pages, shared navigation upload handlers, auth helpers, passenger/driver homes, admin document handling, and Vercel config.

## Confirmed issues and changes in this patch

| Area | Finding | Patch/status |
|---|---|---|
| Image compression | Passenger home, driver home, and passenger navigation had 1024px / JPEG 0.70 helpers. | Updated to 1280px maximum / JPEG 0.75 and released temporary object URLs. |
| Profile avatar | Profile-photo uploader stores the Supabase public URL string. | Added URL validation and corrected the max-size error text; fixed temporary URL cleanup. |
| Driver documents schema | Upload requirements requested `document_type` / `file_path`, while existing admin and dashboard code uses `doc_type` / `file_url`. | Added synchronized compatibility columns and a unique index; new DriverDocuments uploads write the canonical names and legacy aliases. Apply `supabase/patch_driver_documents.sql` to an existing database. |
| Signup profile | Signup metadata included both phone fields, but the auth trigger only wrote `phone`. | Updated the schema trigger to populate `phone_number` and `phone`, and made client signup check profile upsert errors when a session exists. |
| Upload feedback | Upload buttons did not clearly say compression was happening. | Updated visible labels to `Compressing & Uploading...`. |
| Storage limits | Bucket creation did not explicitly set the requested 50 MB limit or MIME allowlist. | Updated full schema and migration to configure 50 MB limits. |
| Environment file | Archive contained `src/.env.local`; Vite normally reads root env files, and secrets should not be distributed in source archives. | Removed the embedded env file from the deliverable. Create a local root `.env.local` from `.env.example`. |

## Build/test status

`npm run build` was attempted, but the dependency installation in this environment timed out and left incomplete `node_modules`. TypeScript then reported missing type-definition packages (React, Leaflet, Mapbox, Node, etc.), so this is an environment/dependency failure and **not a successful build**. A clean `npm ci` followed by `npm run build` must still be run on a machine with working npm registry access.

No live Supabase project credentials were used for end-to-end tests. Real-time ride assignment, permissions, admin approval, driver GPS, phone/WhatsApp links, and trip state transitions require authenticated test accounts and a configured Supabase project; this archive must not be described as production-verified until those tests pass.

## Local setup

1. Copy `.env.example` to root `.env.local`.
2. Fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_MAPBOX_TOKEN` using the project's own credentials. Never put the Supabase service-role key in a Vite variable.
3. Run `npm ci` and then `npm run build`.
4. In Supabase SQL Editor, run `supabase/patch_driver_documents.sql` for an existing database, or `supabase/schema.sql` only when setting up a clean database as its header states.
5. Verify Storage policies, RLS, Realtime publication, and complete passenger-to-driver trip using two separate accounts before deployment.


## Follow-up hardening pass

Additional changes made in this completion pass:
- Passenger profile photo object names now follow `{userId}/profile_photo-{timestamp}.jpg`.
- Passenger driver card now displays the driver's profile image and phone, with Call, WhatsApp and in-app chat actions.
- Driver incoming request card now attempts to display passenger photo/name/phone and exposes Call/WhatsApp links.
- Driver document keys now use the requested `drivers_license` and `vehicle_papers` names while recognizing legacy database aliases.
- Existing document entries show their status and provide a re-upload action rather than a misleading nonfunctional “View” label.
- Added `supabase/production_hardening.sql` for bucket limits, legacy/current document column synchronization, counterpart profile visibility, narrower ride update policies, storage ownership and realtime publication membership.

## Remaining limitations

A successful production build could not be confirmed in this environment. The uploaded `node_modules` folder was incomplete and permission-restricted, and a clean dependency install did not finish within the available execution window. Run `npm ci` from a normal writable local project folder, then `npm run build`.

The SQL migration has not been executed against the live Supabase instance. Review and run it in a staging project first, especially the ride RLS policy changes, then test passenger cancellation, offered-driver acceptance, assigned-driver status transitions, document uploads and admin approvals with real authenticated accounts. Payment-provider configuration, mobile push notifications, regulatory/operational readiness and a live Vercel smoke test require external credentials and access that are not present here.


## Follow-up hardening pass

Additional changes made in this completion pass:
- Passenger profile photo object names now follow `{userId}/profile_photo-{timestamp}.jpg`.
- Passenger driver card now displays the driver's profile image and phone, with Call, WhatsApp and in-app chat actions.
- Driver incoming request card now attempts to display passenger photo/name/phone and exposes Call/WhatsApp links.
- Driver document keys now use the requested `drivers_license` and `vehicle_papers` names while recognizing legacy database aliases.
- Existing document entries show their status and provide a re-upload action rather than a misleading nonfunctional “View” label.
- Added `supabase/production_hardening.sql` for bucket limits, legacy/current document column synchronization, counterpart profile visibility, narrower ride update policies, storage ownership and realtime publication membership.

## Remaining limitations

A successful production build could not be confirmed in this environment. The uploaded `node_modules` folder was incomplete and permission-restricted, and a clean dependency install did not finish within the available execution window. Offline dependency installation also failed because a required package was not in the local npm cache. Run `npm ci` from a normal writable local project folder, then `npm run build`.

The SQL migration has not been executed against the live Supabase instance. Review and run it in a staging project first, especially the ride RLS policy changes, then test passenger cancellation, offered-driver acceptance, assigned-driver status transitions, document uploads and admin approvals with real authenticated accounts. Payment-provider configuration, mobile push notifications, regulatory/operational readiness and a live Vercel smoke test require external credentials and access that are not present here.
