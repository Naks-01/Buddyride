import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'
const BLUE_DARK = '#0052CC'
const SUPPORT_PHONE = '064 101 8991'
const SUPPORT_TEL = '0641018991'
const SUPPORT_WHATSAPP = 'https://wa.me/27641018991'

export default function DriverProfile({ onBack }: { onBack?: () => void }) {
  const [driver, setDriver] = useState({
    name: 'Driver',
    tier: 'Silver',
    avatar: '',
    score: 95,
    rating: 5.00,
    acceptance: 82,
    cancellation: 0.0,
    phone: '',
    email: '',
    earnings: 0,
    trips: 0,
    docsApproved: 0,
    docsTotal: 0,
    loading: true
  })
  const [showTrips, setShowTrips] = useState(false)
  const [trips, setTrips] = useState<any[]>([])

  const normalizeKey = (raw: string) => {
    const k = (raw || '').toLowerCase().trim()
    if (k === 'south_african_id' || k === 'id' || k === 'sa_id_document' || k === 'sa-id') return 'sa_id'
    return k
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setDriver(d => ({ ...d, loading: false })); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, phone_number, phone, rating, created_at')
        .eq('id', user.id)
        .single()

      // FIXED: Table is driver_profiles, not drivers
      let driverData: any = null
      try {
        const { data } = await supabase.from('driver_profiles').select('*').eq('user_id', user.id).maybeSingle()
        driverData = data
      } catch { driverData = null }

      let driverShare = 0.8
      try {
        const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'commission_percent').maybeSingle()
        if (settings?.value != null) {
          const c = Number(settings.value)
          if (!Number.isNaN(c)) driverShare = (100 - c) / 100
        }
      } catch {}

      let acceptance = 82
      let rating = profile?.rating || 5.00
      let earnings = 0
      let cancellation = 0
      let tripsCount = 0
      try {
        const { data: rides } = await supabase.from('rides').select('status,fare,cancelled_by,pickup_address,dropoff_address,created_at').eq('driver_id', user.id).order('created_at', { ascending: false }).limit(100)
        if (rides && rides.length > 0) {
          const acceptedStates = ['accepted','driver_assigned','driver_arriving','arrived','picked_up','in_progress','en_route','on_trip','driving_to_destination','completed','rated']
          const acceptedCount = rides.filter(r => acceptedStates.includes(String(r.status).toLowerCase())).length
          acceptance = Math.round((acceptedCount / rides.length) * 100)
          const driverCancelled = rides.filter(r => r.status === 'cancelled' && (r as any).cancelled_by === 'driver').length
          cancellation = Math.round((driverCancelled / rides.length) * 100 * 10) / 10
          // FIXED: No driver_earnings column - use fare * share
          earnings = rides.reduce((sum, r: any) => {
            if (r.status !== 'completed' && r.status !== 'rated') return sum
            return sum + Number(r.fare ? r.fare * driverShare : 0)
          }, 0)
          tripsCount = rides.filter(r => r.status === 'completed' || r.status === 'rated').length
          setTrips(rides.slice(0, 20))
        }
      } catch {}

      let docsApproved = 0
      let docsTotal = 0
      try {
        const { data: docs } = await supabase.from('driver_documents').select('doc_type,document_type,status').eq('driver_id', user.id)
        const approvedSet = new Set<string>()
        const totalSet = new Set<string>()
        for (const d of (docs || [])) {
          const key = normalizeKey(String((d as any).doc_type || (d as any).document_type || ''))
          if (!key) continue
          totalSet.add(key)
          if (String((d as any).status || '').toLowerCase() === 'approved') approvedSet.add(key)
        }
        docsApproved = approvedSet.size
        docsTotal = totalSet.size
      } catch {}

      const rawPhone = profile?.phone_number || profile?.phone || (user as any).phone || ''
      setDriver(d => ({
        ...d,
        name: profile?.full_name || user.email?.split('@')[0] || 'Driver',
        avatar: profile?.avatar_url || '',
        phone: rawPhone,
        email: user.email || '',
        score: driverData?.driver_score || 95,
        rating: driverData?.rating ?? rating,
        acceptance: driverData?.acceptance_rate ?? acceptance,
        cancellation: driverData?.cancellation_rate ?? cancellation,
        tier: driverData?.tier || 'Silver',
        earnings,
        trips: tripsCount,
        docsApproved,
        docsTotal,
        loading: false
      }))
    }
    load()
  }, [])

  async function changePhoto(e: any) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Please choose an image file (JPEG, PNG, WebP).'); e.target.value = ''; return }
    if (file.size > 20 * 1024 * 1024) { alert('Image must be under 20MB.'); e.target.value = ''; return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const compressed = await new Promise<Blob>((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const c = document.createElement('canvas')
        const max = 800
        let w = img.width, h = img.height
        if (w > h) { if (w > max) { h *= max/w; w = max } }
        else { if (h > max) { w *= max/h; h = max } }
        c.width = w; c.height = h
        c.getContext('2d')!.drawImage(img, 0, 0, w, h)
        c.toBlob(b => b ? resolve(b) : reject(new Error('compress')), 'image/jpeg', 0.8)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')) }
      img.src = url
    }).catch(() => null)
    if (!compressed) { alert('Could not read this image. Try a JPEG/PNG.'); e.target.value = ''; return }

    const path = `${user.id}/profile_photo/${Date.now()}.jpg`
    const { error } = await supabase.storage.from('profile-photos').upload(path, compressed, { upsert: false, contentType: 'image/jpeg' })
    if (error) { alert('Upload failed: ' + error.message); return }
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    const { error: profErr } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    if (profErr) { alert('Photo uploaded but profile could not be saved: ' + profErr.message); return }

    try {
      const payload: any = {
        driver_id: user.id,
        doc_type: 'profile_photo',
        document_type: 'profile_photo',
        file_url: `profile-photos:${path}`,
        document_url: `profile-photos:${path}`,
        file_path: path,
        storage_path: path,
        status: 'PENDING',
      }
      const { data: existing } = await supabase.from('driver_documents').select('id').eq('driver_id', user.id).or(`doc_type.eq.profile_photo,document_type.eq.profile_photo`).maybeSingle()
      if (existing) {
        const { error: updErr } = await supabase.from('driver_documents').update(payload).eq('id', existing.id)
        if (updErr) console.warn('profile_photo doc update failed', updErr.message)
      } else {
        const { error: insErr } = await supabase.from('driver_documents').insert(payload)
        if (insErr) console.warn('profile_photo doc insert failed', insErr.message)
      }
    } catch (err) { console.warn('profile_photo doc sync failed', err) }

    setDriver(d => ({ ...d, avatar: data.publicUrl }))
    e.target.value = ''
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const isPhone = /^\+?\d[\d\s-]{6,}$/.test(driver.phone)
  const hasAvatar = !!driver.avatar
  const initial = (driver.name?.[0] || driver.email?.[0] || 'D').toUpperCase()

  const menu = [
    { icon: '💳', label: 'Earnings', sub: `R ${driver.earnings.toFixed(2)} • ${driver.trips} trips`, action: () => alert(`Earnings: R${driver.earnings.toFixed(2)}\nTrips: ${driver.trips}\nYou keep 80% of every fare.`) },
    { icon: '🚕', label: 'My Trips', sub: `${driver.trips} completed trips`, action: () => setShowTrips(v => !v) },
    { icon: '💰', label: 'Wallet / Payouts', sub: `Balance: R ${driver.earnings.toFixed(2)}`, action: () => alert(`Wallet: R${driver.earnings.toFixed(2)} available.\nPayouts via EFT - WhatsApp ${SUPPORT_PHONE} to request payout.`) },
    { icon: '📄', label: 'Documents', sub: `${driver.docsApproved}/${driver.docsTotal || '—'} Approved ${driver.docsTotal > 0 && driver.docsApproved === driver.docsTotal ? '✓' : ''}`, action: () => window.location.href = '/driver/onboarding' },
    { icon: '🚗', label: 'Vehicles', action: () => window.location.href = '/driver/onboarding' },
    { icon: '🛡️', label: 'Safety', action: () => alert('Safety Centre:\n• Share trip with family\n• Emergency: 10111\n• BuddyRide Support: ' + SUPPORT_PHONE) },
    { icon: '⚙️', label: 'Settings', action: () => alert('Settings:\n• Notifications: ON\n• Online status in Driver Home\n• Change photo above') },
    { icon: '❓', label: 'Help Centre', sub: 'WhatsApp us', action: () => window.open(SUPPORT_WHATSAPP, '_blank') },
    { icon: '📞', label: 'Contact Support', sub: isPhone ? driver.phone : SUPPORT_PHONE, action: () => window.open(`tel:${isPhone ? driver.phone : SUPPORT_TEL}`, '_blank') },
    { icon: '🚪', label: 'Log Out', danger: true, action: handleLogout },
  ]

  if (driver.loading) {
    return <div style={{ minHeight: '100dvh', background: '#F8F9FA', display: 'grid', placeItems: 'center', color: '#667085' }}>Loading profile...</div>
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F8F9FA', color: '#182230', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
      <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderBottom: '1px solid #EDF0F3' }}>
        <span style={{ fontWeight: 800 }}>BuddyRide Driver</span>
        <button onClick={onBack} style={{ background: '#F2F4F7', border: 'none', color: '#344054', fontSize: 18, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ padding: '20px 16px', display: 'flex', gap: 12, alignItems: 'center', background: '#fff' }}>
        {hasAvatar ? (
          <img src={driver.avatar} alt="Driver" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${BLUE}` }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: BLUE, color: 'white', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 900, border: `2px solid ${BLUE}` }}>{initial}</div>
        )}
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{driver.name}</span>
            <span style={{ background: BLUE_LIGHT, padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 800, color: BLUE }}>🛡️ {driver.tier}</span>
          </div>
          <label style={{ color: BLUE, fontSize: 13, cursor: 'pointer', display: 'flex', gap: 4, fontWeight: 700 }}>
            📸 Change profile photo
            <input type="file" hidden accept="image/*" onChange={changePhoto} />
          </label>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{driver.email}</div>
        </div>
      </div>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: BLUE }}>{driver.score}%</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Driver Score</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.rating.toFixed(2)} ⭐</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Rating</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.acceptance}%</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Acceptance</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: driver.cancellation > 5 ? '#ff4444' : BLUE }}>{driver.cancellation.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Cancellation</div>
        </div>
      </div>
      <div style={{ padding: '0 16px 12px', fontSize: 13, display: 'flex', gap: 12, color: driver.phone ? '#182230' : '#ff4444' }}>
        <span>📞 {driver.phone || 'Phone number not available - Add in Supabase profiles'}</span>
      </div>
      {showTrips && (
        <div style={{ margin: '0 12px 12px', background: '#fff', borderRadius: 14, padding: 12, border: '1px solid #EDF0F3' }}>
          <b>My Trips (last 20)</b>
          {trips.length === 0 && <p style={{ fontSize: 13, color: '#667085' }}>No trips yet.</p>}
          {trips.map((t: any) => (
            <div key={t.id || t.created_at} style={{ padding: '10px 0', borderBottom: '1px solid #EDF0F3', fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{t.pickup_address} → {t.dropoff_address}</div>
              <div style={{ color: '#667085' }}>{t.status} • R{Number(t.fare || 0).toFixed(2)} • {new Date(t.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '0 12px', display: 'grid', gap: 8, paddingBottom: 80 }}>
        {menu.map(m => (
          <button key={m.label} onClick={m.action} style={{
            background: '#fff', borderRadius: 14, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: m.danger ? '1px solid #FECDCA' : '1px solid #EDF0F3',
            width: '100%', cursor: 'pointer', textAlign: 'left', boxShadow: '0 5px 18px rgba(20,33,50,0.045)'
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, background: m.danger ? '#FEF3F2' : BLUE_LIGHT, borderRadius: '50%', display: 'grid', placeItems: 'center', color: m.danger ? '#B42318' : BLUE }}>{m.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: m.danger ? '#B42318' : '#182230' }}>{m.label}</div>
                {m.sub && <div style={{ fontSize: 12, color: '#667085' }}>{m.sub}</div>}
              </div>
            </div>
            <span style={{ color: '#98A2B3' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}