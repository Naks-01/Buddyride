import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

type View =
  | 'main'
  | 'earnings'
  | 'trips'
  | 'wallet'
  | 'campaigns'
  | 'documents'
  | 'vehicles'
  | 'safety'
  | 'settings'
  | 'navigation'
  | 'help'
  | 'about'

interface Props {
  profile?: any
  onSignOut?: () => void
  isOpen?: boolean
  onClose?: () => void
  userName?: string
  phone?: string
}

const teal = '#1de28f'
const cardBackground = '#232b41'
const muted = '#8b92a8'
const documentTypes = [
  { label: 'SA ID', types: ['id', 'sa_id', 'identity'] },
  { label: 'License', types: ['license', 'drivers_license'] },
  { label: 'PrDP', types: ['pdp', 'prdp'] },
  { label: 'Vehicle Disc', types: ['disc', 'vehicle_disc'] },
  { label: 'Insurance', types: ['insurance', 'huru'] },
  { label: 'Car Papers', types: ['car_papers', 'vehicle_registration'] },
  { label: 'Selfie', types: ['selfie'] },
]

type DriverRide = {
  id: string
  pickup_address: string | null
  dropoff_address: string | null
  fare: number | null
  driver_earnings: number | null
  created_at: string | null
  started_at: string | null
  ended_at: string | null
  status: string | null
}

type DriverDocument = {
  doc_type: string
  status: string
}

