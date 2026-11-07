import { useEffect, useState, type ReactNode } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type DashboardAccess = 'checking' | 'pending' | 'approved'

type DocRow = { doc_type?: string | null, document_type?: string | null, status: string, rejection_reason?: string | null }

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
  const [rejectedDocs, setRejectedDocs] = useState<DocRow[]>([])
  const [pendingDocs, setPendingDocs] = useState<DocRow[]>([])

  async function check() {
    setAccess('checking')
    setError('')
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('is_verified,verification_status')
      .eq('id', profile.id)
      .single()
    if (profileError) {
      setError(`Could not check your driver approval: ${profileError.message}`)
      return
    }
    // FIXED: Select both doc_type AND document_type + rejection_reason
    const { data: documents, error: documentsError } = await supabase
      .from('driver_documents')
      .select('doc_type,document_type,status,rejection_reason')
      .eq('driver_id', profile.id)
    if (documentsError) {
      setError(`Could not check your driver documents: ${documentsError.message}`)
      return
    }
    const docs = (documents || []) as DocRow[]
    const rejected = docs.filter(d => d.status.toUpperCase() === 'REJECTED')
    const pending = docs.filter(d => ['PENDING','PENDING_VERIFICATION'].includes(d.status.toUpperCase()))
    setRejectedDocs(rejected)
    setPendingDocs(pending)

    if (rejected.length > 0) {
      // Don't auto-redirect - show driver WHAT was rejected first
      setAccess('pending')
      return
    }
    if (profileData.verification_status === 'pending' || profileData.verification_status === 'pending_verification') {
      setAccess('pending')
      return
    }
    // FIXED: Accept either is_verified OR status=approved / verified (your DB uses both)
    const approved = profileData.is_verified === true || ['approved','verified'].includes((profileData.verification_status || '').toLowerCase())
    if (!approved) {
      onRequireOnboarding()
      return
    }
    setAccess('approved')
  }

  useEffect(() => {
    void check()
    // LIVE: Auto-unlock when admin approves - no restart needed
    const ch = supabase.channel(`guard-${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, () => check())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${profile.id}` }, () => check())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  if (error) return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#b42318', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ maxWidth: 460, padding: 24, borderRadius: 16, background: '#fff', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
      <strong>Could not check driver approval</strong>
      <p>{error}</p>
      <button onClick={() => check()} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: '#087f5b', color: '#fff', fontWeight: 700 }}>Retry</button>
    </div>
  </main>

  if (access === 'pending') return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
    <section style={{ width: 'min(100%, 480px)', padding: 32, borderRadius: 16, background: '#fff', textAlign: 'center', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
      <div style={{ fontSize: 48 }}>⏳</div>
      <h1 style={{ margin: '12px 0' }}>{rejectedDocs.length > 0 ? 'Documents Need Attention' : 'Waiting for Admin Approval'}</h1>
      {rejectedDocs.length > 0 ? (
        <>
          <p style={{ color: '#b42318', fontWeight: 700 }}>These documents were rejected:</p>
          {rejectedDocs.map((d, i) => (
            <div key={i} style={{ background: '#fef3f2', border: '1px solid #fecdca', padding: 12, borderRadius: 10, marginTop: 8, textAlign: 'left' }}>
              <strong>{(d.doc_type || d.document_type || 'Document').replace(/_/g, ' ').toUpperCase()}</strong>
              <div style={{ fontSize: 13, color: '#667085' }}>{d.rejection_reason || 'Please re-upload a clearer photo.'}</div>
            </div>
          ))}
          <button onClick={onRequireOnboarding} style={{ width: '100%', marginTop: 16, padding: '14px', border: 0, borderRadius: 12, background: '#087f5b', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Fix Documents →</button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>Your documents are under review. We will WhatsApp you once approved.</p>
          {pendingDocs.length > 0 && <p style={{ fontSize: 13, color: '#667085' }}>Pending: {pendingDocs.map(d => (d.doc_type || d.document_type || '').replace(/_/g, ' ')).join(', ')}</p>}
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => check()} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #d0d5dd', background: '#fff', fontWeight: 700 }}>↻ Check Again</button>
        <a href="https://wa.me/27641018991?text=Hi BuddyRide, I am waiting for driver approval" target="_blank" rel="noreferrer" style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#25D366', color: '#000', fontWeight: 800, textDecoration: 'none', display: 'grid', placeItems: 'center' }}>WhatsApp Support</a>
      </div>
      <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 12, background: 'none', border: 0, color: '#667085', textDecoration: 'underline' }}>Log out</button>
    </section>
  </main>

  if (access !== 'approved') return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085', fontFamily: 'Inter, sans-serif' }}>Checking driver approval…</main>
  return <>{children}</>
}