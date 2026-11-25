import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  CarFront,
  ChevronRight,
  CircleUserRound,
  IdCard,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { supabase, type DriverDocument, type Profile } from '../lib/supabase'
import { createDriverDocumentSignedUrl, EXPIRING_DRIVER_DOCUMENT_TYPES, REQUIRED_DOCS, normalizeDocType as canonicalType } from '../lib/driverDocuments'
import compressImageFile from '../lib/compressImageFile'

type StoredDocument = Pick<DriverDocument,
  'id' | 'doc_type' | 'document_type' | 'document_url' | 'document_date' | 'file_url' | 'status' | 'rejection_reason' | 'created_at' | 'expiry_date' | 'prdp_number' | 'document_hash'
> & { preview_url?: string | null }

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024

const inputStyle: CSSProperties = {
  minHeight: 42,
  padding: '10px 12px',
  border: '1px solid #D0D5DD',
  borderRadius: 9,
  background: '#ffffff',
  color: '#111827',
  fontSize: 15,
  fontWeight: 500,
  width: '100%',
  boxSizing: 'border-box',
  WebkitTextFillColor: '#111827',
}
const selectStyle: CSSProperties = { ...inputStyle, appearance: 'auto' as any }
const labelStyle: CSSProperties = { display: 'grid', gap: 5, fontSize: 13, fontWeight: 700, color: '#111827' }

const southAfricanToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function safeUUID() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function normalizeDateInput(raw: string): string {
  if (!raw) return ''
  raw = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) {
    const d = m[1].padStart(2,'0')
    const mo = m[2].padStart(2,'0')
    const y = m[3]
    return `${y}-${mo}-${d}`
  }
  return raw
}

function fixPdpType(raw: string): string {
  const t = String(raw || '').toLowerCase().trim()
  if (t.includes('prdp') || t === 'pdp' || t.includes('pdp') || t.includes('pr_dp') || t === 'professional_driving_permit') {
    return 'prdp'
  }
  return canonicalType(raw)
}

function isValidSAID(id: string) {
  if (!/^\d{13}$/.test(id)) return false
  const yy = Number(id.slice(0, 2)); const month = Number(id.slice(2, 4)); const day = Number(id.slice(4, 6))
  const currentYear = new Date().getFullYear(); const currentYearTwoDigits = currentYear % 100
  const year = yy <= currentYearTwoDigits ? 2000 + yy : 1900 + yy
  const birthDate = new Date(year, month - 1, day)
  const validBirthDate = birthDate.getFullYear() === year && birthDate.getMonth() === month - 1 && birthDate.getDate() === day && birthDate <= new Date()
  if (!validBirthDate) return false
  let sum = 0; let doubleDigit = true
  for (let index = 11; index >= 0; index -= 1) { let digit = Number(id[index]); if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9 } sum += digit; doubleDigit = !doubleDigit }
  return (sum + Number(id[12])) % 10 === 0
}

function getExpiryForType(expiryDates: Record<string, string>, documentType: string): string | null {
  const c = fixPdpType(documentType)
  const raw = expiryDates[c] || expiryDates[documentType] || null
  return raw ? normalizeDateInput(raw) : null
}

function loadSavedExpiry(): Record<string, string> {
  try {
    const raw = localStorage.getItem('br_expiry_dates')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const out: Record<string,string> = {}
    if (typeof parsed === 'object' && parsed) {
      for (const [k,v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[fixPdpType(k)] = normalizeDateInput(v)
      }
    }
    return out
  } catch { return {} }
}

const DOCUMENT_CARDS = REQUIRED_DOCS.map(document => ({
  ...document,
  type: fixPdpType(document.type),
  title: document.label,
  description: document.helper ? `Upload a clear ${document.helper.toLowerCase()} image.` : `Upload ${document.label}.`,
  bucket: fixPdpType(document.type) === 'profile_photo' ? 'profile-photos' : 'driver-documents',
  Icon: fixPdpType(document.type) === 'profile_photo' || fixPdpType(document.type) === 'selfie'
    ? CircleUserRound
    : fixPdpType(document.type).startsWith('vehicle_') ? CarFront : IdCard,
}))

const IDENTITY_TYPES = new Set(['profile_photo','selfie','sa_id','drivers_license'])
const IDENTITY_CARDS = DOCUMENT_CARDS.filter(c => IDENTITY_TYPES.has(fixPdpType(c.type)))
const REMAINING_CARDS = DOCUMENT_CARDS.filter(c => !IDENTITY_TYPES.has(fixPdpType(c.type)))
const ONBOARDING_DOCUMENT_TYPES = new Set([...REQUIRED_DOCS.map(d => fixPdpType(d.type)), 'sa_id', 'drivers_license'].map(fixPdpType))

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #edf0f3',
  borderRadius: 16,
  boxShadow: '0 5px 18px rgba(20, 33, 50, 0.045)',
}

function latestDocuments(documents: StoredDocument[]) {
  const latest = new Map<string, StoredDocument>()
  for (const document of documents) {
    const rawType = (document.document_type || document.doc_type || '').toLowerCase().trim()
    if (/police|holding|selfie with id/i.test(rawType)) continue
    const type = fixPdpType(rawType)
    if (!ONBOARDING_DOCUMENT_TYPES.has(type)) continue
    if (!latest.has(type)) latest.set(type, { ...document, doc_type: type, document_type: type })
    else {
      const existing = latest.get(type)!
      if ((document.created_at || '') > (existing.created_at || '')) {
        latest.set(type, { ...document, doc_type: type, document_type: type })
      }
    }
  }
  return [...latest.values()]
}

function isCardComplete(card: typeof DOCUMENT_CARDS[number], documents: StoredDocument[]) {
  const want = fixPdpType(card.type)
  const document = documents.find(item => {
    const ct = fixPdpType(item.doc_type || '')
    const cdt = fixPdpType(item.document_type || '')
    return ct === want || cdt === want
  })
  if (!document?.file_url && !(document as any)?.document_url) return false
  // FIX: Rejected doc is NOT complete - was counting as complete, driver stuck on Submit
  if (String(document.status || '').toUpperCase() === 'REJECTED') return false
  if (card.expiryRequired) return Boolean(document?.expiry_date)
  return true
}

function isComplete(documents: StoredDocument[]) {
  return DOCUMENT_CARDS.every(card => isCardComplete(card, documents))
}

const BANK_NAMES = ['Capitec', 'FNB', 'Standard Bank', 'ABSA', 'Nedbank', 'TymeBank', 'Discovery Bank', 'African Bank', 'Investec', 'Postbank', 'Bidvest Bank'] as const

