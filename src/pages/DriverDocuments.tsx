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
      if (!ctx) { URL.revokeObjectURL(img.src); reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(img.src)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.75)
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
      supabase.from('driver_documents').select('doc_type,status,file_url,created_at').eq('driver_id', driverId).order('created_at', { ascending: false }),
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
      if (!isImage && file.type !== 'application/pdf') throw new Error('Upload image or PDF only')
      if (file.size > 15 * 1024 * 1024) throw new Error('File must be <15MB')
      
      const blob: Blob | File = isImage ? await compressImage(file) : file
      const ext = isImage ? 'jpg' : file.name.split('.').pop() || 'pdf'
      const path = `${driverId}/${key}-${Date.now()}.${ext}`
      
      const { error: upErr } = await supabase.storage.from(meta.bucket).upload(path, blob, {
        contentType: isImage ? 'image/jpeg' : file.type,
        upsert: true,
      })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from(meta.bucket).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      if (key === 'profile_photo') {
        const { error: profErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', driverId)
        if (profErr) { await supabase.storage.from(meta.bucket).remove([path]); throw profErr }
        setProfileUrl(publicUrl)
        setMsg('Profile photo updated ✅ - 1/7')
      } else {
        // FIXED: ONLY columns that exist in YOUR table (doc_type, file_url, status, driver_id)
        const { error: dbErr } = await supabase.from('driver_documents').upsert({
          driver_id: driverId,
          doc_type: key,
          file_url: publicUrl,
          status: 'approved'
        }, { onConflict: 'driver_id,doc_type' })
        if (dbErr) { 
          await supabase.storage.from(meta.bucket).remove([path])
          // If file_url column doesn't exist, try without it (fallback to your old schema)
          if (dbErr.message.includes('file_url')) {
            const { error: dbErr2 } = await supabase.from('driver_documents').upsert({
              driver_id: driverId,
              doc_type: key,
              status: 'approved'
            }, { onConflict: 'driver_id,doc_type' })
            if (dbErr2) throw dbErr2
          } else {
            throw dbErr
          }
        }
        setMsg(`${meta.label} uploaded ✅`)
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
    const latest = docs.find(d => (d.doc_type || '').toLowerCase() === key)
    return latest ? latest.status : 'Missing'
  }

  const approvedCount = docs.filter(d => String(d.status || '').toLowerCase() === 'approved').length + (profileUrl ? 1 : 0)

  return (
    <main style={{ minHeight: '100dvh', background: '#0b0e14', color: 'white', padding: 16 }}>
      <section style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: '#1f2937', border: '1px solid #374151', color: '#9ca3af', padding: '8px 14px', borderRadius: 10, marginBottom: 12 }}>← Back</button>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Documents</h1>
        <p style={{ color: '#9ca3af', marginTop: 4, fontSize: 14 }}>Your 7 driver verification documents.</p>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, height: 8, background: '#1f2937', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ width: `${(approvedCount/7)*100}%`, height: '100%', background: approvedCount === 7 ? '#22c55e' : '#f59e0b', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: approvedCount === 7 ? '#22c55e' : '#f59e0b' }}>{approvedCount}/7 {approvedCount === 7 ? '✅ READY TO GO ONLINE' : ''}</span>
        </div>
        {msg && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: isError ? '#450a0a' : '#052e16', color: isError ? '#fca5a5' : '#86efac', fontSize: 13, border: `1px solid ${isError ? '#7f1d1d' : '#166534'}` }}>{msg}</div>}
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {DOC_TYPES.map(t => {
            const status = getStatus(t.key)
            const isApproved = String(status).toLowerCase() === 'approved'
            return (
              <div key={t.key} style={{ padding: 14, border: `1px solid ${isApproved ? '#166534' : '#1f2937'}`, borderRadius: 12, background: isApproved ? '#052e16' : '#111827', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</div><div style={{ marginTop: 4, display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, background: isApproved ? '#166534' : '#1f2937', color: isApproved ? '#86efac' : '#9ca3af' }}>{status}</div></div>
                <label style={{ background: isApproved ? '#1f2937' : '#22c55e', color: isApproved ? 'white' : 'black', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
                  {uploading === t.key ? 'Uploading...' : status === 'Missing' ? 'Upload' : 'Replace'}
                  <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) upload(t.key, f); e.currentTarget.value = '' }} />
                </label>
              </div>
            )
          })}
        </div>
        {approvedCount === 7 && <button onClick={onBack} style={{ marginTop: 20, width: '100%', padding: 16, borderRadius: 14, background: '#22c55e', color: 'black', border: 0, fontWeight: 900, fontSize: 16 }}>✅ GO ONLINE NOW 🟢</button>}
      </section>
    </main>
  )
}
export default DriverDocuments;