import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { uploadProfilePhoto } from '../lib/profilePhotos'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

type View = 'main' | 'profile' | 'earnings' | 'trips' | 'wallet' | 'campaigns' | 'documents' | 'vehicles' | 'safety' | 'settings' | 'navigation' | 'help' | 'about'

interface Props {
  profile?: any
  onSignOut?: () => void
  isOpen?: boolean
  onClose?: () => void
  userName?: string
  phone?: string
  theme?: 'dark' | 'light'
  onThemeChange?: (theme: 'dark' | 'light') => void
}

const cardBackground = '#fff'
const muted = '#667085'
type DriverRide = { id: string; pickup_address: string | null; dropoff_address: string | null; fare: number | null; created_at: string | null; started_at: string | null; ended_at: string | null; status: string | null }
type DriverStatRide = { status: string | null; driver_rating: number | string | null; cancelled_by: string | null }

export function NavigationMenu({ profile, onSignOut, isOpen: propIsOpen, onClose, userName: propName, phone: propPhone, theme: propTheme, onThemeChange }: Props) {
  const [openStat, setOpenStat] = useState<'score' | 'rating' | 'accept' | 'cancel' | null>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const [view, setView] = useState<View>('main')
  const [defaultNavigation, setDefaultNavigation] = useState(() => { try { return localStorage.getItem('buddy_driver_navigation') || 'BuddyRide Navigation' } catch { return 'BuddyRide Navigation' } })
  const theme = propTheme === 'dark' ? 'Dark' : 'Light'
  const [rides, setRides] = useState<DriverRide[]>([])
  const [ridesLoading, setRidesLoading] = useState(false)
  const [ridesError, setRidesError] = useState('')
  const [driverStatRides, setDriverStatRides] = useState<DriverStatRide[]>([])
  const [driverStatRating, setDriverStatRating] = useState<number | null>(null)
  const [driverStatsLoading, setDriverStatsLoading] = useState(false)
  const [driverStatsError, setDriverStatsError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [photoError, setPhotoError] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [shareMsg, setShareMsg] = useState('')
  const [profileName, setProfileName] = useState(profile?.full_name || '')
  const [profilePhone, setProfilePhone] = useState(profile?.phone || profile?.phone_number || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')

  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : internalOpen
  const userName = profileName || propName || profile?.full_name || 'Driver'
  const phone = profilePhone || propPhone || profile?.phone || profile?.phone_number || 'Phone number not available'
  const balance = 0
  const totalTrips = driverStatRides.length
  const acceptedTrips = driverStatRides.filter((trip) => ['completed', 'accepted', 'in_progress'].includes(trip.status || '')).length
  const cancelledByDriver = driverStatRides.filter((trip) => trip.status === 'cancelled_by_driver' || (trip.status === 'cancelled' && trip.cancelled_by === 'driver')).length
  const hasRating = driverStatRating !== null || profile?.rating != null
  const ratingNum = driverStatRating !== null ? driverStatRating : (profile?.rating != null ? Number(profile.rating) : null)
  const rating = ratingNum != null ? ratingNum.toFixed(2) : 'No rating yet'
  const acceptanceRate = totalTrips > 0 ? Math.round((acceptedTrips / totalTrips) * 100) : null
  const cancellationRate = totalTrips > 0 ? ((cancelledByDriver / totalTrips) * 100).toFixed(1) : null
  const driverScore = totalTrips > 0 && ratingNum != null && acceptanceRate != null && cancellationRate != null ? Math.round((ratingNum * 20 * 0.4) + (acceptanceRate * 0.3) + ((100 - Number(cancellationRate)) * 0.3)) : null
  const completedRides = rides.filter((ride) => ['completed', 'rated'].includes(ride.status || ''))
  // FIX: Bundle model - driver keeps 100% of fare, no driver_earnings column - was selecting missing column and crashing
  const earningsFor = (ride: DriverRide) => Number(ride.fare ?? 0)
  const totalEarned = completedRides.reduce((total, ride) => total + earningsFor(ride), 0)
  const today = new Date()
  const todayEarnings = completedRides.filter((ride) => { const d = new Date(ride.ended_at || ride.created_at || ''); return !Number.isNaN(d.getTime()) && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate() }).reduce((total, ride) => total + earningsFor(ride), 0)
  const weekStart = new Date(today); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weeklyEarnings = completedRides.filter((ride) => { const d = new Date(ride.ended_at || ride.created_at || ''); return !Number.isNaN(d.getTime()) && d >= weekStart }).reduce((total, ride) => total + earningsFor(ride), 0)
  const tier = profile?.tier || (driverScore == null ? 'New Driver' : driverScore >= 90 ? 'Gold' : driverScore >= 75 ? 'Silver' : 'Bronze')
  const vehicleLabel = [profile?.vehicle_make, profile?.vehicle_model, profile?.vehicle_year].filter(Boolean).join(' ') || 'No vehicle on file'
  const vehiclePlate = profile?.vehicle_plate || profile?.plate_number || profile?.registration || ''

  useEffect(() => { setProfileName(profile?.full_name || ''); setProfilePhone(profile?.phone || profile?.phone_number || '') }, [profile?.id, profile?.full_name, profile?.phone, profile?.phone_number])
  useEffect(() => { if (profile?.avatar_url) setAvatarUrl(profile.avatar_url) }, [profile?.avatar_url])

  async function saveDriverProfile() {
    if (!profile?.id) return
    if (!profileName.trim()) { setProfileMessage('Enter your full name.'); return }
    setProfileSaving(true); setProfileMessage('')
    try {
      // FIX: Don't wipe phone if blank - was saving empty string
      const patch: any = { full_name: profileName.trim() }
      if (profilePhone.trim()) { patch.phone = profilePhone.trim(); patch.phone_number = profilePhone.trim() }
      const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
      if (error) throw error
      setProfileMessage('Profile details saved.')
    } catch (error) { setProfileMessage(error instanceof Error ? error.message : String(error)) } finally { setProfileSaving(false) }
  }

  const handleProfilePhotoUpload = async (file?: File) => {
    if (!file || !profile?.id) return
    setPhotoUploading(true); setPhotoError('')
    try { setAvatarUrl(await uploadProfilePhoto(profile.id, file)) } catch (e: unknown) { setPhotoError(`Could not update profile photo: ${e instanceof Error ? e.message : String(e)}`) } finally { setPhotoUploading(false) }
  }

  const close = () => { if (onClose) onClose(); else setInternalOpen(false); setView('main') }
  const open = () => { setView('main'); setInternalOpen(true) }

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.body.style.overflow = 'hidden'; document.addEventListener('keydown', h)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', h) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !profile?.id) return
    let active = true; setDriverStatsLoading(true); setDriverStatsError('')
    void Promise.all([
      supabase.from('rides').select('status,driver_rating,cancelled_by').eq('driver_id', profile.id).limit(500),
      supabase.from('profiles').select('rating').eq('id', profile.id).single(),
    ]).then(([r, p]) => {
      if (!active) return
      if (r.error) { setDriverStatsError(`Could not load trip stats: ${r.error.message}`); setDriverStatRides([]) } else setDriverStatRides((r.data || []) as DriverStatRide[])
      if (p.error) { setDriverStatsError((c) => c ? `${c} Could not load profile rating: ${p.error.message}` : `Could not load profile rating: ${p.error.message}`); setDriverStatRating(null) } else { const v = (p.data as any)?.rating; setDriverStatRating(v == null ? null : Number(v)) }
      setDriverStatsLoading(false)
    }).catch((e: unknown) => { if (!active) return; setDriverStatsError(`Could not load driver stats: ${e instanceof Error ? e.message : String(e)}`); setDriverStatsLoading(false) })
    return () => { active = false }
  }, [isOpen, profile?.id])

  useEffect(() => {
    if (!isOpen || !profile?.id || !['trips', 'earnings'].includes(view)) return
    let active = true; setRidesLoading(true); setRidesError('')
    // FIX: Removed driver_earnings from select - column does not exist, was crashing query
    let query = supabase.from('rides').select('id,pickup_address,dropoff_address,fare,created_at,started_at,ended_at,status').eq('driver_id', profile.id).order('created_at', { ascending: false })
    if (view === 'trips') query = query.limit(50)
    void query.then(({ data, error }) => { if (!active) return; if (error) { setRidesError(error.message); setRides([]) } else setRides((data || []) as DriverRide[]); setRidesLoading(false) })
    return () => { active = false }
  }, [isOpen, profile?.id, view])

  const handleShareTrip = async () => {
    const text = `BuddyRide driver ${userName} is on a trip. Contact: ${phone}. Track via BuddyRide app.`
    try { if (navigator.share) await navigator.share({ title: 'BuddyRide trip', text }); else if (navigator.clipboard) { await navigator.clipboard.writeText(text); setShareMsg('Trip details copied. Paste to WhatsApp / SMS.') } else setShareMsg(text) } catch { setShareMsg('Sharing cancelled.') }
  }

  const cardStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, background: cardBackground, color: '#182230', textAlign: 'left' as const, border: '1px solid #EDF0F3' }
  const iconStyle = { width: 44, height: 44, flexShrink: 0, borderRadius: 22, background: BLUE_LIGHT, color: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }
  const detailStyle = { padding: '14px 0', borderBottom: '1px solid #EDF0F3', display: 'flex', justifyContent: 'space-between', gap: 16 }
  const backButton = (<button type="button" onClick={() => setView('main')} style={{ background: 'transparent', color: muted, padding: '8px 0', marginBottom: 12, border: 'none', cursor: 'pointer' }}>← Back</button>)
  const openView = (nextView: View) => () => setView(nextView)
  const menuItem = (icon: string, label: string, nextView: View) => (<button key={label} type="button" onClick={openView(nextView)} style={cardStyle}><span style={iconStyle}>{icon}</span><span style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{label}</span><span style={{ color: '#98A2B3', fontSize: 22 }}>›</span></button>)
  const detail = (label: string, value: string) => (<div key={label} style={detailStyle}><span style={{ color: muted }}>{label}</span><strong style={{ textAlign: 'right' }}>{value}</strong></div>)
  const selectButton = (label: string, selected: boolean, onClick: () => void) => (<button key={label} type="button" onClick={onClick} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: 14, marginTop: 8, background: selected ? BLUE_LIGHT : cardBackground, color: '#182230', border: selected ? `2px solid ${BLUE}` : '1px solid #EDF0F3', textAlign: 'left', borderRadius: 12, cursor: 'pointer' }}>{label}<span style={{ color: selected ? BLUE : muted }}>{selected ? '✓' : ''}</span></button>)

  const renderView = () => {
    switch (view) {
      case 'profile':
        return (<>
          {backButton}<h2>My Profile</h2>
          <div style={{ ...cardStyle, marginBottom: 12, alignItems: 'center' }}>
            {avatarUrl ? <img src={avatarUrl} alt={`${userName} profile`} style={{ width: 64, height: 64, borderRadius: 32, objectFit: 'cover' }} /> : <div style={{ width: 64, height: 64, borderRadius: 32, display: 'grid', placeItems: 'center', background: BLUE_LIGHT, color: BLUE_DARK, fontWeight: 900 }}>{userName.trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()}</div>}
            <div><strong>{userName}</strong><div style={{ color: muted, fontSize: 12 }}>{phone}</div></div>
          </div>
          <label style={{ display: 'block', marginTop: 12, fontWeight: 700 }}>Full name<input value={profileName} onChange={e => setProfileName(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 12, marginTop: 6, border: '1px solid #D0D5DD', borderRadius: 10 }} /></label>
          <label style={{ display: 'block', marginTop: 12, fontWeight: 700 }}>Phone number<input value={profilePhone} onChange={e => setProfilePhone(e.target.value)} inputMode="tel" style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 12, marginTop: 6, border: '1px solid #D0D5DD', borderRadius: 10 }} /></label>
          {profileMessage && <p role="status" style={{ color: profileMessage.includes('saved') ? '#067647' : '#B42318', fontSize: 13 }}>{profileMessage}</p>}
          <button type="button" onClick={() => void saveDriverProfile()} disabled={profileSaving} style={{ ...cardStyle, justifyContent: 'center', marginTop: 12, background: BLUE, color: 'white', border: 0, opacity: profileSaving ? 0.7 : 1 }}>{profileSaving ? 'Saving…' : 'Save profile'}</button>
        </>)
      case 'earnings':
        return (<>{backButton}<h2>Earnings</h2><div style={{ ...cardStyle, marginBottom: 10 }}><span style={iconStyle}>💳</span><div><div style={{ color: muted, fontSize: 13 }}>Total earned from completed trips (100% of fares - cash paid by rider)</div><strong style={{ fontSize: 24 }}>R {totalEarned.toFixed(2)}</strong></div></div>{detail('Today', `R ${todayEarnings.toFixed(2)}`)}{detail('This week', `R ${weeklyEarnings.toFixed(2)}`)}{detail('Your driver share', '100% of each completed fare')}{ridesLoading && <p style={{ color: muted }}>Loading earnings…</p>}{ridesError && <p role="alert" style={{ color: '#B42318' }}>{ridesError}</p>}<p style={{ color: muted, lineHeight: 1.5 }}>You keep 100% of each fare, paid in cash by the rider. BuddyRide earns from driver bundle purchases, not trip commissions.</p></>)
      case 'trips':
        return (<>{backButton}<h2>My Trips</h2><p style={{ color: muted }}>Recent rides</p>{ridesLoading && <p style={{ color: muted }}>Loading ride history…</p>}{ridesError && <p role="alert" style={{ color: '#B42318' }}>{ridesError}</p>}{!ridesLoading && !ridesError && rides.length === 0 && <p style={{ color: muted }}>No trips found yet.</p>}{rides.map((ride) => (<div key={ride.id} style={{ ...cardStyle, marginBottom: 10, alignItems: 'flex-start' }}><span style={iconStyle}>🚕</span><div style={{ minWidth: 0 }}><strong>{ride.pickup_address || 'Pickup'} → {ride.dropoff_address || 'Drop-off'}</strong><p style={{ color: muted, margin: '6px 0 0', fontSize: 13 }}>{ride.created_at ? new Date(ride.created_at).toLocaleDateString() : 'Date unavailable'}{' · '}{ride.status || 'Unknown status'}</p><p style={{ margin: '5px 0 0', fontSize: 13 }}>Your share: R {earningsFor(ride).toFixed(2)}</p></div></div>))}</>)
      case 'wallet':
        return (<>{backButton}<h2>Wallet / Cash Earnings</h2><div style={{ ...cardStyle, marginBottom: 12 }}><span style={iconStyle}>💰</span><div><div style={{ color: muted, fontSize: 13 }}>Cash collected from riders (100% fares)</div><strong style={{ fontSize: 24 }}>R {totalEarned.toFixed(2)}</strong></div></div>{detail('Total earned (all time)', `R ${totalEarned.toFixed(2)}`)}{detail('Payout method', 'Cash - paid directly by rider')}{detail('Payout status', 'No bank payout - you keep cash')}<p style={{ color: muted, lineHeight: 1.5 }}>Bundle model: Riders pay you in cash at the end of each trip. You keep 100%. BuddyRide does NOT hold your fares and does NOT pay via bank EFT. Never share your account or verification codes with anyone.</p><a href="mailto:buddyride@outlook.com?subject=Bundle%20Help" style={{ display: 'block', textAlign: 'center', padding: 14, borderRadius: 12, background: BLUE, color: 'white', fontWeight: 800, textDecoration: 'none' }}>Ask About Bundles</a></>)
      case 'campaigns':
        return (<>{backButton}<h2>Campaigns</h2><div style={cardStyle}><span style={iconStyle}>📢</span><div><strong>Driver incentives</strong><p style={{ color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>Keep an eye on this section for ride targets, peak-hour bonuses, and other BuddyRide driver campaigns.</p></div></div></>)
      case 'documents':
        return (<>{backButton}<h2>Documents</h2><p style={{ color: muted, lineHeight: 1.5 }}>Upload and manage your 15 driver documents, including vehicle photos, from the driver onboarding page.</p><button type="button" onClick={() => window.location.assign('/driver/onboarding')} style={{ width: '100%', justifyContent: 'center', color: 'white', background: BLUE, border: 0, borderRadius: 12, padding: '14px 16px', fontWeight: 800, cursor: 'pointer' }}>Open driver onboarding</button></>)
      case 'vehicles':
        return (<>{backButton}<h2>Vehicles</h2><div style={{ ...cardStyle, marginBottom: 12 }}><span style={iconStyle}>🚘</span><div><strong>{vehicleLabel}</strong><div style={{ color: muted, marginTop: 5 }}>{vehiclePlate || 'No plate on file'}</div></div></div><button type="button" onClick={() => window.location.assign('/driver/onboarding')} style={{ ...cardStyle, justifyContent: 'center', color: BLUE, fontWeight: 700, cursor: 'pointer' }}>+ Add / Update Vehicle</button></>)
      case 'safety':
        return (<>{backButton}<h2>Safety</h2><button type="button" onClick={handleShareTrip} style={{ ...cardStyle, marginBottom: 10, alignItems: 'flex-start', cursor: 'pointer' }}><span style={iconStyle}>↗️</span><span><strong>Share trip</strong><span style={{ color: muted, display: 'block', marginTop: 6, lineHeight: 1.5 }}>Share your trip details with someone you trust.</span></span></button>{shareMsg && <p style={{ color: BLUE_DARK, fontSize: 13 }}>{shareMsg}</p>}<a href="tel:10111" style={{ ...cardStyle, marginBottom: 10, alignItems: 'flex-start', textDecoration: 'none' }}><span style={iconStyle}>🆘</span><span><strong>Emergency - Call 10111</strong><span style={{ color: muted, display: 'block', marginTop: 6, lineHeight: 1.5 }}>Call local emergency services if you are in immediate danger.</span></span></a><div style={{ ...cardStyle, marginBottom: 10, alignItems: 'flex-start' }}><span style={iconStyle}>📍</span><div><strong>Follow ride</strong><p style={{ color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>Keep your trip active and share your route when needed.</p></div></div></>)
      case 'settings':
        return (<>{backButton}<h2>Settings</h2><button type="button" onClick={openView('navigation')} style={{ ...cardStyle, marginBottom: 10 }}><span style={iconStyle}>🧭</span><span style={{ flex: 1, textAlign: 'left' }}>Navigation</span><span style={{ color: muted }}>›</span></button><h3 style={{ margin: '20px 0 8px' }}>Theme</h3>{['Dark', 'Light'].map((v) => selectButton(v, theme === v, () => onThemeChange?.(v.toLowerCase() as 'dark' | 'light')))}<h3 style={{ margin: '20px 0 8px' }}>Language</h3><div style={{ ...cardStyle, cursor: 'default' }}><strong>English</strong><p style={{ color: muted, margin: '6px 0 0', fontSize: 13 }}>English is currently supported in the app. Additional languages are not available yet.</p></div></>)
      case 'navigation':
        return (<>{backButton}<h2>Navigation</h2><p style={{ color: muted }}>Choose your preferred navigation app.</p>{['BuddyRide Navigation', 'Waze'].map((v) => selectButton(v, defaultNavigation === v, () => { setDefaultNavigation(v); try { localStorage.setItem('buddy_driver_navigation', v) } catch {}; window.dispatchEvent(new Event('buddyride-navigation-preference')) }))}</>)
      case 'help':
        return (<>{backButton}<h2>Help Centre</h2><p style={{ color: muted, lineHeight: 1.6 }}>Need help with a trip, payout, or your driver account? Contact the BuddyRide support team in Limpopo.</p><a href="mailto:buddyride@outlook.com?subject=Driver%20Support" style={{ ...cardStyle, marginBottom: 10, textDecoration: 'none' }}><span style={iconStyle}>📞</span><span><strong>Contact Support</strong><span style={{ color: muted, display: 'block', marginTop: 6 }}>Email buddyride@outlook.com - Limpopo local support</span></span></a><div style={{ display: 'flex', gap: 8 }}><a href="tel:+27641018991" style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 12, background: BLUE_LIGHT, color: BLUE_DARK, fontWeight: 800, textDecoration: 'none' }}>Call 064 101 8991</a><a href="https://wa.me/27641018991" target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 12, background: '#ECFDF3', color: '#067647', fontWeight: 800, textDecoration: 'none' }}>WhatsApp</a></div><p style={{ color: muted, fontSize: 13 }}>For immediate danger, contact local emergency services.</p></>)
      case 'about':
        return (<>{backButton}<h2>About BuddyRide</h2><div style={cardStyle}><span style={iconStyle}>ℹ️</span><div><strong>BuddyRide Driver</strong><p style={{ color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>A local ride service connecting passengers and drivers across Limpopo.</p></div></div></>)
      default: return null
    }
  }

  return (
    <>
      {!isControlled && (<button type="button" onClick={open} aria-label="Open driver menu" aria-expanded={isOpen} style={{ width: 42, height: 42, padding: 0, borderRadius: 21, background: '#fff', border: '1px solid #EDF0F3', color: '#182230', fontSize: 20, cursor: 'pointer' }}>☰</button>)}
      {isOpen && createPortal(
        <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', fontFamily: 'Inter, system-ui, sans-serif', color: '#182230' }}>
          <button type="button" aria-label="Close menu" onClick={close} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 0, background: 'rgba(0,0,0,0.65)', border: 'none' }} />
          <aside aria-label="BuddyRide Driver menu" style={{ position: 'relative', width: 'min(420px, 92vw)', height: '100%', display: 'flex', flexDirection: 'column', background: '#F8F9FA', color: '#182230', boxShadow: '12px 0 40px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderBottom: '1px solid #EDF0F3' }}>
              <strong style={{ color: '#344054', fontSize: 15 }}>BuddyRide Driver</strong>
              <button type="button" onClick={close} aria-label="Close menu" style={{ width: 36, height: 36, padding: 0, borderRadius: 10, background: '#F2F4F7', color: '#344054', fontSize: 22, border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '0 20px 18px', background: '#fff' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 16 }}>
                {avatarUrl ? <img src={avatarUrl} style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 36, objectFit: 'cover', background: BLUE_LIGHT, border: `2px solid ${BLUE}` }} alt={`${userName} profile`} /> : <div aria-label={`${userName} initials`} style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 36, display: 'grid', placeItems: 'center', background: BLUE_LIGHT, color: BLUE_DARK, fontWeight: 900, fontSize: 24 }}>{userName.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{userName}</div>
                  <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: BLUE_LIGHT, padding: '4px 10px', borderRadius: 20, fontSize: 13, color: BLUE_DARK, fontWeight: 700 }}>🛡️ {tier}</div>
                  <label style={{ display: 'block', marginTop: 8, color: BLUE, fontSize: 12, cursor: photoUploading ? 'wait' : 'pointer', fontWeight: 700 }}>{photoUploading ? 'Uploading photo…' : 'Change profile photo'}<input type="file" accept="image/*" disabled={photoUploading} onChange={e => { void handleProfilePhotoUpload(e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} /></label>
                  {photoError && <div role="alert" style={{ color: '#B42318', fontSize: 12 }}>{photoError}</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 18 }}>
                {[{ key: 'score' as const, icon: '↗️', value: driverScore != null ? `${driverScore}%` : '-', label: 'Driver Score' }, { key: 'rating' as const, icon: '⭐', value: rating, label: 'Rating' }, { key: 'accept' as const, icon: '%', value: acceptanceRate != null ? `${acceptanceRate}%` : '-', label: 'Acceptance' }, { key: 'cancel' as const, icon: '×', value: cancellationRate != null ? `${cancellationRate}%` : '-', label: 'Cancellation' }].map(({ key, icon, value, label }) => (<div key={label} onClick={() => setOpenStat(key)} style={{ background: '#fff', border: '1px solid #EDF0F3', borderRadius: 12, padding: '11px 5px', textAlign: 'center', cursor: 'pointer' }}><div style={{ color: BLUE, fontSize: 17 }}>{icon}</div><div style={{ fontWeight: 800, fontSize: 18, marginTop: 3 }}>{value}</div><div style={{ fontSize: 10, color: muted, marginTop: 3 }}>{label}</div></div>))}
              </div>
              <div style={{ color: muted, fontSize: 12, marginTop: 10, overflowWrap: 'anywhere' }}>{phone}</div>
            </div>
            <div style={{ height: 1, flexShrink: 0, background: '#EDF0F3', margin: '0 20px' }} />
            <nav style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {menuItem('👤', 'My Profile', 'profile')}{menuItem('💳', 'Earnings', 'earnings')}{menuItem('🚕', 'My Trips', 'trips')}{menuItem('💰', 'Wallet / Cash', 'wallet')}{menuItem('📢', 'Campaigns', 'campaigns')}{menuItem('📄', 'Documents', 'documents')}{menuItem('🚘', 'Vehicles', 'vehicles')}{menuItem('🛡️', 'Safety', 'safety')}{menuItem('⚙️', 'Settings', 'settings')}{menuItem('❓', 'Help Centre', 'help')}{menuItem('📞', 'Contact Support', 'help')}{menuItem('ℹ️', 'About', 'about')}
              <button type="button" onClick={onSignOut} style={{ ...cardStyle, marginTop: 6, color: '#B42318' }}><span style={{ ...iconStyle, background: '#FEF3F2', color: '#B42318' }}>↩️</span><span style={{ fontWeight: 600, fontSize: 16 }}>Log Out</span></button>
            </nav>
            {view !== 'main' && (<section aria-label={`${view} menu`} style={{ position: 'absolute', inset: 0, zIndex: 2, padding: 20, background: '#F8F9FA', overflowY: 'auto' }}>{renderView()}</section>)}
          </aside>
        </div>, document.body)}
      {openStat && (<div role="dialog" aria-modal="true" aria-labelledby="driver-stat-title" style={{ position: 'fixed', inset: 0, zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.65)', color: '#182230' }}><section style={{ width: 'min(360px, 100%)', padding: 20, borderRadius: 16, background: '#fff' }}><h2 id="driver-stat-title" style={{ margin: '0 0 12px', fontSize: 18 }}>{openStat === 'score' && 'Driver Score'}{openStat === 'rating' && 'Rating'}{openStat === 'accept' && 'Acceptance'}{openStat === 'cancel' && 'Cancellation'}</h2><p style={{ margin: '0 0 18px', color: '#475467' }}>{openStat === 'score' && (driverScore != null ? `${driverScore}% Driver Score — Rating ${rating} (40%) + Acceptance ${acceptanceRate}% (30%) + Non-cancel ${cancellationRate != null ? 100 - Number(cancellationRate) : 0}% (30%)` : 'No trips yet - complete trips to get a Driver Score.')}{openStat === 'rating' && (hasRating ? `${rating} Rating — Based on ${totalTrips} trips` : 'No rating yet - complete trips to get rated.')}{openStat === 'accept' && (acceptanceRate != null ? `${acceptanceRate}% Acceptance — Accepted ${acceptedTrips} of ${totalTrips} trips` : 'No trips yet.')}{openStat === 'cancel' && (cancellationRate != null ? `${cancellationRate}% Cancellation — Cancelled ${cancelledByDriver} of ${totalTrips} trips; keep below 5%` : 'No trips yet - no cancellations.')}</p>{driverStatsLoading && <p style={{ margin: '0 0 12px', color: '#475467' }}>Refreshing stats…</p>}{driverStatsError && <p role="alert" style={{ margin: '0 0 12px', color: '#B42318' }}>{driverStatsError}</p>}<button type="button" onClick={() => setOpenStat(null)} style={{ ...cardStyle, justifyContent: 'center', fontWeight: 700, cursor: 'pointer' }}>Close</button></section></div>)}
    </>
  )
}
export default NavigationMenu