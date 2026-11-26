import { useState, useRef, useEffect } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { DriverTomTomMap } from '../components/DriverTomTomMap'
import { RideChat } from '../components/RideChat'
import { getTomTomRoute as getRoute } from '../lib/tomtom'
import { createRealtimeChannel } from '../lib/realtime'
import { updateRide } from '../lib/rideUpdates'
import { supabase, type Profile, type Ride } from '../lib/supabase'
import { NavigationMenu } from '../components/NavigationMenu'
import { useDriverLocation } from '../hooks/useDriverLocation'
import { useBundle } from '../hooks/useBundle'
import { useVehicleCheck } from '../hooks/useVehicleCheck'
import { useDocsCheck } from '../hooks/useDocsCheck'
import { PanicButton } from '../hooks/PanicButton'
import { IncomingRideSheet } from '../hooks/IncomingRideSheet'

const EXPIRE = 15
const BLUE = '#0066FF'
const BG = '#FFFFFF'
const BORDER = '#E2E8F0'
const POLOKWANE: [number, number] = [29.4587, -23.9045]
const CATEGORIES = [
  { id: 'buddy_lite', name: 'Buddy Lite', seats: '2 seats', desc: 'Small car • Cheapest • Base 20 / R6 per km' },
  { id: 'buddy_plus', name: 'Buddy Plus', seats: '4 seats', desc: 'Standard • Most rides • Base 25 / R8 per km' },
  { id: 'buddy_max', name: 'Buddy Max', seats: '6-7 seats', desc: 'XL • Groups & luggage • Base 40 / R12 per km' },
]

