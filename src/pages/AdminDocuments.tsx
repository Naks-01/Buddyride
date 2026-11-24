import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { createDriverDocumentSignedUrl, isFakeFile, REQUIRED_DOCS, normalizeDriverDocType, hasRealDocument as hasRealFile } from '../lib/driverDocuments'

// BUNDLE MODEL: No commission, no payout. Admin approves: Docs + Vehicle Details + Zones + Ride Type + Bundle (driver buys bundle AFTER approval to go online)
// FIXED: Admin now sees Vehicle Details / Service Area / Ride Type - was invisible before, driver could lie about car

// ===== YOUR 3 CATEGORIES =====
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

// FIX PDP ONLY - force pdp/prdp to same 'prdp'
function fixPdp(raw: string | null | undefined) {
  const t = String(raw || '').toLowerCase().trim()
  if (t.includes('prdp') || t.includes('pdp') || t === 'professional_driving_permit' || t.includes('pr_dp')) return 'prdp'
  return normalizeDriverDocType(raw || '')
}

export const DRIVER_DOCUMENTS = REQUIRED_DOCS.map((document, index) => ({
  id: fixPdp(document.type),
  label: document.label,
  section: document.section,
  expiryRequired: Boolean(document.expiryRequired),
  helper: document.label,
  accept: 'image/*,application/pdf',
  required: true,
  order: index + 1,
}))

function errMsg(e: any) {
  return e?.message || e?.error_description || e?.details || (typeof e === 'string' ? e : JSON.stringify(e))
}

function findDriverRequirementDocument(docs: StoredDocument[], type: string) {
  const want = fixPdp(type)
  const matchingDocuments = docs.filter(item =>
    fixPdp(item.document_type || item.doc_type) === want,
  )
  return matchingDocuments.find(item => hasRealDocument(item)) || matchingDocuments[0]
}

type StoredDocument = {
  id: string
  driver_id?: string
  user_id?: string
  passenger_id?: string
  user_email?: string | null
  email?: string | null
  doc_type: string
  document_type?: string | null
  file_url?: string | null
  document_url?: string | null
  document_date?: string | null
  file_path?: string | null
  storage_path?: string | null
  file_name?: string | null
  status: string
  expiry_date?: string | null
  rejection_reason?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
  profiles?: {
    id?: string
    email?: string | null
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    phone_number?: string | null
    is_verified?: boolean | null
    verification_status?: string | null
  } | null
}

type DriverVehicle = {
  driver_id: string
  vehicle_year?: number | null
  make_model?: string | null
  colour?: string | null
  registration?: string | null
  service_zones?: string[] | null
  ride_type?: string | null
  vehicle_make_model?: string | null
  vehicle_colour?: string | null
  vehicle_registration?: string | null
}

function groupDriversById(docs: StoredDocument[]) {
  return docs.reduce<Record<string, StoredDocument[]>>((groups, doc) => {
    const userId = doc.user_id || doc.driver_id
    if (!userId) return groups
    if (!groups[userId]) groups[userId] = []
    groups[userId].push(doc)
    return groups
  }, {})
}

function isExpired(expiryDate?: string | null) {
  if (!expiryDate) return false
  const expiry = new Date(String(expiryDate).slice(0, 10) + 'T00:00:00')
  const today = new Date(new Date().toDateString())
  return expiry.getTime() < today.getTime()
}

function getDocumentUrl(doc?: Pick<StoredDocument, 'file_url' | 'document_url' | 'file_path' | 'storage_path' | 'file_name'>) {
  return doc?.document_url?.trim() || doc?.file_url?.trim() || doc?.file_path?.trim() || doc?.storage_path?.trim() || doc?.file_name?.trim() || ''
}

function hasRealDocument(doc?: Pick<StoredDocument, 'file_url' | 'document_url' | 'file_path' | 'storage_path' | 'file_name'>) {
  const filePath = getDocumentUrl(doc)
  if (!filePath) return false
  const lower = filePath.toLowerCase()
  if (lower.includes('temp.fix') || lower.includes('temp_fix') || lower.includes('no real file') || lower === 'test' || lower === 'fake') return false
  return hasRealFile(filePath)
}

function safeStatus(s?: string | null) {
  return (s || 'PENDING').trim().toLowerCase()
}

