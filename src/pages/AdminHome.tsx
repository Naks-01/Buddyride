import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

type Props = { profile: Profile }

export function AdminHome({ profile }: Props) {
  const [stats, setStats] = useState({ rides: 0, drivers: 0, passengers: 0, active: 0 })
  const [fares, setFares] = useState({ base: 15, perKm: 8, perMin: 1.5, minFare: 25 })
  const [commission, setCommission] = useState(20)
  const [zones, setZones] = useState([
    { name: 'Polokwane Central', active: true, surge: 1.0 },
    { name: 'Seshego', active: true, surge: 1.0 },
    { name: 'Tzaneen', active: false, surge: 1.2 },
    { name: 'Giyani', active: false, surge: 1.3 },
  ])
  const [promo, setPromo] = useState({ code: 'WELCOME50', discount: 50, uses: 124 })
  const [tab, setTab] = useState<'overview'|'finance'|'zones'|'promos'>('overview')

  useEffect(() => {
    (async () => {
      const { count: ridesCount } = await supabase.from('rides').select('*', { count: 'exact', head: true })
      const { count: driversCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver')
      const { count: passengersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'passenger')
      const { count: activeCount } = await supabase.from('driver_status').select('*', { count: 'exact', head: true }).eq('is_online', true)
      setStats({ rides: ridesCount||0, drivers: driversCount||0, passengers: passengersCount||0, active: activeCount||0 })
    })()
  }, [])

  const revenueEst = stats.rides * 45 // avg R45 per ride

  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-4 pb-24">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Command Center</h1>
          <p className="text-sm text-slate-400">Welcome {profile.full_name || profile.email} 👑</p>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 rounded-full bg-slate-800 text-sm">Log out</button>
      </div>

      {/* Stats like Bolt */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-400">TOTAL RIDES</p>
          <p className="text-2xl font-bold">{stats.rides}</p>
          <p className="text-xs text-green-400 mt-1">↑ Live tracking</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-400">ACTIVE DRIVERS</p>
          <p className="text-2xl font-bold">{stats.active} / {stats.drivers}</p>
          <p className="text-xs text-orange-400 mt-1">Online now</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-400">PASSENGERS</p>
          <p className="text-2xl font-bold">{stats.passengers}</p>
          <p className="text-xs text-slate-400 mt-1">Registered</p>
        </div>
        <div className="bg-orange-500 rounded-2xl p-4 text-white">
          <p className="text-xs opacity-80">EST. REVENUE</p>
          <p className="text-2xl font-bold">R {revenueEst}</p>
          <p className="text-xs opacity-80 mt-1">{commission}% commission</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          {id:'overview', label:'📊 Overview'},
          {id:'finance', label:'💰 Finance'},
          {id:'zones', label:'📍 Zones'},
          {id:'promos', label:'🎁 Promos'},
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id as any)} className={`px-4 py-2 rounded-full text-sm whitespace-nowrap ${tab===t.id?'bg-white text-black font-bold':'bg-slate-800'}`}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab==='overview' && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-2xl p-4">
            <h3 className="font-bold mb-3">Live Ride Monitoring</h3>
            <div className="bg-slate-900 rounded-xl h-48 flex items-center justify-center text-slate-500 text-sm">
              🗺️ Mapbox Live — driver_locations table linked here<br/>Active: {stats.active} drivers online
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button className="bg-white text-black rounded-xl p-4 text-left">
              <p className="font-bold">👑 Approve Documents</p>
              <p className="text-xs text-slate-600">Verify driver IDs, licenses, vehicles</p>
            </button>
            <button className="bg-slate-800 rounded-xl p-4 text-left">
              <p className="font-bold">🚨 Support Center</p>
              <p className="text-xs text-slate-400">Complaints, cancellations, disputes</p>
            </button>
          </div>
        </div>
      )}

      {/* FINANCE */}
      {tab==='finance' && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-2xl p-4">
            <h3 className="font-bold mb-4">Fare Configuration</h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Base Fare (R)<input value={fares.base} onChange={e=>setFares({...fares, base:Number(e.target.value)})} className="mt-1 w-full bg-slate-900 rounded-lg p-2" type="number"/></label>
              <label className="text-sm">Per Km (R)<input value={fares.perKm} onChange={e=>setFares({...fares, perKm:Number(e.target.value)})} className="mt-1 w-full bg-slate-900 rounded-lg p-2" type="number"/></label>
              <label className="text-sm">Per Min (R)<input value={fares.perMin} onChange={e=>setFares({...fares, perMin:Number(e.target.value)})} className="mt-1 w-full bg-slate-900 rounded-lg p-2" type="number"/></label>
              <label className="text-sm">Min Fare (R)<input value={fares.minFare} onChange={e=>setFares({...fares, minFare:Number(e.target.value)})} className="mt-1 w-full bg-slate-900 rounded-lg p-2" type="number"/></label>
            </div>
            <button className="mt-4 w-full bg-orange-500 rounded-xl py-3 font-bold">Save Fare Rules</button>
          </div>

          <div className="bg-slate-800 rounded-2xl p-4">
            <h3 className="font-bold mb-2">Commission Management</h3>
            <p className="text-xs text-slate-400 mb-2">Platform cut from each ride</p>
            <div className="flex items-center gap-3">
              <input type="range" min={5} max={35} value={commission} onChange={e=>setCommission(Number(e.target.value))} className="flex-1"/>
              <span className="font-bold text-xl">{commission}%</span>
            </div>
            <p className="text-xs mt-2 text-slate-400">Driver gets {100-commission}% — e.g. R100 ride = R{100-commission} driver, R{commission} you</p>
          </div>
        </div>
      )}

      {/* ZONES */}
      {tab==='zones' && (
        <div className="bg-slate-800 rounded-2xl p-4">
          <h3 className="font-bold mb-4">City / Zone Management (Limpopo)</h3>
          {zones.map((z,i)=>(
            <div key={z.name} className="flex justify-between items-center bg-slate-900 rounded-xl p-3 mb-2">
              <div>
                <p className="font-bold text-sm">{z.name}</p>
                <p className="text-xs text-slate-400">Surge x{z.surge}</p>
              </div>
              <button onClick={()=>{ const nz=[...zones]; nz[i].active=!nz[i].active; setZones(nz)}} className={`px-3 py-1 rounded-full text-xs font-bold ${z.active?'bg-green-600':'bg-slate-700'}`}>{z.active?'Active':'Off'}</button>
            </div>
          ))}
          <button className="w-full mt-3 bg-white text-black rounded-xl py-3 font-bold text-sm">+ Add New Zone</button>
        </div>
      )}

      {/* PROMOS */}
      {tab==='promos' && (
        <div className="bg-slate-800 rounded-2xl p-4">
          <h3 className="font-bold mb-4">Promo Codes</h3>
          <div className="bg-slate-900 rounded-xl p-3">
            <div className="flex justify-between">
              <p className="font-mono font-bold">{promo.code}</p>
              <p className="text-green-400 font-bold">-{promo.discount}%</p>
            </div>
            <p className="text-xs text-slate-400 mt-1">{promo.uses} uses</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <input placeholder="NEWCODE" className="bg-slate-900 rounded-lg p-3 text-sm"/>
            <input placeholder="Discount %" type="number" className="bg-slate-900 rounded-lg p-3 text-sm"/>
          </div>
          <button className="w-full mt-3 bg-orange-500 rounded-xl py-3 font-bold text-sm">Create Promo</button>
        </div>
      )}
    </main>
  )
}