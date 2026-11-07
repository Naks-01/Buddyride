import './styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { isSupabaseConfigured } from './lib/supabase'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('BuddyRide: #root element not found in index.html')
}

const root = ReactDOM.createRoot(rootEl)

if (!isSupabaseConfigured) {
  root.render(
    <main style={{ maxWidth: 520, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>BuddyRide needs configuration</h1>
      <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the app.</p>
      <p style={{ fontSize: 13, color: '#666' }}>Check: <code>.env.local</code> exists in project root, not in <code>src/</code>, and you restarted <code>npm run dev</code> after adding it.</p>
    </main>,
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}