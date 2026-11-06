import { useEffect, useState, type ReactNode } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type DashboardAccess = 'checking' | 'pending' | 'approved'

export function DriverDashboardGuard({
  profile,
  onRequireOnboarding,
  children,
}: {
  profile: Profile
  onRequireOnboarding: () => void
  children: ReactNode
}) {
  const [access, setAccess] = useState<DashboardAccess>('checking')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setAccess('checking')
    setError('')
    void (async () => {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('is_verified,verification_status')
        .eq('id', profile.id)
        .single()
      if (!active) return
      if (profileError) {
        setError(`Could not check your driver approval: ${profileError.message}`)
        return
      }

      const { data: documents, error: documentsError } = await supabase
        .from('driver_documents')
        .select('doc_type,status')
        .eq('driver_id', profile.id)
      if (!active) return
      if (documentsError) {
        setError(`Could not check your driver documents: ${documentsError.message}`)
        return
      }
      if ((documents || []).some(document => document.status.toUpperCase() === 'REJECTED')) {
        onRequireOnboarding()
        return
      }

      if (profileData.verification_status === 'pending' || profileData.verification_status === 'pending_verification') {
        setAccess('pending')
        return
      }
      if (profileData.is_verified !== true || profileData.verification_status !== 'approved') {
        onRequireOnboarding()
        return
      }

      setAccess('approved')
    })()
    return () => { active = false }
  }, [profile.id, onRequireOnboarding])

  if (error) return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#b42318', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ maxWidth: 460, padding: 24, borderRadius: 16, background: '#fff', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
      <strong>Could not check driver approval</strong>
      <p>{error}</p>
      <button onClick={() => window.location.reload()} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: '#087f5b', color: '#fff', fontWeight: 700 }}>Retry</button>
    </div>
  </main>

  if (access === 'pending') return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
    <section style={{ width: 'min(100%, 480px)', padding: 32, borderRadius: 16, background: '#fff', textAlign: 'center', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
      <h1 style={{ margin: '0 0 12px' }}>Waiting for Admin Approval</h1>
      <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>We will WhatsApp you on 064 101 8991 after review.</p>
    </section>
  </main>

  if (access !== 'approved') return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085', fontFamily: 'Inter, sans-serif' }}>Checking driver approval…</main>
  return children
}
