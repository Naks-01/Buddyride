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

type StoredDocument = Pick<DriverDocument,
  'id' | 'doc_type' | 'file_url' | 'status' | 'rejection_reason' | 'created_at' | 'expiry_date' | 'prdp_number' | 'document_hash'
>
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

const DOCUMENT_CARDS = [
  { type: 'sa_id', title: 'SA ID / Passport', description: 'Upload your South African ID or passport.', bucket: 'driver-documents', Icon: IdCard },
  { type: 'drivers_license', title: "Driver's Licence", description: 'Upload your valid driving licence.', bucket: 'driver-documents', Icon: IdCard, expiryRequired: true },
  { type: 'prdp', title: 'PDP / PrDP', description: 'Upload your Professional Driving Permit.', bucket: 'driver-documents', Icon: IdCard, expiryRequired: true, prdpNumberRequired: true },
  { type: 'profile_photo', title: 'Selfie', description: 'Take a clear profile selfie.', bucket: 'profile-photos', Icon: CircleUserRound, camera: 'user' },
  { type: 'selfie_holding_id', title: 'Selfie Holding ID', description: 'Take a separate photo holding your SA ID or passport next to your face.', bucket: 'profile-photos', Icon: CircleUserRound, camera: 'user' },
  { type: 'vehicle_registration', title: 'Vehicle Registration', description: 'Upload the vehicle registration document.', bucket: 'vehicle-documents', Icon: CarFront },
  { type: 'license_disc', title: 'Licence Disc', description: 'Upload a clear image of your current licence disc.', bucket: 'vehicle-documents', Icon: CarFront, expiryRequired: true },
  { type: 'vehicle_photos', title: 'Vehicle Photos (4)', description: 'Front, Back, Left, Right', bucket: 'vehicle-documents', Icon: CarFront },
] as const
const VEHICLE_PHOTO_SIDES = ['Front', 'Back', 'Left', 'Right'] as const
const ONBOARDING_DOCUMENT_TYPES = new Set([
  ...DOCUMENT_CARDS.filter(card => card.type !== 'vehicle_photos').map(card => card.type),
  ...[1, 2, 3, 4].map(documentTypeForSlot),
])

function documentTypeForSlot(number: number) {
  return `vehicle_photos_${number}`
}

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #edf0f3',
  borderRadius: 16,
  boxShadow: '0 5px 18px rgba(20, 33, 50, 0.045)',
}

function latestDocuments(documents: StoredDocument[]) {
  const latest = new Map<string, StoredDocument>()
  for (const document of documents) {
    if (!latest.has(document.doc_type)) latest.set(document.doc_type, document)
  }
  return [...latest.values()]
}

function hasIndependentFile(type: string, documents: StoredDocument[]) {
  const document = documents.find(item => item.doc_type === type && item.file_url)
  if (!document) return false
  return !documents.some(item => item.doc_type !== type && item.file_url === document.file_url)
}

function hasSeparateSelfieFiles(documents: StoredDocument[]) {
  const selfies = documents.filter(document =>
    ['profile_photo', 'selfie_holding_id'].includes(document.doc_type) && document.file_url,
  )
  if (selfies.length < 2) return true
  const [profileSelfie, idSelfie] = selfies
  return profileSelfie.file_url !== idSelfie.file_url
    && (!profileSelfie.document_hash || !idSelfie.document_hash || profileSelfie.document_hash !== idSelfie.document_hash)
}

