import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AdminHome } from './pages/AdminHome'
import { PassengerHome } from './pages/PassengerHome'
import { supabase, type Profile, type Role } from './lib/supabase'
import { getProfile, checkSelfieLock } from './lib/auth'
import DriverDocuments from './pages/DriverDocuments'
import { AdminDocuments } from './pages/AdminDocuments'
import { AdminDashboard } from './pages/AdminDashboard'
import { AdminRides } from './pages/AdminRides'
import { AdminPassengers } from './pages/AdminPassengers'
import { AdminFinance } from './pages/AdminFinance'
import { AdminSupport } from './pages/AdminSupport'
import { AdminZones } from './pages/AdminZones'
import { AdminSettings } from './pages/AdminSettings'
import LandingPage from './pages/LandingPage'
import { DriverOnboarding } from './pages/DriverOnboarding'
import { DriverDashboardGuard } from './pages/DriverDashboardGuard'

const DriverHome = lazy(() => import('./pages/DriverHome').then(module => ({ default: module.DriverHome })))
const DriverNavigationView = lazy(() => import('./pages/DriverNavigationView').then(module => ({ default: module.DriverNavigationView })))

const ADMIN_EMAILS = ['buddyride@outlook.com', 'mokgalaka.nt@gmail.com'].map(e => e.toLowerCase())
const logoCandidates = ['/buddyride-logo.jpg', '/buddyride-logo-main.jpg', '/buddyridelogo.jpg']
const selfieSkipKey = (userId: string) => `buddyride_selfie_skip_${userId}`

