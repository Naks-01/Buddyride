import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

const DOC_TYPES = [
  { key: 'profile_photo', label: 'Profile Photo', bucket: 'profile-photos', folder: 'profile_photo' },
  { key: 'selfie', label: 'Selfie', bucket: 'driver-documents', folder: 'selfie' },
  { key: 'sa_id', label: 'SA ID', bucket: 'driver-documents', folder: 'sa_id' },
  { key: 'drivers_license', label: "Driver's License", bucket: 'driver-documents', folder: 'drivers_license' },
  { key: 'prdp', label: 'PrDP', bucket: 'driver-documents', folder: 'prdp' },
  { key: 'vehicle_registration', label: 'Vehicle Papers', bucket: 'driver-documents', folder: 'vehicle_registration' },
  { key: 'license_disc', label: 'License Disc', bucket: 'driver-documents', folder: 'license_disc' },
  { key: 'vehicle_photo_1', label: 'Vehicle Photo 1 - Front', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_photo_2', label: 'Vehicle Photo 2 - Back', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_photo_3', label: 'Vehicle Photo 3 - Left Side', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_photo_4', label: 'Vehicle Photo 4 - Right Side', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_interior_photo_1', label: 'Vehicle Interior 1 - Front Seats', bucket: 'driver-documents', folder: 'vehicle_interior' },
  { key: 'vehicle_interior_photo_2', label: 'Vehicle Interior 2 - Back Seats', bucket: 'driver-documents', folder: 'vehicle_interior' },
  { key: 'huru_criminal_check', label: 'Huru Check', bucket: 'driver-documents', folder: 'huru_criminal_check' },
  { key: 'vehicle_inspection_report', label: 'Vehicle Inspection Report', bucket: 'driver-documents', folder: 'vehicle_inspection_report' },
] as const

type DocKey = typeof DOC_TYPES[number]['key']
const southAfricanToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const EXPIRING_DOCS = new Set<string>([
  'drivers_license',
  'prdp',
  'license_disc',
  'huru_criminal_check',
  'vehicle_inspection_report'
])

function safeUUID() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const max = 1280
      let w = img.width, h = img.height
      if (w > h) { if (w > max) { h *= max/w; w = max } }
      else { if (h > max) { w *= max/h; h = max } }
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(objectUrl)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Invalid image - try a JPEG/PNG screenshot')) }
    img.src = objectUrl
  })
}

