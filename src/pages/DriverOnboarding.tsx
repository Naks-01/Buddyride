import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { CarFront, ChevronRight, CircleUserRound, IdCard, LoaderCircle, ShieldCheck, Upload } from 'lucide-react'
import { supabase, type DriverDocument, type Profile } from '../lib/supabase'
import { createDriverDocumentSignedUrl, EXPIRING_DRIVER_DOCUMENT_TYPES, REQUIRED_DOCS, normalizeDocType as canonicalType } from '../lib/driverDocuments'
import compressImageFile from '../lib/compressImageFile'

type StoredDocument = Pick<DriverDocument, 'id' | 'doc_type' | 'document_type' | 'document_url' | 'document_date' | 'file_url' | 'status' | 'rejection_reason' | 'created_at' | 'expiry_date' | 'prdp_number' | 'document_hash'> & { preview_url?: string | null }
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024
const inputStyle: CSSProperties = { minHeight: 42, padding: '10px 12px', border: '1px solid #D0D5DD', borderRadius: 9, background: '#ffffff', color: '#111827', fontSize: 15, fontWeight: 500, width: '100%', boxSizing: 'border-box', WebkitTextFillColor: '#111827' }
const selectStyle: CSSProperties = { ...inputStyle, appearance: 'auto' as any }
const labelStyle: CSSProperties = { display: 'grid', gap: 5, fontSize: 13, fontWeight: 700, color: '#111827' }
const southAfricanToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function safeUUID() { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }
function normalizeDateInput(raw: string): string { if (!raw) return ''; raw = raw.trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; return raw }
function fixPdpType(raw: string): string { const t = String(raw || '').toLowerCase().trim(); if (t.includes('prdp') || t === 'pdp' || t.includes('pdp') || t.includes('pr_dp') || t === 'professional_driving_permit') return 'prdp'; return canonicalType(raw) }
function isValidSAID(id: string) { if (!/^\d{13}$/.test(id)) return false; const yy = Number(id.slice(0,2)); const month = Number(id.slice(2,4)); const day = Number(id.slice(4,6)); const currentYear = new Date().getFullYear(); const currentYearTwoDigits = currentYear % 100; const year = yy <= currentYearTwoDigits ? 2000 + yy : 1900 + yy; const birthDate = new Date(year, month - 1, day); if (!(birthDate.getFullYear() === year && birthDate.getMonth() === month - 1 && birthDate.getDate() === day && birthDate <= new Date())) return false; let sum = 0; let doubleDigit = true; for (let index = 11; index >= 0; index -= 1) { let digit = Number(id[index]); if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9 } sum += digit; doubleDigit = !doubleDigit } return (sum + Number(id[12])) % 10 === 0 }
function getExpiryForType(expiryDates: Record<string, string>, documentType: string): string | null { const c = fixPdpType(documentType); const raw = expiryDates[c] || expiryDates[documentType] || null; return raw ? normalizeDateInput(raw) : null }
function loadSavedExpiry(): Record<string, string> { try { const raw = localStorage.getItem('br_expiry_dates'); if (!raw) return {}; const parsed = JSON.parse(raw); const out: Record<string,string> = {}; if (typeof parsed === 'object' && parsed) { for (const [k,v] of Object.entries(parsed)) { if (typeof v === 'string') out[fixPdpType(k)] = normalizeDateInput(v) } } return out } catch { return {} } }
const DOCUMENT_CARDS = REQUIRED_DOCS.map(document => ({ ...document, type: fixPdpType(document.type), title: document.label, description: document.helper ? `Upload a clear ${document.helper.toLowerCase()} image.` : `Upload ${document.label}.`, bucket: fixPdpType(document.type) === 'profile_photo' ? 'profile-photos' : 'driver-documents', Icon: fixPdpType(document.type) === 'profile_photo' || fixPdpType(document.type) === 'selfie' ? CircleUserRound : fixPdpType(document.type).startsWith('vehicle_') ? CarFront : IdCard }))
const IDENTITY_TYPES = new Set(['profile_photo','selfie','sa_id','drivers_license'])
const IDENTITY_CARDS = DOCUMENT_CARDS.filter(c => IDENTITY_TYPES.has(fixPdpType(c.type)))
const REMAINING_CARDS = DOCUMENT_CARDS.filter(c => !IDENTITY_TYPES.has(fixPdpType(c.type)))
const ONBOARDING_DOCUMENT_TYPES = new Set([...REQUIRED_DOCS.map(d => fixPdpType(d.type)), 'sa_id', 'drivers_license'].map(fixPdpType))
const cardStyle: CSSProperties = { background: '#fff', border: '1px solid #edf0f3', borderRadius: 16, boxShadow: '0 5px 18px rgba(20, 33, 50, 0.045)' }
function latestDocuments(documents: StoredDocument[]) { const latest = new Map<string, StoredDocument>(); for (const document of documents) { const rawType = (document.document_type || document.doc_type || '').toLowerCase().trim(); if (/police|holding|selfie with id/i.test(rawType)) continue; const type = fixPdpType(rawType); if (!ONBOARDING_DOCUMENT_TYPES.has(type)) continue; if (!latest.has(type)) latest.set(type, { ...document, doc_type: type, document_type: type }); else { const existing = latest.get(type)!; if ((document.created_at || '') > (existing.created_at || '')) latest.set(type, { ...document, doc_type: type, document_type: type }) } } return [...latest.values()] }
// FIX: Don't block Enter App on expiry_date in DB - expiry can be in localStorage, and Enter App must never be blocked by it
function isCardComplete(card: typeof DOCUMENT_CARDS[number], documents: StoredDocument[]) { const want = fixPdpType(card.type); const document = documents.find(item => fixPdpType(item.doc_type || '') === want || fixPdpType(item.document_type || '') === want); if (!document?.file_url && !(document as any)?.document_url) return false; if (String(document.status || '').toUpperCase() === 'REJECTED') return false; return true }
const BANK_NAMES = ['Capitec','FNB','Standard Bank','ABSA','Nedbank','TymeBank','Discovery Bank','African Bank','Investec','Postbank','Bidvest Bank'] as const
const FALLBACK_RIDE_TYPES = [{ category: 'buddy_lite', label: 'Buddy Lite', seats: '2 seats', icon: '🛺' }, { category: 'buddy_plus', label: 'Buddy Plus', seats: '3 seats', icon: '🚗' }, { category: 'buddy_max', label: 'Buddy Max', seats: '7 seats', icon: '🚐' }]
function normalizeRideType(raw: string | null | undefined) { const v = String(raw || '').toLowerCase().trim(); if (v === 'go' || v === 'economy' || v === 'buddy' || v === 'buddy_lite') return 'buddy_lite'; if (v === 'comfort' || v === 'buddy_plus') return 'buddy_plus'; if (v === 'xl' || v === 'buddy_xl' || v === 'buddy_family' || v === 'family' || v === 'buddy_max') return 'buddy_max'; return v || 'buddy_plus' }
const FALLBACK_ZONES = ['Bela-Bela','Burgersfort','Giyani','Lebowakgomo','Lephalale','Makhado','Mankweng','Mokopane','Musina','Phalaborwa','Polokwane CBD','Seshego','Thohoyandou','Tzaneen'].map((name) => ({ id: name, name }))

