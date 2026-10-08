import { useCallback, useEffect, useState } from 'react'
import { AdminHome } from './pages/AdminHome'
import { DriverHome } from './pages/DriverHome'
import { PassengerHome } from './pages/PassengerHome'
import { supabase, type Profile, type Role } from './lib/supabase'
import { getProfile } from './lib/auth'

const logoCandidates = ['/buddyride-logo-main.jpg', '/buddyridelogo.jpg', '/logos/app-icon.png', '/favicon.png']

function Brand({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}>
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

  const loadProfile = useCallback(async (userId: string, userEmail: string | null) => {
    try {
      let result = await getProfile(userId)
      if (!result) {
        const { data, error } = await supabase.from('profiles').upsert({
          id: userId,
          email: userEmail,
          role: 'passenger',
        }, { onConflict: 'id' }).select('*').single()
        if (error) throw error
        result = data as Profile
      }
      setProfile(result)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load your profile. Check your Supabase tables and policies.')
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
      if (data.session?.user) await loadProfile(data.session.user.id, data.session.user.email ?? null)
      if (active) setLoading(false)
    }).catch((error: unknown) => {
      if (active) {
        setMessage(error instanceof Error ? error.message : 'Unable to connect to Supabase.')
        setLoading(false)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (!session?.user) {
        setProfile(null)
        setLoading(false)
      } else {
        window.setTimeout(() => { void loadProfile(session.user.id, session.user.email ?? null) }, 0)
      }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadProfile])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { role, full_name: fullName.trim(), phone: phone.trim() } },
        })
        if (error) throw error
        if (data.session && data.user) {
          await loadProfile(data.user.id, data.user.email ?? null)
        } else {
          setMessage('Account created. Check your email to confirm your account, then log in.')
          setMode('login')
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error) throw error
        if (data.user) await loadProfile(data.user.id, data.user.email ?? null)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
    else { setProfile(null); setPassword(''); setMessage('') }
  }

  if (loading || splashVisible) return <main className="splash splash-intro"><div className="splash-orbit"><Brand /></div><h1 className="splash-title">BuddyRide1</h1><p>{loading ? 'Getting your ride ready…' : 'Your ride. Your way.'}</p><div className="loading-dots"><i /><i /><i /></div></main>

  if (profile) {
    if (profile.role === 'driver') return <DriverHome profile={profile} />
    if (profile.role === 'admin') return <AdminHome profile={profile} />
    return <PassengerHome profile={profile} />
  }

  return <main className="auth-page">
    <section className="auth-card">
      <Brand />
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="muted">{mode === 'login' ? 'Log in to continue your journey.' : 'Join your local ride community.'}</p>
      <div className="role-row" aria-label="Choose account type">
        <button type="button" className={role === 'passenger' ? 'selected passenger-role' : ''} onClick={() => setRole('passenger')}>👤 Passenger</button>
        <button type="button" className={role === 'driver' ? 'selected driver-role' : ''} onClick={() => setRole('driver')}>🚗 Driver</button>
      </div>
      <form onSubmit={submit}>
        {mode === 'signup' && <>
          <label>Full name<input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Your full name" /></label>
          <label>Phone number<input autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="e.g. 071 234 5678" /></label>
        </>}
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} value={password} onChange={e => setPassword(e.target.value)} required placeholder="At least 6 characters" /></label>
        <button className="primary full-width" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <button className="text-button full-width" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>
        {mode === 'login' ? 'No account? Sign up' : 'Already registered? Log in'}
      </button>
      {message && <div className="notice" role="status">{message}</div>}
      <p className="auth-foot">Your community connection · Limpopo, South Africa</p>
    </section>
  </main>
}
