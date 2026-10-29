import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    async function fetchProfile() {
      const { data } = await supabase.from('profiles').select('avatar_url').eq('id', profile.id).single()
      if (data?.avatar_url) {
        // FIX: handle string URL, not [object Object]
        if (typeof data.avatar_url === 'string' && data.avatar_url.startsWith('http')) setAvatarUrl(data.avatar_url)
        else if (typeof data.avatar_url === 'string') {
          const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(data.avatar_url)
          setAvatarUrl(urlData.publicUrl)
        }
      }
    }
    fetchProfile()
  }, [profile.id])

  async function uploadAvatar(file: File) {
    setBusy(true); setMsg('')
    try {
      const blob = await compressImage(file)
      const path = `${profile.id}/profile_photo-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr

      const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      // FIX: Save string URL, not object
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
      if (dbErr) throw dbErr

      setAvatarUrl(publicUrl)
      setMsg('Photo updated')
    } catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }

  return (
    <main className="auth-page"><section className="auth-card">
      <button onClick={onBack} style={{background:'none',border:'none',textAlign:'left',padding:0,marginBottom:12}}>← Back</button>
      <h1>Profile Photo</h1>
      {avatarUrl && <img src={avatarUrl} style={{width:90,height:90,borderRadius:45,objectFit:'cover',margin:'12px auto',display:'block'}} />}
      <input type="file" accept="image/*" capture="user" disabled={busy} onChange={e => { const f=e.target.files?.[0]; if(f) uploadAvatar(f) }} />
      {busy && <p>Compressing & Uploading...</p>}
      {msg && <div className="notice">{msg}</div>}
    </section></main>
  )
}