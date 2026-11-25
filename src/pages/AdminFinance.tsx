import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
function categoryFor(raw: string | null | undefined) {
  const n = normalizeCategory(raw)
  return CATEGORIES.find(c => c.id === n) || CATEGORIES[1]
}

type CompletedRide = { id: string, driver_id: string | null, fare: number, total_fare?: number | null, booking_fee?: number | null, created_at: string, driver_name?: string, ride_category?: string | null, ride_type?: string | null }
type BundleSale = { id: string, driver_id: string | null, driver_name?: string, trips: number, price: number, created_at: string, category?: string | null }

export function AdminFinance({ onBack }: { onBack: () => void }) {
  const [rides, setRides] = useState<CompletedRide[]>([])
  const [bundles, setBundles] = useState<BundleSale[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all'>('today')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'bundles' | 'rides'>('bundles')

  const grossOf = (r: CompletedRide) => {
    if (Number(r.total_fare || 0) > 0) return Number(r.total_fare)
    return Number(r.fare || 0) + Number(r.booking_fee || 0)
  }
  const earningsOf = (r: CompletedRide) => Math.round(grossOf(r) * 100) / 100

  async function load() {
    setLoading(true); setError('')
    try {
      const now = new Date()
      let startIso: string | null = null
      if (filter === 'today') { const s = new Date(now); s.setHours(0, 0, 0, 0); startIso = s.toISOString() }
      else if (filter === 'week') { const s = new Date(now); s.setDate(now.getDate() - 7); startIso = s.toISOString() }
      else if (filter === 'month') { const s = new Date(now); s.setDate(1); s.setHours(0, 0, 0, 0); startIso = s.toISOString() }

      let rideQuery = supabase.from('rides').select('id,driver_id,fare,total_fare,booking_fee,created_at,ride_category,ride_type').in('status', ['completed', 'rated']).order('created_at', { ascending: false }).limit(500)
      if (startIso) rideQuery = rideQuery.gte('created_at', startIso)
      const { data: rideData, error: rideError } = await rideQuery
      if (rideError) throw rideError

      // FIX: Single bundle path - was 3 duplicated paths, fallback ran even on error and mixed tables
      let bundleData: any[] = []
      const { data: bp, error: bpError } = await (async () => {
        let q = supabase.from('bundle_purchases').select('id,driver_id,trips,price,created_at,category').eq('status', 'paid').order('created_at', { ascending: false }).limit(500)
        if (startIso) q = q.gte('created_at', startIso)
        return q
      })()
      if (!bpError && bp?.length) {
        bundleData = bp
      } else if (!bpError && (!bp || bp.length === 0)) {
        // Only fallback if table exists but empty - not on error
        let fbQ = supabase.from('driver_bundles').select('id,driver_id,trips_total,amount_paid,category,created_at').not('payment_reference', 'like', 'sim_%').order('created_at', { ascending: false }).limit(500)
        if (startIso) fbQ = fbQ.gte('created_at', startIso)
        const { data: fb, error: fbError } = await fbQ
        if (!fbError && fb?.length) bundleData = fb.map((b: any) => ({ id: b.id, driver_id: b.driver_id, trips: Number(b.trips_total || 0), price: Number(b.amount_paid || 0), created_at: b.created_at, category: b.category }))
      } else if (bpError) {
        // bundle_purchases missing - try driver_bundles directly
        let fbQ = supabase.from('driver_bundles').select('id,driver_id,trips_total,amount_paid,category,created_at').not('payment_reference', 'like', 'sim_%').order('created_at', { ascending: false }).limit(500)
        if (startIso) fbQ = fbQ.gte('created_at', startIso)
        const { data: fb } = await fbQ
        if (fb?.length) bundleData = fb.map((b: any) => ({ id: b.id, driver_id: b.driver_id, trips: Number(b.trips_total || 0), price: Number(b.amount_paid || 0), created_at: b.created_at, category: b.category }))
      }

      // FIX: Single names lookup - was 3 duplicated lookups
      const allIds = [...new Set([...(bundleData || []).map((b: any) => b.driver_id).filter(Boolean), ...(rideData || []).map(r => r.driver_id).filter(Boolean)])] as string[]
      let names: Record<string, string> = {}
      if (allIds.length) { const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', allIds); profiles?.forEach(p => { names[p.id] = p.full_name || p.id.slice(0, 8) }) }

      setBundles((bundleData || []).map((b: any) => ({ id: b.id, driver_id: b.driver_id, trips: Number(b.trips || 0), price: Number(b.price || 0), created_at: b.created_at, category: b.category, driver_name: b.driver_id ? (names[b.driver_id] || b.driver_id.slice(0, 8)) : 'Unassigned' })))
      setRides((rideData || []).map(r => ({ ...r, driver_name: r.driver_id ? (names[r.driver_id] || r.driver_id.slice(0, 8)) : 'Unassigned' })) as CompletedRide[])
    } catch (e: any) { setError(e?.message || String(e)) } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [filter])

  const q = search.trim().toLowerCase()
  const filteredRides = rides.filter(r => !q || (r.driver_name?.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)))
  const filteredBundles = bundles.filter(b => !q || (b.driver_name?.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)))

  const bundleRevenue = filteredBundles.reduce((s, b) => s + Number(b.price || 0), 0)
  const tripsSold = filteredBundles.reduce((s, b) => s + Number(b.trips || 0), 0)
  const driverEarnings = filteredRides.reduce((s, r) => s + earningsOf(r), 0)

  const bundleByCat = CATEGORIES.map(c => { const list = filteredBundles.filter(b => normalizeCategory(b.category) === c.id); return { ...c, count: list.length, revenue: list.reduce((s, b) => s + Number(b.price || 0), 0), trips: list.reduce((s, b) => s + Number(b.trips || 0), 0) } })
  const ridesByCat = CATEGORIES.map(c => { const list = filteredRides.filter(r => normalizeCategory(r.ride_category || r.ride_type) === c.id); return { ...c, count: list.length, earnings: list.reduce((s, r) => s + earningsOf(r), 0) } })

  function exportCSV() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const rows: string[][] = [['Type', 'ID', 'Driver', 'Amount', 'Trips', 'Category', 'Date']]
    filteredBundles.forEach(b => rows.push(['Bundle Sale', b.id, b.driver_name || '', b.price.toFixed(2), String(b.trips), categoryFor(b.category).name, new Date(b.created_at).toLocaleDateString()]))
    filteredRides.forEach(r => rows.push(['Ride - Driver Kept 100%', r.id, r.driver_name || '', earningsOf(r).toFixed(2), '1', categoryFor(r.ride_category || r.ride_type).name, new Date(r.created_at).toLocaleDateString()]))
    const csv = rows.map(row => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `finance-${filter}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <main style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '16px' }}>
    <button onClick={onBack} style={{ background: '#334155', color: 'white', border: 0, padding: '8px 14px', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>← Admin home</button>
    <h1>Finance - Bundle Model</h1>
    <p style={{ color: '#86efac', fontSize: 13 }}>Driver keeps 100% of fare • You profit from bundle sales • No payouts from platform</p>
    {error && <p role="alert" style={{ color: '#fca5a5', background: '#7f1d1d', padding: 10, borderRadius: 10 }}>{error}</p>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
      {(['today', 'week', 'month', 'all'] as const).map(f => (
        <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: filter === f ? '#22c55e' : '#334155', color: 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{f}</button>
      ))}
      <button onClick={() => void load()} disabled={loading} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: '#334155', color: 'white', fontWeight: 700, cursor: 'pointer' }}>{loading ? 'Loading...' : 'Refresh'}</button>
      <button onClick={exportCSV} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: '#0ea5e9', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Export CSV</button>
    </div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <button onClick={() => setTab('bundles')} style={{ padding: '10px 18px', borderRadius: 20, border: 0, background: tab === 'bundles' ? '#22c55e' : '#334155', color: tab === 'bundles' ? 'black' : 'white', fontWeight: 800, cursor: 'pointer' }}>Bundle Sales (Your Money)</button>
      <button onClick={() => setTab('rides')} style={{ padding: '10px 18px', borderRadius: 20, border: 0, background: tab === 'rides' ? '#22c55e' : '#334155', color: tab === 'rides' ? 'black' : 'white', fontWeight: 800, cursor: 'pointer' }}>Rides (Driver Kept)</button>
    </div>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver or ID..." style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: '#1e293b', color: 'white', border: '1px solid #334155', marginBottom: 12 }} />
    <section style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
      <div style={{ background: '#14532d', padding: 12, borderRadius: 10 }}><div style={{ color: '#bbf7d0', fontSize: 12 }}>Paid Bundle Revenue ({filter})</div><strong style={{ fontSize: 22, color: '#86efac' }}>R{bundleRevenue.toFixed(2)}</strong><div style={{ fontSize: 12, color: '#bbf7d0' }}>{filteredBundles.length} bundles • {tripsSold} trips sold</div></div>
      <div><div style={{ color: '#94a3b8', fontSize: 12 }}>Driver Earnings - 100% ({filter})</div><strong style={{ fontSize: 22 }}>R{driverEarnings.toFixed(2)}</strong><div style={{ fontSize: 12, color: '#94a3b8' }}>{filteredRides.length} trips • Rider paid driver directly</div></div>
    </section>
    <section style={{ background: '#1e293b', padding: 16, borderRadius: 12, marginTop: 12 }}>
      <h3 style={{ margin: '0 0 10px' }}>💰 Breakdown by Category ({filter})</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        {bundleByCat.map(c => (
          <div key={c.id} style={{ background: '#0f172a', padding: 12, borderRadius: 10, border: '1px solid #334155' }}>
            <div style={{ fontWeight: 800 }}>{c.icon} {c.name} • {c.seats}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Bundles: {c.count} • {c.trips} trips sold</div>
            <div style={{ fontSize: 14, color: '#86efac', fontWeight: 800, marginTop: 2 }}>You: R{c.revenue.toFixed(2)}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Rides: {ridesByCat.find(r => r.id === c.id)?.count || 0} • Driver kept: R{(ridesByCat.find(r => r.id === c.id)?.earnings || 0).toFixed(2)}</div>
          </div>
        ))}
      </div>
    </section>
    {tab === 'bundles' && <>
      <h2>Bundle Sales ({filter})</h2>
      {filteredBundles.map(b => {
        const cat = categoryFor(b.category)
        return (
          <div key={b.id} style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div><strong>Bundle {b.id.slice(0, 8)}</strong> · {b.driver_name} · {b.trips} trips · R{Number(b.price).toFixed(2)} · {new Date(b.created_at).toLocaleDateString()} · <span style={{ background: '#0066FF', color: 'white', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{cat.icon} {cat.name} • {cat.seats}</span></div>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>PAID ✅</span>
          </div>
        )
      })}
    </>}
    {tab === 'rides' && <>
      <h2>Rides - Driver Kept 100% ({filter})</h2>
      {filteredRides.map(ride => {
        const cat = categoryFor(ride.ride_category || ride.ride_type)
        return (
          <div key={ride.id} style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div><strong>Ride {ride.id.slice(0, 8)}</strong> · {ride.driver_name} · R{earningsOf(ride).toFixed(2)} kept by driver · {new Date(ride.created_at).toLocaleDateString()} · <span style={{ background: '#0066FF', color: 'white', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>{cat.icon} {cat.name} • {cat.seats}</span> · <span style={{ color: '#22c55e', fontWeight: 700 }}>Driver Paid ✅</span></div>
          </div>
        )
      })}
    </>}
    {!loading && tab === 'bundles' && filteredBundles.length === 0 && <p>No bundle sales found. Check table name.</p>}
    {!loading && tab === 'rides' && filteredRides.length === 0 && <p>No completed trips found.</p>}
  </main>
}