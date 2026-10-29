import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Passenger = { id: string, full_name: string | null, email: string | null, phone: string | null, is_banned?: boolean | null }

export function AdminPassengers({ onBack }: { onBack: () => void }) {
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error: loadError } = await supabase.from('profiles').select('*').eq('role','passenger').order('created_at',{ascending:false})
    if (loadError) { setError(loadError.message); return }
    setPassengers((data || []) as Passenger[])
  }
  useEffect(()=>{ void load() },[])

  async function toggleBan(passenger: Passenger) {
    setBusyId(passenger.id)
    setError('')
    const { error: updateError } = await supabase.from('profiles').update({ is_banned: !passenger.is_banned } as any).eq('id',passenger.id)
    if (updateError) setError('Could not update passenger ban status: ' + updateError.message)
    else await load()
    setBusyId(null)
  }

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Passengers</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    {passengers.map(passenger=><section key={passenger.id} style={{background:'#1e293b', padding:'12px', borderRadius:'10px', marginTop:'10px'}}>
      <strong>{passenger.full_name || 'Unnamed passenger'}</strong><div>{passenger.email}</div><div>{passenger.phone}</div>
      <button disabled={busyId===passenger.id} onClick={()=>void toggleBan(passenger)} style={{marginTop:'8px', padding:'8px 12px', background:passenger.is_banned?'#15803d':'#b91c1c', color:'white', border:0, borderRadius:'6px'}}>{passenger.is_banned?'Unban':'Ban'}</button>
    </section>)}
    {!passengers.length && !error && <p>No passengers found.</p>}
  </main>
}