const FALLBACK_RIDE_TYPES = [
  { category: 'buddy_lite', label: 'Buddy Lite', seats: '2 seats', icon: '🛺' },
  { category: 'buddy_plus', label: 'Buddy Plus', seats: '3 seats', icon: '🚗' },
  { category: 'buddy_max', label: 'Buddy Max', seats: '7 seats', icon: '🚐' },
]
function normalizeRideType(raw: string | null | undefined) {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'go' || v === 'economy' || v === 'buddy' || v === 'buddy_lite') return 'buddy_lite'
  if (v === 'comfort' || v === 'buddy_plus') return 'buddy_plus'
  if (v === 'xl' || v === 'buddy_xl' || v === 'buddy_family' || v === 'family' || v === 'buddy_max') return 'buddy_max'
  return v || 'buddy_plus'
}
const FALLBACK_ZONES = ['Bela-Bela','Burgersfort','Giyani','Lebowakgomo','Lephalale','Makhado','Mankweng','Mokopane','Musina','Phalaborwa','Polokwane CBD','Seshego','Thohoyandou','Tzaneen'].map((name, i) => ({ id: name, name }))

type PlanStep = { title: string; desc: string; time?: string; status: 'complete' | 'in_progress' | 'todo' }

function ApplicationPlan({ onContinue, onEnterApp, profileComplete, docsComplete, docsCount, totalDocs, identityComplete }: { onContinue: () => void; onEnterApp: () => void; profileComplete: boolean; docsComplete: boolean; docsCount: number; totalDocs: number; identityComplete: boolean }) {
  const steps: PlanStep[] = [
    { title: 'Profile', desc: 'Your personal details', status: profileComplete ? 'complete' : 'in_progress' },
    { title: 'Identity - Step 1', desc: 'Selfie + SA ID + Licence + ID Numbers - then App opens', time: 'About 5 min', status: identityComplete ? 'complete' : 'in_progress' },
    { title: 'Vehicle & Rest - Step 2', desc: 'Vehicle details + Photos + Service area + Ride type - Finish inside app to Go Online', time: 'About 10 min', status: identityComplete ? 'in_progress' : 'todo' },
    { title: 'Bundle to Go Online', desc: 'Buy trips to go online - Driver keeps 100%', status: 'todo' },
  ]
  return (
    <main style={{ minHeight: '100dvh', background: '#fff', padding: '20px 18px 100px', fontFamily: 'Inter, sans-serif', color: '#182230' }}>
      <div style={{ width: 'min(100%, 480px)', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: '#E6F0FF', display: 'grid', placeItems: 'center', fontSize: 20, color: '#0066FF' }}>👤</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-.02em', color: '#111827' }}>Your application plan</h1>
            <p style={{ margin: '4px 0 0', color: '#667085', fontSize: 14 }}>Step 1: Identity → Tap Enter App. Step 2: Finish Vehicle + Zones + Ride Type inside app → Buy Bundle → Go Online.</p>
          </div>
        </div>
        <div style={{ display: 'grid' }}>
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1
            const isCompleteStep = step.status === 'complete'
            const isActive = step.status === 'in_progress'
            return (
              <div key={step.title} style={{ display: 'flex', gap: 14, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, zIndex: 1, display: 'grid', placeItems: 'center', background: isCompleteStep ? '#0066FF' : isActive ? '#0066FF' : '#fff', border: isCompleteStep || isActive ? '2px solid #0066FF' : '2px solid #D0D5DD', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                    {isCompleteStep ? '✓' : isActive ? '•' : ''}
                  </div>
                  {!isLast && <div style={{ width: 2, flex: 1, minHeight: 48, background: isCompleteStep ? '#0066FF' : '#EAECF0' }} />}
                </div>
                <div style={{ paddingBottom: 28, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 16, color: '#111827' }}>{step.title}</strong>
                    {step.time && <span style={{ fontSize: 12, color: '#667085' }}>{step.time}</span>}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#667085' }}>{isCompleteStep ? 'Complete' : isActive ? 'In progress' : step.desc}</p>
                  {isActive && step.time && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#0066FF', fontWeight: 700 }}>In progress · {step.time}</p>}
                </div>
              </div>
            )
          })}
        </div>
        {identityComplete && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 700, color: '#067647', textAlign: 'center' }}>🎉 Identity done! Tap Enter App below. Finish {totalDocs - docsCount} docs inside to Go Online.</div>}
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', padding: '12px 18px 22px', borderTop: '1px solid #F2F4F7' }}>
        {identityComplete ? (
          <button onClick={onEnterApp} style={{ width: 'min(100%, 480px)', display: 'block', margin: '0 auto', padding: 16, border: 0, borderRadius: 14, background: '#16A34A', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>🚀 Enter App - Finish Rest Inside</button>
        ) : (
          <button onClick={onContinue} style={{ width: 'min(100%, 480px)', display: 'block', margin: '0 auto', padding: 16, border: 0, borderRadius: 14, background: '#0066FF', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>Continue - Upload Identity</button>
        )}
      </div>
    </main>
  )
}

export function DriverOnboarding({ profile, onDashboard }: { profile: Profile; onDashboard: () => void }) {
  const VEHICLE_YEARS = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 30 }, (_, i) => currentYear - i)
  }, [])

  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [verificationStatus, setVerificationStatus] = useState('not_started')
  const [driverIdNumber, setDriverIdNumber] = useState((profile as any).id_number || '')
  const [licenceNumber, setLicenceNumber] = useState((profile as any).licence_number || (profile as any).driver_licence_number || '')
  const [bankDetails, setBankDetails] = useState({ bank_name: '', bank_account_holder: '', bank_account_number: '', bank_branch_code: '' })
  const [vehicleDetails, setVehicleDetails] = useState({ year: '', make_model: '', colour: '', registration: '' })
  const [serviceZones, setServiceZones] = useState<{id: string, name: string}[]>([])
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [rideTypes, setRideTypes] = useState<{category: string, label: string, seats?: string, icon?: string}[]>(FALLBACK_RIDE_TYPES)
  const [selectedRideType, setSelectedRideType] = useState('')
  const [documentDates, setDocumentDates] = useState<Record<string, string>>({})
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>(() => loadSavedExpiry())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [showPlan, setShowPlan] = useState(true)
  const [phase, setPhase] = useState<'identity' | 'remaining'>('identity')
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    try {
      if (driverIdNumber) localStorage.setItem('br_id_number', driverIdNumber)
      if (licenceNumber) localStorage.setItem('br_licence_number', licenceNumber)
      if (Object.keys(expiryDates).length > 0) {
        localStorage.setItem('br_expiry_dates', JSON.stringify(expiryDates))
      }
      localStorage.setItem('br_vehicle', JSON.stringify(vehicleDetails))
      localStorage.setItem('br_zones', JSON.stringify(selectedZones))
      localStorage.setItem('br_ride_type', selectedRideType)
    } catch {}
  }, [driverIdNumber, licenceNumber, expiryDates, vehicleDetails, selectedZones, selectedRideType])

  async function saveIdNumbersNow(idVal: string, licVal: string) {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || profile.id
    if (!ownerId) return
    if (!idVal.trim() && !licVal.trim()) return
    try {
      localStorage.setItem('br_id_number', idVal)
      localStorage.setItem('br_licence_number', licVal)
    } catch {}
    await supabase.from('profiles').update({
      id_number: idVal.trim() || null,
      licence_number: licVal.trim() || null,
      driver_licence_number: licVal.trim() || null,
    } as any).eq('id', ownerId)
  }

  async function saveVehicleNow(zonesOverride?: string[], rideOverride?: string, vehicleOverride?: typeof vehicleDetails) {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || profile.id
    if (!ownerId) return
    const v = vehicleOverride || vehicleDetails
    const zones = zonesOverride !== undefined ? zonesOverride : selectedZones
    const ride = normalizeRideType(rideOverride !== undefined ? rideOverride : selectedRideType)
    const payload: any = {
      driver_id: ownerId,
      vehicle_year: v.year ? Number(v.year) : null,
      make_model: v.make_model.trim() || null,
      colour: v.colour.trim() || null,
      registration: v.registration.trim().toUpperCase() || null,
      service_zones: zones,
      ride_type: ride || null,
      updated_at: new Date().toISOString(),
    }
    const { data: existing } = await supabase.from('driver_vehicles').select('id').eq('driver_id', ownerId).maybeSingle()
    if (existing) {
      await supabase.from('driver_vehicles').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('driver_vehicles').insert(payload)
    }
    await supabase.from('profiles').update({
      service_zones: zones,
      ride_type: ride || null,
    } as any).eq('id', ownerId)
  }

  const rejectedTypes = useMemo(() => new Set(documents.filter(document => ONBOARDING_DOCUMENT_TYPES.has(fixPdpType(document.doc_type))).filter(document => (document.status || '').toUpperCase() === 'REJECTED').map(document => fixPdpType(document.doc_type))), [documents])
  const completedCards = DOCUMENT_CARDS.filter(card => isCardComplete(card, documents)).length
  const identityCompletedCount = IDENTITY_CARDS.filter(card => isCardComplete(card, documents)).length
  const identityComplete = IDENTITY_CARDS.every(card => isCardComplete(card, documents))
  const remainingCompletedCount = REMAINING_CARDS.filter(card => isCardComplete(card, documents)).length
  const approvedCount = REQUIRED_DOCS.filter(requirement => {
    const document = documents.find(item => fixPdpType(item.doc_type || item.document_type) === fixPdpType(requirement.type))
    return Boolean(document && String(document.status || '').toUpperCase() === 'APPROVED' && (document.file_url || (document as any).document_url))
  }).length
  const totalDocs = REQUIRED_DOCS.length
  const hasIdNumbers = Boolean(driverIdNumber.trim() && licenceNumber.trim())
  const identityReadyToEnterApp = identityComplete && hasIdNumbers
  const vehicleComplete = Boolean(vehicleDetails.year && vehicleDetails.make_model.trim() && vehicleDetails.colour.trim() && vehicleDetails.registration.trim())
  const zonesComplete = selectedZones.length > 0
  const rideTypeComplete = Boolean(selectedRideType)

  async function loadDocuments() {
    setLoading(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveId = user?.id || profile.id
    const [documentsResult, profileResult, vehicleResult] = await Promise.all([
      supabase.from('driver_documents').select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash').order('created_at', { ascending: false }).eq('driver_id', effectiveId),
      supabase.from('profiles').select('verification_status,is_verified,bank_name,bank_account_holder,bank_account_number,bank_branch_code,id_number,licence_number,driver_licence_number,service_zones,ride_type,vehicle_year,vehicle_make_model,vehicle_colour,vehicle_registration').eq('id', effectiveId).single(),
      supabase.from('driver_vehicles').select('*').eq('driver_id', effectiveId).maybeSingle(),
    ])
    if (documentsResult.error || profileResult.error) { setError(`Could not load your onboarding status: ${documentsResult.error?.message || profileResult.error?.message}`); setLoading(false); return }

    try {
      const zonesRes = await supabase.from('service_zones').select('id,name').order('name')
      if (!zonesRes.error && zonesRes.data && zonesRes.data.length > 0) {
        setServiceZones(zonesRes.data as any)
      } else {
        setServiceZones(FALLBACK_ZONES)
      }
    } catch { setServiceZones(FALLBACK_ZONES) }

    try {
      const faresRes = await supabase.from('fare_categories').select('id,label').eq('active', true).order('base_fare')
      if (!faresRes.error && faresRes.data && faresRes.data.length > 0) {
        const seatMap: Record<string,string> = { buddy_lite: '2 seats', buddy_plus: '3 seats', buddy_max: '7 seats' }
        const iconMap: Record<string,string> = { buddy_lite: '🛺', buddy_plus: '🚗', buddy_max: '🚐' }
        const mapped = faresRes.data.map((r: any) => {
          const cat = normalizeRideType(r.id || r.label)
          return { category: cat, label: String(r.label || cat), seats: seatMap[cat] || '', icon: iconMap[cat] || '🚗' }
        })
        const seen = new Set<string>()
        const deduped = mapped.filter((m: any) => { if (seen.has(m.category)) return false; seen.add(m.category); return true })
        const onlyOurs = deduped.filter((m:any) => ['buddy_lite','buddy_plus','buddy_max'].includes(m.category))
        if (onlyOurs.length > 0) setRideTypes(onlyOurs)
        else setRideTypes(FALLBACK_RIDE_TYPES)
      } else {
        setRideTypes(FALLBACK_RIDE_TYPES)
      }
    } catch { setRideTypes(FALLBACK_RIDE_TYPES) }

    const v: any = vehicleResult.data || profileResult.data
    if (v) {
      setVehicleDetails({
        year: v.vehicle_year ? String(v.vehicle_year) : '',
        make_model: v.make_model || v.vehicle_make_model || '',
        colour: v.colour || v.vehicle_colour || '',
        registration: v.registration || v.vehicle_registration || '',
      })
      const zones = v.service_zones || (profileResult.data as any)?.service_zones || []
      if (Array.isArray(zones)) setSelectedZones(zones)
      setSelectedRideType(normalizeRideType(v.ride_type || (profileResult.data as any)?.ride_type || ''))
    }
    try {
      const savedV = JSON.parse(localStorage.getItem('br_vehicle') || '{}')
      if (savedV.make_model) setVehicleDetails(savedV)
      const savedZ = JSON.parse(localStorage.getItem('br_zones') || '[]')
      if (Array.isArray(savedZ) && savedZ.length) setSelectedZones(savedZ)
      const savedR = localStorage.getItem('br_ride_type') || ''
      if (savedR) setSelectedRideType(normalizeRideType(savedR))
    } catch {}
    const loadedDocuments = latestDocuments((documentsResult.data || []) as StoredDocument[])
    const documentsWithPreviews = await Promise.all(loadedDocuments.map(async document => { try { return { ...document, preview_url: await createDriverDocumentSignedUrl(document.document_url || document.file_url) } } catch { return { ...document, preview_url: null } } }))
    const status = profileResult.data?.verification_status || 'not_started'
    setDocuments(documentsWithPreviews); setVerificationStatus(status)
    setDocumentDates(Object.fromEntries(loadedDocuments.filter(document => document.document_date).map(document => [fixPdpType(document.doc_type), document.document_date!.slice(0, 10)])))
    let localExpiry: Record<string,string> = {}
    try { 
      const raw = JSON.parse(localStorage.getItem('br_expiry_dates') || '{}')
      for (const [k,v] of Object.entries(raw)) if (typeof v==='string') localExpiry[fixPdpType(k)]=normalizeDateInput(v)
    } catch {}
    const dbExpiry = Object.fromEntries(loadedDocuments.filter(document => document.expiry_date).map(document => [fixPdpType(document.doc_type), normalizeDateInput(document.expiry_date!.slice(0, 10))]))
    const merged: Record<string,string> = { ...localExpiry, ...dbExpiry }
    setExpiryDates(prev => ({ ...prev, ...merged }))
    setBankDetails({ bank_name: profileResult.data.bank_name || '', bank_account_holder: profileResult.data.bank_account_holder || '', bank_account_number: profileResult.data.bank_account_number || '', bank_branch_code: profileResult.data.bank_branch_code || '' })
    let localId = ''; let localLic = ''
    try { localId = localStorage.getItem('br_id_number') || ''; localLic = localStorage.getItem('br_licence_number') || '' } catch {}
    const dbId = (profileResult.data as any).id_number || ''
    const dbLic = (profileResult.data as any).licence_number || (profileResult.data as any).driver_licence_number || ''
    setDriverIdNumber(prev => prev || localId || dbId || '')
    setLicenceNumber(prev => prev || localLic || dbLic || '')
    setLoading(false)
    const loadedIdentityComplete = IDENTITY_CARDS.every(card => { const doc = loadedDocuments.find(d => fixPdpType(d.doc_type) === fixPdpType(card.type)); return Boolean(doc?.file_url || (doc as any)?.document_url) && (!card.expiryRequired || Boolean(doc?.expiry_date)) && String(doc?.status || '').toUpperCase() !== 'REJECTED' })
    if (loadedIdentityComplete || status === 'identity_complete') {
      setPhase('remaining')
      setShowPlan(false)
    } else {
      setPhase('identity')
    }
    const documentsByType = new Map<string, StoredDocument>(loadedDocuments.map(document => [fixPdpType(document.doc_type || document.document_type), document] as const))
    const allApproved = REQUIRED_DOCS.every(requirement => { const document = documentsByType.get(fixPdpType(requirement.type)); if (!document || String(document.status || '').toUpperCase() !== 'APPROVED' || !(document.file_url || (document as any).document_url)) return false; if (requirement.expiryRequired && (!document.expiry_date || document.expiry_date < southAfricanToday())) return false; return true })
    if ((status === 'approved' || status === 'verified') && profileResult.data.is_verified && allApproved) { onDashboard(); return }
  }

  useEffect(() => { void loadDocuments() }, [profile.id])

  async function uploadFile(cardType: string, bucket: string, file: File, documentType = cardType): Promise<boolean> {
    setUploading(cardType); setError(''); setUploadStatus('')
    let uploadedPath: string | null = null
    try {
      const cType = fixPdpType(documentType)
      let expiryDate = getExpiryForType(expiryDates, documentType)
      const card = DOCUMENT_CARDS.find(item => fixPdpType(item.type) === cType)
      if (card?.expiryRequired) {
        if (!expiryDate) throw new Error('Please select Expiry Date for this document FIRST, then click Upload. Expiry is required.')
        expiryDate = normalizeDateInput(expiryDate)
        if (expiryDate < southAfricanToday()) throw new Error('This document has expired.')
      }
      if (expiryDate) expiryDate = normalizeDateInput(expiryDate)
      let processedFile: File = file
      if (file.type.startsWith('image/')) {
        setUploadStatus(`Compressing ${(file.size / 1024 / 1024).toFixed(1)}MB photo...`)
        try { processedFile = await compressImageFile(file) } catch { processedFile = file }
      }
      if (processedFile.size <= 0) throw new Error('File is empty. Try again or take a screenshot.')
      if (processedFile.size > MAX_UPLOAD_SIZE) throw new Error(`File too large ${(processedFile.size/1024/1024).toFixed(1)}MB > 20MB.`)
      const extFromName = processedFile.name.split('.').pop()?.toLowerCase() || ''
      const guessedType = processedFile.type || (extFromName === 'pdf' ? 'application/pdf' : extFromName === 'png' ? 'image/png' : extFromName === 'webp' ? 'image/webp' : 'image/jpeg')
      const isPdf = guessedType === 'application/pdf'
      const blob: Blob | File = processedFile
      const outputType = isPdf ? 'application/pdf' : (processedFile.type || guessedType || 'image/jpeg')
      const extension = isPdf ? 'pdf' : (extFromName === 'png' ? 'png' : extFromName === 'webp' ? 'webp' : 'jpg')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const ownerId = user.id
      const finalDocType = cType
      const path = `${ownerId}/${finalDocType}/${safeUUID()}.${extension}`
      uploadedPath = path
      setUploadStatus(`Uploading ${(processedFile.size / 1024).toFixed(0)}KB...`)
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, { contentType: outputType, upsert: true })
      if (uploadError) throw new Error(`Storage: ${uploadError.message}`)
      const storageReference = `${bucket}:${path}`
      const payload: any = { 
        driver_id: ownerId, 
        doc_type: finalDocType, 
        document_type: finalDocType, 
        file_url: storageReference, 
        document_url: storageReference, 
        document_date: documentDates[finalDocType] || southAfricanToday(), 
        status: 'PENDING', 
        expiry_date: expiryDate || null, 
        rejection_reason: null 
      }
      const { data: existingRows, error: existingError } = await supabase.from('driver_documents').select('id, created_at').eq('driver_id', ownerId).or(`doc_type.eq.${finalDocType},document_type.eq.${finalDocType}`).order('created_at', { ascending: false }).limit(1)
      if (existingError) throw new Error(`Could not check existing document: ${existingError.message}`)
      const existing = existingRows?.[0] || null
      let savedDocument: any = null; let saveError: any = null
      if (existing) { const res = await supabase.from('driver_documents').update(payload).eq('id', existing.id).select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash').single(); savedDocument = res.data; saveError = res.error }
      else { const res = await supabase.from('driver_documents').insert({ ...payload, created_at: new Date().toISOString() }).select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash').single(); savedDocument = res.data; saveError = res.error }
      if (saveError) {
        // FIX: Cleanup orphan storage on DB fail
        await supabase.storage.from(bucket).remove([path]).catch(()=>{})
        throw new Error(`DB: ${saveError.message}`)
      }
      await saveIdNumbersNow(driverIdNumber, licenceNumber)
      const savedPreview = await createDriverDocumentSignedUrl(storageReference).catch(() => null)
      setDocuments(current => latestDocuments([...current.filter(d => fixPdpType(d.doc_type) !== finalDocType), { ...(savedDocument as StoredDocument), preview_url: savedPreview }]))
      uploadedPath = null
      if (finalDocType === 'profile_photo') { const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path); await supabase.from('profiles').update({ avatar_url: publicData.publicUrl }).eq('id', ownerId) }
      setUploadStatus(''); setError('')
      return true
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      setError(`Upload failed for ${documentType}: ${message}`); setUploadStatus(''); return false
    } finally { setUploading(null) }
  }

  async function handleFileChange(cardType: string, bucket: string, event: ChangeEvent<HTMLInputElement>, documentType = cardType) {
    const selectedFiles = Array.from(event.target.files || []); event.target.value = ''
    if (!selectedFiles.length) return
    await uploadFile(cardType, bucket, selectedFiles[0], documentType)
  }

  async function updateDocumentDate(documentType: string, field: 'document_date' | 'expiry_date', value: string) {
    const cType = fixPdpType(documentType)
    const normalizedValue = normalizeDateInput(value)
    if (field === 'document_date') {
      setDocumentDates(current => ({ ...current, [cType]: normalizedValue }))
    } else {
      setExpiryDates(current => {
        const next = { ...current, [cType]: normalizedValue }
        try { localStorage.setItem('br_expiry_dates', JSON.stringify(next)) } catch {}
        return next
      })
    }
  }

  async function enterAppAfterIdentity() {
    const trimmedId = driverIdNumber.trim()
    if (!trimmedId) { setError('Enter your SA ID number / Passport number - required.'); return }
    if (/^\d{13}$/.test(trimmedId) && !isValidSAID(trimmedId)) { setError('Enter a valid 13-digit South African ID number.'); return }
    if (!licenceNumber.trim()) { setError('Enter your driver licence number - required.'); return }
    if (!identityComplete) { setError('Upload all 4 identity docs: Profile Photo + Selfie + SA ID + Licence'); return }
    setSubmitting(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ownerId = user?.id || profile.id
      const { error } = await supabase.from('profiles').update({ id_number: trimmedId, licence_number: licenceNumber.trim(), driver_licence_number: licenceNumber.trim(), verification_status: 'identity_complete' } as any).eq('id', ownerId)
      if (error) throw error
      window.location.assign('/driver')
    } catch (e: any) { setError('Could not enter app: ' + (e.message || String(e))); setSubmitting(false) }
  }

  async function backToApp() {
    window.location.assign('/driver')
  }

  async function submitForReview() {
    const trimmedId = driverIdNumber.trim()
    if (!trimmedId) { setError('Enter your SA ID number / Passport number - required.'); return }
    if (/^\d{13}$/.test(trimmedId) && !isValidSAID(trimmedId)) { setError('Enter a valid 13-digit South African ID number.'); return }
    if (!licenceNumber.trim()) { setError('Enter your driver licence number - required.'); return }
    if (!isComplete(documents) || rejectedTypes.size > 0 || submitting) return
    if (!vehicleComplete) { setError('Complete Vehicle Details: Year + Make/Model + Colour + Registration (exactly as licence disc).'); return }
    if (!zonesComplete) { setError('Choose at least 1 Service Area where you want to drive.'); return }
    if (!rideTypeComplete) { setError('Choose your Ride Type (e.g. Buddy Lite / Buddy Plus / Buddy Max).'); return }
    const hasBadExpiry = REQUIRED_DOCS.some(document => {
      if (!EXPIRING_DRIVER_DOCUMENT_TYPES.has(fixPdpType(document.type))) return false
      const exp = getExpiryForType(expiryDates, document.type) || ''
      if (!exp) return true
      if (normalizeDateInput(exp) < southAfricanToday()) return true
      return false
    })
    if (hasBadExpiry) { setError('All required expiry dates must be current.'); return }
    setSubmitting(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || profile.id
    const metadataUpdates = await Promise.all(REQUIRED_DOCS.map(document => {
      const c = fixPdpType(document.type)
      const payload: any = { 
        document_date: documentDates[c] || new Date().toISOString().split('T')[0],
      }
      if (EXPIRING_DRIVER_DOCUMENT_TYPES.has(c)) {
        payload.expiry_date = normalizeDateInput(getExpiryForType(expiryDates, document.type) || '') || null
      }
      return supabase.from('driver_documents').update(payload).eq('driver_id', ownerId).or(`doc_type.eq.${c},document_type.eq.${c}`)
    }))
    const metadataError = metadataUpdates.find(result => result.error)?.error
    if (metadataError) { setError(`Could not save details: ${metadataError.message}`); setSubmitting(false); return }
    await saveVehicleNow()
    const { error: bankError } = await supabase.from('profiles').update({ bank_name: bankDetails.bank_name || null, bank_account_holder: bankDetails.bank_account_holder.trim() || null, bank_account_number: bankDetails.bank_account_number.trim() || null, bank_branch_code: bankDetails.bank_branch_code.trim() || null, id_number: trimmedId, licence_number: licenceNumber.trim(), service_zones: selectedZones, ride_type: normalizeRideType(selectedRideType) } as any).eq('id', ownerId)
    if (bankError) { setError(`Could not save details: ${bankError.message}`); setSubmitting(false); return }
    const { error: submitError } = await supabase.rpc('submit_driver_documents_for_review')
    if (submitError) {
      const msg = (submitError.message || '').toLowerCase()
      if (msg.includes('argument') || msg.includes('function')) { const { error: retryError } = await supabase.rpc('submit_driver_documents_for_review', { p_driver_id: ownerId } as any); if (retryError) { setError(`Could not submit: ${retryError.message}`); setSubmitting(false); return } }
      else { setError(`Could not submit: ${submitError.message}`); setSubmitting(false); return }
    }
    setVerificationStatus('pending_verification'); setSubmitting(false)
  }

  const progress = Math.round(completedCards / DOCUMENT_CARDS.length * 100)
  const remainingCount = totalDocs - completedCards

  if (loading) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085' }}><LoaderCircle size={30} className="driver-onboarding-spin" /><style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}'}</style></main>
  }

  const isPendingState = ['pending','pending_verification','submitted','under_review','in_review'].includes(verificationStatus)
  const hasSubmitted = isPendingState && documents.length > 0
  const allDocsApproved = approvedCount === REQUIRED_DOCS.length
  const isFullyApproved = (verificationStatus === 'approved' || verificationStatus === 'verified') && allDocsApproved

  if (hasSubmitted && rejectedTypes.size === 0 && !isFullyApproved && isComplete(documents) && verificationStatus !== 'identity_complete') {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', fontFamily: 'Inter, sans-serif', color: '#182230' }}><section style={{ ...cardStyle, width: 'min(100%, 480px)', padding: '42px 28px', textAlign: 'center' }}><div style={{ margin: '0 auto 20px', width: 76, height: 76, borderRadius: 38, display: 'grid', placeItems: 'center', color: '#C2410C', background: '#FFF7ED', border: '2px solid #FDBA74' }}>⏳</div><h1 style={{ margin: '0 0 10px', fontSize: 26, color: '#111827' }}>Applicant Pending</h1><p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>{approvedCount}/{totalDocs} documents approved. You cannot go online until Admin approves all documents.</p><div style={{ marginTop: 16, textAlign: 'left', background: '#FFF7ED', border: '1px solid #FDBA74', padding: 12, borderRadius: 10, fontSize: 13 }}><strong style={{ color: '#C2410C' }}>● Applicant Pending: {approvedCount}/{totalDocs} Approved</strong><div style={{ marginTop: 8, display: 'grid', gap: 6 }}>{documents.map(doc => (<div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{color:'#111827'}}>{doc.doc_type}</span><span style={{ fontWeight: 700, color: String(doc.status).toUpperCase() === 'APPROVED' ? '#067647' : '#C2410C' }}>{String(doc.status).toUpperCase()}</span></div>))}</div>{approvedCount === totalDocs && <div style={{ marginTop: 12, color: '#0066FF', fontWeight: 700, background: '#E6F0FF', padding: 8, borderRadius: 8 }}>✓ All documents approved - waiting for Admin final approval. Click "Check Approval Status" below.</div>}{approvedCount < totalDocs && <div style={{ marginTop: 12, color: '#667085' }}>Waiting for Admin to review remaining documents</div>}</div><button onClick={async () => { setChecking(true); await loadDocuments(); setChecking(false) }} disabled={checking} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: checking ? '#cbd2da' : '#EA580C', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>{checking ? 'Checking...' : 'Check Approval Status'}</button>{error && <p style={{ color: '#b42318', fontSize: 13, marginTop: 12 }}>{error}</p>}</section></main>
  }

  if (showPlan) { return <ApplicationPlan onContinue={() => setShowPlan(false)} onEnterApp={() => void enterAppAfterIdentity()} profileComplete={Boolean((profile as any)?.full_name || (profile as any)?.first_name)} docsComplete={isComplete(documents)} docsCount={completedCards} totalDocs={DOCUMENT_CARDS.length} identityComplete={identityReadyToEnterApp} /> }

  const visibleCards = phase === 'identity' ? IDENTITY_CARDS : REMAINING_CARDS
  const phaseTitle = phase === 'identity' ? 'Step 1 - Your Identity' : 'Step 2 - Finish to Go Online'

  return <main style={{ minHeight: '100dvh', background: '#F8F9FA', padding: '28px 18px 48px', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
    <style>{`
      input, select, textarea { color-scheme: light; background:#fff !important; color:#111827 !important; -webkit-text-fill-color:#111827 !important; }
      input::placeholder, textarea::placeholder { color:#667085 !important; opacity:1 !important; }
      input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, select:-webkit-autofill {
        -webkit-text-fill-color:#111827 !important;
        -webkit-box-shadow: 0 0 0px 1000px #ffffff inset !important;
        background:#fff !important;
        transition: background-color 5000s ease-in-out 0s !important;
      }
      select option { background:#fff !important; color:#111827 !important; }
    `}</style>
    <div style={{ width: 'min(100%, 760px)', margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <button onClick={() => void backToApp()} style={{ marginBottom: 12, background: 'none', border: 'none', color: '#0066FF', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>← Back to App</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
          <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 14, color: '#0066FF', background: '#E6F0FF' }}><CarFront size={24} /></div>
          <div><strong style={{ display: 'block', fontSize: 17, color: '#111827' }}>BuddyRide Driver</strong><span style={{ fontSize: 13, color: '#667085' }}>Driver onboarding - {phaseTitle}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setPhase('identity')} style={{ flex: 1, padding: 12, borderRadius: 12, border: phase === 'identity' ? '2px solid #0066FF' : '1px solid #D0D5DD', background: phase === 'identity' ? '#E6F0FF' : '#fff', fontWeight: 800, fontSize: 13, color: '#111827' }}>1. Identity {identityCompletedCount}/4 {identityComplete ? '✅' : ''}</button>
          <button onClick={() => setPhase('remaining')} style={{ flex: 1, padding: 12, borderRadius: 12, border: phase === 'remaining' ? '2px solid #0066FF' : '1px solid #D0D5DD', background: phase === 'remaining' ? '#E6F0FF' : '#fff', fontWeight: 800, fontSize: 13, color: '#111827' }}>2. Rest to Go Online {remainingCompletedCount}/{REMAINING_CARDS.length}</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 10 }}>
          <div><p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{phaseTitle}</p><h1 style={{ margin: 0, fontSize: 'clamp(25px, 5vw, 34px)', letterSpacing: '-.03em', color: '#111827' }}>Your documents</h1></div>
          <strong style={{ color: '#344054', whiteSpace: 'nowrap' }}>{completedCards}/{DOCUMENT_CARDS.length} complete</strong>
        </div>
        <div style={{ height: 9, overflow: 'hidden', borderRadius: 99, background: '#e5e9ef' }}><div style={{ width: `${progress}%`, height: '100%', borderRadius: 99, background: '#0066FF', transition: 'width .25s ease' }} /></div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#667085' }}>{progress}% complete - {remainingCount} docs left to Go Online</p>
        {phase === 'identity' && identityReadyToEnterApp && <div style={{ marginTop: 12, background: '#ECFDF3', border: '1px solid #ABEFC6', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 700, color: '#067647', textAlign: 'center' }}>🎉 Identity complete! Tap "Enter App" below - finish rest inside.</div>}
      </header>
      {phase === 'identity' && (
      <section style={{ ...cardStyle, padding: 17, marginBottom: 18 }}>
        <p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step 1 - Identity Numbers</p>
        <h2 style={{ margin: '0 0 12px', fontSize: 20, color: '#111827' }}>ID &amp; Licence Numbers</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#667085' }}>Enter numbers exactly as on your documents. Both required to enter app.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={labelStyle}>SA ID Number / Passport Number *<input type="text" value={driverIdNumber} onChange={e => setDriverIdNumber(e.target.value)} onBlur={() => void saveIdNumbersNow(driverIdNumber, licenceNumber)} placeholder="e.g. 9001015009087" inputMode="numeric" style={inputStyle} /></label>
          <label style={labelStyle}>Driver Licence Number *<input type="text" value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)} onBlur={() => void saveIdNumbersNow(driverIdNumber, licenceNumber)} placeholder="As on licence card" style={inputStyle} /></label>
          {driverIdNumber && /^\d{13}$/.test(driverIdNumber.trim()) && !isValidSAID(driverIdNumber.trim()) && <p style={{ color: '#b42318', fontSize: 12 }}>Invalid SA ID - check digits.</p>}
          {rejectedTypes.size > 0 && <p style={{ color: '#b42318', fontSize: 12, fontWeight: 700 }}>⚠️ Rejected: {[...rejectedTypes].join(', ')} - re-upload below. Reason shown on card.</p>}
        </div>
      </section>
      )}
      {phase === 'remaining' && (
      <>
      <section style={{ ...cardStyle, padding: 17, marginBottom: 18 }}>
        <p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Vehicle &amp; Ride Type - Tell us about your vehicle</p>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, color: '#111827' }}>Vehicle details</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#667085' }}>Add the details exactly as they appear on the licence disk. {vehicleComplete ? '✅ Complete' : '❌ Incomplete - required to submit.'}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={labelStyle}>Vehicle year *<select value={vehicleDetails.year} onChange={e => { const v = { ...vehicleDetails, year: e.target.value }; setVehicleDetails(v); void saveVehicleNow(undefined, undefined, v) }} style={selectStyle}><option value="">Year</option>{VEHICLE_YEARS.map(y => <option key={`year-${y}`} value={y}>{y}</option>)}</select></label>
          <label style={labelStyle}>Make and model *<input type="text" value={vehicleDetails.make_model} onChange={e => setVehicleDetails(c => ({ ...c, make_model: e.target.value }))} onBlur={() => void saveVehicleNow()} placeholder="Search vehicle (e.g. Polo Vivo)" style={inputStyle} /></label>
          <label style={labelStyle}>Colour *<input type="text" value={vehicleDetails.colour} onChange={e => setVehicleDetails(c => ({ ...c, colour: e.target.value }))} onBlur={() => void saveVehicleNow()} placeholder="Colour (e.g. White, Silver, Red)" style={inputStyle} /></label>
          <label style={labelStyle}>Registration number *<input type="text" value={vehicleDetails.registration} onChange={e => setVehicleDetails(c => ({ ...c, registration: e.target.value.toUpperCase() }))} onBlur={() => void saveVehicleNow()} placeholder="Vehicle registration" style={{ ...inputStyle, textTransform: 'uppercase' }} /></label>
          <button type="button" onClick={() => void saveVehicleNow()} style={{ padding: 12, borderRadius: 10, background: vehicleComplete ? '#16A34A' : '#0066FF', color: '#fff', fontWeight: 800, border: 0, cursor: 'pointer' }}>{vehicleComplete ? '✅ Saved' : 'Save details'}</button>
        </div>
      </section>
      <section style={{ ...cardStyle, padding: 17, marginBottom: 18 }}>
        <p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Service Area - Limpopo</p>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, color: '#111827' }}>Choose where you would like to drive</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#667085' }}>Tick multiple - you will only get requests in these zones. {zonesComplete ? `✅ ${selectedZones.length} selected` : '❌ Pick at least 1'}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {serviceZones.length === 0 && <p style={{ fontSize: 13, color: '#b54708', fontWeight: 700 }}>Loading Limpopo zones...</p>}
          {serviceZones.map(z => {
            const checked = selectedZones.includes(z.id)
            return <label key={z.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderRadius: 10, border: checked ? '2px solid #0066FF' : '1px solid #D0D5DD', background: checked ? '#E6F0FF' : '#fff', cursor: 'pointer', color: '#111827' }}><input type="checkbox" checked={checked} onChange={() => {
              const next = checked ? selectedZones.filter(x => x !== z.id) : [...selectedZones, z.id]
              setSelectedZones(next)
              void saveVehicleNow(next)
            }} style={{ accentColor: '#0066FF', width: 18, height: 18 }} /><strong style={{ fontSize: 14 }}>{z.name}</strong></label>
          })}
        </div>
      </section>
      <section style={{ ...cardStyle, padding: 17, marginBottom: 18 }}>
        <p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Ride Type</p>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, color: '#111827' }}>Choose ride type</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#667085' }}>{rideTypeComplete ? `✅ ${rideTypes.find(r => r.category === normalizeRideType(selectedRideType))?.label || selectedRideType}` : '❌ Choose one — this must match what passenger books'}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {rideTypes.map(r => {
            const checked = normalizeRideType(selectedRideType) === r.category
            return <label key={r.category} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderRadius: 10, border: checked ? '2px solid #0066FF' : '1px solid #D0D5DD', background: checked ? '#E6F0FF' : '#fff', cursor: 'pointer', opacity: !vehicleComplete ? 0.5 : 1, color: '#111827' }}><input type="radio" name="ride_type" checked={checked} disabled={!vehicleComplete} onChange={() => { setSelectedRideType(r.category); void saveVehicleNow(undefined, r.category) }} style={{ accentColor: '#0066FF' }} /><span style={{ fontSize: 20 }}>{(r as any).icon || '🚗'}</span><span><strong style={{ fontSize: 14, display: 'block' }}>{r.label}</strong><span style={{ fontSize: 12, color: '#667085' }}>{(r as any).seats || ''} • {r.category === 'buddy_lite' ? 'Small & cheapest' : r.category === 'buddy_plus' ? 'Standard - popular' : 'Family van - group & luggage'}</span></span></label>
          })}
          {!vehicleComplete && <p style={{ fontSize: 12, color: '#b54708', fontWeight: 700 }}>⚠️ Save vehicle details first to unlock ride type.</p>}
        </div>
      </section>
      </>
      )}
      <div style={{ display: 'grid', gap: 18 }}>
        {(['Driver Identity', 'Vehicle Papers', 'Vehicle Exterior', 'Vehicle Interior', 'Safety'] as const).map(section => {
          const sectionCards = DOCUMENT_CARDS.filter(card => card.section === section).filter(card => visibleCards.some(v => fixPdpType(v.type) === fixPdpType(card.type)))
          if (sectionCards.length === 0) return null
          return (
          <section key={section} style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, color: '#111827' }}>{section} {section === 'Vehicle Exterior' ? '(4 photos: Front, Rear, Left, Right)' : section === 'Vehicle Interior' ? '(3 photos: Dashboard, Front seats, Rear seats)' : ''}</h2>
            {sectionCards.map(card => {
              const { type, title, description, bucket, Icon } = card
              const want = fixPdpType(type)
              const document = documents.find(item => fixPdpType(item.doc_type || '') === want || fixPdpType(item.document_type || '') === want)
              const uploaded = Boolean(document?.file_url || (document as any)?.document_url)
              const rejected = (document?.status || '').toUpperCase() === 'REJECTED'
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const expiry = document?.expiry_date ? new Date(`${document.expiry_date}T00:00:00`) : null
              const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000) : null
              const needsExpiry = card.expiryRequired && !document?.expiry_date
              const badgeLabel = !uploaded ? 'MISSING' : needsExpiry ? 'EXPIRY MISSING' : daysToExpiry !== null && daysToExpiry < 0 ? 'EXPIRED' : daysToExpiry !== null && daysToExpiry < 30 ? 'EXPIRING SOON' : rejected ? 'REJECTED' : (document?.status || '').toUpperCase() === 'APPROVED' ? 'VERIFIED' : 'PENDING'
              const badgeColor = badgeLabel === 'EXPIRED' || badgeLabel === 'REJECTED' ? '#b42318' : badgeLabel === 'VERIFIED' ? '#067647' : badgeLabel === 'EXPIRING SOON' ? '#b54708' : badgeLabel === 'EXPIRY MISSING' ? '#b54708' : '#667085'
              const activeUpload = uploading === type || uploading === want
              const fileUrl = document?.preview_url || null
              return <article key={type} className="driver-onboarding-card" style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 42, height: 42, display: 'grid', flex: '0 0 42px', placeItems: 'center', borderRadius: 12, background: '#f1f4f7', color: '#475467' }}><Icon size={22} /></div>
                  <div style={{ minWidth: 0 }}><strong style={{ fontSize: 14, color: '#111827' }}>{title}</strong><div style={{ marginTop: 4, color: '#667085', fontSize: 12 }}>{description}</div><span style={{ display: 'inline-block', marginTop: 6, padding: '4px 8px', borderRadius: 99, color: badgeColor, background: `${badgeColor}18`, fontSize: 11, fontWeight: 700 }}>{badgeLabel}</span>{rejected && document?.rejection_reason && <div style={{ marginTop: 6, color: '#b42318', fontSize: 12, fontWeight: 700 }}>Reason: {document.rejection_reason}</div>}</div>
                </div>
                <div>
                  <input ref={element => { fileInputs.current[type] = element; fileInputs.current[want] = element }} type="file" accept={type.startsWith('vehicle_photo') || type.startsWith('vehicle_interior_photo') || type === 'profile_photo' || type === 'selfie' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} capture={type === 'selfie' ? 'user' : undefined} onChange={event => void handleFileChange(type, bucket, event, type)} style={{ display: 'none' }} />
                  <button type="button" disabled={Boolean(uploading)} onClick={() => fileInputs.current[type]?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 11, border: '1px dashed #b8c2ce', color: '#344054', background: '#fff', fontSize: 12, fontWeight: 700 }}>{activeUpload ? <LoaderCircle size={16} className="driver-onboarding-spin" /> : <Upload size={16} />}{activeUpload ? 'Uploading' : uploaded ? 'Replace' : 'Upload'}</button>
                </div>
                {card.expiryRequired && (
                <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 10 }}><label style={labelStyle}>Expiry Date (as printed on document) - REQUIRED<input type="date" required value={getExpiryForType(expiryDates, type) || ''} onChange={event => void updateDocumentDate(type, 'expiry_date', event.target.value)} style={inputStyle} /></label>{needsExpiry && uploaded && <p style={{ margin: 0, color: '#b54708', fontSize: 12, fontWeight: 700 }}>⚠️ File uploaded but expiry missing - pick date then click Replace to re-upload with expiry.</p>}</div>
                )}
                {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" style={{ gridColumn: '1 / -1', color: '#0066FF', fontSize: 12, fontWeight: 700 }}>Preview uploaded document</a>}
              </article>
            })}
          </section>
          )
        })}
      </div>
      {phase === 'remaining' && (
      <section style={{ ...cardStyle, marginTop: 16, padding: 17 }}>
        <p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Bank - Optional in Bundle Model</p>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, color: '#111827' }}>Bank details (optional)</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#667085' }}>In Bundle Model rider pays you directly (cash/card). Platform does NOT pay you, so bank is NOT required to Go Online. Fill only if you want refunds.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={labelStyle}>Bank Name<select value={bankDetails.bank_name} onChange={event => setBankDetails(current => ({ ...current, bank_name: event.target.value }))} style={selectStyle}><option value="">Select your bank (optional)</option>{BANK_NAMES.map(bank => <option key={bank} value={bank}>{bank}</option>)}</select></label>
          {([['bank_account_holder', 'Account Holder'], ['bank_account_number', 'Account Number'], ['bank_branch_code', 'Branch Code']] as const).map(([field, label]) => (<label key={field} style={labelStyle}>{label}<input type="text" inputMode={field === 'bank_account_holder' ? 'text' : 'numeric'} autoComplete="off" value={bankDetails[field]} onChange={event => setBankDetails(current => ({ ...current, [field]: event.target.value }))} style={inputStyle} /></label>))}
        </div>
      </section>
      )}
      {uploadStatus && <p style={{ ...cardStyle, margin: '16px 0 0', padding: 14, borderColor: '#B2CCFF', background: '#E6F0FF', color: '#0052CC', fontSize: 13, fontWeight: 700 }}>{uploadStatus}</p>}
      {error && <p role="alert" style={{ ...cardStyle, margin: '16px 0 0', padding: 14, borderColor: '#fecdca', color: '#b42318', fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</p>}
      <section style={{ ...cardStyle, marginTop: 16, padding: 17, display: 'flex', alignItems: 'center', gap: 12 }}><ShieldCheck size={22} color="#0066FF" /><div><strong style={{ fontSize: 14, color: '#111827' }}>Your documents are kept secure</strong><p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>They’re used only to verify your driver account. POPIA: kept only while you are a driver + 6 months.</p></div></section>
      {phase === 'identity' ? (
        <button type="button" disabled={!identityReadyToEnterApp || submitting || Boolean(uploading)} onClick={() => void enterAppAfterIdentity()} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, padding: 16, border: 0, borderRadius: 14, background: identityReadyToEnterApp ? '#16A34A' : '#cbd2da', color: '#fff', fontSize: 16, fontWeight: 800, cursor: identityReadyToEnterApp && !submitting ? 'pointer' : 'not-allowed' }}>{submitting ? 'Entering App…' : !hasIdNumbers ? 'Enter ID Number + Licence Number to continue' : !identityComplete ? `Upload Identity ${identityCompletedCount}/4 to Enter App` : <>🚀 Enter App - Finish Rest Inside <ChevronRight size={19} /></>}</button>
      ) : (
        <button type="button" disabled={completedCards !== DOCUMENT_CARDS.length || !vehicleComplete || !zonesComplete || !rideTypeComplete || !hasIdNumbers || rejectedTypes.size > 0 || submitting || Boolean(uploading)} onClick={() => void submitForReview()} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, padding: 16, border: 0, borderRadius: 14, background: completedCards === DOCUMENT_CARDS.length && vehicleComplete && zonesComplete && rideTypeComplete && hasIdNumbers ? '#0066FF' : '#cbd2da', color: '#fff', fontSize: 16, fontWeight: 800, cursor: completedCards === DOCUMENT_CARDS.length && vehicleComplete && zonesComplete && rideTypeComplete && hasIdNumbers && !submitting ? 'pointer' : 'not-allowed' }}>{submitting ? 'Submitting for review…' : rejectedTypes.size > 0 ? 'Replace rejected documents to continue' : !hasIdNumbers ? 'Enter ID Number + Licence Number to continue' : !vehicleComplete ? 'Complete Vehicle Details to continue' : !zonesComplete ? 'Choose Service Area to continue' : !rideTypeComplete ? 'Choose Ride Type to continue' : completedCards === DOCUMENT_CARDS.length ? <>Submit for Review <ChevronRight size={19} /></> : `Complete ${remainingCount} remaining + vehicle + zones + ride type (${completedCards}/${DOCUMENT_CARDS.length})`}</button>
      )}
      {phase === 'identity' && <button type="button" onClick={() => setPhase('remaining')} style={{ width: '100%', marginTop: 10, padding: 12, border: '1px solid #D0D5DD', borderRadius: 12, background: '#fff', fontWeight: 700, fontSize: 13, color: '#111827' }}>Skip - Show all docs</button>}
      {phase === 'remaining' && <button type="button" onClick={() => void backToApp()} style={{ width: '100%', marginTop: 10, padding: 12, border: '1px solid #0066FF', borderRadius: 12, background: '#E6F0FF', color: '#0066FF', fontWeight: 800, fontSize: 13 }}>← Back to App - Save &amp; Continue Later</button>}
    </div>
    <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}@media(max-width:520px){.driver-onboarding-card{flex-wrap:wrap}}'}</style>
  </main>
}