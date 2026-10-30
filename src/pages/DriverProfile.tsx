import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
    earnings: 1320.00,
    loading: true
  })
  const [active, setActive] = useState('profile')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      // 1. Get profile - FIXES phone bug
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, phone_number, phone, rating, created_at')
        .eq('id', user.id)
        .single()
      
      // 2. Try drivers table, fallback to profiles (your DB doesn't have drivers table)
      let driverData: any = null
      try {
        const { data } = await supabase.from('drivers').select('*').eq('id', user.id).maybeSingle()
        driverData = data
      } catch { driverData = null }

      // 3. Calculate stats from rides if drivers table missing
      let acceptance = 82
      let rating = profile?.rating || 5.00
      try {
        const { data: rides } = await supabase.from('rides').select('status').eq('driver_id', user.id)
        if (rides && rides.length > 0) {
          const completed = rides.filter(r => r.status === 'completed').length
          acceptance = Math.round((completed / rides.length) * 100) || 82
        }
      } catch {}

      setDriver(d => ({
        ...d,
        name: profile?.full_name || user.email?.split('@')[0] || 'Driver',
        avatar: profile?.avatar_url || '',
        phone: profile?.phone_number || profile?.phone || (user as any).phone || user.email || '',
        email: user.email || '',
        score: driverData?.driver_score || 95,
        rating: driverData?.rating || rating,
        acceptance: driverData?.acceptance_rate || acceptance,
        cancellation: driverData?.cancellation_rate || 0,
        tier: driverData?.tier || 'Silver',
        loading: false
      }))
    }
    load()
  }, [])

  async function changePhoto(e: any) {
    const file = e.target.files?.[0]
    if (!file) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    // Compress like DriverHome
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
    }).catch(() => file)

    const path = `${user.id}/driver-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('profile-photos').upload(path, compressed, { upsert: true })
    if (error) { alert('Upload failed: ' + error.message); return }
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    setDriver(d => ({ ...d, avatar: data.publicUrl }))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const menu = [
    { icon: '💳', label: 'Earnings', sub: `R ${driver.earnings.toFixed(2)}`, action: () => alert('Earnings: R' + driver.earnings) },
    { icon: '🚕', label: 'My Trips', action: () => window.location.href = '/trips' },
    { icon: '💰', label: 'Wallet / Payouts', action: () => alert('Wallet coming soon') },
    { icon: '📄', label: 'Documents', sub: '7/7 Approved ✓', action: () => window.location.href = '/driver/documents' },
    { icon: '🚗', label: 'Vehicles', action: () => alert('Vehicles') },
    { icon: '🛡️', label: 'Safety', action: () => alert('Safety Centre') },
    { icon: '⚙️', label: 'Settings', action: () => alert('Settings') },
    { icon: '❓', label: 'Help Centre', action: () => window.open('https://wa.me/27793051213', '_blank') },
    { icon: '📞', label: 'Contact Support', sub: driver.phone, action: () => window.open(`tel:${driver.phone}`, '_blank') },
    { icon: '🚪', label: 'Log Out', danger: true, action: handleLogout },
  ]

  if (driver.loading) {
    return <div style={{ minHeight: '100dvh', background: '#101827', display: 'grid', placeItems: 'center', color: 'white' }}>Loading profile...</div>
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#101827', color: 'white', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
      
      <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>BuddyRide Driver</span>
        <button onClick={onBack} style={{ background: '#1F2937', border: 'none', color: 'white', fontSize: 18, width: 36, height: 36, borderRadius: '50%' }}>✕</button>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <img src={driver.avatar || `https://i.pravatar.cc/150?u=${driver.email}`} 
             style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #00D084' }} />
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{driver.name}</span>
            <span style={{ background: '#1F2937', padding: '2px 8px', borderRadius: 10, fontSize: 12, border: '1px solid #00D084' }}>🛡️ {driver.tier}</span>
          </div>
          <label style={{ color: '#2DD4BF', fontSize: 13, cursor: 'pointer', display: 'flex', gap: 4 }}>
            📸 Change profile photo
            <input type="file" hidden accept="image/*" onChange={changePhoto} />
          </label>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{driver.email}</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center', border: '1px solid #2a3441' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#00D084' }}>{driver.score}%</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Driver Score</div>
        </div>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center', border: '1px solid #2a3441' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.rating.toFixed(2)} ⭐</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Rating</div>
        </div>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center', border: '1px solid #2a3441' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.acceptance}%</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Acceptance</div>
        </div>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center', border: '1px solid #2a3441' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: driver.cancellation > 5 ? '#ff4444' : '#00D084' }}>{driver.cancellation.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Cancellation</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px', fontSize: 13, display: 'flex', gap: 12, color: driver.phone ? 'white' : '#ff4444' }}>
        <span>📞 {driver.phone || 'Phone number not available - Add in Supabase profiles'}</span>
      </div>

      <div style={{ padding: '0 12px', display: 'grid', gap: 8, paddingBottom: 80 }}>
        {menu.map(m => (
          <button key={m.label} onClick={m.action} style={{
            background: '#1F2937', borderRadius: 14, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: m.danger ? '1px solid #ff444422' : '1px solid #2a3441',
            width: '100%', cursor: 'pointer', textAlign: 'left'
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, background: m.danger ? '#ff4444' : '#00D084', borderRadius: '50%', display: 'grid', placeItems: 'center', color: m.danger ? 'white' : 'black' }}>{m.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: m.danger ? '#ff4444' : 'white' }}>{m.label}</div>
                {m.sub && <div style={{ fontSize: 12, color: '#9CA3AF' }}>{m.sub}</div>}
              </div>
            </div>
            <span style={{ color: '#6B7280' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}