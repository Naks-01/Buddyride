import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AdminHome } from './pages/AdminHome'
import { supabase, type Profile, type Role } from './lib/supabase'
import { getProfile, signUp as createAccount, sendSmsOtp, verifySmsOtp } from './lib/auth'
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
import { DriverPendingPage } from './pages/DriverPendingPage'
import { getDriverEntryPath } from './lib/driverRouting.mjs'
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

const DriverHome = lazy(() => import('./pages/DriverHome').then(module => ({ default: module.DriverHome })))
const DriverNavigationView = lazy(() => import('./pages/DriverNavigationView').then(module => ({ default: module.DriverNavigationView })))
const PassengerHome = lazy(() => import('./pages/PassengerHome').then(module => ({ default: module.PassengerHome })))

const ADMIN_EMAIL = 'buddyride@outlook.com'
const logoCandidates = ['/buddyride-logo.jpg', '/buddyride-logo-main.jpg', '/buddyridelogo.jpg']

function Brand({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  if (failed) return <div className={'brand ' + (compact ? 'brand-compact' : '')}><div><strong>BuddyRide</strong><span>Limpopo eHailing</span></div></div>
  return <div className={'brand ' + (compact ? 'brand-compact' : '')}>
    <img src={logoCandidates[index]} onError={() => { if (index < logoCandidates.length - 1) setIndex((i: number) => i + 1); else setFailed(true) }} alt="BuddyRide logo" />
    <div><strong>BuddyRide</strong><span>Limpopo eHailing</span></div>
  </div>
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [splashVisible, setSplashVisible] = useState(true)
  const [role, setRole] = useState<Exclude<Role, 'admin'> | null>(null)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<'home' | 'landing' | 'driver-docs' | 'admin-docs' | 'admin-documents' | 'admin-dashboard' | 'admin-rides' | 'admin-passengers' | 'admin-finance' | 'admin-support' | 'admin-zones' | 'admin-settings'>('landing')
  const [showLanding, setShowLanding] = useState(true)
  const [verifiedAdminUserId, setVerifiedAdminUserId] = useState<string | null>(null)
  const [checkedAdminUserId, setCheckedAdminUserId] = useState<string | null>(null)
  const [adminToast, setAdminToast] = useState('')
  const [driverPath, setDriverPath] = useState(window.location.pathname)
  const [currentPath, setCurrentPath] = useState(window.location.pathname)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [otpStep, setOtpStep] = useState<'details' | 'otp'>('details')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)

  const navigateDriverPath = useCallback((path: string, replace = false) => {
    if (replace) window.history.replaceState(null, '', path)
    else window.history.pushState(null, '', path)
    setDriverPath(path)
    setCurrentPath(path)
  }, [])

  const shouldVerifyAdminAccess = Boolean(profile && (profile.role === 'admin' || currentPath === '/admin' || currentPath.startsWith('/admin/')))
  const hasAdminAccess = Boolean(profile && profile.role === 'admin' && profile.email?.trim().toLowerCase() === ADMIN_EMAIL && verifiedAdminUserId === profile.id)

  const loadProfile = useCallback(async (userId: string, userEmail: string | null, preferredRole?: Role, fullNameValue?: string, phoneValue?: string) => {
    setLoading(true)
    try {
      let result = await getProfile(userId)
      const emailLower = userEmail?.toLowerCase().trim() || null
      const isAdminUser = emailLower === ADMIN_EMAIL
      if (isAdminUser) {
        if (!result) {
          const { data, error } = await supabase.from('profiles').upsert({ id: userId, email: emailLower, role: 'admin', full_name: fullNameValue ?? null, phone_number: phoneValue ?? null, phone: phoneValue ?? null, verification_status: 'verified', is_verified: true, } as any, { onConflict: 'id' }).select('*').single()
          if (error) throw error
          result = data as Profile
        } else if (result.role !== 'admin') {
          const { data } = await supabase.from('profiles').update({ role: 'admin', verification_status: 'verified', is_verified: true } as any).eq('id', userId).select('*').single()
          result = (data as Profile) || result
        }
        setProfile(result); setShowLanding(false); setLoading(false); return
      }
      if (!result) {
        let finalRole: Role = preferredRole === 'driver' ? 'driver' : 'passenger'
        const pending = localStorage.getItem('buddyride_pending_role') as Role | null
        if (pending === 'driver' || pending === 'passenger') finalRole = pending
        const { data, error } = await supabase.from('profiles').upsert({ id: userId, email: emailLower, role: finalRole, full_name: fullNameValue ?? null, phone_number: phoneValue ?? null, phone: phoneValue ?? null, verification_status: finalRole === 'passenger' ? 'verified' : 'not_started', is_verified: finalRole === 'passenger', } as any, { onConflict: 'id' }).select('*').single()
        if (error) throw error
        result = data as Profile
        localStorage.removeItem('buddyride_pending_role')
      } else {
        localStorage.removeItem('buddyride_pending_role')
        if (result.role === 'admin') {
          const { data } = await supabase.from('profiles').update({ role: 'passenger' } as any).eq('id', userId).select('*').single()
          if (data) result = data as Profile
        }
      }
      setProfile(result); setShowLanding(false)
      if (result.role === 'driver') {
        // FIX ONLY: identity_complete → dashboard, not onboarding
        const vs = String((result as any).verification_status || '').toLowerCase()
        if (vs === 'identity_complete') {
          if (window.location.pathname !== '/driver/dashboard' && window.location.pathname !== '/driver') navigateDriverPath('/driver/dashboard', true)
          return
        }
        const driverEntryPath = getDriverEntryPath(result.role, result.verification_status, window.location.pathname)
        if (driverEntryPath && driverEntryPath !== window.location.pathname) navigateDriverPath(driverEntryPath, true)
      } else {
        if (window.location.pathname.startsWith('/driver')) navigateDriverPath('/', true)
      }
    } catch (error: any) {
      setMessage(error instanceof Error ? error.message : 'Could not load your profile.')
      setProfile(null)
    } finally { setLoading(false) }
  }, [navigateDriverPath])

  useEffect(() => { const t = window.setTimeout(() => setSplashVisible(false), 1900); return () => window.clearTimeout(t) }, [])

  useEffect(() => {
    const handlePopState = () => { setDriverPath(window.location.pathname); setCurrentPath(window.location.pathname) }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) setMessage(error.message)
      if (data.session?.user) {
        await loadProfile(data.session.user.id, data.session.user.email ?? null, data.session.user.user_metadata?.role as Role | undefined)
      } else if (active) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (!session?.user) { setProfile(null); setLoading(false); setShowLanding(true); setVerifiedAdminUserId(null); setCheckedAdminUserId(null) }
      else { void loadProfile(session.user.id, session.user.email ?? null, session.user.user_metadata?.role as Role | undefined) }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadProfile])

  useEffect(() => {
    if (!profile || !shouldVerifyAdminAccess) { setVerifiedAdminUserId(null); return }
    let active = true
    void (async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!active) return
      const userEmail = user?.email?.toLowerCase()
      setCheckedAdminUserId(profile.id)
      if (error || userEmail !== ADMIN_EMAIL || profile.email?.trim().toLowerCase() !== ADMIN_EMAIL || profile.role !== 'admin') {
        setVerifiedAdminUserId(null)
        return
      }
      setVerifiedAdminUserId(profile.id)
    })()
    return () => { active = false }
  }, [profile?.id, profile?.role, profile?.email, shouldVerifyAdminAccess])

  useEffect(() => { if (!adminToast) return; const timeout = window.setTimeout(() => setAdminToast(''), 3000); return () => window.clearTimeout(timeout) }, [adminToast])

  async function handleSendOtp() {
    if (!phone.trim()) { setMessage('Enter your phone number first (e.g. 0821234567)'); return }
    setBusy(true); setMessage('')
    try {
      await sendSmsOtp(phone.trim())
      setOtpSent(true); setOtpStep('otp'); setMessage(`✅ SMS sent to ${phone}! Enter the 6-digit code.`)
    } catch (e: any) { setMessage(e?.message || 'Failed to send SMS. Check credits / phone.') } finally { setBusy(false) }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      if (mode === 'signup') {
        if (!role) throw new Error('Please choose: Are you a Passenger or a Driver? Tap one above.')
        if (!otpSent || otpStep === 'details') {
          setBusy(false)
          await handleSendOtp()
          return
        }
        if (!otpCode.trim() || otpCode.length !== 6) throw new Error('Enter the 6-digit code sent via SMS')
        const ok = await verifySmsOtp(phone.trim(), otpCode.trim())
        if (!ok) throw new Error('Wrong or expired code. Try resend.')
        localStorage.setItem('buddyride_pending_role', role)
        const user = await createAccount(email.trim().toLowerCase(), password, role, fullName, phone)
        if (user) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) await loadProfile(user.id, user.email ?? null, role, fullName.trim(), phone.trim())
          else { setMessage('Account created. You can now log in.'); setMode('login'); setOtpStep('details'); setOtpSent(false) }
        }
      } else {
        localStorage.removeItem('buddyride_pending_role')
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error) throw error
        if (data.user) await loadProfile(data.user.id, data.user.email ?? null, undefined)
      }
    } catch (error: any) { setMessage(error instanceof Error ? error.message : 'Auth failed.') } finally { setBusy(false) }
  }

  if (currentPath === '/terms') return <TermsPage />
  if (currentPath === '/privacy') return <PrivacyPage />
  if (loading || splashVisible) return <main className="splash splash-intro"><div className="splash-orbit"><Brand /></div><h1 className="splash-title">BuddyRide</h1><p>{loading ? 'Getting your ride ready…' : 'Your ride. Your way.'}</p><div className="loading-dots"><i /><i /><i /></div></main>

  if (profile) {
    if (shouldVerifyAdminAccess && checkedAdminUserId !== profile.id) {
      return <main className="splash splash-intro"><div className="splash-orbit"><Brand /></div><h1 className="splash-title">BuddyRide</h1><p>Verifying admin access…</p><div className="loading-dots"><i /><i /><i /></div></main>
    }
    const navigationRideId = window.location.pathname.match(/^\/driver\/navigation\/([^/]+)\/?$/)?.[1]
    if (navigationRideId) {
      if (profile.role !== 'driver') return <main className="auth-page"><section className="auth-card"><h1>Driver access required</h1><p>This navigation screen is only available to the assigned driver.</p><button className="primary" style={{ background: BLUE }} onClick={() => window.location.assign('/')}>Back to home</button></section></main>
      return <Suspense fallback={<main className="splash splash-intro">Loading driver navigation…</main>}><DriverNavigationView rideId={navigationRideId} profile={profile} onBack={() => window.location.assign('/')} /></Suspense>
    }
    if (profile.role === 'driver') {
      const driverRoute = driverPath.replace(/\/+$/, '') || '/'
      // FIX ONLY: identity_complete = inside app, Go Online blocked in DriverHome, NOT pending, NOT onboarding
      if (profile.verification_status === 'identity_complete') {
        if (driverRoute === '/driver/onboarding') return <DriverOnboarding profile={profile} onDashboard={() => navigateDriverPath('/driver/dashboard', true)} />
        // Allow dashboard + /driver - DriverHome shows banner + blocks Go Online
        return <DriverDashboardGuard profile={profile} onRequireOnboarding={() => navigateDriverPath('/driver/onboarding', true)}>
          <Suspense fallback={<main className="splash splash-intro">Loading driver tools…</main>}><DriverHome profile={profile} /></Suspense>
        </DriverDashboardGuard>
      }
      if (driverRoute === '/driver/onboarding') return <DriverOnboarding profile={profile} onDashboard={() => navigateDriverPath('/driver/dashboard', true)} />
      if (driverRoute === '/driver/dashboard' || driverRoute === '/driver') {
        return <DriverDashboardGuard profile={profile} onRequireOnboarding={() => navigateDriverPath('/driver/onboarding', true)}>
          <Suspense fallback={<main className="splash splash-intro">Loading driver tools…</main>}><DriverHome profile={profile} /></Suspense>
        </DriverDashboardGuard>
      }
      if (['pending', 'pending_verification'].includes(profile.verification_status ?? '')) return <DriverPendingPage />
      if (profile.verification_status === 'verified' || profile.verification_status === 'approved') {
        return <DriverDashboardGuard profile={profile} onRequireOnboarding={() => navigateDriverPath('/driver/onboarding', true)}>
          <Suspense fallback={<main className="splash splash-intro">Loading driver tools…</main>}><DriverHome profile={profile} /></Suspense>
        </DriverDashboardGuard>
      }
      return <DriverOnboarding profile={profile} onDashboard={() => navigateDriverPath('/driver/dashboard', true)} />
    }
    if (page === 'driver-docs') return <DriverDocuments driverId={profile.id} onBack={() => setPage('home')} />
    if (hasAdminAccess && (page === 'admin-docs' || page === 'admin-documents')) return <AdminDocuments profile={profile} onBack={() => { setSelectedDriverId(null); setPage('home') }} driverId={selectedDriverId} />
    if (hasAdminAccess && page === 'admin-dashboard') return <AdminDashboard onBack={() => setPage('home')} onDocs={(driverId: string) => { setSelectedDriverId(driverId); setPage('admin-docs') }} />
    if (hasAdminAccess && page === 'admin-rides') return <AdminRides onBack={() => setPage('home')} />
    if (hasAdminAccess && page === 'admin-passengers') return <AdminPassengers onBack={() => setPage('home')} />
    if (hasAdminAccess && page === 'admin-finance') return <AdminFinance onBack={() => setPage('home')} />
    if (hasAdminAccess && page === 'admin-support') return <AdminSupport onBack={() => setPage('home')} />
    if (hasAdminAccess && page === 'admin-zones') return <AdminZones onBack={() => setPage('home')} />
    if (hasAdminAccess && page === 'admin-settings') return <AdminSettings onBack={() => setPage('home')} />
    if (hasAdminAccess) return <><div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, padding: 6, background: BLUE, color: 'white', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>Admin: {profile.email}</div><AdminHome profile={profile} onDocs={() => { setSelectedDriverId(null); setPage('admin-docs') }} onAdminModule={(m: any) => setPage(m as any)} /></>
    if (adminToast) return <><div role="status" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, padding: '12px 18px', borderRadius: 10, background: '#b91c1c', color: 'white', fontWeight: 700 }}>{adminToast}</div><Suspense fallback={<main className="splash splash-intro">Loading passenger tools…</main>}><PassengerHome profile={profile} /></Suspense></>
    return <Suspense fallback={<main className="splash splash-intro">Loading passenger tools…</main>}><PassengerHome profile={profile} /></Suspense>
  }

  if (showLanding) return <LandingPage onLogin={() => setShowLanding(false)} />

  return <main className="auth-page">
    <section className="auth-card" style={{ position: 'relative' }}>
      <button onClick={() => setShowLanding(true)} style={{ marginBottom: '10px', background: 'none', border: 'none', fontSize: '14px', color: BLUE, fontWeight: 700, cursor: 'pointer' }}>← Back to Home</button>
      <Brand /><h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      {mode === 'signup' && (
        <>
          <p style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: role ? '#111' : '#b91c1c' }}>{role ? `You selected: ${role === 'driver' ? '🚗 Driver' : '👤 Passenger'}` : '⚠️ Step 1: Choose your role'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <button type="button" onClick={() => setRole('passenger')} style={{ padding: '12px', borderRadius: '10px', fontWeight: 700, border: role === 'passenger' ? `2px solid ${BLUE}` : '1px solid #e5e7eb', background: role === 'passenger' ? BLUE : 'white', color: role === 'passenger' ? 'white' : 'black', cursor: 'pointer' }}>👤 Passenger</button>
            <button type="button" onClick={() => setRole('driver')} style={{ padding: '12px', borderRadius: '10px', fontWeight: 700, border: role === 'driver' ? `2px solid ${BLUE}` : '1px solid #e5e7eb', background: role === 'driver' ? BLUE : 'white', color: role === 'driver' ? 'white' : 'black', cursor: 'pointer' }}>🚗 Driver</button>
          </div>
        </>
      )}
      <form onSubmit={submit}>
        {mode === 'signup' && <><label>Full name<input value={fullName} onChange={(e: any) => setFullName(e.target.value)} required /></label><label>Phone<input value={phone} onChange={(e: any) => setPhone(e.target.value)} required placeholder="0821234567" /></label></>}
        <label>Email<input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} required /></label>
        {mode === 'signup' && otpStep === 'otp' && (
          <>
            <label>6-Digit SMS Code<input value={otpCode} onChange={(e: any) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" required style={{ letterSpacing: '4px', fontSize: '20px', textAlign: 'center', borderColor: BLUE }} /></label>
            <button type="button" onClick={handleSendOtp} disabled={busy} style={{ background: 'none', border: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer' }}>Resend SMS Code</button>
          </>
        )}
        <button className="primary full-width" style={{ background: BLUE }} disabled={busy} type="submit">{busy ? 'Wait…' : mode === 'login' ? 'Log in' : otpStep === 'details' ? 'Send SMS Code 📱' : 'Verify & Create account ✅'}</button>
      </form>
      <button className="text-button full-width" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); setOtpStep('details'); setOtpSent(false); setOtpCode('') }} style={{ color: BLUE }}>{mode === 'login' ? 'No account? Sign up' : 'Already registered? Log in'}</button>
      {message && <div className="notice" style={{ borderColor: BLUE_LIGHT, background: BLUE_LIGHT, color: BLUE_DARK }}>{message}</div>}
    </section>
  </main>
}