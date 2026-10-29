import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DOC_TYPES = [
  { key: 'profile_photo', label: 'Profile Photo', bucket: 'profile-photos' },
  { key: 'sa_id', label: 'SA ID', bucket: 'driver-documents' },
  { key: 'drivers_license', label: "Driver's License", bucket: 'driver-documents' },
  { key: 'prdp', label: 'PrDP', bucket: 'driver-documents' },
  { key: 'vehicle_papers', label: 'Vehicle Papers', bucket: 'driver-documents' },
  { key: 'license_disc', label: 'License Disc', bucket: 'driver-documents' },
  { key: 'huru_check', label: 'Huru Check', bucket: 'driver-documents' },
] as const

type DocKey = typeof DOC_TYPES[number]['key']

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const max = 1280
      let w = img.width, h = img.height
      if (w > h) { if (w > max) { h *= max/w; w = max } }
      else { if (h > max) { w *= max/h; h = max } }
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(img.src); reject(new Error('Image compression is unavailable')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(img.src)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', 0.75)
    }
    img.onerror = () => reject(new Error('Invalid image'))
    img.src = URL.createObjectURL(file)
  })
}

export function DriverDocuments({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [profileUrl, setProfileUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState<DocKey | null>(null)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  async function load() {
    const [docsRes, profileRes] = await Promise.all([
      supabase.from('driver_documents').select('*').eq('driver_id', driverId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('avatar_url').eq('id', driverId).single()
    ])
    if (docsRes.data) setDocs(docsRes.data)
    const avatar = profileRes.data?.avatar_url
    if (typeof avatar === 'string' && avatar.startsWith('http')) setProfileUrl(avatar)
  }

  useEffect(() => { load() }, [driverId])

  async function upload(key: DocKey, file: File) {
    setUploading(key)
    setMsg('')
    setIsError(false)
    try {
      const meta = DOC_TYPES.find(d => d.key === key)!
      const isImage = file.type.startsWith('image/')
      if (!isImage && file.type !== 'application/pdf') throw new Error('Upload an image or PDF')
      if (file.size > 50 * 1024 * 1024) throw new Error('File must be 50MB or less')
      const blob: Blob | File = isImage ? await compressImage(file) : file
      const ext = isImage ? 'jpg' : file.name.split('.').pop() || 'pdf'
      const path = `${driverId}/${key}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(meta.bucket).upload(path, blob, {
        contentType: isImage ? 'image/jpeg' : file.type,
        upsert: true,
      })
      if (upErr) throw upErr
      if (key === 'profile_photo') {
        const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path)
        const { error: profErr } = await supabase.from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', driverId)
        if (profErr) { await supabase.storage.from('profile-photos').remove([path]); throw profErr }
        setProfileUrl(urlData.publicUrl)
        setMsg('Profile photo updated ✅')
      } else {
        const { error: dbErr } = await supabase.from('driver_documents').upsert({
          driver_id: driverId,
          document_type: key,
          file_path: path,
          doc_type: key,
          file_url: path,
          status: 'pending'
        }, { onConflict: 'driver_id,doc_type' })
        if (dbErr) { await supabase.storage.from('driver-documents').remove([path]); throw dbErr }
        setMsg(`${meta.label} uploaded - waiting approval`)
      }
      await load()
    } catch (e: any) {
      setIsError(true)
      setMsg(`Upload failed: ${e.message}`)
    } finally {
      setUploading(null)
    }
  }

  const getStatus = (key: DocKey) => {
    if (key === 'profile_photo') return profileUrl ? 'Approved' : 'Missing'
    const aliases: Record<string, string[]> = { drivers_license: ['drivers_license', 'driver_license'], vehicle_papers: ['vehicle_papers', 'vehicle_registration'] }
    const latest = docs.find(d => (aliases[key] || [key]).includes(d.document_type || d.doc_type))
    return latest ? latest.status : 'Missing'
  }

  return (
    <main className="auth-page" style={{ minHeight: '100dvh', background: '#0b0e14', color: 'white', padding: 16 }}>
      <section className="auth-card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#9ca3af', textAlign: 'left', padding: 0, marginBottom: 12 }}>← Back</button>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Documents</h1>
        <p className="muted" style={{ color: '#9ca3af', marginTop: 4 }}>Your 7 driver verification documents.</p>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>{docs.filter(d => d.status === 'approved').length + (profileUrl ? 1 : 0)}/7 Approved</p>
        {msg && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: isError ? '#fee2e2' : '#dcfce7', color: isError ? '#991b1b' : '#166534', fontSize: 13 }}>{msg}</div>}
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {DOC_TYPES.map(t => {
            const status = getStatus(t.key)
            const isApproved = status.toLowerCase() === 'approved'
            const statusColor = isApproved ? '#34d399' : status.toLowerCase() === 'rejected' ? '#f87171' : status.toLowerCase() === 'pending' ? '#fbbf24' : '#9ca3af'
            return (
              <div key={t.key} style={{ padding: 14, border: '1px solid #1f2937', borderRadius: 12, background: '#111827', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontWeight: 600 }}>{t.label}</div><div style={{ marginTop: 4, display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, background: isApproved ? '#064e3b' : status.toLowerCase() === 'rejected' ? '#450a0a' : status.toLowerCase() === 'pending' ? '#422006' : '#1f2937', color: statusColor }}>{status}</div></div>
                <label style={{ background: '#22c55e', color: 'black', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
                  {uploading === t.key ? 'Uploading...' : status === 'Missing' ? 'Upload' : status === 'Rejected' ? 'Re-upload' : 'Replace'}
                  <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) upload(t.key, f); e.currentTarget.value = '' }} />
                </label>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export default DriverDocuments;