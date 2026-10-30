import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

function errMsg(e: any) {
  return e?.message || e?.error_description || (typeof e === 'string' ? e : JSON.stringify(e))
}

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement('canvas')
      const max = 1280
      let w = img.width, h = img.height
      if (w > h) { if (w > max) { h *= max/w; w = max } }
      else { if (h > max) { w *= max/h; h = max } }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Invalid image')) }
    img.src = objectUrl
  })
}

export default function PassengerDocuments({ profile, onBack }: { profile: Profile, onBack: () => void }) {
  const [idNumber, setIdNumber] = useState((profile as any).id_number || '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [idDoc, setIdDoc] = useState<any>(null)
  const [selfieDoc, setSelfieDoc] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [uploadingType, setUploadingType] = useState<'id' | 'selfie' | 'avatar' | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    async function fetchAll() {
      // Profile
      const { data: prof } = await supabase.from('profiles').select('avatar_url, id_number, is_verified').eq('id', profile.id).single()
      if (prof) {
        if ((prof as any).id_number) setIdNumber((prof as any).id_number)
        if ((prof as any).avatar_url) {
          if (typeof (prof as any).avatar_url === 'string' && (prof as any).avatar_url.startsWith('http')) setAvatarUrl((prof as any).avatar_url)
          else if (typeof (prof as any).avatar_url === 'string') {
            const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl((prof as any).avatar_url)
            setAvatarUrl(urlData.publicUrl)
          }
        }
      }
      // Docs
      const { data: docs } = await supabase.from('driver_documents').select('*').eq('driver_id', profile.id).in('document_type', ['passenger_id', 'passenger_selfie'])
      if (docs) {
        setIdDoc(docs.find((d: any) => d.document_type === 'passenger_id') || null)
        setSelfieDoc(docs.find((d: any) => d.document_type === 'passenger_selfie') || null)
      }
    }
    fetchAll()
  }, [profile.id])

  async function saveIdNumber() {
    if (!idNumber.trim() || idNumber.trim().length < 8) {
      setMsg('❌ Enter valid ID number (13 digits SA ID or Passport)')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({ id_number: idNumber.trim() } as any).eq('id', profile.id)
      if (error) throw error
      setMsg('✅ ID number saved')
    } catch (e: any) { setMsg('❌ ' + errMsg(e)) } finally { setBusy(false) }
  }

  async function uploadDoc(file: File, type: 'passenger_id' | 'passenger_selfie') {
    if (type === 'passenger_id' && (!idNumber || idNumber.trim().length < 8)) {
      setMsg('❌ Save ID number first!')
      return
    }
    setUploadingType(type === 'passenger_id' ? 'id' : 'selfie')
    setMsg('')
    try {
      const blob = await compressImage(file)
      const path = `${profile.id}/${type}_${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('driver_documents').upsert({
        driver_id: profile.id,
        document_type: type,
        file_path: path,
        file_name: file.name,
        verification_status: 'pending',
      } as any, { onConflict: 'driver_id,document_type' })
      if (dbErr) throw dbErr
      setMsg(type === 'passenger_id' ? '✅ ID document uploaded - Pending approval' : '✅ Selfie uploaded - Pending approval')
      // Reload
      const { data } = await supabase.from('driver_documents').select('*').eq('driver_id', profile.id).eq('document_type', type).maybeSingle()
      if (type === 'passenger_id') setIdDoc(data)
      else setSelfieDoc(data)
    } catch (e: any) { setMsg('❌ ' + errMsg(e)) } finally { setUploadingType(null) }
  }

  async function uploadAvatar(file: File) {
    setUploadingType('avatar'); setMsg('')
    try {
      const blob = await compressImage(file)
      const path = `${profile.id}/profile_photo-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path)
      const publicUrl = urlData.publicUrl
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl } as any).eq('id', profile.id)
      if (dbErr) throw dbErr
      setAvatarUrl(publicUrl)
      // Also save as selfie doc for verification
      await supabase.from('driver_documents').upsert({
        driver_id: profile.id,
        document_type: 'passenger_selfie',
        file_path: path,
        file_name: file.name,
        verification_status: 'pending',
      } as any, { onConflict: 'driver_id,document_type' })
      setMsg('✅ Profile photo + Selfie uploaded')
    } catch (e: any) { setMsg('❌ ' + e.message) } finally { setUploadingType(null) }
  }

  const isVerified = (profile as any).is_verified === true
  const idStatus = idDoc?.verification_status || 'missing'
  const selfieStatus = selfieDoc?.verification_status || (avatarUrl ? 'pending' : 'missing')

  return (
    <main className="auth-page"><section className="auth-card" style={{ maxWidth: 440 }}>
      <button onClick={onBack} style={{background:'none',border:'none',textAlign:'left',padding:0,marginBottom:12}}>← Back</button>
      <h1>🛡️ Passenger KYC</h1>
      
      <div style={{ background: isVerified ? '#dcfce7' : (idStatus === 'pending' || selfieStatus === 'pending') ? '#fef3c7' : '#fee2e2', padding: 12, borderRadius: 12, marginBottom: 16, textAlign: 'center', fontWeight: 'bold' }}>
        {isVerified ? '✅ Verified - You can ride!' : (idStatus === 'pending' || selfieStatus === 'pending') ? '⏳ Pending Admin Approval' : '❌ Not Verified'}
      </div>

      {/* ID NUMBER */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <label style={{ fontWeight: 'bold', fontSize: 13 }}>Step 1: ID / Passport Number *</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="9001015800083" style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          <button onClick={saveIdNumber} disabled={busy} style={{ padding: '10px 14px', borderRadius: 8, background: 'black', color: 'white', border: 'none', fontWeight: 'bold' }}>Save</button>
        </div>
        {idDoc && <div style={{ fontSize: 11, marginTop: 6, color: '#666' }}>📄 {idDoc.verification_status} - {idDoc.file_name}</div>}
      </div>

      {/* ID UPLOAD */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 6 }}>Step 2: Upload ID Photo * {idStatus === 'approved' ? '✅' : idStatus === 'pending' ? '⏳' : ''}</div>
        <input type="file" accept="image/*" disabled={!!uploadingType} onChange={e => { const f=e.target.files?.[0]; if(f) uploadDoc(f, 'passenger_id') }} />
        {uploadingType === 'id' && <p style={{ fontSize: 12 }}>Uploading ID...</p>}
      </div>

      {/* SELFIE / PROFILE PHOTO */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 6, textAlign: 'left' }}>Step 3: Selfie / Profile Photo * {selfieStatus === 'approved' ? '✅' : selfieStatus === 'pending' ? '⏳' : ''}</div>
        {avatarUrl && <img src={avatarUrl} style={{width:90,height:90,borderRadius:45,objectFit:'cover',margin:'8px auto',display:'block', border: '2px solid #eee'}} alt="avatar" />}
        <input type="file" accept="image/*" capture="user" disabled={!!uploadingType} onChange={e => { const f=e.target.files?.[0]; if(f) uploadAvatar(f) }} style={{ width: '100%' }} />
        <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Front camera selfie - must match ID</div>
        {uploadingType === 'avatar' && <p style={{ fontSize: 12 }}>Compressing & Uploading...</p>}
        {selfieDoc && <div style={{ fontSize: 11, marginTop: 6, color: '#666' }}>🤳 {selfieDoc.verification_status}</div>}
      </div>

      {msg && <div className="notice" style={{ padding: 10, background: msg.includes('✅') ? '#dcfce7' : '#fee2e2', borderRadius: 8, fontSize: 13, textAlign: 'center' }}>{msg}</div>}
    </section></main>
  )
}