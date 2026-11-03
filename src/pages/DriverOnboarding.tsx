import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  BadgeCheck,
  CarFront,
  Check,
  ChevronRight,
  CircleUserRound,
  FileBadge,
  FileText,
  IdCard,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { supabase, type DriverDocument, type Profile } from '../lib/supabase'
import compressImageFile from '../lib/compressImage'

type StoredDocument = Pick<DriverDocument, 'doc_type' | 'file_url' | 'status'>
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

const REQUIRED_TYPES = [
  'sa_id',
  'drivers_license',
  'prdp',
  'profile_photo',
  'selfie_holding_id',
  'vehicle_registration',
  'license_disc',
  'car_photo_1',
  'car_photo_2',
  'car_photo_3',
  'car_photo_4',
]

const DOCUMENT_CARDS = [
  { type: 'sa_id', title: 'South African ID', description: 'Clear photo of both sides of your ID', bucket: 'driver-documents', Icon: IdCard },
  { type: 'drivers_license', title: "Driver's Licence", description: 'A clear photo of your valid licence', bucket: 'driver-documents', Icon: FileBadge },
  { type: 'prdp', title: 'PrDP', description: 'Professional Driving Permit (required)', bucket: 'driver-documents', Icon: BadgeCheck },
  { type: 'profile_photo', title: 'Profile Photo', description: 'A clear selfie of your face', bucket: 'profile-photos', Icon: CircleUserRound },
  { type: 'selfie_holding_id', title: 'Selfie holding ID', description: 'Your face and ID should both be visible', bucket: 'driver-documents', Icon: ShieldCheck },
  { type: 'vehicle_registration', title: 'Vehicle Registration Papers', description: 'The current vehicle registration document', bucket: 'vehicle-documents', Icon: FileText },
  { type: 'license_disc', title: 'Licence Disc', description: 'A clear photo of the current licence disc', bucket: 'vehicle-documents', Icon: FileBadge },
  { type: 'car_photos', title: 'Vehicle Photos', description: 'Front, rear, and both sides of your vehicle', bucket: 'vehicle-documents', Icon: CarFront },
] as const

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #edf0f3',
  borderRadius: 16,
  boxShadow: '0 5px 18px rgba(20, 33, 50, 0.045)',
}

function isComplete(documents: StoredDocument[]) {
  const uploaded = new Set(documents.filter(document => document.file_url).map(document => document.doc_type))
  return REQUIRED_TYPES.every(type => uploaded.has(type))
}

