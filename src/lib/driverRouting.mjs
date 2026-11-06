export function getDriverEntryPath(role, verificationStatus, currentPath) {
  if (role !== 'driver') return null
  if (['pending', 'pending_verification'].includes(verificationStatus ?? '')) {
    return '/driver-pending'
  }
  if (currentPath.startsWith('/driver/navigation/')) return null
  if (/^\/driver\/(onboarding|dashboard)\/?$/.test(currentPath)) return currentPath
  return '/driver/onboarding'
}
