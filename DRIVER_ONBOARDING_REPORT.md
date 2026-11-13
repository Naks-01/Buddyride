# Driver Onboarding Report

**Scope:** Current driver signup, onboarding, document storage, admin review, and online-access flow after the South African compliance updates.

## Executive summary

Driver onboarding routes through `/driver/onboarding`. It now collects an SA ID/passport, separate driver's licence and PrDP documents, profile selfie, separate selfie holding ID, vehicle registration, licence disc, and four distinct vehicle photos. Licence, PrDP, and licence-disc expiry dates are required; a PrDP number and bank payout details are also required before submission.

Submitting invokes `submit_driver_documents_for_review`. The driver remains on an “Under Review” screen, and the dashboard is locked until admin approval. Admins review each document type independently and must approve every required document before approving the driver. The dashboard online gate requires both `profiles.is_verified = true` and `verification_status = 'approved'`, with no rejected document.

Expiry warnings are computed client-side on the dashboard and refreshed every 24 hours; there is no server-side cron job in this implementation.

## 1. Current flow and screens, in order

1. **Driver landing and account signup.** The user starts from the landing page, chooses the driver role on the shared signup flow, and provides account details.
2. **Driver routing.** New or incomplete driver profiles are directed to `/driver/onboarding`. Dashboard routes pass through `DriverDashboardGuard`.
3. **Document collection.** The onboarding screen asks for seven individual document categories plus four vehicle photo slots:
   - SA ID / passport (`sa_id`)
   - Driver's licence (`drivers_license`) with expiry date
   - PrDP / PDP (`prdp`) with expiry date and PrDP number
   - Profile selfie (`profile_photo`)
   - Separate selfie holding ID (`selfie_holding_id`)
   - Vehicle registration (`vehicle_registration`)
   - Licence disc (`license_disc`) with expiry date
   - Vehicle photos: front, back, left, and right (`vehicle_photos_1` through `_4`)
4. **Bank details.** The driver selects Capitec, FNB, Standard Bank, ABSA, or Nedbank and enters account holder, account number, and branch code.
5. **Submit for review.** The client saves the bank and document metadata, then calls the submission RPC. The RPC independently checks required document types, separate file URLs, distinct selfie hashes, future expiry dates, PrDP number, non-rejected document status, and complete bank details.
6. **Pending review.** The onboarding page displays “Under Review — We will WhatsApp you in 24h” and does not redirect to the dashboard. It polls the profile every 30 seconds to detect an admin approval.
7. **Admin review.** Admins review and approve/reject each document individually. “Approve to Drive” is enabled only when every required document is approved and not expired.
8. **Dashboard access and online eligibility.** Pending drivers see “Waiting for Admin Approval” instead of the dashboard. Approved access and the online control require verified/approved profile state and no rejected documents.

## 2. Documents and South African compliance gaps

| Document / data | Current onboarding behavior | Notes |
|---|---|---|
| SA ID / passport | Required separate upload | No Home Affairs or other identity-provider verification is implemented. |
| Driver's licence | Required separate upload and future expiry date | Admin review is manual. |
| PrDP / PDP | Required separate upload, PrDP number, and future expiry date | The official permit requirements should be confirmed for the service and vehicle class. |
| Profile selfie | Required camera capture | Sets the profile avatar and is stored as its own document. |
| Selfie holding ID | Required separate camera capture | Client and submission RPC reject matching selfie file/hash values. |
| Vehicle registration | Required separate upload | Manual review. |
| Licence disc | Required separate upload and future expiry date | Dashboard displays expiry warnings within 30 days or after expiry. |
| Vehicle photos | Four required, distinct uploads: front/back/left/right | Stored as separate document types. |
| Bank/payout details | Required bank dropdown and account fields | Stored on `profiles`; bank-account validation is limited to required non-empty values. |
| Expiry handling | Future dates required for licence, PrDP, and disc | Warnings are client-side, checked at dashboard load and every 24 hours; no scheduled server-side cron is configured. |

Potential follow-up areas include an identity-verification integration, automated expiry notifications, and confirmation of any additional insurance, roadworthiness, operating-permit, or other evidence applicable to BuddyRide's operating model. This report is a code-based assessment, not legal advice.

## 3. Database tables and columns

There is no `public.drivers` table in the current schema. Driver profile state is stored in `public.profiles`; document records are stored in `public.driver_documents`.

### `public.profiles`

Relevant fields include:

