// driverRouting.mjs - pure JS, NO TypeScript types allowed in .mjs

export function getDriverEntryPath(role, verificationStatus, currentPath) {
  if (role !== 'driver') return null

  const path = (currentPath || '/').replace(/\/+$/, '') || '/'
  if (path.startsWith('/driver/navigation/') || path === '/driver/navigation') return null

  const status = String(verificationStatus || 'not_started').toLowerCase().trim()

  // FIX: Never kick driver OUT of onboarding / dashboard - Guard decides Pending vs Dashboard inside.
  // Old code forced pending -> /driver-pending even when driver was on /driver/onboarding fixing docs = stuck loop.
  if (path === '/driver/onboarding' || path === '/driver/dashboard' || path === '/driver' || path === '/driver-pending') {
    return null
  }

  if (status === 'pending' || status === 'pending_verification') {
    return '/driver-pending'
  }
  if (status === 'not_started' || status === '' || status === 'null' || status === 'undefined' || status === 'rejected' || status === 'failed' || status === 'incomplete') {
    return '/driver/onboarding'
  }

  // Approved/verified drivers retain the current in-app route.
  if (path === '/') {
    return '/driver/dashboard'
  }
  return null
}

export function isDriverOnboardingPath(path) {
  return (path || '') === '/driver/onboarding'
}

export function isDriverDashboardPath(path) {
  return (path || '') === '/driver/dashboard' || (path || '') === '/driver'
}