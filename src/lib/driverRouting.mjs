export function getDriverEntryPath(role, verificationStatus, currentPath) {
  if (role !== 'driver') return null
  const path = (currentPath || '/').replace(/\/+$/, '') || '/'
  if (path.startsWith('/driver/navigation/')) return null
  if (path === '/driver/onboarding' || path === '/driver/dashboard' || path === '/driver') {
    return null
  }
  const status = (verificationStatus || 'not_started').toLowerCase()
  if (status === 'not_started' || status === '' || status === 'rejected' || status === 'incomplete') {
    return '/driver/onboarding'
  }
  return '/driver/dashboard'
}