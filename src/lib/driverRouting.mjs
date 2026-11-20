// driverRouting.mjs - pure JS, NO TypeScript types allowed in .mjs

/**
 * @param {string} role
 * @param {string | null | undefined} verificationStatus
 * @param {string} currentPath
 * @returns {string | null}
 */
export function getDriverEntryPath(role, verificationStatus, currentPath) {
  if (role !== 'driver') return null

  const path = String(currentPath || '/').replace(/\/+$/, '') || '/'
  if (path.startsWith('/driver/navigation/') || path === '/driver/navigation') return null

  const status = String(verificationStatus || 'not_started').toLowerCase().trim()

  // FIXED: identity_complete / approved / verified stuck on /driver-pending
  // Old code returned null for /driver-pending early, so driver never left Pending page
  if (status === 'identity_complete' || status === 'approved' || status === 'verified') {
    if (path === '/driver-pending' || path === '/driver/onboarding' || path === '/') {
      return '/driver/dashboard'
    }
    // Already on dashboard / in-app route - stay
    return null
  }

  // FIX: Never kick driver OUT of onboarding / dashboard - Guard decides Pending vs Dashboard inside.
  if (path === '/driver/onboarding' || path === '/driver/dashboard' || path === '/driver' || path === '/driver-pending') {
    return null
  }

  if (status === 'pending' || status === 'pending_verification' || status === 'submitted' || status === 'under_review' || status === 'in_review') {
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

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isDriverOnboardingPath(path) {
  return String(path || '') === '/driver/onboarding'
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isDriverDashboardPath(path) {
  const p = String(path || '')
  return p === '/driver/dashboard' || p === '/driver'
}