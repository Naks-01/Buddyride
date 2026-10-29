import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Driver = { id: string, full_name: string | null, email: string | null, phone: string | null, is_banned?: boolean | null }

export function AdminDrivers({ onBack }: { onBack: () => void }) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error: loadError } = await supabase.from('profiles').select('*').eq('role','driver').order('created_at',{ascending:false})
    if (loadError) { setError(loadError.message); return }
    setDrivers((data || []) as Driver[])
  }
  useEffect(()=>{ void load() },[])

  async function toggleBan(driver: Driver) {
    setBusyId(driver.id)
    setError('')
    const { error: updateError } = await supabase.from('profiles').update({ is_banned: !driver.is_banned } as any).eq('id',driver.id)
    if (updateError) setError('Could not update driver ban status: ' + updateError.message)
    else await load()
    setBusyId(null)
  }

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Drivers</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    {drivers.map(driver=><section key={driver.id} style={{background:'#1e293b', padding:'12px', borderRadius:'10px', marginTop:'10px'}}>
      <strong>{driver.full_name || 'Unnamed driver'}</strong><div>{driver.email}</div><div>{driver.phone}</div>
      <button disabled={busyId===driver.id} onClick={()=>void toggleBan(driver)} style={{marginTop:'8px', padding:'8px 12px', background:driver.is_banned?'#15803d':'#b91c1c', color:'white', border:0, borderRadius:'6px'}}>{driver.is_banned?'Unban':'Ban'}</button>
    </section>)}
    {!drivers.length && !error && <p>No drivers found.</p>}
  </main>
}
