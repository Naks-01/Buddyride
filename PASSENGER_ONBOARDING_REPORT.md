# Passenger Onboarding Report

**Scope:** Passenger signup, safety onboarding, ID collection, admin review, and ride-request checks after the passenger verification updates.

## Executive Summary

Passenger signup uses the shared account form and routes directly to `PassengerHome`; there is no dedicated `/passenger/onboarding` route. Safety verification is deferred until the passenger requests a ride. The request UI then requires a selfie and one ID method: a photo of an SA ID/passport or a typed ID/passport number.

The current passenger safety modal stores the selfie in `passenger-photos/{user_id}.jpg` and the ID photo in `passenger-ids/{user_id}.jpg`. Typed ID numbers and the selected verification method are stored on `profiles` (`id_number`, `id_verification_method`). Submission sets `verification_status = 'pending_verification'` and leaves `id_verified` and `is_verified` false. Thirteen-digit numbers are checked for date validity and Luhn checksum. Other non-empty values are accepted as passport numbers.

Passengers cannot create rides until an admin approves their ID. The ride-insert RLS policy and `guard_ride_changes` require `is_verified = true`, a `verification_status` of `verified` or `approved`, and a non-banned profile. The Passenger Safety admin tab displays pending profile-based submissions; an admin-only RPC approves them, while rejection marks the profile rejected/unverified. This is manual review, not a Home Affairs integration.

## Current Flow

1. **Signup/login.** A passenger chooses Passenger on the shared auth form. Signup collects full name, phone, email, and password and creates/loads a passenger profile.
2. **Passenger landing.** After authentication, non-driver users render `PassengerHome`. `App.tsx` does not route passengers to `/passenger/onboarding` or a passenger dashboard URL.
3. **Ride setup.** The passenger chooses pickup, destination, ride category, and payment method. They can estimate a fare before verification.
4. **Ride-request guard.** `requestRide()` blocks while safety status is loading and requires pickup and destination. If `isVerified` is false, it opens the safety modal instead of calling `createRide()`.
5. **Safety check.** The modal requires a selfie and either a photo ID or typed number. It also offers Cash/Card payment selection. Submission sends the ID details for admin approval.
6. **Pending submission.** The client validates 13-digit South African ID numbers and calls `verify_passenger_safety`. The profile remains pending; the passenger sees that rides are blocked until admin approval.
7. **Database ride guard.** The `rides_passenger_insert` RLS policy and `guard_ride_changes` trigger require `is_verified = true`, `verification_status` in `verified` or `approved`, and a non-banned passenger. Admin access uses `public.is_admin()`.
8. **Passenger Safety admin review.** Admin Documents displays pending profiles with selfie, ID photo (when provided), ID number, and method. Approve calls `approve_passenger_safety`; reject sets status to `rejected` and clears verified flags.
9. **Legacy document records.** A clearly labelled Legacy Passengers tab remains for old `passenger_documents` rows, but its review no longer changes the current passenger safety verification state.

## Gaps

| Area | Current behavior | Gap / implication |
|---|---|---|
| Dedicated onboarding route | Passenger renders `PassengerHome` directly after login/signup. | No separate passenger onboarding route or completion screen; verification is prompted at ride request. |
| ID photo or number collection | Current ride-request modal captures an ID photo or accepts a typed ID/passport number. | Collection occurs only when requesting a ride, not during signup. |
| SA ID validation | Exactly 13 digits are validated for calendar-valid birthdate and Luhn checksum in the client and SQL RPC. Other non-empty values are treated as passport numbers. | Passport format/validity is not checked. SA ID validation is format/checksum only, not an identity match. |
| Actual identity verification | Submission is marked `pending_verification`; admins may approve or reject. | Manual review only; no Home Affairs integration or external identity match. “We will verify this with Home Affairs later” is messaging, not an integration. |
| Passport validation | Non-empty non-13-digit strings are accepted as passport numbers. | Passport format/validity is not checked. SA ID validation is format/checksum only, not an identity match. |
| Legacy passenger documents | Legacy `passenger_documents` review remains available under an explicitly labelled Legacy Passengers tab. | It is separate from the current flow and no longer changes current passenger verification state. |
| Pending ride behavior | Passenger ride creation is blocked until admin approval. | No rides can be requested while verification is pending. |
| ID privacy | ID images are stored in the private `passenger-ids` bucket and shown to admins through signed URLs. | Typed ID numbers remain sensitive profile data; restrict admin access and data retention appropriately. |

## Files Involved

### Signup and routing

