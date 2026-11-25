import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
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
const DriverBundlePurchase = lazy(() => import('./pages/DriverBundlePurchase').then(module => ({ default: module.DriverBundlePurchase })))

const ADMIN_EMAIL = 'buddyride@outlook.com'
const logoCandidates = ['/buddyride-logo.jpg', '/buddyride-logo-main.jpg', '/buddyridelogo.jpg']

function isValidSAPhone(p: string) {
  const d = p.replace(/\D/g, '')
  if (d.startsWith('27') && d.length === 11) return true
  if (d.startsWith('0') && d.length === 10) return true
  return false
}

function Brand({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  if (failed) return <div className={'brand ' + (compact ? 'brand-compact' : '')}><div><strong>BuddyRide</strong><span>Limpopo eHailing</span></div></div>
  return <div className={'brand ' + (compact ? 'brand-compact' : '')}>
    <img src={logoCandidates[index]} onError={() => { if (index < logoCandidates.length - 1) setIndex((i: number) => i + 1); else setFailed(true) }} alt="BuddyRide logo" />
    <div><strong>BuddyRide</strong><span>Limpopo eHailing</span></div>
  </div>
}

function driverScreenFor(status: string | null | undefined, path: string): 'onboarding' | 'pending' | 'home' | 'bundle' {
  const p = String(path || '/').replace(/\/+$/, '') || '/'
  if (p === '/driver/onboarding') return 'onboarding'
  if (p === '/driver/pending') return 'pending'
  if (p === '/driver/bundle' || p === '/driver/bundles' || p === '/driver/buy-bundle') return 'bundle'
  if (p.startsWith('/driver/navigation/')) return 'home'
  const v = String(status || '').toLowerCase()
  if (v === '' || v === 'not_started' || v === 'rejected') return 'onboarding'
  if (v === 'identity_complete') return 'home'
  if (['pending', 'pending_verification', 'submitted', 'under_review'].includes(v)) return 'pending'
  return 'home'
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
  const loadingProfileRef = useRef(false)
  const lastLoadedUserRef = useRef<string | null>(null)
  // FIX: WHOLE APP THEME - App now owns theme, syncs with Driver/Passenger
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('buddy_theme') as any) || 'light' } catch { return 'light' }
  })
  const isDark = theme === 'dark'
  const appBg = isDark ? '#0e0e10' : '#f5f5f7'
  const appCard = isDark ? '#121214' : '#ffffff'
  const appText = isDark ? 'white' : '#111827'
  const appMuted = isDark ? '#9ca3af' : '#6b7280'
  const appBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb'
  const appInputBg = isDark ? '#1c1c1e' : '#ffffff'

  const navigateDriverPath = useCallback((path: string, replace = false) => {
    if (replace) window.history.replaceState(null, '', path)
    else window.history.pushState(null, '', path)
    setDriverPath(path)
    setCurrentPath(path)
  }, [])

  const isAdminEmailCheck = profile?.email?.trim().toLowerCase() === ADMIN_EMAIL
  const shouldVerifyAdminAccess = Boolean(profile && profile.role === 'admin' && isAdminEmailCheck)
  const hasAdminAccess = Boolean(profile && profile.role === 'admin' && isAdminEmailCheck)

  const loadProfile = useCallback(async (userId: string, userEmail: string | null, preferredRole?: Role, fullNameValue?: string, phoneValue?: string) => {
    if (loadingProfileRef.current && lastLoadedUserRef.current === userId) return
    loadingProfileRef.current = true
    lastLoadedUserRef.current = userId
    setLoading(true)
    try {
      let result = await getProfile(userId)
      const emailLower = userEmail?.toLowerCase().trim() || null
      const isAdminUser = emailLower === ADMIN_EMAIL
      if (isAdminUser) {
        if (!result || result.role !== 'admin') {
          throw new Error('This account is not provisioned as a BuddyRide administrator. Ask the platform owner to grant admin access securely.')
        }
        setProfile(result)
        setVerifiedAdminUserId(result.id)
        setCheckedAdminUserId(result.id)
        setShowLanding(false)
        setLoading(false)
        return
      }
      const pending = localStorage.getItem('buddyride_pending_role') as Role | null
      const windowRole = (window as any).__buddyride_role as Role | undefined
      let intendedRole: Role = 'passenger'
      if (preferredRole === 'driver' || preferredRole === 'passenger') intendedRole = preferredRole
      else if (pending === 'driver' || pending === 'passenger') intendedRole = pending
      else if (windowRole === 'driver' || windowRole === 'passenger') intendedRole = windowRole
      if (!result) {
        const { data, error } = await supabase.from('profiles').upsert({ id: userId, email: emailLower, role: intendedRole, full_name: fullNameValue ?? null, phone_number: phoneValue ?? null, phone: phoneValue ?? null, verification_status: 'not_started', is_verified: false, } as any, { onConflict: 'id' }).select('*').single()
        if (error) throw error
        result = data as Profile
        localStorage.removeItem('buddyride_pending_role')
      } else {
        localStorage.removeItem('buddyride_pending_role')
        if (result.role === 'admin') {
          throw new Error('This administrator profile is not authorized for the configured administrator account.')
        }
      }
      setProfile(result); setShowLanding(false)
      if (result.role === 'driver') {
        const current = String(window.location.pathname || '/')
        if (current === '/' || current === '') {
          const driverEntryPath = getDriverEntryPath(result.role, result.verification_status, current) as string | null
          if (driverEntryPath && String(driverEntryPath) !== current) navigateDriverPath(driverEntryPath, true)
        }
      } else {
        if (window.location.pathname.startsWith('/driver')) navigateDriverPath('/', true)
      }
    } catch (error: any) {
      setMessage(error instanceof Error ? error.message : 'Could not load your profile.')
      setProfile(null)
      lastLoadedUserRef.current = null
    } finally { setLoading(false); loadingProfileRef.current = false }
  }, [navigateDriverPath])

  // FIX: Sync theme from localStorage + Driver/Passenger toggles + StatusBar
  useEffect(() => {
    const sync = () => {
      try {
        const t = localStorage.getItem('buddy_theme')
        if (t === 'dark' || t === 'light') setTheme(t)
      } catch {}
    }
    const onStorage = (e: StorageEvent) => { if (e.key === 'buddy_theme') sync() }
    const onCustom = (e: any) => { if (e.detail === 'dark' || e.detail === 'light') setTheme(e.detail) }
    window.addEventListener('storage', onStorage)
    window.addEventListener('buddyride-theme-changed', onCustom)
    window.addEventListener('focus', sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('buddyride-theme-changed', onCustom)
      window.removeEventListener('focus', sync)
    }
  }, [])
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      document.body.style.background = appBg
      document.body.style.color = appText
    } catch {}
    if (Capacitor.isNativePlatform()) {
      // FIX: StatusBar now follows theme, not hardcoded #0066FF + Dark
      StatusBar.setOverlaysWebView({ overlay: false }).catch(()=>{});
      StatusBar.setBackgroundColor({ color: isDark ? '#0e0e10' : '#f5f5f7' }).catch(()=>{});
      StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(()=>{});
    }
  }, [theme, appBg, appText, isDark])
  useEffect(() => { const t = window.setTimeout(() => setSplashVisible(false), 1900); return () => window.clearTimeout(t) }, [])
  useEffect(() => {
    const handlePopState = () => { setDriverPath(window.location.pathname); setCurrentPath(window.location.pathname) }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  useEffect(() => {
    if (profile?.role === 'passenger' && currentPath.startsWith('/driver')) {
      navigateDriverPath('/', true)
    }
  }, [profile?.role, currentPath, navigateDriverPath])
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) setMessage(error.message)
      if (data.session?.user) {
        await loadProfile(data.session.user.id, data.session.user.email ?? null, undefined)
      } else if (active) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (event === 'INITIAL_SESSION') return
      if (!session?.user) { setProfile(null); setLoading(false); setShowLanding(true); setVerifiedAdminUserId(null); setCheckedAdminUserId(null); lastLoadedUserRef.current = null }
      else {
        const hasPending = localStorage.getItem('buddyride_pending_role')
        const metaRole = hasPending ? (session.user.user_metadata?.role as Role | undefined) : undefined
        void loadProfile(session.user.id, session.user.email ?? null, metaRole)
      }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadProfile])
  useEffect(() => {
    if (!profile || !shouldVerifyAdminAccess) return
    let active = true
    void (async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!active) return
      const userEmail = user?.email?.toLowerCase()
      setCheckedAdminUserId(profile.id)
      if (error || userEmail !== ADMIN_EMAIL || profile.email?.trim().toLowerCase() !== ADMIN_EMAIL || profile.role !== 'admin') {
        setVerifiedAdminUserId(profile.id)
        return
      }
      setVerifiedAdminUserId(profile.id)
    })()
    return () => { active = false }
  }, [profile?.id, profile?.role, profile?.email, shouldVerifyAdminAccess])
  useEffect(() => { if (!adminToast) return; const timeout = window.setTimeout(() => setAdminToast(''), 3000); return () => window.clearTimeout(timeout) }, [adminToast])

  async function handleSendOtp() {
    if (!phone.trim()) { setMessage('Enter your phone number first (e.g. 0821234567)'); return }
    if (!isValidSAPhone(phone.trim())) { setMessage('Enter a valid SA phone number - e.g. 0821234567 or +27821234567'); return }
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
        if (!fullName.trim()) throw new Error('Enter your full name.')
        if (!isValidSAPhone(phone.trim())) throw new Error('Enter a valid SA phone number - e.g. 0821234567')
        if (password.length < 6) throw new Error('Password must be at least 6 characters.')
        if (!otpSent || otpStep === 'details') {
          localStorage.setItem('buddyride_pending_role', role)
          ;(window as any).__buddyride_role = role
          setBusy(false)
          await handleSendOtp()
          return
        }
        if (!otpCode.trim() || otpCode.length !== 6) throw new Error('Enter the 6-digit code sent via SMS')
        const ok = await verifySmsOtp(phone.trim(), otpCode.trim())
        if (!ok) throw new Error('Wrong or expired code. Try resend.')
        localStorage.setItem('buddyride_pending_role', role)
        ;(window as any).__buddyride_role = role
        const user = await createAccount(email.trim().toLowerCase(), password, role, fullName, phone)
        if (user) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) await loadProfile(user.id, user.email ?? null, role, fullName.trim(), phone.trim())
          else { setMessage('Account created. You can now log in.'); setMode('login'); setOtpStep('details'); setOtpSent(false) }
        }
      } else {
        localStorage.removeItem('buddyride_pending_role')
        ;(window as any).__buddyride_role = undefined
        if (!email.trim() || !password) throw new Error('Enter email and password.')
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error) throw error
        if (data.user) await loadProfile(data.user.id, data.user.email ?? null, undefined)
      }
    } catch (error: any) { setMessage(error instanceof Error ? error.message : 'Auth failed.') } finally { setBusy(false) }
  }
  const refreshProfile = useCallback(async () => {
    if (!profile) return
    const fresh = await getProfile(profile.id)
    if (fresh) setProfile(fresh)
  }, [profile])

  if (currentPath === '/terms') return <TermsPage />
  if (currentPath === '/privacy') return <PrivacyPage />
  if (loading || splashVisible) return <main className="splash splash-intro" style={{ background: appBg, color: appText }}><div className="splash-orbit"><Brand /></div><h1 className="splash-title" style={{ color: appText }}>BuddyRide</h1><p style={{ color: appMuted }}>{loading ? 'Getting your ride ready…' : 'Your ride. Your way.'}</p><div className="loading-dots"><i /><i /><i /></div></main>

  if (profile) {
    if (profile.email?.trim().toLowerCase() === ADMIN_EMAIL && profile.role === 'admin' && checkedAdminUserId !== profile.id && verifiedAdminUserId === null) {
    } else if (shouldVerifyAdminAccess && checkedAdminUserId !== profile.id && profile.email?.trim().toLowerCase() !== ADMIN_EMAIL) {
      return <main className="splash splash-intro" style={{ background: appBg, color: appText }}><div className="splash-orbit"><Brand /></div><h1 className="splash-title" style={{ color: appText }}>BuddyRide</h1><p style={{ color: appMuted }}>Verifying admin access…</p><div className="loading-dots"><i /><i /><i /></div></main>
    }
    
    const navigationRideId = currentPath.match(/^\/driver\/navigation\/([^/]+)\/?$/)?.[1]
    if (navigationRideId) {
      if (profile.role !== 'driver') return <main className="auth-page" style={{ background: appBg }}><section className="auth-card" style={{ background: appCard, color: appText }}><h1 style={{ color: appText }}>Driver access required</h1><p style={{ color: appMuted }}>This navigation screen is only available to the assigned driver.</p><button className="primary" style={{ background: BLUE }} onClick={() => window.location.assign('/')}>Back to home</button></section></main>
      return <Suspense fallback={<main className="splash splash-intro" style={{ background: appBg, color: appText }}>Loading driver navigation…</main>}><DriverNavigationView rideId={navigationRideId} profile={profile} onBack={() => window.location.assign('/')} /></Suspense>
    }
    if (profile.role === 'passenger') {
      if (profile.email?.trim().toLowerCase() === ADMIN_EMAIL) {
        return <><div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, paddingTop: 'max(6px, env(safe-area-inset-top))', paddingBottom: 6, background: BLUE, color: 'white', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>Admin: {profile.email}</div><AdminHome profile={{...profile, role: 'admin' as const} as Profile} onDocs={() => { setSelectedDriverId(null); setPage('admin-docs') }} onAdminModule={(m: any) => setPage(m as any)} /></>
      }
      return <Suspense fallback={<main className="splash splash-intro" style={{ background: appBg, color: appText }}>Loading passenger tools…</main>}>
        {adminToast && <div role="status" style={{ position: 'fixed', top: 'max(16px, calc(env(safe-area-inset-top) + 16px))', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, padding: '12px 18px', borderRadius: 10, background: '#b91c1c', color: 'white', fontWeight: 700 }}>{adminToast}</div>}
        <PassengerHome profile={profile} />
      </Suspense>
    }
    if (profile.role === 'driver') {
      if (profile.email?.trim().toLowerCase() === ADMIN_EMAIL) {
        return <><div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, paddingTop: 'max(6px, env(safe-area-inset-top))', paddingBottom: 6, background: BLUE, color: 'white', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>Admin: {profile.email}</div><AdminHome profile={{...profile, role: 'admin' as const} as Profile} onDocs={() => { setSelectedDriverId(null); setPage('admin-docs') }} onAdminModule={(m: any) => setPage(m as any)} /></>
      }
      const driverRoute = String(currentPath || '/').replace(/\/+$/, '') || '/'
      const screen = driverScreenFor(profile.verification_status, driverRoute)
      if (screen === 'onboarding') {
        return <DriverOnboarding profile={profile} onDashboard={async () => { await refreshProfile(); navigateDriverPath('/driver', true) }} />
      }
      if (screen === 'pending') {
        return <DriverPendingPage onApproved={async () => { await refreshProfile(); navigateDriverPath('/driver', true) }} />
      }
      if (screen === 'bundle') {
        const v = String((profile as any).verification_status || '').toLowerCase()
        const canBuyBundle = !['', 'not_started', 'rejected'].includes(v)
        if (!canBuyBundle) {
          return <DriverOnboarding profile={profile} onDashboard={async () => { await refreshProfile(); navigateDriverPath('/driver', true) }} />
        }
        return <Suspense fallback={<main className="splash splash-intro" style={{ background: appBg, color: appText }}>Loading bundles…</main>}><DriverBundlePurchase profile={profile} onBack={() => navigateDriverPath('/driver', true)} /></Suspense>
      }
      return <DriverDashboardGuard profile={profile} onRequireOnboarding={() => navigateDriverPath('/driver/onboarding', true)}>
        <Suspense fallback={<main className="splash splash-intro" style={{ background: appBg, color: appText }}>Loading driver tools…</main>}><DriverHome profile={profile} /></Suspense>
      </DriverDashboardGuard>
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
    if (hasAdminAccess || (profile.email?.trim().toLowerCase() === ADMIN_EMAIL)) {
      return <><div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, paddingTop: 'max(6px, env(safe-area-inset-top))', paddingBottom: 6, background: BLUE, color: 'white', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>Admin: {profile.email}</div><AdminHome profile={profile} onDocs={() => { setSelectedDriverId(null); setPage('admin-docs') }} onAdminModule={(m: any) => setPage(m as any)} /></>
    }
    return <Suspense fallback={<main className="splash splash-intro" style={{ background: appBg, color: appText }}>Loading passenger tools…</main>}>
      {adminToast && <div role="status" style={{ position: 'fixed', top: 'max(16px, calc(env(safe-area-inset-top) + 16px))', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, padding: '12px 18px', borderRadius: 10, background: '#b91c1c', color: 'white', fontWeight: 700 }}>{adminToast}</div>}
      <PassengerHome profile={profile} />
    </Suspense>
  }

  if (showLanding) return <LandingPage
    onLogin={() => {
      try { localStorage.removeItem('buddyride_pending_role') } catch {}
      ;(window as any).__buddyride_role = undefined
      setRole(null)
      setMode('login')
      setShowLanding(false)
      setMessage('')
      setOtpStep('details'); setOtpSent(false); setOtpCode('')
    }}
    onDriverLogin={() => {
      try { localStorage.removeItem('buddyride_pending_role') } catch {}
      ;(window as any).__buddyride_role = undefined
      setRole(null)
      setMode('login')
      setShowLanding(false)
      setMessage('')
      setOtpStep('details'); setOtpSent(false); setOtpCode('')
    }}
  />

  // FIX: Auth page now theme-aware - was hardcoded white/black
  return <main className="auth-page" style={{ background: appBg, color: appText }}>
    <section className="auth-card" style={{ position: 'relative', background: appCard, color: appText, border: `1px solid ${appBorder}` }}>
      <button onClick={() => setShowLanding(true)} style={{ marginBottom: '10px', background: 'none', border: 'none', fontSize: '14px', color: BLUE, fontWeight: 700, cursor: 'pointer' }}>← Back to Home</button>
      <Brand /><h1 style={{ color: appText }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      {mode === 'signup' && (
        <>
          <p style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: role ? appText : '#b91c1c' }}>{role ? `You selected: ${role === 'driver' ? '🚗 Driver' : '👤 Passenger'}` : '⚠️ Step 1: Choose your role'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <button type="button" onClick={() => { setRole('passenger'); (window as any).__buddyride_role = 'passenger'; try { localStorage.setItem('buddyride_pending_role', 'passenger') } catch {} }} style={{ padding: '12px', borderRadius: '10px', fontWeight: 700, border: role === 'passenger' ? `2px solid ${BLUE}` : `1px solid ${appBorder}`, background: role === 'passenger' ? BLUE : appInputBg, color: role === 'passenger' ? 'white' : appText, cursor: 'pointer' }}>👤 Passenger</button>
            <button type="button" onClick={() => { setRole('driver'); (window as any).__buddyride_role = 'driver'; try { localStorage.setItem('buddyride_pending_role', 'driver') } catch {} }} style={{ padding: '12px', borderRadius: '10px', fontWeight: 700, border: role === 'driver' ? `2px solid ${BLUE}` : `1px solid ${appBorder}`, background: role === 'driver' ? BLUE : appInputBg, color: role === 'driver' ? 'white' : appText, cursor: 'pointer' }}>🚗 Driver</button>
          </div>
        </>
      )}
      <form onSubmit={submit}>
        {mode === 'signup' && <><label style={{ color: appText }}>Full name<input value={fullName} onChange={(e: any) => setFullName(e.target.value)} required style={{ background: appInputBg, color: appText, border: `1px solid ${appBorder}` }} /></label><label style={{ color: appText }}>Phone<input value={phone} onChange={(e: any) => setPhone(e.target.value)} required placeholder="0821234567" style={{ background: appInputBg, color: appText, border: `1px solid ${appBorder}` }} /></label></>}
        <label style={{ color: appText }}>Email<input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required style={{ background: appInputBg, color: appText, border: `1px solid ${appBorder}` }} /></label><label style={{ color: appText }}>Password<input type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} required style={{ background: appInputBg, color: appText, border: `1px solid ${appBorder}` }} /></label>
        {mode === 'signup' && otpStep === 'otp' && (
          <>
            <label style={{ color: appText }}>6-Digit SMS Code<input value={otpCode} onChange={(e: any) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" required style={{ letterSpacing: '4px', fontSize: '20px', textAlign: 'center', borderColor: BLUE, background: appInputBg, color: appText }} /></label>
            <button type="button" onClick={handleSendOtp} disabled={busy} style={{ background: 'none', border: 'none', color: BLUE, fontWeight: 700, cursor: 'pointer' }}>Resend SMS Code</button>
          </>
        )}
        <button className="primary full-width" style={{ background: BLUE }} disabled={busy} type="submit">{busy ? 'Wait…' : mode === 'login' ? 'Log in' : otpStep === 'details' ? 'Send SMS Code 📱' : 'Verify & Create account ✅'}</button>
      </form>
      <button className="text-button full-width" type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); setOtpStep('details'); setOtpSent(false); setOtpCode('') }} style={{ color: BLUE }}>{mode === 'login' ? 'No account? Sign up' : 'Already registered? Log in'}</button>
      {message && <div className="notice" style={{ borderColor: BLUE_LIGHT, background: isDark ? '#1e3a5f' : BLUE_LIGHT, color: isDark ? '#93c5fd' : BLUE_DARK }}>{message}</div>}
      {/* Theme toggle on auth screen too - so user can test whole app */}
      <button type="button" onClick={() => { const next = isDark ? 'light' : 'dark'; try { localStorage.setItem('buddy_theme', next) } catch {}; setTheme(next); window.dispatchEvent(new CustomEvent('buddyride-theme-changed', { detail: next })) }} style={{ marginTop: 12, width: '100%', padding: 10, borderRadius: 10, border: `1px solid ${appBorder}`, background: appInputBg, color: appText, fontWeight: 700 }}>{isDark ? '☀️ Switch to Light' : '🌙 Switch to Dark'}</button>
    </section>
  </main>
}