export function NavigationMenu({
  profile,
  onSignOut,
  isOpen: propIsOpen,
  onClose,
  userName: propName,
  phone: propPhone,
}: Props) {
  const [openStat, setOpenStat] = useState<'score' | 'rating' | 'accept' | 'cancel' | null>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const [view, setView] = useState<View>('main')
  const [defaultNavigation, setDefaultNavigation] = useState('BuddyRide Navigation')
  const [theme, setTheme] = useState('Dark')
  const [language, setLanguage] = useState('English')
  const [rides, setRides] = useState<DriverRide[]>([])
  const [ridesLoading, setRidesLoading] = useState(false)
  const [ridesError, setRidesError] = useState('')
  const [driverDocuments, setDriverDocuments] = useState<DriverDocument[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState('')
  const acceptanceRate = 70
  const cancellationRate = 2.5
  const driverScore = 89
  const rating = 4.70

  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : internalOpen
  const userName = propName || profile?.full_name || 'Driver'
  const phone = propPhone || profile?.phone || 'Phone number not available'
  const balance = Number(profile?.wallet_balance || 0)
  const completedRides = rides.filter((ride) => ['completed', 'rated'].includes(ride.status || ''))
  const earningsFor = (ride: DriverRide) => Number(ride.driver_earnings ?? Number(ride.fare || 0) * 0.8)
  const today = new Date()
  const todayEarnings = completedRides
    .filter((ride) => {
      const rideDate = new Date(ride.ended_at || ride.created_at || '')
      return !Number.isNaN(rideDate.getTime())
        && rideDate.getFullYear() === today.getFullYear()
        && rideDate.getMonth() === today.getMonth()
        && rideDate.getDate() === today.getDate()
    })
    .reduce((total, ride) => total + earningsFor(ride), 0)
  const weekStart = new Date(today)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weeklyEarnings = completedRides
    .filter((ride) => {
      const rideDate = new Date(ride.ended_at || ride.created_at || '')
      return !Number.isNaN(rideDate.getTime()) && rideDate >= weekStart
    })
    .reduce((total, ride) => total + earningsFor(ride), 0)

  const close = () => {
    if (onClose) onClose()
    else setInternalOpen(false)
    setView('main')
  }

  const open = () => {
    setView('main')
    setInternalOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !profile?.id || !['trips', 'earnings'].includes(view)) return

    let active = true
    setRidesLoading(true)
    setRidesError('')
    void supabase
      .from('rides')
      .select('id,pickup_address,dropoff_address,fare,driver_earnings,created_at,started_at,ended_at,status')
      .eq('driver_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setRidesError(error.message)
          setRides([])
        } else {
          setRides((data || []) as DriverRide[])
        }
        setRidesLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, profile?.id, view])

  useEffect(() => {
    if (!isOpen || !profile?.id || view !== 'documents') return

    let active = true
    setDocumentsLoading(true)
    setDocumentsError('')
    void supabase
      .from('driver_documents')
      .select('doc_type,status')
      .eq('driver_id', profile.id)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setDocumentsError(error.message)
          setDriverDocuments([])
        } else {
          setDriverDocuments((data || []) as DriverDocument[])
        }
        setDocumentsLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, profile?.id, view])

  const cardStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    background: cardBackground,
    color: 'white',
    textAlign: 'left' as const,
  }

  const iconStyle = {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 22,
    background: teal,
    color: '#10251e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  }

  const detailStyle = {
    padding: '14px 0',
    borderBottom: '1px solid #343d55',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
  }

  const backButton = (
    <button
      type="button"
      onClick={() => setView('main')}
      style={{
        background: 'transparent',
        color: muted,
        padding: '8px 0',
        marginBottom: 12,
      }}
    >
      ← Back
    </button>
  )

  const openView = (nextView: View) => () => setView(nextView)

  const menuItem = (icon: string, label: string, nextView: View) => (
    <button key={label} type="button" onClick={openView(nextView)} style={cardStyle}>
      <span style={iconStyle}>{icon}</span>
      <span style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{label}</span>
      <span style={{ color: '#5a637e', fontSize: 22 }}>›</span>
    </button>
  )

  const detail = (label: string, value: string) => (
    <div key={label} style={detailStyle}>
      <span style={{ color: muted }}>{label}</span>
      <strong style={{ textAlign: 'right' }}>{value}</strong>
    </div>
  )

  const selectButton = (
    label: string,
    selected: boolean,
    onClick: () => void,
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        padding: 14,
        marginTop: 8,
        background: selected ? '#164b3a' : cardBackground,
        color: 'white',
        border: selected ? `1px solid ${teal}` : '1px solid transparent',
        textAlign: 'left',
      }}
    >
      {label}
      <span style={{ color: selected ? teal : muted }}>{selected ? '✓' : ''}</span>
    </button>
  )

  const renderView = () => {
    switch (view) {
      case 'earnings':
        return (
          <>
            {backButton}
            <h2>Earnings</h2>
            <div style={{ ...cardStyle, marginBottom: 10 }}>
              <span style={iconStyle}>💳</span>
              <div>
                <div style={{ color: muted, fontSize: 13 }}>Available wallet balance</div>
                <strong style={{ fontSize: 24 }}>R {balance.toFixed(2)}</strong>
              </div>
            </div>
            {detail('Today', `R ${todayEarnings.toFixed(2)}`)}
            {detail('This week', `R ${weeklyEarnings.toFixed(2)}`)}
            {detail('Your driver share', '80% of each completed fare')}
            {ridesLoading && <p style={{ color: muted }}>Loading earnings…</p>}
            {ridesError && <p role="alert" style={{ color: '#ff9b9b' }}>{ridesError}</p>}
            <p style={{ color: muted, lineHeight: 1.5 }}>
              Your earnings reflect your 80% share. BuddyRide retains the remaining
              20% platform commission.
            </p>
          </>
        )
      case 'trips':
        return (
          <>
            {backButton}
            <h2>My Trips</h2>
            <p style={{ color: muted }}>Recent rides</p>
            {ridesLoading && <p style={{ color: muted }}>Loading ride history…</p>}
            {ridesError && <p role="alert" style={{ color: '#ff9b9b' }}>{ridesError}</p>}
            {!ridesLoading && !ridesError && rides.length === 0 && (
              <p style={{ color: muted }}>No trips found yet.</p>
            )}
            {rides.map((ride) => (
              <div key={ride.id} style={{ ...cardStyle, marginBottom: 10, alignItems: 'flex-start' }}>
                <span style={iconStyle}>🚕</span>
                <div style={{ minWidth: 0 }}>
                  <strong>{ride.pickup_address || 'Pickup'} → {ride.dropoff_address || 'Drop-off'}</strong>
                  <p style={{ color: muted, margin: '6px 0 0', fontSize: 13 }}>
                    {ride.created_at ? new Date(ride.created_at).toLocaleDateString() : 'Date unavailable'}
                    {' · '}{ride.status || 'Unknown status'}
                  </p>
                  <p style={{ margin: '5px 0 0', fontSize: 13 }}>Your share: R {earningsFor(ride).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </>
        )
      case 'wallet':
        return (
          <>
            {backButton}
            <h2>Wallet / Payouts</h2>
            <div style={{ ...cardStyle, marginBottom: 12 }}>
              <span style={iconStyle}>💰</span>
              <div>
                <div style={{ color: muted, fontSize: 13 }}>Wallet balance</div>
                <strong style={{ fontSize: 24 }}>R {balance.toFixed(2)}</strong>
              </div>
            </div>
            {detail('Payout provider', 'Paystack')}
            {detail('Payout status', 'Contact support for payout assistance')}
            <p style={{ color: muted, lineHeight: 1.5 }}>
              Payouts are processed through Paystack. Never share your account or
              verification codes with anyone.
            </p>
          </>
        )
      case 'campaigns':
        return (
          <>
            {backButton}
            <h2>Campaigns</h2>
            <div style={cardStyle}>
              <span style={iconStyle}>📢</span>
              <div>
                <strong>Driver incentives</strong>
                <p style={{ color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>
                  Keep an eye on this section for ride targets, peak-hour bonuses,
                  and other BuddyRide driver campaigns.
                </p>
              </div>
            </div>
          </>
        )
      case 'documents':
        return (
          <>
            {backButton}
            <h2>Documents</h2>
            <p style={{ color: muted }}>Your 7 driver verification documents.</p>
            {documentsLoading && <p style={{ color: muted }}>Loading document statuses…</p>}
            {documentsError && <p role="alert" style={{ color: '#ff9b9b' }}>{documentsError}</p>}
            {documentTypes.map(({ label, types }) => {
              const record = driverDocuments.find((document) => types.includes(document.doc_type.toLowerCase()))
              const status = record?.status || 'missing'
              const approved = status.toLowerCase() === 'approved'
              return (
                <div key={label} style={{ ...detailStyle, alignItems: 'center' }}>
                  <span>{label}</span>
                  <span
                    style={{
                      color: approved ? teal : '#ffcc66',
                      background: approved ? '#173d32' : '#44361f',
                      padding: '5px 9px',
                      borderRadius: 20,
                      fontSize: 12,
                    }}
                  >
                    {approved ? 'Approved' : status === 'missing' ? 'Missing' : 'Pending'}
                  </span>
                </div>
              )
            })}
          </>
        )
      case 'vehicles':
        return (
          <>
            {backButton}
            <h2>Vehicles</h2>
            <div style={{ ...cardStyle, marginBottom: 12 }}>
              <span style={iconStyle}>🚘</span>
              <div>
                <strong>Renault Kwid 2022</strong>
                <div style={{ color: muted, marginTop: 5 }}>HCM339L</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.alert('Contact BuddyRide support to add a vehicle.')}
              style={{ ...cardStyle, justifyContent: 'center', color: teal }}
            >
              + Add Vehicle
            </button>
          </>
        )
      case 'safety':
        return (
          <>
            {backButton}
            <h2>Safety</h2>
            {[
              ['Share trip', 'Share your trip details with someone you trust.'],
              ['Emergency', 'Call local emergency services if you are in immediate danger.'],
              ['Follow ride', 'Keep your trip active and share your route when needed.'],
            ].map(([title, description], index) => (
              <div key={title} style={{ ...cardStyle, marginBottom: 10, alignItems: 'flex-start' }}>
                <span style={iconStyle}>{['↗️', '🆘', '📍'][index]}</span>
                <div>
                  <strong>{title}</strong>
                  <p style={{ color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>{description}</p>
                </div>
              </div>
            ))}
          </>
        )
      case 'settings':
        return (
          <>
            {backButton}
            <h2>Settings</h2>
            <button type="button" onClick={openView('navigation')} style={{ ...cardStyle, marginBottom: 10 }}>
              <span style={iconStyle}>🧭</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Navigation</span>
              <span style={{ color: muted }}>›</span>
            </button>
            <h3 style={{ margin: '20px 0 8px' }}>Theme</h3>
            {['Dark', 'Light'].map((value) =>
              selectButton(value, theme === value, () => setTheme(value)),
            )}
            <h3 style={{ margin: '20px 0 8px' }}>Language</h3>
            {['English', 'Sepedi', 'Zulu'].map((value) =>
              selectButton(value, language === value, () => setLanguage(value)),
            )}
          </>
        )
      case 'navigation':
        return (
          <>
            {backButton}
            <h2>Navigation</h2>
            <p style={{ color: muted }}>Choose your preferred navigation app.</p>
            {['BuddyRide Navigation', 'Google Maps', 'Waze'].map((value) =>
              selectButton(value, defaultNavigation === value, () => setDefaultNavigation(value)),
            )}
          </>
        )
      case 'help':
        return (
          <>
            {backButton}
            <h2>Help Centre</h2>
            <p style={{ color: muted, lineHeight: 1.6 }}>
              Need help with a trip, payout, or your driver account? Contact the
              BuddyRide support team in Limpopo.
            </p>
            <div style={{ ...cardStyle, marginBottom: 10 }}>
              <span style={iconStyle}>📞</span>
              <div>
                <strong>Contact Support</strong>
                <p style={{ color: muted, margin: '6px 0 0' }}>Limpopo local support</p>
              </div>
            </div>
            <p style={{ color: muted, fontSize: 13 }}>
              For immediate danger, contact local emergency services.
            </p>
          </>
        )
      case 'about':
        return (
          <>
            {backButton}
            <h2>About BuddyRide</h2>
            <div style={cardStyle}>
              <span style={iconStyle}>ℹ️</span>
              <div>
                <strong>BuddyRide Driver</strong>
                <p style={{ color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>
                  A local ride service connecting passengers and drivers across
                  Limpopo.
                </p>
              </div>
            </div>
          </>
        )
      default:
        return null
    }
  }

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={open}
          aria-label="Open driver menu"
          aria-expanded={isOpen}
          style={{
            width: 42,
            height: 42,
            padding: 0,
            borderRadius: 21,
            background: cardBackground,
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'white',
            fontSize: 20,
          }}
        >
          ☰
        </button>
      )}

      {isOpen && createPortal(
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: 'white',
          }}
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              borderRadius: 0,
              background: 'rgba(0,0,0,0.65)',
            }}
          />
          <aside
            aria-label="BuddyRide Driver menu"
            style={{
              position: 'relative',
              width: 'min(420px, 92vw)',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: '#151a28',
              color: 'white',
              boxShadow: '12px 0 40px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#d0d6e8', fontSize: 15 }}>BuddyRide Driver</strong>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                style={{ width: 36, height: 36, padding: 0, borderRadius: 10, background: 'transparent', color: 'white', fontSize: 22 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '0 20px 18px' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <img
                  src={`https://i.pravatar.cc/150?u=${encodeURIComponent(userName)}`}
                  style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 36, objectFit: 'cover', background: cardBackground }}
                  alt={`${userName} profile`}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{userName}</div>
                  <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2a3147', padding: '4px 10px', borderRadius: 20, fontSize: 13, color: '#d0d6e8' }}>
                    🛡️ Silver
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 18 }}>
                {[
                  { key: 'score' as const, icon: '↗️', value: `${driverScore}%`, label: 'Driver Score' },
                  { key: 'rating' as const, icon: '⭐', value: rating.toFixed(2), label: 'Rating' },
                  { key: 'accept' as const, icon: '%', value: `${acceptanceRate}%`, label: 'Acceptance' },
                  { key: 'cancel' as const, icon: '×', value: `${cancellationRate}%`, label: 'Cancellation' },
                ].map(({ key, icon, value, label }) => (
                  <div key={label} onClick={() => setOpenStat(key)} style={{ background: cardBackground, borderRadius: 12, padding: '11px 5px', textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ color: teal, fontSize: 17 }}>{icon}</div>
                    <div style={{ fontWeight: 800, fontSize: 18, marginTop: 3 }}>{value}</div>
                    <div style={{ fontSize: 10, color: muted, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: muted, fontSize: 12, marginTop: 10, overflowWrap: 'anywhere' }}>{phone}</div>
            </div>

            <div style={{ height: 1, flexShrink: 0, background: cardBackground, margin: '0 20px' }} />

            <nav style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {menuItem('💳', 'Earnings', 'earnings')}
              {menuItem('🚕', 'My Trips', 'trips')}
              {menuItem('💰', 'Wallet / Payouts', 'wallet')}
              {menuItem('📢', 'Campaigns', 'campaigns')}
              {menuItem('📄', 'Documents', 'documents')}
              {menuItem('🚘', 'Vehicles', 'vehicles')}
              {menuItem('🛡️', 'Safety', 'safety')}
              {menuItem('⚙️', 'Settings', 'settings')}
              {menuItem('❓', 'Help Centre', 'help')}
              {menuItem('📞', 'Contact Support', 'help')}
              {menuItem('ℹ️', 'About', 'about')}
              <button
                type="button"
                onClick={onSignOut}
                style={{ ...cardStyle, marginTop: 6, color: '#c2a2a8' }}
              >
                <span style={{ ...iconStyle, background: '#45303a', color: '#ffc7cb' }}>↩️</span>
                <span style={{ fontWeight: 600, fontSize: 16 }}>Log Out</span>
              </button>
            </nav>

            {view !== 'main' && (
              <section
                aria-label={`${view} menu`}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 2,
                  padding: 20,
                  background: '#151a28',
                  overflowY: 'auto',
                }}
              >
                {renderView()}
              </section>
            )}
          </aside>
        </div>,
        document.body,
      )}
      {openStat && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="driver-stat-title"
          style={{ position: 'fixed', inset: 0, zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.65)', color: 'white' }}
        >
          <section style={{ width: 'min(360px, 100%)', padding: 20, borderRadius: 16, background: '#151a28' }}>
            <h2 id="driver-stat-title" style={{ margin: '0 0 12px', fontSize: 18 }}>
              {openStat === 'score' && 'Driver Score'}
              {openStat === 'rating' && 'Rating'}
              {openStat === 'accept' && 'Acceptance'}
              {openStat === 'cancel' && 'Cancellation'}
            </h2>
            <p style={{ margin: '0 0 18px', color: '#d0d6e8' }}>
              {openStat === 'score' && `${driverScore}%`}
              {openStat === 'rating' && rating.toFixed(2)}
              {openStat === 'accept' && `${acceptanceRate}%`}
              {openStat === 'cancel' && `${cancellationRate}%`}
            </p>
            <button type="button" onClick={() => setOpenStat(null)} style={{ ...cardStyle, justifyContent: 'center' }}>Close</button>
          </section>
        </div>
      )}
    </>
  )
}

export default NavigationMenu
