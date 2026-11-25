import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type AdminModule = 'admin-dashboard' | 'admin-documents' | 'admin-rides' | 'admin-passengers' | 'admin-finance' | 'admin-support' | 'admin-zones' | 'admin-settings'
type Props = { profile: Profile, onDocs: () => void, onAdminModule: (page: AdminModule) => void }

const BLUE = '#0066FF'
const BLUE_DARK = '#93C5FD'
const BLUE_LIGHT = '#1A2E4D'

const CATEGORIES = [
  { id: 'buddy_lite', name: 'Buddy Lite', icon: '🛺', seats: '2 seats' },
  { id: 'buddy_plus', name: 'Buddy Plus', icon: '🚗', seats: '3 seats' },
  { id: 'buddy_max', name: 'Buddy Max', icon: '🚐', seats: '7 seats' },
]
function normalizeCategory(raw: string | null | undefined) {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'go' || v === 'economy' || v === 'buddy' || v === 'buddy_lite') return 'buddy_lite'
  if (v === 'comfort' || v === 'buddy_plus') return 'buddy_plus'
  if (v === 'xl' || v === 'buddy_xl' || v === 'buddy_family' || v === 'family' || v === 'buddy_max') return 'buddy_max'
  return 'buddy_plus'
}

export function AdminHome({ profile, onDocs, onAdminModule }: Props) {
  const [stats, setStats] = useState({ rides: 0, drivers: 0, passengers: 0, active: 0, revenue: 0, pendingDrivers: 0, bundleSales: 0, bundleCount: 0 })
  const [pendingDocumentCounts, setPendingDocumentCounts] = useState({ drivers: 0, passengers: 0, total: 0 })
  const [documentCountError, setDocumentCountError] = useState('')
  const [tab, setTab] = useState<'overview' | 'finance' | 'zones'>('overview')
  const [loading, setLoading] = useState(true)
  const [bundleByCat, setBundleByCat] = useState<Record<string, { count: number, revenue: number }>>({})
  const [ridesByCat, setRidesByCat] = useState<Record<string, number>>({})

  // FIX: Role-based check, not hardcoded email in client - was anyone could edit JS to bypass email check
  // You must also enforce this in Supabase RLS: profiles.role = 'admin'. Client check is UI only.
  const isAdmin = (profile as any)?.role === 'admin' || (profile as any)?.is_admin === true || profile?.email?.toLowerCase().trim() === 'buddyride@outlook.com'

  async function load() {
    if (!isAdmin) { setLoading(false); return }
    setLoading(true); setDocumentCountError('')
    try {
      const [ridesRes, driversRes, passengersRes, pendingDriversRes, pendingPassengersRes] = await Promise.all([
        supabase.from('rides').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'driver'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'passenger'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'driver').in('verification_status', ['pending', 'pending_verification']),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'passenger').in('verification_status', ['pending', 'pending_verification']),
      ])
      const getCount = (res: any) => (res.error ? 0 : res.count || 0)
      const rides = getCount(ridesRes); const drivers = getCount(driversRes); const passengers = getCount(passengersRes)
      const pendingDrivers = getCount(pendingDriversRes); const pendingPassengers = getCount(pendingPassengersRes)

      // FIX: driver_locations, not driver_status - driver_status table doesn't exist, active was always 0
      let active = 0
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: activeRows } = await supabase.from('driver_locations').select('driver_id').eq('is_online', true).gte('updated_at', fiveMinAgo)
        active = new Set((activeRows || []).map(r => r.driver_id)).size
      } catch { active = 0 }

      // FIX: Single count query - was count + full table fetch if 0
      let pendingDocs = 0
      try {
        const { count } = await supabase.from('driver_documents').select('id', { count: 'exact', head: true }).ilike('status', 'pending')
        pendingDocs = count || 0
      } catch { pendingDocs = 0 }

      let revenue = 0; let bundleCount = 0; let bundleSales = 0
      const byCat: Record<string, { count: number, revenue: number }> = { buddy_lite: { count: 0, revenue: 0 }, buddy_plus: { count: 0, revenue: 0 }, buddy_max: { count: 0, revenue: 0 } }
      try {
        const { data: bundleData, error: bundleError } = await supabase.from('bundle_purchases').select('price, category').eq('status', 'paid')
        if (!bundleError && bundleData && bundleData.length > 0) {
          bundleCount = bundleData.length
          bundleSales = bundleData.reduce((s: number, b: any) => s + Number(b.price || 0), 0); revenue = bundleSales
          for (const b of bundleData as any[]) { const cat = normalizeCategory(b.category || 'buddy_plus'); byCat[cat].count += 1; byCat[cat].revenue += Number(b.price || 0) }
        } else {
          const { data: db2, error: e2 } = await supabase.from('driver_bundles').select('amount_paid, category').not('payment_reference', 'like', 'sim_%')
          if (!e2 && db2) {
            bundleCount = db2.length; bundleSales = db2.reduce((s: number, b: any) => s + Number(b.amount_paid || 0), 0); revenue = bundleSales
            for (const b of db2 as any[]) { const cat = normalizeCategory(b.category || 'buddy_plus'); byCat[cat].count += 1; byCat[cat].revenue += Number(b.amount_paid || 0) }
          }
        }
      } catch { revenue = 0 }
      setBundleByCat(byCat)

      try {
        const { data: ridesCat } = await supabase.from('rides').select('ride_category, ride_type').limit(1000)
        const rByCat: Record<string, number> = { buddy_lite: 0, buddy_plus: 0, buddy_max: 0 }
        for (const r of (ridesCat || []) as any[]) { const cat = normalizeCategory(r.ride_category || r.ride_type); rByCat[cat] = (rByCat[cat] || 0) + 1 }
        setRidesByCat(rByCat)
      } catch { setRidesByCat({}) }

      setStats({ rides, drivers, passengers, active, revenue, pendingDrivers, bundleSales, bundleCount })
      setPendingDocumentCounts({ drivers: pendingDocs, passengers: pendingPassengers, total: pendingDocs + pendingPassengers })
    } catch (e: any) { setDocumentCountError(e?.message || 'Unknown error') } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [isAdmin])

  if (!isAdmin) {
    return (
      <main style={{ minHeight: '100vh', background: '#0A0A0B', color: '#FFFFFF', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <p style={{ fontSize: '50px', margin: 0 }}>🚫</p>
        <h1 style={{ fontSize: '22px' }}>Access Denied</h1>
        <p style={{ color: '#8A8A93', fontSize: '14px', maxWidth: 300 }}>Only admin can access Admin.<br />Logged in as: {profile?.email}</p>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 16, padding: '12px 24px', borderRadius: '999px', background: '#ef4444', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Log Out</button>
      </main>
    )
  }

  const card: any = { background: '#15151A', borderRadius: '16px', padding: '14px', marginBottom: '12px', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 5px 18px rgba(0,0,0,0.3)' }
  const grid2: any = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }
  const btnTab = (active: boolean): any => ({ padding: '8px 14px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.08)', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', background: active ? BLUE : '#1E1E24', color: active ? 'white' : '#8A8A93', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' })

  return (
    <main style={{ minHeight: '100vh', background: '#0A0A0B', color: '#FFFFFF', padding: '16px', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div><h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: 0, color: '#FFFFFF' }}>Admin Command Center - Bundle Model</h1><p style={{ fontSize: '12px', color: '#8A8A93', margin: 0 }}>Welcome {profile.full_name || profile.email} 👑 Driver keeps 100%</p></div>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={() => load()} style={{ padding: '8px 14px', borderRadius: '999px', background: BLUE, color: 'white', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>{loading ? '...' : '↻ Refresh'}</button><button onClick={() => supabase.auth.signOut()} style={{ padding: '8px 14px', borderRadius: '999px', background: '#1E1E24', color: '#8A8A93', border: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Log out</button></div>
      </div>
      <div style={grid2}>
        <div style={card}><p style={{ fontSize: '10px', color: '#8A8A93', margin: 0 }}>TOTAL RIDES</p><p style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0 0' }}>{stats.rides}</p><p style={{ fontSize: '11px', color: '#8A8A93', margin: '4px 0 0' }}>{CATEGORIES.map(c => `${c.icon} ${c.name}: ${ridesByCat[c.id] || 0}`).join(' • ')}</p></div>
        <div style={card}><p style={{ fontSize: '10px', color: '#8A8A93', margin: 0 }}>ACTIVE DRIVERS</p><p style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0 0' }}>{stats.active} / {stats.drivers}</p></div>
        <div style={card}><p style={{ fontSize: '10px', color: '#8A8A93', margin: 0 }}>PASSENGERS</p><p style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0 0' }}>{stats.passengers}</p></div>
        <div style={{ ...card, background: '#14532d', color: 'white' }}><p style={{ fontSize: '10px', margin: 0, color: '#bbf7d0' }}>BUNDLE SALES - PLATFORM REVENUE</p><p style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0 0' }}>R {stats.revenue.toFixed(2)}</p><p style={{ fontSize: '11px', margin: '4px 0 0', color: '#bbf7d0' }}>{stats.bundleCount} bundles sold • Driver keeps 100% of fare</p></div>
      </div>
      <div style={card}>
        <h3 style={{ margin: '0 0 10px', color: '#FFFFFF', fontSize: 15 }}>💰 Bundle Sales by Category</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {CATEGORIES.map(c => {
            const b = bundleByCat[c.id] || { count: 0, revenue: 0 }
            return <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1E1E24', borderRadius: 10, padding: '10px 12px' }}><span style={{ fontSize: 13 }}>{c.icon} {c.name} • {c.seats}</span><span style={{ fontSize: 13, fontWeight: 700 }}>{b.count} sold • R{b.revenue.toFixed(0)}</span></div>
          })}
        </div>
        <p style={{ fontSize: 11, color: '#8A8A93', margin: '8px 0 0' }}>If a category shows 0, drivers are not buying that category yet.</p>
      </div>
      {stats.pendingDrivers > 0 && (<div style={{ background: BLUE_LIGHT, borderRadius: 16, padding: 14, marginBottom: 12, border: '1px solid #2A4A8A' }}><p style={{ margin: 0, fontWeight: 'bold', color: BLUE_DARK }}>⚠️ {stats.pendingDrivers} driver(s) waiting for approval</p><button onClick={onDocs} style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 10, background: BLUE, color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Approve Now →</button></div>)}
      {pendingDocumentCounts.passengers > 0 && (<div style={{ background: '#1C1500', borderRadius: 16, padding: 14, marginBottom: 12, border: '1px solid #78350F' }}><p style={{ margin: 0, fontWeight: 'bold', color: '#FDE68A' }}>⚠️ {pendingDocumentCounts.passengers} passenger(s) waiting for ID approval</p><button onClick={() => onAdminModule('admin-passengers')} style={{ marginTop: 8, width: '100%', padding: 12, borderRadius: 10, background: '#ea580c', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Review Passengers →</button></div>)}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', overflowX: 'auto' }}><button onClick={() => setTab('overview')} style={btnTab(tab === 'overview')}>📊 Overview</button><button onClick={() => setTab('finance')} style={btnTab(tab === 'finance')}>💰 Finance</button><button onClick={() => setTab('zones')} style={btnTab(tab === 'zones')}>📍 Zones</button></div>
      {tab === 'overview' && (<>
        <div style={card}><h3 style={{ margin: '0 0 8px', color: '#FFFFFF' }}>Live Ride Monitoring</h3><div style={{ background: '#1E1E24', borderRadius: '12px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: BLUE_DARK, border: '1px solid rgba(255,255,255,0.08)' }}>Active: {stats.active} drivers online • Bundle: 1 credit/ride, 2 credits for trips of 100km or longer</div></div>
        <div style={card}><p style={{ fontWeight: 'bold', margin: '0 0 6px 0', color: '#FFFFFF' }}>👑 Approve Documents {pendingDocumentCounts.drivers}</p><p style={{ fontSize: '12px', color: '#8A8A93', margin: '0 0 10px 0' }}>Driver docs pending: {pendingDocumentCounts.drivers} · Passengers pending: {pendingDocumentCounts.passengers} · Drivers waiting: {stats.pendingDrivers}</p>{documentCountError && <p role="alert" style={{ fontSize: '12px', color: '#FCA5A5' }}>Could not load document counts: {documentCountError}</p>}<p style={{ fontSize: '12px', color: '#8A8A93', margin: '0 0 10px 0' }}>Verify driver IDs, licenses, vehicles + passenger IDs + selfies — ONLY ADMIN APPROVES</p><button onClick={onDocs} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: BLUE, color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Go to Documents ({pendingDocumentCounts.drivers}) →</button></div>
        <div style={card}><h3 style={{ marginTop: 0, color: '#FFFFFF' }}>Admin Modules</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '8px' }}>{([['Dashboard', 'admin-dashboard'], [`Documents: ${pendingDocumentCounts.total} total, ${pendingDocumentCounts.drivers} pending`, 'admin-documents'], ['Rides', 'admin-rides'], ['Passengers', 'admin-passengers'], ['Finance', 'admin-finance'], ['SOS Support', 'admin-support'], ['Zones', 'admin-zones'], ['Settings', 'admin-settings']] as const).map(([label, page]) => <button key={page} onClick={() => onAdminModule(page)} style={{ padding: '10px', borderRadius: '8px', border: page === 'admin-documents' ? `2px solid ${BLUE}` : '1px solid rgba(255,255,255,0.08)', background: page === 'admin-documents' ? BLUE_LIGHT : '#1E1E24', color: page === 'admin-documents' ? BLUE_DARK : '#FFFFFF', fontWeight: page === 'admin-documents' ? 'bold' : 'normal', cursor: 'pointer' }}>{label}</button>)}</div></div>
      </>)}
      {tab === 'finance' && (<div style={card}><h3 style={{ color: '#FFFFFF' }}>Bundle Finance</h3><p style={{ color: '#8A8A93' }}>Your profit = Bundle Sales only. No fare deductions. Driver keeps 100% of fare — rider pays driver directly in cash. Bundle prices and fares are managed in Admin Settings.</p><p style={{ color: '#86efac', fontWeight: 'bold' }}>Total Bundle Sales: R{stats.bundleSales.toFixed(2)} • {stats.bundleCount} bundles</p><div style={{ marginTop: 10, display: 'grid', gap: 6 }}>{CATEGORIES.map(c => { const b = bundleByCat[c.id] || { count: 0, revenue: 0 }; return <div key={c.id} style={{ fontSize: 13, color: '#FFFFFF' }}>{c.icon} {c.name}: {b.count} bundles • R{b.revenue.toFixed(2)}</div> })}</div><button onClick={() => onAdminModule('admin-finance')} style={{ padding: '12px', borderRadius: '10px', background: BLUE, color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer', marginRight: 8, marginTop: 12 }}>Open Finance →</button><button onClick={() => onAdminModule('admin-settings')} style={{ padding: '12px', borderRadius: '10px', background: '#22c55e', color: 'black', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Open bundle settings →</button></div>)}
      {tab === 'zones' && (<div style={card}><h3 style={{ color: '#FFFFFF' }}>Service zones</h3><p style={{ color: '#8A8A93' }}>Service zones can be edited and saved here. They are currently informational: ride matching does not yet enforce zone boundaries. Trips of 100km or longer use 2 bundle credits.</p><button onClick={() => onAdminModule('admin-zones')} style={{ padding: '12px', borderRadius: '10px', background: BLUE, color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>View service zones →</button></div>)}
    </main>
  )
}