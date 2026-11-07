import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type CompletedRide = { id: string, driver_id: string | null, fare: number, driver_earnings?: number | null, buddyride_commission?: number | null, created_at: string, payout_status?: string | null, driver_name?: string }

export function AdminFinance({ onBack }: { onBack: () => void }) {
  const [rides, setRides] = useState<CompletedRide[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all'>('today')
  const [search, setSearch] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    let query = supabase.from('rides').select('id,driver_id,fare,driver_earnings,buddyride_commission,created_at,payout_status').in('status',['completed','rated']).order('created_at',{ascending:false}).limit(500)
    const now = new Date()
    if (filter === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0)
      query = query.gte('created_at', start.toISOString())
    } else if (filter === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 7)
      query = query.gte('created_at', start.toISOString())
    } else if (filter === 'month') {
      const start = new Date(now); start.setDate(1); start.setHours(0,0,0,0)
      query = query.gte('created_at', start.toISOString())
    }
    const { data, error: loadError } = await query
    if (loadError) setError(loadError.message)
    else {
      // Attach driver names
      const driverIds = [...new Set((data || []).map(r => r.driver_id).filter(Boolean))]
      let names: Record<string, string> = {}
      if (driverIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', driverIds as string[])
        profiles?.forEach(p => names[p.id] = p.full_name || p.id.slice(0,8))
      }
      setRides((data || []).map(r => ({ ...r, driver_name: r.driver_id ? names[r.driver_id] || r.driver_id.slice(0,8) : 'Unassigned' })) as CompletedRide[])
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [filter])

  async function markPaid(rideId: string) {
    setProcessing(rideId)
    const { error } = await supabase.from('rides').update({ payout_status: 'paid' } as any).eq('id', rideId)
    if (error) setError(error.message)
    else setRides(prev => prev.map(r => r.id === rideId ? { ...r, payout_status: 'paid' } : r))
    setProcessing(null)
  }

  const filtered = rides.filter(r => !search || (r.driver_name?.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase())))
  const revenue = filtered.reduce((sum, ride) => sum + Number(ride.fare || 0), 0)
  const platformCommission = filtered.reduce((sum, ride) => sum + Number(ride.buddyride_commission ?? Math.round(Number(ride.fare || 0) * 0.2)), 0)
  const driverEarnings = filtered.reduce((sum, ride) => sum + Number(ride.driver_earnings ?? (Number(ride.fare || 0) - Math.round(Number(ride.fare || 0) * 0.2))), 0)
  const unpaid = filtered.filter(r => r.payout_status !== 'paid').reduce((sum, r) => sum + Number(r.driver_earnings ?? Number(r.fare||0)*0.8), 0)

  // Per-driver totals
  const perDriver = filtered.reduce<Record<string, { name: string, trips: number, earnings: number, commission: number }>>((acc, r) => {
    const key = r.driver_id || 'unassigned'
    if (!acc[key]) acc[key] = { name: r.driver_name || 'Unassigned', trips: 0, earnings: 0, commission: 0 }
    acc[key].trips += 1
    acc[key].earnings += Number(r.driver_earnings ?? Number(r.fare||0)*0.8)
    acc[key].commission += Number(r.buddyride_commission ?? Math.round(Number(r.fare||0)*0.2))
    return acc
  }, {})

  function exportCSV() {
    const rows = [['Ride ID','Driver','Fare','Driver Earnings (80%)','Commission (20%)','Date','Payout']]
    filtered.forEach(r => rows.push([r.id, r.driver_name || '', String(r.fare), String(Number(r.driver_earnings ?? Number(r.fare)*0.8).toFixed(2)), String(Number(r.buddyride_commission ?? Math.round(Number(r.fare)*0.2)).toFixed(2)), new Date(r.created_at).toLocaleDateString(), r.payout_status || 'unpaid']))
    const csv = rows.map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `buddyride-finance-${filter}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Finance</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
      {(['today','week','month','all'] as const).map(f => (
        <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: filter === f ? '#22c55e' : '#334155', color: 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{f}</button>
      ))}
      <button onClick={exportCSV} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: '#0ea5e9', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Export CSV</button>
    </div>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver or ride ID..." style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: '#1e293b', color: 'white', border: '1px solid #334155', marginBottom: 12 }} />
    <section style={{background:'#1e293b', padding:'16px', borderRadius:'12px', marginTop:'12px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12}}>
      <div><div style={{color:'#94a3b8', fontSize:12}}>Gross fares ({filter})</div><strong style={{fontSize:22}}>R{revenue.toFixed(2)}</strong><div style={{fontSize:12, color:'#94a3b8'}}>{filtered.length} trips</div></div>
      <div><div style={{color:'#94a3b8', fontSize:12}}>Platform commission (20%)</div><strong style={{fontSize:22, color:'#22c55e'}}>R{platformCommission.toFixed(2)}</strong></div>
      <div><div style={{color:'#94a3b8', fontSize:12}}>Driver earnings (80%)</div><strong style={{fontSize:22}}>R{driverEarnings.toFixed(2)}</strong></div>
      <div><div style={{color:'#94a3b8', fontSize:12}}>Unpaid to drivers</div><strong style={{fontSize:22, color:'#f59e0b'}}>R{unpaid.toFixed(2)}</strong></div>
    </section>

    <h2>Per-Driver Totals ({filter})</h2>
    {Object.entries(perDriver).length === 0 ? <p style={{color:'#94a3b8'}}>No trips in this period.</p> : Object.entries(perDriver).map(([id, d]) => (
      <div key={id} style={{background:'#1e293b', padding:'12px', borderRadius:'8px', marginTop:'8px', display:'flex', justifyContent:'space-between'}}>
        <div><strong>{d.name}</strong><div style={{fontSize:12, color:'#94a3b8'}}>{d.trips} trips</div></div>
        <div style={{textAlign:'right'}}><div>Driver: <strong>R{d.earnings.toFixed(2)}</strong></div><div style={{fontSize:12, color:'#22c55e'}}>BuddyRide: R{d.commission.toFixed(2)}</div></div>
      </div>
    ))}

    <h2>Completed trip payouts</h2>
    <p style={{fontSize:'12px', color:'#cbd5e1'}}>Latest 500 completed or rated trips. Mark Paid after you pay driver via bank / Capitec.</p>
    {loading && <p>Loading payouts…</p>}
    {filtered.map(ride=>{
      const amount = ride.driver_earnings == null ? Number(ride.fare) * 0.8 : Number(ride.driver_earnings)
      const paid = ride.payout_status === 'paid'
      return <div key={ride.id} style={{background:'#1e293b', padding:'12px', borderRadius:'8px', marginTop:'8px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:10}}>
        <div><strong>Ride {ride.id.slice(0,8)}</strong> · {ride.driver_name} · R{amount.toFixed(2)} · {new Date(ride.created_at).toLocaleDateString()} · <span style={{color: paid ? '#22c55e' : '#f59e0b', fontWeight:700}}>{paid ? 'PAID ✅' : 'UNPAID'}</span></div>
        {!paid && <button disabled={processing===ride.id} onClick={() => markPaid(ride.id)} style={{ padding: '6px 12px', borderRadius: 8, background: '#22c55e', color: 'black', border: 0, fontWeight: 700, cursor: 'pointer' }}>{processing===ride.id ? '...' : 'Mark Paid'}</button>}
      </div>
    })}
    {!loading && filtered.length===0 && <p>No completed trips found.</p>}
  </main>
}