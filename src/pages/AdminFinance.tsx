import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type CompletedRide = { id: string, driver_id: string | null, fare: number, driver_earnings?: number | null, created_at: string }

export function AdminFinance({ onBack }: { onBack: () => void }) {
  const [commission, setCommission] = useState(15)
  const [rides, setRides] = useState<CompletedRide[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, error: loadError } = await supabase.from('rides').select('id,driver_id,fare,driver_earnings,created_at').eq('status','completed').order('created_at',{ascending:false}).limit(100)
      if (loadError) setError(loadError.message)
      else setRides((data || []) as CompletedRide[])
      setLoading(false)
    }
    void load()
  }, [])

  const revenue = rides.reduce((sum, ride) => sum + Number(ride.fare || 0), 0)
  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Finance</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    <section style={{background:'#1e293b', padding:'16px', borderRadius:'12px', marginTop:'12px'}}>
      <label>Commission %
        <input type="number" min="0" max="100" value={commission} onChange={event=>setCommission(Number(event.target.value))} style={{display:'block', width:'100%', boxSizing:'border-box', padding:'10px', marginTop:'6px'}} />
      </label>
      <p>Completed trips revenue total: <strong>R{revenue.toFixed(2)}</strong></p>
      <p>Estimated platform commission: R{(revenue*commission/100).toFixed(2)}</p>
    </section>
    <h2>Completed trip payouts</h2>
    <p style={{fontSize:'12px', color:'#cbd5e1'}}>Estimated driver share based on the commission input; this page does not initiate payments.</p>
    {loading && <p>Loading payouts…</p>}
    {rides.map(ride=>{
      const amount = ride.driver_earnings == null ? Number(ride.fare)*(100-commission)/100 : Number(ride.driver_earnings)
      return <div key={ride.id} style={{background:'#1e293b', padding:'12px', borderRadius:'8px', marginTop:'8px'}}>
        <strong>Ride {ride.id.slice(0,8)}</strong> · Driver {ride.driver_id || 'Unassigned'} · R{amount.toFixed(2)} · {new Date(ride.created_at).toLocaleDateString()}
      </div>
    })}
    {!loading && rides.length===0 && <p>No completed trips found.</p>}
  </main>
}
