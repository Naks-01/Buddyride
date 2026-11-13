import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  CarFront,
  Check,
  ChevronRight,
  CircleUserRound,
  IdCard,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { supabase, type DriverDocument, type Profile } from '../lib/supabase'
import { createDriverDocumentSignedUrl, EXPIRING_DRIVER_DOCUMENT_TYPES, REQUIRED_DOCS } from '../lib/driverDocuments'

type StoredDocument = Pick<DriverDocument,
  'id' | 'doc_type' | 'document_type' | 'document_url' | 'document_date' | 'file_url' | 'status' | 'rejection_reason' | 'created_at' | 'expiry_date' | 'prdp_number' | 'document_hash'
> & { preview_url?: string | null }

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024

const southAfricanToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function safeUUID() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

async function compressSafely(file: File): Promise<File> {
  if (file.size < 2 * 1024 * 1024) return file
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(file.name)) return file
  try {
    if (typeof createImageBitmap === 'undefined') return file
    const bitmap = await createImageBitmap(file, { resizeWidth: 1280, resizeQuality: 'medium' } as any)
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.68))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

const DOCUMENT_CARDS = REQUIRED_DOCS.map(document => ({
  ...document,
  title: document.label,
  description: document.helper ? `Upload a clear ${document.helper.toLowerCase()} image.` : `Upload ${document.label}.`,
  bucket: document.type === 'profile_photo' ? 'profile-photos' : 'driver-documents',
  Icon: document.type === 'profile_photo' || document.type === 'selfie'
    ? CircleUserRound
    : document.type.startsWith('vehicle_') ? CarFront : IdCard,
}))

const ONBOARDING_DOCUMENT_TYPES = new Set(REQUIRED_DOCS.map(d => d.type.toLowerCase().trim()))
ONBOARDING_DOCUMENT_TYPES.add('sa_id')
ONBOARDING_DOCUMENT_TYPES.add('south_african_id')
ONBOARDING_DOCUMENT_TYPES.add('id_document')

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #edf0f3',
  borderRadius: 16,
  boxShadow: '0 5px 18px rgba(20, 33, 50, 0.045)',
}

function canonicalType(raw: string | null | undefined) {
  const t = (raw || '').toLowerCase().trim()
  if (['south_african_id','sa_id','sa_id_document','sa-id','id','id_document','south-african-id','sa id'].includes(t)) return 'sa_id'
  return t
}

