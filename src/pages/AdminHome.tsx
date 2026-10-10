import { useEffect, useState } from 'react'
import { supabase, type Profile, type Ride } from '../lib/supabase'
import { NavigationMenu } from '../NavigationMenu'

export function AdminHome({ profile }: { profile: Profile }) {
  const [rides, setRides] = useState<Ride[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [filter, setFilter] = useState<'all'|'searching'|'active'|'completed'>('all')

  function playAdminPing() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = 800; g.gain.value = 0.5
      o.start(); o.stop(ctx.currentTime + 0.4)
    } catch {}
  }

  useEffect(() => {
    Promise.all([
      supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(200)
    ]).then(([r, u]) => { setRides((r.data as any) || []); setUsers((u.data as any) || []) })

    // 🔴 LIVE - like your driver app
    const ch = supabase.channel('admin-rides').on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, p => {
      const newRide = p.new as Ride
      setRides(prev => {
        const exists = prev.find(r => r.id === newRide.id)
        if (exists) return prev.map(r => r.id === newRide.id? newRide : r)
        playAdminPing()
        return [newRide, ...prev].slice(0, 100)
      })
    }).subscribe()
    const ch2 = supabase.channel('admin-profiles').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, p => {
      setUsers(prev => {
        const n = p.new as Profile
        const exists = prev.find(u => u.id === n.id)
        if (exists) return prev.map(u => u.id === n.id? n : u)
        return [n, ...prev].slice(0, 200)
      })
    }).subscribe()
    return () => { supabase.removeChannel(ch); supabase.removeChannel(ch2) }
  }, [])

  const completed = rides.filter(r => r.status === 'completed')
  const searching = rides.filter(r => r.status === 'searching')
  const active = rides.filter(r => ['accepted','arrived','picked_up','en_route','in_progress'].includes(r.status as any))
  const drivers = users.filter(u => (u as any).role === 'driver')
  const onlineDrivers = drivers.filter((d: any) => d.is_online)
  const passengers = users.filter(u => (u as any).role !== 'driver' && (u as any).role !== 'admin')
  // Revenue: 20% like your DriverHome
  const revenue = completed.reduce((s, r) => {
    const comm = (r as any).buddyride_commission || (Number(r.fare) * 0.20)
    return s + Number(comm || 0)
  }, 0)

  const filteredRides = filter === 'searching'? searching : filter === 'active'? active : filter === 'completed'? completed : rides

  return <div className="admin" style={{ padding: '16px', background: '#121212', color: 'white', minHeight: '100dvh' }}>
    <header className="topbar" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}><NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} /><strong>BuddyRide Admin</strong><span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: '12px' }}>{profile.email}</span></header>
    
    <div className="stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }}>
      <div style={{ background: '#1e1e1e', padding: '12px', borderRadius: '12px', textAlign: 'center' }}><b style={{ display: 'block', fontSize: '20px' }}>{users.length}</b><span style={{ fontSize: '11px', opacity: 0.7 }}>Total Users</span><div style={{ fontSize: '10px', marginTop: '4px' }}>{drivers.length} drivers • {passengers.length} pax • <span style={{ color: '#00d181' }}>{onlineDrivers.length} online</span></div></div>
      <div style={{ background: '#1e1e1e', padding: '12px', borderRadius: '12px', textAlign: 'center' }}><b style={{ display: 'block', fontSize: '20px' }}>{rides.length}</b><span style={{ fontSize: '11px', opacity: 0.7 }}>Total Rides</span><div style={{ fontSize: '10px', marginTop: '4px', color: '#ff7a00' }}>{searching.length} searching • {active.length} active</div></div>
      <div style={{ background: '#1e1e1e', padding: '12px', borderRadius: '12px', textAlign: 'center' }}><b style={{ display: 'block', fontSize: '20px', color: '#00d181' }}>R {revenue.toFixed(2)}</b><span style={{ fontSize: '11px', opacity: 0.7 }}>Platform 20%</span><div style={{ fontSize: '10px', marginTop: '4px' }}>{completed.length} completed</div></div>
    </div>

    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
      <button onClick={() => setFilter('all')} style={{ padding: '8px 12px', borderRadius: '20px', border: 'none', background: filter==='all'? '#ff7a00' : '#2a2a2a', color: 'white', fontSize: '12px', fontWeight: 'bold' }}>All {rides.length}</button>
      <button onClick={() => setFilter('searching')} style={{ padding: '8px 12px', borderRadius: '20px', border: 'none', background: filter==='searching'? '#ff7a00' : '#2a2a2a', color: 'white', fontSize: '12px' }}>🔍 Searching {searching.length}</button>
      <button onClick={() => setFilter('active')} style={{ padding: '8px 12px', borderRadius: '20px', border: 'none', background: filter==='active'? '#00d181' : '#2a2a2a', color: 'white', fontSize: '12px' }}>🟢 Active {active.length}</button>
      <button onClick={() => setFilter('completed')} style={{ padding: '8px 12px', borderRadius: '20px', border: 'none', background: filter==='completed'? '#00d181' : '#2a2a2a', color: 'white', fontSize: '12px' }}>✅ Completed {completed.length}</button>
    </div>

    <section className="panel" style={{ background: '#1e1e1e', borderRadius: '12px', padding: '12px' }}>
      <h2 style={{ margin: '0 0 10px', fontSize: '14px' }}>Recent rides - {filter} • Live 🔊</h2>
      {filteredRides.map(r => (
        <div className="table-row" key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #333', fontSize: '12px' }}>
          <span style={{ opacity: 0.6 }}>{r.id.slice(0,8)} • {new Date(r.created_at).toLocaleTimeString()}</span>
          <span style={{ 
            background: r.status==='searching'? '#ff7a00' : r.status==='completed'? '#00d181' : '#4285F4',
            color: 'white', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold'
          }}>{r.status}</span>
          <span>R {Number((r as any).total_fare ?? r.fare ?? 0).toFixed(0)} • {(r as any).ride_category || 'Go'}</span>
          <span style={{ color: '#00d181' }}>BR R {Number((r as any).buddyride_commission ?? Number(r.fare)*0.2).toFixed(0)}</span>
        </div>
      ))}
    </section>

    <section className="panel" style={{ background: '#1e1e1e', borderRadius: '12px', padding: '12px', marginTop: '12px' }}>
      <h2 style={{ margin: '0 0 10px', fontSize: '14px' }}>Drivers Online • {onlineDrivers.length}</h2>
      {onlineDrivers.slice(0, 10).map((d: any) => (
        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #333', fontSize: '12px' }}>
          <span>{d.full_name || d.email?.slice(0,15)} • {d.car_plate || ''} • R{d.wallet_balance || 0}</span>
          <span style={{ color: '#00d181' }}>● ONLINE</span>
        </div>
      ))}
    </section>
  </div>
}