export function DriverHome({ profile }: { profile: Profile }) {
  const [ride, setRide] = useState<Ride | null>(null)
  const [incoming, setIncoming] = useState<Ride | null>(null)
  const [route, setRoute] = useState<any>()
  const [isOnline, setIsOnline] = useState(false)
  const [countdown, setCountdown] = useState(EXPIRE)
  const [showChat, setShowChat] = useState(false)
  const timer = useRef<any>(null)
  const [showFix, setShowFix] = useState(false)
  const [allZones, setAllZones] = useState<{id:string, name:string}[]>([])
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [selectedRideType, setSelectedRideType] = useState('buddy_plus')
  const [savingFix, setSavingFix] = useState(false)
  const [vehicleInfo, setVehicleInfo] = useState<any>(null)
  // STEP 2: Vehicle inputs
  const [vMake, setVMake] = useState('')
  const [vModel, setVModel] = useState('')
  const [vColour, setVColour] = useState('')
  const [vReg, setVReg] = useState('')
  const [vYear, setVYear] = useState('')

  const { bundleCredits, bundleCount, reloadBundle } = useBundle(profile.id)
  const { missingFields, missingLabels, vehicleOk, reloadVehicle, vehicle } = useVehicleCheck(profile.id) as any
  const { docsOk, verified } = useDocsCheck(profile.id)
  const { location: gpsLoc, lastLoc } = useDriverLocation(profile.id, isOnline, !!ride)
  const location: [number, number] = (gpsLoc && Array.isArray(gpsLoc) && gpsLoc.length === 2 && typeof gpsLoc[0] === 'number' && gpsLoc[0] !== 0) ? gpsLoc as [number, number] : POLOKWANE

  useEffect(() => {
    void (async () => {
      const [{ data: v }, { data: zones }, { data: p }] = await Promise.all([
        supabase.from('driver_vehicles').select('*').eq('driver_id', profile.id).maybeSingle(),
        supabase.from('service_zones').select('id,name').order('name'),
        supabase.from('profiles').select('service_zones,ride_type,vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_colour,vehicle_registration').eq('id', profile.id).single(),
      ])
      if (zones) setAllZones(zones as any)
      if (v) setVehicleInfo(v)
      const zonesFromV = Array.isArray((v as any)?.service_zones) ? (v as any).service_zones : []
      const zonesFromP = Array.isArray((p as any)?.service_zones) ? (p as any).service_zones : []
      const rawZones = zonesFromV.length ? zonesFromV : zonesFromP
      if (rawZones.length && zones) {
        const normalized = rawZones.map((z: string) => {
          const match = (zones as any).find((zz: any) => zz.id === z || zz.name === z || zz.name?.toLowerCase() === String(z).toLowerCase())
          return match ? match.id : z
        })
        setSelectedZones(normalized)
      } else if (rawZones.length) setSelectedZones(rawZones)
      const rt = (v as any)?.ride_type || (p as any)?.ride_type
      if (rt) {
        const found = CATEGORIES.find(c => c.id === rt || c.name === rt || String(rt).toLowerCase() === c.name.toLowerCase())
        if (found) setSelectedRideType(found.id)
      }
      // STEP 2: Prefill vehicle from DB or hook
      const mergedV: any = { ...(p || {}), ...(v || {}), ...(vehicle || {}) }
      if (mergedV.vehicle_make || mergedV.make_model) setVMake(mergedV.vehicle_make || String(mergedV.make_model || '').split(' ')[0] || '')
      if (mergedV.vehicle_model) setVModel(mergedV.vehicle_model)
      else if (mergedV.make_model && String(mergedV.make_model).split(' ').length > 1) setVModel(String(mergedV.make_model).split(' ').slice(1).join(' '))
      if (mergedV.vehicle_color || mergedV.vehicle_colour || mergedV.colour || mergedV.color) setVColour(mergedV.vehicle_color || mergedV.vehicle_colour || mergedV.colour || mergedV.color)
      if (mergedV.vehicle_registration || mergedV.registration) setVReg(mergedV.vehicle_registration || mergedV.registration)
      if (mergedV.vehicle_year || mergedV.year) setVYear(String(mergedV.vehicle_year || mergedV.year))
    })()
  }, [profile.id, vehicle])

  const hasZones = selectedZones.length > 0
  const hasRideType = Boolean(selectedRideType)
  // STEP 2: Loop fix - trust local for zones/ride_type, but vehicle still needs hook
  const zonesMissing = !hasZones
  const rideTypeMissing = !hasRideType
  const otherMissing = (missingFields || []).filter((f: string) => f !== 'service_zones' && f !== 'ride_type')
  const canGoOnline = docsOk && verified && vehicleOk && hasZones && hasRideType && (bundleCredits ?? 0) > 0

  async function saveFix() {
    if (!hasZones) { alert('Pick at least 1 Service Area'); return }
    if (!hasRideType) { alert('Pick a Ride Type'); return }
    if (!vMake || !vModel || !vReg) { alert('Fill Vehicle Make, Model, Registration'); return }
    setSavingFix(true)
    try {
      const payloadVehicles = {
        driver_id: profile.id,
        service_zones: selectedZones,
        ride_type: selectedRideType,
        vehicle_make: vMake,
        vehicle_model: vModel,
        vehicle_color: vColour,
        vehicle_colour: vColour,
        vehicle_registration: vReg,
        vehicle_year: vYear ? Number(vYear) : null,
        make_model: `${vMake} ${vModel}`.trim(),
        vehicle_make_model: `${vMake} ${vModel}`.trim(),
        colour: vColour,
        registration: vReg,
        year: vYear ? Number(vYear) : null,
        updated_at: new Date().toISOString()
      }
      const { data: existing } = await supabase.from('driver_vehicles').select('driver_id').eq('driver_id', profile.id).maybeSingle()
      const { error: vErr } = existing
        ? await supabase.from('driver_vehicles').update(payloadVehicles).eq('driver_id', profile.id)
        : await supabase.from('driver_vehicles').insert(payloadVehicles)
      if (vErr) throw vErr

      const payloadProfiles = {
        service_zones: selectedZones,
        ride_type: selectedRideType,
        vehicle_make: vMake,
        vehicle_model: vModel,
        vehicle_color: vColour,
        vehicle_colour: vColour,
        vehicle_registration: vReg,
        vehicle_year: vYear ? Number(vYear) : null,
      }
      const { error: pErr } = await supabase.from('profiles').update(payloadProfiles).eq('id', profile.id)
      if (pErr) console.warn('profiles update', pErr)

      if (reloadVehicle) await reloadVehicle()
      setShowFix(false)
      if ((bundleCredits ?? 0) <= 0) {
        alert(`✅ ${CATEGORIES.find(c=>c.id===selectedRideType)?.name} + Vehicle saved - now buy bundle`)
        window.location.assign('/driver/bundle')
        return
      }
      alert(`✅ Saved - you can now Go Online`)
    } catch (e: any) { alert(e.message || 'Could not save') } finally { setSavingFix(false) }
  }

  async function toggleOnline() {
    if (!isOnline) {
      if (zonesMissing || rideTypeMissing || otherMissing.length > 0) { setShowFix(true); return }
      if ((bundleCredits ?? 0) <= 0) { window.location.assign('/driver/bundle'); return }
      if (!docsOk || !verified) { alert('Waiting admin approval - docs still under review'); return }
    }
    const next = !isOnline
    const { error } = await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: next, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' })
    if (error) { alert('Could not go online - try again'); return }
    setIsOnline(next)
  }

  async function accept(id: string) {
    clearInterval(timer.current)
    const { error } = await supabase.rpc('accept_ride_with_bundle', { p_ride_id: id })
    if (error) { if (String(error.message || '').includes('NO_CREDITS')) { window.location.href = '/driver/bundle'; return } alert(error.message); return }
    const { data } = await supabase.from('rides').select('*').eq('id', id).single()
    if (data) { setRide(data as Ride); try { const dest: [number, number] = [Number((data as any).pickup_lng), Number((data as any).pickup_lat)]; const r = await getRoute(lastLoc.current, dest); setRoute(r.geometry) } catch {} }
    reloadBundle(); setIncoming(null); setIsOnline(false)
  }
  async function decline(id: string) { clearInterval(timer.current); await supabase.from('ride_requests').update({ status: 'declined' }).eq('ride_id', id).eq('driver_id', profile.id); setIncoming(null) }
  async function handleTripAction() {
    if (!ride) return
    const s = String(ride.status)
    if (s === 'arrived') { const data = await updateRide(ride.id, { status: 'in_progress' }); if (data) setRide(data as any); return }
    if (s.includes('progress') || s === 'picked_up' || s === 'en_route' || s === 'on_trip') {
      const { error } = await supabase.rpc('complete_ride', { p_ride_id: ride.id }); if (error) { alert(error.message); return }
      const { data } = await supabase.from('rides').select('*').eq('id', ride.id).single()
      if (data) { alert(`✅ Trip Complete - Receipt sent. YOU KEEP R${(data as any).fare}`); setRide(null); setRoute(undefined); setShowChat(false); reloadBundle() } return
    }
    const data = await updateRide(ride.id, { status: 'arrived' }); if (data) setRide(data as any)
  }
  useEffect(() => { if (!incoming) return; setCountdown(EXPIRE); timer.current = setInterval(() => setCountdown(s => { if (s <= 1) { void decline(incoming.id); return 0 } return s - 1 }), 1000); return () => clearInterval(timer.current) }, [incoming?.id])
  useEffect(() => {
    if (!isOnline || ride) return
    const ch = createRealtimeChannel(`offers-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${profile.id}` }, async (p: any) => {
      if (p.new?.status === 'pending') { const { data } = await supabase.from('rides').select('*').eq('id', p.new.ride_id).eq('status', 'searching').single(); if (data) setIncoming(data as Ride) }
    }).subscribe(); return () => { supabase.removeChannel(ch) }
  }, [isOnline, ride])

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: BG }}>
      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, bottom: 0 }}><DriverTomTomMap center={location} driverLocation={location} route={route} theme="light" /></div>
      <header style={{ position: 'relative', zIndex: 300, display: 'flex', gap: 10, padding: 12, background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <NavigationMenu profile={profile} theme="light" onThemeChange={() => {}} onSignOut={() => supabase.auth.signOut()} />
        <button onClick={() => window.location.href = '/driver/bundle'} style={{ flex: 1, borderRadius: 999, padding: '8px 12px', border: '1px solid #DBEAFE', background: '#EFF6FF', color: BLUE, fontWeight: 800, fontSize: 12 }}>{bundleCredits ?? 0} trips • {bundleCount} bundles</button>
      </header>
      {(zonesMissing || rideTypeMissing || otherMissing.length > 0) && (
        <div style={{ position: 'relative', zIndex: 250, margin: 8, padding: 12, borderRadius: 12, background: '#FEF3F2', color: '#B42318', fontSize: 13, fontWeight: 700, border: '1px solid #FECACA' }}>
          ⚠️ Complete to Go Online: {zonesMissing ? 'Service Area ' : ''}{rideTypeMissing ? 'Ride Type ' : ''}{otherMissing.length ? missingLabels.filter((l: string) => l !== 'Service Area' && l !== 'Ride Type').join(', ') : ''}
          {vehicleInfo && <div style={{ color: '#067647', marginTop: 4, fontSize: 12 }}>🚗 {vehicleInfo.vehicle_year || vehicleInfo.year} {vehicleInfo.make_model || vehicleInfo.vehicle_make_model} • {vehicleInfo.colour || vehicleInfo.vehicle_colour} • {vehicleInfo.registration || vehicleInfo.vehicle_registration}</div>}
          <button onClick={() => setShowFix(true)} style={{ marginTop: 8, width: '100%', background: BLUE, color: '#fff', border: 0, borderRadius: 8, padding: '10px', fontWeight: 900 }}>Fix Service Area & Ride Type →</button>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60 }}>
        <BottomSheet snapPoint={50} onSnapChange={() => {}}>
          {!ride ? (
            <div style={{ textAlign: 'center' }}>
              <button onClick={toggleOnline} style={{ width: '100%', padding: 16, borderRadius: 14, background: (canGoOnline || zonesMissing || rideTypeMissing || otherMissing.length>0) ? (isOnline ? '#B42318' : BLUE) : '#94A3B8', color: 'white', border: 0, fontWeight: 900 }}>{isOnline ? 'GO OFFLINE' : (zonesMissing || rideTypeMissing || otherMissing.length>0) ? 'FIX & GO ONLINE →' : canGoOnline ? 'GO ONLINE • BLUE' : 'Waiting Approval'}</button>
              <div style={{ marginTop: 8, fontSize: 11, color: '#64748B' }}>POPIA: Trip data kept 6 months • Compliant</div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0, color: '#0F172A' }}>R{ride.fare} • Cash | Card</h3><span style={{ fontSize: 10, background: '#DBEAFE', color: BLUE, padding: '4px 8px', borderRadius: 999, fontWeight: 800 }}>YOU KEEP R{ride.fare}</span></div>
              <p style={{ fontSize: 12, opacity: 0.7, margin: '6px 0' }}>{ride.pickup_address} → {ride.dropoff_address}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => setShowChat(true)} style={{ padding: 12, borderRadius: 10, background: '#F8FAFF', border: `1px solid ${BORDER}` }}>💬</button>
                <button onClick={handleTripAction} style={{ flex: 1, padding: 14, borderRadius: 12, background: BLUE, color: 'white', border: 0, fontWeight: 800 }}>{String(ride.status) === 'arrived' ? 'Start Trip →' : (String(ride.status).includes('progress') || String(ride.status) === 'picked_up' || String(ride.status) === 'en_route' || String(ride.status) === 'on_trip') ? 'Complete ✓ • Receipt' : 'I Have Arrived'}</button>
              </div>
            </div>
          )}
        </BottomSheet>
      </div>
      {incoming && <IncomingRideSheet ride={incoming} countdown={countdown} onAccept={accept} onDecline={decline} />}
      {showChat && ride && (<div style={{position:'fixed',inset:0,zIndex:5000,background:'white'}}><button onClick={() => setShowChat(false)} style={{position:'absolute',top:12,right:12,zIndex:5001,padding:'8px 12px',borderRadius:999,border:`1px solid ${BORDER}`,background:'white',fontWeight:800}}>✕ Close</button><RideChat rideId={ride.id} myId={profile.id} /></div>)}
      {showFix && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'end center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: 20, maxHeight: '85dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Complete to Go Online</h3><button onClick={() => setShowFix(false)} style={{ border: 0, background: '#F2F4F7', borderRadius: 999, padding: '6px 12px', fontWeight: 800 }}>✕</button></div>
            <p style={{ color: '#667085', fontSize: 13 }}>Pick where you drive and what ride type + vehicle.</p>
            <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>📍 Service Area</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(allZones.length ? allZones : [{id:'polokwane',name:'Polokwane'},{id:'seshego',name:'Seshego'},{id:'mankweng',name:'Mankweng'}]).map(z => { const on = selectedZones.includes(z.id); return <button key={z.id} onClick={() => setSelectedZones(s => on ? s.filter(x => x!==z.id) : [...s, z.id])} style={{ padding: '10px 14px', borderRadius: 999, border: on ? `2px solid ${BLUE}` : `1px solid ${BORDER}`, background: on ? '#EFF6FF' : '#fff', color: on ? BLUE : '#182230', fontWeight: 800 }}>{on ? '✓ ' : ''}{z.name}</button> })}
            </div>
            <div style={{ fontWeight: 800, margin: '16px 0 6px' }}>🚙 Ride Type</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORIES.map(t => { const on = selectedRideType === t.id; return <button key={t.id} onClick={() => setSelectedRideType(t.id)} style={{ padding: '12px 14px', borderRadius: 12, border: on ? `2px solid ${BLUE}` : `1px solid ${BORDER}`, background: on ? '#EFF6FF' : '#fff', color: on ? BLUE : '#182230', fontWeight: 800, textAlign: 'left' }}>{on ? '✓ ' : ''}{t.name} • {t.seats}<div style={{ fontSize: 11, fontWeight: 400, color: '#667085' }}>{t.desc}</div></button> })}
            </div>
            <div style={{ fontWeight: 800, margin: '16px 0 6px' }}>🚗 Vehicle (fixes red bar)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={vMake} onChange={e=>setVMake(e.target.value)} placeholder="Make e.g. Toyota" style={{ padding: '12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14 }} />
              <input value={vModel} onChange={e=>setVModel(e.target.value)} placeholder="Model e.g. Corolla" style={{ padding: '12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={vColour} onChange={e=>setVColour(e.target.value)} placeholder="Colour e.g. White" style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14 }} />
                <input value={vYear} onChange={e=>setVYear(e.target.value)} placeholder="Year e.g. 2022" style={{ width: 100, padding: '12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14 }} />
              </div>
              <input value={vReg} onChange={e=>setVReg(e.target.value.toUpperCase())} placeholder="Registration e.g. HCM 339 L" style={{ padding: '12px', borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, fontWeight: 700 }} />
            </div>
            <button onClick={saveFix} disabled={savingFix} style={{ width: '100%', marginTop: 20, padding: 16, borderRadius: 14, background: BLUE, color: '#fff', border: 0, fontWeight: 900 }}>{savingFix ? 'Saving...' : 'Save & Go Online →'}</button>
          </div>
        </div>
      )}
    </div>
  )
}