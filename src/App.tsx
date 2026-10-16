import { useCallback, useEffect, useState } from 'react'
import { AdminHome } from './pages/AdminHome'
import { DriverHome } from './pages/DriverHome'
import { PassengerHome } from './pages/PassengerHome'
import { supabase, type Profile, type Role } from './lib/supabase'
import { getProfile } from './lib/auth'
import { DriverDocuments } from './pages/DriverDocuments'
import { PassengerDocuments } from './pages/PassengerDocuments'
import { AdminDocuments } from './pages/AdminDocuments'
import LandingPage from './pages/LandingPage'

// ONLY THESE EMAILS CAN BE ADMIN
const ADMIN_EMAILS = ['mokgalaka.nt@gmail.com']

const logoCandidates = ['/buddyride-logo-main.jpg', '/buddyridelogo.jpg', '/logos/app-icon.png', '/favicon.png']
function Brand({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  return <div className={`brand ${compact? 'brand-compact' : ''}`}>
    <img src={logoCandidates[index]} onError={() => setIndex((current) => Math.min(current + 1, logoCandidates.length - 1))} alt="BuddyRide logo" />
    <div><strong>BuddyRide</strong><span>Limpopo eHailing</span></div>
  </div>
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [splashVisible, setSplashVisible] = useState(true)
  const [role, setRole] = useState<Role>('passenger')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<'home'|'landing'|'driver-docs'|'passenger-docs'|'admin-docs'>('landing')
  const [showLanding, setShowLanding] = useState(true)

  const isAdminEmail = ADMIN_EMAILS.includes(email.trim().toLowerCase())

  const loadProfile = useCallback(async (userId: string, userEmail: string | null, preferredRole?: Role, fullNameValue?: string, phoneValue?: string) => {
    try {
      let result = await getProfile(userId)
      if (!result) {
        // SECURITY: Only allow admin role if email is in whitelist
        let finalRole = preferredRole?? 'passenger'
        if (finalRole === 'admin' && userEmail &&!ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
          // Check if they were added as staff in profiles
          const { data: existing } = await supabase.from('profiles').select('role').eq('id', userId).single()
          if (existing?.role!== 'admin') finalRole = 'passenger'
        }
        const { data, error } = await supabase.from('profiles').upsert({
          id: userId, email: userEmail, role: finalRole,
          full_name: fullNameValue?? null, phone: phoneValue?? null,
        }, { onConflict: 'id' }).select('*').single()
        if (error) throw error
        result = data as Profile
      }
      setProfile(result)
      setShowLanding(false)
    } catch (error) {
      setMessage(error instanceof Error? error.message : 'Could not load your profile.')
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setSplashVisible(false), 1900)
    return () => window.clearTimeout(splashTimer)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) setMessage(error.message)
      if (data.session?.user) await loadProfile(data.session.user.id, data.session.user.email?? null, data.session.user.user_metadata?.role as Role?? 'passenger', data.session.user.user_metadata?.full_name, data.session.user.user_metadata?.phone)
      if (active) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) { setProfile(null); setLoading(false) }
      else { void loadProfile(session.user.id, session.user.email?? null) }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadProfile])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      // BLOCK non-whitelisted admin signup
      if (mode === 'signup' && role === 'admin' &&!isAdminEmail) {
        throw new Error('Admin signup restricted. Only owner can create admin.')
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { role, full_name: fullName.trim(), phone: phone.trim() } } })
        if (error) throw error
        if (data.session && data.user) await loadProfile(data.user.id, data.user.email?? null, role, fullName.trim(), phone.trim())
        else { setMessage('Account created. Check email then log in.'); setMode('login') }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error) throw error; if (data.user) await loadProfile(data.user.id, data.user.email?? null)
      }
    } catch (error) { setMessage(error instanceof Error? error.message : 'Auth failed.') } finally { setBusy(false) }
  }

  if (loading || splashVisible) return <main className="splash splash-intro"><div className="splash-orbit"><Brand /></div><h1 className="splash-title">BuddyRide</h1><p>{loading? 'Getting your ride ready…' : 'Your ride. Your way.'}</p><div className="loading-dots"><i /><i /><i /></div></main>

  if (profile) {
    if (page === 'driver-docs') return <DriverDocuments driverId={profile.id} onBack={()=> setPage('home')} />
    if (page === 'passenger-docs') return <PassengerDocuments profile={profile} onBack={()=> setPage('home')} />
    if (page === 'admin-docs') return <AdminDocuments profile={profile} onBack={()=> setPage('home')} />

    const DocsButton = () => (
      <div style={{ position:'fixed', bottom:'80px', left:'16px', right:'16px', zIndex:999 }}>
        {profile.role==='driver' && <button onClick={()=> setPage('driver-docs')} style={{ width:'100%', padding:'14px', borderRadius:'12px', background:'#ff7a00', color:'white', fontWeight:'bold', border:'none' }}>📄 My Documents (6)</button>}
        {profile.role==='passenger' && <button onClick={()=> setPage('passenger-docs')} style={{ width:'100%', padding:'14px', borderRadius:'12px', background:'#ff7a00', color:'white', fontWeight:'bold', border:'none' }}>🛡️ Verify ID</button>}
        {profile.role==='admin' && <button onClick={()=> setPage('admin-docs')} style={{ width:'100%', padding:'14px', borderRadius:'12px', background:'#000', color:'white', fontWeight:'bold', border:'none' }}>👑 Approve Documents</button>}
      </div>
    )

    if (profile.role === 'driver') return <><DriverHome profile={profile} /><DocsButton /></>
    if (profile.role === 'admin') return <><AdminHome profile={profile} /><DocsButton /></>
    return <><PassengerHome profile={profile} /><DocsButton /></>
  }

  if (showLanding) {
    return (
      <div>
        <LandingPage />
        <div style={{position:'fixed', bottom:'20px', left:'50%', transform:'translateX(-50%)', zIndex:100, display:'flex', gap:'10px'}}>
          <button onClick={()=> setShowLanding(false)} style={{padding:'12px 24px', borderRadius:'999px', background:'black', color:'white', fontWeight:'bold', border:'none', cursor:'pointer'}}>Skip to Login →</button>
        </div>
      </div>
    )
  }

  return <main className="auth-page">
    <section className="auth-card">
      <button onClick={()=> setShowLanding(true)} style={{marginBottom:'10px', background:'none', border:'none', cursor:'pointer', fontSize:'14px'}}>← Back to Home</button>
      <Brand /><h1>{mode === 'login'? 'Welcome back' : 'Create your account'}</h1>

      <div className="role-row" style={{display:'grid', gridTemplateColumns: isAdminEmail? '1fr 1fr 1fr' : '1fr 1fr', gap:'8px', marginBottom:'16px'}}>
        <button type="button" onClick={() => setRole('passenger')} style={{padding:'10px', borderRadius:'10px', fontWeight:600, border: role==='passenger'? '2px solid black' : '1px solid #e5e7eb', background: role==='passenger'? '#111' : 'white', color: role==='passenger'? 'white' : 'black'}}>👤 Passenger</button>
        <button type="button" onClick={() => setRole('driver')} style={{padding:'10px', borderRadius:'10px', fontWeight:600, border: role==='driver'? '2px solid black' : '1px solid #e5e7eb', background: role==='driver'? '#111' : 'white', color: role==='driver'? 'white' : 'black'}}>🚗 Driver</button>
        {isAdminEmail && <button type="button" onClick={() => setRole('admin')} style={{padding:'10px', borderRadius:'10px', fontWeight:700, border: role==='admin'? '2px solid black' : '1px solid #e5e7eb', background: role==='admin'? '#111827' : 'white', color: role==='admin'? 'white' : 'black'}}>👑 Admin</button>}
      </div>

      <form onSubmit={submit}>
        {mode === 'signup' && <><label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} required /></label><label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} required /></label></>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <button className="primary full-width" disabled={busy} type="submit">{busy? 'Wait…' : mode === 'login'? 'Log in' : 'Create account'}</button>
      </form>
      <button className="text-button full-width" type="button" onClick={() => { setMode(mode === 'login'? 'signup' : 'login'); setMessage('') }}>{mode === 'login'? 'No account? Sign up' : 'Already registered? Log in'}</button>
      {message && <div className="notice">{message}</div>}
      {mode==='signup' && role==='admin' &&!isAdminEmail && <div style={{marginTop:'10px', color:'#dc2626', fontSize:'13px'}}>Admin is restricted to owner only</div>}
    </section>
  </main>
}