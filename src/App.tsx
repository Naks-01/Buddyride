import { useCallback, useEffect, useState } from 'react'
import { AdminHome } from './pages/AdminHome'
import { DriverHome } from './pages/DriverHome'
import { PassengerHome } from './pages/PassengerHome'
import { supabase, type Profile, type Role } from './lib/supabase'
import { getProfile } from './lib/auth'
import { DriverDocuments } from './pages/DriverDocuments'
import { PassengerDocuments } from './pages/PassengerDocuments'
import { AdminDocuments } from './pages/AdminDocuments'

const logoCandidates = ['/buddyride-logo-main.jpg', '/buddyridelogo.jpg', '/logos/app-icon.png', '/favicon.png']
function Brand({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  return <div className={`brand ${compact? 'brand-compact' : ''}`}>
    <img src={logoCandidates[index]} onError={() => setIndex((current) => Math.min(current + 1, logoCandidates.length - 1))} alt="BuddyRide logo" />
    <div><strong>BuddyRide1</strong><span>Limpopo eHailing</span></div>
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
  const [page, setPage] = useState<'home'|'driver-docs'|'passenger-docs'|'admin-docs'>('home')

  const loadProfile = useCallback(async (userId: string, userEmail: string | null, preferredRole?: Role, fullNameValue?: string, phoneValue?: string) => {
    try {
      let result = await getProfile(userId)
      if (!result) {
        const { data, error } = await supabase.from('profiles').upsert({
          id: userId, email: userEmail, role: preferredRole?? 'passenger',
          full_name: fullNameValue?? null, phone: phoneValue?? null,
        }, { onConflict: 'id' }).select('*').single()
        if (error) throw error
        result = data as Profile
      }
      setProfile(result)
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

  if (loading || splashVisible) return <main className="splash splash-intro"><div className="splash-orbit"><Brand /></div><h1 className="splash-title">BuddyRide1</h1><p>{loading? 'Getting your ride ready…' : 'Your ride. Your way.'}</p><div className="loading-dots"><i /><i /><i /></div></main>

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

  return <main className="auth-page">
    <section className="auth-card"><Brand /><h1>{mode === 'login'? 'Welcome back' : 'Create your account'}</h1>
      <div className="role-row"><button type="button" className={role === 'passenger'? 'selected passenger-role' : ''} onClick={() => setRole('passenger')}>👤 Passenger</button><button type="button" className={role === 'driver'? 'selected driver-role' : ''} onClick={() => setRole('driver')}>🚗 Driver</button></div>
      <form onSubmit={submit}>
        {mode === 'signup' && <><label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} required /></label><label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} required /></label></>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <button className="primary full-width" disabled={busy} type="submit">{busy? 'Wait…' : mode === 'login'? 'Log in' : 'Create account'}</button>
      </form>
      <button className="text-button full-width" type="button" onClick={() => { setMode(mode === 'login'? 'signup' : 'login'); setMessage('') }}>{mode === 'login'? 'No account? Sign up' : 'Already registered? Log in'}</button>
      {message && <div className="notice">{message}</div>}
    </section>
  </main>
}