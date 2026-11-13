import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

export default function PassengerProfile({ onBack }: { onBack: () => void }) {
  const [profile, setProfile] = useState({
    name: '',
    lastName: '',
    email: '',
    city: 'Polokwane',
    phone: '',
    avatar: ''
  })
  const [originalFullName, setOriginalFullName] = useState('')
  const [originalPhone, setOriginalPhone] = useState('')
  const [originalCity, setOriginalCity] = useState('Polokwane')
  const [verificationStatus, setVerificationStatus] = useState('not_started')
  const [rejectionReason, setRejectionReason] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)

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
        const fullName = (data.full_name || '').trim()
        const phoneVal = (data as any).phone_number || (data as any).phone || ''
        const cityVal = (data as any).city || 'Polokwane'
        setOriginalFullName(fullName)
        setOriginalPhone(phoneVal)
        setOriginalCity(cityVal)
        setProfile({
          name: first,
          lastName: last,
          email: user.email || '',
          city: cityVal,
          phone: phoneVal,
          avatar: data.avatar_url || ''
        })
        setVerificationStatus((data as any).verification_status || 'not_started')
        setRejectionReason((data as any).verification_rejection_reason || '')
        setIsVerified((data as any).is_verified || ['verified','approved'].includes((data as any).verification_status))
      }
      setLoading(false)
    }
    load()
  }, [])

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (['heic','heif'].includes(ext)) { setMsg('Failed: iPhone HEIC not supported - screenshot the photo or pick JPG.'); e.target.value = ''; return }
    const guessedType = file.type || (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg')
    if (!guessedType.startsWith('image/')) { setMsg('Failed: Please choose an image file.'); e.target.value = ''; return }
    if (file.size > 8 * 1024 * 1024) { setMsg('Failed: Max 8MB'); e.target.value = ''; return }
    setMsg('Uploading...')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const compressed = await new Promise<Blob>((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          URL.revokeObjectURL(url)
          const c = document.createElement('canvas')
          const max = 800
          let w = img.width, h = img.height
          if (w > h) { if (w > max) { h *= max / w; w = max } }
          else { if (h > max) { w *= max / h; h = max } }
          c.width = w; c.height = h
          c.getContext('2d')!.drawImage(img, 0, 0, w, h)
          c.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.8)
        }
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image - try a JPEG/PNG screenshot')) }
        img.src = url
      })
      const path = user.id + '/passenger-' + Date.now() + '.jpg'
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
      const publicUrl = data.publicUrl
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: publicUrl, selfie_url: publicUrl } as any).eq('id', user.id)
      if (dbErr) throw dbErr
      setAvatarBroken(false)
      setProfile(p => ({ ...p, avatar: publicUrl }))
      setMsg('Photo updated ✅')
      setTimeout(() => setMsg(''), 3000)
    } catch (err: any) {
      setMsg('Failed: ' + err.message)
    }
    e.target.value = ''
  }

  function normalizeSAPhone(phone: string) {
    const cleaned = phone.replace(/[\s-()]/g, '')
    if (!cleaned) return ''
    if (/^\+27\d{9}$/.test(cleaned)) return cleaned
    if (/^27\d{9}$/.test(cleaned)) return '+' + cleaned
    if (/^0\d{9}$/.test(cleaned)) return '+27' + cleaned.slice(1)
    return cleaned
  }

  function isValidSAPhone(phone: string) {
    const cleaned = phone.replace(/[\s-()]/g, '')
    return cleaned === '' || /^0\d{9}$/.test(cleaned) || /^\+27\d{9}$/.test(cleaned) || /^27\d{9}$/.test(cleaned)
  }

  async function saveProfile() {
    setSaving(true)
    setMsg('Saving...')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')
      const { data: current } = await supabase.from('profiles').select('full_name, verification_status, is_verified').eq('id', user.id).single()
      const currentlyVerified = current?.is_verified || ['verified','approved'].includes(current?.verification_status || '')
      const fullName = (profile.name.trim() + ' ' + profile.lastName.trim()).trim()
      if (!fullName) throw new Error('Enter your name')
      if (currentlyVerified && fullName !== (current?.full_name || '').trim()) {
        throw new Error('Name locked after Admin verification ✅ Contact Admin on WhatsApp 064 101 8991 to change name. This will require re-verification.')
      }
      const cleanPhoneRaw = profile.phone.replace(/[\s-()]/g, '')
      if (cleanPhoneRaw && !isValidSAPhone(cleanPhoneRaw)) throw new Error('Enter a valid SA number: 0XX XXX XXXX or +27 XX XXX XXXX')
      const cleanPhone = normalizeSAPhone(profile.phone)
      const { error } = await supabase.from('profiles').update({
        full_name: fullName,
        city: profile.city.trim() || 'Polokwane',
        phone_number: cleanPhone || null,
        phone: cleanPhone || null,
      } as any).eq('id', user.id)
      if (error) throw error
      setOriginalFullName(fullName)
      setOriginalPhone(cleanPhone)
      setOriginalCity(profile.city.trim() || 'Polokwane')
      setProfile(p => ({ ...p, phone: cleanPhone }))
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
    return <div style={{ minHeight: '100dvh', background: '#F8F9FA', display: 'grid', placeItems: 'center', color: '#667085', fontFamily: 'Inter, system-ui' }}>Loading profile...</div>
  }

  const fields = [
    { key: 'name', l: 'Name', v: profile.name || 'Tap to add' },
    { key: 'lastName', l: 'Last name', v: profile.lastName || 'Tap to add' },
    { key: 'email', l: 'Email', v: profile.email, isReadOnly: true },
    { key: 'city', l: 'City', v: profile.city, arrow: true },
    { key: 'phone', l: 'Phone number', v: profile.phone || 'Add phone number', arrow: true },
  ] as { key: keyof typeof profile; l: string; v: string; isReadOnly?: boolean; arrow?: boolean }[]

  // FIXED: No pravatar, no email leak - show initial
  const hasAvatar = !avatarBroken && !!profile.avatar
  const initial = (profile.name?.[0] || profile.email?.[0] || 'B').toUpperCase()

  const badgeStyle = (status: string) => {
    if (status === 'approved' || status === 'verified' || isVerified) return { bg: BLUE, text: '✅ Verified Rider - Admin Approved' }
    if (status === 'pending_verification') return { bg: '#F59E0B', text: '⏳ Waiting for Admin Approval - WhatsApp 064 101 8991' }
    if (status === 'rejected') return { bg: '#dc2626', text: '❌ Rejected: ' + (rejectionReason || 'Contact Admin') }
    return { bg: BLUE_LIGHT, text: '⚠️ Not Verified - Complete Safety Check in Home', color: BLUE_DARK }
  }
  const badge = badgeStyle(verificationStatus) as any
  const currentFullName = (profile.name.trim() + ' ' + profile.lastName.trim()).trim()
  const hasChanges = currentFullName !== originalFullName || normalizeSAPhone(profile.phone) !== normalizeSAPhone(originalPhone) || (profile.city.trim() || 'Polokwane') !== originalCity

  return (
    <div style={{ minHeight: '100dvh', background: '#F8F9FA', color: '#182230', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '18px 16px', background: '#fff', borderBottom: '1px solid #EDF0F3' }}>
        <button onClick={onBack} style={{ background: '#F2F4F7', border: 'none', color: '#344054', fontSize: 22, cursor: 'pointer', width: 36, height: 36, borderRadius: '50%' }}>←</button>
        <h1 style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 800, margin: 0, marginRight: 22 }}>Profile settings</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8, marginBottom: 12, background: '#fff', padding: '20px 16px' }}>
        <div style={{ position: 'relative', width: 110, height: 110 }}>
          {hasAvatar ? (
            <img src={profile.avatar} alt="Profile" onError={() => setAvatarBroken(true)} style={{ width: 110, height: 110, borderRadius: '50%', objectFit: 'cover', background: BLUE_LIGHT, border: `2px solid ${BLUE}` }} />
          ) : (
            <div style={{ width: 110, height: 110, borderRadius: '50%', background: BLUE, color: 'white', display: 'grid', placeItems: 'center', fontSize: 48, fontWeight: 900, border: `2px solid ${BLUE}` }}>{initial}</div>
          )}
          <label style={{ position: 'absolute', right: -2, bottom: 2, width: 34, height: 34, background: BLUE, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 16, cursor: 'pointer', border: '2px solid #fff', color: 'white' }}>
            ✎
            <input type="file" hidden accept="image/*" onChange={uploadAvatar} />
          </label>
        </div>
        <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 99, background: badge.bg, color: badge.color || 'white', fontSize: 12, fontWeight: 800, textAlign: 'center', maxWidth: 300 }}>
          {badge.text}
        </div>
        {isVerified && <div style={{ marginTop: 6, fontSize: 11, color: '#98A2B3' }}>Name locked after verification — Only buddyride@outlook.com can change</div>}
      </div>

      <div style={{ padding: '0 14px', display: 'grid', gap: 10, marginTop: 12 }}>
        {fields.map(i => {
          const isEditing = editing === i.key
          const isPlaceholder = i.v.includes('Tap to add') || i.v.includes('Add phone')
          const isNameField = i.key === 'name' || i.key === 'lastName'
          const nameLocked = isVerified && isNameField
          return (
            <div key={i.l} onClick={() => { if (!i.isReadOnly && !nameLocked) setEditing(i.key as string) }} style={{ background: '#fff', borderRadius: 12, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: i.isReadOnly || nameLocked ? 'default' : 'pointer', opacity: nameLocked ? 0.6 : 1, border: '1px solid #EDF0F3' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: '#667085' }}>{i.l} {nameLocked && '🔒'}</div>
                {isEditing ? (
                  <input
                    autoFocus
                    value={profile[i.key] as string}
                    onChange={e => setProfile(p => ({ ...p, [i.key]: e.target.value }))}
                    onBlur={() => setEditing(null)}
                    onKeyDown={e => { if (e.key === 'Enter') setEditing(null) }}
                    onClick={e => e.stopPropagation()}
                    placeholder={i.l}
                    inputMode={i.key === 'phone' ? 'tel' : 'text'}
                    autoComplete={i.key === 'phone' ? 'tel' : i.key === 'email' ? 'email' : 'name'}
                    style={{ width: '100%', background: '#fff', border: `2px solid ${BLUE}`, borderRadius: 8, color: '#182230', fontSize: 15.5, fontWeight: 600, padding: '6px 8px', marginTop: 2, outline: 'none' }}
                  />
                ) : (
                  <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 1, color: isPlaceholder ? '#98A2B3' : '#182230' }}>{i.v}</div>
                )}
              </div>
              {i.arrow && <span style={{ color: '#98A2B3', fontSize: 18 }}>›</span>}
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center', color: '#667085', fontSize: 13 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.2px solid #667085', display: 'grid', placeItems: 'center', fontSize: 11 }}>i</div>
          Your full name and profile — 🔒 Locked after Admin verification
        </div>
      </div>

      <div style={{ padding: 14, marginTop: 18 }}>
        <button onClick={saveProfile} disabled={saving || !hasChanges} style={{ width: '100%', height: 54, background: (saving || !hasChanges) ? '#B2CCFF' : BLUE, color: 'white', border: 'none', borderRadius: 14, fontWeight: 800, fontSize: 17, cursor: (saving || !hasChanges) ? 'not-allowed' : 'pointer', opacity: (saving || !hasChanges) ? 0.7 : 1 }}>
          {saving ? 'Saving...' : hasChanges ? 'Save' : 'Saved ✅'}
        </button>
      </div>

      {msg && <div style={{ textAlign: 'center', marginTop: 10, color: msg.includes('Failed') ? '#B42318' : BLUE, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
    </div>
  )
}