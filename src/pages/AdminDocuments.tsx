import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { createDriverDocumentSignedUrl, REQUIRED_DOCS, normalizeDriverDocType, hasRealDocument as hasRealFile } from '../lib/driverDocuments'

const CATEGORIES: Record<string, { label: string, seats: string, icon: string }> = {
  buddy_lite: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  buddy_plus: { label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  buddy_max: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  go: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  economy: { label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  comfort: { label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  xl: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy_xl: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
  buddy_family: { label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
}
function categoryForRideType(raw: string | null | undefined) {
  const v = String(raw || '').toLowerCase().trim()
  return CATEGORIES[v] || CATEGORIES.buddy_plus
}
function fixPdp(raw: string | null | undefined) {
  const t = String(raw || '').toLowerCase().trim()
  if (t.includes('prdp') || t.includes('pdp') || t === 'professional_driving_permit' || t.includes('pr_dp')) return 'prdp'
  return normalizeDriverDocType(raw || '')
}
export const DRIVER_DOCUMENTS = REQUIRED_DOCS.map((document, index) => ({
  id: fixPdp(document.type), label: document.label, section: document.section,
  expiryRequired: Boolean(document.expiryRequired), helper: document.label,
  accept: 'image/*,application/pdf', required: true, order: index + 1,
}))
function errMsg(e: any) { return e?.message || e?.error_description || e?.details || (typeof e === 'string' ? e : JSON.stringify(e)) }
function isExpired(d?: string | null) {
  if (!d) return false
  return new Date(String(d).slice(0, 10) + 'T00:00:00').getTime() < new Date(new Date().toDateString()).getTime()
}
function getDocumentUrl(doc?: any) { return doc?.document_url?.trim() || doc?.file_url?.trim() || doc?.file_path?.trim() || doc?.storage_path?.trim() || doc?.file_name?.trim() || '' }
// FIX: Single hasRealDocument - was local + imported versions, local shadowed import and missed fake checks
function hasRealDocument(doc?: any) {
  const p = getDocumentUrl(doc)
  if (!p) return false
  const lower = p.toLowerCase()
  if (lower.includes('temp.fix') || lower.includes('temp_fix') || lower.includes('no real file') || lower === 'test' || lower === 'fake') return false
  return hasRealFile(p)
}
function safeStatus(s?: string | null) { return (s || 'PENDING').trim().toLowerCase() }
function displayStatus(doc?: any, optional = false) {
  if (!doc) return optional ? 'OPTIONAL' : 'MISSING'
  if (!hasRealDocument(doc)) return 'MISSING'
  if (safeStatus(doc.status) === 'expired' || isExpired(doc.expiry_date)) return 'EXPIRED'
  const req = DRIVER_DOCUMENTS.find(r => r.id === fixPdp(doc.document_type || doc.doc_type))
  if (req?.expiryRequired && !doc.expiry_date) return 'EXPIRY MISSING'
  if (doc.expiry_date) {
    const days = Math.ceil((new Date(`${String(doc.expiry_date).slice(0, 10)}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000)
    if (days < 30) return 'EXPIRING SOON'
  }
  const status = safeStatus(doc.status).toUpperCase()
  if (status === 'APPROVED') return 'VERIFIED'
  return status === 'REJECTED' ? status : 'PENDING'
}
function findDriverRequirementDocument(docs: any[], type: string) {
  const want = fixPdp(type)
  const m = docs.filter(i => fixPdp(i.document_type || i.doc_type) === want)
  return m.find(i => hasRealDocument(i)) || m[0]
}

type StoredDocument = any
type DriverVehicle = any

export function AdminDocuments({ profile: _profile, onBack, driverId }: { profile: Profile, onBack: () => void, driverId?: string | null }) {
  const [driverDocs, setDriverDocs] = useState<StoredDocument[]>([])
  const [driverProfiles, setDriverProfiles] = useState<any[]>([])
  const [driverVehicles, setDriverVehicles] = useState<Record<string, DriverVehicle>>({})
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({})
  const [pendingDriverDocumentCount, setPendingDriverDocumentCount] = useState(0)
  const [pendingPassengerProfiles, setPendingPassengerProfiles] = useState<any[]>([])
  const [approvedPassengerProfiles, setApprovedPassengerProfiles] = useState<any[]>([])
  const [tab, setTab] = useState<'driver' | 'passenger-safety' | 'approved-passengers'>('driver')
  const [search, setSearch] = useState('')
  const [showUnapprovedOnly, setShowUnapprovedOnly] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ id: string, kind: 'driver-document' | 'passenger-safety' } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionCategory, setRejectionCategory] = useState('')
  const [error, setError] = useState('')
  const [loadingDocs, setLoadingDocs] = useState(true)

  async function viewDriverDocument(fileUrl?: string | null) {
    const docUrl = fileUrl?.trim()
    if (!docUrl) { setError('No document uploaded yet'); return }
    if (docUrl.toLowerCase().includes('temp.fix') || docUrl.toLowerCase().includes('no real file')) { setError('No real file uploaded - ask driver to re-upload this document.'); return }
    if (/^https?:\/\//i.test(docUrl)) { window.open(docUrl, '_blank'); return }
    try { const signedUrl = await createDriverDocumentSignedUrl(docUrl); window.open(signedUrl, '_blank'); return } catch {}
    let bucket = 'driver-documents'; let path = docUrl
    if (docUrl.includes(':')) { const [b, ...rest] = docUrl.split(':'); if (b && rest.join(':')) { bucket = b; path = rest.join(':') } }
    try {
      const { data, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
      if (!signedErr && data?.signedUrl) { window.open(data.signedUrl, '_blank'); return }
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
      if (pub?.publicUrl) { window.open(pub.publicUrl, '_blank'); return }
    } catch (e: any) { setError(`Could not open document: ${errMsg(e)}`) }
  }

  useEffect(() => { void load() }, [driverId])

  async function load() {
    setError(''); setLoadingDocs(true)
    try {
      let driverQuery = supabase.from('driver_documents').select('*').order('created_at', { ascending: false })
      if (driverId) driverQuery = driverQuery.eq('driver_id', driverId)
      let driverProfilesQuery = supabase.from('profiles').select('id,email,full_name,phone,phone_number,is_verified,verification_status').eq('role', 'driver').order('full_name')
      if (driverId) driverProfilesQuery = driverProfilesQuery.eq('id', driverId)
      const [driverResult, driverProfilesResult, pendingPassengerResult, approvedPassengerResult, zonesResult, vehiclesResult] = await Promise.all([
        driverQuery, driverProfilesQuery,
        supabase.from('profiles').select('id,email,full_name,phone,avatar_url,selfie_url,id_document_url,id_number,id_verification_method,verification_status,verification_rejection_reason').eq('role', 'passenger').eq('verification_status', 'pending_verification').order('created_at', { ascending: true }).limit(50),
        supabase.from('profiles').select('id,email,full_name,phone,avatar_url,selfie_url,id_document_url,id_number,id_verification_method,verification_status,verification_rejection_reason').eq('role', 'passenger').eq('verification_status', 'verified').order('created_at', { ascending: false }).limit(50),
        supabase.from('service_zones').select('id,name'),
        supabase.from('driver_vehicles').select('*'),
      ])
      if (!driverProfilesResult.error) setDriverProfiles((driverProfilesResult.data || []).map((p: any) => ({ ...p, phone: p.phone || p.phone_number || null })))
      const profileById = new Map((driverProfilesResult.data || []).map((p: any) => [p.id, { ...p, phone: p.phone || p.phone_number }]))
      if (zonesResult.data) setZoneNames(Object.fromEntries((zonesResult.data as any).map((z: any) => [z.id, z.name])))
      const vehMap: Record<string, DriverVehicle> = {}
      if (!vehiclesResult.error && vehiclesResult.data) for (const v of vehiclesResult.data as any) vehMap[v.driver_id] = v
      for (const p of (driverProfilesResult.data || []) as any[]) if (!vehMap[p.id]) vehMap[p.id] = { driver_id: p.id, vehicle_year: null, make_model: null, colour: null, registration: null, service_zones: [], ride_type: null }
      setDriverVehicles(vehMap)
      if (!driverResult.error) {
        const requiredTypes = new Set(REQUIRED_DOCS.map(d => fixPdp(d.type)))
        const loaded = (driverResult.data || []).filter((d: any) => {
          const raw = (d.document_type || d.doc_type || '').toLowerCase()
          if (/police|holding|selfie with id/i.test(raw)) return false
          return requiredTypes.has(fixPdp(d.document_type || d.doc_type || ''))
        })
        setPendingDriverDocumentCount(loaded.filter((d: any) => safeStatus(d.status) === 'pending').length)
        const latest = new Map<string, any>()
        for (const d of loaded) { const k = `${d.driver_id}:${fixPdp(d.document_type || d.doc_type)}`; if (!latest.has(k)) latest.set(k, d) }
        setDriverDocs([...latest.values()].map((d: any) => ({ ...d, doc_type: fixPdp(d.document_type || d.doc_type), document_type: fixPdp(d.document_type || d.doc_type), profiles: profileById.get(d.driver_id) || null })))
      }
      const loadPass = async (profiles: any[]) => Promise.all(profiles.map(async (p: any) => {
        let idPreview = null, selfiePreview = null
        try { if (p.id_document_url) idPreview = await createDriverDocumentSignedUrl(p.id_document_url) } catch {}
        try { if (p.selfie_url) selfiePreview = await createDriverDocumentSignedUrl(p.selfie_url) } catch {}
        return { ...p, id_photo_preview_url: idPreview, selfie_preview_url: selfiePreview }
      }))
      if (!pendingPassengerResult.error) setPendingPassengerProfiles(await loadPass((pendingPassengerResult.data || []).filter((p: any) => Boolean((p.selfie_url || '').trim() || (p.id_document_url || '').trim() || (p.id_number || '').trim()))))
      if (!approvedPassengerResult.error) setApprovedPassengerProfiles(await loadPass(approvedPassengerResult.data || []))
    } finally { setLoadingDocs(false) }
  }

  async function updateDocumentStatus(doc: StoredDocument, status: 'approved' | 'rejected', rejectionReason = ''): Promise<boolean> {
    setLoadingId(doc.id); setError('')
    try {
      const documentStatus = status.toUpperCase(); const reviewedAt = new Date().toISOString()
      const { error: e } = await supabase.from('driver_documents').update({ status: documentStatus, rejection_reason: status === 'rejected' ? rejectionReason.trim() : null, reviewed_at: reviewedAt, reviewed_by: _profile.id } as any).eq('id', doc.id)
      if (e) throw e
      setDriverDocs(prev => prev.map(i => i.id === doc.id ? { ...i, status: documentStatus, rejection_reason: status === 'rejected' ? rejectionReason.trim() || null : null, reviewed_at: reviewedAt, reviewed_by: _profile.id } : i))
      await load(); return true
    } catch (e: any) { alert(`${status === 'approved' ? 'Approve' : 'Reject'} failed: ${errMsg(e)}`); return false } finally { setLoadingId(null) }
  }

  async function approveToDrive(driverIdParam: string) {
    if (!confirm(`Approve this driver to Go Online? All ${DRIVER_DOCUMENTS.length} docs + Vehicle Details + Service Area + Ride Type must already be VERIFIED. Driver still needs to buy a Bundle to go online.`)) return
    setLoadingId(`approval:${driverIdParam}`); setError('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_driver_verification', { p_driver_id: driverIdParam, p_approve: true, p_rejection_reason: null })
      if (rpcError) throw new Error(`Admin approval could not be completed: ${errMsg(rpcError)}`)
      await load()
    } catch (e: any) { setError('Could not approve driver: ' + errMsg(e)) } finally { setLoadingId(null) }
  }

  async function approvePassengerSafety(passengerId: string) {
    if (!confirm('Approve this passenger safety check?')) return
    setLoadingId(`passenger-safety:${passengerId}`); setError('')
    try {
      const { error: e } = await supabase.rpc('approve_passenger_safety', { p_passenger_id: passengerId })
      if (e) { const { error: fb } = await supabase.from('profiles').update({ verification_status: 'verified', is_verified: true, id_verified: true } as any).eq('id', passengerId).eq('role', 'passenger'); if (fb) throw e }
      await load()
    } catch (e: any) { setError(`Could not approve passenger: ${errMsg(e)}`) } finally { setLoadingId(null) }
  }

  async function doReject() {
    if (!rejectModal) return
    const reason = rejectionCategory ? `${rejectionCategory}: ${rejectionReason.trim()}` : rejectionReason.trim()
    if (rejectionReason.trim().length < 10) { setError('Please enter at least 10 characters explaining the rejection.'); return }
    let succeeded = false
    if (rejectModal.kind === 'passenger-safety') {
      setLoadingId(`passenger-safety:${rejectModal.id}`); setError('')
      try {
        const { data, error: e } = await supabase.from('profiles').update({ id_verified: false, is_verified: false, verification_status: 'rejected', verification_rejection_reason: reason, verified_at: null }).eq('id', rejectModal.id).eq('role', 'passenger').eq('verification_status', 'pending_verification').select('id').maybeSingle()
        if (e) throw e; if (!data) throw new Error('Pending passenger not found.')
        await load(); succeeded = true
      } catch (e: any) { setError(`Could not reject passenger: ${errMsg(e)}`) } finally { setLoadingId(null) }
    } else {
      const doc = driverDocs.find(i => i.id === rejectModal.id)
      if (!doc) { setError('Document no longer in list. Refresh and try again.'); return }
      succeeded = await updateDocumentStatus(doc, 'rejected', reason)
    }
    if (succeeded) { setRejectModal(null); setRejectionReason(''); setRejectionCategory('') }
  }

  const grouped = driverDocs.reduce<Record<string, any[]>>((g, d) => { const id = d.user_id || d.driver_id; if (!id) return g; (g[id] ||= []).push(d); return g }, {})
  const allDriverIds = new Set<string>([...driverProfiles.map(p => p.id), ...Object.keys(grouped)])
  const driversById: Record<string, any[]> = {}; [...allDriverIds].forEach(id => driversById[id] = grouped[id] || [])
  const driverProfileById = new Map(driverProfiles.map(d => [d.id, d]))
  const normSearch = search.trim().toLowerCase()
  const matchesDriver = (docs: any[], fallback?: any) => {
    const p = docs[0]?.profiles || fallback; const id = docs[0]?.driver_id || docs[0]?.user_id || fallback?.id || ''
    return !normSearch || [p?.full_name, p?.email, p?.phone, id].some(v => v?.toLowerCase().includes(normSearch))
  }
  const visibleDrivers = Object.entries(driversById).filter(([id, docs]) => (!showUnapprovedOnly || docs.some(d => safeStatus(d.status) === 'pending')) && matchesDriver(docs, driverProfileById.get(id)))
  const pendingDrivers = Object.entries(driversById).filter(([, docs]) => docs.some(d => safeStatus(d.status) === 'pending'))
  const matchesPassenger = (p: any, q: string) => !q.trim() || [p.full_name, p.email, p.phone, p.id_number, p.id].some((v: any) => v?.toLowerCase().includes(q.trim().toLowerCase()))
  const pendingPassengers = pendingPassengerProfiles.filter(p => matchesPassenger(p, search))
  const approvedPassengers = approvedPassengerProfiles.filter(p => matchesPassenger(p, search))

  function renderVehicleCheck(driverIdKey: string) {
    const v = driverVehicles[driverIdKey]
    const year = v?.vehicle_year; const make = v?.make_model || v?.vehicle_make_model; const colour = v?.colour || v?.vehicle_colour; const reg = v?.registration || v?.vehicle_registration
    const zones = v?.service_zones || []; const rideType = v?.ride_type; const cat = categoryForRideType(rideType)
    const complete = Boolean(year && make?.trim() && colour?.trim() && reg?.trim()) && zones.length > 0 && Boolean(rideType)
    return <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: complete ? '#14532d' : '#7f1d1d', border: '1px solid #333' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>🚗 Vehicle Details - {complete ? '✅ COMPLETE' : '❌ INCOMPLETE - DO NOT APPROVE'}</h3>
      <div style={{ fontSize: 13, lineHeight: 1.8 }}>
        <div>Year: <strong>{year || '❌ MISSING'}</strong> • Make/Model: <strong>{make || '❌ MISSING'}</strong></div>
        <div>Colour: <strong>{colour || '❌ MISSING'}</strong> • Registration: <strong style={{ fontSize: 15, letterSpacing: 1 }}>{reg || '❌ MISSING'}</strong></div>
        <div>Service Area: <strong>{zones.length ? zones.map((z: string) => zoneNames[z] || z).join(', ') : '❌ MISSING - driver picked no zone'}</strong></div>
        <div>Ride Type: {rideType ? <strong style={{ background: '#0066FF', color: 'white', padding: '3px 10px', borderRadius: 999, fontSize: 12 }}>{cat.icon} {cat.label} • {cat.seats} <span style={{ opacity: 0.7, fontWeight: 400 }}>({rideType})</span></strong> : <strong>❌ MISSING</strong>}</div>
      </div>
      <p style={{ fontSize: 12, color: '#fcd34d', margin: '8px 0 0' }}>⚠️ CHECK: Does Registration match Licence Disk + Vehicle Papers below? Does Colour/Make match Exterior photos? If not, Reject.</p>
    </div>
  }

  function renderDocumentRow(doc: any, id: string, label: string, required: boolean) {
    const status = displayStatus(doc); const docUrl = getDocumentUrl(doc)
    const req = DRIVER_DOCUMENTS.find(i => i.id === id); const expired = isExpired(doc?.expiry_date); const expiryMissing = Boolean(req?.expiryRequired && !doc?.expiry_date)
    const canView = status !== 'MISSING' && status !== 'EXPIRY MISSING' && hasRealDocument(doc); const canApprove = Boolean(doc && canView && !expiryMissing && !expired); const isSaving = loadingId === doc?.id
    const badgeColors: Record<string, any> = { VERIFIED: { color: '#86efac', background: '#14532d' }, MISSING: { color: '#fde68a', background: '#713f12' }, PENDING: { color: '#93c5fd', background: '#1e3a8a' }, REJECTED: { color: '#fca5a5', background: '#7f1d1d' }, EXPIRED: { color: '#fca5a5', background: '#7f1d1d' }, 'EXPIRING SOON': { color: '#fcd34d', background: '#78350f' }, 'EXPIRY MISSING': { color: '#fca5a5', background: '#7f1d1d' } }
    const badge = badgeColors[status] || badgeColors.PENDING
    return <div key={id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderTop: '1px solid #333' }}>
      <div style={{ minWidth: 0 }}>
        <strong>{label}</strong>{!required && <span style={{ fontSize: '11px', color: '#9ca3af' }}> (Optional)</span>}
        <span style={{ display: 'inline-block', marginTop: '4px', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, color: badge.color, background: badge.background }}>{status}</span>
        <div style={{ fontSize: '12px', color: '#d1d5db', marginTop: 4 }}>{req?.expiryRequired ? `Expires: ${doc?.expiry_date || '—'}` : 'No expiry - no date needed'}</div>
        {expiryMissing && <div style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 700 }}>EXPIRY DATE MISSING - Reject</div>}
        {expired && <div style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 700 }}>EXPIRED</div>}
        {doc?.rejection_reason && <div style={{ fontSize: '12px', color: '#ff6b6b' }}>Reason: {doc.rejection_reason}</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '6px' }}>
        <button disabled={!canView} onClick={() => void viewDriverDocument(docUrl)} style={{ background: canView ? '#333' : '#4b5563', color: 'white', padding: '7px 9px', borderRadius: '6px', border: 'none', cursor: canView ? 'pointer' : 'not-allowed', opacity: canView ? 1 : 0.5 }}>Preview</button>
        <button disabled={!canApprove || isSaving} onClick={() => doc && void updateDocumentStatus(doc, 'approved')} style={{ background: isSaving ? '#4b5563' : '#00a86b', color: 'white', padding: '7px 9px', borderRadius: '6px', border: 'none', cursor: isSaving ? 'wait' : 'pointer' }}>{isSaving ? 'Saving...' : 'Approve'}</button>
        <button disabled={!doc || isSaving} onClick={() => doc && setRejectModal({ id: doc.id, kind: 'driver-document' })} style={{ background: '#c62828', color: 'white', padding: '7px 9px', borderRadius: '6px', border: 'none', cursor: isSaving ? 'wait' : 'pointer' }}>Reject</button>
      </div>
    </div>
  }

  function renderPassengerSafetyCard(p: any, allowReview: boolean) {
    const isSaving = loadingId === `passenger-safety:${p.id}`
    return <section key={p.id} style={{ border: '1px solid #333', padding: 14, borderRadius: 12, marginTop: 10, background: '#18181b' }}>
      <div style={{ fontWeight: 700 }}>{p.full_name || p.email || 'Passenger'}</div>
      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>{p.email || 'No email'}{p.phone ? ` - ${p.phone}` : ''}</div>
      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.55 }}>{p.id}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14 }}>
        <div><strong style={{ display: 'block', marginBottom: 6 }}>Selfie</strong>{p.selfie_preview_url ? <a href={p.selfie_preview_url} target="_blank" rel="noreferrer"><img src={p.selfie_preview_url} alt="Selfie" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', background: '#09090b', borderRadius: 8 }} /></a> : <span style={{ color: 'red' }}>FAIL - No selfie</span>}</div>
        <div><strong style={{ display: 'block', marginBottom: 6 }}>ID</strong>{p.id_photo_preview_url ? <a href={p.id_photo_preview_url} target="_blank" rel="noreferrer"><img src={p.id_photo_preview_url} alt="ID" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', background: '#09090b', borderRadius: 8 }} /></a> : <span>ID Number: {p.id_number || 'Not provided'}</span>}</div>
      </div>
      <div style={{ marginTop: 5 }}><strong>Method:</strong> {p.id_verification_method || 'Not recorded'}</div>
      {allowReview && <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button disabled={isSaving} onClick={() => void approvePassengerSafety(p.id)} style={{ flex: 1, padding: 11, border: 0, borderRadius: 8, background: isSaving ? '#4b5563' : '#15803d', color: 'white', fontWeight: 700 }}>{isSaving ? 'Saving…' : 'Approve'}</button>
        <button disabled={isSaving} onClick={() => setRejectModal({ id: p.id, kind: 'passenger-safety' })} style={{ flex: 1, padding: 11, border: 0, borderRadius: 8, background: '#b91c1c', color: 'white', fontWeight: 700 }}>Reject</button>
      </div>}
    </section>
  }

  return <div style={{ padding: '16px', background: '#0e0e10', minHeight: '100vh', color: 'white' }}>
    <button onClick={onBack} style={{ background: '#242428', color: 'white', border: '1px solid #333', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' }}>⬅ Back</button>
    <h2>👑 Admin Docs {driverId ? '- Single Driver' : ''}</h2>
    <label style={{ display: 'block', margin: '12px 0 8px', color: '#d1d5db', fontSize: 14 }}>Search drivers by name, email, phone, or user ID
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. MR NAKAMPE T" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #444', background: '#242428', color: 'white' }} />
    </label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '12px 0' }}>
      <button onClick={() => setTab('driver')} style={{ flex: 1, minWidth: 140, padding: '12px', background: tab === 'driver' ? '#ff7a00' : '#333', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Drivers Pending ({pendingDrivers.length}; {pendingDriverDocumentCount} documents)</button>
      <button onClick={() => setTab('passenger-safety')} style={{ flex: 1, minWidth: 140, padding: '12px', background: tab === 'passenger-safety' ? '#ff7a00' : '#333', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Passenger Safety ({pendingPassengers.length})</button>
      <button onClick={() => setTab('approved-passengers')} style={{ flex: 1, minWidth: 140, padding: '12px', background: tab === 'approved-passengers' ? '#ff7a00' : '#333', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Approved Passengers ({approvedPassengers.length})</button>
    </div>
    {error && <p role="alert" style={{ color: '#ff6b6b' }}>{error}</p>}
    {loadingDocs && <p style={{ color: '#9ca3af' }}>Loading documents...</p>}
    {tab === 'driver' ? <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0 12px', color: '#d1d5db', fontSize: '14px' }}><input type="checkbox" checked={showUnapprovedOnly} onChange={e => setShowUnapprovedOnly(e.target.checked)} />Show only drivers who are not yet approved</label>
      {visibleDrivers.map(([driverIdKey, docs]) => {
        const driverProfile = docs[0]?.profiles || driverProfileById.get(driverIdKey)
        const fullName = driverProfile?.full_name || driverProfile?.email || 'Unknown Driver'
        const email = driverProfile?.email || docs.find((d: any) => d.user_email || d.email)?.user_email || docs.find((d: any) => d.email)?.email
        const verifiedCount = DRIVER_DOCUMENTS.filter(r => displayStatus(findDriverRequirementDocument(docs, r.id)) === 'VERIFIED').length
        const pendingCount = docs.filter((d: any) => safeStatus(d.status) === 'pending').length
        const expiredReqs = DRIVER_DOCUMENTS.filter(r => { const d = findDriverRequirementDocument(docs, r.id); return Boolean(r.expiryRequired && isExpired(d?.expiry_date)) })
        const missingReq = DRIVER_DOCUMENTS.filter(r => !hasRealDocument(findDriverRequirementDocument(docs, r.id)))
        const missingDates = DRIVER_DOCUMENTS.filter(r => { const d = findDriverRequirementDocument(docs, r.id); return Boolean(d && r.expiryRequired && !d.expiry_date) })
        const rejectedReq = DRIVER_DOCUMENTS.filter(r => safeStatus(findDriverRequirementDocument(docs, r.id)?.status) === 'rejected')
        const v = driverVehicles[driverIdKey]
        const vehicleComplete = Boolean(v?.vehicle_year && (v?.make_model || v?.vehicle_make_model)?.trim() && (v?.colour || v?.vehicle_colour)?.trim() && (v?.registration || v?.vehicle_registration)?.trim())
        const zonesComplete = Boolean((v?.service_zones || []).length > 0); const rideComplete = Boolean(v?.ride_type)
        // FIX: Single blocking list - was pushing "Not yet approved" AFTER already listing missing/expired, so same doc appeared twice
        const blocking = [
          missingReq.length ? `Missing: ${missingReq.map(d => d.label).join(', ')}` : '',
          missingDates.length ? `Expiry missing: ${missingDates.map(d => d.label).join(', ')}` : '',
          expiredReqs.length ? `Expired: ${expiredReqs.map(d => d.label).join(', ')}` : '',
          rejectedReq.length ? `Rejected: ${rejectedReq.map(d => d.label).join(', ')}` : '',
          !vehicleComplete ? 'Vehicle Details missing' : '',
          !zonesComplete ? 'Service Area missing' : '',
          !rideComplete ? 'Ride Type missing' : '',
        ].filter(Boolean)
        const allVerified = verifiedCount === DRIVER_DOCUMENTS.length
        const canApprove = blocking.length === 0 && allVerified && vehicleComplete && zonesComplete && rideComplete
        const progressPercent = Math.round(verifiedCount / DRIVER_DOCUMENTS.length * 100)
        const isApproved = (driverProfile as any)?.is_verified === true && ['approved', 'verified'].includes(String((driverProfile as any)?.verification_status || '').toLowerCase())
        const vCat = categoryForRideType(v?.ride_type)
        return <section key={driverIdKey} style={{ border: '1px solid #333', padding: '12px', borderRadius: '12px', marginTop: '10px', background: '#18181b' }}>
          <div><div style={{ fontWeight: 700 }}>{fullName} {v?.ride_type ? <span style={{ marginLeft: 6, background: '#0066FF', color: 'white', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{vCat.icon} {vCat.label} • {vCat.seats}</span> : null}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{email || 'No email'}{driverProfile?.phone ? ` - ${driverProfile.phone}` : ''}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 5 }}>Documents: {verifiedCount}/{DRIVER_DOCUMENTS.length} verified, {pendingCount} pending, {expiredReqs.length} expired</div></div>
          <div style={{ height: '10px', background: '#333', borderRadius: '999px', overflow: 'hidden', margin: '8px 0 12px' }}><div style={{ width: `${progressPercent}%`, height: '100%', background: canApprove ? '#22c55e' : '#f59e0b' }} /></div>
          {missingReq.length > 0 && <div style={{ padding: 10, margin: '8px 0', borderRadius: 8, background: '#7f1d1d', color: '#fecaca', fontWeight: 700 }}>MISSING: {missingReq.map(d => d.label).join(', ')}</div>}
          {renderVehicleCheck(driverIdKey)}
          {(['Driver Identity', 'Vehicle Papers', 'Vehicle Exterior', 'Vehicle Interior', 'Safety'] as const).map(section => (
            <div key={section} style={{ marginTop: 12 }}><h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{section}</h3>{DRIVER_DOCUMENTS.filter(r => r.section === section).map(r => renderDocumentRow(findDriverRequirementDocument(docs, r.id), r.id, r.label, true))}</div>
          ))}
          <div style={{ borderTop: '1px solid #333', marginTop: '8px', paddingTop: '12px' }}>
            <button disabled={!canApprove || loadingId === `approval:${driverIdKey}` || isApproved} onClick={() => driverIdKey && void approveToDrive(driverIdKey)} title={!canApprove ? blocking.join(' · ') : undefined} style={{ width: '100%', padding: '14px', borderRadius: '9px', border: 'none', color: 'white', fontWeight: 700, fontSize: '15px', background: canApprove ? '#15803d' : '#4b5563', cursor: canApprove && !isApproved ? 'pointer' : 'not-allowed' }}>{loadingId === `approval:${driverIdKey}` ? 'Approving…' : isApproved ? 'Approved to Drive' : 'Approve to Drive - Go Online'}</button>
            {!canApprove && <div style={{ fontSize: '12px', color: '#fca5a5', marginTop: '6px' }}>{blocking.join(' · ')}</div>}
          </div>
        </section>
      })}
      {visibleDrivers.length === 0 && !loadingDocs && <p style={{ color: '#9ca3af' }}>No drivers are waiting for verification.</p>}
    </div> : tab === 'passenger-safety' ? <div>{pendingPassengers.map(p => renderPassengerSafetyCard(p, true))}{pendingPassengers.length === 0 && !loadingDocs && <p style={{ color: '#9ca3af' }}>No passengers waiting.</p>}</div> : <div><p style={{ fontSize: 12, color: '#9ca3af' }}>Showing latest 50 approved passengers.</p>{approvedPassengers.map(p => renderPassengerSafetyCard(p, false))}{approvedPassengers.length === 0 && !loadingDocs && <p style={{ color: '#9ca3af' }}>No approved passengers found.</p>}</div>}
    {rejectModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '380px', border: '1px solid #333' }}>
        <h3 style={{ margin: '0 0 8px' }}>Reject Reason</h3>
        <select value={rejectionCategory} onChange={e => setRejectionCategory(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, borderRadius: 8, background: '#242428', color: 'white', border: '1px solid #444', marginTop: 6 }}><option value="">Choose a reason (optional)</option><option>ID blurry</option><option>Selfie not clear</option><option>ID number mismatch</option><option>Wrong document</option><option>Other</option></select>
        <textarea value={rejectionReason} onChange={e => { setRejectionReason(e.target.value); setError('') }} autoFocus placeholder="Enter at least 10 characters" rows={3} style={{ display: 'block', width: '100%', padding: '10px', borderRadius: '8px', background: '#242428', color: 'white', border: '1px solid #444', marginTop: '12px', boxSizing: 'border-box' }} />
        {rejectionReason.trim().length < 10 && <p style={{ fontSize: 12, color: '#fca5a5' }}>Enter at least 10 characters.</p>}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button onClick={() => { setRejectModal(null); setRejectionReason(''); setRejectionCategory(''); setError('') }} style={{ flex: 1, background: '#333', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button disabled={rejectionReason.trim().length < 10} onClick={() => void doReject()} style={{ flex: 1, background: '#ff3b30', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', opacity: rejectionReason.trim().length < 10 ? 0.5 : 1, cursor: 'pointer' }}>Confirm Reject</button>
        </div>
      </div>
    </div>}
  </div>
}