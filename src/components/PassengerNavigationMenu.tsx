import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Profile } from '../lib/supabase'

type View =
  | 'main'
  | 'profile'
  | 'trips'
  | 'wallet'
  | 'promos'
  | 'safety'
  | 'settings'
  | 'help'
  | 'about'

interface Props {
  isOpen?: boolean
  onClose?: () => void
  profile?: Profile | null
  onSignOut?: () => void
  userName?: string
}

const ink = '#000000'
const muted = '#6b7280'
const border = '#e5e7eb'
const soft = '#f5f5f5'

export function PassengerNavigationMenu({
  isOpen: propIsOpen,
  onClose,
  profile,
  onSignOut,
  userName: propUserName,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [view, setView] = useState<View>('main')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [navigationApp, setNavigationApp] = useState('Google Maps')
  const [language, setLanguage] = useState('English')
  const [theme, setTheme] = useState('Light')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [promoCode, setPromoCode] = useState('')

  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : internalOpen
  const name = propUserName || profile?.full_name || 'BuddyRide passenger'
  const phone = profile?.phone || 'Add a phone number'
  const rating = Number(profile?.rating ?? 5).toFixed(2)
  const balance = Number(profile?.wallet_balance || 0).toFixed(2)

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  const itemStyle = {
    width: '100%',
    minHeight: 56,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 4px',
    background: 'white',
    color: ink,
    textAlign: 'left' as const,
    borderBottom: `1px solid ${border}`,
    borderRadius: 0,
  }

  const iconStyle = {
    width: 28,
    flexShrink: 0,
    textAlign: 'center' as const,
    fontSize: 21,
  }

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 0',
    borderBottom: `1px solid ${border}`,
  }

  const backButton = (
    <button
      type="button"
      onClick={() => setView('main')}
      style={{
        display: 'block',
        padding: '8px 0',
        marginBottom: 20,
        background: 'transparent',
        color: ink,
        fontSize: 16,
      }}
    >
      ← Back
    </button>
  )

  const detailRow = (label: string, value: string) => (
    <div key={label} style={rowStyle}>
      <span style={{ color: muted }}>{label}</span>
      <strong>{value}</strong>
    </div>
  )

  const optionButton = (
    label: string,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        ...rowStyle,
        width: '100%',
        background: 'white',
        color: ink,
        textAlign: 'left',
        borderTop: 0,
        borderLeft: 0,
        borderRight: 0,
        borderRadius: 0,
      }}
    >
      {label}
      <span style={{ color: active ? '#16834f' : muted }}>{active ? '✓' : ''}</span>
    </button>
  )

  const menuItem = (icon: string, label: string, nextView: View) => (
    <button
      key={label}
      type="button"
      onClick={() => setView(nextView)}
      style={itemStyle}
    >
      <span style={iconStyle}>{icon}</span>
      <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{label}</span>
      <span style={{ color: '#9ca3af', fontSize: 22 }}>›</span>
    </button>
  )

  const renderView = () => {
    switch (view) {
      case 'profile':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 20px', fontSize: 24 }}>Manage Account</h2>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <img
                src={profile?.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`}
                alt={`${name} profile`}
                style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', background: soft }}
              />
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>{name}</div>
              <div style={{ color: muted, marginTop: 4 }}>{phone}</div>
            </div>
            {detailRow('Rating', `${rating} ★`)}
            {detailRow('Completed trips', String(profile?.trips_completed ?? 0))}
            {detailRow('Email', profile?.email || 'Not available')}
            <p style={{ color: muted, fontSize: 14, lineHeight: 1.5 }}>
              To update account details, contact BuddyRide support.
            </p>
          </>
        )
      case 'trips':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>My Trips</h2>
            <p style={{ color: muted, margin: '0 0 20px' }}>Ride history</p>
            <div style={{ padding: 20, background: soft, borderRadius: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 28 }}>🕘</div>
              <strong style={{ display: 'block', marginTop: 10 }}>Your rides will appear here</strong>
              <p style={{ color: muted, fontSize: 14, lineHeight: 1.5, marginBottom: 0 }}>
                Completed and cancelled trips will be available in your ride history.
              </p>
            </div>
          </>
        )
      case 'wallet':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Wallet / Payment</h2>
            <div style={{ margin: '18px 0', padding: 20, background: ink, color: 'white', borderRadius: 16 }}>
              <div style={{ opacity: 0.75, fontSize: 14 }}>BuddyRide wallet</div>
              <strong style={{ display: 'block', fontSize: 28, marginTop: 8 }}>R {balance}</strong>
            </div>
            <h3 style={{ fontSize: 16 }}>Payment method</h3>
            {['Cash', 'Card', 'Wallet'].map((method) =>
              optionButton(method, paymentMethod === method, () => setPaymentMethod(method)),
            )}
            <p style={{ color: muted, fontSize: 13, lineHeight: 1.5 }}>
              Your selected payment method is saved for this session.
            </p>
          </>
        )
      case 'promos':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Promotions</h2>
            <p style={{ color: muted, lineHeight: 1.5 }}>
              Have a promo code? Enter it here to keep it ready for your next ride.
            </p>
            <label style={{ display: 'block', marginTop: 20, fontWeight: 600 }}>
              Promo code
              <input
                value={promoCode}
                onChange={(event) => setPromoCode(event.target.value)}
                placeholder="Enter promo code"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '14px 12px',
                  marginTop: 8,
                  color: ink,
                  background: 'white',
                  border: `1px solid ${border}`,
                  borderRadius: 10,
                }}
              />
            </label>
            <button
              type="button"
              disabled={!promoCode.trim()}
              onClick={() => window.alert('Promo code validation is not available yet.')}
              style={{ width: '100%', marginTop: 12, background: ink, color: 'white' }}
            >
              Apply promo code
            </button>
          </>
        )
      case 'safety':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 20px', fontSize: 24 }}>Safety Toolkit</h2>
            <div style={{ padding: 16, background: soft, borderRadius: 14, marginBottom: 12 }}>
              <strong>Share trip</strong>
              <p style={{ color: muted, fontSize: 14, lineHeight: 1.5, marginBottom: 0 }}>
                Share your ride details with someone you trust.
              </p>
            </div>
            <div style={{ padding: 16, background: soft, borderRadius: 14 }}>
              <strong>Emergency</strong>
              <p style={{ color: muted, fontSize: 14, lineHeight: 1.5, marginBottom: 0 }}>
                If you are in immediate danger, contact local emergency services.
              </p>
            </div>
          </>
        )
      case 'settings':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 20px', fontSize: 24 }}>Settings</h2>
            <button
              type="button"
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              style={{ ...rowStyle, width: '100%', background: 'white', color: ink, textAlign: 'left', border: 0, borderBottom: `1px solid ${border}`, borderRadius: 0 }}
            >
              <span>Notifications</span>
              <span style={{ color: notificationsEnabled ? '#16834f' : muted }}>
                {notificationsEnabled ? 'On' : 'Off'}
              </span>
            </button>
            <h3 style={{ margin: '22px 0 4px', fontSize: 15 }}>Navigation</h3>
            {['Google Maps', 'Waze', 'BuddyRide Navigation'].map((app) =>
              optionButton(app, navigationApp === app, () => setNavigationApp(app)),
            )}
            <h3 style={{ margin: '22px 0 4px', fontSize: 15 }}>Language</h3>
            {['English', 'Sepedi', 'Zulu'].map((value) =>
              optionButton(value, language === value, () => setLanguage(value)),
            )}
            <h3 style={{ margin: '22px 0 4px', fontSize: 15 }}>Theme</h3>
            {['Light', 'Dark'].map((value) =>
              optionButton(value, theme === value, () => setTheme(value)),
            )}
            <h3 style={{ margin: '22px 0 4px', fontSize: 15 }}>Privacy</h3>
            {['Privacy information', 'Delete account'].map((label) => (
              <div key={label} style={{ ...rowStyle, color: label === 'Delete account' ? '#b42318' : ink }}>
                {label}
              </div>
            ))}
          </>
        )
      case 'help':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 16px', fontSize: 24 }}>Help & Support</h2>
            <div style={{ padding: 16, background: soft, borderRadius: 14 }}>
              <strong>BuddyRide Support Centre</strong>
              <p style={{ color: muted, fontSize: 14, lineHeight: 1.5 }}>
                For help with a trip, payment, or your account, contact the BuddyRide
                support team in Limpopo.
              </p>
              <div style={{ fontWeight: 600 }}>📞 Contact Support</div>
            </div>
          </>
        )
      case 'about':
        return (
          <>
            {backButton}
            <h2 style={{ margin: '0 0 16px', fontSize: 24 }}>About BuddyRide</h2>
            <div style={{ padding: 18, background: soft, borderRadius: 14 }}>
              <strong>BuddyRide</strong>
              <p style={{ color: muted, lineHeight: 1.6 }}>
                A local ride service connecting passengers and drivers across Limpopo.
              </p>
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
          aria-label="Open passenger menu"
          aria-expanded={isOpen}
          style={{
            width: 42,
            height: 42,
            padding: 0,
            borderRadius: '50%',
            background: 'white',
            border: `1px solid ${border}`,
            color: ink,
            fontSize: 20,
          }}
        >
          ☰
        </button>
      )}
      {isOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', fontFamily: 'Inter, system-ui, sans-serif', color: ink }}>
          <button
            type="button"
            aria-label="Close passenger menu"
            onClick={close}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, borderRadius: 0, background: 'rgba(0,0,0,0.48)' }}
          />
          <aside
            aria-label="Passenger menu"
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              width: 'min(85vw, 380px)',
              height: '100%',
              background: '#FFFFFF',
              color: '#000000',
              boxShadow: '12px 0 35px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '24px 20px 20px', borderBottom: `1px solid ${border}` }}>
              <img
                src={profile?.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`}
                alt={`${name} profile`}
                style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover', background: soft }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17, overflowWrap: 'anywhere' }}>{name}</div>
                <div style={{ color: muted, fontSize: 13, marginTop: 4 }}>{phone}</div>
                <div style={{ fontSize: 13, marginTop: 5 }}>{rating} ★</div>
              </div>
              <button type="button" onClick={() => setView('profile')} style={{ background: soft, color: ink, padding: '8px 10px', fontSize: 13 }}>
                Edit
              </button>
            </div>

            <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
              {menuItem('👤', 'Manage Account / Profile', 'profile')}
              {menuItem('🕘', 'My Trips / Ride History', 'trips')}
              {menuItem('💳', 'Wallet / Payment', 'wallet')}
              {menuItem('🎟️', 'Promotions / Promo Code', 'promos')}
              {menuItem('🛡️', 'Safety / Safety Toolkit', 'safety')}
              {menuItem('⚙️', 'Settings', 'settings')}
              {menuItem('❓', 'Help / Support Centre', 'help')}
              {menuItem('ℹ️', 'About BuddyRide', 'about')}
              <button
                type="button"
                onClick={onSignOut}
                style={{ ...itemStyle, color: '#b42318', borderBottom: 0 }}
              >
                <span style={iconStyle}>↩️</span>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>Log Out</span>
              </button>
            </nav>

            {view !== 'main' && (
              <section
                aria-label={`${view} screen`}
                style={{ position: 'absolute', inset: 0, zIndex: 2, padding: 20, background: 'white', color: ink, overflowY: 'auto' }}
              >
                {renderView()}
              </section>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  )
}

export default PassengerNavigationMenu
