import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function PassengerProfile({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState({
    name: 'NAKAMPE TREVOR',
    lastName: 'MOKGALAKA',
    email: 'mokgalaka.nt@gmail.com',
    city: 'Polokwane',
    phone: '27******13',
    avatar: ''
  })
  const [msg, setMsg] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setProfile(p => ({
          ...p,
          name: data.first_name || p.name,
          lastName: data.last_name || p.lastName,
          email: user.email || p.email,
          city: data.city || 'Polokwane',
          avatar: data.avatar_url || ''
        }))
      }
    }
    load()
  }, [])

  async function uploadAvatar(e: any) {
    const file = e.target.files?.[0]
    if (!file) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const path = `${user.id}/passenger-${Date.now()}.jpg`
    await supabase.storage.from('profile-photos').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    setProfile(p => ({ ...p, avatar: data.publicUrl }))
    setMsg('Photo updated ✅')
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0F0F0F', color: 'white', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
      {/* HEADER - YOUR SCREENSHOT */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '18px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22 }}>←</button>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700, margin: 0, marginRight: 22 }}>Profile settings</h1>
      </div>

      {/* AVATAR - CIRCLE WITH PENCIL */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 28 }}>
        <div style={{ position: 'relative', width: 110, height: 110 }}>
          <img src={profile.avatar || 'https://i.pravatar.cc/300?u=trevor'} 
               style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', background: '#222' }} />
          <label style={{
            position: 'absolute', right: -2, bottom: 2, width: 34, height: 34,
            background: '#3A3A3A', borderRadius: '50%', display: 'grid', placeItems: 'center',
            fontSize: 16, cursor: 'pointer'
          }}>
            ✎
            <input type="file" hidden accept="image/*" onChange={uploadAvatar} />
          </label>
        </div>
      </div>

      {/* FIELDS - EXACT SCREENSHOT */}
      <div style={{ padding: '0 14px', display: 'grid', gap: 10 }}>
        {[
          { l: 'Name', v: profile.name },
          { l: 'Last name', v: profile.lastName },
          { l: 'Email', v: profile.email },
          { l: 'City', v: profile.city, arrow: true },
          { l: 'Phone number', v: profile.phone, arrow: true },
        ].map(i => (
          <div key={i.l} style={{ background: '#1C1C1E', borderRadius: 12, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12.5, color: '#8E8E93' }}>{i.l}</div>
              <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 1, color: i.l === 'Name' || i.l === 'Last name' ? '#5A5A5A' : 'white' }}>{i.v}</div>
            </div>
            {i.arrow && <span style={{ color: '#8E8E93', fontSize: 18 }}>›</span>}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center', color: '#AEAEB2', fontSize: 13 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.2px solid #AEAEB2', display: 'grid', placeItems: 'center', fontSize: 11 }}>i</div>
          Your full name and profile
        </div>
      </div>

      {/* LIME SAVE - YOUR SCREENSHOT */}
      <div style={{ padding: 14, marginTop: 18 }}>
        <button style={{ width: '100%', height: 54, background: '#D6FF00', color: 'black', border: 'none', borderRadius: 14, fontWeight: 800, fontSize: 17 }}>
          Save
        </button>
      </div>

      {msg && <div style={{ textAlign: 'center', marginTop: 10, color: '#D6FF00' }}>{msg}</div>}
    </div>
  )
}