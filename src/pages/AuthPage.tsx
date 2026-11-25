import { useState } from 'react'
import { signIn, signUp } from '../lib/auth'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'

type Props = {
  initialMode?: 'login' | 'signup'
  onAuthSuccess: () => void
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
    setLoading(true)
    try {
      if (mode === 'login') {
        if (!email.trim() || !password) throw new Error('Enter email and password.')
        await signIn(email, password)
        try { localStorage.removeItem('buddyride_pending_role') } catch {}
        onAuthSuccess()
        return
      }

      // signup
      if (!fullName.trim()) throw new Error('Enter your full name.')
      if (!email.trim()) throw new Error('Enter email.')
      if (!phone.trim()) throw new Error('Enter SA mobile number (e.g. 064 101 8991).')
      if (password.length < 6) throw new Error('Password must be at least 6 characters.')

      try { localStorage.setItem('buddyride_pending_role', role) } catch {}
      const user = await signUp(email, password, role, fullName, phone)
      // Supabase may require email confirmation - if session exists, go straight to app
      if (user) {
        setSuccess(
          role === 'driver'
            ? 'Driver account created! Check your email to confirm, then finish onboarding to Go Online.'
            : 'Account created! Check email to confirm, then request your first ride.'
        )
        // If email confirmation OFF, onAuthSuccess will load profile
        setTimeout(() => onAuthSuccess(), 800)
      } else {
        setSuccess('Check your email to confirm your account, then login.')
      }
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        setError('This email is already registered. Switch to Login instead.')
      } else if (msg.toLowerCase().includes('reserved for admin')) {
        setError('This email is reserved for admin. Use Login, not Signup.')
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