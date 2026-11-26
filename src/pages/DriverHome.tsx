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
// FIX MAP: TomTom needs valid [lng, lat] on first render, Polokwane default
const POLOKWANE: [number, number] = [29.4587, -23.9045]

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
  const [selectedRideType, setSelectedRideType] = useState('')
  const [savingFix, setSavingFix] = useState(false)
  const [vehicleInfo, setVehicleInfo] = useState<any>(null)

  const { bundleCredits, bundleCount, reloadBundle } = useBundle(profile.id)
  const { missingFields, missingLabels, vehicleOk, reloadVehicle } = useVehicleCheck(profile.id) as any
  const { docsOk, verified } = useDocsCheck(profile.id)
  const { location: gpsLoc, lastLoc } = useDriverLocation(profile.id, isOnline, !!ride)

  // FIX MAP: never pass null to TomTom. If GPS null/invalid, use Polokwane. Always [lng, lat].
  const location: [number, number] = (gpsLoc && Array.isArray(gpsLoc) && gpsLoc.length === 2 && typeof gpsLoc[0] === 'number' && typeof gpsLoc[1] === 'number' && gpsLoc[0] !== 0)
    ? gpsLoc as [number, number]
    : POLOKWANE

  useEffect(() => {
    void (async () => {
      const [{ data: v }, { data: zones }, { data: p }] = await Promise.all([
        supabase.from('driver_vehicles').select('*').eq('driver_id', profile.id).maybeSingle(),
        supabase.from('service_zones').select('id,name').order('name'),
        supabase.from('profiles').select('service_area,service_zones,ride_type').eq('id', profile.id).single(),
      ])
      if (zones) setAllZones(zones as any)
      if (v) setVehicleInfo(v)
      const zonesFromV = Array.isArray((v as any)?.service_zones) ? (v as any).service_zones : []
      const zonesFromP = Array.isArray((p as any)?.service_zones) ? (p as any).service_zones : []
      const areaFromP = (p as any)?.service_area ? [String((p as any).service_area)] : []
      const finalZones = zonesFromV.length ? zonesFromV : zonesFromP.length ? zonesFromP : areaFromP
      if (finalZones.length) setSelectedZones(finalZones)
      const rt = (v as any)?.ride_type || (p as any)?.ride_type
      if (rt) setSelectedRideType(rt)
    })()
  }, [profile.id])

  const hasZones = selectedZones.length > 0
  const hasRideType = Boolean(selectedRideType)
  const zonesMissing = missingFields?.includes('service_area') || !hasZones
  const rideTypeMissing = missingFields?.includes('ride_type') || !hasRideType

  const canGoOnline = docsOk && verified && vehicleOk && hasZones && hasRideType && (bundleCredits ?? 0) > 0

  async function saveFix() {
    if (!hasZones) { alert('Pick at least 1 Service Area'); return }
    if (!hasRideType) { alert('Pick a Ride Type'); return }
    setSavingFix(true)
    try {
      const { data: existing } = await supabase.from('driver_vehicles').select('*').eq('driver_id', profile.id).maybeSingle()
      const { error: vErr } = await supabase.from('driver_vehicles').upsert(
        { ...(existing || {}), driver_id: profile.id, service_zones: selectedZones, ride_type: selectedRideType, updated_at: new Date().toISOString() },
        { onConflict: 'driver_id' }
      )
      if (vErr) throw vErr
      const { error: pErr } = await supabase.from('profiles').update({
        service_area: selectedZones[0],
        service_zones: selectedZones,
        ride_type: selectedRideType,
      }).eq('id', profile.id)
      if (pErr) throw pErr
      if (reloadVehicle) await reloadVehicle()
      setShowFix(false)
      alert('✅ Service Area & Ride Type saved - you can now Go Online')
    } catch (e: any) {
      alert(e.message || 'Could not save - try again')
    } finally { setSavingFix(false) }
  }

  async function toggleOnline() {
    if (!isOnline) {
      if (zonesMissing || rideTypeMissing) { setShowFix(true); return }
      if (missingFields.length > 0) { setShowFix(true); return }
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
    if (error) {
      if (String(error.message || '').includes('NO_CREDITS')) { window.location.href = '/driver/bundle'; return }
      alert(error.message)
      return
    }
    const { data } = await supabase.from('rides').select('*').eq('id', id).single()
    if (data) {
      setRide(data as Ride)
      try { const dest: [number, number] = [Number((data as any).pickup_lng), Number((data as any).pickup_lat)]; const r = await getRoute(lastLoc.current, dest); setRoute(r.geometry) } catch {}
    }
    reloadBundle(); setIncoming(null); setIsOnline(false)
  }

  async function decline(id: string) {
    clearInterval(timer.current)
    await supabase.from('ride_requests').update({ status: 'declined' }).eq('ride_id', id).eq('driver_id', profile.id)
    setIncoming(null)
  }

  async function handleTripAction() {
    if (!ride) return
    const s = String(ride.status)
    if (s === 'arrived') {
      const data = await updateRide(ride.id, { status: 'in_progress' })
      if (data) setRide(data as any)
      return
    }
    if (s.includes('progress') || s === 'picked_up' || s === 'en_route' || s === 'on_trip') {
      const { error } = await supabase.rpc('complete_ride', { p_ride_id: ride.id })
      if (error) { alert(error.message); return }
      const { data } = await supabase.from('rides').select('*').eq('id', ride.id).single()
      if (data) {
        alert(`✅ Trip Complete - Receipt sent. YOU KEEP R${(data as any).fare}`)
        setRide(null)
        setRoute(undefined)
        setShowChat(false)
        reloadBundle()
      }
      return
    }
    const data = await updateRide(ride.id, { status: 'arrived' })
    if (data) setRide(data as any)
  }

  useEffect(() => {
    if (!incoming) return
    setCountdown(EXPIRE)
    timer.current = setInterval(() => setCountdown(s => { if (s <= 1) { void decline(incoming.id); return 0 } return s - 1 }), 1000)
    return () => clearInterval(timer.current)
  }, [incoming?.id])

  useEffect(() => {
    if (!isOnline || ride) return
    const ch = createRealtimeChannel(`offers-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${profile.id}` }, async (p: any) => {
      if (p.new?.status === 'pending') {
        const { data } = await supabase.from('rides').select('*').eq('id', p.new.ride_id).eq('status', 'searching').single()
        if (data) setIncoming(data as Ride)
      }
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [isOnline, ride])

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: BG }}>
      {/* FIX MAP: map starts below header (56px), not inset:0 under header. Always has valid center. */}
      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, bottom: 0 }}>
        <DriverTomTomMap center={location} driverLocation={location} route={route} theme="light" />
      </div>

      <header style={{ position: 'relative', zIndex: 300, display: 'flex', gap: 10, padding: 12, background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <NavigationMenu profile={profile} theme="light" onThemeChange={() => {}} onSignOut={() => supabase.auth.signOut()} />
        <button onClick={() => window.location.href = '/driver/bundle'} style={{ flex: 1, borderRadius: 999, padding: '8px 12px', border: '1px solid #DBEAFE', background: '#EFF6FF', color: BLUE, fontWeight: 800, fontSize: 12 }}>
          {bundleCredits ?? 0} trips • {bundleCount} bundles
        </button>
      </header>

      {(zonesMissing || rideTypeMissing) && (
        <div style={{ position: 'relative', zIndex: 250, margin: 8, padding: 12, borderRadius: 12, background: '#FEF3F2', color: '#B42318', fontSize: 13, fontWeight: 700, border: '1px solid #FECACA' }}>
          ⚠️ Complete to Go Online: {zonesMissing ? 'Service Area ' : ''}{zonesMissing && rideTypeMissing ? '• ' : ''}{rideTypeMissing ? 'Ride Type' : ''}
          {vehicleInfo && <div style={{ color: '#067647', marginTop: 4, fontSize: 12 }}>🚗 {vehicleInfo.vehicle_year || vehicleInfo.year} {vehicleInfo.make_model || vehicleInfo.vehicle_make_model} • {vehicleInfo.colour || vehicleInfo.vehicle_colour} • {vehicleInfo.registration || vehicleInfo.vehicle_registration}</div>}
          <button onClick={() => setShowFix(true)} style={{ marginTop: 8, width: '100%', background: BLUE, color: '#fff', border: 0, borderRadius: 8, padding: '10px', fontWeight: 900 }}>Fix Service Area & Ride Type →</button>
        </div>
      )}

      {missingFields.length > 0 && !zonesMissing && !rideTypeMissing && (
        <div style={{ position: 'relative', zIndex: 250, margin: 8, padding: 10, borderRadius: 12, background: '#FEF2F2', color: '#B42318', fontSize: 12, fontWeight: 800, border: '1px solid #FECACA' }}>
          ⚠️ Missing: {(missingLabels?.length ? missingLabels : missingFields).join(', ')} <button onClick={() => setShowFix(true)} style={{ marginLeft: 8, background: BLUE, color: '#fff', border: 0, borderRadius: 6, padding: '4px 8px', fontWeight: 900 }}>Fix →</button>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60 }}>
        <BottomSheet snapPoint={50} onSnapChange={() => {}}>
          {!ride ? (
            <div style={{ textAlign: 'center' }}>
              <button onClick={toggleOnline} disabled={!isOnline && !canGoOnline && !zonesMissing && !rideTypeMissing && !docsOk} style={{ width: '100%', padding: 16, borderRadius: 14, background: (canGoOnline || zonesMissing || rideTypeMissing) ? (isOnline ? '#B42318' : BLUE) : '#94A3B8', color: 'white', border: 0, fontWeight: 900 }}>
                {isOnline ? 'GO OFFLINE' : (zonesMissing || rideTypeMissing) ? 'FIX & GO ONLINE →' : canGoOnline ? 'GO ONLINE • BLUE' : 'Waiting Approval'}
              </button>
              <div style={{ marginTop: 8, fontSize: 11, color: '#64748B' }}>POPIA: Trip data kept 6 months • Compliant</div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0, color: '#0F172A' }}>R{ride.fare} • Cash | Card</h3><span style={{ fontSize: 10, background: '#DBEAFE', color: BLUE, padding: '4px 8px', borderRadius: 999, fontWeight: 800 }}>YOU KEEP R{ride.fare}</span></div>
              <p style={{ fontSize: 12, opacity: 0.7, margin: '6px 0' }}>{ride.pickup_address} → {ride.dropoff_address}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => setShowChat(true)} style={{ padding: 12, borderRadius: 10, background: '#F8FAFF', border: `1px solid ${BORDER}` }}>💬</button>
                <button onClick={handleTripAction} style={{ flex: 1, padding: 14, borderRadius: 12, background: BLUE, color: 'white', border: 0, fontWeight: 800 }}>
                  {String(ride.status) === 'arrived' ? 'Start Trip →' : (String(ride.status).includes('progress') || String(ride.status) === 'picked_up' || String(ride.status) === 'en_route' || String(ride.status) === 'on_trip') ? 'Complete ✓ • Receipt' : 'I Have Arrived'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Track my BuddyRide ${ride.id} https://www.google.com/maps?q=${location[1]},${location[0]}`)}`, '_blank')} style={{ flex: 1, padding: 10, borderRadius: 10, background: '#EFF6FF', color: BLUE, border: '1px solid #DBEAFE', fontWeight: 700, fontSize: 12 }}>📤 Share Trip</button>
                <button onClick={() => { const r = prompt('Report reason?'); if (r) supabase.from('complaints').insert({ ride_id: ride.id, driver_id: profile.id, reason: r }).then(({ error }) => { if (error) alert(error.message); else alert('Report sent to BuddyRide Support') }) }} style={{ flex: 1, padding: 10, borderRadius: 10, background: '#F8FAFF', border: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 12 }}>⚠️ Report</button>
              </div>
              <div style={{ marginTop: 10 }}><PanicButton rideId={ride.id} lat={location[1]} lng={location[0]} /></div>
              <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#64748B' }}>Receipt auto on Complete • Cash or Card • Gov Compliant</div>
            </div>
          )}
        </BottomSheet>
      </div>

      {incoming && <IncomingRideSheet ride={incoming} countdown={countdown} onAccept={accept} onDecline={decline} />}
      
      {showChat && ride && (
        <div style={{position:'fixed',inset:0,zIndex:5000,background:'white'}}>
          <button onClick={() => setShowChat(false)} style={{position:'absolute',top:12,right:12,zIndex:5001,padding:'8px 12px',borderRadius:999,border:`1px solid ${BORDER}`,background:'white',fontWeight:800}}>✕ Close</button>
          <RideChat rideId={ride.id} myId={profile.id} />
        </div>
      )}

      {showFix && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'end center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', padding: 20, maxHeight: '85dvh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Complete to Go Online</h3>
              <button onClick={() => setShowFix(false)} style={{ border: 0, background: '#F2F4F7', borderRadius: 999, padding: '6px 12px', fontWeight: 800 }}>✕</button>
            </div>
            <p style={{ color: '#667085', fontSize: 13 }}>Pick where you drive and what ride type. You are already inside the app.</p>
            <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>📍 Service Area</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(allZones.length ? allZones : [{id:'polokwane',name:'Polokwane'},{id:'seshego',name:'Seshego'},{id:'mankweng',name:'Mankweng'}]).map(z => {
                const on = selectedZones.includes(z.id)
                return <button key={z.id} onClick={() => setSelectedZones(s => on ? s.filter(x => x!==z.id) : [...s, z.id])} style={{ padding: '10px 14px', borderRadius: 999, border: on ? `2px solid ${BLUE}` : `1px solid ${BORDER}`, background: on ? '#EFF6FF' : '#fff', color: on ? BLUE : '#182230', fontWeight: 800 }}>{on ? '✓ ' : ''}{z.name}</button>
              })}
            </div>
            <div style={{ fontWeight: 800, margin: '16px 0 6px' }}>🚙 Ride Type</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['buddy_lite','buddy_go','buddy_xl','buddy_plus'].map(t => {
                const on = selectedRideType === t
                return <button key={t} onClick={() => setSelectedRideType(t)} style={{ padding: '10px 14px', borderRadius: 999, border: on ? `2px solid ${BLUE}` : `1px solid ${BORDER}`, background: on ? '#EFF6FF' : '#fff', color: on ? BLUE : '#182230', fontWeight: 800 }}>{on ? '✓ ' : ''}{t.replace('buddy_','Buddy ').toUpperCase()}</button>
              })}
            </div>
            <button onClick={saveFix} disabled={savingFix} style={{ width: '100%', marginTop: 20, padding: 16, borderRadius: 14, background: BLUE, color: '#fff', border: 0, fontWeight: 900 }}>{savingFix ? 'Saving...' : 'Save & Go Online →'}</button>
          </div>
        </div>
      )}
    </div>
  )
}