import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type RideRow = {
  id: string
  pickup_address: string
  dropoff_address: string
  driver_id: string | null
  passenger_id: string
  fare: number
  status: string
  created_at: string
}

type UserInfo = { full_name: string | null, email: string | null }

export function AdminRides({ onBack }: { onBack: () => void }) {
  const [rides, setRides] = useState<RideRow[]>([])
  const [users, setUsers] = useState<Record<string, UserInfo>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error: ridesError } = await supabase.from('rides').select('id,pickup_address,dropoff_address,driver_id,passenger_id,fare,status,created_at').order('created_at', { ascending:false }).limit(500)
      if (ridesError) { setError(ridesError.message); return }
      const rows = (data || []) as RideRow[]
      setRides(rows)
      const ids = [...new Set(rows.flatMap(ride => [ride.driver_id, ride.passenger_id].filter((id): id is string => Boolean(id))))]
      if (!ids.length) return
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,full_name,email').in('id', ids)
      if (profilesError) { setError(profilesError.message); return }
      setUsers(Object.fromEntries((profiles || []).map(user => [user.id, { full_name:user.full_name, email:user.email }])))
    }
    void load()
  }, [])

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button>
    <h1>Rides</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%', borderCollapse:'collapse', background:'#1e293b'}}>
        <thead><tr>{['ID','From','To','Driver','Passenger','Fare','Status','Date'].map(label=><th key={label} style={{padding:'10px', textAlign:'left'}}>{label}</th>)}</tr></thead>
        <tbody>{rides.map(ride=><tr key={ride.id} style={{borderTop:'1px solid #475569'}}>
          <td style={{padding:'10px'}}>{ride.id.slice(0,8)}</td>
          <td style={{padding:'10px'}}>{ride.pickup_address}</td>
          <td style={{padding:'10px'}}>{ride.dropoff_address}</td>
          <td style={{padding:'10px'}}>{ride.driver_id ? users[ride.driver_id]?.full_name || users[ride.driver_id]?.email || ride.driver_id : 'Unassigned'}</td>
          <td style={{padding:'10px'}}>{users[ride.passenger_id]?.full_name || users[ride.passenger_id]?.email || ride.passenger_id}</td>
          <td style={{padding:'10px'}}>R{Number(ride.fare).toFixed(2)}</td>
          <td style={{padding:'10px'}}>{ride.status}</td>
          <td style={{padding:'10px'}}>{new Date(ride.created_at).toLocaleString()}</td>
        </tr>)}
        {rides.length===0 && <tr><td colSpan={8} style={{padding:'12px'}}>No rides found.</td></tr>}</tbody>
      </table>
    </div>
  </main>
}
