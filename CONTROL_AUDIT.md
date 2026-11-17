# BuddyRide1 — button, menu, and settings audit

## What was inspected

The current source contains 216 buttons, 80 links, 2 forms, and 45 input/select/textarea controls. All 216 buttons have either an `onClick` handler or are form submit buttons; all 80 anchors have an `href`. This is a static source inspection, not proof that every backend action succeeds.

## Passenger controls

| Area | Source-level behaviour | Still needs runtime test |
|---|---|---|
| Registration/login | Role selection, SMS send/resend, OTP verification, signup/login handlers | Real Twilio delivery, Supabase Auth, invalid/expired OTP, duplicate account |
| Pickup/destination | Search suggestions, select locations, map pin selection, use current location | TomTom API key, geolocation permissions, Limpopo coverage |
| Fare/booking | Server quote request and quote ID passed into ride insert | Edge Function, quote expiry, RLS, route/fare consistency |
| Cash/card | Cash creates searching ride; card starts Paystack checkout and callback verification | Paystack test transactions, failed/cancelled payment, duplicate webhook |
| Verification | Selfie + ID document + ID number submitted for admin review | Private bucket access, real uploads, admin approval/rejection |
| My Trips | Now queries the signed-in passenger's own rides | RLS and data correctness with real passenger account |
| Profile | Edit name/phone, upload profile photo | Storage policy and profile update RLS |
| SOS | Creates passenger SOS report with available coordinates | Admin alert/monitoring process; does not call emergency services |
| Chat/rating/cancel | Wired to ride state and database actions | Two-device realtime tests and race conditions |

## Driver controls

| Area | Source-level behaviour | Still needs runtime test |
|---|---|---|
| Onboarding | Identity/doc uploads, bank details, submit-for-review action | Each of the 15 required docs, Storage, expiry validation, admin review |
| Online/offline | Requires approved profile/docs and successful dispatch status write | RLS, status freshness, GPS, driver dispatch under concurrency |
| Incoming requests | Accept/decline/timeout handlers | Multiple drivers, race conditions, expired offer recovery |
| Trip stages | Arrived, start, complete, cancel and rating handlers | Full passenger-driver two-device journey |
| Navigation | BuddyRide Navigation or Waze preference saved and used at pickup/dropoff | Real device navigation, background GPS and deep links |
| Profile | Driver menu now supports editing name/phone and profile photo | Profile RLS and Storage policies |
| Earnings | Uses stored per-ride driver earnings or configured commission fallback | Reconcile against actual fare quote/commission records |
| Wallet/payouts | Displays manual EFT status and support contact | No automatic bank transfer is implemented |
| Safety | Share trip and call emergency number links | Real-world safety process and SOS monitoring |
| Theme/language | Theme changes app appearance and persists; English is the only supported language | Verify persistence on target browser/device |
| Campaigns | Informational screen only | No active campaign/bonus system |

## Administrator controls

| Area | Source-level behaviour | Still needs runtime test |
|---|---|---|
| Dashboard | Loads ride, passenger, driver, active-driver and pending counts | Correct RLS and live data |
| Driver documents | Review, approve/reject document records | All 15 required types, expiry and Storage permissions |
| Passenger review | Displays pending/approved passenger verification records | Admin RPC permissions and correct ID/selfie preview |
| Rides/passengers | Search and administrative actions | RLS, filters, bans and status changes |
| Finance | Date filters, search, CSV export, manual payout status | Stored commission, payout audit trail, bank reconciliation |
| Zones | Add/edit/delete/save zone records | Dispatch still does not enforce these zones |
| Settings | Add/edit/delete fare categories and commission | RPC, table policies, server quote reflects saved settings |
| SOS support | Displays SOS reports | Human monitoring and response SLA; no emergency dispatch integration |

## Removed or clarified misleading controls

- Removed the nonfunctional Google Maps choice from driver navigation preferences.
- Replaced language buttons that only changed local state with an explicit English-only notice.
- Changed passenger My Trips from a placeholder to a real ride-history query.
- Added a driver profile edit screen inside the menu.
- Clarified that payouts are manual and campaigns are informational.
- Clarified that service zones are editable but not enforced by dispatch.

## Manual acceptance sequence before launch

1. Create separate test passenger, driver, and admin accounts.
2. Test signup, OTP wrong code, expired code, resend limit, login, logout, and session restore.
3. Submit and approve passenger verification; verify pending/rejected users cannot book.
4. Upload all 15 driver document types; reject one, replace it, approve all, and verify Go Online gating.
5. Request a cash ride; accept it from another device; test chat, arrival, start, GPS, completion, rating, and trip history.
6. Repeat with Paystack test mode: success, cancellation, failure, refresh on callback, duplicate webhook, and refund workflow.
7. Test both cancellation sides and simultaneous driver acceptance.
8. Test all admin filters, exports, approval buttons, fare settings, zone settings, payout marking, and SOS list.
9. Test offline/poor network, permission denial, browser refresh, app backgrounding, and Android release build.
10. Verify RLS and private Storage from passenger, driver, and admin accounts; do not rely on UI hiding alone.