async function compressSelfie(file: File): Promise<Blob> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = imageUrl
    await image.decode()

    const scale = Math.min(1, 800 / image.width, 800 / image.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare the selfie image')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Could not compress the selfie image'))
      }, 'image/jpeg', 0.7)
    })
    return compressed
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function Brand({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  if (failed) return <div className={`brand ${compact? 'brand-compact' : ''}`}><div><strong>BuddyRide</strong><span>Limpopo eHailing</span></div></div>
  return <div className={`brand ${compact? 'brand-compact' : ''}`}>
    <img src={logoCandidates[index]} onError={() => {
      if (index < logoCandidates.length - 1) setIndex((i: number) => i+1)
      else setFailed(true)
    }} alt="BuddyRide logo" />
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
  const [page, setPage] = useState<'home'|'landing'|'driver-docs'|'admin-docs'|'admin-documents'|'admin-dashboard'|'admin-rides'|'admin-passengers'|'admin-finance'|'admin-support'|'admin-zones'|'admin-settings'>('landing')
  const [showLanding, setShowLanding] = useState(true)
  const [showSelfieCheck, setShowSelfieCheck] = useState(false)
  const [selfieBusy, setSelfieBusy] = useState(false)
  const [verifiedAdminUserId, setVerifiedAdminUserId] = useState<string | null>(null)
  const [checkedAdminUserId, setCheckedAdminUserId] = useState<string | null>(null)
  const [adminToast, setAdminToast] = useState('')
  const [driverPath, setDriverPath] = useState(window.location.pathname)

  const navigateDriverPath = useCallback((path: string, replace = false) => {
    if (replace) window.history.replaceState(null, '', path)
    else window.history.pushState(null, '', path)
    setDriverPath(path)
  }, [])

  const isAdminEmail = ADMIN_EMAILS.includes(email.trim().toLowerCase())
  const shouldVerifyAdminAccess = Boolean(profile && (
    profile.role === 'admin'
    || page.startsWith('admin-')
    || ADMIN_EMAILS.includes((profile.email || '').toLowerCase())
  ))
  const hasAdminAccess = Boolean(profile && verifiedAdminUserId === profile.id)

  const loadProfile = useCallback(async (userId: string, userEmail: string | null, preferredRole?: Role, fullNameValue?: string, phoneValue?: string) => {
    try {
      let result = await getProfile(userId)
      let storedRole = result?.role ?? null
      const isOwner = userEmail ? ADMIN_EMAILS.includes(userEmail.toLowerCase()) : false
      
      if (!result) {
        let finalRole = preferredRole ?? 'passenger'
        if (finalRole === 'admin' && !isOwner) finalRole = 'passenger'
        storedRole = finalRole
        
        const upsertData: any = {
          id: userId,
          role: finalRole,
          full_name: fullNameValue ?? null,
          phone_number: phoneValue ?? null,
          phone: phoneValue ?? null,
          ...(finalRole === 'passenger' || finalRole === 'rider'
            ? { verification_status: 'verified', is_verified: true }
            : {}),
        }
        
        const { data, error } = await supabase.from('profiles').upsert(upsertData, { onConflict: 'id' }).select('*').single()
        if (error) throw error
        result = data as Profile
      } else {
        storedRole = result.role
        if (isOwner && preferredRole === 'admin' && result.role !== 'admin') {
          await supabase.from('profiles').update({ role: 'admin' } as any).eq('id', userId)
          result.role = 'admin'
        }
        if (preferredRole && preferredRole !== 'admin' && result.role !== preferredRole && !isOwner) {
          result = { ...result, role: preferredRole } as Profile
        }
      }
      if (storedRole === 'passenger' || storedRole === 'rider') {
        const verificationUpdate = {
          verification_status: 'verified',
          is_verified: true,
          ...(preferredRole === 'passenger' && storedRole === 'passenger' ? { role: 'passenger' } : {}),
        }
        const { data, error } = await supabase.from('profiles')
          .update(verificationUpdate as any)
          .eq('id', userId)
          .select('*')
          .single()
        if (error) throw error
        result = { ...result, ...data } as Profile
      }
      setProfile(result)
      setShowLanding(false)
      if (result.role === 'driver' && !window.location.pathname.startsWith('/driver/navigation/')) {
        const currentDriverPath = window.location.pathname
        const nextPath = /^\/driver\/(onboarding|dashboard)\/?$/.test(currentDriverPath)
          ? currentDriverPath
          : '/driver/onboarding'
        navigateDriverPath(nextPath, true)
      }
      
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        const userEmail = !error ? user?.email?.toLowerCase() : undefined
        if (userEmail && ADMIN_EMAILS.includes(userEmail)) {
          setShowSelfieCheck(false)
        } else {
          const canPass = await checkSelfieLock(userId)
          const skippedToday = localStorage.getItem(selfieSkipKey(userId)) === new Date().toISOString().split('T')[0]
          setShowSelfieCheck(!canPass && !skippedToday)
        }
      } catch {
        setShowSelfieCheck(false)
      }
    } catch (error: any) {
      setMessage(error instanceof Error ? error.message : 'Could not load your profile.')
      setProfile(null)
    }
  }, [navigateDriverPath])

  useEffect(() => {
    const t = window.setTimeout(() => setSplashVisible(false), 1900)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const handlePopState = () => setDriverPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) setMessage(error.message)
      if (data.session?.user) await loadProfile(data.session.user.id, data.session.user.email ?? null)
      if (active) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (!session?.user) { setProfile(null); setLoading(false); setShowLanding(true) }
      else { void loadProfile(session.user.id, session.user.email ?? null) }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadProfile])

  useEffect(() => {
    if (!profile || !shouldVerifyAdminAccess) {
      setVerifiedAdminUserId(null)
      return
    }

    let active = true
    void (async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!active) return
      const userEmail = user?.email?.toLowerCase()
      setCheckedAdminUserId(profile.id)
      if (error || !userEmail || !ADMIN_EMAILS.includes(userEmail)) {
        setVerifiedAdminUserId(null)
        setPage('home')
        window.history.replaceState(null, '', '/')
        setAdminToast(error ? `Could not verify admin access: ${error.message}` : 'Access denied: Admin only')
        return
      }
      setVerifiedAdminUserId(profile.id)
    })()
    return () => { active = false }
  }, [profile?.id, profile?.role, profile?.email, shouldVerifyAdminAccess])

  useEffect(() => {
    if (!adminToast) return
    const timeout = window.setTimeout(() => setAdminToast(''), 3000)
    return () => window.clearTimeout(timeout)
  }, [adminToast])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      if (mode === 'signup' && role === 'admin' && !isAdminEmail) throw new Error('Admin signup restricted to owner.')
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ 
          email: email.trim().toLowerCase(), 
          password, 
          options: { data: { role, full_name: fullName.trim(), phone: phone.trim() } } 
        })
        if (error) throw error
        if (data.session && data.user) await loadProfile(data.user.id, data.user.email ?? null, role, fullName.trim(), phone.trim())
        else { setMessage('Account created. Check email then log in.'); setMode('login') }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error) throw error;
        if (data.user) await loadProfile(data.user.id, data.user.email ?? null, role)
      }
    } catch (error: any) { setMessage(error instanceof Error ? error.message : 'Auth failed.') } finally { setBusy(false) }
  }

  async function handleSelfieUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setSelfieBusy(true)
    setMessage('')
    try {
      const compressed = await compressSelfie(file)
      const fileName = `${profile.id}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage.from('safety-selfies').upload(fileName, compressed, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      const today = new Date().toISOString().split('T')[0]
      const { error: profileError } = await supabase.from('profiles').update({ last_selfie_date: today, last_selfie_url: fileName } as any).eq('id', profile.id)
      if (profileError) console.error('Could not save selfie check date:', profileError.message)
      setShowSelfieCheck(false)
    } catch (error) {
      console.error('Safety Check selfie upload failed:', error)
      localStorage.setItem(selfieSkipKey(profile.id), new Date().toISOString().split('T')[0])
      setShowSelfieCheck(false)
    } finally { setSelfieBusy(false) }
  }

  function skipSelfieCheck() {
    if (profile) localStorage.setItem(selfieSkipKey(profile.id), new Date().toISOString().split('T')[0])
    setShowSelfieCheck(false)
  }

  if (loading || splashVisible) return <main className="splash splash-intro"><div className="splash-orbit"><Brand /></div><h1 className="splash-title">BuddyRide</h1><p>{loading? 'Getting your ride ready…' : 'Your ride. Your way.'}</p><div className="loading-dots"><i /><i /><i /></div></main>

  if (profile) {
    if (shouldVerifyAdminAccess && checkedAdminUserId !== profile.id && !adminToast) {
      return <main className="splash splash-intro"><div className="splash-orbit"><Brand /></div><h1 className="splash-title">BuddyRide</h1><p>Verifying admin access…</p><div className="loading-dots"><i /><i /><i /></div></main>
    }
    if (adminToast) {
      return <>
        <div role="status" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, padding: '12px 18px', borderRadius: 10, background: '#b91c1c', color: 'white', fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>{adminToast}</div>
        {profile.role === 'driver'
          ? <Suspense fallback={<main className="splash splash-intro">Loading driver tools…</main>}><DriverHome profile={profile} /></Suspense>
          : <PassengerHome profile={profile} />}
      </>
    }
    if (showSelfieCheck) {
      return <main className="auth-page"><section className="auth-card" style={{textAlign:'center'}}><Brand /><h1>Safety Check</h1><p style={{fontSize:'14px', marginBottom:'16px'}}>Safety first! Take a selfie to continue.</p><input type="file" accept="image/*" capture="user" onChange={handleSelfieUpload} style={{margin:'16px 0'}} />{selfieBusy && <p>Verifying...</p>}<button onClick={skipSelfieCheck} style={{ marginTop: 12, background: 'none', border: 'none', color: '#9ca3af', fontSize: 12 }}>Skip for now</button></section></main>
    }
    const navigationRideId = window.location.pathname.match(/^\/driver\/navigation\/([^/]+)\/?$/)?.[1]
    if (navigationRideId) {
      if (profile.role !== 'driver') return <main className="auth-page"><section className="auth-card"><h1>Driver access required</h1><p>This navigation screen is only available to the assigned driver.</p><button className="primary" onClick={() => window.location.assign('/')}>Back to home</button></section></main>
      return <Suspense fallback={<main className="splash splash-intro">Loading driver navigation…</main>}><DriverNavigationView rideId={navigationRideId} profile={profile} onBack={() => window.location.assign('/')} /></Suspense>
    }
    if (profile.role === 'driver') {
      const driverRoute = driverPath.replace(/\/+$/, '') || '/'
      if (driverRoute === '/driver/onboarding') {
        return <DriverOnboarding profile={profile} onDashboard={() => navigateDriverPath('/driver/dashboard', true)} />
      }
      if (driverRoute === '/driver/dashboard' || driverRoute === '/driver') {
        return <DriverDashboardGuard
          profile={profile}
          onRequireOnboarding={() => navigateDriverPath('/driver/onboarding', true)}
        >
          <Suspense fallback={<main className="splash splash-intro">Loading driver tools…</main>}><DriverHome profile={profile} /></Suspense>
        </DriverDashboardGuard>
      }
    }
    if (page === 'driver-docs') return <DriverDocuments driverId={profile.id} onBack={()=> setPage('home')} />
    if (hasAdminAccess && (page === 'admin-docs' || page === 'admin-documents')) return <AdminDocuments profile={profile} onBack={()=> setPage('home')} />
    if (hasAdminAccess && page === 'admin-dashboard') return <AdminDashboard onBack={()=> setPage('home')} />
    if (hasAdminAccess && page === 'admin-rides') return <AdminRides onBack={()=> setPage('home')} />
    if (hasAdminAccess && page === 'admin-passengers') return <AdminPassengers onBack={()=> setPage('home')} />
    if (hasAdminAccess && page === 'admin-finance') return <AdminFinance onBack={()=> setPage('home')} />
    if (hasAdminAccess && page === 'admin-support') return <AdminSupport onBack={()=> setPage('home')} />
    if (hasAdminAccess && page === 'admin-zones') return <AdminZones onBack={()=> setPage('home')} />
    if (hasAdminAccess && page === 'admin-settings') return <AdminSettings onBack={()=> setPage('home')} />
    if (hasAdminAccess) return <AdminHome profile={profile} onDocs={()=> setPage('admin-docs')} onAdminModule={(m: any) => setPage(m as any)} />
    if (profile.role === 'driver') {
      return <DriverOnboarding profile={profile} onDashboard={() => navigateDriverPath('/driver/dashboard', true)} />
    }
    return <PassengerHome profile={profile} />
  }

  if (showLanding) return <LandingPage onLogin={() => setShowLanding(false)} />

  return <main className="auth-page">
    <section className="auth-card" style={{position:'relative'}}>
      <div style={{position:'absolute', top:'0px', right:'0px'}}><button onClick={() => setRole(role==='admin'? 'passenger' : 'admin')} style={{ background: role==='admin'? '#111' : 'transparent', color: role==='admin'? 'white' : '#9ca3af', border: role==='admin'? '1px solid #111' : '1px solid transparent', fontSize:'10px', padding:'3px 8px', borderRadius:'999px' }}>{role==='admin'? '👑 admin ×' : '· admin'}</button></div>
      <button onClick={()=> setShowLanding(true)} style={{marginBottom:'10px', background:'none', border:'none', fontSize:'14px'}}>← Back to Home</button>
      <Brand /><h1>{mode === 'login'? 'Welcome back' : 'Create your account'}</h1>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'16px'}}>
        <button type="button" onClick={() => setRole('passenger')} style={{padding:'10px', borderRadius:'10px', fontWeight:600, border: role==='passenger'? '2px solid black' : '1px solid #e5e7eb', background: role==='passenger'? '#111' : 'white', color: role==='passenger'? 'white' : 'black'}}>👤 Passenger</button>
        <button type="button" onClick={() => setRole('driver')} style={{padding:'10px', borderRadius:'10px', fontWeight:600, border: role==='driver'? '2px solid black' : '1px solid #e5e7eb', background: role==='driver'? '#111' : 'white', color: role==='driver'? 'white' : 'black'}}>🚗 Driver</button>
      </div>
      <form onSubmit={submit}>
        {mode === 'signup' && <><label>Full name<input value={fullName} onChange={(e: any) => setFullName(e.target.value)} required /></label><label>Phone<input value={phone} onChange={(e: any) => setPhone(e.target.value)} required /></label></>}
        <label>Email<input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} required /></label>
        <button className="primary full-width" disabled={busy} type="submit">{busy? 'Wait…' : mode === 'login'? 'Log in' : 'Create account'}</button>
      </form>
      <button className="text-button full-width" type="button" onClick={() => { setMode(mode === 'login'? 'signup' : 'login'); setMessage('') }}>{mode === 'login'? 'No account? Sign up' : 'Already registered? Log in'}</button>
      {message && <div className="notice">{message}</div>}
    </section>
  </main>
}