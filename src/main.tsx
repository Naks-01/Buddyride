import './styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { isSupabaseConfigured } from './lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const SUPPORT_WA = '27641018991'

const THEME_KEY = 'buddyride-theme'
export type BuddyTheme = 'light'

function getSavedTheme(): BuddyTheme {
  return 'light'
}

function applyTheme() {
  try {
    localStorage.setItem(THEME_KEY, 'light')
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.classList.remove('ride-app--dark')
    document.documentElement.classList.add('ride-app--light')
    document.documentElement.style.colorScheme = 'light'
  } catch {}
}

;(window as any).__setBuddyTheme = () => { applyTheme() }
;(window as any).__getBuddyTheme = (): BuddyTheme => 'light'

applyTheme()

window.addEventListener('storage', (e) => {
  if (e.key === THEME_KEY) applyTheme()
})
window.addEventListener('buddyride-theme-changed', () => {
  applyTheme()
})
try {
  const legacy = localStorage.getItem('buddy_theme')
  if ((legacy === 'dark' || legacy === 'light') && !localStorage.getItem(THEME_KEY)) {
    applyTheme()
  }
} catch {}

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('BuddyRide: #root element not found in index.html')
}

const root = ReactDOM.createRoot(rootEl)

function isChunkError(msg: string) {
  return msg.includes('ChunkLoadError') || msg.includes('Loading chunk') || msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed') || msg.includes('Failed to fetch')
}

const CHUNK_RELOAD_KEY = 'buddyride_chunk_reloaded_at'
function shouldReloadForChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - last < 10_000) return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    return true
  } catch { return false }
}
function clearChunkReloadGuard() {
  try { sessionStorage.removeItem(CHUNK_RELOAD_KEY) } catch {}
}
window.addEventListener('load', () => {
  setTimeout(clearChunkReloadGuard, 3000)
})

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('BuddyRide crash:', error, info)
    const msg = String((error as any)?.message || error || '') + String((error as any)?.stack || '')
    if (isChunkError(msg) && shouldReloadForChunk()) {
      window.location.reload()
      return
    }
  }
  handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }
  handleHardReset = () => {
    try {
      localStorage.removeItem('buddyride_pending_role')
      ;(window as any).__buddyride_role = undefined
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('sb-') || k.includes('supabase'))) keys.push(k)
      }
      keys.forEach(k => localStorage.removeItem(k))
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
        <main style={{ maxWidth: 520, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center', background: '#FFFFFF', color: '#111827', minHeight: '100vh' }}>
          <div style={{ fontSize: 48 }}>🚗</div>
          <h1 style={{ color: '#111827' }}>Something went wrong</h1>
          <p style={{ color: '#666' }}>BuddyRide hit an unexpected error. Your trip data is safe in the app.</p>
          <p style={{ fontSize: 12, color: '#666', wordBreak: 'break-word' }}>{this.state.error?.message}</p>
          <button onClick={this.handleReset} style={{ background: BLUE, color: 'white', border: 'none', padding: '14px 28px', borderRadius: 999, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>Reload BuddyRide</button>
          <button onClick={this.handleHardReset} style={{ background: '#ffffff', color: BLUE_DARK, border: `2px solid ${BLUE}`, padding: '12px 24px', borderRadius: 999, fontWeight: 700, cursor: 'pointer', marginTop: 10, marginLeft: 8 }}>Clear Cache + Home</button>
          <div style={{ marginTop: 12 }}><a href="/" style={{ color: BLUE_DARK, fontSize: 13, fontWeight: 700 }}>Go to home</a></div>
          <p style={{ fontSize: 12, color: '#666', marginTop: 16 }}>Still stuck? WhatsApp support: <a href={`https://wa.me/${SUPPORT_WA}`} target="_blank" rel="noreferrer" style={{ color: BLUE_DARK, fontWeight: 700 }}>064 101 8991</a></p>
        </main>
      )
    }
    return this.props.children
  }
}

let rejectionToast: HTMLDivElement | null = null
window.addEventListener('unhandledrejection', (e) => {
  console.error('BuddyRide unhandled rejection:', e.reason)
  const msg = String((e.reason as any)?.message || e.reason || '') + String((e.reason as any)?.stack || '')
  if (msg.includes('AbortError') || msg.includes('aborted')) return
  if (msg.includes('ResizeObserver')) return
  if (msg.includes('AuthRetryableFetchError') || msg.includes('Network request failed')) return
  if (msg.includes('Failed to fetch') && !isChunkError(msg)) return
  if (isChunkError(msg)) {
    if (shouldReloadForChunk()) window.location.reload()
    return
  }
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
      <p style={{ fontSize: 13, color: '#666' }}>Production: set these in your host (Vercel / Netlify - Environment Variables), not just in .env.local - .env.local is never deployed.</p>
      <button onClick={() => window.location.reload()} style={{ background: BLUE, color: 'white', border: 'none', padding: '12px 24px', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
    </main>,
  )
} else {
  const app = (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
  root.render(
    import.meta.env.DEV ? <React.StrictMode>{app}</React.StrictMode> : app
  )
}