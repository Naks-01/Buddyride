import { useEffect, useState, type ReactNode } from 'react'
import { supabase, type Profile } from '../lib/supabase'

const ADMIN_EMAILS = ['buddyride@outlook.com', 'mokgalaka.nt@gmail.com']
const REQUIRED_TYPES = [
  'sa_id',
  'drivers_license',
  'prdp',
  'profile_photo',
  'selfie_holding_id',
  'vehicle_registration',
  'license_disc',
  'car_photo_1',
  'car_photo_2',
  'car_photo_3',
  'car_photo_4',
]

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
        .eq('user_id', profile.id)
      if (!active) return
      if (documentsError) {
        setError(`Could not verify required documents: ${documentsError.message}`)
        return
      }
      const uploadedDocuments = data || []
      const uploaded = new Set(uploadedDocuments.filter(document => document.file_url).map(document => document.doc_type))
      const hasRejectedDocument = uploadedDocuments.some(document => document.status === 'rejected')
      if (hasRejectedDocument || !REQUIRED_TYPES.every(type => uploaded.has(type))) {
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