function displayStatus(doc?: StoredDocument, optional = false) {
  if (!doc) return optional ? 'OPTIONAL' : 'MISSING'
  if (!hasRealDocument(doc)) return 'MISSING'
  if (safeStatus(doc.status) === 'expired' || isExpired(doc.expiry_date)) return 'EXPIRED'
  const req = DRIVER_DOCUMENTS.find(r => r.id === fixPdp(doc.document_type || doc.doc_type))
  if (req?.expiryRequired && !doc.expiry_date) return 'EXPIRY MISSING'
  if (doc.expiry_date) {
    const daysRemaining = Math.ceil((new Date(`${String(doc.expiry_date).slice(0, 10)}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000)
    if (daysRemaining < 30) return 'EXPIRING SOON'
  }
  const status = safeStatus(doc.status).toUpperCase()
  if (status === 'APPROVED') return 'VERIFIED'
  return status === 'REJECTED' ? status : 'PENDING'
}

type PassengerSafetyReview = Pick<Profile,
  'id' | 'email' | 'full_name' | 'phone' | 'avatar_url' | 'selfie_url' | 'id_document_url' | 'id_number' | 'id_verification_method' | 'verification_status' | 'verification_rejection_reason'
> & {
  id_photo_preview_url?: string | null
  selfie_preview_url?: string | null
}

export function AdminDocuments({ profile: _profile, onBack, driverId }: { profile: Profile, onBack: ()=>void, driverId?: string | null }){
  const [driverDocs,setDriverDocs]=useState<StoredDocument[]>([])
  const [driverProfiles, setDriverProfiles] = useState<(Pick<Profile, 'id' | 'email' | 'full_name' | 'phone'> & { is_verified?: boolean | null, verification_status?: string | null })[]>([])
  const [driverVehicles, setDriverVehicles] = useState<Record<string, DriverVehicle>>({})
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({})
  const [pendingDriverDocumentCount, setPendingDriverDocumentCount] = useState(0)
  const [pendingPassengerProfiles, setPendingPassengerProfiles] = useState<PassengerSafetyReview[]>([])
  const [approvedPassengerProfiles, setApprovedPassengerProfiles] = useState<PassengerSafetyReview[]>([])
  const [tab,setTab]=useState<'driver'|'passenger-safety'|'approved-passengers'>('driver')
  const [search,setSearch] = useState('')
  const [showUnapprovedOnly, setShowUnapprovedOnly] = useState(false)
  const [loadingId, setLoadingId] = useState<string|null>(null)
  const [rejectModal, setRejectModal] = useState<{id:string, kind:'driver-document'|'passenger-safety'}|null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionCategory, setRejectionCategory] = useState('')
  const [error, setError] = useState('')
  const [loadingDocs, setLoadingDocs] = useState(true)

  async function viewDriverDocument(fileUrl?: string | null) {
    const docUrl = fileUrl?.trim()
    if (!docUrl) { setError('No document uploaded yet'); return }
    if (docUrl.toLowerCase().includes('temp.fix') || docUrl.toLowerCase().includes('no real file')) {
      setError('No real file uploaded - ask driver to re-upload this document.')
      return
    }
    if (/^https?:\/\//i.test(docUrl)) { window.open(docUrl, '_blank'); return }
    try {
      const signedUrl = await createDriverDocumentSignedUrl(docUrl)
      window.open(signedUrl, '_blank')
      return
    } catch {}
    let bucket = 'driver-documents'
    let path = docUrl
    if (docUrl.includes(':')) {
      const [b, ...rest] = docUrl.split(':')
      if (b && rest.join(':')) { bucket = b; path = rest.join(':') }
    }
    try {
      const { data, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
      if (!signedErr && data?.signedUrl) { window.open(data.signedUrl, '_blank'); return }
      if (bucket === 'driver-documents') {
        const { data: alt } = await supabase.storage.from('profile-photos').createSignedUrl(path, 3600)
        if (alt?.signedUrl) { window.open(alt.signedUrl, '_blank'); return }
      }
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
      if (pub?.publicUrl) { window.open(pub.publicUrl, '_blank'); return }
    } catch (viewError: unknown) {
      setError(`Could not open document: ${errMsg(viewError)}`)
    }
  }

  useEffect(()=>{ void load() },[driverId])

  async function load(){
    setError('')
    setLoadingDocs(true)
    try {
      let driverQuery = supabase.from('driver_documents').select('*').order('created_at',{ascending:false})
      if (driverId) driverQuery = driverQuery.eq('driver_id', driverId)
      let driverProfilesQuery = supabase.from('profiles').select('id,email,full_name,phone,phone_number,is_verified,verification_status').eq('role', 'driver').order('full_name')
      if (driverId) driverProfilesQuery = driverProfilesQuery.eq('id', driverId)
      const [driverResult, driverProfilesResult, pendingPassengerResult, approvedPassengerResult, zonesResult, vehiclesResult] = await Promise.all([
        driverQuery,
        driverProfilesQuery,
        supabase.from('profiles').select('id,email,full_name,phone,avatar_url,selfie_url,id_document_url,id_number,id_verification_method,verification_status,verification_rejection_reason').eq('role', 'passenger').eq('verification_status', 'pending_verification').order('created_at', { ascending: true }).limit(50),
        supabase.from('profiles').select('id,email,full_name,phone,avatar_url,selfie_url,id_document_url,id_number,id_verification_method,verification_status,verification_rejection_reason').eq('role', 'passenger').eq('verification_status', 'verified').order('created_at', { ascending: false }).limit(50),
        supabase.from('service_zones').select('id,name'),
        supabase.from('driver_vehicles').select('*'),
      ])
      let profileLoadError = ''
      if (!driverProfilesResult.error) {
        const normalized = (driverProfilesResult.data || []).map((p: any) => ({
          ...p,
          phone: p.phone || p.phone_number || null,
        }))
        setDriverProfiles(normalized as any)
      }
      const profileById = new Map((driverProfilesResult.data || []).map((p: any) => [p.id, { ...p, phone: p.phone || p.phone_number }]))
      if (zonesResult.data) setZoneNames(Object.fromEntries((zonesResult.data as any).map((z: any) => [z.id, z.name])))
      const vehMap: Record<string, DriverVehicle> = {}
      if (!vehiclesResult.error && vehiclesResult.data) {
        for (const v of vehiclesResult.data as any) vehMap[v.driver_id] = v
      }
      for (const p of (driverProfilesResult.data || []) as any[]) {
        if (!vehMap[p.id]) {
          vehMap[p.id] = {
            driver_id: p.id,
            vehicle_year: null,
            make_model: null,
            colour: null,
            registration: null,
            service_zones: [],
            ride_type: null,
          }
        }
      }
      setDriverVehicles(vehMap)
      if (!driverResult.error) {
        const requiredTypes = new Set(REQUIRED_DOCS.map(d => fixPdp(d.type)))
        const loadedDocuments = (driverResult.data || []).filter(document => {
          const raw = (document.document_type || document.doc_type || '').toLowerCase()
          if (/police|holding|selfie with id/i.test(raw)) return false
          const norm = fixPdp(document.document_type || document.doc_type || '')
          return requiredTypes.has(norm)
        })
        setPendingDriverDocumentCount(loadedDocuments.filter(document => safeStatus(document.status) === 'pending').length)
        const latestByType = new Map<string, typeof driverResult.data[number]>()
        for (const document of loadedDocuments) {
          const key = `${document.driver_id}:${fixPdp(document.document_type || document.doc_type)}`
          if (!latestByType.has(key)) latestByType.set(key, document)
        }
        setDriverDocs([...latestByType.values()].map(document => ({
          ...document,
          doc_type: fixPdp(document.document_type || document.doc_type),
          document_type: fixPdp(document.document_type || document.doc_type),
          profiles: profileById.get(document.driver_id) || null,
        })))
      }
      const loadPassengerProfiles = async (profiles: PassengerSafetyReview[]) => Promise.all(profiles.map(async passenger => {
          let idPreview: string | null = null
          let selfiePreview: string | null = null
          try { if (passenger.id_document_url) idPreview = await createDriverDocumentSignedUrl(passenger.id_document_url) } catch (e: any) { profileLoadError = [profileLoadError, `ID for ${passenger.email || passenger.id}: ${errMsg(e)}`].filter(Boolean).join(' · ') }
          try { if (passenger.selfie_url) selfiePreview = await createDriverDocumentSignedUrl(passenger.selfie_url) } catch (e: any) { profileLoadError = [profileLoadError, `Selfie for ${passenger.email || passenger.id}: ${errMsg(e)}`].filter(Boolean).join(' · ') }
          return { ...passenger, id_photo_preview_url: idPreview, selfie_preview_url: selfiePreview }
        }))
      if (!pendingPassengerResult.error) {
        const ready = (pendingPassengerResult.data || []).filter((p: any) => Boolean((p.selfie_url || '').trim() || (p.id_document_url || '').trim() || (p.id_number || '').trim()))
        setPendingPassengerProfiles(await loadPassengerProfiles(ready))
      }
      if (!approvedPassengerResult.error) {
        setApprovedPassengerProfiles(await loadPassengerProfiles(approvedPassengerResult.data || []))
      }
      const loadErrors = [driverResult.error, driverProfilesResult.error, pendingPassengerResult.error, approvedPassengerResult.error].filter(Boolean)
      const loadErrorMessages = [...loadErrors.map(loadError => errMsg(loadError)), profileLoadError].filter(Boolean)
      if (loadErrorMessages.length) setError(loadErrorMessages.join(' · '))
    } finally { setLoadingDocs(false) }
  }

  async function updateDocumentStatus(doc:StoredDocument, table:'driver_documents', status:'approved'|'rejected', driverEmail:string, rejectionReason = ''): Promise<boolean> {
    setLoadingId(doc.id)
    setError('')
    try {
      const documentStatus = status.toUpperCase()
      const reviewedAt = new Date().toISOString()
      const changes: Record<string, string | null> = { status: documentStatus, rejection_reason: status === 'rejected' ? rejectionReason.trim() : null, reviewed_at: reviewedAt, reviewed_by: _profile.id }
      const { error: updateError } = await supabase.from('driver_documents').update(changes as any).eq('id', doc.id)
      if (updateError) throw updateError
      setDriverDocs(prev => prev.map(item => item.id === doc.id ? { ...item, status: documentStatus, rejection_reason: status === 'rejected' ? rejectionReason.trim() || null : null, reviewed_at: reviewedAt, reviewed_by: _profile.id } : item))
      await load()
      return true
    } catch (e:any) {
      const action = status==='approved'?'Approve':'Reject'
      alert(`${action} failed: ${errMsg(e)} - Check the ${table} UPDATE RLS policy for the authenticated admin role.`)
      console.error(e)
      return false
    } finally { setLoadingId(null) }
  }

  async function approveToDrive(driverIdParam: string) {
    if (!confirm(`Approve this driver to Go Online? All ${DRIVER_DOCUMENTS.length} docs + Vehicle Details + Service Area + Ride Type must already be VERIFIED. Driver still needs to buy a Bundle to go online.`)) return
    const loadingKey = `approval:${driverIdParam}`
    setLoadingId(loadingKey)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_set_driver_verification', { p_driver_id: driverIdParam, p_approve: true, p_rejection_reason: null })
      if (rpcError) throw new Error(`Admin approval could not be completed securely: ${errMsg(rpcError)}. Apply the driver approval migration and try again.`)
      await load()
    } catch (approvalError: unknown) { setError('Could not approve driver: ' + errMsg(approvalError)) } finally { setLoadingId(null) }
  }

  async function approvePassengerSafety(passengerId: string) {
    if (!confirm('Approve this passenger safety check?')) return
    setLoadingId(`passenger-safety:${passengerId}`)
    setError('')
    try {
      const { error: approvalError } = await supabase.rpc('approve_passenger_safety', { p_passenger_id: passengerId })
      if (approvalError) {
        const { error: fb } = await supabase.from('profiles').update({ verification_status: 'verified', is_verified: true, id_verified: true } as any).eq('id', passengerId).eq('role', 'passenger')
        if (fb) throw approvalError
      }
      await load()
    } catch (reviewError: unknown) { setError(`Could not approve passenger safety verification: ${errMsg(reviewError)}`) } finally { setLoadingId(null) }
  }

  async function doReject(){
    if (!rejectModal) return
    const reason = rejectionCategory ? `${rejectionCategory}: ${rejectionReason.trim()}` : rejectionReason.trim()
    if (rejectionReason.trim().length < 10) { setError('Please enter at least 10 characters explaining the rejection.'); return }
    let succeeded = false
    if (rejectModal.kind === 'passenger-safety') {
      setLoadingId(`passenger-safety:${rejectModal.id}`)
      setError('')
      try {
        const { data, error: rejectionError } = await supabase.from('profiles').update({ id_verified: false, is_verified: false, verification_status: 'rejected', verification_rejection_reason: reason, verified_at: null }).eq('id', rejectModal.id).eq('role', 'passenger').eq('verification_status', 'pending_verification').select('id').maybeSingle()
        if (rejectionError) throw rejectionError
        if (!data) throw new Error('Pending passenger safety verification was not found.')
        await load()
        succeeded = true
      } catch (reviewError: unknown) { setError(`Could not reject passenger safety verification: ${errMsg(reviewError)}`) } finally { setLoadingId(null) }
    } else {
      const doc = driverDocs.find(item=>item.id===rejectModal.id)
      if (!doc) { setError('Could not reject document: it is no longer in the loaded document list. Refresh and try again.'); return }
      succeeded = await updateDocumentStatus(doc, 'driver_documents', 'rejected', doc.profiles?.email || doc.user_email || doc.email || '', reason)
    }
    if (succeeded) { setRejectModal(null); setRejectionReason(''); setRejectionCategory('') }
  }

  const groupedDriverDocuments = groupDriversById(driverDocs)
  const allDriverIds = new Set<string>([...driverProfiles.map(p => p.id), ...Object.keys(groupedDriverDocuments)])
  const driversById = [...allDriverIds].reduce<Record<string, StoredDocument[]>>((drivers, id) => { drivers[id] = groupedDriverDocuments[id] || []; return drivers }, {})
  const driverProfileById = new Map(driverProfiles.map(driver => [driver.id, driver]))
  const matchesPassenger = (passenger: PassengerSafetyReview, query: string) => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return !normalizedQuery || [passenger.full_name, passenger.email, passenger.phone, passenger.id_number, passenger.id].some(value => value?.toLocaleLowerCase().includes(normalizedQuery))
  }
  const pendingPassengers = pendingPassengerProfiles.filter(passenger => matchesPassenger(passenger, search))
  const approvedPassengers = approvedPassengerProfiles.filter(passenger => matchesPassenger(passenger, search))
  const normalizedDriverSearch = search.trim().toLocaleLowerCase()
  const matchesDriver = (docs: StoredDocument[], fallbackProfile?: Pick<Profile, 'id' | 'email' | 'full_name' | 'phone'>) => {
    const profile = docs[0]?.profiles || fallbackProfile
    const driverId = docs[0]?.driver_id || docs[0]?.user_id || fallbackProfile?.id || ''
    return !normalizedDriverSearch || [profile?.full_name, profile?.email, profile?.phone, driverId].some(value => value?.toLocaleLowerCase().includes(normalizedDriverSearch))
  }
  const isPendingDocument = (doc: StoredDocument) => safeStatus(doc.status) === 'pending'
  const pendingDrivers = Object.entries(driversById).filter(([, docs]) => docs.some(isPendingDocument))
  const visibleDrivers = Object.entries(driversById).filter(([driverIdKey, docs]) => (!showUnapprovedOnly || docs.some(isPendingDocument)) && matchesDriver(docs, driverProfileById.get(driverIdKey)))

  function renderVehicleCheck(driverIdKey: string) {
    const v = driverVehicles[driverIdKey]
    const year = v?.vehicle_year
    const make = v?.make_model || v?.vehicle_make_model
    const colour = v?.colour || v?.vehicle_colour
    const reg = v?.registration || v?.vehicle_registration
    const zones = v?.service_zones || []
    const rideType = v?.ride_type
    const cat = categoryForRideType(rideType)
    const vehicleComplete = Boolean(year && make?.trim() && colour?.trim() && reg?.trim())
    const zonesComplete = zones.length > 0
    const rideComplete = Boolean(rideType)
    return <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: vehicleComplete && zonesComplete && rideComplete ? '#14532d' : '#7f1d1d', border: '1px solid #333' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>🚗 Vehicle Details (Bolt check) - {vehicleComplete && zonesComplete && rideComplete ? '✅ COMPLETE' : '❌ INCOMPLETE - DO NOT APPROVE'}</h3>
      <div style={{ fontSize: 13, lineHeight: 1.8 }}>
        <div>Year: <strong>{year || '❌ MISSING'}</strong> • Make/Model: <strong>{make || '❌ MISSING'}</strong></div>
        <div>Colour: <strong>{colour || '❌ MISSING'}</strong> • Registration: <strong style={{ fontSize: 15, letterSpacing: 1 }}>{reg || '❌ MISSING'}</strong></div>
        <div>Service Area: <strong>{zones.length ? zones.map(z => zoneNames[z] || z).join(', ') : '❌ MISSING - driver picked no zone'}</strong></div>
        <div>Ride Type: {rideType ? <strong style={{ background: '#0066FF', color: 'white', padding: '3px 10px', borderRadius: 999, fontSize: 12 }}>{cat.icon} {cat.label} • {cat.seats} <span style={{ opacity: 0.7, fontWeight: 400 }}>({rideType})</span></strong> : <strong>❌ MISSING</strong>}</div>
        {rideType && <div style={{ fontSize: 12, color: '#fcd34d', marginTop: 4 }}>Check: Does this car in photos seat {cat.seats}? Lite = small car, Plus = sedan, Max = 7-seater van. If not, Reject.</div>}
      </div>
      <p style={{ fontSize: 12, color: '#fcd34d', margin: '8px 0 0' }}>⚠️ CHECK: Does Registration above match the Licence Disk photo + Vehicle Papers below? Does Colour/Make match Exterior photos (Front/Rear/Left/Right)? If not, Reject.</p>
    </div>
  }

  function renderDocumentRow(doc: StoredDocument | undefined, id: string, label: string, table: 'driver_documents', required: boolean) {
    const status = displayStatus(doc)
    const docUrl = getDocumentUrl(doc)
    const requirement = DRIVER_DOCUMENTS.find(item => item.id === id)
    const expired = isExpired(doc?.expiry_date)
    const expiryDateMissing = Boolean(requirement?.expiryRequired && !doc?.expiry_date)
    const canViewDocument = status !== 'MISSING' && status !== 'EXPIRY MISSING' && hasRealDocument(doc)
    const canApproveDocument = Boolean(doc && canViewDocument && !expiryDateMissing && !expired)
    const isSaving = loadingId === doc?.id
    const badgeColors: Record<string, { color: string, background: string }> = {
      VERIFIED: { color:'#86efac', background:'#14532d' },
      MISSING: { color:'#fde68a', background:'#713f12' },
      OPTIONAL: { color:'#d1d5db', background:'#374151' },
      PENDING: { color:'#93c5fd', background:'#1e3a8a' },
      REJECTED: { color:'#fca5a5', background:'#7f1d1d' },
      EXPIRED: { color:'#fca5a5', background:'#7f1d1d' },
      'EXPIRING SOON': { color:'#fcd34d', background:'#78350f' },
      'EXPIRY MISSING': { color:'#fca5a5', background:'#7f1d1d' },
    }
    const badge = badgeColors[status] || badgeColors.PENDING
    return <div key={id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'10px 0', borderTop:'1px solid #333'}}>
      <div style={{minWidth:0}}>
        <strong>{label}</strong>{!required && <span style={{fontSize:'11px', color:'#9ca3af'}}> (Optional)</span>}
        <span style={{display:'inline-block', marginTop:'4px', padding:'3px 8px', borderRadius:'999px', fontSize:'11px', fontWeight:700, color:badge.color, background:badge.background}}>{status}</span>
        <div style={{fontSize:'12px', color:'#d1d5db', marginTop:4}}>{requirement?.expiryRequired ? `Expires: ${doc?.expiry_date || '—'}` : 'No expiry - no date needed'}</div>
        {expiryDateMissing && <div role="alert" style={{fontSize:'12px', color:'#fca5a5', fontWeight:700}}>EXPIRY DATE MISSING - Reject</div>}
        {expired && <div role="status" style={{fontSize:'12px', color:'#fca5a5', fontWeight:700}}>EXPIRED</div>}
        {doc?.rejection_reason && <div style={{fontSize:'12px', color:'#ff6b6b'}}>Reason: {doc.rejection_reason}</div>}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', justifyContent:'flex-end', gap:'6px'}}>
        <button disabled={!canViewDocument} onClick={()=>void viewDriverDocument(docUrl)} style={{background:canViewDocument?'#333':'#4b5563', color:canViewDocument?'white':'#d1d5db', padding:'7px 9px', borderRadius:'6px', border:'none', cursor:canViewDocument?'pointer':'not-allowed', opacity:canViewDocument?1:0.5}}>Preview</button>
        <button disabled={!canApproveDocument || isSaving} title={expiryDateMissing ? 'Expiry date is required' : expired ? 'Expired documents cannot be approved' : undefined} onClick={()=>doc && void updateDocumentStatus(doc,table,'approved',doc.profiles?.email || doc.user_email || doc.email || '')} style={{background: isSaving ? '#4b5563' : '#00a86b', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none', cursor: isSaving ? 'wait' : 'pointer'}}>{isSaving ? 'Saving...' : 'Approve'}</button>
        <button disabled={!doc || isSaving} onClick={()=>doc && setRejectModal({id:doc.id,kind:'driver-document'})} style={{background:'#c62828', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none', cursor: isSaving ? 'wait' : 'pointer'}}>Reject</button>
      </div>
    </div>
  }

  function renderPassengerSafetyCard(passenger: PassengerSafetyReview, allowReview: boolean) {
    const isSaving = loadingId === `passenger-safety:${passenger.id}`
    return <section key={passenger.id} style={{ border:'1px solid #333', padding:14, borderRadius:12, marginTop:10, background:'#18181b' }}>
      <div style={{ fontWeight:700 }}>{passenger.full_name || passenger.email || 'Passenger'}</div>
      <div style={{ marginTop:4, fontSize:13, opacity:0.8 }}>{passenger.email || 'No email'}{passenger.phone ? ` - ${passenger.phone}` : ''}</div>
      <div style={{ marginTop:4, fontSize:11, opacity:0.55 }}>{passenger.id}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, marginTop:14 }}>
        <div>
          <strong style={{ display:'block', marginBottom:6 }}>Selfie</strong>
          {passenger.selfie_preview_url ? <a href={passenger.selfie_preview_url} target="_blank" rel="noreferrer"><img src={passenger.selfie_preview_url} alt={`${passenger.full_name || 'Passenger'} selfie`} style={{ width:'100%', maxHeight:240, objectFit:'contain', background:'#09090b', borderRadius:8 }} /></a> : <span style={{ color:'red' }}>FAIL - No selfie - ask user to re-upload</span>}
        </div>
        <div>
          <strong style={{ display:'block', marginBottom:6 }}>ID</strong>
          {passenger.id_photo_preview_url ? <a href={passenger.id_photo_preview_url} target="_blank" rel="noreferrer"><img src={passenger.id_photo_preview_url} alt={`${passenger.full_name || 'Passenger'} ID`} style={{ width:'100%', maxHeight:240, objectFit:'contain', background:'#09090b', borderRadius:8 }} /></a> : <span>ID Number: {passenger.id_number || 'Not provided'}</span>}
        </div>
      </div>
      <div style={{ marginTop:5 }}><strong>Method:</strong> {passenger.id_verification_method || 'Not recorded'}</div>
      {allowReview && <div style={{ display:'flex', gap:8, marginTop:14 }}>
        <button type="button" disabled={isSaving} onClick={()=>void approvePassengerSafety(passenger.id)} style={{ flex:1, padding:11, border:0, borderRadius:8, background: isSaving ? '#4b5563' : '#15803d', color:'white', fontWeight:700 }}>{isSaving ? 'Saving…' : 'Approve'}</button>
        <button type="button" disabled={isSaving} onClick={()=>setRejectModal({id:passenger.id,kind:'passenger-safety'})} style={{ flex:1, padding:11, border:0, borderRadius:8, background:'#b91c1c', color:'white', fontWeight:700 }}>Reject</button>
      </div>}
    </section>
  }

  return <div style={{ padding:'16px', background:'#0e0e10', minHeight:'100vh', color:'white' }}>
    <button onClick={onBack} style={{ background:'#242428', color:'white', border:'1px solid #333', padding:'8px 12px', borderRadius:'8px', cursor:'pointer' }}>⬅ Back</button>
    <h2>👑 Admin Docs {driverId ? '- Single Driver' : ''}</h2>
    {driverId && <p style={{color:'#93c5fd', fontSize:13}}>Showing only driver: {driverId} - <button onClick={onBack} style={{background:'none', border:'none', color:'#93c5fd', textDecoration:'underline', cursor:'pointer'}}>Back to all drivers</button></p>}
    <label style={{ display:'block', margin:'12px 0 8px', color:'#d1d5db', fontSize:14 }}>
      Search drivers by name, email, phone, or user ID
      <input value={search} onChange={event=>{ setSearch(event.target.value) }} placeholder="e.g. MR NAKAMPE T" style={{ display:'block', width:'100%', boxSizing:'border-box', marginTop:6, padding:10, borderRadius:8, border:'1px solid #444', background:'#242428', color:'white' }} />
    </label>
    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', margin:'12px 0' }}>
      <button onClick={()=> setTab('driver')} style={{ flex:1, minWidth:140, padding:'12px', background: tab==='driver'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none', cursor:'pointer' }}>Drivers Pending ({pendingDrivers.length}; {pendingDriverDocumentCount} documents)</button>
      <button onClick={()=> setTab('passenger-safety')} style={{ flex:1, minWidth:140, padding:'12px', background: tab==='passenger-safety'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none', cursor:'pointer' }}>Passenger Safety ({pendingPassengers.length})</button>
      <button onClick={()=> setTab('approved-passengers')} style={{ flex:1, minWidth:140, padding:'12px', background: tab==='approved-passengers'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none', cursor:'pointer' }}>Approved Passengers ({approvedPassengers.length})</button>
    </div>
    {error && <p role="alert" style={{color:'#ff6b6b'}}>{error}</p>}
    {loadingDocs && <p style={{ color:'#9ca3af' }}>Loading documents...</p>}
    {tab==='driver' ? (
      <div>
        <label style={{display:'flex', alignItems:'center', gap:'8px', margin:'8px 0 12px', color:'#d1d5db', fontSize:'14px'}}>
          <input type="checkbox" checked={showUnapprovedOnly} onChange={event=>setShowUnapprovedOnly(event.target.checked)} />
          Show only drivers who are not yet approved
        </label>
        {visibleDrivers.map(([driverIdKey, docs]) => {
          const driverProfile = docs[0]?.profiles || driverProfileById.get(driverIdKey)
          const fullName = driverProfile?.full_name || driverProfile?.email || 'Unknown Driver'
          const email = driverProfile?.email || docs.find(doc=>doc.user_email || doc.email)?.user_email || docs.find(doc=>doc.email)?.email
          const verifiedCount = DRIVER_DOCUMENTS.filter(requirement => displayStatus(findDriverRequirementDocument(docs, requirement.id)) === 'VERIFIED').length
          const pendingCount = docs.filter(isPendingDocument).length
          const expiredRequirements = DRIVER_DOCUMENTS.filter(requirement => { const doc = findDriverRequirementDocument(docs, requirement.id); return Boolean(requirement.expiryRequired && isExpired(doc?.expiry_date)) })
          const missingRequired = DRIVER_DOCUMENTS.filter(requirement => !hasRealDocument(findDriverRequirementDocument(docs, requirement.id)))
          const missingDates = DRIVER_DOCUMENTS.filter(requirement => { const doc = findDriverRequirementDocument(docs, requirement.id); return Boolean(doc && requirement.expiryRequired && !doc.expiry_date) })
          const rejectedRequirements = DRIVER_DOCUMENTS.filter(requirement => safeStatus(findDriverRequirementDocument(docs, requirement.id)?.status) === 'rejected')
          const expiredCount = expiredRequirements.length
          const v = driverVehicles[driverIdKey]
          const vehicleComplete = Boolean(v?.vehicle_year && (v?.make_model || v?.vehicle_make_model)?.trim() && (v?.colour || v?.vehicle_colour)?.trim() && (v?.registration || v?.vehicle_registration)?.trim())
          const zonesComplete = Boolean((v?.service_zones || []).length > 0)
          const rideComplete = Boolean(v?.ride_type)
          const blockingReasons = [
            missingRequired.length ? `Missing: ${missingRequired.map(document => document.label).join(', ')}` : '',
            missingDates.length ? `Expiry missing: ${missingDates.map(document => document.label).join(', ')}` : '',
            expiredCount ? `Expired: ${expiredRequirements.map(document => document.label).join(', ')}` : '',
            rejectedRequirements.length ? `Rejected: ${rejectedRequirements.map(document => document.label).join(', ')}` : '',
            !vehicleComplete ? 'Vehicle Details missing: Year + Make/Model + Colour + Registration' : '',
            !zonesComplete ? 'Service Area missing: driver picked no zone' : '',
            !rideComplete ? 'Ride Type missing' : '',
          ].filter(Boolean)
          const allDocumentsVerified = verifiedCount === DRIVER_DOCUMENTS.length && DRIVER_DOCUMENTS.every(requirement => displayStatus(findDriverRequirementDocument(docs, requirement.id)) === 'VERIFIED')
          if (!allDocumentsVerified) blockingReasons.push(`Not yet approved: ${DRIVER_DOCUMENTS.filter(requirement => displayStatus(findDriverRequirementDocument(docs, requirement.id)) !== 'VERIFIED').map(document => document.label).join(', ')}`)
          const canApproveToDrive = blockingReasons.length === 0 && allDocumentsVerified && vehicleComplete && zonesComplete && rideComplete
          const progressColor = canApproveToDrive ? '#22c55e' : '#f59e0b'
          const progressPercent = Math.round(verifiedCount / DRIVER_DOCUMENTS.length * 100)
          const isApproved = (driverProfile as any)?.is_verified === true && ['approved', 'verified'].includes(String((driverProfile as any)?.verification_status || '').toLowerCase())
          const vCat = categoryForRideType(v?.ride_type)
          return <section key={driverIdKey} style={{border:'1px solid #333', padding:'12px', borderRadius:'12px', marginTop:'10px', background:'#18181b'}}>
            <div style={{margin:'0 0 4px'}}>
              <div style={{fontWeight:700}}>{fullName} {v?.ride_type ? <span style={{ marginLeft: 6, background: '#0066FF', color: 'white', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{vCat.icon} {vCat.label} • {vCat.seats}</span> : null}</div>
              <div style={{fontSize:13, opacity:0.8}}>{email || 'No email'}{driverProfile?.phone ? ` - ${driverProfile.phone}` : ''}</div>
              <div style={{fontSize:11, opacity:0.8, marginTop:5}}>Documents: {verifiedCount}/{DRIVER_DOCUMENTS.length} verified, {pendingCount} pending, {expiredCount} expired</div>
            </div>
            <div role="progressbar" aria-label={`${email || fullName} document verification progress`} aria-valuemin={0} aria-valuemax={DRIVER_DOCUMENTS.length} aria-valuenow={verifiedCount} style={{height:'10px', background:'#333', borderRadius:'999px', overflow:'hidden', margin:'8px 0 12px'}}>
              <div style={{width:`${progressPercent}%`, height:'100%', background:progressColor, transition:'width 180ms ease'}} />
            </div>
            {missingRequired.length > 0 && <div role="alert" style={{padding:10, margin:'8px 0', borderRadius:8, background:'#7f1d1d', color:'#fecaca', fontWeight:700}}>MISSING: {missingRequired.map(document => document.label).join(', ')}</div>}
            {renderVehicleCheck(driverIdKey)}
            {(['Driver Identity', 'Vehicle Papers', 'Vehicle Exterior', 'Vehicle Interior', 'Safety'] as const).map(section => (
              <div key={section} style={{marginTop:12}}>
                <h3 style={{margin:'0 0 4px', fontSize:15}}>{section}</h3>
                {DRIVER_DOCUMENTS.filter(requirement => requirement.section === section).map(requirement => renderDocumentRow(findDriverRequirementDocument(docs, requirement.id), requirement.id, requirement.label, 'driver_documents', true))}
              </div>
            ))}
            <div style={{borderTop:'1px solid #333', marginTop:'8px', paddingTop:'12px'}}>
              <button disabled={!canApproveToDrive || loadingId===`approval:${driverIdKey}` || isApproved} onClick={()=>driverIdKey && void approveToDrive(driverIdKey)} title={!canApproveToDrive ? blockingReasons.join(' · ') : undefined} style={{width:'100%', padding:'14px', borderRadius:'9px', border:'none', color:'white', fontWeight:700, fontSize:'15px', background:canApproveToDrive?'#15803d':'#4b5563', cursor:canApproveToDrive && !isApproved?'pointer':'not-allowed'}}>
                {driverIdKey && loadingId===`approval:${driverIdKey}` ? 'Approving…' : isApproved ? 'Approved to Drive' : 'Approve to Drive - Go Online'}
              </button>
              {!canApproveToDrive && <div style={{fontSize:'12px', color:'#fca5a5', marginTop:'6px'}}>{blockingReasons.join(' · ')}</div>}
            </div>
          </section>
        })}
        {visibleDrivers.length===0 && !loadingDocs && <p style={{color:'#9ca3af'}}>No drivers are waiting for verification.</p>}
      </div>
    ) : tab === 'passenger-safety' ? (
      <div>
        {pendingPassengers.map(passenger => renderPassengerSafetyCard(passenger, true))}
        {pendingPassengers.length===0 && !loadingDocs && <p style={{ color:'#9ca3af' }}>No passengers are waiting for safety verification.</p>}
      </div>
    ) : (
      <div>
        <p style={{ fontSize: 12, color: '#9ca3af' }}>Showing latest 50 approved passengers.</p>
        {approvedPassengers.map(passenger => renderPassengerSafetyCard(passenger, false))}
        {approvedPassengers.length===0 && !loadingDocs && <p style={{ color:'#9ca3af' }}>No approved passengers found.</p>}
      </div>
    )}
    {rejectModal && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
        <div style={{ background:'#1e1e1e', padding:'20px', borderRadius:'12px', width:'90%', maxWidth:'380px', border:'1px solid #333' }}>
          <h3 style={{ margin:'0 0 8px' }}>Reject Reason</h3>
          <label style={{ display:'block', fontSize:13, color:'#d1d5db' }}>
            Suggested reason
            <select value={rejectionCategory} onChange={event=>setRejectionCategory(event.target.value)} style={{ display:'block', width:'100%', padding:10, borderRadius:8, background:'#242428', color:'white', border:'1px solid #444', marginTop:6, boxSizing:'border-box' }}>
              <option value="">Choose a reason (optional)</option>
              <option>ID blurry</option>
              <option>Selfie not clear</option>
              <option>ID number mismatch</option>
              <option>Wrong document</option>
              <option>Other</option>
            </select>
          </label>
          <label style={{ display:'block', fontSize:13, color:'#d1d5db', marginTop:12 }}>
            Why are you rejecting? (required)
            <textarea value={rejectionReason} onChange={e=> { setRejectionReason(e.target.value); setError('') }} autoFocus placeholder="Enter at least 10 characters" rows={3} style={{ display:'block', width:'100%', padding:'10px', borderRadius:'8px', background:'#242428', color:'white', border:'1px solid #444', marginTop:'6px', boxSizing:'border-box', resize:'vertical' }}/>
          </label>
          {rejectionReason.trim().length < 10 && <p role="alert" style={{ fontSize:12, color:'#fca5a5', margin:'6px 0 0' }}>Enter at least 10 characters.</p>}
          <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
            <button onClick={()=> { setRejectModal(null); setRejectionReason(''); setRejectionCategory(''); setError('') }} style={{ flex:1, background:'#333', color:'white', padding:'10px', borderRadius:'8px', border:'none', cursor:'pointer' }}>Cancel</button>
            <button disabled={rejectionReason.trim().length < 10 || loadingId === rejectModal.id || loadingId === `passenger-safety:${rejectModal.id}`} onClick={()=>void doReject()} style={{ flex:1, background:'#ff3b30', color:'white', padding:'10px', borderRadius:'8px', border:'none', opacity:rejectionReason.trim().length < 10 ? 0.5 : 1, cursor:'pointer' }}>Confirm Reject</button>
          </div>
        </div>
      </div>
    )}
  </div>
}