type PlanStep = { title: string; desc: string; time?: string; status: 'complete' | 'in_progress' | 'todo' }
// FIX: ApplicationPlan now shows error + button is NEVER disabled + onClick is direct
function ApplicationPlan({ onContinue, onEnterApp, profileComplete, identityComplete, error }: { onContinue: () => void; onEnterApp: () => void; profileComplete: boolean; docsComplete: boolean; docsCount: number; totalDocs: number; identityComplete: boolean; error?: string }) {
  const steps: PlanStep[] = [
    { title: 'Profile', desc: 'Your personal details', status: profileComplete ? 'complete' : 'in_progress' },
    { title: 'Identity - Step 1', desc: 'Selfie + SA ID + Licence + ID Numbers - then App opens', time: 'About 5 min', status: identityComplete ? 'complete' : 'in_progress' },
    { title: 'Vehicle & Rest - Step 2', desc: 'Vehicle + Service Area + Ride Type - Finish INSIDE app to Go Online', time: 'About 10 min', status: identityComplete ? 'in_progress' : 'todo' },
    { title: 'Bundle to Go Online', desc: 'Buy trips to go online - Driver keeps 100%', status: 'todo' },
  ]
  return (
    <main style={{ minHeight: '100dvh', background: '#fff', padding: '20px 18px 100px', fontFamily: 'Inter, sans-serif', color: '#182230' }}>
      <div style={{ width: 'min(100%, 480px)', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: '#E6F0FF', display: 'grid', placeItems: 'center', fontSize: 20, color: '#0066FF' }}>👤</div>
          <div><h1 style={{ margin: 0, fontSize: 22, color: '#111827' }}>Your application plan</h1><p style={{ margin: '4px 0 0', color: '#667085', fontSize: 14 }}>Step 1 Identity opens app. Step 2 Vehicle + Zones + Ride Type inside app unlocks Go Online. GPS used live, not at signup.</p></div>
        </div>
        <div style={{ display: 'grid' }}>{steps.map((step, i) => { const isLast = i === steps.length - 1; const isCompleteStep = step.status === 'complete'; const isActive = step.status === 'in_progress'; return (<div key={step.title} style={{ display: 'flex', gap: 14 }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><div style={{ width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center', background: isCompleteStep ? '#0066FF' : isActive ? '#0066FF' : '#fff', border: isCompleteStep || isActive ? '2px solid #0066FF' : '2px solid #D0D5DD', color: '#fff', fontWeight: 800 }}>{isCompleteStep ? '✓' : isActive ? '•' : ''}</div>{!isLast && <div style={{ width: 2, flex: 1, minHeight: 48, background: isCompleteStep ? '#0066FF' : '#EAECF0' }} />}</div><div style={{ paddingBottom: 28, flex: 1 }}><strong style={{ fontSize: 16 }}>{step.title}</strong><p style={{ margin: '2px 0 0', fontSize: 13, color: '#667085' }}>{step.desc}</p></div></div>) })}</div>
        {identityComplete && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 700, color: '#067647', textAlign: 'center' }}>🎉 Identity done! Tap Enter App. Zones + Vehicle done INSIDE app - not here.</div>}
        {error && <div style={{ marginTop: 12, background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 12, fontSize: 13, color: '#B42318', fontWeight: 700 }}>{error}</div>}
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', padding: '12px 18px 22px', borderTop: '1px solid #F2F4F7', zIndex: 50 }}>
        {identityComplete ? (<button onClick={() => { console.log('ENTER APP CLICKED'); onEnterApp() }} style={{ width: 'min(100%, 480px)', display: 'block', margin: '0 auto', padding: 16, border: 0, borderRadius: 14, background: '#16A34A', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>🚀 Enter App - Finish Rest Inside</button>) : (<button onClick={onContinue} style={{ width: 'min(100%, 480px)', display: 'block', margin: '0 auto', padding: 16, border: 0, borderRadius: 14, background: '#0066FF', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>Continue - Upload Identity</button>)}
      </div>
    </main>
  )
}

export function DriverOnboarding({ profile, onDashboard }: { profile: Profile; onDashboard: () => void }) {
  const VEHICLE_YEARS = useMemo(() => { const currentYear = new Date().getFullYear(); return Array.from({ length: 30 }, (_, i) => currentYear - i) }, [])
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [verificationStatus, setVerificationStatus] = useState('not_started')
  const [driverIdNumber, setDriverIdNumber] = useState((profile as any).id_number || '')
  const [licenceNumber, setLicenceNumber] = useState((profile as any).licence_number || (profile as any).driver_licence_number || '')
  const [vehicleDetails, setVehicleDetails] = useState({ year: '', make_model: '', colour: '', registration: '' })
  const [serviceZones, setServiceZones] = useState<{id: string, name: string}[]>(FALLBACK_ZONES)
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [rideTypes, setRideTypes] = useState(FALLBACK_RIDE_TYPES)
  const [selectedRideType, setSelectedRideType] = useState('')
  const [documentDates, setDocumentDates] = useState<Record<string, string>>({})
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>(() => loadSavedExpiry())
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showPlan, setShowPlan] = useState(true)
  const [phase, setPhase] = useState<'identity' | 'remaining'>('identity')
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { try { if (driverIdNumber) localStorage.setItem('br_id_number', driverIdNumber); if (licenceNumber) localStorage.setItem('br_licence_number', licenceNumber); localStorage.setItem('br_expiry_dates', JSON.stringify(expiryDates)) } catch {} }, [driverIdNumber, licenceNumber, expiryDates])

  async function saveIdNumbersNow(idVal: string, licVal: string) { const { data: { user } } = await supabase.auth.getUser(); const ownerId = user?.id || profile.id; if (!ownerId) return; await supabase.from('profiles').update({ id_number: idVal.trim() || null, licence_number: licVal.trim() || null, driver_licence_number: licVal.trim() || null } as any).eq('id', ownerId) }

  const completedCards = DOCUMENT_CARDS.filter(card => isCardComplete(card, documents)).length
  const identityCompletedCount = IDENTITY_CARDS.filter(card => isCardComplete(card, documents)).length
  // FIX: identityComplete = file exists, NOT expiry. Expiry must not block Enter App.
  const identityComplete = IDENTITY_CARDS.every(card => isCardComplete(card, documents)) || verificationStatus === 'identity_complete' || (typeof window !== 'undefined' && localStorage.getItem('br_identity_complete') === '1')
  const hasIdNumbers = Boolean(driverIdNumber.trim() && licenceNumber.trim())
  const identityReadyToEnterApp = identityComplete && hasIdNumbers
  // For the green button in ApplicationPlan, use identityComplete alone - ID numbers are saved in background, must not block
  const canEnterApp = identityComplete

  async function loadDocuments() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveId = user?.id || profile.id
    const [documentsResult, profileResult, vehicleResult] = await Promise.all([
      supabase.from('driver_documents').select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash').order('created_at', { ascending: false }).eq('driver_id', effectiveId),
      supabase.from('profiles').select('verification_status,is_verified,id_number,licence_number,driver_licence_number,service_zones,ride_type').eq('id', effectiveId).single(),
      supabase.from('driver_vehicles').select('*').eq('driver_id', effectiveId).maybeSingle(),
    ])
    if (documentsResult.error || profileResult.error) { setError(`Load failed: ${documentsResult.error?.message || profileResult.error?.message}`); setLoading(false); return }
    const loadedDocuments = latestDocuments((documentsResult.data || []) as StoredDocument[])
    const documentsWithPreviews = await Promise.all(loadedDocuments.map(async document => { try { return { ...document, preview_url: await createDriverDocumentSignedUrl(document.document_url || document.file_url) } } catch { return { ...document, preview_url: null } } }))
    const status = profileResult.data?.verification_status || 'not_started'
    setDocuments(documentsWithPreviews); setVerificationStatus(status)
    setDocumentDates(Object.fromEntries(loadedDocuments.filter(document => document.document_date).map(document => [fixPdpType(document.doc_type), document.document_date!.slice(0, 10)])))
    const dbExpiry = Object.fromEntries(loadedDocuments.filter(document => document.expiry_date).map(document => [fixPdpType(document.doc_type), normalizeDateInput(document.expiry_date!.slice(0, 10))]))
    setExpiryDates(prev => ({ ...prev, ...dbExpiry }))
    const v: any = vehicleResult.data || {}
    if (v.vehicle_year) setVehicleDetails({ year: String(v.vehicle_year), make_model: v.make_model || '', colour: v.colour || '', registration: v.registration || '' })
    if (profileResult.data.service_zones) setSelectedZones(profileResult.data.service_zones as any)
    if (profileResult.data.ride_type) setSelectedRideType(profileResult.data.ride_type as any)
    setDriverIdNumber(prev => prev || (profileResult.data as any).id_number || localStorage.getItem('br_id_number') || '')
    setLicenceNumber(prev => prev || (profileResult.data as any).licence_number || (profileResult.data as any).driver_licence_number || localStorage.getItem('br_licence_number') || '')
    setLoading(false)
    const loadedIdentityComplete = IDENTITY_CARDS.every(card => { const doc = loadedDocuments.find(d => fixPdpType(d.doc_type) === fixPdpType(card.type)); return Boolean(doc?.file_url || (doc as any)?.document_url) && String(doc?.status || '').toUpperCase() !== 'REJECTED' })
    if (loadedIdentityComplete || status === 'identity_complete') { setPhase('remaining'); setShowPlan(false) }
  }
  useEffect(() => { void loadDocuments() }, [profile.id])

  async function uploadFile(cardType: string, bucket: string, file: File, documentType = cardType): Promise<boolean> {
    setUploading(cardType); setError(''); setUploadStatus('')
    try {
      const cType = fixPdpType(documentType)
      let expiryDate = getExpiryForType(expiryDates, documentType)
      const card = DOCUMENT_CARDS.find(item => fixPdpType(item.type) === cType)
      if (card?.expiryRequired) { if (!expiryDate) throw new Error('Select Expiry Date FIRST'); expiryDate = normalizeDateInput(expiryDate); if (expiryDate < southAfricanToday()) throw new Error('Expired') }
      let processedFile: File = file
      if (file.type.startsWith('image/')) { setUploadStatus('Compressing...'); try { processedFile = await compressImageFile(file) } catch { processedFile = file } }
      const extFromName = processedFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      const isPdf = extFromName === 'pdf' || processedFile.type === 'application/pdf'
      const extension = isPdf ? 'pdf' : 'jpg'
      const outputType = isPdf ? 'application/pdf' : 'image/jpeg'
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const ownerId = user.id
      const path = `${ownerId}/${cType}/${safeUUID()}.${extension}`
      setUploadStatus('Uploading...')
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, processedFile, { contentType: outputType, upsert: true })
      if (uploadError) throw new Error(`Storage: ${uploadError.message}`)
      const storageReference = `${bucket}:${path}`
      const payload: any = { driver_id: ownerId, doc_type: cType, document_type: cType, file_url: storageReference, document_url: storageReference, document_date: documentDates[cType] || southAfricanToday(), status: 'PENDING', expiry_date: expiryDate || null, rejection_reason: null }
      const { data: existingRows } = await supabase.from('driver_documents').select('id').eq('driver_id', ownerId).or(`doc_type.eq.${cType},document_type.eq.${cType}`).limit(1)
      const existing = existingRows?.[0] || null
      let savedDocument: any = null
      if (existing) { const res = await supabase.from('driver_documents').update(payload).eq('id', existing.id).select('*').single(); savedDocument = res.data } else { const res = await supabase.from('driver_documents').insert({ ...payload, created_at: new Date().toISOString() }).select('*').single(); savedDocument = res.data }
      const savedPreview = await createDriverDocumentSignedUrl(storageReference).catch(() => null)
      setDocuments(current => latestDocuments([...current.filter(d => fixPdpType(d.doc_type) !== cType), { ...(savedDocument as StoredDocument), preview_url: savedPreview }]))
      setUploadStatus(''); return true
    } catch (e: any) { setError(`Upload failed: ${e.message}`); setUploadStatus(''); return false } finally { setUploading(null) }
  }
  async function handleFileChange(cardType: string, bucket: string, event: ChangeEvent<HTMLInputElement>, documentType = cardType) { const selectedFiles = Array.from(event.target.files || []); event.target.value = ''; if (!selectedFiles.length) return; await uploadFile(cardType, bucket, selectedFiles[0], documentType) }
  async function updateDocumentDate(documentType: string, field: 'document_date' | 'expiry_date', value: string) { const cType = fixPdpType(documentType); const normalizedValue = normalizeDateInput(value); if (field === 'document_date') setDocumentDates(current => ({ ...current, [cType]: normalizedValue })); else setExpiryDates(current => { const next = { ...current, [cType]: normalizedValue }; try { localStorage.setItem('br_expiry_dates', JSON.stringify(next)) } catch {}; return next }) }

  // FIX: Enter App must NEVER return early. No ID check, no expiry check, no identity check blocking. Always enter.
  async function enterAppAfterIdentity() {
    console.log('enterAppAfterIdentity called - forcing enter')
    try { localStorage.setItem('br_identity_complete','1') } catch {}
    // Background save - never await, never block
    try {
      const trimmedId = driverIdNumber.trim()
      if (trimmedId || licenceNumber.trim()) {
        supabase.auth.getUser().then(({ data: { user } }) => {
          const ownerId = user?.id || profile.id
          if (ownerId) supabase.from('profiles').update({ id_number: trimmedId || null, licence_number: licenceNumber.trim() || null, driver_licence_number: licenceNumber.trim() || null, verification_status: 'identity_complete' } as any).eq('id', ownerId).then(()=>{})
        })
      }
    } catch {}
    onDashboard()
  }
  async function backToApp() { try { localStorage.setItem('br_identity_complete','1') } catch {}; onDashboard() }

  const totalSteps = DOCUMENT_CARDS.length
  const doneSteps = completedCards
  const progress = Math.min(100, Math.round(doneSteps / totalSteps * 100))
  const visibleCards = phase === 'identity' ? IDENTITY_CARDS : REMAINING_CARDS
  const phaseTitle = phase === 'identity' ? 'Step 1 - Your Identity' : 'Step 2 - Finish to Go Online (inside app)'

  if (loading) return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><LoaderCircle size={30} className="driver-onboarding-spin" /><style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}'}</style></main>
  if (showPlan) return <ApplicationPlan onContinue={() => setShowPlan(false)} onEnterApp={() => void enterAppAfterIdentity()} profileComplete={Boolean((profile as any)?.full_name)} docsComplete={completedCards === totalSteps} docsCount={completedCards} totalDocs={totalSteps} identityComplete={canEnterApp} error={error} />

  return <main style={{ minHeight: '100dvh', background: '#F8F9FA', padding: '28px 18px 48px', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ width: 'min(100%, 760px)', margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <button onClick={() => void backToApp()} style={{ marginBottom: 12, background: 'none', border: 'none', color: '#0066FF', fontWeight: 700, cursor: 'pointer' }}>← Back to App</button>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><button onClick={() => setPhase('identity')} style={{ flex: 1, padding: 12, borderRadius: 12, border: phase === 'identity' ? '2px solid #0066FF' : '1px solid #D0D5DD', background: phase === 'identity' ? '#E6F0FF' : '#fff', fontWeight: 800 }}>1. Identity {identityCompletedCount}/4 {identityComplete ? '✅' : ''}</button><button onClick={() => setPhase('remaining')} style={{ flex: 1, padding: 12, borderRadius: 12, border: phase === 'remaining' ? '2px solid #0066FF' : '1px solid #D0D5DD', background: phase === 'remaining' ? '#E6F0FF' : '#fff', fontWeight: 800 }}>2. Rest {REMAINING_CARDS.filter(c => isCardComplete(c, documents)).length}/{REMAINING_CARDS.length}</button></div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{phaseTitle}</h1>
        <div style={{ height: 9, overflow: 'hidden', borderRadius: 99, background: '#e5e9ef', marginTop: 10 }}><div style={{ width: `${progress}%`, height: '100%', borderRadius: 99, background: '#0066FF' }} /></div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#667085' }}>{progress}% complete - Identity {identityCompletedCount}/4 - Service Area picked INSIDE app via GPS, not here</p>
      </header>
      {phase === 'identity' && (<section style={{ ...cardStyle, padding: 17, marginBottom: 18 }}><h2 style={{ margin: '0 0 12px', fontSize: 18 }}>ID & Licence Numbers</h2><div style={{ display: 'grid', gap: 10 }}><label style={labelStyle}>SA ID / Passport *<input type="text" value={driverIdNumber} onChange={e => setDriverIdNumber(e.target.value)} style={inputStyle} /></label><label style={labelStyle}>Driver Licence Number *<input type="text" value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)} style={inputStyle} /></label></div></section>)}
      <div style={{ display: 'grid', gap: 12 }}>
        {visibleCards.map(card => {
          const want = fixPdpType(card.type); const document = documents.find(item => fixPdpType(item.doc_type || '') === want || fixPdpType(item.document_type || '') === want); const uploaded = Boolean(document?.file_url || (document as any)?.document_url); const activeUpload = uploading === card.type || uploading === want; const fileUrl = document?.preview_url || null
          return <article key={card.type} style={{ ...cardStyle, padding: 16, display: 'grid', gridTemplateColumns: '1fr auto', gap: 14 }}><div style={{ display: 'flex', gap: 12 }}><div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 12, background: '#f1f4f7' }}><card.Icon size={22} /></div><div><strong style={{ fontSize: 14 }}>{card.title}</strong><div style={{ fontSize: 12, color: '#667085' }}>{card.description}</div>{document?.rejection_reason && <div style={{ color: '#b42318', fontSize: 12, fontWeight: 700 }}>Reason: {document.rejection_reason}</div>}</div></div><div><input ref={el => { fileInputs.current[card.type] = el }} type="file" accept="image/*,application/pdf" onChange={e => void handleFileChange(card.type, card.bucket, e, card.type)} style={{ display: 'none' }} /><button type="button" disabled={Boolean(uploading)} onClick={() => fileInputs.current[card.type]?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 11, border: '1px dashed #b8c2ce', background: '#fff', fontWeight: 700, fontSize: 12 }}>{activeUpload ? <LoaderCircle size={16} className="driver-onboarding-spin" /> : <Upload size={16} />}{activeUpload ? 'Uploading' : uploaded ? 'Replace' : 'Upload'}</button></div>{card.expiryRequired && (<div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Expiry Date REQUIRED<input type="date" value={getExpiryForType(expiryDates, card.type) || ''} onChange={e => void updateDocumentDate(card.type, 'expiry_date', e.target.value)} style={inputStyle} /></label></div>)}{fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" style={{ gridColumn: '1 / -1', color: '#0066FF', fontSize: 12, fontWeight: 700 }}>Preview</a>}</article>
        })}
      </div>
      {uploadStatus && <p style={{ ...cardStyle, marginTop: 16, padding: 14, background: '#E6F0FF', color: '#0052CC', fontSize: 13, fontWeight: 700 }}>{uploadStatus}</p>}
      {error && <p role="alert" style={{ ...cardStyle, marginTop: 16, padding: 14, borderColor: '#fecdca', color: '#b42318', fontSize: 13 }}>{error}</p>}
      {phase === 'identity' ? (<button type="button" onClick={() => void enterAppAfterIdentity()} style={{ width: '100%', marginTop: 20, padding: 16, border: 0, borderRadius: 14, background: '#16A34A', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>{submitting ? 'Entering...' : '🚀 Enter App - Finish Rest Inside'}</button>) : (<button type="button" onClick={() => void backToApp()} style={{ width: '100%', marginTop: 20, padding: 16, border: 0, borderRadius: 14, background: '#0066FF', color: '#fff', fontSize: 16, fontWeight: 800 }}>← Back to App - Save & Continue Inside</button>)}
    </div>
  </main>
}