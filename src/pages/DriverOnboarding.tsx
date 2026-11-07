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
import compressImageFile from '../lib/compressImage'
import { EXPIRING_DRIVER_DOCUMENT_TYPES, normalizeDocType, REQUIRED_DOCS } from '../lib/driverDocuments'

type StoredDocument = Pick<DriverDocument,
  'id' | 'doc_type' | 'document_type' | 'document_url' | 'document_date' | 'file_url' | 'status' | 'rejection_reason' | 'created_at' | 'expiry_date' | 'prdp_number' | 'document_hash'
>
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

const DOCUMENT_CARDS = REQUIRED_DOCS.map(document => ({
  ...document,
  title: document.label,
  description: document.helper ? `Upload a clear ${document.helper.toLowerCase()} image.` : `Upload ${document.label}.`,
  bucket: document.type === 'profile_photo' || document.type === 'selfie' ? 'profile-photos' : 'driver-documents',
  Icon: document.type === 'profile_photo' || document.type === 'selfie'
    ? CircleUserRound
    : document.type.startsWith('vehicle_') ? CarFront : IdCard,
}))
const ONBOARDING_DOCUMENT_TYPES = new Set(REQUIRED_DOCS.map(document => document.type))

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #edf0f3',
  borderRadius: 16,
  boxShadow: '0 5px 18px rgba(20, 33, 50, 0.045)',
}

function latestDocuments(documents: StoredDocument[]) {
  const latest = new Map<string, StoredDocument>()
  for (const document of documents) {
    const rawType = document.document_type || document.doc_type
    const type = normalizeDocType(rawType)
    if (!ONBOARDING_DOCUMENT_TYPES.has(type) || /police|holding|selfie with id/i.test(rawType)) continue
    if (!latest.has(type)) latest.set(type, { ...document, doc_type: type })
  }
  return [...latest.values()]
}

function isCardComplete(card: typeof DOCUMENT_CARDS[number], documents: StoredDocument[]) {
  const document = documents.find(item => item.doc_type === card.type)
  return Boolean(document?.file_url && document.document_date)
    && (!card.expiryRequired || Boolean(document?.expiry_date))
}

function isComplete(documents: StoredDocument[]) {
  return DOCUMENT_CARDS.every(card => isCardComplete(card, documents))
}

