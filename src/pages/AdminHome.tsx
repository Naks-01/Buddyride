import { useEffect, useState } from 'react'
import { supabase, type Profile, type Ride } from '../lib/supabase'
import { NavigationMenu } from '../NavigationMenu'

export function AdminHome({ profile }: { profile: Profile }) {
  const [rides, setRides] = useState<Ride[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  useEffect(() => {
    Promise.all([
      supabase.from('rides').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100)
    ]).then(([r, u]) => { setRides(r.data || []); setUsers(u.data || []) })
  }, [])
  const completed = rides.filter(r => r.status === 'completed')
  const revenue = completed.reduce((s, r) => s + Number(r.buddyride_commission || 0), 0)
  return <div className="admin">
    <header className="topbar"><NavigationMenu profile={profile} onSignOut={() => { void supabase.auth.signOut() }} /><strong>BuddyRide1 Admin</strong><span>{profile.email}</span></header>
    <div className="stats"><div><b>{users.length}</b><span>Users</span></div><div><b>{rides.length}</b><span>Rides</span></div><div><b>R {revenue.toFixed(2)}</b><span>Platform revenue</span></div></div>
    <section className="panel"><h2>Recent rides</h2>{rides.map(r => <div className="table-row" key={r.id}><span>{r.id.slice(0,8)}</span><span>{r.status}</span><span>R {r.total_fare.toFixed(2)}</span><span>BR R {Number(r.buddyride_commission).toFixed(2)}</span></div>)}</section>
  </div>
}