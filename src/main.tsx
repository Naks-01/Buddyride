import 'mapbox-gl/dist/mapbox-gl.css'
import './styles.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { isSupabaseConfigured } from './lib/supabase'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (!isSupabaseConfigured) {
  root.render(
    <main style={{ maxWidth: 520, margin: '12vh auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>BuddyRide needs configuration</h1>
      <p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then restart the app.</p>
    </main>,
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
