import { useEffect, useState } from 'react'
import { OsmMapView } from '../components/OsmMapView'
import { supabase } from '../lib/supabase'

type DriverLocation = { driver_id: string, lat: number, lng: number }

export function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState({ todayRides: 0, activeDrivers: 0, revenue: 0 })
  const [locations, setLocations] = useState<DriverLocation[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setError('')
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const [ridesResult, driversResult] = await Promise.all([
        supabase.from('rides').select('fare,total_fare').gte('created_at', start.toISOString()),
        supabase.from('driver_status').select('driver_id,lat,lng').eq('is_online', true),
      ])
      if (ridesResult.error || driversResult.error) {
        setError(ridesResult.error?.message || driversResult.error?.message || 'Could not load dashboard data.')
        return
      }
      const rides = ridesResult.data || []
      setStats({
        todayRides: rides.length,
        activeDrivers: driversResult.data?.length || 0,
        revenue: rides.reduce((total, ride) => total + Number(ride.total_fare ?? ride.fare ?? 0), 0),
      })
      setLocations((driversResult.data || []).filter(
        (driver): driver is DriverLocation => typeof driver.lat === 'number' && typeof driver.lng === 'number'
      ))
    }
    void load()
  }, [])

  const card = { background:'#1e293b', borderRadius:'12px', padding:'16px' }
  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack} style={{marginBottom:'12px'}}>← Admin home</button>
    <h1>Admin Dashboard</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'10px'}}>
      <section style={card}><div>Today Rides</div><strong style={{fontSize:'26px'}}>{stats.todayRides}</strong></section>
      <section style={card}><div>Active Drivers</div><strong style={{fontSize:'26px'}}>{stats.activeDrivers}</strong></section>
      <section style={card}><div>Revenue Today</div><strong style={{fontSize:'26px'}}>R{stats.revenue.toFixed(2)}</strong></section>
    </div>
    <section style={{...card, marginTop:'14px'}}>
      <h2 style={{marginTop:0}}>Live Map</h2>
      <div style={{height:'420px', overflow:'hidden', borderRadius:'10px'}}>
        <OsmMapView center={[29.4689, -23.9045]} availableCars={locations} theme="dark" />
      </div>
      <p style={{fontSize:'12px', color:'#cbd5e1'}}>Showing {locations.length} online driver location(s).</p>
    </section>
  </main>
}
