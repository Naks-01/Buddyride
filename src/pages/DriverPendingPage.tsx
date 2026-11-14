import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'
const BLUE_DARK = '#0052CC'
const TOTAL_EXPECTED = 15
const IDENTITY_TYPES = new Set(['profile_photo','selfie','sa_id','drivers_license'])

type DocRow = { name: string, reason: string, status: string }

export function DriverPendingPage({ onApproved }: { onApproved?: () => void }) {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('pending_verification')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [rejectedDocs, setRejectedDocs] = useState<DocRow[]>([])
  const [pendingDocs, setPendingDocs] = useState<DocRow[]>([])
  const [approvedCount, setApprovedCount] = useState(0)
  const [totalDocs, setTotalDocs] = useState(TOTAL_EXPECTED)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [identityCount, setIdentityCount] = useState(0)
  const [missingDocs, setMissingDocs] = useState<string[]>([])
  const checkingRef = useRef(false)

  const normalizeKey = (raw: string) => {
    const k = (raw || '').toLowerCase().trim()
    if (k === 'south_african_id' || k === 'id' || k === 'sa_id_document' || k === 'sa-id') return 'sa_id'
    return k
  }

  const prettyName = (key: string) => {
    if (key === 'sa_id') return 'SA ID'
    return key.replace(/_/g, ' ')
  }

  const ALL_DOCS = ['profile_photo','selfie','sa_id','drivers_license','prdp','vehicle_registration','license_disc','vehicle_photo_1','vehicle_photo_2','vehicle_photo_3','vehicle_photo_4','vehicle_interior_photo_1','vehicle_interior_photo_2','huru_criminal_check','vehicle_inspection_report']

  async function checkStatus() {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not logged in - please log in again'); return }
      const [profileRes, docsRes] = await Promise.all([
        supabase.from('profiles')
          .select('phone_number, phone, verification_status, is_verified, verification_rejection_reason, id_number, licence_number')
          .eq('id', user.id).single(),
        supabase.from('driver_documents')
          .select('doc_type,document_type,status,rejection_reason,created_at,file_url,document_url')
          .eq('driver_id', user.id)
          .order('created_at', { ascending: false })
      ])
      if (profileRes.error) throw new Error(`Profile: ${profileRes.error.message}`)
      if (docsRes.error) throw new Error(`Documents: ${docsRes.error.message}`)

      const data = profileRes.data
      if (data) {
        setPhone((data as any).phone_number || (data as any).phone || '')
        const vStatus = (data as any).verification_status || 'pending_verification'
        setStatus(vStatus)
        setRejectionReason((data as any).verification_rejection_reason || null)
        const isApproved = (data as any).is_verified === true || ['approved','verified'].includes(String(vStatus).toLowerCase())
        if (isApproved) {
          if (onApproved) onApproved()
          else window.location.href = '/driver'
          return
        }
        // 2-PHASE: identity_complete does NOT auto-redirect - show Enter App button below
      }

      const latest = new Map<string, any>()
      for (const d of (docsRes.data || [])) {
        const key = normalizeKey(d.doc_type || d.document_type || '')
        if (key && !latest.has(key)) latest.set(key, { ...d, doc_type: key })
      }
      const deduped = [...latest.values()]
      // FIX: total is always 15, not deduped length
      setTotalDocs(TOTAL_EXPECTED)
      setUploadedCount(deduped.filter(d => d.file_url || d.document_url).length)
      setIdentityCount(deduped.filter(d => IDENTITY_TYPES.has(normalizeKey(d.doc_type)) && (d.file_url || d.document_url)).length)
      const missing = ALL_DOCS.filter(k => !latest.has(k))
      setMissingDocs(missing.map(prettyName))

      const approvedList = deduped.filter(d => String(d.status||'').toUpperCase() === 'APPROVED')
      const rejectedList = deduped.filter(d => String(d.status||'').toUpperCase() === 'REJECTED')
      const pendingList = deduped.filter(d => String(d.status||'').toUpperCase() === 'PENDING')

      setApprovedCount(approvedList.length)
      setRejectedDocs(rejectedList.map((d: any) => ({
        name: prettyName(d.doc_type || d.document_type || 'Document'),
        reason: d.rejection_reason || 'Please re-upload a clearer photo.',
        status: d.status,
      })))
      setPendingDocs(pendingList.map((d: any) => ({
        name: prettyName(d.doc_type || d.document_type || 'Document'),
        reason: 'Waiting for admin review',
        status: d.status,
      })))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }

  useEffect(() => {
    void checkStatus()
    let channel: any = null
    let cancelled = false
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user || cancelled) return
      channel = supabase.channel(`pending-${data.user.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${data.user.id}` }, () => { void checkStatus() })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${data.user.id}` }, () => { void checkStatus() })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isRejected = status.toLowerCase() === 'rejected' || rejectedDocs.length > 0 || !!rejectionReason
  // 2-PHASE: Identity done = can enter app
  const isIdentityComplete = status.toLowerCase() === 'identity_complete' || (identityCount === 4 && uploadedCount >= 4)
  const isFullPending = ['pending','pending_verification','submitted','under_review','in_review'].includes(status.toLowerCase())

  const goFixDocuments = () => { window.location.href = '/driver/onboarding' }
  const goViewDocuments = () => { window.location.href = '/driver/onboarding' }
  const enterApp = () => { if (onApproved) onApproved(); else window.location.href = '/driver' }

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ width: 'min(100%, 480px)', padding: 32, borderRadius: 16, background: '#fff', textAlign: 'center', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
        {error && <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginBottom: 12, textAlign: 'left', fontSize: 13, color: '#b42318' }}>{error}</div>}

        {/* 2-PHASE: Identity Complete - Enter App */}
        {isIdentityComplete && !isRejected && (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: '#ECFDF3', fontSize: 32 }}>🎉</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Identity Complete!</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>
              You did identity: Selfie + SA ID + Licence + ID Numbers ✅<br />
              You can enter the app now. Finish <strong style={{ color: '#182230' }}>{TOTAL_EXPECTED - uploadedCount} docs</strong> inside to unlock Go Online.
            </p>
            <div style={{ marginTop: 16, textAlign: 'left', background: BLUE_LIGHT, border: '1px solid #B2CCFF', padding: 12, borderRadius: 10, fontSize: 13 }}>
              <strong>Progress: {uploadedCount}/{TOTAL_EXPECTED} docs • Identity {identityCount}/4 ✅</strong>
              <div style={{ height: 9, background: '#E5E9EF', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ width: `${(uploadedCount/TOTAL_EXPECTED)*100}%`, height: '100%', background: BLUE, borderRadius: 99 }} />
              </div>
              {missingDocs.length > 0 && <div style={{ marginTop: 8, color: '#667085' }}>Still needed: {missingDocs.join(', ')}</div>}
              <div style={{ marginTop: 8, color: BLUE_DARK, fontWeight: 700 }}>Go Online is blocked until all {TOTAL_EXPECTED} docs + Admin approval.</div>
            </div>
            <button onClick={enterApp} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: '#16A34A', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              🚀 Enter App - Finish Rest Inside →
            </button>
            <button onClick={goViewDocuments} style={{ marginTop: 10, width: '100%', padding: 14, border: '1px solid #d0d5dd', borderRadius: 12, background: '#fff', color: '#344054', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Continue Uploading Docs
            </button>
          </>
        )}

        {isRejected ? (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: '#FEF3F2', fontSize: 32 }}>❌</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Documents Need Attention</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>An admin rejected the following. Fix and resubmit:</p>
            {rejectionReason && <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 12, textAlign: 'left', fontSize: 13 }}><strong>Application:</strong> {rejectionReason}</div>}
            {rejectedDocs.map((d, i) => (
              <div key={i} style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 8, textAlign: 'left' }}>
                <strong style={{ textTransform: 'uppercase', fontSize: 13 }}>{d.name}</strong>
                <div style={{ fontSize: 13, color: '#667085' }}>{d.reason}</div>
              </div>
            ))}
            <button onClick={goFixDocuments} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              Fix Documents →
            </button>
          </>
        ) : !isIdentityComplete && isFullPending && (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: BLUE_LIGHT, fontSize: 32, color: BLUE }}>⏳</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Driver application under review</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>
              Thanks for submitting your documents. Our team is reviewing them now.<br /><br />
              We will WhatsApp you {phone ? <>on <strong style={{ color: '#182230' }}>{phone}</strong></> : 'on your registered number'} within 24 hours after review.
            </p>
            {totalDocs > 0 && (
              <div style={{ marginTop: 16, textAlign: 'left', background: BLUE_LIGHT, border: '1px solid #B2CCFF', padding: 12, borderRadius: 10, fontSize: 13 }}>
                <strong>Documents: {uploadedCount}/{totalDocs} uploaded • {approvedCount} Approved</strong>
                {pendingDocs.length > 0 && (
                  <div style={{ marginTop: 8, color: '#667085' }}>
                    Still pending: {pendingDocs.map(d => d.name).join(', ')}
                  </div>
                )}
                {missingDocs.length > 0 && <div style={{ marginTop: 8, color: '#667085' }}>Missing: {missingDocs.join(', ')}</div>}
                <div style={{ marginTop: 8, color: BLUE_DARK, fontWeight: 700 }}>Final approval is done by Admin — you will be notified on WhatsApp.</div>
              </div>
            )}
          </>
        )}
        {/* If not identity and not pending (e.g. not_started) show upload prompt */}
        {!isIdentityComplete && !isRejected && !isFullPending && (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: BLUE_LIGHT, fontSize: 32, color: BLUE }}>📄</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Start Your Driver Application</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>Step 1: Identity - Selfie + SA ID + Licence + ID Numbers. Then app opens.</p>
            <button onClick={goViewDocuments} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              Start Onboarding →
            </button>
          </>
        )}
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#98A2B3' }}>Status: {String(status || 'pending_verification').replace(/_/g, ' ')}</p>
        <button onClick={() => void checkStatus()} disabled={checking} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: checking ? '#cbd2da' : BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: checking ? 'not-allowed' : 'pointer' }}>
          {checking ? 'Checking...' : 'Check Approval Status'}
        </button>
        {!isIdentityComplete && <button onClick={goViewDocuments} style={{ marginTop: 10, width: '100%', padding: 14, border: '1px solid #d0d5dd', borderRadius: 12, background: '#fff', color: '#344054', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          View My Documents
        </button>}
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#98A2B3' }}>Need help? WhatsApp Support on <a href="https://wa.me/27641018991" target="_blank" rel="noreferrer" style={{ color: BLUE, fontWeight: 700 }}>064 101 8991</a></p>
      </section>
    </main>
  )
}