function latestDocuments(documents: StoredDocument[]) {
  const latest = new Map<string, StoredDocument>()
  for (const document of documents) {
    const rawType = (document.document_type || document.doc_type || '').toLowerCase().trim()
    if (/police|holding|selfie with id/i.test(rawType)) continue
    const type = canonicalType(rawType)
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
  const want = canonicalType(card.type)
  const document = documents.find(item => {
    const ct = canonicalType(item.doc_type)
    const cdt = canonicalType(item.document_type)
    return ct === want || cdt === want
  })
  if (!document?.file_url) return false
  if (card.expiryRequired) return Boolean(document?.expiry_date)
  return true
}

function isComplete(documents: StoredDocument[]) {
  return DOCUMENT_CARDS.every(card => isCardComplete(card, documents))
}

const BANK_NAMES = ['Capitec', 'FNB', 'Standard Bank', 'ABSA', 'Nedbank', 'TymeBank', 'Discovery Bank', 'African Bank', 'Investec', 'Postbank', 'Bidvest Bank'] as const

type PlanStep = {
  title: string
  desc: string
  time?: string
  status: 'complete' | 'in_progress' | 'todo'
}

function ApplicationPlan({
  onContinue,
  profileComplete,
  docsComplete,
  docsCount,
  totalDocs,
}: {
  onContinue: () => void
  profileComplete: boolean
  docsComplete: boolean
  docsCount: number
  totalDocs: number
}) {
  const steps: PlanStep[] = [
    { title: 'Profile', desc: 'Your personal details', status: profileComplete ? 'complete' : 'in_progress' },
    { title: 'Vehicle & ride type', desc: 'Add your car and ride type', time: 'About 6 min', status: profileComplete ? 'in_progress' : 'todo' },
    { title: 'Service area', desc: 'Choose where you would like to drive', status: 'todo' },
    { title: 'Driver documents', desc: `ID, licence, licence disk and selfie - ${docsCount}/${totalDocs} uploaded`, status: docsComplete ? 'complete' : 'todo' },
  ]

  return (
    <main style={{ minHeight: '100dvh', background: '#fff', padding: '20px 18px 100px', fontFamily: 'Inter, sans-serif', color: '#182230' }}>
      <div style={{ width: 'min(100%, 480px)', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: '#E6F0FF', display: 'grid', placeItems: 'center', fontSize: 20, color: '#0066FF' }}>👤</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-.02em' }}>Your application plan</h1>
            <p style={{ margin: '4px 0 0', color: '#667085', fontSize: 14 }}>Complete each step to submit your driver application.</p>
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
                  <div style={{
                    width: 28, height: 28, borderRadius: 14, flexShrink: 0, zIndex: 1,
                    display: 'grid', placeItems: 'center',
                    background: isCompleteStep ? '#0066FF' : isActive ? '#0066FF' : '#fff',
                    border: isCompleteStep || isActive ? '2px solid #0066FF' : '2px solid #D0D5DD',
                    color: '#fff', fontSize: 14, fontWeight: 800
                  }}>
                    {isCompleteStep ? '✓' : isActive ? '•' : ''}
                  </div>
                  {!isLast && <div style={{ width: 2, flex: 1, minHeight: 48, background: isCompleteStep ? '#0066FF' : '#EAECF0' }} />}
                </div>
                <div style={{ paddingBottom: 28, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 16 }}>{step.title}</strong>
                    {step.time && <span style={{ fontSize: 12, color: '#667085' }}>{step.time}</span>}
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#667085' }}>
                    {isCompleteStep ? 'Complete' : isActive ? 'In progress' : step.desc}
                  </p>
                  {isActive && step.time && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#0066FF', fontWeight: 700 }}>In progress · {step.time}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', padding: '12px 18px 22px', borderTop: '1px solid #F2F4F7' }}>
        <button onClick={onContinue} style={{ width: 'min(100%, 480px)', display: 'block', margin: '0 auto', padding: 16, border: 0, borderRadius: 14, background: '#0066FF', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
          Continue
        </button>
      </div>
    </main>
  )
}

export function DriverOnboarding({ profile, onDashboard }: { profile: Profile; onDashboard: () => void }) {
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [verificationStatus, setVerificationStatus] = useState('not_started')
  const [bankDetails, setBankDetails] = useState({
    bank_name: '',
    bank_account_holder: '',
    bank_account_number: '',
    bank_branch_code: '',
  })
  const [documentDates, setDocumentDates] = useState<Record<string, string>>({})
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [showPlan, setShowPlan] = useState(true)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const rejectedTypes = useMemo(
    () => new Set(documents
      .filter(document => ONBOARDING_DOCUMENT_TYPES.has(canonicalType(document.doc_type)))
      .filter(document => (document.status || '').toUpperCase() === 'REJECTED')
      .map(document => canonicalType(document.doc_type))),
    [documents],
  )
  const completedCards = DOCUMENT_CARDS.filter(card => isCardComplete(card, documents)).length
  const approvedCount = REQUIRED_DOCS.filter(requirement => {
    const document = documents.find(item => canonicalType(item.doc_type || item.document_type) === canonicalType(requirement.type))
    return Boolean(document && String(document.status || '').toUpperCase() === 'APPROVED' && document.file_url)
  }).length
  const totalDocs = REQUIRED_DOCS.length

  async function loadDocuments() {
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveId = user?.id || profile.id
    const [documentsResult, profileResult] = await Promise.all([
      supabase.from('driver_documents')
        .select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash')
        .order('created_at', { ascending: false })
        .eq('driver_id', effectiveId),
      supabase.from('profiles')
        .select('verification_status,is_verified,bank_name,bank_account_holder,bank_account_number,bank_branch_code')
        .eq('id', effectiveId)
        .single(),
    ])
    if (documentsResult.error || profileResult.error) {
      setError(`Could not load your onboarding status: ${documentsResult.error?.message || profileResult.error?.message}`)
      setLoading(false)
      return
    }
    const loadedDocuments = latestDocuments((documentsResult.data || []) as StoredDocument[])
    const documentsWithPreviews = await Promise.all(loadedDocuments.map(async document => {
      try {
        return {
          ...document,
          preview_url: await createDriverDocumentSignedUrl(document.document_url || document.file_url),
        }
      } catch {
        return { ...document, preview_url: null }
      }
    }))
    const status = profileResult.data?.verification_status || 'not_started'
    setDocuments(documentsWithPreviews)
    setVerificationStatus(status)
    setDocumentDates(Object.fromEntries(loadedDocuments.filter(document => document.document_date).map(document => [canonicalType(document.doc_type), document.document_date!.slice(0, 10)])))
    setExpiryDates(Object.fromEntries(loadedDocuments.filter(document => document.expiry_date).map(document => [canonicalType(document.doc_type), document.expiry_date!.slice(0, 10)])))
    setBankDetails({
      bank_name: profileResult.data.bank_name || '',
      bank_account_holder: profileResult.data.bank_account_holder || '',
      bank_account_number: profileResult.data.bank_account_number || '',
      bank_branch_code: profileResult.data.bank_branch_code || '',
    })
    setLoading(false)
    // FIXED: BOLT LOGIC - ONLY Admin can send driver to dashboard
    // Must have is_verified = true AND status = approved AND all docs approved
    const documentsByType = new Map<string, StoredDocument>(loadedDocuments.map(document => [canonicalType(document.doc_type || document.document_type), document] as const))
    const allApproved = REQUIRED_DOCS.length === 15 && REQUIRED_DOCS.every(requirement => { const document = documentsByType.get(canonicalType(requirement.type)); if (!document || String(document.status || '').toUpperCase() !== 'APPROVED' || !document.file_url) return false; if (requirement.expiryRequired && (!document.expiry_date || document.expiry_date < southAfricanToday())) return false; return true })
    if ((status === 'approved' || status === 'verified') && profileResult.data.is_verified && allApproved) {
      onDashboard()
      return
    }
  }

  useEffect(() => { void loadDocuments() }, [profile.id])

  async function uploadFile(cardType: string, bucket: string, file: File, documentType = cardType): Promise<boolean> {
    setUploading(cardType)
    setError('')
    let uploadedPath: string | null = null
    try {
      const extFromName = file.name.split('.').pop()?.toLowerCase() || ''
      const guessedType = file.type || (
        extFromName === 'pdf' ? 'application/pdf' :
        extFromName === 'png' ? 'image/png' :
        extFromName === 'webp' ? 'image/webp' : 'image/jpeg'
      )
      if (['heic','heif'].includes(extFromName) || guessedType === 'image/heic' || guessedType === 'image/heif') {
        throw new Error('iPhone HEIC not supported. Please open the photo and take a screenshot, then upload the screenshot.')
      }
      if (file.size <= 0) throw new Error('File is empty. Try again or take a screenshot.')
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error(`File too large ${(file.size/1024/1024).toFixed(1)}MB > 20MB. Take a screenshot of the document (Power + Volume Down) and upload the screenshot.`)
      }
      const card = DOCUMENT_CARDS.find(item => canonicalType(item.type) === canonicalType(documentType))
      const expiryDate = expiryDates[canonicalType(documentType)] || expiryDates[documentType] || null
      if (card?.expiryRequired && !expiryDate) {
        throw new Error('Enter the expiry date shown on this document BEFORE uploading.')
      }
      if (card?.expiryRequired && expiryDate && expiryDate < southAfricanToday()) {
        throw new Error('This document has expired.')
      }
      const processedFile = await compressSafely(file)
      const isPdf = guessedType === 'application/pdf'
      const blob: Blob | File = processedFile
      const outputType = isPdf ? 'application/pdf' : (processedFile.type || guessedType)
      const extension = isPdf ? 'pdf' : (/^[a-z0-9]{1,8}$/.test(extFromName) && !isPdf ? (processedFile.type === 'image/jpeg' ? 'jpg' : extFromName) : 'jpg')
      if (blob.size > MAX_UPLOAD_SIZE) throw new Error('Processed file still too large.')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const ownerId = user.id
      const finalDocType = canonicalType(documentType)
      const path = `${ownerId}/${finalDocType}/${safeUUID()}.${extension}`
      uploadedPath = path
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
        contentType: outputType,
        upsert: true,
      })
      if (uploadError) throw new Error(`Storage: ${uploadError.message}`)
      const storageReference = `${bucket}:${path}`
      const payload = {
        driver_id: ownerId,
        doc_type: finalDocType,
        document_type: finalDocType,
        file_url: storageReference,
        document_url: storageReference,
        file_path: path,
        storage_path: path,
        file_name: file.name,
        file_size: blob.size,
        file_type: outputType,
        document_date: documentDates[canonicalType(documentType)] || southAfricanToday(),
        status: 'PENDING',
        created_at: new Date().toISOString(),
        expiry_date: expiryDate,
        rejection_reason: null,
        reviewed_at: null,
        reviewed_by: null,
      }
      const { data: existing, error: existingError } = await supabase.from('driver_documents')
        .select('id')
        .eq('driver_id', ownerId)
        .eq('doc_type', finalDocType)
        .maybeSingle()
      if (existingError) throw new Error(`Could not check existing document: ${existingError.message}`)
      let savedDocument: any = null
      let saveError: any = null
      if (existing) {
        const res = await supabase.from('driver_documents').update(payload).eq('id', existing.id).select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash').single()
        savedDocument = res.data; saveError = res.error
      } else {
        const res = await supabase.from('driver_documents').insert(payload).select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash').single()
        savedDocument = res.data; saveError = res.error
      }
      if (saveError) throw new Error(`DB: ${saveError.message}`)
      const savedPreview = await createDriverDocumentSignedUrl(storageReference).catch(() => null)
      setDocuments(current => latestDocuments([
        ...current.filter(d => canonicalType(d.doc_type) !== finalDocType),
        { ...(savedDocument as StoredDocument), preview_url: savedPreview },
      ]))
      uploadedPath = null
      if (finalDocType === 'profile_photo') {
        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path)
        await supabase.from('profiles').update({ avatar_url: publicData.publicUrl }).eq('id', ownerId)
      }
      return true
    } catch (e: unknown) {
      if (uploadedPath) await supabase.storage.from(bucket).remove([uploadedPath]).catch(()=>{})
      const message = e instanceof Error ? e.message : String(e)
      setError(`Upload failed for ${documentType}: ${message}`)
      alert(`Upload failed for ${documentType}: ${message}`)
      return false
    } finally {
      setUploading(null)
    }
  }

  async function handleFileChange(cardType: string, bucket: string, event: ChangeEvent<HTMLInputElement>, documentType = cardType) {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return
    await uploadFile(cardType, bucket, selectedFiles[0], documentType)
  }

  async function updateDocumentDate(documentType: string, field: 'document_date' | 'expiry_date', value: string) {
    const cType = canonicalType(documentType)
    if (field === 'document_date') setDocumentDates(current => ({ ...current, [cType]: value, [documentType]: value }))
    else setExpiryDates(current => ({ ...current, [cType]: value, [documentType]: value }))
    if (!documents.some(d => canonicalType(d.doc_type) === cType)) return
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || profile.id
    const { error: updateError } = await supabase.from('driver_documents').update({ [field]: value || null }).eq('driver_id', ownerId).eq('doc_type', cType)
    if (updateError) { setError(`Could not save date: ${updateError.message}`); return }
    setDocuments(current => current.map(document => canonicalType(document.doc_type) === cType ? { ...document, [field]: value || null } : document))
  }

  async function submitForReview() {
    const bankDetailsComplete = Object.values(bankDetails).every(value => value.trim())
    if (!isComplete(documents) || rejectedTypes.size > 0 || !bankDetailsComplete || submitting) return
    if (REQUIRED_DOCS.some(document => EXPIRING_DRIVER_DOCUMENT_TYPES.has(document.type) && (!expiryDates[canonicalType(document.type)] && !expiryDates[document.type] || (expiryDates[canonicalType(document.type)] || expiryDates[document.type] || '') < southAfricanToday()))) {
      setError('All required expiry dates must be current.')
      return
    }
    setSubmitting(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || profile.id
    const metadataUpdates = await Promise.all(REQUIRED_DOCS.map(document =>
      supabase.from('driver_documents').update({
        document_date: documentDates[canonicalType(document.type)] || documentDates[document.type] || new Date().toISOString().split('T')[0],
        expiry_date: EXPIRING_DRIVER_DOCUMENT_TYPES.has(document.type) ? (expiryDates[canonicalType(document.type)] || expiryDates[document.type] || null) : null,
      }).eq('driver_id', ownerId).eq('doc_type', canonicalType(document.type)),
    ))
    const metadataError = metadataUpdates.find(result => result.error)?.error
    if (metadataError) { setError(`Could not save details: ${metadataError.message}`); setSubmitting(false); return }
    const { error: bankError } = await supabase.from('profiles').update({
      bank_name: bankDetails.bank_name,
      bank_account_holder: bankDetails.bank_account_holder.trim(),
      bank_account_number: bankDetails.bank_account_number.trim(),
      bank_branch_code: bankDetails.bank_branch_code.trim(),
    }).eq('id', ownerId)
    if (bankError) { setError(`Could not save bank: ${bankError.message}`); setSubmitting(false); return }
    const { error: submitError } = await supabase.rpc('submit_driver_documents_for_review')
    if (submitError) {
      const msg = (submitError.message || '').toLowerCase()
      if (msg.includes('argument') || msg.includes('function')) {
        const { error: retryError } = await supabase.rpc('submit_driver_documents_for_review', { p_driver_id: ownerId } as any)
        if (retryError) { setError(`Could not submit: ${retryError.message}`); setSubmitting(false); return }
      } else { setError(`Could not submit: ${submitError.message}`); setSubmitting(false); return }
    }
    setVerificationStatus('pending_verification'); setSubmitting(false)
  }

  const bankDetailsComplete = Object.values(bankDetails).every(value => value.trim())
  const progress = Math.round(completedCards / DOCUMENT_CARDS.length * 100)

  if (loading) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085' }}>
      <LoaderCircle size={30} className="driver-onboarding-spin" />
      <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}'}</style>
    </main>
  }

  // ===== BOLT FIX: Applicant Pending logic for ALL drivers =====
  const isPendingState = ['pending','pending_verification','submitted','under_review','in_review','not_started'].includes(verificationStatus)
  const hasSubmitted = documents.length > 0
  const allDocsApproved = REQUIRED_DOCS.length === 15 && approvedCount === REQUIRED_DOCS.length
  const isFullyApproved = (verificationStatus === 'approved' || verificationStatus === 'verified') && allDocsApproved

  if (hasSubmitted && rejectedTypes.size === 0 && !isFullyApproved && (isPendingState || ['approved', 'verified'].includes(verificationStatus))) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', fontFamily: 'Inter, sans-serif', color: '#182230' }}>
      <section style={{ ...cardStyle, width: 'min(100%, 480px)', padding: '42px 28px', textAlign: 'center' }}>
        <div style={{ margin: '0 auto 20px', width: 76, height: 76, borderRadius: 38, display: 'grid', placeItems: 'center', color: '#C2410C', background: '#FFF7ED', border: '2px solid #FDBA74' }}>⏳</div>
        <h1 style={{ margin: '0 0 10px', fontSize: 26 }}>Applicant Pending</h1>
        <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>
          {approvedCount}/{totalDocs} documents approved. You cannot go online until Admin approves all documents.
        </p>
        <div style={{ marginTop: 16, textAlign: 'left', background: '#FFF7ED', border: '1px solid #FDBA74', padding: 12, borderRadius: 10, fontSize: 13 }}>
          <strong style={{ color: '#C2410C' }}>● Applicant Pending: {approvedCount}/{totalDocs} Approved</strong>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {documents.map(doc => (
              <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{doc.doc_type}</span>
                <span style={{ fontWeight: 700, color: String(doc.status).toUpperCase() === 'APPROVED' ? '#067647' : '#C2410C' }}>{String(doc.status).toUpperCase()}</span>
              </div>
            ))}
          </div>
          {approvedCount === totalDocs && <div style={{ marginTop: 12, color: '#0066FF', fontWeight: 700, background: '#E6F0FF', padding: 8, borderRadius: 8 }}>✓ All documents approved - waiting for Admin final approval. Click "Check Approval Status" below.</div>}
          {approvedCount < totalDocs && <div style={{ marginTop: 12, color: '#667085' }}>Waiting for Admin to review remaining documents</div>}
        </div>
        <button onClick={async () => { setChecking(true); await loadDocuments(); setChecking(false) }} disabled={checking} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: checking ? '#cbd2da' : '#EA580C', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
          {checking ? 'Checking...' : 'Check Approval Status'}
        </button>
        {error && <p style={{ color: '#b42318', fontSize: 13, marginTop: 12 }}>{error}</p>}
      </section>
    </main>
  }

  if (showPlan) {
    return <ApplicationPlan
      onContinue={() => setShowPlan(false)}
      profileComplete={Boolean((profile as any)?.full_name || (profile as any)?.first_name)}
      docsComplete={isComplete(documents)}
      docsCount={completedCards}
      totalDocs={DOCUMENT_CARDS.length}
    />
  }

  return <main style={{ minHeight: '100dvh', background: '#F8F9FA', padding: '28px 18px 48px', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ width: 'min(100%, 760px)', margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
          <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 14, color: '#0066FF', background: '#E6F0FF' }}><CarFront size={24} /></div>
          <div><strong style={{ display: 'block', fontSize: 17 }}>BuddyRide Driver</strong><span style={{ fontSize: 13, color: '#667085' }}>Driver onboarding</span></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 10 }}>
          <div><p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step 2 of 3</p><h1 style={{ margin: 0, fontSize: 'clamp(25px, 5vw, 34px)', letterSpacing: '-.03em' }}>Your documents</h1></div>
          <strong style={{ color: '#344054', whiteSpace: 'nowrap' }}>{completedCards}/{DOCUMENT_CARDS.length} complete</strong>
        </div>
        <div style={{ height: 9, overflow: 'hidden', borderRadius: 99, background: '#e5e9ef' }}>
          <div style={{ width: `${progress}%`, height: '100%', borderRadius: 99, background: '#0066FF', transition: 'width .25s ease' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#667085' }}>{progress}% complete</p>
      </header>

      <div style={{ display: 'grid', gap: 18 }}>
        {(['Driver Identity', 'Vehicle Papers', 'Vehicle Exterior', 'Vehicle Interior', 'Safety'] as const).map(section => (
          <section key={section} style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{section}</h2>
            {DOCUMENT_CARDS.filter(card => card.section === section).map(card => {
              const { type, title, description, bucket, Icon } = card
              const want = canonicalType(type)
              const document = documents.find(item => canonicalType(item.doc_type) === want)
              const uploaded = Boolean(document?.file_url)
              const rejected = (document?.status || '').toUpperCase() === 'REJECTED'
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const expiry = document?.expiry_date ? new Date(`${document.expiry_date}T00:00:00`) : null
              const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000) : null
              const badgeLabel = !uploaded ? 'MISSING' : daysToExpiry !== null && daysToExpiry < 0 ? 'EXPIRED' : daysToExpiry !== null && daysToExpiry < 30 ? 'EXPIRING SOON' : rejected ? 'REJECTED' : (document?.status || '').toUpperCase() === 'APPROVED' ? 'VERIFIED' : 'PENDING'
              const badgeColor = badgeLabel === 'EXPIRED' || badgeLabel === 'REJECTED' ? '#b42318' : badgeLabel === 'VERIFIED' ? '#067647' : badgeLabel === 'EXPIRING SOON' ? '#b54708' : '#667085'
              const activeUpload = uploading === type || uploading === want
              const fileUrl = document?.preview_url || null
              return <article key={type} className="driver-onboarding-card" style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 42, height: 42, display: 'grid', flex: '0 0 42px', placeItems: 'center', borderRadius: 12, background: '#f1f4f7', color: '#475467' }}><Icon size={22} /></div>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{title}</strong>
                    <div style={{ marginTop: 4, color: '#667085', fontSize: 12 }}>{description}</div>
                    <span style={{ display: 'inline-block', marginTop: 6, padding: '4px 8px', borderRadius: 99, color: badgeColor, background: `${badgeColor}18`, fontSize: 11, fontWeight: 700 }}>{badgeLabel}</span>
                  </div>
                </div>
                <div>
                  <input ref={element => { fileInputs.current[type] = element; fileInputs.current[want] = element }} type="file" accept={type.startsWith('vehicle_photo') || type.startsWith('vehicle_interior_photo') || type === 'profile_photo' || type === 'selfie' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} capture={type === 'selfie' ? 'user' : undefined} onChange={event => void handleFileChange(type, bucket, event, type)} style={{ display: 'none' }} />
                  <button type="button" disabled={Boolean(uploading)} onClick={() => fileInputs.current[type]?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 11, border: '1px dashed #b8c2ce', color: '#344054', background: '#fff', fontSize: 12, fontWeight: 700 }}>
                    {activeUpload ? <LoaderCircle size={16} className="driver-onboarding-spin" /> : <Upload size={16} />}
                    {activeUpload ? 'Uploading' : uploaded ? 'Replace' : 'Upload'}
                  </button>
                </div>
                {card.expiryRequired && (
                <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 5, color: '#344054', fontSize: 12, fontWeight: 700 }}>
                    Expiry Date (as printed on document) - REQUIRED
                    <input type="date" required value={expiryDates[want] || expiryDates[type] || ''} onChange={event => void updateDocumentDate(type, 'expiry_date', event.target.value)} style={{ minHeight: 40, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9 }} />
                  </label>
                </div>
                )}
                {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" style={{ gridColumn: '1 / -1', color: '#0066FF', fontSize: 12, fontWeight: 700 }}>Preview uploaded document</a>}
              </article>
            })}
          </section>
        ))}
      </div>

      <section style={{ ...cardStyle, marginTop: 16, padding: 17 }}>
        <p style={{ margin: '0 0 6px', color: '#0066FF', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step 3 of 3</p>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Bank details for payouts</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 }}>
            Bank Name
            <select required value={bankDetails.bank_name} onChange={event => setBankDetails(current => ({ ...current, bank_name: event.target.value }))} style={{ minHeight: 42, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9, background: '#fff' }}>
              <option value="">Select your bank</option>
              {BANK_NAMES.map(bank => <option key={bank} value={bank}>{bank}</option>)}
            </select>
          </label>
          {([
            ['bank_account_holder', 'Account Holder'],
            ['bank_account_number', 'Account Number'],
            ['bank_branch_code', 'Branch Code'],
          ] as const).map(([field, label]) => (
            <label key={field} style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 700 }}>
              {label}
              <input type="text" required inputMode={field === 'bank_account_holder' ? 'text' : 'numeric'} autoComplete="off" value={bankDetails[field]} onChange={event => setBankDetails(current => ({ ...current, [field]: event.target.value }))} style={{ minHeight: 42, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9 }} />
            </label>
          ))}
        </div>
      </section>

      {error && <p role="alert" style={{ ...cardStyle, margin: '16px 0 0', padding: 14, borderColor: '#fecdca', color: '#b42318', fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</p>}

      <section style={{ ...cardStyle, marginTop: 16, padding: 17, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldCheck size={22} color="#0066FF" />
        <div><strong style={{ fontSize: 14 }}>Your documents are kept secure</strong><p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>They’re used only to verify your driver account.</p></div>
      </section>

      <button type="button" disabled={completedCards !== DOCUMENT_CARDS.length || !bankDetailsComplete || rejectedTypes.size > 0 || submitting || Boolean(uploading)} onClick={() => void submitForReview()} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, padding: 16, border: 0, borderRadius: 14, background: completedCards === DOCUMENT_CARDS.length && bankDetailsComplete ? '#0066FF' : '#cbd2da', color: '#fff', fontSize: 16, fontWeight: 800, cursor: completedCards === DOCUMENT_CARDS.length && bankDetailsComplete && !submitting ? 'pointer' : 'not-allowed' }}>
        {submitting ? 'Submitting for review…' : rejectedTypes.size > 0 ? 'Replace rejected documents to continue' : completedCards === DOCUMENT_CARDS.length && bankDetailsComplete ? <>Submit for Review <ChevronRight size={19} /></> : 'Complete all documents and bank details to continue'}
      </button>
    </div>
    <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}@media(max-width:520px){.driver-onboarding-card{flex-wrap:wrap}}'}</style>
  </main>
}