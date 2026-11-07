import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function PassengerProfile({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState({
    name: '',
    lastName: '',
    email: '',
    city: 'Polokwane',
    phone: '',
    avatar: ''
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (error) {
        setProfile(p => ({ ...p, email: user.email || '' }))
      } else if (data) {
        const full = (data.full_name || '').trim().split(' ')
        const first = full[0] || ''
        const last = full.slice(1).join(' ') || ''
        setProfile({
          name: first,
          lastName: last,
          email: user.email || '',
          city: (data as any).city || 'Polokwane',
          phone: (data as any).phone_number || (data as any).phone || '',
          avatar: data.avatar_url || ''
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg('Uploading...')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      if (file.size > 8 * 1024 * 1024) throw new Error('Max 8MB')
      const path = user.id + '/passenger-' + Date.now() + '.jpg'
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      const publicUrl = data.publicUrl
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl } as any).eq('id', user.id)
      if (dbErr) throw dbErr
      setProfile(p => ({ ...p, avatar: publicUrl }))
      setMsg('Photo updated ✅')
      setTimeout(() => setMsg(''), 3000)
    } catch (err: any) {
      setMsg('Failed: ' + err.message)
    }
    e.target.value = ''
  }

  async function saveProfile() {
    setSaving(true)
    setMsg('Saving...')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const fullName = (profile.name.trim() + ' ' + profile.lastName.trim()).trim()
      if (!fullName) throw new Error('Enter your name')
      const cleanPhone = profile.phone.replace(/\s/g, '')
      const { error } = await supabase.from('profiles').update({
        full_name: fullName,
        city: profile.city.trim() || 'Polokwane',
        phone_number: cleanPhone,
        phone: cleanPhone,
      } as any).eq('id', user.id)
      if (error) throw error
      setMsg('Saved ✅')
      setEditing(null)
      setTimeout(() => setMsg(''), 2000)
    } catch (err: any) {
      setMsg('Failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ minHeight: '100dvh', background: '#0F0F0F', display: 'grid', placeItems: 'center', color: 'white', fontFamily: 'Inter, system-ui' }}>Loading profile...</div>
  }

  const fields = [
    { key: 'name', l: 'Name', v: profile.name || 'Tap to add' },
    { key: 'lastName', l: 'Last name', v: profile.lastName || 'Tap to add' },
    { key: 'email', l: 'Email', v: profile.email, isReadOnly: true },
    { key: 'city', l: 'City', v: profile.city, arrow: true },
    { key: 'phone', l: 'Phone number', v: profile.phone || 'Add phone number', arrow: true },
  ] as { key: keyof typeof profile; l: string; v: string; isReadOnly?: boolean; arrow?: boolean }[]

  return (
    <div style={{ minHeight: '100dvh', background: '#0F0F0F', color: 'white', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '18px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700, margin: 0, marginRight: 22 }}>Profile settings</h1>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8, marginBottom: 28 }}>
        <div style={{ position: 'relative', width: 110, height: 110 }}>
          <img
            src={profile.avatar || 'https://i.pravatar.cc/300?u=' + profile.email}
            alt="Profile"
            style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', background: '#222', border: '2px solid #1C1C1E' }}
          />
          <label style={{ position: 'absolute', right: -2, bottom: 2, width: 34, height: 34, background: '#3A3A3A', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 16, cursor: 'pointer', border: '2px solid #0F0F0F' }}>
            ✎
            <input type="file" hidden accept="image/*" capture="user" onChange={uploadAvatar} />
          </label>
        </div>
      </div>

      <div style={{ padding: '0 14px', display: 'grid', gap: 10 }}>
        {fields.map(i => {
          const isEditing = editing === i.key
          const isPlaceholder = i.v.includes('Tap to add') || i.v.includes('Add phone')
          return (
            <div key={i.l} onClick={() => { if (!i.isReadOnly) setEditing(i.key as string) }} style={{ background: '#1C1C1E', borderRadius: 12, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: i.isReadOnly ? 'default' : 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: '#8E8E93' }}>{i.l}</div>
                {isEditing ? (
                  <input
                    autoFocus
                    value={profile[i.key] as string}
                    onChange={e => setProfile(p => ({ ...p, [i.key]: e.target.value }))}
                    onBlur={() => setEditing(null)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditing(null) }}
                    onClick={e => e.stopPropagation()}
                    placeholder={i.l}
                    style={{ width: '100%', background: '#2C2C2E', border: '1px solid #D6FF00', borderRadius: 8, color: 'white', fontSize: 15.5, fontWeight: 600, padding: '6px 8px', marginTop: 2, outline: 'none' }}
                  />
                ) : (
                  <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 1, color: isPlaceholder ? '#5A5A5A' : 'white' }}>{i.v}</div>
                )}
              </div>
              {i.arrow && <span style={{ color: '#8E8E93', fontSize: 18 }}>›</span>}
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center', color: '#AEAEB2', fontSize: 13 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.2px solid #AEAEB2', display: 'grid', placeItems: 'center', fontSize: 11 }}>i</div>
          Your full name and profile
        </div>
      </div>

      <div style={{ padding: 14, marginTop: 18 }}>
        <button onClick={saveProfile} disabled={saving} style={{ width: '100%', height: 54, background: saving ? '#8a9a00' : '#D6FF00', color: 'black', border: 'none', borderRadius: 14, fontWeight: 800, fontSize: 17, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {msg && <div style={{ textAlign: 'center', marginTop: 10, color: msg.includes('Failed') ? '#ff6b6b' : '#D6FF00', fontSize: 13, fontWeight: 600 }}>{msg}</div>}
    </div>
  )
}