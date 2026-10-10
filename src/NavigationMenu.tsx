import { useEffect, useState } from 'react'
import { Bell, CarFront, ChevronRight, CircleHelp, CreditCard, History, LogOut, MapPin, Menu, Navigation, Settings, ShieldCheck, UserRound, Wallet, X } from 'lucide-react'
import { supabase, type Profile, type Ride } from './lib/supabase'

type Section = 'home' | 'profile' | 'trips' | 'earnings' | 'saved' | 'payments' | 'safety' | 'help' | 'settings' | 'navigation'

export function NavigationMenu({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<Section>('home')
  const [rides, setRides] = useState<Ride[]>([])
  const [loadingRides, setLoadingRides] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [shareLocation, setShareLocation] = useState(true)
  const [savedHome, setSavedHome] = useState('')
  const [savedWork, setSavedWork] = useState('')
  // NAV SETTINGS - Bolt style
  const [navPref, setNavPref] = useState(() => localStorage.getItem('buddy_nav') || localStorage.getItem('nav_pref') || 'mapbox')
  const [navAutoStart, setNavAutoStart] = useState(() => localStorage.getItem('buddy_nav_autostart') === 'true' || localStorage.getItem('buddy_nav_autostart') === null)

  const isDriver = profile.role === 'driver'
  const isAdmin = profile.role === 'admin'

  useEffect(() => {
    if (section!== 'trips' && section!== 'earnings') return
    let cancelled = false
    const fetchRides = async () => {
      setLoadingRides(true)
      let query = supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(50)
      if (isDriver) query = query.eq('driver_id', profile.id)
      else if (!isAdmin) query = query.eq('passenger_id', profile.id)
      const { data } = await query
      if (!cancelled) {
        setRides((data || []) as Ride[])
        setLoadingRides(false)
      }
    }
    fetchRides()
    return () => {
      cancelled = true
    }
  }, [section, profile.id, isDriver, isAdmin])

  useEffect(() => {
    localStorage.setItem('buddy_nav', navPref)
    localStorage.setItem('nav_pref', navPref)
  }, [navPref])

  useEffect(() => {
    localStorage.setItem('buddy_nav_autostart', String(navAutoStart))
  }, [navAutoStart])

  const items: Array<{ id: Section; label: string; icon: typeof UserRound }> = isAdmin
   ? [
        { id: 'profile', label: 'Admin profile', icon: UserRound },
        { id: 'trips', label: 'Ride management', icon: History },
        { id: 'earnings', label: 'Platform earnings', icon: Wallet },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'safety', label: 'Safety centre', icon: ShieldCheck },
        { id: 'help', label: 'Help and support', icon: CircleHelp },
      ]
    : isDriver
     ? [
          { id: 'profile', label: 'My driver profile', icon: UserRound },
          { id: 'trips', label: 'Trip history', icon: History },
          { id: 'earnings', label: 'Earnings and payouts', icon: Wallet },
          { id: 'payments', label: 'Payment details', icon: CreditCard },
          { id: 'safety', label: 'Safety centre', icon: ShieldCheck },
          { id: 'help', label: 'Help and support', icon: CircleHelp },
          { id: 'settings', label: 'Settings', icon: Settings },
        ]
      : [
          { id: 'profile', label: 'My profile', icon: UserRound },
          { id: 'trips', label: 'My trips', icon: History },
          { id: 'saved', label: 'Saved places', icon: MapPin },
          { id: 'payments', label: 'Payment methods', icon: CreditCard },
          { id: 'safety', label: 'Safety centre', icon: ShieldCheck },
          { id: 'help', label: 'Help and support', icon: CircleHelp },
          { id: 'settings', label: 'Settings', icon: Settings },
        ]

  function choose(id: Section) {
    setSection(id)
    if (id === 'home') setOpen(false)
  }

  function renderSection() {
    if (section === 'profile')
      return (
        <div className="menu-content">
          <div className="profile-avatar"><UserRound size={28} /></div>
          <h2>{profile.full_name || 'BuddyRide member'}</h2>
          <p className="muted">{profile.email || 'No email set'}</p>
          <div className="menu-detail"><span>Account type</span><strong className="capitalize">{profile.role}</strong></div>
          <div className="menu-detail"><span>Phone</span><strong>{profile.phone || 'Not added yet'}</strong></div>
          <p className="menu-note">To change account details, update your profile in the BuddyRide account settings.</p>
        </div>
      )
    if (section === 'trips' || section === 'earnings') {
      const total = rides.filter(r => r.status === 'completed').reduce((sum, r) => sum + Number(isDriver? r.driver_earnings : isAdmin? r.buddyride_commission : r.total_fare), 0)
      return (
        <div className="menu-content">
          <h2>{section === 'earnings'? (isAdmin? 'Platform earnings' : 'Earnings and payouts') : isDriver? 'Trip history' : isAdmin? 'Ride management' : 'My trips'}</h2>
          {section === 'earnings' && (
            <div className="earnings-summary">
              <span>Completed rides total</span><strong>R {total.toFixed(2)}</strong>
              <small>{isDriver? 'Driver share - 80 percent' : isAdmin? 'BuddyRide commission - 20 percent' : 'Completed trip spend'}</small>
            </div>
          )}
          {loadingRides? (
            <p>Loading rides...</p>
          ) : rides.length? (
            rides.map(ride => (
              <article className="menu-ride" key={ride.id}>
                <div><strong>{ride.pickup_address || 'Pickup not recorded'}</strong><span>to {ride.dropoff_address || 'Destination not recorded'}</span><small>{String(ride.status).replaceAll('_', ' ')}</small></div>
                <b>R {Number(isDriver? ride.driver_earnings : isAdmin? ride.buddyride_commission : ride.total_fare).toFixed(2)}</b>
              </article>
            ))
          ) : (
            <p className="menu-note">No rides to show yet.</p>
          )}
        </div>
      )
    }
    if (section === 'saved')
      return (
        <div className="menu-content">
          <h2>Saved places</h2>
          <label>Home address<input value={savedHome} onChange={e => setSavedHome(e.target.value)} placeholder="Enter your home address" /></label>
          <label>Work address<input value={savedWork} onChange={e => setSavedWork(e.target.value)} placeholder="Enter your work address" /></label>
        </div>
      )
    if (section === 'payments')
      return (
        <div className="menu-content">
          <h2>{isDriver? 'Payment details' : 'Payment methods'}</h2>
          <div className="menu-info-card"><CreditCard /><div><strong>Payment setup</strong><p>Payment processing is not connected in this version.</p></div></div>
        </div>
      )
    if (section === 'safety')
      return (
        <div className="menu-content">
          <h2>Safety centre</h2>
          <div className="menu-info-card"><ShieldCheck /><div><strong>Travel safely</strong><p>Confirm vehicle and driver details before starting a trip.</p></div></div>
        </div>
      )
    if (section === 'help')
      return (
        <div className="menu-content">
          <h2>Help and support</h2>
          <div className="menu-info-card"><CircleHelp /><div><strong>Need help?</strong><p>Contact the BuddyRide support team.</p></div></div>
        </div>
      )
    if (section === 'navigation')
      return (
        <div className="menu-content">
          <button onClick={() => setSection('settings')} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, opacity: 0.8 }}><ChevronRight style={{ transform: 'rotate(180deg)' }} size={18} /> Back</button>
          <h2>Navigation</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Set your default navigation and reach it faster during the trip.</p>

          <h3 style={{ fontSize: 14, margin: '16px 0 8px' }}>Default navigation</h3>

          <button onClick={() => setNavPref('mapbox')} style={{ width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12, border: navPref==='mapbox'? '2px solid #00d181':'1px solid #333', background: navPref==='mapbox'? '#1a2e22':'transparent', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>Buddy navigation</strong><br/><small style={{ opacity: 0.6 }}>In-app Mapbox - 3D</small></span>
            {navPref==='mapbox' && <span style={{ background: '#00d181', color: 'white', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>Recommended</span>}
          </button>

          <button onClick={() => setNavPref('google')} style={{ width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12, border: navPref==='google'? '2px solid #00d181':'1px solid #333', background: 'transparent', marginBottom: 10 }}>
            <strong>Google Maps</strong>
          </button>

          <button onClick={() => setNavPref('waze')} style={{ width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12, border: navPref==='waze'? '2px solid #00d181':'1px solid #333', background: 'transparent', marginBottom: 20 }}>
            <strong>Waze</strong>
          </button>

          <div className="setting-row"><div><Navigation size={19} /><span><strong>Navigation auto-start</strong><small>Auto start navigation when ride starts</small></span></div><button className={`switch ${navAutoStart? 'switch-on' : ''}`} onClick={() => setNavAutoStart(v =>!v)}>{navAutoStart? 'On' : 'Off'}</button></div>
        </div>
      )
    if (section === 'settings')
      return (
        <div className="menu-content">
          <h2>Settings</h2>
          <div className="setting-row" onClick={() => setSection('navigation')} style={{ cursor: 'pointer' }}><div><Navigation size={19} /><span><strong>Navigation</strong><small>{navPref==='mapbox'? 'Buddy navigation • Recommended' : navPref==='google'? 'Google Maps' : 'Waze'} {navAutoStart? '• Auto-start on' : ''}</small></span></div><ChevronRight size={17} /></div>
          <div className="setting-row"><div><Bell size={19} /><span><strong>Notifications</strong><small>Ride updates and account alerts</small></span></div><button className={`switch ${notifications? 'switch-on' : ''}`} onClick={() => setNotifications(v =>!v)}>{notifications? 'On' : 'Off'}</button></div>
          <div className="setting-row"><div><MapPin size={19} /><span><strong>Location access</strong><small>Allow location features while using the app</small></span></div><button className={`switch ${shareLocation? 'switch-on' : ''}`} onClick={() => setShareLocation(v =>!v)}>{shareLocation? 'On' : 'Off'}</button></div>
        </div>
      )
    return (
      <div className="menu-content">
        <h2>Welcome to BuddyRide1</h2><p>Choose an option from the menu to manage your account and rides.</p>
        <div className="menu-info-card"><CarFront /><div><strong>Ready for your next trip?</strong><p>Close this menu to return to the ride screen.</p></div></div>
      </div>
    )
  }

  return (
    <>
      <button className="menu-trigger" onClick={() => { setOpen(true); setSection('home') }}><Menu size={23} /><span>Menu</span></button>
      {open && (
        <div className="menu-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <aside className="side-drawer">
            <div className="drawer-head"><div className="drawer-brand"><img src="/logos/app-icon.png" alt="BuddyRide" /><div><strong>BuddyRide1</strong><small>{isDriver? 'Driver' : isAdmin? 'Administrator' : 'Your ride, your way'}</small></div></div><button className="drawer-close" onClick={() => setOpen(false)}><X /></button></div>
            <div className="drawer-user"><div className="user-avatar"><UserRound /></div><div><strong>{profile.full_name || 'BuddyRide member'}</strong><small>{profile.email}</small></div></div>
            <nav className="drawer-nav">{items.map(item => { const Icon = item.icon; return <button key={item.id} className={section === item.id? 'active' : ''} onClick={() => choose(item.id)}><Icon size={19} /><span>{item.label}</span><ChevronRight className="nav-chevron" size={17} /></button> })}</nav>
            <button className="drawer-logout" onClick={onSignOut}><LogOut size={18} /> Sign out</button>
            <div className="drawer-main">{renderSection()}</div>
          </aside>
        </div>
      )}
    </>
  )
}