- [App.tsx](./src/App.tsx) — shared passenger/driver signup, profile load, selfie interstitial, and role-based rendering.
- [LandingPage.tsx](./src/pages/LandingPage.tsx) — entry point to login/signup.
- [auth.ts](./src/lib/auth.ts) — profile loading and authentication helpers.

### Current passenger safety and ride-request flow

- [PassengerHome.tsx](./src/pages/PassengerHome.tsx) — safety status loading, camera capture/upload, ID validation, ride-request guard, and ride creation.
- [PassengerSafetyModal.tsx](./src/components/PassengerSafetyModal.tsx) — selfie, ID method, payment selection, and submit UI.
- [supabase.ts](./src/lib/supabase.ts) — `Profile` ID verification fields.
- [schema.sql](./supabase/schema.sql) — profile fields, SA ID validation, verification RPCs, ride trigger, and RLS.
- [passenger_safety_id_fallback.sql](./supabase/migrations/passenger_safety_id_fallback.sql) — profile ID fields, submission/approval RPCs, and ride policy updates.
- [20261105111500_passenger_safety_admin_review.sql](./supabase/migrations/20261105111500_passenger_safety_admin_review.sql) — deployable update for pending review, admin approval, ride guard, and RLS.
- [20261106_block_pending_rides.sql](./supabase/migrations/20261106_block_pending_rides.sql) — blocks ride creation until passenger ID approval.

### Legacy passenger-document/admin flow

- [PassengerNavigationMenu.tsx](./src/components/PassengerNavigationMenu.tsx) — passenger profile/navigation menu; legacy ID-document upload UI removed.
- [AdminDocuments.tsx](./src/pages/AdminDocuments.tsx) — admin Drivers, Passenger Safety, and explicitly labelled Legacy Passengers tabs.
- [AdminPassengers.tsx](./src/pages/AdminPassengers.tsx) — separate passenger administration module; it is not the current safety verification flow.

## Code Snapshots

### Passenger routing in `App.tsx`

```tsx
if (profile.role === 'driver') {
  // Driver routes ...
}
// Other admin routes ...
return <PassengerHome profile={profile} />
```

Passengers do not get a dedicated onboarding route; they land in `PassengerHome`.

### Client ride-request guard in `PassengerHome.tsx`

```tsx
async function requestRide() {
  if (!verificationLoaded) {
    setRideError('Safety verification is still loading. Please try again.')
    return
  }
  if (!isVerified) {
    setRideError('Your ID is pending approval by Admin. You cannot request a ride until approved.')
    setVerificationError('')
    setShowSafetyModal(true)
    return
  }
  if (!pickup.trim() || !dropoff.trim()) {
    setRideError('Choose a pickup and destination from the location suggestions.')
    return
  }
  await createRide()
}

async function createRide() {
  if (!isVerified) throw new Error('Not approved')
  // Create ride after approval...
}
```

`verify_passenger_safety` records the submission as pending; ride creation remains blocked until admin approval.

### Passenger identity gate

```tsx
const isVerified = (
  verificationLoaded
  && safetyProfile.is_verified === true
  && ['verified', 'approved'].includes(verificationStatus)
)
```

### ID capture and verification submission

```tsx
const bucket = document.type === 'passenger_selfie'
  ? 'passenger-photos'
  : 'passenger-ids'
const path = `${profile.id}.jpg`
```

```tsx
const { error } = await supabase.rpc('verify_passenger_safety', {
  p_method: safetyIdMethod,
  p_id_number: safetyIdMethod === 'id_number' ? trimmedIdNumber : null,
  p_id_document_url: safetyIdMethod === 'id_photo' ? idDocumentUrl : null,
})
if (error) throw error
setRideError('Your ID is pending approval by Admin. You cannot request a ride until approved.')
```

### Database ride-insert check

```sql
create policy "rides_passenger_insert" on public.rides for insert with check (
  public.is_admin()
  or (
    auth.uid() = passenger_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'passenger'
        and p.is_verified = true
        and p.verification_status in ('verified', 'approved')
        and not p.is_banned
    )
  )
);
```

### Admin passenger document requirements

```tsx
const LEGACY_PASSENGER_DOCUMENTS = [
  { id: 'profile_photo', label: 'Profile Photo / Selfie', required: true },
  { id: 'sa_id', label: 'SA ID / Passport', required: true },
]
```

This explicitly labelled legacy tab reads `passenger_documents`; current submissions are reviewed in the Passenger Safety tab from profile columns and storage buckets.
