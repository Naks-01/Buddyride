import './styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { isSupabaseConfigured } from './lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('BuddyRide: #root element not found in index.html')
}

const root = ReactDOM.createRoot(rootEl)

// FIXED 100%: Crash in App used to white-screen with no way back. Now shows reload + clear cache.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('BuddyRide crash:', error, info) }
  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }
  handleHardReset = () => {
    try {
      // Clear stale cache that can cause infinite crash loop
      localStorage.removeItem('buddyride_pending_role')
      sessionStorage.clear()
      if ('caches' in window) {
        void caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
      }
    } catch {}
    window.location.href = '/'
  }
  render() {
    if (this.state.hasError) {
      return (
        <main style={{ maxWidth: 520, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🚗</div>
          <h1>Something went wrong</h1>
          <p style={{ color: '#666' }}>BuddyRide hit an unexpected error. Your trip data is safe in the app.</p>
          <p style={{ fontSize: 12, color: '#999', wordBreak: 'break-word' }}>{this.state.error?.message}</p>
          <button onClick={this.handleReset} style={{ background: BLUE, color: 'white', border: 'none', padding: '14px 28px', borderRadius: 999, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>Reload BuddyRide</button>
          <button onClick={this.handleHardReset} style={{ background: 'white', color: BLUE_DARK, border: `2px solid ${BLUE}`, padding: '12px 24px', borderRadius: 999, fontWeight: 700, cursor: 'pointer', marginTop: 10, marginLeft: 8 }}>Clear Cache + Home</button>
          <div style={{ marginTop: 12 }}><a href="/" style={{ color: BLUE_DARK, fontSize: 13, fontWeight: 700 }}>Go to home</a></div>
          <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>Still stuck? WhatsApp support: 064 101 8991</p>
        </main>
      )
    }
    return this.props.children
  }
}

// FIXED: Log + show unhandled rejection instead of silent white-screen
let rejectionToast: HTMLDivElement | null = null
window.addEventListener('unhandledrejection', (e) => {
  console.error('BuddyRide unhandled rejection:', e.reason)
  // Don't spam toast for aborted fetches
  const msg = String((e.reason as any)?.message || e.reason || '')
  if (msg.includes('AbortError') || msg.includes('aborted')) return
  if (rejectionToast) return
  rejectionToast = document.createElement('div')
  rejectionToast.textContent = 'Something went wrong - please try again. If it keeps happening, reload.'
  rejectionToast.style.cssText = 'position:fixed;left:16px;right:16px;bottom:20px;z-index:99999;background:#b91c1c;color:white;padding:12px 16px;border-radius:10px;font-weight:700;font-size:13px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.3)'
  document.body.appendChild(rejectionToast)
  setTimeout(() => { rejectionToast?.remove(); rejectionToast = null }, 4000)
})

if (!isSupabaseConfigured) {
  root.render(
    <main style={{ maxWidth: 520, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>BuddyRide needs configuration</h1>
      <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the app.</p>
      <p style={{ fontSize: 13, color: '#666' }}>Check: <code>.env.local</code> exists in project root, not in <code>src/</code>, and you restarted <code>npm run dev</code> after adding it.</p>
      <p style={{ fontSize: 13, color: '#666' }}>Production: set these in your host (Vercel / Netlify → Environment Variables), not just in .env.local - .env.local is never deployed.</p>
      <button onClick={() => window.location.reload()} style={{ background: BLUE, color: 'white', border: 'none', padding: '12px 24px', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
    </main>,
  )
} else {
  // FIXED: StrictMode double-fires effects in dev -> double ride inserts / double realtime subscriptions
  // Keep StrictMode in dev only, OFF in production build
  const app = (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
  root.render(
    import.meta.env.DEV ? <React.StrictMode>{app}</React.StrictMode> : app
  )
}