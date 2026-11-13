// driverRouting.mjs - pure JS, NO TypeScript types allowed in .mjs

export function getDriverEntryPath(role, verificationStatus, currentPath) {
  // Only drivers get redirected. Passengers / admins stay where they are.
  if (role !== 'driver') return null

  const path = (currentPath || '/').replace(/\/+$/, '') || '/'
  const status = String(verificationStatus || 'not_started').toLowerCase().trim()

  // Don't redirect if already on a driver page - prevents infinite loop
  if (
    path === '/driver/onboarding' ||
    path === '/driver/dashboard' ||
    path === '/driver' ||
    path === '/driver/navigation' ||
    path.startsWith('/driver/navigation/')
  ) {
    return null
  }

  // Driver has never started onboarding -> send to onboarding
  if (status === 'not_started' || status === '' || status === 'null' || status === 'undefined') {
    return '/driver/onboarding'
  }

  // Rejected -> back to onboarding to fix docs
  if (status === 'rejected' || status === 'failed') {
    return '/driver/onboarding'
  }

  // Pending, verified, approved -> dashboard. Guard handles Pending vs Dashboard inside.
  if (
    status === 'pending' ||
    status === 'pending_verification' ||
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
  return (path || '') === '/driver/onboarding'
}

export function isDriverDashboardPath(path) {
  return (path || '') === '/driver/dashboard' || (path || '') === '/driver'
}