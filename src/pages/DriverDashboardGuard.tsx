import { useEffect, useState, type ReactNode } from 'react'
import { supabase, type Profile } from '../lib/supabase'

const ADMIN_EMAILS = ['buddyride@outlook.com', 'mokgalaka.nt@gmail.com']
const REQUIRED_GROUPS = [
  { types: ['drivers_license', 'prdp'], primary: 'drivers_license' },
  { types: ['vehicle_registration', 'license_disc'], primary: 'vehicle_registration' },
  { types: ['profile_photo', 'selfie_holding_id'], primary: 'profile_photo' },
]
const VEHICLE_PHOTO_TYPES = (number: number) => [`vehicle_photos_${number}`, `car_photo_${number}`]

export function DriverDashboardGuard({
  profile,
  onRequireOnboarding,
  children,
}: {
  profile: Profile
  onRequireOnboarding: () => void
  children: ReactNode
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!active) return
      if (authError) {
        setError(`Could not verify your account: ${authError.message}`)
        return
      }
      if (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        setReady(true)
        return
      }

      const { data, error: documentsError } = await supabase
        .from('driver_documents')
        .select('doc_type,file_url,status')
        .eq('driver_id', profile.id)
      if (!active) return
      if (documentsError) {
        setError(`Could not verify required documents: ${documentsError.message}`)
        return
      }
      const uploadedDocuments = data || []
      const uploaded = new Set(uploadedDocuments.filter(document => document.file_url).map(document => document.doc_type))
      const byType = new Map(uploadedDocuments.map(document => [document.doc_type, document]))
      const requiredTypes = new Set([
        ...REQUIRED_GROUPS.flatMap(group => [...group.types, group.primary]),
        ...[1, 2, 3, 4].flatMap(VEHICLE_PHOTO_TYPES),
      ])
      const hasRejectedDocument = uploadedDocuments.some(document =>
        requiredTypes.has(document.doc_type) && document.status.toUpperCase() === 'REJECTED',
      )
      const groupsComplete = REQUIRED_GROUPS.every(group =>
        group.types.every(type => uploaded.has(type))
        || (group.primary === 'drivers_license'
          && Boolean(byType.get(group.primary)?.file_url
            && byType.get(group.primary)?.status.toUpperCase() === 'APPROVED')),
      )
      const vehiclePhotosComplete = [1, 2, 3, 4].every(number =>
        VEHICLE_PHOTO_TYPES(number).some(type => uploaded.has(type)),
      )
      if (hasRejectedDocument || !groupsComplete || !vehiclePhotosComplete) {
        onRequireOnboarding()
        return
      }
      setReady(true)
    })()
    return () => { active = false }
  }, [profile.id, onRequireOnboarding])

  if (error) return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#b42318', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ maxWidth: 460, padding: 24, borderRadius: 16, background: '#fff', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
      <strong>Could not check your onboarding documents</strong>
      <p>{error}</p>
      <button onClick={() => window.location.reload()} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: '#087f5b', color: '#fff', fontWeight: 700 }}>Retry</button>
    </div>
  </main>

  if (!ready) return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085', fontFamily: 'Inter, sans-serif' }}>Checking driver documents…</main>
  return children
}
