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

  // FIXED: identity_complete = INSIDE APP - /driver Home - finish rest inside
  if (status === 'identity_complete') {
    if (path === '/' || path === '/driver/onboarding' || path === '/driver/pending' || path === '/driver-pending' || path === '/driver/dashboard') {
      return '/driver'
    }
    return null
  }

  // Approved / verified -> /driver Home
  if (status === 'approved' || status === 'verified') {
    if (path === '/' || path === '/driver/onboarding' || path === '/driver/pending' || path === '/driver-pending' || path === '/driver/dashboard') {
      return '/driver'
    }
    return null
  }

  // Pending after FULL submit (15/15) -> /driver/pending
  if (status === 'pending' || status === 'pending_verification' || status === 'submitted' || status === 'under_review' || status === 'in_review') {
    if (path === '/driver/pending' || path === '/driver-pending') return null
    return '/driver/pending'
  }

  // New / rejected -> onboarding
  if (status === 'not_started' || status === '' || status === 'null' || status === 'undefined' || status === 'rejected' || status === 'failed' || status === 'incomplete') {
    if (path === '/driver/onboarding') return null
    return '/driver/onboarding'
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