import { useState } from 'react'
import { signIn, signUp } from '../lib/auth'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'

type Props = {
  initialMode?: 'login' | 'signup'
  onAuthSuccess: () => void
}

function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('0')) d = '27' + d.slice(1)
  if (d.length === 9) d = '27' + d
  return d
}
function isValidSAPhone(raw: string) {
  const d = normalizePhone(raw)
  return /^27[6-8][0-9]{8}$/.test(d)
}
function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim().toLowerCase())
}

export function AuthPage({ initialMode = 'login', onAuthSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode)
  const [role, setRole] = useState<'passenger' | 'driver'>(
    () => (localStorage.getItem('buddyride_pending_role') as any) || 'passenger'
  )
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next)
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (loading) return
    setLoading(true)
    try {
      const cleanEmail = email.trim().toLowerCase()
      if (mode === 'login') {
        if (!isValidEmail(cleanEmail)) throw new Error('Enter a valid email.')
        if (!password) throw new Error('Enter email and password.')
        await signIn(cleanEmail, password)
        try { localStorage.removeItem('buddyride_pending_role') } catch {}
        onAuthSuccess()
        return
      }

      // signup
      if (!fullName.trim()) throw new Error('Enter your full name.')
      if (fullName.trim().split(/\s+/).length < 2) throw new Error('Enter full name - first + surname (e.g. Trevor Mokgalaka).')
      if (!isValidEmail(cleanEmail)) throw new Error('Enter a valid email.')
      if (!isValidSAPhone(phone)) throw new Error('Enter valid SA mobile (e.g. 064 101 8991 or +27 64 101 8991).')
      if (password.length < 6) throw new Error('Password must be at least 6 characters.')
      if (cleanEmail === 'buddyride@outlook.com') throw new Error('This email is reserved for admin. Use Login, not Signup.')

      try { localStorage.setItem('buddyride_pending_role', role) } catch {}
      // FIX: Pass normalized phone + clean email
      const user = await signUp(cleanEmail, password, role, fullName.trim(), normalizePhone(phone))
      // FIX: Only call onAuthSuccess if we actually have a session/user
      // Was: setTimeout(onAuthSuccess, 800) even with email confirmation ON = app loaded with no profile
      if (user) {
        setSuccess(
          role === 'driver'
            ? 'Driver account created! Check your email to confirm, then finish onboarding to Go Online.'
            : 'Account created! Check email to confirm, then request your first ride.'
        )
        // Give Supabase a moment to create session, then let App check session
        setTimeout(() => onAuthSuccess(), 800)
      } else {
        setSuccess('Check your email to confirm your account, then login.')
        // FIX: Switch to login automatically so user doesn't get stuck
        setTimeout(() => switchMode('login'), 2000)
      }
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('user already')) {
        setError('This email is already registered. Switch to Login instead.')
        setTimeout(() => switchMode('login'), 1200)
      } else if (msg.toLowerCase().includes('reserved for admin')) {
        setError('This email is reserved for admin. Use Login, not Signup.')
      } else if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid email') || msg.toLowerCase().includes('invalid password')) {
        setError('Wrong email or password. Try again or Sign Up if you have no account.')
      } else if (msg.toLowerCase().includes('email not confirmed') || msg.toLowerCase().includes('not confirmed')) {
        setError('Email not confirmed yet. Check your inbox / spam for BuddyRide confirmation link, then Login.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100dvh', background: '#f5f5f7', display: 'grid', placeItems: 'center', padding: '24px 16px', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20, padding: '28px 22px', border: '1px solid #E4E7EC', boxShadow: '0 10px 30px rgba(0,0,0,.06)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: BLUE_LIGHT, display: 'grid', placeItems: 'center', margin: '0 auto', fontSize: 28 }}>🚗</div>
          <h1 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 900, color: '#111827' }}>
            <span style={{ color: '#0052CC' }}>Buddy</span><span style={{ color: BLUE }}>Ride</span>
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#667085', fontWeight: 600 }}>
            {mode === 'login' ? 'Welcome back - Login to continue' : 'Create account - Safe, verified rides in Limpopo'}
          </p>
        </div>

        {mode === 'signup' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setRole('passenger')}
              style={{
                flex: 1, padding: 12, borderRadius: 12, border: role === 'passenger' ? `2px solid ${BLUE}` : '1px solid #E4E7EC',
                background: role === 'passenger' ? BLUE_LIGHT : '#F2F4F7', color: role === 'passenger' ? BLUE : '#111827', fontWeight: 800, fontSize: 13, cursor: 'pointer'
              }}
            >
              🚶 Passenger
            </button>
            <button
              type="button"
              onClick={() => setRole('driver')}
              style={{
                flex: 1, padding: 12, borderRadius: 12, border: role === 'driver' ? `2px solid ${BLUE}` : '1px solid #E4E7EC',
                background: role === 'driver' ? BLUE_LIGHT : '#F2F4F7', color: role === 'driver' ? BLUE : '#111827', fontWeight: 800, fontSize: 13, cursor: 'pointer'
              }}
            >
              🚗 Driver - Keep 100%
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          {mode === 'signup' && (
            <>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                Full Name
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Trevor Mokgalaka" style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #D0D5DD', background: '#fff', color: '#111827', fontSize: 15 }} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#111827' }}>
                SA Mobile Number
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="064 101 8991" inputMode="tel" style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #D0D5DD', background: '#fff', color: '#111827', fontSize: 15 }} />
                <span style={{ fontSize: 11, color: '#98A2B3', fontWeight: 400 }}>Saved as +27 format for WhatsApp + Admin</span>
              </label>
            </>
          )}

          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#111827' }}>
            Email
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" type="email" autoComplete="email" style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #D0D5DD', background: '#fff', color: '#111827', fontSize: 15 }} />
          </label>

          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700, color: '#111827' }}>
            Password
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #D0D5DD', background: '#fff', color: '#111827', fontSize: 15 }} />
          </label>

          {error && <div role="alert" style={{ background: '#FEF3F2', color: '#B42318', border: '1px solid #FECDCA', padding: '10px 12px', borderRadius: 10, fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</div>}
          {success && <div style={{ background: '#ECFDF3', color: '#067647', border: '1px solid #ABEFC6', padding: '10px 12px', borderRadius: 10, fontSize: 13 }}>{success}</div>}

          <button disabled={loading} type="submit" style={{ marginTop: 4, padding: 14, borderRadius: 12, border: 0, background: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Login' : `Sign Up as ${role === 'driver' ? 'Driver' : 'Passenger'}`}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#667085' }}>
          {mode === 'login' ? (
            <>
              No account? <button type="button" onClick={() => switchMode('signup')} style={{ background: 'none', border: 0, color: BLUE, fontWeight: 800, cursor: 'pointer' }}>Sign up</button>
            </>
          ) : (
            <>
              Already have account? <button type="button" onClick={() => switchMode('login')} style={{ background: 'none', border: 0, color: BLUE, fontWeight: 800, cursor: 'pointer' }}>Login</button>
            </>
          )}
        </div>

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 11, color: '#98A2B3', lineHeight: 1.5 }}>
          By continuing you agree to BuddyRide Terms &amp; Privacy. Drivers keep 100% of fare. Bundles expire 31 days. POPIA: Trip data kept 6 months.
        </div>

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button type="button" onClick={() => (window.location.href = '/')} style={{ background: 'none', border: 0, color: '#667085', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>← Back to Home</button>
        </div>
      </section>
    </main>
  )
}

export default AuthPage