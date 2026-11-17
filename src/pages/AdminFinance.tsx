import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type CompletedRide = { id: string, driver_id: string | null, fare: number, total_fare?: number | null, driver_earnings?: number | null, buddyride_commission?: number | null, booking_fee?: number | null, created_at: string, payout_status?: string | null, driver_name?: string }

export function AdminFinance({ onBack }: { onBack: () => void }) {
  const [rides, setRides] = useState<CompletedRide[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all'>('today')
  const [search, setSearch] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)
  const [commissionPercent, setCommissionPercent] = useState(20)

  // FIXED: total_fare=0 must fall back to fare, and booking_fee must not be dropped
  const grossOf = (r: CompletedRide) => {
    if (Number(r.total_fare || 0) > 0) return Number(r.total_fare)
    return Number(r.fare || 0) + Number(r.booking_fee || 0)
  }
  // FIXED: Round to cents, not to whole Rand - R45.50 was becoming R46
  const commissionOf = (r: CompletedRide) => {
    if (r.buddyride_commission != null) return Number(r.buddyride_commission)
    const g = grossOf(r)
    return Math.round(g * commissionPercent / 100 * 100) / 100
  }
  const earningsOf = (r: CompletedRide) => {
    if (r.driver_earnings != null) return Number(r.driver_earnings)
    const g = grossOf(r)
    const c = commissionOf(r)
    return Math.round((g - c) * 100) / 100
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data: commissionSetting, error: commissionError } = await supabase.from('app_settings').select('value').eq('key', 'commission_percent').maybeSingle()
      if (!commissionError && commissionSetting?.value != null) {
        const parsedCommission = Number(commissionSetting.value)
        if (Number.isFinite(parsedCommission) && parsedCommission >= 0 && parsedCommission <= 100) setCommissionPercent(parsedCommission)
      }
      let query = supabase.from('rides').select('id,driver_id,fare,total_fare,driver_earnings,buddyride_commission,booking_fee,created_at,payout_status').in('status', ['completed', 'rated']).order('created_at', { ascending: false }).limit(500)
      const now = new Date()
      if (filter === 'today') {
        const start = new Date(now); start.setHours(0, 0, 0, 0)
        query = query.gte('created_at', start.toISOString())
      } else if (filter === 'week') {
        const start = new Date(now); start.setDate(now.getDate() - 7)
        query = query.gte('created_at', start.toISOString())
      } else if (filter === 'month') {
        const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0)
        query = query.gte('created_at', start.toISOString())
      }
      const { data, error: loadError } = await query
      if (loadError) { setError(loadError.message); return }
      const driverIds = [...new Set((data || []).map(r => r.driver_id).filter(Boolean))] as string[]
      let names: Record<string, string> = {}
      if (driverIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', driverIds)
        profiles?.forEach(p => { names[p.id] = p.full_name || p.id.slice(0, 8) })
      }
      setRides((data || []).map(r => ({ ...r, driver_name: r.driver_id ? (names[r.driver_id] || r.driver_id.slice(0, 8)) : 'Unassigned' })) as CompletedRide[])
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [filter])

  async function markPaid(rideId: string, driverName: string, amount: number) {
    const ride = rides.find(r => r.id === rideId)
    if (ride?.payout_status === 'paid') return
    if (!window.confirm(`Mark R${amount.toFixed(2)} as PAID to ${driverName}? Only tap after you have actually paid.`)) return
    setProcessing(rideId)
    try {
      const { data, error } = await supabase.from('rides').update({ payout_status: 'paid', paid_at: new Date().toISOString() } as any).eq('id', rideId).neq('payout_status', 'paid').select('id').maybeSingle()
      if (error) throw error
      if (!data) throw new Error('No payout record was updated. Refresh the page and check whether it was already marked paid.')
      setRides(prev => prev.map(r => r.id === rideId ? { ...r, payout_status: 'paid' } : r))
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setProcessing(null)
    }
  }

  // FIXED: Bulk payout per driver - was missing, had to tap 50 times
  async function markAllPaidForDriver(driverId: string, driverName: string, rideIds: string[], amount: number) {
    const count = rideIds.length
    if (!count) return
    if (!window.confirm(`Mark these ${count} currently filtered unpaid trips (R${amount.toFixed(2)}) as PAID to ${driverName}? Only tap after you have actually paid.`)) return
    setProcessing(`driver:${driverId}`)
    try {
      const { data, error } = await supabase.from('rides').update({ payout_status: 'paid', paid_at: new Date().toISOString() } as any).in('id', rideIds).eq('driver_id', driverId).neq('payout_status', 'paid').select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No payout records were updated. Refresh the page and check the current payout status.')
      await load()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setProcessing(null)
    }
  }

  const filtered = rides.filter(r => !search || (r.driver_name?.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase())))
  const revenue = filtered.reduce((sum, ride) => sum + grossOf(ride), 0)
  const platformCommission = filtered.reduce((sum, ride) => sum + commissionOf(ride), 0)
  const driverEarnings = filtered.reduce((sum, ride) => sum + earningsOf(ride), 0)
  const unpaid = filtered.filter(r => r.payout_status !== 'paid').reduce((sum, r) => sum + earningsOf(r), 0)
  const unpaidCount = filtered.filter(r => r.payout_status !== 'paid').length

  const perDriver = filtered.reduce<Record<string, { name: string, trips: number, earnings: number, commission: number, unpaid: number, unpaidCount: number, unpaidRideIds: string[] }>>((acc, r) => {
    const key = r.driver_id || 'unassigned'
    if (!acc[key]) acc[key] = { name: r.driver_name || 'Unassigned', trips: 0, earnings: 0, commission: 0, unpaid: 0, unpaidCount: 0, unpaidRideIds: [] }
    acc[key].trips += 1
    acc[key].earnings += earningsOf(r)
    acc[key].commission += commissionOf(r)
    if (r.payout_status !== 'paid') { acc[key].unpaid += earningsOf(r); acc[key].unpaidCount += 1; acc[key].unpaidRideIds.push(r.id) }
    return acc
  }, {})

  function exportCSV() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const rows = [['Ride ID', 'Driver', 'Gross', 'Driver Earnings', 'Commission', 'Booking Fee', 'Date', 'Payout']]
    filtered.forEach(r => rows.push([r.id, r.driver_name || '', grossOf(r).toFixed(2), earningsOf(r).toFixed(2), commissionOf(r).toFixed(2), Number(r.booking_fee || 0).toFixed(2), new Date(r.created_at).toLocaleDateString(), r.payout_status || 'unpaid']))
    const csv = rows.map(row => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `buddyride-finance-${filter}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <main style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '16px' }}>
    <button onClick={onBack} style={{ background: '#334155', color: 'white', border: 0, padding: '8px 14px', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>← Admin home</button>
    <h1>Finance</h1>
    {error && <p role="alert" style={{ color: '#fca5a5', background: '#7f1d1d', padding: 10, borderRadius: 10 }}>{error}</p>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
      {(['today', 'week', 'month', 'all'] as const).map(f => (
        <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: filter === f ? '#22c55e' : '#334155', color: 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{f}</button>
      ))}
      <button onClick={() => void load()} disabled={loading} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: '#334155', color: 'white', fontWeight: 700, cursor: 'pointer' }}>{loading ? 'Loading...' : 'Refresh'}</button>
      <button onClick={exportCSV} style={{ padding: '8px 14px', borderRadius: 20, border: 0, background: '#0ea5e9', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Export CSV</button>
    </div>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver or ride ID..." style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: '#1e293b', color: 'white', border: '1px solid #334155', marginBottom: 12 }} />
    <section style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
      <div><div style={{ color: '#94a3b8', fontSize: 12 }}>Gross fares ({filter})</div><strong style={{ fontSize: 22 }}>R{revenue.toFixed(2)}</strong><div style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} trips</div></div>
      <div><div style={{ color: '#94a3b8', fontSize: 12 }}>Platform commission ({commissionPercent}%)</div><strong style={{ fontSize: 22, color: '#22c55e' }}>R{platformCommission.toFixed(2)}</strong></div>
      <div><div style={{ color: '#94a3b8', fontSize: 12 }}>Driver earnings</div><strong style={{ fontSize: 22 }}>R{driverEarnings.toFixed(2)}</strong></div>
      <div><div style={{ color: '#94a3b8', fontSize: 12 }}>Unpaid to drivers</div><strong style={{ fontSize: 22, color: '#f59e0b' }}>R{unpaid.toFixed(2)}</strong><div style={{ fontSize: 12, color: '#94a3b8' }}>{unpaidCount} unpaid trips</div></div>
    </section>
    <h2>Per-Driver Totals ({filter})</h2>
    {Object.entries(perDriver).length === 0 ? <p style={{ color: '#94a3b8' }}>No trips in this period.</p> : Object.entries(perDriver).map(([id, d]) => (
      <div key={id} style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div><strong>{d.name}</strong><div style={{ fontSize: 12, color: '#94a3b8' }}>{d.trips} trips · Unpaid: R{d.unpaid.toFixed(2)} ({d.unpaidCount})</div></div>
        <div style={{ textAlign: 'right' }}><div>Driver: <strong>R{d.earnings.toFixed(2)}</strong></div><div style={{ fontSize: 12, color: '#22c55e' }}>BuddyRide: R{d.commission.toFixed(2)}</div></div>
        {d.unpaidCount > 0 && id !== 'unassigned' && (
          <button disabled={processing === `driver:${id}`} onClick={() => markAllPaidForDriver(id, d.name, d.unpaidRideIds, d.unpaid)} style={{ padding: '8px 12px', borderRadius: 8, background: '#22c55e', color: 'black', border: 0, fontWeight: 700, cursor: 'pointer' }}>{processing === `driver:${id}` ? 'Saving...' : `Mark All ${d.unpaidCount} Paid`}</button>
        )}
      </div>
    ))}
    <h2>Completed trip payouts</h2>
    {loading && <p>Loading payouts…</p>}
    {filtered.map(ride => {
      const amount = earningsOf(ride)
      const paid = ride.payout_status === 'paid'
      return <div key={ride.id} style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div><strong>Ride {ride.id.slice(0, 8)}</strong> · {ride.driver_name} · R{amount.toFixed(2)} · {new Date(ride.created_at).toLocaleDateString()} · <span style={{ color: paid ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>{paid ? 'PAID ✅' : 'UNPAID'}</span></div>
        {!paid && <button disabled={processing === ride.id} onClick={() => markPaid(ride.id, ride.driver_name || 'driver', amount)} style={{ padding: '6px 12px', borderRadius: 8, background: '#22c55e', color: 'black', border: 0, fontWeight: 700, cursor: 'pointer' }}>{processing === ride.id ? '...' : 'Mark Paid'}</button>}
      </div>
    })}
    {!loading && filtered.length === 0 && <p>No completed trips found.</p>}
  </main>
}