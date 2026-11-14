import { useEffect, useState, useRef, type ReactNode } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { REQUIRED_DOCS, normalizeDocType, hasRealDocument } from '../lib/driverDocuments'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'

type DashboardAccess = 'checking' | 'pending' | 'approved'

type DocRow = { doc_type?: string | null, document_type?: string | null, status: string | null, rejection_reason?: string | null, created_at?: string | null }

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
  const [profileRejectionReason, setProfileRejectionReason] = useState<string | null>(null)
  const [approvedCount, setApprovedCount] = useState(0)
  const [totalDocs, setTotalDocs] = useState(0)
  const [checking, setChecking] = useState(false)
  const onboardingSentRef = useRef(false)
  const checkingRef = useRef(false)
  const rerunRef = useRef(false)

  const normalizeKey = (raw: string) => {
    const k = normalizeDocType(raw || '')
    if (k === 'south_african_id' || k === 'id' || k === 'sa_id_document' || k === 'sa-id') return 'sa_id'
    return k
  }
  const prettyName = (raw: string) => {
    const k = normalizeKey(raw)
    if (k === 'sa_id') return 'SA ID'
    return k.replace(/_/g, ' ')
  }

  async function check() {
    if (checkingRef.current) { rerunRef.current = true; return }
    checkingRef.current = true
    setChecking(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ownerId = user?.id || profile.id
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('is_verified,verification_status,verification_rejection_reason')
        .eq('id', ownerId)
        .single()
      if (profileError) {
        setError(`Could not check your driver approval: ${profileError.message}`)
        return
      }
      const { data: documents, error: documentsError } = await supabase
        .from('driver_documents')
        .select('doc_type,document_type,status,rejection_reason,created_at,file_url,document_url,storage_path,file_path,expiry_date')
        .eq('driver_id', ownerId)
        .order('created_at', { ascending: false })
      if (documentsError) {
        setError(`Could not check your driver documents: ${documentsError.message}`)
        return
      }
      const docs = (documents || []) as DocRow[]
      const statusOf = (d: DocRow) => (d.status || '').toUpperCase()

      const latest = new Map<string, DocRow>()
      for (const d of docs) {
        const key = normalizeDocType(d.doc_type || d.document_type || '')
        if (!key) continue
        if (!latest.has(key)) latest.set(key, { ...d, doc_type: key })
      }
      const requiredDocuments = REQUIRED_DOCS.map(requirement => latest.get(requirement.type))
      const rejected = requiredDocuments.filter((d): d is DocRow => Boolean(d && statusOf(d) === 'REJECTED'))
      const pending = requiredDocuments.filter((d): d is DocRow => Boolean(d && ['PENDING','PENDING_VERIFICATION'].includes(statusOf(d))))
      const approvedList = requiredDocuments.filter((d, index): d is DocRow => Boolean(d && statusOf(d) === 'APPROVED' && hasRealDocument((d as any).file_url || (d as any).document_url || (d as any).storage_path || (d as any).file_path) && (!REQUIRED_DOCS[index].expiryRequired || ((d as any).expiry_date && new Date(`${(d as any).expiry_date}T00:00:00`).getTime() >= new Date(new Date().toDateString()).getTime()))))
      const completeApproved = requiredDocuments.length === REQUIRED_DOCS.length && approvedList.length === REQUIRED_DOCS.length
      setRejectedDocs(rejected)
      setPendingDocs(pending)
      setApprovedCount(approvedList.length)
      setTotalDocs(REQUIRED_DOCS.length)
      setProfileRejectionReason(profileData.verification_rejection_reason || null)

      const profileApproved = profileData.is_verified === true && ['approved','verified'].includes(String(profileData.verification_status || '').toLowerCase())
      
      // FIX 1: APPROVED -> show dashboard + GO ONLINE
      if (profileApproved && completeApproved) {
        setAccess('approved')
        return
      }

      // FIX 2: REJECTED or PENDING -> show Waiting page INSTANTLY
      if ((String(profileData.verification_status || '').toLowerCase() === 'rejected' && rejected.length === 0) || rejected.length > 0 || ['pending','pending_verification'].includes(String(profileData.verification_status || '').toLowerCase()) ) {
        setAccess('pending')
        return
      }

      // FIX 3: Docs uploaded but profile not approved yet -> MUST show pending, not onboarding loop
      if (docs.length > 0) {
        setAccess('pending')
        return
      }

      // FIX 4: No docs at all -> go to onboarding
      if (!profileApproved || !completeApproved) {
        if (!onboardingSentRef.current) {
          onboardingSentRef.current = true
          onRequireOnboarding()
        }
        return
      }
    } finally {
      checkingRef.current = false
      setChecking(false)
      if (rerunRef.current) { rerunRef.current = false; void check() }
    }
  }

  useEffect(() => {
    void check()
    // FIX: Poll every 5s until approved - fixes "few minutes" delay
    const interval = setInterval(() => {
      if (access !== 'approved') void check()
    }, 5000)

    const ch = supabase.channel(`guard-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, () => check())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${profile.id}` }, () => check())
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, access])

  if (error) return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F6F7F9', color: '#b42318', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ maxWidth: 460, padding: 24, borderRadius: 16, background: '#fff', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
      <strong>Could not check driver approval</strong>
      <p>{error}</p>
      <button onClick={() => check()} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: BLUE, color: '#fff', fontWeight: 700 }}>Retry</button>
    </div>
  </main>

  if (access === 'pending') {
    const hasRejection = rejectedDocs.length > 0 || !!profileRejectionReason
    const allDocsApproved = totalDocs > 0 && approvedCount === totalDocs && pendingDocs.length === 0 && rejectedDocs.length === 0
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F6F7F9', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
    <section style={{ width: 'min(100%, 440px)', padding: '40px 28px', borderRadius: 20, background: '#fff', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', border: '1px solid #EEF0F3' }}>
      <div style={{ width: 64, height: 64, margin: '0 auto 18px', background: BLUE_LIGHT, borderRadius: 16, display: 'grid', placeItems: 'center', fontSize: 30, color: BLUE }}>⏳</div>
      <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>{hasRejection ? 'Documents Need Attention' : 'Waiting for Admin Approval'}</h1>
      {hasRejection ? (
        <>
          <p style={{ color: '#b42318', fontWeight: 700 }}>These documents were rejected:</p>
          {rejectedDocs.map((d, i) => (
            <div key={i} style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 8, textAlign: 'left' }}>
              <strong>{prettyName(d.doc_type || d.document_type || 'Document').toUpperCase()}</strong>
              <div style={{ fontSize: 13, color: '#667085' }}>{d.rejection_reason || 'Please re-upload a clearer photo.'}</div>
            </div>
          ))}
          {rejectedDocs.length === 0 && profileRejectionReason && (
            <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 8, textAlign: 'left' }}>
              <strong>APPLICATION REJECTED</strong>
              <div style={{ fontSize: 13, color: '#667085' }}>{profileRejectionReason}</div>
            </div>
          )}
          <button onClick={onRequireOnboarding} style={{ width: '100%', marginTop: 16, padding: '14px', border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Fix Documents →</button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, color: '#667085', lineHeight: 1.6, fontSize: 14.5 }}>{allDocsApproved ? 'All your documents are approved. Waiting for Admin to activate your account.' : 'Your documents are under review. We will WhatsApp you once approved.'}</p>
          {totalDocs > 0 && (
            <div style={{ marginTop: 16, textAlign: 'left', background: BLUE_LIGHT, border: `1px solid #B2CCFF`, padding: 12, borderRadius: 12, fontSize: 13 }}>
              <strong style={{ color: '#111827' }}>Approved: {approvedCount}/{totalDocs}</strong>
              {pendingDocs.length > 0 && <div style={{ marginTop: 6, color: '#667085' }}>Pending: {pendingDocs.map(d => prettyName(d.doc_type || d.document_type || '')).join(', ')}</div>}
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => check()} disabled={checking} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #D0D5DD', background: '#fff', fontWeight: 700, color: '#344054', cursor: 'pointer' }}>{checking ? 'Checking...' : '↻ Check Again'}</button>
        <a href="https://wa.me/27641018991?text=Hi BuddyRide, I am waiting for driver approval" target="_blank" rel="noreferrer" style={{ flex: 1, padding: '12px', borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, textDecoration: 'none', display: 'grid', placeItems: 'center' }}>WhatsApp Support</a>
      </div>
      <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 12, background: 'none', border: 0, color: '#98A2B3', textDecoration: 'underline', cursor: 'pointer' }}>Log out</button>
    </section>
  </main>
  }

  if (access !== 'approved') return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F6F7F9', color: '#667085', fontFamily: 'Inter, sans-serif' }}>{checking ? 'Checking driver approval…' : 'Loading…'}</main>
  return <>{children}</>
}