// FIXED: Private docs must use signed URL, never public URL
async function signedUrlFor(ref: string): Promise<string | null> {
  if (!ref) return null
  if (ref.startsWith('http')) return ref // legacy public docs - still viewable
  const [bucket, ...rest] = ref.split(':')
  const path = rest.join(':')
  if (!bucket || !path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

export function DriverDocuments({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [profileUrl, setProfileUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState<DocKey | null>(null)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveId = user?.id || driverId
    const [docsRes, profileRes] = await Promise.all([
      supabase.from('driver_documents').select('id,doc_type,document_type,status,file_url,document_url,file_path,storage_path,expiry_date').eq('driver_id', effectiveId),
      supabase.from('profiles').select('avatar_url').eq('id', effectiveId).single()
    ])
    if (docsRes.error) console.warn('load docs error', docsRes.error.message)
    if (docsRes.data) {
      setDocs(docsRes.data)
      const exp: Record<string, string> = {}
      for (const d of (docsRes.data as any[])) {
        const key = d.doc_type || d.document_type
        if (key && d.expiry_date && !exp[key]) exp[key] = String(d.expiry_date).slice(0, 10)
      }
      setExpiryDates(exp)
      // Build signed previews for private docs
      const previews: Record<string, string> = {}
      await Promise.all((docsRes.data as any[]).map(async (d) => {
        const key = d.doc_type || d.document_type
        const ref = d.file_url || d.document_url
        if (key && ref) {
          const url = await signedUrlFor(String(ref))
          if (url) previews[key] = url
        }
      }))
      setPreviewUrls(previews)
    }
    const avatar = profileRes.data?.avatar_url
    if (typeof avatar === 'string' && avatar.startsWith('http')) setProfileUrl(avatar)
  }

  useEffect(() => { void load() }, [driverId])

  async function upload(key: DocKey, file: File) {
    setUploading(key)
    setMsg('')
    setIsError(false)
    let uploadedPath: string | null = null
    const meta = DOC_TYPES.find(d => d.key === key)!
    try {
      const extFromName = file.name.split('.').pop()?.toLowerCase() || ''
      if (['heic','heif'].includes(extFromName)) throw new Error('iPhone HEIC not supported. Screenshot the document or pick JPG.')
      const guessedType = file.type || (extFromName === 'pdf' ? 'application/pdf' : extFromName === 'png' ? 'image/png' : extFromName === 'webp' ? 'image/webp' : 'image/jpeg')
      if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('File must be greater than 0 bytes and smaller than 20 MB.')
      if (EXPIRING_DOCS.has(key) && !expiryDates[key]) throw new Error('Enter expiry date as printed on document for ' + meta.label)
      if (EXPIRING_DOCS.has(key) && expiryDates[key] && expiryDates[key] < southAfricanToday()) {
        throw new Error('This document has expired. Upload a current document.')
      }

      const isImage = guessedType.startsWith('image/')
      let blob: Blob | File = file
      if (isImage) {
        try { blob = await compressImage(file) } catch { blob = file }
      }
      if (blob.size > 20 * 1024 * 1024) throw new Error('Processed file must be smaller than 20 MB.')
      const outputType = isImage ? 'image/jpeg' : guessedType

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in - please log in again')
      const ownerId = user.id
      const path = `${ownerId}/${meta.folder}/${key}_${safeUUID()}.${isImage ? 'jpg' : (extFromName === 'pdf' ? 'pdf' : 'jpg')}`
      uploadedPath = path

      const { error: upErr } = await supabase.storage.from(meta.bucket).upload(path, blob, {
        contentType: outputType,
        upsert: false,
      })
      if (upErr) throw upErr

      // FIXED: Store bucket:path, NOT public URL - private docs
      const storageRef = `${meta.bucket}:${path}`

      const payload: any = {
        driver_id: ownerId,
        doc_type: key,
        document_type: key,
        file_url: storageRef,
        document_url: storageRef,
        file_path: path,
        storage_path: path,
        file_name: file.name,
        status: 'PENDING',
        expiry_date: EXPIRING_DOCS.has(key) ? expiryDates[key] : null,
      }

      const { data: existingList } = await supabase.from('driver_documents').select('id').eq('driver_id', ownerId).or(`doc_type.eq.${key},document_type.eq.${key}`).limit(1)
      const existing = existingList?.[0]
      let dbErr: any = null
      if (existing) {
        const res = await supabase.from('driver_documents').update(payload).eq('id', existing.id)
        dbErr = res.error
      } else {
        const res = await supabase.from('driver_documents').insert(payload)
        dbErr = res.error
      }
      if (dbErr) throw dbErr

      // FIXED: Delete duplicates AFTER successful save, keep only latest (was deleting wrong rows before)
      const { data: allForType } = await supabase.from('driver_documents').select('id,created_at').eq('driver_id', ownerId).or(`doc_type.eq.${key},document_type.eq.${key}`).order('created_at', { ascending: false })
      if (allForType && allForType.length > 1) {
        const idsToDelete = allForType.slice(1).map((r: any) => r.id)
        await supabase.from('driver_documents').delete().in('id', idsToDelete)
      }

      if (key === 'profile_photo') {
        const { data: publicData } = supabase.storage.from(meta.bucket).getPublicUrl(path)
        const { error: profErr } = await supabase.from('profiles').update({ avatar_url: publicData.publicUrl }).eq('id', ownerId)
        if (profErr) throw profErr
        setProfileUrl(publicData.publicUrl)
      }
      uploadedPath = null
      setMsg(`${meta.label} uploaded ✅`)
      await load()
    } catch (e: unknown) {
      if (uploadedPath) await supabase.storage.from(meta.bucket).remove([uploadedPath]).catch(()=>{})
      setIsError(true)
      setMsg(`Upload failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUploading(null)
    }
  }

  async function submitForReview() {
    setSubmitting(true)
    setMsg('')
    setIsError(false)
    try {
      const { error } = await supabase.rpc('submit_driver_documents_for_review')
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes('argument') || msg.includes('function')) {
          const { error: retryError } = await supabase.rpc('submit_driver_documents_for_review', { p_driver_id: driverId } as any)
          if (retryError) throw retryError
        } else throw error
      }
      setMsg('Your documents have been submitted for admin review.')
      await load()
    } catch (submitError: unknown) {
      setIsError(true)
      setMsg(`Could not submit for review: ${submitError instanceof Error ? submitError.message : String(submitError)}. Return to driver onboarding to complete any missing bank details.`)
    } finally {
      setSubmitting(false)
    }
  }

  const getStatus = (key: DocKey) => {
    const latest = docs.find(d => (d.doc_type || d.document_type || '').toLowerCase() === key)
    return latest ? latest.status : 'Missing'
  }

  const getDoc = (key: DocKey) => docs.find(d => (d.doc_type || d.document_type || '').toLowerCase() === key)
  // FIXED: Count bucket:path too, not just http
  const uploadedCount = DOC_TYPES.filter(t => {
    const d = getDoc(t.key)
    return Boolean(d?.file_url)
  }).length

  return (
    <main style={{ minHeight: '100dvh', background: '#F8F9FA', color: '#182230', padding: '20px 16px 32px', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: '#fff', border: '1px solid #E4E7EC', color: '#344054', padding: '8px 14px', borderRadius: 10, marginBottom: 12, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
        <p style={{ color: BLUE, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', margin: 0 }}>Step 4 of 4</p>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 0', letterSpacing: '-.02em' }}>Driver documents</h1>
        <p style={{ color: '#667085', marginTop: 6, fontSize: 14 }}>Your 15 driver verification documents - ID, licence, licence disk and selfie.</p>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, height: 9, background: '#E5E9EF', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${(uploadedCount/15)*100}%`, height: '100%', background: BLUE, transition: 'width 0.3s', borderRadius: 99 }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: uploadedCount === 15 ? BLUE : '#667085' }}>{uploadedCount}/15 {uploadedCount === 15 ? '✅ READY' : ''}</span>
        </div>
        {msg && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: isError ? '#FEF3F2' : BLUE_LIGHT, color: isError ? '#B42318' : BLUE_DARK, fontSize: 13, border: `1px solid ${isError ? '#FECDCA' : '#B2CCFF'}` }}>{msg}</div>}
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {DOC_TYPES.map(t => {
            const status = getStatus(t.key)
            const isApproved = String(status).toLowerCase() === 'approved'
            const isExpiring = EXPIRING_DOCS.has(t.key)
            const doc = getDoc(t.key)
            const uploaded = Boolean(doc?.file_url)
            const preview = previewUrls[t.key]
            return (
              <div key={t.key} style={{ padding: 16, border: `1px solid ${isApproved ? '#B2CCFF' : '#EDF0F3'}`, borderRadius: 16, background: isApproved ? BLUE_LIGHT : '#fff', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{t.label} {isExpiring && <span style={{ fontSize: 10, background: '#FEF0C7', color: '#B54708', padding: '2px 6px', borderRadius: 99, marginLeft: 6, fontWeight: 800 }}>NEEDS EXPIRY</span>}</div><div style={{ marginTop: 6, display: 'inline-block', padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: isApproved ? BLUE : uploaded ? '#ECFDF3' : '#F2F4F7', color: isApproved ? '#fff' : uploaded ? '#067647' : '#667085' }}>{isApproved ? 'VERIFIED' : String(status).toUpperCase()}</div>{doc?.expiry_date && <div style={{ fontSize: 11, color: '#667085', marginTop: 4 }}>Expires: {String(doc.expiry_date).slice(0, 10)}</div>}<div style={{ fontSize: 10, color: '#98A2B3', marginTop: 2 }}>📁 {t.folder}/</div></div>
                  <label style={{ background: isApproved ? '#fff' : BLUE, color: isApproved ? BLUE : 'white', border: isApproved ? `1px solid ${BLUE}` : 'none', padding: '10px 14px', borderRadius: 11, fontWeight: 800, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                    {uploading === t.key ? 'Uploading...' : status === 'Missing' ? 'Upload' : 'Replace'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(t.key, f); e.currentTarget.value = '' }} />
                  </label>
                </div>
                {isExpiring && (
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#344054', fontWeight: 700 }}>
                    Expiry Date (as printed on document) - REQUIRED
                    <input type="date" value={expiryDates[t.key] || ''} onChange={e => setExpiryDates(prev => ({ ...prev, [t.key]: e.target.value }))} style={{ background: '#fff', border: '1px solid #D0D5DD', color: '#182230', padding: '10px 8px', borderRadius: 9 }} />
                  </label>
                )}
                {preview && (
                  <a href={preview} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: BLUE, fontWeight: 700, textDecoration: 'none' }}>
                    Preview uploaded document ↗
                  </a>
                )}
              </div>
            )
          })}
        </div>
        <button disabled={uploadedCount !== 15 || submitting || !!uploading} onClick={() => void submitForReview()} style={{ marginTop: 20, width: '100%', padding: 16, borderRadius: 14, background: uploadedCount === 15 && !submitting ? BLUE : '#CBD2DA', color: 'white', border: 0, fontWeight: 800, fontSize: 16, opacity: submitting ? 0.7 : 1, cursor: uploadedCount === 15 ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Submitting…' : uploadedCount === 15 ? '✅ SUBMIT FOR REVIEW' : `Upload all 15 documents (${uploadedCount}/15)`}
        </button>
      </section>
    </main>
  )
}
export default DriverDocuments;