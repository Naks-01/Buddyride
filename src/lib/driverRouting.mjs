// driverRouting.mjs - pure JS, NO TypeScript types allowed in .mjs

function normalizePath(raw) {
  // FIX: Strip query + hash - was "/driver/dashboard?tab=earnings" not matching, caused redirect loop
  const withoutQuery = String(raw || '/').split('?')[0].split('#')[0]
  const path = withoutQuery.replace(/\/+$/, '') || '/'
  return path
}

function normalizeStatus(raw) {
  return String(raw ?? 'not_started').toLowerCase().trim().replace(/\s+/g, '_')
}

export function getDriverEntryPath(role, verificationStatus, currentPath) {
  if (role !== 'driver') return null

  const path = normalizePath(currentPath)
  const status = normalizeStatus(verificationStatus)

  // FIX: Allow ALL driver pages - was only 4 paths, /driver/earnings / /driver/profile redirected in a loop
  if (
    path === '/driver/onboarding' ||
    path.startsWith('/driver/dashboard') ||
    path === '/driver' ||
    path.startsWith('/driver/') // any /driver/* page is safe, don't redirect
  ) {
    return null
  }

  // Never started / incomplete -> onboarding
  if (status === 'not_started' || status === '' || status === 'null' || status === 'undefined' || status === 'incomplete' || status === 'draft') {
    return '/driver/onboarding'
  }

  // Rejected / failed / suspended -> onboarding to fix docs
  if (status === 'rejected' || status === 'failed' || status === 'suspended' || status === 'blocked') {
    return '/driver/onboarding'
  }

  // Pending / under review / verified / approved -> dashboard, guard inside handles pending UI
  if (
    status === 'pending' ||
    status === 'pending_verification' ||
    status === 'under_review' ||
    status === 'in_review' ||
    status === 'review' ||
    status === 'submitted' ||
    status === 'verified' ||
    status === 'approved' ||
    status === 'active' ||
    status === 'verified_driver'
  ) {
    return '/driver/dashboard'
  }

  // Unknown status -> onboarding is safe default
  return '/driver/onboarding'
}

export function isDriverOnboardingPath(path) {
  return normalizePath(path) === '/driver/onboarding'
}

export function isDriverDashboardPath(path) {
  const p = normalizePath(path)
  return p === '/driver/dashboard' || p === '/driver' || p.startsWith('/driver/dashboard/')
}

export function shouldBlockDriverOnline(verificationStatus, docsOk, vehicleOk) {
  // FIX: Helper - was scattered logic in Dashboard, some drivers went online with docsOk=false
  const status = normalizeStatus(verificationStatus)
  if (!['verified', 'approved', 'active', 'verified_driver'].includes(status)) return true
  if (!docsOk || !vehicleOk) return true
  return false
}