function isCardComplete(card: typeof DOCUMENT_CARDS[number], documents: StoredDocument[]) {
  if (card.type === 'vehicle_photos') {
    return [1, 2, 3, 4].every(number =>
      hasIndependentFile(documentTypeForSlot(number), documents),
    )
  }
  const document = documents.find(item => item.doc_type === card.type)
  return hasIndependentFile(card.type, documents)
    && (card.type !== 'selfie_holding_id' || hasSeparateSelfieFiles(documents))
    && (!('expiryRequired' in card) || !card.expiryRequired || Boolean(document?.expiry_date))
    && (!('prdpNumberRequired' in card) || Boolean(document?.prdp_number?.trim()))
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
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [prdpNumbers, setPrdpNumbers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const uploadedTypes = useMemo(() => new Set(
    documents.filter(document => document.file_url).map(document => document.doc_type),
  ), [documents])
  const rejectedTypes = useMemo(
    () => new Set(documents
      .filter(document => ONBOARDING_DOCUMENT_TYPES.has(document.doc_type)
        && document.status.toUpperCase() === 'REJECTED')
      .map(document => document.doc_type)),
    [documents],
  )
  const uploadedCarPhotos = [1, 2, 3, 4].filter(number =>
    hasIndependentFile(documentTypeForSlot(number), documents),
  ).length
  const completedCards = DOCUMENT_CARDS.filter(card => isCardComplete(card, documents)).length

  async function loadDocuments() {
    setLoading(true)
    setError('')
    const [documentsResult, profileResult] = await Promise.all([
      supabase.from('driver_documents')
        .select('id,doc_type,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash')
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
    setExpiryDates(Object.fromEntries(loadedDocuments
      .filter(document => document.expiry_date)
      .map(document => [document.doc_type, document.expiry_date!.slice(0, 10)])))
    setPrdpNumbers(Object.fromEntries(loadedDocuments
      .filter(document => document.prdp_number)
      .map(document => [document.doc_type, document.prdp_number!])))
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
      const expiryDate = expiryDates[documentType] || null
      const prdpNumber = prdpNumbers[documentType]?.trim() || null
      if (card && 'expiryRequired' in card && card.expiryRequired && !expiryDate) {
        throw new Error('Enter the document expiry date before uploading.')
      }
      if (expiryDate && expiryDate <= new Date().toISOString().slice(0, 10)) {
        throw new Error('The document expiry date must be in the future.')
      }
      if (documentType === 'prdp' && !prdpNumber) {
        throw new Error('Enter the PDP / PrDP number before uploading.')
      }
      const body = isImage ? await compressImageFile(file) : file
      const digest = await crypto.subtle.digest('SHA-256', await body.arrayBuffer())
      const documentHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
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
      const newDocuments = [{
        driver_id: profile.id,
        doc_type: documentType,
        file_url: publicUrl,
        status: 'PENDING',
        created_at: new Date().toISOString(),
        expiry_date: expiryDate,
        prdp_number: documentType === 'prdp' ? prdpNumber : null,
        document_hash: documentHash,
      }]
      const { data: savedDocuments, error: saveError } = await supabase.from('driver_documents')
        .upsert(newDocuments, { onConflict: 'driver_id,doc_type' })
        .select('id,doc_type,file_url,status,rejection_reason,created_at,expiry_date,prdp_number,document_hash')
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

  async function submitForReview() {
    const bankDetailsComplete = Object.values(bankDetails).every(value => value.trim())
    if (!isComplete(documents) || rejectedTypes.size > 0 || !bankDetailsComplete || submitting) return
    if (['drivers_license', 'prdp', 'license_disc'].some(type =>
      !expiryDates[type] || expiryDates[type] <= new Date().toISOString().slice(0, 10),
    )) {
      setError('All required expiry dates must be in the future.')
      return
    }
    setSubmitting(true)
    setError('')
    const metadataUpdates = await Promise.all(
      DOCUMENT_CARDS
        .filter(card => card.type !== 'vehicle_photos' && ('expiryRequired' in card || 'prdpNumberRequired' in card))
        .map(async card => {
          const changes: { expiry_date?: string; prdp_number?: string } = {}
          if ('expiryRequired' in card && card.expiryRequired) changes.expiry_date = expiryDates[card.type]
          if ('prdpNumberRequired' in card && card.prdpNumberRequired) changes.prdp_number = prdpNumbers[card.type].trim()
          return supabase.from('driver_documents').update(changes)
            .eq('driver_id', profile.id)
            .eq('doc_type', card.type)
        }),
    )
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

      <div style={{ display: 'grid', gap: 12 }}>
        {DOCUMENT_CARDS.map(card => {
          const { type, title, description, bucket, Icon } = card
          const documentTypes: readonly string[] = type === 'vehicle_photos'
            ? [1, 2, 3, 4].map(documentTypeForSlot)
            : [type]
          const cardDocuments = documents.filter(document => documentTypes.includes(document.doc_type))
          const rejectedDocument = cardDocuments.find(document =>
            document.file_url && document.status.toUpperCase() === 'REJECTED',
          )
          const uploaded = isCardComplete(card, documents)
          const needsReplacement = cardDocuments.some(document => rejectedTypes.has(document.doc_type))
            || (type !== 'vehicle_photos' && Boolean(cardDocuments[0]?.file_url && !hasIndependentFile(type, documents)))
            || (type === 'profile_photo' && !hasSeparateSelfieFiles(documents))
            || (type === 'selfie_holding_id' && !hasSeparateSelfieFiles(documents))
          const isApproved = type === 'vehicle_photos'
            ? [1, 2, 3, 4].every(number => [documentTypeForSlot(number)].some(documentType =>
              cardDocuments.some(document => document.doc_type === documentType
                && document.file_url && document.status.toUpperCase() === 'APPROVED'),
            ))
            : cardDocuments.some(document => document.doc_type === type
              && document.file_url && document.status.toUpperCase() === 'APPROVED')
          const isPending = cardDocuments.some(document =>
            document.file_url && document.status.toUpperCase() === 'PENDING',
          )
          const badgeLabel = rejectedDocument
            ? `Action needed${rejectedDocument.rejection_reason ? ` - ${rejectedDocument.rejection_reason}` : ''}`
            : isApproved
              ? 'Done'
              : type === 'vehicle_photos'
                ? `${uploadedCarPhotos}/4 uploaded`
              : isPending
                ? 'Pending'
                : uploaded
                  ? 'Uploaded'
                  : 'Missing'
          const activeUpload = uploading === type
          return <section key={type} className="driver-onboarding-card" style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, padding: '18px 16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 48px', width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: type === 'profile_photo' ? '50%' : 14, border: type === 'profile_photo' ? '2px dashed #0a8f67' : 'none', background: uploaded ? '#e5f7ef' : '#f1f4f7', color: uploaded ? '#087f5b' : '#475467' }}><Icon size={24} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: 15 }}>{title}</strong>
                <span style={{ padding: '4px 8px', borderRadius: 99, color: needsReplacement ? '#b42318' : uploaded ? '#067647' : '#667085', background: needsReplacement ? '#fef3f2' : uploaded ? '#ecfdf3' : '#f2f4f7', fontSize: 11, fontWeight: 700 }}>
                  {badgeLabel}
                </span>
              </div>
              <p style={{ margin: '5px 0 0', color: '#667085', fontSize: 12, lineHeight: 1.4 }}>{description}</p>
              {type === 'profile_photo' && <p style={{ margin: '5px 0 0', color: '#087f5b', fontSize: 11 }}>Center your face inside the circle for selfie verification.</p>}
            </div>
            {type === 'vehicle_photos' ? (
              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                {VEHICLE_PHOTO_SIDES.map((side, index) => {
                  const number = index + 1
                  const slotTypes = [documentTypeForSlot(number)]
                  const slotDocument = cardDocuments.find(document => slotTypes.includes(document.doc_type))
                  const slotRejected = slotTypes.some(documentType => rejectedTypes.has(documentType))
                  const inputKey = documentTypeForSlot(number)
                  const slotComplete = hasIndependentFile(inputKey, documents)
                  return <div key={inputKey}>
                    <p style={{ margin: '0 0 6px', color: '#667085', fontSize: 12 }}>{slotDocument?.expiry_date ? `Expires ${slotDocument.expiry_date}` : ''}</p>
                    <input
                      ref={element => { fileInputs.current[inputKey] = element }}
                      type="file"
                      accept="image/*"
                      onChange={event => void handleFileChange(type, bucket, event, inputKey)}
                      capture="environment"
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      disabled={Boolean(uploading) || (slotComplete && !slotRejected)}
                      onClick={() => fileInputs.current[inputKey]?.click()}
                      style={{ width: '100%', minHeight: 74, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, borderRadius: 12, border: `1px dashed ${slotComplete && !slotRejected ? '#9bd8bd' : '#b8c2ce'}`, color: slotRejected ? '#b42318' : slotComplete ? '#087f5b' : '#344054', background: slotComplete && !slotRejected ? '#f5fcf8' : '#fff', fontSize: 12, fontWeight: 700 }}
                    >
                      {activeUpload && uploading === type && slotDocument?.doc_type === inputKey
                        ? <LoaderCircle size={16} className="driver-onboarding-spin" />
                        : slotComplete && !slotRejected ? <Check size={16} /> : <Upload size={16} />}
                      {side}: {slotRejected ? 'Replace' : slotComplete ? 'Added' : 'Add photo'}
                    </button>
                  </div>
                })}
              </div>
            ) : <>
              {'expiryRequired' in card && card.expiryRequired && <label style={{ width: '100%', display: 'grid', gap: 5, color: '#344054', fontSize: 12, fontWeight: 700 }}>
                Expiry date
                <input
                  type="date"
                  required
                  value={expiryDates[type] || ''}
                  onChange={event => setExpiryDates(current => ({ ...current, [type]: event.target.value }))}
                  style={{ minHeight: 40, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9 }}
                />
              </label>}
              {'prdpNumberRequired' in card && card.prdpNumberRequired && <label style={{ width: '100%', display: 'grid', gap: 5, color: '#344054', fontSize: 12, fontWeight: 700 }}>
                PDP / PrDP number
                <input
                  type="text"
                  required
                  value={prdpNumbers[type] || ''}
                  onChange={event => setPrdpNumbers(current => ({ ...current, [type]: event.target.value }))}
                  style={{ minHeight: 40, padding: 8, border: '1px solid #d0d5dd', borderRadius: 9 }}
                />
              </label>}
              <input
                ref={element => { fileInputs.current[type] = element }}
                type="file"
                accept={'camera' in card ? 'image/*' : 'image/*,application/pdf'}
                capture={'camera' in card ? card.camera : undefined}
                onChange={event => void handleFileChange(type, bucket, event)}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                disabled={Boolean(uploading) || (uploaded && !needsReplacement)}
                onClick={() => fileInputs.current[type]?.click()}
                style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderRadius: 11, border: `1px dashed ${uploaded && !needsReplacement ? '#9bd8bd' : '#b8c2ce'}`, color: needsReplacement ? '#b42318' : uploaded ? '#087f5b' : '#344054', background: uploaded && !needsReplacement ? '#f5fcf8' : '#fff', fontSize: 12, fontWeight: 700, cursor: uploading || (uploaded && !needsReplacement) ? 'default' : 'pointer' }}
              >
                {activeUpload ? <LoaderCircle size={16} className="driver-onboarding-spin" /> : uploaded && !needsReplacement ? <Check size={16} /> : <Upload size={16} />}
                <span>{activeUpload ? 'Uploading' : needsReplacement ? 'Replace' : uploaded ? 'Done' : 'Upload'}</span>
              </button>
            </>}
          </section>
        })}
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
