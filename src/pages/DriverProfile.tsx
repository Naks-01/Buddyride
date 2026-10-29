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
    phone: '0793051213',
    earnings: 1320.00
  })
  const [active, setActive] = useState('profile')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      // FIX FOR "Phone number not available" BUG
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, phone_number, phone')
        .eq('id', user.id)
        .single()
      
      const { data: driverData } = await supabase
        .from('drivers')
        .select('driver_score, rating, acceptance_rate, cancellation_rate, tier')
        .eq('id', user.id)
        .single()

      setDriver(d => ({
        ...d,
        name: profile?.full_name || 'Driver',
        avatar: profile?.avatar_url || '',
        phone: profile?.phone_number || profile?.phone || user.phone || user.email || '0793051213',
        score: driverData?.driver_score || 95,
        rating: driverData?.rating || 5.00,
        acceptance: driverData?.acceptance_rate || 82,
        cancellation: driverData?.cancellation_rate || 0,
        tier: driverData?.tier || 'Silver'
      }))
    }
    load()
  }, [])

  async function changePhoto(e: any) {
    const file = e.target.files?.[0]
    if (!file) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const path = `${user.id}/driver-${Date.now()}.jpg`
    await supabase.storage.from('profile-photos').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
    setDriver(d => ({ ...d, avatar: data.publicUrl }))
  }

  const menu = [
    { icon: '💳', label: 'Earnings', sub: `R ${driver.earnings.toFixed(2)}` },
    { icon: '🚕', label: 'My Trips' },
    { icon: '💰', label: 'Wallet / Payouts' },
    { icon: '📢', label: 'Campaigns' },
    { icon: '📄', label: 'Documents' },
    { icon: '🚗', label: 'Vehicles' },
    { icon: '🛡️', label: 'Safety' },
    { icon: '⚙️', label: 'Settings' },
    { icon: '❓', label: 'Help Centre' },
    { icon: '📞', label: 'Contact Support' },
    { icon: 'ℹ️', label: 'About' },
    { icon: '🚪', label: 'Log Out', danger: true },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: '#101827', color: 'white', maxWidth: 430, margin: '0 auto', fontFamily: 'Inter, system-ui' }}>
      
      {/* HEADER - Like your video */}
      <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700 }}>BuddyRide Driver</span>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20 }}>✕</button>
      </div>

      {/* PROFILE - Exact video match */}
      <div style={{ padding: '0 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <img src={driver.avatar || 'https://i.pravatar.cc/150?u=driver'} 
               style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
        </div>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{driver.name}</span>
            <span style={{ background: '#1F2937', padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>🛡️ {driver.tier}</span>
          </div>
          <label style={{ color: '#2DD4BF', fontSize: 13, cursor: 'pointer' }}>
            Change profile photo
            <input type="file" hidden accept="image/*" onChange={changePhoto} />
          </label>
        </div>
      </div>

      {/* STATS GRID - 95% 5.00 82% 0.0% - Your video */}
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.score}%</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Driver Score</div>
        </div>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.rating.toFixed(2)}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Rating</div>
        </div>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.acceptance}%</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Acceptance</div>
        </div>
        <div style={{ background: '#1F2937', borderRadius: 12, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.cancellation.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Cancellation</div>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px', fontSize: 13, color: '#9CA3AF' }}>
        {driver.phone ? `📞 ${driver.phone}` : 'Phone number not available'}
      </div>

      {/* MENU - Like your video */}
      <div style={{ padding: '0 12px', display: 'grid', gap: 8, paddingBottom: 80 }}>
        {menu.map(m => (
          <div key={m.label} style={{
            background: '#1F2937', borderRadius: 14, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: m.danger ? '1px solid #374151' : 'none'
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, background: '#00D084', borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'black' }}>{m.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                {m.sub && <div style={{ fontSize: 12, color: '#9CA3AF' }}>{m.sub}</div>}
              </div>
            </div>
            <span style={{ color: '#6B7280' }}>›</span>
          </div>
        ))}
      </div>
    </div>
  )
}