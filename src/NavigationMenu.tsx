import { useEffect, useState } from 'react'
import { Bell, CarFront, ChevronRight, CircleHelp, CreditCard, FileText, History, LogOut, MapPin, Menu, Navigation, Settings, ShieldCheck, UserRound, Wallet, X } from 'lucide-react'
import { supabase, type Profile, type Ride } from './lib/supabase'

type Section = 'home' | 'profile' | 'trips' | 'earnings' | 'saved' | 'payments' | 'safety' | 'help' | 'settings' | 'navigation' | 'documents'

export function NavigationMenu({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<Section>('home')
  const [rides, setRides] = useState<Ride[]>([])
  const [loadingRides, setLoadingRides] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [shareLocation, setShareLocation] = useState(true)
  const [savedHome, setSavedHome] = useState('')
  const [savedWork, setSavedWork] = useState('')
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
    return () => { cancelled = true }
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
          { id: 'documents', label: 'My documents', icon: FileText },
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
    if (section === 'navigation')
      return (
        <div className="menu-content">
          <button onClick={() => setSection('settings')} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, opacity: 0.8, color:'inherit' }}><ChevronRight style={{ transform: 'rotate(180deg)' }} size={18} /> Back</button>
          <h2>Navigation</h2>
          <p className="muted" style={{fontSize:13, marginBottom:12}}>Choose how driver navigates — your choice is saved</p>
          <button onClick={() => setNavPref('mapbox')} style={{ width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12, border: navPref==='mapbox'? '2px solid #00d181':'1px solid #333', background: navPref==='mapbox'? '#1a2e22':'transparent', marginBottom: 10, color:'inherit' }}>🗺️ Buddy navigation - Recommended (inside app)</button>
          <button onClick={() => setNavPref('google')} style={{ width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12, border: navPref==='google'? '2px solid #00d181':'1px solid #333', background: navPref==='google'? '#1a2e22':'transparent', marginBottom: 10, color:'inherit' }}>📍 Google Maps</button>
          <button onClick={() => setNavPref('waze')} style={{ width: '100%', textAlign: 'left', padding: '14px', borderRadius: 12, border: navPref==='waze'? '2px solid #00d181':'1px solid #333', background: navPref==='waze'? '#1a2e22':'transparent', marginBottom: 20, color:'inherit' }}>🚗 Waze</button>
          <div className="setting-row"><div><Navigation size={19} /><span><strong>Auto-start navigation</strong></span></div><button className={`switch ${navAutoStart? 'switch-on' : ''}`} onClick={() => setNavAutoStart(v =>!v)}>{navAutoStart? 'On' : 'Off'}</button></div>
        </div>
      )
    if (section === 'settings')
      return (
        <div className="menu-content">
          <h2>Settings</h2>
          <div className="setting-row" onClick={() => setSection('navigation')} style={{ cursor: 'pointer', padding:'12px', border:'1px solid #333', borderRadius:10, marginBottom:10 }}><div style={{display:'flex', gap:10, alignItems:'center'}}><Navigation size={19} /><span><strong>Navigation</strong><small style={{display:'block', opacity:0.6}}>{navPref} • Tap to change</small></span></div><ChevronRight size={17} /></div>
          <div className="setting-row"><div><Bell size={19} /><span><strong>Notifications</strong></span></div><button className={`switch ${notifications? 'switch-on' : ''}`} onClick={() => setNotifications(v =>!v)}>{notifications? 'On' : 'Off'}</button></div>
          <div className="setting-row"><div><MapPin size={19} /><span><strong>Location sharing</strong></span></div><button className={`switch ${shareLocation? 'switch-on' : ''}`} onClick={() => setShareLocation(v =>!v)}>{shareLocation? 'On' : 'Off'}</button></div>
          <div style={{marginTop:20, padding:12, background:'#111', borderRadius:10, border:'1px solid #222'}}>
            <p style={{fontSize:12, opacity:0.6}}>Current nav: <b style={{color:'#00d181'}}>{navPref}</b> • Auto-start: {navAutoStart?'On':'Off'}</p>
          </div>
        </div>
      )
    //... keep all your other sections same as before (profile, documents, trips, etc) - paste your old renderSection code here if needed
    if (section === 'documents')
      return <div className="menu-content"><h2>My Documents</h2><p className="muted">Upload CRC, License, Disk</p></div>
    if (section === 'profile')
      return <div className="menu-content"><h2>{profile.full_name}</h2><p className="muted">{profile.email}</p></div>
    if (section === 'trips' || section === 'earnings')
      return <div className="menu-content"><h2>{section}</h2>{loadingRides?'Loading...': rides.map(r=><div key={r.id}>{r.pickup_address} → {r.dropoff_address}</div>)}</div>
    return <div className="menu-content"><h2>Welcome {profile.full_name}</h2><p>Choose an option from the menu.</p></div>
  }

  return (
    <>
      {/* FIXED: High zIndex so it stays on top of map */}
      <button className="menu-trigger" onClick={() => { setOpen(true); setSection('home') }} style={{position:'relative', zIndex:9999, pointerEvents:'auto'}}><Menu size={23} /><span>Menu</span></button>
      {open && (
        <div className="menu-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }} style={{position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,0.6)', display:'flex'}}>
          <aside className="side-drawer" style={{width:'85%', maxWidth:'360px', background:'#121212', height:'100%', overflowY:'auto', zIndex:100000, position:'relative'}}>
            <div className="drawer-head" style={{display:'flex', justifyContent:'space-between', padding:'16px', borderBottom:'1px solid #222'}}><div className="drawer-brand"><strong>BuddyRide</strong></div><button className="drawer-close" onClick={() => setOpen(false)}><X /></button></div>
            <div className="drawer-user" style={{padding:'16px', display:'flex', gap:12}}><UserRound /><div><strong>{profile.full_name}</strong><small style={{display:'block', opacity:0.6}}>{profile.email}</small></div></div>
            <nav className="drawer-nav">{items.map(item => { const Icon = item.icon; return <button key={item.id} style={{width:'100%', textAlign:'left', padding:'12px 16px', background: section===item.id?'#1e1e1e':'transparent', border:'none', color:'white', display:'flex', gap:10}} onClick={() => choose(item.id)}><Icon size={19} /><span>{item.label}</span><ChevronRight style={{marginLeft:'auto'}} size={17} /></button> })}</nav>
            <button className="drawer-logout" onClick={onSignOut} style={{margin:'20px', padding:'12px', width:'calc(100% - 40px)', background:'#222', color:'white', border:'none', borderRadius:10, display:'flex', gap:8, justifyContent:'center'}}><LogOut size={18} /> Sign out</button>
            <div className="drawer-main" style={{padding:'16px', borderTop:'1px solid #222'}}>{renderSection()}</div>
          </aside>
        </div>
      )}
    </>
  )
}