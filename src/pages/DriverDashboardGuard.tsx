"use client"
import { useEffect, useState, useRef, type ReactNode } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { REQUIRED_DOCS, normalizeDocType, hasRealDocument } from '../lib/driverDocuments'

// BUNDLE MODEL: Guard checks Docs + Vehicle + Zones + Ride Type.
// Bundle is NOT checked here - DriverHome handles Bundle gate (so driver can enter app to BUY bundle).

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'

type DashboardAccess = 'checking' | 'pending' | 'approved'

type DocRow = { doc_type?: string | null, document_type?: string | null, status: string | null, rejection_reason?: string | null, created_at?: string | null, file_url?: string | null, document_url?: string | null, storage_path?: string | null, file_path?: string | null, expiry_date?: string | null }

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
  // NEW: Bolt Vehicle + Zones + Ride Type + Bundle
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
    checkingRef.current = true
    setChecking(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ownerId = user?.id || profile.id
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('is_verified,verification_status,verification_rejection_reason,vehicle_year,vehicle_make_model,vehicle_colour,vehicle_registration,service_zones,ride_type')
        .eq('id', ownerId)
        .single()
      if (profileError) {
        setError(`Could not check your driver approval: ${profileError.message}`)
        return
      }
      const [documentsRes, vehicleRes, zonesRes, bundlesRes] = await Promise.all([
        supabase
          .from('driver_documents')
          .select('doc_type,document_type,status,rejection_reason,created_at,file_url,document_url,storage_path,file_path,expiry_date')
          .eq('driver_id', ownerId)
          .order('created_at', { ascending: false }),
        supabase.from('driver_vehicles').select('*').eq('driver_id', ownerId).maybeSingle(),
        supabase.from('service_zones').select('id,name'),
        supabase.from('driver_bundles').select('trips_remaining').eq('driver_id', ownerId).gt('trips_remaining', 0),
      ])
      const documents = documentsRes.data
      const documentsError = documentsRes.error
      if (documentsError) {
        setError(`Could not check your driver documents: ${documentsError.message}`)
        return
      }
      if (zonesRes.data) setZoneNames(Object.fromEntries((zonesRes.data as any).map((z: any) => [z.id, z.name])))
      if (!bundlesRes.error && bundlesRes.data) setBundleCredits((bundlesRes.data as any).reduce((s: number, b: any) => s + Number(b.trips_remaining || 0), 0))
      // Vehicle from driver_vehicles first, fallback to profiles
      const v: any = vehicleRes.data || profileData
      if (v) {
        setVehicleDetails({
          year: v.vehicle_year ? String(v.vehicle_year) : '',
          make_model: v.make_model || v.vehicle_make_model || '',
          colour: v.colour || v.vehicle_colour || '',
          registration: v.registration || v.vehicle_registration || '',
        })
        if (Array.isArray(v.service_zones)) setSelectedZones(v.service_zones)
        else if (Array.isArray((profileData as any)?.service_zones)) setSelectedZones((profileData as any).service_zones)
        setSelectedRideType(v.ride_type || (profileData as any)?.ride_type || '')
      }

      const docs = (documents || []) as DocRow[]
      const statusOf = (d: DocRow) => (d.status || '').toUpperCase()

      const latest = new Map<string, DocRow>()
      for (const d of docs) {
        const key = normalizeKey(d.doc_type || d.document_type || '')
        if (!key) continue
        if (!latest.has(key)) latest.set(key, { ...d, doc_type: key, document_type: key })
      }
      const requiredDocuments = REQUIRED_DOCS.map(requirement => latest.get(normalizeKey(requirement.type)))
      const rejected = requiredDocuments.filter((d): d is DocRow => Boolean(d && statusOf(d) === 'REJECTED'))
      const pending = requiredDocuments.filter((d): d is DocRow => Boolean(d && ['PENDING','PENDING_VERIFICATION'].includes(statusOf(d))))
      const approvedList = requiredDocuments.filter((d, index): d is DocRow => {
        if (!d || statusOf(d) !== 'APPROVED') return false
        const hasFile = hasRealDocument(d.file_url || d.document_url || d.storage_path || d.file_path)
        if (!hasFile) return false
        if (REQUIRED_DOCS[index].expiryRequired) {
          if (!d.expiry_date) return false
          const exp = new Date(`${String(d.expiry_date).slice(0,10)}T00:00:00`).getTime()
          const today = new Date(new Date().toDateString()).getTime()
          if (exp < today) return false
        }
        return true
      })
      const completeApproved = approvedList.length === REQUIRED_DOCS.length
      setRejectedDocs(rejected)
      setPendingDocs(pending)
      setApprovedCount(approvedList.length)
      setTotalDocs(REQUIRED_DOCS.length)
      setProfileRejectionReason(profileData.verification_rejection_reason || null)

      const vStatus = String(profileData.verification_status || '').toLowerCase()
      const profileApproved = profileData.is_verified === true && ['approved','verified'].includes(vStatus)
      
      // Vehicle gate - Admin should not have approved without this, but double-check
      const vehicleComplete = Boolean((v?.vehicle_year || (profileData as any)?.vehicle_year) && ((v?.make_model || (profileData as any)?.vehicle_make_model)?.trim()) && ((v?.colour || (profileData as any)?.vehicle_colour)?.trim()) && ((v?.registration || (profileData as any)?.vehicle_registration)?.trim()))
      const zonesComplete = ((v?.service_zones || (profileData as any)?.service_zones || []) as any[]).length > 0
      const rideComplete = Boolean(v?.ride_type || (profileData as any)?.ride_type)

      // If profile says approved but vehicle incomplete -> treat as pending, show what's missing
      if (profileApproved && completeApproved) {
        if (vehicleComplete && zonesComplete && rideComplete) {
          setAccess('approved')
          return
        }
        // Approved on docs but vehicle missing = send to onboarding to fix, not trap in pending loop
        if (!onboardingSentRef.current) {
          onboardingSentRef.current = true
          onRequireOnboarding()
        }
        return
      }

      // identity_complete = LET THEM IN to finish rest inside app
      if (vStatus === 'identity_complete') {
        setAccess('approved')
        return
      }

      if (rejected.length > 0) {
        setAccess('pending')
        return
      }

      if (['pending','pending_verification','submitted','under_review','in_review'].includes(vStatus)) {
        setAccess('pending')
        return
      }

      if (docs.length === 0 || !vStatus || vStatus === 'not_started') {
        if (!onboardingSentRef.current) {
          onboardingSentRef.current = true
          onRequireOnboarding()
        }
        return
      }

      if (vStatus !== 'rejected' && pending.length === 0 && approvedList.length < REQUIRED_DOCS.length) {
        if (!onboardingSentRef.current) {
          onboardingSentRef.current = true
          onRequireOnboarding()
        }
        return
      }

      setAccess('pending')
    } finally {
      checkingRef.current = false
      setChecking(false)
      if (rerunRef.current) { rerunRef.current = false; void check() }
    }
  }

  useEffect(() => {
    void check()
    const interval = setInterval(() => {
      if (accessRef.current !== 'approved') void check()
    }, 5000)

    const ch = supabase.channel(`guard-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, () => { void check() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${profile.id}` }, () => { void check() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_vehicles', filter: `driver_id=eq.${profile.id}` }, () => { void check() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_bundles', filter: `driver_id=eq.${profile.id}` }, () => { void check() })
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  const vehicleComplete = Boolean(vehicleDetails.year && vehicleDetails.make_model.trim() && vehicleDetails.colour.trim() && vehicleDetails.registration.trim())
  const zonesComplete = selectedZones.length > 0
  const rideComplete = Boolean(selectedRideType)
  const missingVehicleItems: string[] = []
  if (!vehicleComplete) missingVehicleItems.push('Vehicle Details (Year + Make/Model + Colour + Registration)')
  if (!zonesComplete) missingVehicleItems.push('Service Area')
  if (!rideComplete) missingVehicleItems.push('Ride Type')

  if (error) return <main role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F6F7F9', color: '#b42318', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ maxWidth: 460, padding: 24, borderRadius: 16, background: '#fff', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
      <strong>Could not check driver approval</strong>
      <p>{error}</p>
      <button onClick={() => void check()} style={{ padding: '10px 14px', border: 0, borderRadius: 9, background: BLUE, color: '#fff', fontWeight: 700 }}>Retry</button>
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
              {missingVehicleItems.length > 0 && <div style={{ marginTop: 8, color: '#B54708', fontWeight: 700 }}>Still missing: {missingVehicleItems.join(' • ')}</div>}
              {vehicleComplete && <div style={{ marginTop: 8, color: '#067647' }}>🚗 {vehicleDetails.year} {vehicleDetails.make_model} • {vehicleDetails.colour} • {vehicleDetails.registration}</div>}
              {zonesComplete && <div style={{ marginTop: 4, color: '#067647' }}>📍 {selectedZones.map(z => zoneNames[z] || z).join(', ')}</div>}
              {rideComplete && <div style={{ marginTop: 4, color: '#067647' }}>🚙 {selectedRideType}</div>}
              {bundleCredits !== null && <div style={{ marginTop: 8, color: BLUE, fontWeight: 700 }}>🎫 Bundle trips left: {bundleCredits} {bundleCredits === 0 ? '- Buy bundle after approval to Go Online' : ''}</div>}
              {allDocsApproved && <div style={{ marginTop: 8, color: '#111827', fontWeight: 700 }}>After Admin approval: Buy Bundle → Go Online. You keep 100%.</div>}
            </div>
          )}
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => void check()} disabled={checking} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #D0D5DD', background: '#fff', fontWeight: 700, color: '#344054', cursor: 'pointer' }}>{checking ? 'Checking...' : '↻ Check Again'}</button>
        <a href="https://wa.me/27641018991?text=Hi BuddyRide, I am waiting for driver approval" target="_blank" rel="noreferrer" style={{ flex: 1, padding: '12px', borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, textDecoration: 'none', display: 'grid', placeItems: 'center' }}>WhatsApp Support</a>
      </div>
      <button onClick={() => void supabase.auth.signOut()} style={{ marginTop: 12, background: 'none', border: 0, color: '#98A2B3', textDecoration: 'underline', cursor: 'pointer' }}>Log out</button>
    </section>
  </main>
  }

  if (access !== 'approved') return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F6F7F9', color: '#667085', fontFamily: 'Inter, sans-serif' }}>{checking ? 'Checking driver approval…' : 'Loading…'}</main>
  return <>{children}</>
}