const BANK_NAMES = ['Capitec', 'FNB', 'Standard Bank', 'ABSA', 'Nedbank'] as const

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
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const rejectedTypes = useMemo(
    () => new Set(documents
      .filter(document => ONBOARDING_DOCUMENT_TYPES.has(document.doc_type)
        && document.status.toUpperCase() === 'REJECTED')
      .map(document => document.doc_type)),
    [documents],
  )
  const completedCards = DOCUMENT_CARDS.filter(card => isCardComplete(card, documents)).length

  async function loadDocuments() {
    setLoading(true)
    setError('')
    const [documentsResult, profileResult] = await Promise.all([
      supabase.from('driver_documents')
        .select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash')
        .order('created_at', { ascending: false })
        .eq('driver_id', profile.id),
      supabase.from('profiles')
        .select('verification_status,is_verified,bank_name,bank_account_holder,bank_account_number,bank_branch_code')
        .eq('id', profile.id)
        .single(),
    ])
    if (documentsResult.error || profileResult.error) {
      setError(`Could not load your onboarding status: ${documentsResult.error?.message || profileResult.error?.message}`)
      setLoading(false)
      return
    }

    const loadedDocuments = latestDocuments((documentsResult.data || []) as StoredDocument[])
    const status = profileResult.data?.verification_status || 'not_started'
    setDocuments(loadedDocuments)
    setVerificationStatus(status)
    setDocumentDates(Object.fromEntries(loadedDocuments
      .filter(document => document.document_date)
      .map(document => [document.doc_type, document.document_date!.slice(0, 10)])))
    setExpiryDates(Object.fromEntries(loadedDocuments
      .filter(document => document.expiry_date)
      .map(document => [document.doc_type, document.expiry_date!.slice(0, 10)])))
    setBankDetails({
      bank_name: profileResult.data.bank_name || '',
      bank_account_holder: profileResult.data.bank_account_holder || '',
      bank_account_number: profileResult.data.bank_account_number || '',
      bank_branch_code: profileResult.data.bank_branch_code || '',
    })
    setLoading(false)
    if (status === 'approved' && profileResult.data.is_verified) {
      onDashboard()
    }
  }

  useEffect(() => {
    void loadDocuments()
  }, [profile.id])

  useEffect(() => {
    if (verificationStatus !== 'pending_verification') return
    const refresh = window.setInterval(() => void loadDocuments(), 30_000)
    return () => window.clearInterval(refresh)
  }, [verificationStatus, profile.id])

  async function uploadFile(cardType: string, bucket: string, file: File, documentType = cardType): Promise<boolean> {
    setUploading(cardType)
    setError('')
    let uploadStage = 'validation'
    try {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        throw new Error('Choose a JPEG, PNG, or PDF file.')
      }
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error('File must be smaller than 20 MB.')
      }

      const isImage = file.type.startsWith('image/')
      const card = DOCUMENT_CARDS.find(item => item.type === documentType)
      const documentDate = documentDates[documentType] || ''
      const expiryDate = expiryDates[documentType] || null
      if (!documentDate) {
        window.alert('Enter date from document')
        return false
      }
      if (card?.expiryRequired && !expiryDate) {
        window.alert('Enter expiry date from document')
        return false
      }
      const body = isImage ? await compressImageFile(file) : file
      if (body.size > MAX_UPLOAD_SIZE) {
        throw new Error('Compressed file must be smaller than 20 MB.')
      }
      const extension = isImage ? 'jpg' : file.name.split('.').pop()?.toLowerCase() || 'pdf'
      const path = `${profile.id}/${documentType}/${Date.now()}.${extension}`
      console.log('Uploading to bucket:', bucket, 'path:', path, 'user:', profile.id)
      uploadStage = 'storage'
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, body, {
        contentType: isImage ? 'image/jpeg' : file.type,
      })
      if (uploadError) {
        console.error('STORAGE ERROR:', uploadError)
        setError(`Upload failed: ${uploadError.message}`)
        return false
      }

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
      console.log('publicUrl:', publicUrl)
      if (!publicUrl) {
        throw new Error('Storage did not return a public URL for the uploaded document.')
      }

      uploadStage = 'database'
      const documentLabel = card?.label || documentType
      const newDocuments = [{
        driver_id: profile.id,
        doc_type: documentType,
        document_type: documentLabel,
        file_url: publicUrl,
        document_url: publicUrl,
        document_date: documentDate,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        expiry_date: expiryDate,
      }]
      const { data: savedDocuments, error: saveError } = await supabase.from('driver_documents')
        .upsert(newDocuments, { onConflict: 'driver_id,doc_type' })
        .select('id,doc_type,document_type,document_url,document_date,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash')
      if (saveError) {
        console.error('DB ERROR:', saveError)
        try {
          const { error: cleanupError } = await supabase.storage.from(bucket).remove([path])
          if (cleanupError) console.error('Could not remove uploaded file after saving its document record failed', cleanupError)
        } catch (cleanupError) {
          console.error('Could not remove uploaded file after saving its document record failed', cleanupError)
        }
        setError(`DB failed: ${saveError.message}`)
        return false
      }

      if (!savedDocuments?.length) throw new Error('The database did not return the saved document records.')
      const savedTypes = new Set(newDocuments.map(document => document.doc_type))
      setDocuments(current => latestDocuments([
        ...current.filter(document => !savedTypes.has(document.doc_type)),
        ...(savedDocuments as StoredDocument[]),
      ]))

      if (documentType === 'profile_photo') {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        const { error: avatarError } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
        if (avatarError) {
          console.error('Document uploaded, but profile photo could not be updated', avatarError)
          setError(`Document uploaded, but profile photo could not be updated: ${avatarError.message}`)
        }
      }

      return true
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : String(uploadError)
      console.error(`Driver document ${uploadStage} failed for ${documentType}`, uploadError)
      setError(`${uploadStage === 'database' ? 'DB' : 'Upload'} failed: ${message}`)
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
    if (field === 'document_date') {
      setDocumentDates(current => ({ ...current, [documentType]: value }))
    } else {
      setExpiryDates(current => ({ ...current, [documentType]: value }))
    }
    if (!documents.some(document => document.doc_type === documentType)) return

    const { error: updateError } = await supabase.from('driver_documents')
      .update({ [field]: value || null })
      .eq('driver_id', profile.id)
      .eq('doc_type', documentType)
    if (updateError) {
      setError(`Could not save document date: ${updateError.message}`)
      return
    }
    setDocuments(current => current.map(document => document.doc_type === documentType
      ? { ...document, [field]: value || null }
      : document))
  }

  async function submitForReview() {
    const bankDetailsComplete = Object.values(bankDetails).every(value => value.trim())
    if (!isComplete(documents) || rejectedTypes.size > 0 || !bankDetailsComplete || submitting) return
    if (REQUIRED_DOCS.some(document =>
      EXPIRING_DRIVER_DOCUMENT_TYPES.has(document.type)
        && (!expiryDates[document.type] || expiryDates[document.type] < new Date().toISOString().slice(0, 10)),
    )) {
      setError('All five required expiry dates must be current or future dates.')
      return
    }
    setSubmitting(true)
    setError('')
    const metadataUpdates = await Promise.all(REQUIRED_DOCS.map(document =>
      supabase.from('driver_documents').update({
        document_date: documentDates[document.type],
        expiry_date: EXPIRING_DRIVER_DOCUMENT_TYPES.has(document.type) ? expiryDates[document.type] : null,
      }).eq('driver_id', profile.id).eq('doc_type', document.type),
    ))
    const metadataError = metadataUpdates.find(result => result.error)?.error
    if (metadataError) {
      setError(`Could not save document details: ${metadataError.message}`)
      setSubmitting(false)
      return
    }

    const { error: bankError } = await supabase.from('profiles').update({
      bank_name: bankDetails.bank_name,
      bank_account_holder: bankDetails.bank_account_holder.trim(),
      bank_account_number: bankDetails.bank_account_number.trim(),
      bank_branch_code: bankDetails.bank_branch_code.trim(),
    }).eq('id', profile.id)
    if (bankError) {
      setError(`Could not save your bank details: ${bankError.message}`)
      setSubmitting(false)
      return
    }
    const { error: submitError } = await supabase.rpc('submit_driver_documents_for_review')
    if (submitError) {
      setError(`Could not submit documents for review: ${submitError.message}`)
      setSubmitting(false)
      return
    }
    setVerificationStatus('pending_verification')
    setSubmitting(false)
  }

  const bankDetailsComplete = Object.values(bankDetails).every(value => value.trim())
  const progress = Math.round(completedCards / DOCUMENT_CARDS.length * 100)

  if (loading) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085' }}>
      <LoaderCircle size={30} className="driver-onboarding-spin" />
      <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}'}</style>
    </main>
  }

  if (verificationStatus === 'pending_verification' && rejectedTypes.size === 0) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', fontFamily: 'Inter, sans-serif', color: '#182230' }}>
      <section style={{ ...cardStyle, width: 'min(100%, 480px)', padding: '42px 28px', textAlign: 'center' }}>
        <div style={{ margin: '0 auto 20px', width: 76, height: 76, borderRadius: 38, display: 'grid', placeItems: 'center', color: '#087f5b', background: '#dff8ed' }}><Check size={38} strokeWidth={3} /></div>
        <h1 style={{ margin: '0 0 10px', fontSize: 26 }}>Under Review</h1>
        <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>We will WhatsApp you in 24h. You cannot go online until your driver account is approved.</p>
      </section>
    </main>
  }

  return <main style={{ minHeight: '100dvh', background: '#F8F9FA', padding: '28px 18px 48px', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
    <div style={{ width: 'min(100%, 760px)', margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 26 }}>
          <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 14, color: '#087f5b', background: '#dff8ed' }}><CarFront size={24} /></div>
          <div><strong style={{ display: 'block', fontSize: 17 }}>BuddyRide Driver</strong><span style={{ fontSize: 13, color: '#667085' }}>Driver onboarding</span></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 10 }}>
          <div><p style={{ margin: '0 0 6px', color: '#087f5b', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step 2 of 3</p><h1 style={{ margin: 0, fontSize: 'clamp(25px, 5vw, 34px)', letterSpacing: '-.03em' }}>Your documents</h1></div>
          <strong style={{ color: '#344054', whiteSpace: 'nowrap' }}>{completedCards}/{DOCUMENT_CARDS.length} complete</strong>
        </div>
        <div style={{ height: 9, overflow: 'hidden', borderRadius: 99, background: '#e5e9ef' }}>
          <div style={{ width: `${progress}%`, height: '100%', borderRadius: 99, background: '#0a8f67', transition: 'width .25s ease' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#667085' }}>{progress}% complete</p>
      </header>

      <div style={{ display: 'grid', gap: 18 }}>
        {(['Driver Identity', 'Vehicle Papers', 'Vehicle Exterior', 'Vehicle Interior', 'Safety'] as const).map(section => (
          <section key={section} style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{section}</h2>
            {DOCUMENT_CARDS.filter(card => card.section === section).map(card => {
              const { type, title, description, bucket, Icon } = card
              const document = documents.find(item => item.doc_type === type)
              const uploaded = Boolean(document?.file_url)
              const rejected = document?.status.toUpperCase() === 'REJECTED'
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const expiry = document?.expiry_date ? new Date(`${document.expiry_date}T00:00:00`) : null
              const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000) : null
              const badgeLabel = !uploaded
                ? 'MISSING'
                : daysToExpiry !== null && daysToExpiry < 0
                  ? 'EXPIRED'
                  : daysToExpiry !== null && daysToExpiry < 30
                    ? 'EXPIRING SOON'
                    : rejected ? 'REJECTED' : document?.status.toUpperCase() === 'APPROVED' ? 'VERIFIED' : 'PENDING'
              const badgeColor = badgeLabel === 'EXPIRED' || badgeLabel === 'REJECTED'
                ? '#b42318'
                : badgeLabel === 'VERIFIED' ? '#067647'
                  : badgeLabel === 'EXPIRING SOON' ? '#b54708' : '#667085'
              const activeUpload = uploading === type
              const fileUrl = document?.document_url || document?.file_url
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
                  <input
                    ref={element => { fileInputs.current[type] = element }}
                    type="file"
                    accept={type.startsWith('vehicle_photo') ? 'image/*' : 'image/*,application/pdf'}
                    capture={type === 'selfie' ? 'user' : undefined}
                    onChange={event => void handleFileChange(type, bucket, event)}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    disabled={Boolean(uploading)}
                    onClick={() => fileInputs.current[type]?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 11, border: '1px dashed #b8c2ce', color: '#344054', background: '#fff', fontSize: 12, fontWeight: 700 }}
                  >
                    {activeUpload ? <LoaderCircle size={16} className="driver-onboarding-spin" /> : <Upload size={16} />}
                    {activeUpload ? 'Uploading' : uploaded ? 'Replace' : 'Upload'}
                  </button>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: card.expiryRequired ? 'repeat(auto-fit, minmax(190px, 1fr))' : '1fr', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 5, color: '#344054', fontSize: 12, fontWeight: 700 }}>
                    Document Date (date written on document) - REQUIRED
                    <input
                      type="date"
                      required
                      value={documentDates[type] || ''}
                      onChange={event => void updateDocumentDate(type, 'document_date', event.target.value)}
                      style={{ minHeight: 40, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9 }}
                    />
                  </label>
                  {card.expiryRequired && <label style={{ display: 'grid', gap: 5, color: '#344054', fontSize: 12, fontWeight: 700 }}>
                    Expiry Date (as printed on document) - REQUIRED
                    <input
                      type="date"
                      required
                      value={expiryDates[type] || ''}
                      onChange={event => void updateDocumentDate(type, 'expiry_date', event.target.value)}
                      style={{ minHeight: 40, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9 }}
                    />
                  </label>}
                </div>
                {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" style={{ gridColumn: '1 / -1', color: '#087f5b', fontSize: 12, fontWeight: 700 }}>Preview uploaded document</a>}
              </article>
            })}
          </section>
        ))}
      </div>

      <section style={{ ...cardStyle, marginTop: 16, padding: 17 }}>
        <p style={{ margin: '0 0 6px', color: '#087f5b', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step 3 of 3</p>
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
              <input
                type="text"
                required
                inputMode={field === 'bank_account_holder' ? 'text' : 'numeric'}
                autoComplete="off"
                value={bankDetails[field]}
                onChange={event => setBankDetails(current => ({ ...current, [field]: event.target.value }))}
                style={{ minHeight: 42, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9 }}
              />
            </label>
          ))}
        </div>
      </section>

      {error && <p role="alert" style={{ ...cardStyle, margin: '16px 0 0', padding: 14, borderColor: '#fecdca', color: '#b42318', fontSize: 13 }}>{error}</p>}

      <section style={{ ...cardStyle, marginTop: 16, padding: 17, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldCheck size={22} color="#087f5b" />
        <div><strong style={{ fontSize: 14 }}>Your documents are kept secure</strong><p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>They’re used only to verify your driver account.</p></div>
      </section>

      <button
        type="button"
        disabled={completedCards !== DOCUMENT_CARDS.length || !bankDetailsComplete || rejectedTypes.size > 0 || submitting || Boolean(uploading)}
        onClick={() => void submitForReview()}
        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, padding: 16, border: 0, borderRadius: 14, background: completedCards === DOCUMENT_CARDS.length && bankDetailsComplete ? '#087f5b' : '#cbd2da', color: '#fff', fontSize: 16, fontWeight: 800, cursor: completedCards === DOCUMENT_CARDS.length && bankDetailsComplete && !submitting ? 'pointer' : 'not-allowed' }}
      >
        {submitting ? 'Submitting for review…' : rejectedTypes.size > 0 ? 'Replace rejected documents to continue' : completedCards === DOCUMENT_CARDS.length && bankDetailsComplete ? <>Submit for Review <ChevronRight size={19} /></> : 'Complete all documents and bank details to continue'}
      </button>
    </div>
    <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}@media(max-width:520px){.driver-onboarding-card{flex-wrap:wrap}}'}</style>
  </main>
}
