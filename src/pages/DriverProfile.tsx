import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'
const BLUE_DARK = '#0052CC'
const SUPPORT_PHONE = '064 101 8991'
const SUPPORT_TEL = '0641018991'
const SUPPORT_WHATSAPP = 'https://wa.me/27641018991'
const TOTAL_EXPECTED = 15
const IDENTITY_TYPES = new Set(['profile_photo','selfie','sa_id','drivers_license'])

export default function DriverProfile({ onBack }: { onBack?: () => void }) {
  const [driver, setDriver] = useState({
    name: 'Driver',
    tier: 'New',
    avatar: '',
    score: 0,
    hasScore: false,
    rating: 0,
    hasRating: false,
    acceptance: 0,
    hasTrips: false,
    cancellation: 0,
    phone: '',
    email: '',
    earnings: 0,
    trips: 0,
    docsApproved: 0,
    docsTotal: TOTAL_EXPECTED,
    docsUploaded: 0,
    identityUploaded: 0,
    verificationStatus: 'not_started',
    isVerified: false,
    commission: 20,
    loading: true
  })
  const [showTrips, setShowTrips] = useState(false)
  const [showEarnings, setShowEarnings] = useState(false)
  const [showWallet, setShowWallet] = useState(false)
  const [showSafety, setShowSafety] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [trips, setTrips] = useState<any[]>([])
  const [totalFares, setTotalFares] = useState(0)
  const [platformFees, setPlatformFees] = useState(0)

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
        .select('full_name, avatar_url, phone_number, phone, rating, created_at, verification_status, is_verified')
        .eq('id', user.id)
        .single()

      let driverData: any = null
      try {
        const { data } = await supabase.from('driver_profiles').select('*').eq('user_id', user.id).maybeSingle()
        driverData = data
      } catch { driverData = null }

      let commission = 20
      let driverShare = 0.8
      try {
        const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'commission_percent').maybeSingle()
        if (settings?.value != null) {
          const c = Number(settings.value)
          if (!Number.isNaN(c)) { commission = c; driverShare = (100 - c) / 100 }
        }
      } catch {}

      // FIXED: No fake defaults - 0 trips = 0 acceptance, no rating, no score
      let acceptance = 0
      let hasTrips = false
      let rating = 0
      let hasRating = false
      let earnings = 0
      let totalFare = 0
      let fees = 0
      let cancellation = 0
      let tripsCount = 0
      try {
        const { data: rides } = await supabase.from('rides').select('id,status,fare,cancelled_by,pickup_address,dropoff_address,created_at').eq('driver_id', user.id).order('created_at', { ascending: false }).limit(100)
        if (rides && rides.length > 0) {
          hasTrips = true
          const acceptedStates = ['accepted','driver_assigned','driver_arriving','arrived','picked_up','in_progress','en_route','on_trip','driving_to_destination','completed','rated']
          const acceptedCount = rides.filter(r => acceptedStates.includes(String(r.status).toLowerCase())).length
          acceptance = Math.round((acceptedCount / rides.length) * 100)
          const driverCancelled = rides.filter(r => r.status === 'cancelled' && (r as any).cancelled_by === 'driver').length
          cancellation = Math.round((driverCancelled / rides.length) * 100 * 10) / 10
          const completed = rides.filter(r => r.status === 'completed' || r.status === 'rated')
          tripsCount = completed.length
          totalFare = completed.reduce((sum, r: any) => sum + Number(r.fare || 0), 0)
          fees = Math.round(totalFare * commission / 100)
          earnings = totalFare - fees
          setTrips(rides.slice(0, 20))
          setTotalFares(totalFare)
          setPlatformFees(fees)
          // Only use real rating if profile has one
          if (profile?.rating != null && Number(profile.rating) > 0) { rating = Number(profile.rating); hasRating = true }
          if (driverData?.rating != null && Number(driverData.rating) > 0) { rating = Number(driverData.rating); hasRating = true }
        }
      } catch {}

      let docsApproved = 0
      let docsUploaded = 0
      let identityUploaded = 0
      try {
        const { data: docs } = await supabase.from('driver_documents').select('doc_type,document_type,status,file_url,document_url').eq('driver_id', user.id)
        const latest = new Map<string, any>()
        for (const d of (docs || [])) {
          const key = normalizeKey(String((d as any).doc_type || (d as any).document_type || ''))
          if (!key) continue
          if (!latest.has(key)) latest.set(key, d)
        }
        for (const [key, d] of latest) {
          const hasFile = Boolean((d as any).file_url || (d as any).document_url)
          if (hasFile) docsUploaded++
          if (hasFile && IDENTITY_TYPES.has(key)) identityUploaded++
          if (String((d as any).status || '').toLowerCase() === 'approved') docsApproved++
        }
      } catch {}

      const rawPhone = profile?.phone_number || profile?.phone || (user as any).phone || ''
      const hasScore = driverData?.driver_score != null
      setDriver(d => ({
        ...d,
        name: profile?.full_name || user.email?.split('@')[0] || 'Driver',
        avatar: profile?.avatar_url || '',
        phone: rawPhone,
        email: user.email || '',
        score: hasScore ? Number(driverData.driver_score) : 0,
        hasScore,
        rating,
        hasRating,
        acceptance,
        hasTrips,
        cancellation,
        tier: driverData?.tier || (hasTrips ? 'Silver' : 'New'),
        earnings,
        trips: tripsCount,
        docsApproved,
        docsTotal: TOTAL_EXPECTED,
        docsUploaded,
        identityUploaded,
        verificationStatus: (profile as any)?.verification_status || 'not_started',
        isVerified: (profile as any)?.is_verified === true,
        commission,
        loading: false
      }))
    }
    void load()
  }, [])

  async function changePhoto(e: any) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (['heic','heif'].includes(ext)) { alert('iPhone HEIC not supported. Take a screenshot of the photo and upload that.'); e.target.value = ''; return }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file (JPEG, PNG, WebP).'); e.target.value = ''; return }
    if (file.size > 20 * 1024 * 1024) { alert('Image must be under 20MB.'); e.target.value = ''; return }
    // FIXED: Warn - changing photo sends it back for review
    if (!confirm('Change profile photo? It will be sent for admin re-review.')) { e.target.value = ''; return }
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
    if (!confirm('Log out?')) return
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const hasAvatar = !!driver.avatar
  const initial = (driver.name?.[0] || driver.email?.[0] || 'D').toUpperCase()
  const isIdentityPhase = driver.verificationStatus.toLowerCase() === 'identity_complete' || (driver.identityUploaded === 4 && !driver.isVerified && driver.docsUploaded < TOTAL_EXPECTED)
  const remaining = TOTAL_EXPECTED - driver.docsUploaded
  const canGoOnline = driver.isVerified && driver.docsApproved === TOTAL_EXPECTED

  const closeAllPanels = () => { setShowTrips(false); setShowEarnings(false); setShowWallet(false); setShowSafety(false); setShowSettings(false) }
  const togglePanel = (panel: 'trips' | 'earnings' | 'wallet' | 'safety' | 'settings') => {
    const isOpen = panel === 'trips' ? showTrips : panel === 'earnings' ? showEarnings : panel === 'wallet' ? showWallet : panel === 'safety' ? showSafety : showSettings
    closeAllPanels()
    if (isOpen) return
    if (panel === 'trips') setShowTrips(true)
    if (panel === 'earnings') setShowEarnings(true)
    if (panel === 'wallet') setShowWallet(true)
    if (panel === 'safety') setShowSafety(true)
    if (panel === 'settings') setShowSettings(true)
  }

  const menu = [
    { icon: '💳', label: 'Earnings', sub: `R ${driver.earnings.toFixed(2)} • ${driver.trips} trips`, action: () => togglePanel('earnings') },
    { icon: '🚕', label: 'My Trips', sub: `${driver.trips} completed trips`, action: () => togglePanel('trips') },
    { icon: '💰', label: 'Wallet / Payouts', sub: `Balance: R ${driver.earnings.toFixed(2)}`, action: () => togglePanel('wallet') },
    { icon: '📄', label: 'Documents', sub: `${driver.docsUploaded}/${driver.docsTotal} Uploaded • ${driver.docsApproved} Approved ${canGoOnline ? '✓' : ''}`, action: () => { window.location.href = '/driver/onboarding' } },
    { icon: '🚗', label: 'Vehicles', action: () => { window.location.href = '/driver/onboarding' } },
    { icon: '🛡️', label: 'Safety', action: () => togglePanel('safety') },
    { icon: '⚙️', label: 'Settings', action: () => togglePanel('settings') },
    { icon: '❓', label: 'Help Centre', sub: 'WhatsApp us', action: () => { window.open(SUPPORT_WHATSAPP, '_blank') } },
    // FIXED: Always dial Support, not driver's own number
    { icon: '📞', label: 'Contact Support', sub: SUPPORT_PHONE, action: () => { window.open(`tel:${SUPPORT_TEL}`, '_blank') } },
    { icon: '🚪', label: 'Log Out', danger: true, action: () => void handleLogout() },
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
      {isIdentityPhase && (
        <div onClick={() => { window.location.href = '/driver/onboarding' }} style={{ margin: '12px 12px 0', padding: '12px 14px', borderRadius: 12, background: BLUE_LIGHT, border: '1px solid #B2CCFF', cursor: 'pointer' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: BLUE_DARK }}>🎉 Identity Done! {driver.docsUploaded}/{TOTAL_EXPECTED} docs • {remaining} left to Go Online</div>
          <div style={{ height: 8, background: '#E5E9EF', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${(driver.docsUploaded/TOTAL_EXPECTED)*100}%`, height: '100%', background: BLUE, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 12, color: BLUE_DARK, marginTop: 6, fontWeight: 700 }}>Tap to finish remaining docs → Go Online unlocks</div>
        </div>
      )}
      {!canGoOnline && !isIdentityPhase && driver.docsUploaded > 0 && driver.docsUploaded < TOTAL_EXPECTED && (
        <div onClick={() => { window.location.href = '/driver/onboarding' }} style={{ margin: '12px 12px 0', padding: '12px 14px', borderRadius: 12, background: '#FFF7ED', border: '1px solid #FDBA74', cursor: 'pointer' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#C2410C' }}>⏳ {driver.docsUploaded}/{TOTAL_EXPECTED} docs • {remaining} left to Go Online</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>Tap to finish → Admin approval → Go Online</div>
        </div>
      )}
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
            <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={changePhoto} />
          </label>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{driver.email}</div>
        </div>
      </div>
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: BLUE }}>{driver.hasScore ? `${driver.score}%` : '—'}</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Driver Score</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.hasRating ? `${driver.rating.toFixed(2)} ⭐` : '—'}</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Rating</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{driver.hasTrips ? `${driver.acceptance}%` : '—'}</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Acceptance</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 12, textAlign: 'center', border: '1px solid #EDF0F3', boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: driver.cancellation > 5 ? '#ff4444' : BLUE }}>{driver.hasTrips ? `${driver.cancellation.toFixed(1)}%` : '—'}</div>
          <div style={{ fontSize: 11, color: '#667085' }}>Cancellation</div>
        </div>
      </div>
      <div style={{ padding: '0 16px 12px', fontSize: 13, display: 'flex', gap: 12, color: driver.phone ? '#182230' : '#ff4444' }}>
        <span>📞 {driver.phone || 'Phone number not available - Add in Supabase profiles'}</span>
      </div>

      {showEarnings && (
        <div style={{ margin: '0 12px 12px', background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #EDF0F3' }}>
          <b>Earnings</b>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8 }}>
            <div>Total fares: <b>R {totalFares.toFixed(2)}</b></div>
            <div>Platform fee ({driver.commission}%): <b>- R {platformFees.toFixed(2)}</b></div>
            <div>You keep: <b style={{ color: BLUE }}>R {driver.earnings.toFixed(2)}</b></div>
            <div>Completed trips: <b>{driver.trips}</b></div>
          </div>
          {!driver.hasTrips && <p style={{ fontSize: 13, color: '#667085' }}>No trips yet - complete your first trip to see earnings here.</p>}
        </div>
      )}

      {showWallet && (
        <div style={{ margin: '0 12px 12px', background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #EDF0F3' }}>
          <b>Wallet / Payouts</b>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8 }}>
            <div>Balance available: <b>R {driver.earnings.toFixed(2)}</b></div>
            <div style={{ color: '#667085' }}>Payouts are paid via EFT to your bank on file.</div>
          </div>
          <button onClick={() => window.open(SUPPORT_WHATSAPP, '_blank')} style={{ marginTop: 12, width: '100%', padding: 12, border: 0, borderRadius: 10, background: BLUE, color: '#fff', fontWeight: 800 }}>Request Payout on WhatsApp</button>
          <button onClick={() => { window.location.href = '/driver/onboarding' }} style={{ marginTop: 8, width: '100%', padding: 12, border: '1px solid #D0D5DD', borderRadius: 10, background: '#fff', fontWeight: 700 }}>Update Bank Details</button>
        </div>
      )}

      {showSafety && (
        <div style={{ margin: '0 12px 12px', background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #EDF0F3' }}>
          <b>Safety Centre</b>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8 }}>
            <div>Emergency (Police): <a href="tel:10111" style={{ color: BLUE, fontWeight: 800 }}>10111</a></div>
            <div>Ambulance: <a href="tel:10177" style={{ color: BLUE, fontWeight: 800 }}>10177</a></div>
            <div>BuddyRide Support: <a href={`tel:${SUPPORT_TEL}`} style={{ color: BLUE, fontWeight: 800 }}>{SUPPORT_PHONE}</a></div>
          </div>
          <button onClick={() => window.open(SUPPORT_WHATSAPP, '_blank')} style={{ marginTop: 12, width: '100%', padding: 12, border: 0, borderRadius: 10, background: BLUE, color: '#fff', fontWeight: 800 }}>WhatsApp Support</button>
        </div>
      )}

      {showSettings && (
        <div style={{ margin: '0 12px 12px', background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #EDF0F3' }}>
          <b>Settings</b>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.8 }}>
            <div>Notifications: ON (managed by your phone)</div>
            <div>Online status: Change in Driver Home</div>
            <div>Profile photo: Change above</div>
            <div>Documents: <button onClick={() => { window.location.href = '/driver/onboarding' }} style={{ background: 'none', border: 0, color: BLUE, fontWeight: 800, padding: 0, cursor: 'pointer' }}>Open Documents →</button></div>
          </div>
        </div>
      )}

      {showTrips && (
        <div style={{ margin: '0 12px 12px', background: '#fff', borderRadius: 14, padding: 12, border: '1px solid #EDF0F3' }}>
          <b>My Trips (last 20)</b>
          {trips.length === 0 && <p style={{ fontSize: 13, color: '#667085' }}>No trips yet.</p>}
          {trips.map((t: any) => (
            <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid #EDF0F3', fontSize: 13 }}>
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