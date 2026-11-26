"use client"
import { useEffect, useState, useRef, type ReactNode } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { REQUIRED_DOCS, normalizeDocType, hasRealDocument } from '../lib/driverDocuments'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'
type DashboardAccess = 'checking' | 'pending' | 'approved'
type DocRow = { doc_type?: string | null, document_type?: string | null, status: string | null, rejection_reason?: string | null, created_at?: string | null, file_url?: string | null, document_url?: string | null, storage_path?: string | null, file_path?: string | null, expiry_date?: string | null }

export function DriverDashboardGuard({ profile, onRequireOnboarding, children }: { profile: Profile; onRequireOnboarding: () => void; children: ReactNode }) {
  const [access, setAccess] = useState<DashboardAccess>('checking')
  const [error, setError] = useState('')
  const [rejectedDocs, setRejectedDocs] = useState<DocRow[]>([])
  const [pendingDocs, setPendingDocs] = useState<DocRow[]>([])
  const [profileRejectionReason, setProfileRejectionReason] = useState<string | null>(null)
  const [approvedCount, setApprovedCount] = useState(0)
  const [totalDocs, setTotalDocs] = useState(0)
  const [checking, setChecking] = useState(false)
  const [vehicleDetails, setVehicleDetails] = useState({ year: '', make_model: '', colour: '', registration: '' })
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({})
  const [selectedRideType, setSelectedRideType] = useState('')
  const [bundleCredits, setBundleCredits] = useState<number | null>(null)
  const onboardingSentRef = useRef(false)
  const checkingRef = useRef(false)
  const rerunRef = useRef(false)
  const accessRef = useRef<DashboardAccess>('checking')
  accessRef.current = access

  const normalizeKey = (raw: string) => normalizeDocType(raw || '')
  const prettyName = (raw: string) => {
    const k = normalizeKey(raw)
    if (k === 'sa_id') return 'SA ID'
    if (k === 'drivers_license') return "Driver's License"
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  async function check() {
    if (checkingRef.current) { rerunRef.current = true; return }
    checkingRef.current = true; setChecking(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ownerId = user?.id || profile.id
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('is_verified,verification_status,verification_rejection_reason').eq('id', ownerId).single()
      if (profileError) { setError(`Could not check your driver approval: ${profileError.message}`); return }
      const [documentsRes, vehicleRes, zonesRes, bundlesRes] = await Promise.all([
        supabase.from('driver_documents').select('doc_type,document_type,status,rejection_reason,created_at,file_url,document_url,storage_path,file_path,expiry_date').eq('driver_id', ownerId).order('created_at', { ascending: false }),
        supabase.from('driver_vehicles').select('*').eq('driver_id', ownerId).maybeSingle(),
        supabase.from('service_zones').select('id,name'),
        supabase.from('driver_bundles').select('trips_remaining').eq('driver_id', ownerId).eq('status', 'active').gt('trips_remaining', 0).gt('expires_at', new Date().toISOString()),
      ])
      if (documentsRes.error) { setError(`Could not check your driver documents: ${documentsRes.error.message}`); return }
      if (zonesRes.data) setZoneNames(Object.fromEntries((zonesRes.data as any).map((z: any) => [z.id, z.name])))
      if (!bundlesRes.error && bundlesRes.data) setBundleCredits((bundlesRes.data as any).reduce((s: number, b: any) => s + Number(b.trips_remaining || 0), 0))
      const v: any = vehicleRes.data
      if (v) {
        setVehicleDetails({ year: v.vehicle_year ? String(v.vehicle_year) : v.year ? String(v.year) : '', make_model: v.make_model || v.vehicle_make_model || '', colour: v.colour || v.vehicle_colour || '', registration: v.registration || v.vehicle_registration || '' })
        if (Array.isArray(v.service_zones)) setSelectedZones(v.service_zones)
        setSelectedRideType(v.ride_type || '')
      }
      const docs = (documentsRes.data || []) as DocRow[]
      const statusOf = (d: DocRow) => (d.status || '').toUpperCase()
      const latest = new Map<string, DocRow>()
      for (const d of docs) { const key = normalizeKey(d.doc_type || d.document_type || ''); if (!key) continue; if (!latest.has(key)) latest.set(key, { ...d, doc_type: key, document_type: key }) }
      const requiredDocuments = REQUIRED_DOCS.map(req => latest.get(normalizeKey(req.type)))
      const rejected = requiredDocuments.filter((d): d is DocRow => Boolean(d && statusOf(d) === 'REJECTED'))
      const pending = requiredDocuments.filter((d): d is DocRow => Boolean(d && ['PENDING', 'PENDING_VERIFICATION'].includes(statusOf(d))))
      const approvedList = requiredDocuments.filter((d, index): d is DocRow => {
        if (!d || statusOf(d) !== 'APPROVED') return false
        if (!hasRealDocument(d.file_url || d.document_url || d.storage_path || d.file_path)) return false
        if (REQUIRED_DOCS[index].expiryRequired) {
          if (!d.expiry_date) return false
          const exp = new Date(`${String(d.expiry_date).slice(0, 10)}T00:00:00`).getTime()
          const today = new Date(new Date().toDateString()).getTime()
          if (exp < today) return false
        }
        return true
      })
      setRejectedDocs(rejected); setPendingDocs(pending); setApprovedCount(approvedList.length); setTotalDocs(REQUIRED_DOCS.length); setProfileRejectionReason(profileData.verification_rejection_reason || null)
      const vStatus = String(profileData.verification_status || '').toLowerCase()
      const profileApproved = profileData.is_verified === true && ['approved', 'verified'].includes(vStatus)

      // FIX - YOUR RULE: After Identity, user MUST get inside App.
      // Identity = Selfie + SA ID + Drivers License + ID Numbers (4/4) = Enter App
      // Vehicle + Zones + Ride Type + remaining 11 docs = finish INSIDE. Only Go Online is blocked in DriverHome.
      const localFlag = typeof window !== 'undefined' && localStorage.getItem('br_identity_complete') === '1'
      const identityKeys = ['profile_photo', 'selfie', 'sa_id', 'drivers_license']
      const identityCount = identityKeys.filter(k => latest.has(normalizeKey(k)) && hasRealDocument((latest.get(normalizeKey(k)) as any)?.file_url || (latest.get(normalizeKey(k)) as any)?.document_url || (latest.get(normalizeKey(k)) as any)?.storage_path || (latest.get(normalizeKey(k)) as any)?.file_path)).length
      const hasIdentityDocs = identityCount >= 4

      // 1. Fully approved -> inside
      if (profileApproved) { setAccess('approved'); return }
      // 2. Identity complete in DB -> inside (THE FIX - was pending)
      if (vStatus === 'identity_complete') { setAccess('approved'); return }
      // 3. Local flag from Enter App -> inside, even if DB still says pending_verification
      if (localFlag) { setAccess('approved'); return }
      // 4. Has 4 identity docs uploaded -> inside, even if status is pending_verification
      if (hasIdentityDocs && ['pending', 'pending_verification', 'submitted', 'under_review', 'in_review'].includes(vStatus)) { setAccess('approved'); return }
      // 5. Rejected docs -> still show pending screen to fix (but App.tsx already lets identity users in, this is for non-identity users)
      if (rejected.length > 0) { setAccess('pending'); return }
      if (['pending', 'pending_verification', 'submitted', 'under_review', 'in_review'].includes(vStatus)) { setAccess('pending'); return }
      if (docs.length === 0 || !vStatus || vStatus === 'not_started') { if (!onboardingSentRef.current) { onboardingSentRef.current = true; onRequireOnboarding() } return }
      // FIX: Don't bounce back to onboarding if docs are missing - user should finish INSIDE DriverHome
      // Old code: if (pending.length===0 && approved < total) -> onboarding. Removed.
      setAccess('pending')
    } finally {
      checkingRef.current = false; setChecking(false)
      if (rerunRef.current) { rerunRef.current = false; void check() }
    }
  }

  useEffect(() => {
    void check()
    const interval = setInterval(() => { if (accessRef.current !== 'approved') void check() }, 15000)
    const ch = supabase.channel(`guard-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, () => { void check() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${profile.id}` }, () => { void check() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_vehicles', filter: `driver_id=eq.${profile.id}` }, () => { void check() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_bundles', filter: `driver_id=eq.${profile.id}` }, () => { void check() })
      .subscribe()
    return () => { clearInterval(interval); void supabase.removeChannel(ch) }
  }, [profile.id])

  const vehicleComplete = Boolean(vehicleDetails.year && vehicleDetails.make_model.trim() && vehicleDetails.colour.trim() && vehicleDetails.registration.trim())
  const zonesComplete = selectedZones.length > 0
  const rideComplete = Boolean(selectedRideType)
  const missingVehicleItems: string[] = []
  if (!vehicleComplete) missingVehicleItems.push('Vehicle Details')
  if (!zonesComplete) missingVehicleItems.push('Service Area')
  if (!rideComplete) missingVehicleItems.push('Ride Type')

  if (error) return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F6F7F9', color: '#b42318', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ maxWidth: 460, padding: 24, borderRadius: 16, background: '#fff', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}><strong>Could not check driver approval</strong><p>{error}</p><button onClick={() => void check()} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: BLUE, color: '#fff', fontWeight: 700 }}>Retry</button></div>
  </main>

  if (access === 'pending') {
    const hasRejection = rejectedDocs.length > 0 || !!profileRejectionReason
    const allDocsApproved = totalDocs > 0 && approvedCount === totalDocs && pendingDocs.length === 0 && rejectedDocs.length === 0
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F6F7F9', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ width: 'min(100%, 440px)', padding: '40px 28px', borderRadius: 20, background: '#fff', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', border: '1px solid #EEF0F3' }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 18px', background: BLUE_LIGHT, borderRadius: 16, display: 'grid', placeItems: 'center', fontSize: 30, color: BLUE }}>⏳</div>
        <h1 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: '#111827' }}>{hasRejection ? 'Documents Need Attention' : 'Waiting for Admin Approval'}</h1>
        {hasRejection ? (
          <><p style={{ color: '#b42318', fontWeight: 700 }}>These documents were rejected:</p>{rejectedDocs.map((d, i) => (<div key={i} style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 8, textAlign: 'left' }}><strong>{prettyName(d.doc_type || d.document_type || 'Document').toUpperCase()}</strong><div style={{ fontSize: 13, color: '#667085' }}>{d.rejection_reason || 'Please re-upload.'}</div></div>))}{profileRejectionReason && <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 8, textAlign: 'left' }}><strong>APPLICATION</strong><div style={{ fontSize: 13, color: '#667085' }}>{profileRejectionReason}</div></div>}<button onClick={onRequireOnboarding} style={{ width: '100%', marginTop: 16, padding: '14px', border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800 }}>Fix Documents →</button></>
        ) : (
          <><p style={{ margin: 0, color: '#667085', lineHeight: 1.6, fontSize: 14.5 }}>{allDocsApproved ? 'All docs approved. Waiting for Admin to activate.' : 'Your documents are under review.'}</p>{totalDocs > 0 && (<div style={{ marginTop: 16, textAlign: 'left', background: BLUE_LIGHT, border: `1px solid #B2CCFF`, padding: 12, borderRadius: 12, fontSize: 13 }}><strong>Approved: {approvedCount}/{totalDocs}</strong>{pendingDocs.length > 0 && <div style={{ marginTop: 6, color: '#667085' }}>Pending: {pendingDocs.map(d => prettyName(d.doc_type || d.document_type || '')).join(', ')}</div>}{missingVehicleItems.length > 0 && <div style={{ marginTop: 8, color: '#B54708', fontWeight: 700 }}>Still missing: {missingVehicleItems.join(' • ')}</div>}{vehicleComplete && <div style={{ marginTop: 8, color: '#067647' }}>🚗 {vehicleDetails.year} {vehicleDetails.make_model} • {vehicleDetails.colour} • {vehicleDetails.registration}</div>}{zonesComplete && <div style={{ marginTop: 4, color: '#067647' }}>📍 {selectedZones.map(z => zoneNames[z] || z).join(', ')}</div>}{rideComplete && <div style={{ marginTop: 4, color: '#067647' }}>🚙 {selectedRideType}</div>}{bundleCredits !== null && <div style={{ marginTop: 8, color: BLUE, fontWeight: 700 }}>🎫 Bundle: {bundleCredits} trips</div>}</div>)}</>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}><button onClick={() => void check()} disabled={checking} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #D0D5DD', background: '#fff', fontWeight: 700 }}>{checking ? 'Checking...' : '↻ Check Again'}</button><a href="https://wa.me/27641018991?text=Hi BuddyRide, I am waiting for driver approval" target="_blank" rel="noreferrer" style={{ flex: 1, padding: '12px', borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, textDecoration: 'none', display: 'grid', placeItems: 'center' }}>WhatsApp Support</a></div>
      </section>
    </main>
  }
  if (access !== 'approved') return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F6F7F9', color: '#667085' }}>{checking ? 'Checking driver approval…' : 'Loading…'}</main>
  return <>{children}</>
}