export function DriverOnboarding({ profile, onDashboard }: { profile: Profile; onDashboard: () => void }) {
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [verificationStatus, setVerificationStatus] = useState('not_started')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const uploadedTypes = useMemo(
    () => new Set(documents.filter(document => document.file_url).map(document => document.doc_type)),
    [documents],
  )
  const rejectedTypes = useMemo(
    () => new Set(documents.filter(document => document.status.toUpperCase() === 'REJECTED').map(document => document.doc_type)),
    [documents],
  )
  const uploadedCarPhotos = [1, 2, 3, 4].filter(number => uploadedTypes.has(`car_photo_${number}`)).length
  const completedCards = DOCUMENT_CARDS.filter(card =>
    card.type === 'car_photos'
      ? uploadedCarPhotos === 4
      : uploadedTypes.has(card.type),
  ).length

  async function loadDocuments() {
    setLoading(true)
    setError('')
    const [documentsResult, profileResult] = await Promise.all([
      supabase.from('driver_documents').select('doc_type,file_url,status').eq('driver_id', profile.id),
      supabase.from('profiles').select('verification_status').eq('id', profile.id).single(),
    ])
    if (documentsResult.error || profileResult.error) {
      setError(`Could not load your onboarding status: ${documentsResult.error?.message || profileResult.error?.message}`)
      setLoading(false)
      return
    }

    const loadedDocuments = (documentsResult.data || []) as StoredDocument[]
    const status = profileResult.data?.verification_status || 'not_started'
    setDocuments(loadedDocuments)
    setVerificationStatus(status)
    setLoading(false)
    if (isComplete(loadedDocuments) && status === 'pending_verification'
      && !loadedDocuments.some(document => document.status.toUpperCase() === 'REJECTED')) {
      window.setTimeout(onDashboard, 2200)
    } else if (isComplete(loadedDocuments) && status === 'approved') {
      onDashboard()
    }
  }

  useEffect(() => {
    void loadDocuments()
  }, [profile.id])

  async function uploadFile(cardType: string, bucket: string, file: File, documentType = cardType): Promise<boolean> {
    setUploading(cardType)
    setError('')
    let uploadStage = 'validation'
    try {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        throw new Error('Choose a JPEG, PNG, or PDF file.')
      }
      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error('File must be smaller than 5 MB.')
      }

      const isImage = file.type.startsWith('image/')
      const body = isImage ? await compressImageFile(file) : file
      if (body.size > MAX_UPLOAD_SIZE) {
        throw new Error('Compressed file must be smaller than 5 MB.')
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
      const { data: savedDocument, error: saveError } = await supabase.from('driver_documents').upsert({
        driver_id: profile.id,
        doc_type: documentType,
        file_url: publicUrl,
        status: 'PENDING',
      }, { onConflict: 'driver_id,doc_type' }).select('doc_type,file_url,status').single()
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

      setDocuments(current => [
        ...current.filter(document => document.doc_type !== documentType),
        savedDocument,
      ])

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

  async function handleFileChange(cardType: string, bucket: string, event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return

    if (cardType === 'car_photos') {
      const availableTypes = [1, 2, 3, 4]
        .map(number => `car_photo_${number}`)
        .filter(type => !uploadedTypes.has(type) || rejectedTypes.has(type))
      if (selectedFiles.length > availableTypes.length) {
        setError(`Choose no more than ${availableTypes.length} additional vehicle photo${availableTypes.length === 1 ? '' : 's'}.`)
        return
      }
      for (const [index, file] of selectedFiles.entries()) {
        const uploaded = await uploadFile(cardType, bucket, file, availableTypes[index])
        if (!uploaded) break
      }
      return
    }

    await uploadFile(cardType, bucket, selectedFiles[0])
  }

  async function submitForReview() {
    if (!isComplete(documents) || rejectedTypes.size > 0 || submitting) return
    setSubmitting(true)
    setError('')
    const { error: submitError } = await supabase.rpc('submit_driver_documents_for_review')
    if (submitError) {
      setError(`Could not submit documents for review: ${submitError.message}`)
      setSubmitting(false)
      return
    }
    setVerificationStatus('pending_verification')
    setSubmitting(false)
    window.setTimeout(onDashboard, 2200)
  }

  const progress = Math.round(completedCards / DOCUMENT_CARDS.length * 100)

  if (loading) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F8F9FA', color: '#667085' }}>
      <LoaderCircle size={30} className="driver-onboarding-spin" />
      <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}'}</style>
    </main>
  }

  if (isComplete(documents) && verificationStatus === 'pending_verification' && rejectedTypes.size === 0) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', fontFamily: 'Inter, sans-serif', color: '#182230' }}>
      <section style={{ ...cardStyle, width: 'min(100%, 480px)', padding: '42px 28px', textAlign: 'center' }}>
        <div style={{ margin: '0 auto 20px', width: 76, height: 76, borderRadius: 38, display: 'grid', placeItems: 'center', color: '#087f5b', background: '#dff8ed' }}><Check size={38} strokeWidth={3} /></div>
        <p style={{ margin: '0 0 8px', color: '#087f5b', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step 3 of 4</p>
        <h1 style={{ margin: '0 0 10px', fontSize: 26 }}>Under review</h1>
        <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>Your documents are waiting for admin review. We’ll take you to your driver dashboard shortly.</p>
        <LoaderCircle size={22} style={{ marginTop: 24, color: '#087f5b' }} className="driver-onboarding-spin" />
      </section>
      <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}'}</style>
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
          <div><p style={{ margin: '0 0 6px', color: '#087f5b', fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Step 2 of 4</p><h1 style={{ margin: 0, fontSize: 'clamp(25px, 5vw, 34px)', letterSpacing: '-.03em' }}>Your documents</h1></div>
          <strong style={{ color: '#344054', whiteSpace: 'nowrap' }}>{completedCards}/8 documents</strong>
        </div>
        <div style={{ height: 9, overflow: 'hidden', borderRadius: 99, background: '#e5e9ef' }}>
          <div style={{ width: `${progress}%`, height: '100%', borderRadius: 99, background: '#0a8f67', transition: 'width .25s ease' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#667085' }}>{progress}% complete</p>
      </header>

      <div style={{ display: 'grid', gap: 12 }}>
        {DOCUMENT_CARDS.map(({ type, title, description, bucket, Icon }) => {
          const uploadedCount = type === 'car_photos' ? uploadedCarPhotos : uploadedTypes.has(type) ? 1 : 0
          const documentTypes = type === 'car_photos'
            ? [1, 2, 3, 4].map(number => `car_photo_${number}`)
            : [type]
          const needsReplacement = documentTypes.some(documentType => rejectedTypes.has(documentType))
          const uploaded = type === 'car_photos' ? uploadedCarPhotos === 4 : uploadedCount === 1
          const activeUpload = uploading === type
          return <section key={type} className="driver-onboarding-card" style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, padding: '18px 16px' }}>
            <div style={{ flex: '0 0 48px', width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 14, background: uploaded ? '#e5f7ef' : '#f1f4f7', color: uploaded ? '#087f5b' : '#475467' }}><Icon size={24} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ fontSize: 15 }}>{title}</strong>
                <span style={{ padding: '4px 8px', borderRadius: 99, color: needsReplacement ? '#b42318' : uploaded ? '#067647' : '#667085', background: needsReplacement ? '#fef3f2' : uploaded ? '#ecfdf3' : '#f2f4f7', fontSize: 11, fontWeight: 700 }}>
                  {needsReplacement ? 'Action needed' : uploaded ? 'Uploaded' : type === 'car_photos' ? `${uploadedCarPhotos}/4 uploaded` : 'Missing'}
                </span>
              </div>
              <p style={{ margin: '5px 0 0', color: '#667085', fontSize: 12, lineHeight: 1.4 }}>{description}</p>
            </div>
            <input
              ref={element => { fileInputs.current[type] = element }}
              type="file"
              accept={type === 'car_photos' || type === 'profile_photo' ? 'image/*' : 'image/*,application/pdf'}
              multiple={type === 'car_photos'}
              capture={type === 'profile_photo' || type === 'selfie_holding_id' ? 'user' : undefined}
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
          </section>
        })}
      </div>

      {error && <p role="alert" style={{ ...cardStyle, margin: '16px 0 0', padding: 14, borderColor: '#fecdca', color: '#b42318', fontSize: 13 }}>{error}</p>}

      <section style={{ ...cardStyle, marginTop: 16, padding: 17, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShieldCheck size={22} color="#087f5b" />
        <div><strong style={{ fontSize: 14 }}>Your documents are kept secure</strong><p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>They’re used only to verify your driver account.</p></div>
      </section>

      <button
        type="button"
        disabled={completedCards !== 8 || rejectedTypes.size > 0 || submitting || Boolean(uploading)}
        onClick={() => void submitForReview()}
        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20, padding: 16, border: 0, borderRadius: 14, background: completedCards === 8 ? '#087f5b' : '#cbd2da', color: '#fff', fontSize: 16, fontWeight: 800, cursor: completedCards === 8 && !submitting ? 'pointer' : 'not-allowed' }}
      >
        {submitting ? 'Submitting for review…' : rejectedTypes.size > 0 ? 'Replace rejected documents to continue' : completedCards === 8 ? <>Continue <ChevronRight size={19} /></> : 'Upload all 8 documents to continue'}
      </button>
    </div>
    <style>{'@keyframes driver-onboarding-spin{to{transform:rotate(360deg)}}.driver-onboarding-spin{animation:driver-onboarding-spin 1s linear infinite}@media(max-width:520px){.driver-onboarding-card{flex-wrap:wrap}}'}</style>
  </main>
}