- Account and role: `id`, `email`, `role`, `full_name`, `phone`, `phone_number`
- Profile and approval: `avatar_url`, `is_verified`, `verification_status`
- Vehicle/profile details: `car_model`, `car_plate`, `car_color`
- Payout details: `bank_name`, `bank_account_holder`, `bank_account_number`, `bank_branch_code`
- Availability and metrics: `is_online`, `current_lat`, `current_lng`, `wallet_balance`, `trips_completed`, `rating`

### `public.driver_documents`

| Column | Purpose |
|---|---|
| `id` | Row UUID |
| `driver_id` | Foreign key to `profiles.id` |
| `doc_type` | Document category |
| `file_url` | Uploaded file URL |
| `status` | `PENDING`, `APPROVED`, or `REJECTED` |
| `created_at` | Upload/record timestamp |
| `expiry_date` | Licence, PrDP, or disc expiry |
| `prdp_number` | PrDP number for the PrDP row |
| `document_hash` | SHA-256 digest used to enforce separate selfie files |
| `file_path`, `storage_path`, `file_name`, `file_size`, `file_type` | File metadata |
| `rejection_reason`, `reviewed_at`, `reviewed_by` | Admin review metadata |

The `(driver_id, doc_type)` unique key supports independent upserts for each document type.

## 4. Admin approval and online gating

- `AdminDocuments.tsx` provides per-document viewing, approval, and rejection. Linked-type review updates have been removed so one document approval does not approve another category.
- SA ID and all other required documents participate in the final admin approval check.
- Rejections set the driver's profile to unverified/rejected; the driver can return to onboarding to replace rejected documents.
- `approveToDrive` sets `is_verified = true` and `verification_status = 'approved'`.
- `DriverDashboardGuard.tsx` prevents dashboard access while pending, sends rejected or otherwise unapproved drivers back to onboarding, and allows access only for approved/verified profiles.
- `DriverHome.tsx` repeats the approval and rejected-document checks before enabling online status.
- Expired documents are not treated as approved in the admin review status. Dashboard warnings report documents expiring within 30 days or already expired.

## 5. Files involved

### Main flow and admin review

- [LandingPage.tsx](./src/pages/LandingPage.tsx) — driver landing CTA.
- [App.tsx](./src/App.tsx) — signup, role/profile routing, and driver route selection.
- [DriverOnboarding.tsx](./src/pages/DriverOnboarding.tsx) — document uploads, bank details, progress, submission, and pending-review state.
- [DriverDashboardGuard.tsx](./src/pages/DriverDashboardGuard.tsx) — approval gate before dashboard access.
- [DriverHome.tsx](./src/pages/DriverHome.tsx) — online eligibility and expiry warnings.
- [AdminDocuments.tsx](./src/pages/AdminDocuments.tsx) — admin review and approval.
- [driverDocuments.ts](./src/lib/driverDocuments.ts) — shared document requirements and type normalization.

### Persistence

- [supabase.ts](./src/lib/supabase.ts) — TypeScript `Profile` and `DriverDocument` types.
- [schema.sql](./supabase/schema.sql) — base profile/document schema and submission RPC.
- [driver_onboarding_sa_compliance.sql](./supabase/migrations/driver_onboarding_sa_compliance.sql) — additive bank/document columns and server-side submission checks.

## 6. Code snapshots

### Separate document types and expiry metadata

Source: [DriverOnboarding.tsx](./src/pages/DriverOnboarding.tsx)

```tsx
{ type: 'sa_id', title: 'SA ID / Passport', ... }
{ type: 'drivers_license', title: "Driver's Licence", expiryRequired: true, ... }
{ type: 'prdp', title: 'PDP / PrDP', expiryRequired: true, prdpNumberRequired: true, ... }
{ type: 'profile_photo', title: 'Selfie', ... }
{ type: 'selfie_holding_id', title: 'Selfie Holding ID', ... }
{ type: 'vehicle_registration', title: 'Vehicle Registration', ... }
{ type: 'license_disc', title: 'Licence Disc', expiryRequired: true, ... }
```

### Dashboard online gate

Source: [DriverHome.tsx](./src/pages/DriverHome.tsx)

```tsx
const canGoOnline = documentsLoaded
  && profileVerified
  && verificationStatus === 'approved'
  && !hasRejectedDocuments
```

### Server-side submission

Source: [driver_onboarding_sa_compliance.sql](./supabase/migrations/driver_onboarding_sa_compliance.sql)

The submission RPC rejects incomplete bank details, missing required document types, reused file URLs, matching profile/selfie-holding-ID hashes, missing or expired required dates, missing PrDP number, and rejected required documents before setting `pending_verification`.
