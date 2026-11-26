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
import { IncomingRideSheet } from '../hooks/IncomingRideSheet'
import { useGlobalTheme } from '../hooks/useGlobalTheme'

const EXPIRE = 15
const BLUE = '#0066FF'
const POLOKWANE: [number, number] = [29.4587, -23.9045]
const CATEGORIES = [
  { id: 'buddy_lite', name: 'Buddy Lite', seats: '2 seats', desc: 'Small car • Cheapest • Base 20 / R6 per km' },
  { id: 'buddy_plus', name: 'Buddy Plus', seats: '4 seats', desc: 'Standard • Most rides • Base 25 / R8 per km' },
  { id: 'buddy_max', name: 'Buddy Max', seats: '6-7 seats', desc: 'XL • Groups & luggage • Base 40 / R12 per km' },
]
const MIN_KM = 2
const MAX_KM = 5

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function DriverHome({ profile }: { profile: Profile }) {
  const [ride, setRide] = useState<Ride | null>(null)
  const [incoming, setIncoming] = useState<Ride | null>(null)
  const [route, setRoute] = useState<any>()
  const [isOnline, setIsOnline] = useState(false)
  const [countdown, setCountdown] = useState(EXPIRE)
  const [showChat, setShowChat] = useState(false)
  const timer = useRef<any>(null)
  const [showFix, setShowFix] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<25 | 50 | 80 | 90>(25)
  const [allZones, setAllZones] = useState<{id:string, name:string}[]>([])
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [selectedRideType, setSelectedRideType] = useState('buddy_plus')
  const [savingFix, setSavingFix] = useState(false)
  const [vehicleInfo, setVehicleInfo] = useState<any>(null)
  const [vMake, setVMake] = useState('')
  const [vModel, setVModel] = useState('')
  const [vColour, setVColour] = useState('')
  const [vReg, setVReg] = useState('')
  const [vYear, setVYear] = useState('')

  const [pickupDistance, setPickupDistance] = useState(MIN_KM)
  const [autoAccept, setAutoAccept] = useState(true)
  const [savingDistance, setSavingDistance] = useState(false)
  const pickupRef = useRef({ distance: MIN_KM, autoAccept: true })
  pickupRef.current = { distance: pickupDistance, autoAccept }

  const { theme, setTheme, isDark } = useGlobalTheme()
  const THEME_BG = isDark ? '#0b1120' : '#f5f5f7'
  const THEME_BORDER = isDark ? '#29364a' : 'rgba(0,0,0,0.08)'
  const THEME_TEXT = isDark ? '#f8fafc' : '#111827'
  const THEME_SUB = isDark ? '#aeb9cb' : '#6b7280'

  const { bundleCredits, bundleCount, reloadBundle } = useBundle(profile.id)
  const { missingFields, missingLabels, vehicleOk, reloadVehicle, vehicle } = useVehicleCheck(profile.id) as any
  const { docsOk, verified } = useDocsCheck(profile.id)
  const { location: gpsLoc, lastLoc } = useDriverLocation(profile.id, isOnline, !!ride)
  const [mapCenter] = useState<[number, number]>(POLOKWANE)
  const location: [number, number] = (gpsLoc && Array.isArray(gpsLoc) && gpsLoc.length === 2 && typeof gpsLoc[0] === 'number' && gpsLoc[0] !== 0) ? gpsLoc as [number, number] : POLOKWANE

  async function savePickupDistance(newDist: number, newAuto: boolean) {
    const clamped = Math.min(MAX_KM, Math.max(MIN_KM, newDist))
    setPickupDistance(clamped)
    setAutoAccept(newAuto)
    setSavingDistance(true)
    await supabase.from('profiles').update({ search_radius_km: clamped, auto_accept_enabled: newAuto } as any).eq('id', profile.id)
    setSavingDistance(false)
  }

  useEffect(() => {
    void (async () => {
      const [{ data: v }, { data: zones }, { data: p }] = await Promise.all([
        supabase.from('driver_vehicles').select('*').eq('driver_id', profile.id).maybeSingle(),
        supabase.from('service_zones').select('id,name').order('name'),
        supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle(),
      ])
      if (zones) setAllZones(zones as any)
      if (v) setVehicleInfo(v)
      if (p) {
        const d = Number((p as any).search_radius_km ?? MIN_KM)
        if (d >= MIN_KM && d <= MAX_KM) setPickupDistance(d)
        setAutoAccept((p as any).auto_accept_enabled ?? true)
      }
      const zonesFromV = Array.isArray((v as any)?.service_zones) ? (v as any).service_zones : typeof (v as any)?.service_zones === 'string' ? [(v as any).service_zones] : []
      const zonesFromP = Array.isArray((p as any)?.service_zones) ? (p as any).service_zones : typeof (p as any)?.service_zones === 'string' ? [(p as any).service_zones] : []
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
  const needsFix = (missingFields || []).length > 0
  const canGoOnline = docsOk && verified && vehicleOk && hasZones && hasRideType

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
      await supabase.from('profiles').update({ service_zones: selectedZones, ride_type: selectedRideType, vehicle_make: vMake, vehicle_model: vModel, vehicle_color: vColour, vehicle_colour: vColour, vehicle_registration: vReg, vehicle_year: vYear ? Number(vYear) : null } as any).eq('id', profile.id)
      if (reloadVehicle) await reloadVehicle()
      setShowFix(false)
      if ((bundleCredits ?? 0) <= 0) { window.location.assign('/driver/bundle'); return }
    } catch (e: any) { alert(e.message || 'Could not save') } finally { setSavingFix(false) }
  }

  async function toggleOnline() {
    if (!isOnline) {
      if (needsFix) { setShowFix(true); return }
      if ((bundleCredits ?? 0) <= 0) { window.location.assign('/driver/bundle'); return }
      if (!docsOk || !verified) { alert('Waiting admin approval'); return }
    }
    const next = !isOnline
    const { error } = await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: next, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' })
    if (error) { alert('Could not go online'); return }
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
      if (data) { alert(`✅ Complete - YOU KEEP R${(data as any).fare}`); setRide(null); setRoute(undefined); setShowChat(false); reloadBundle() } return
    }
    const data = await updateRide(ride.id, { status: 'arrived' }); if (data) setRide(data as any)
  }
  useEffect(() => { if (!incoming) return; setCountdown(EXPIRE); timer.current = setInterval(() => setCountdown(s => { if (s <= 1) { void decline(incoming.id); return 0 } return s - 1 }), 1000); return () => clearInterval(timer.current) }, [incoming?.id])
  useEffect(() => {
    if (!isOnline || ride) return
    const ch = createRealtimeChannel(`offers-${profile.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'ride_requests', filter: `driver_id=eq.${profile.id}` }, async (p: any) => {
      if (p.new?.status === 'pending') {
        const { data } = await supabase.from('rides').select('*').eq('id', p.new.ride_id).eq('status', 'searching').single()
        if (!data) return
        const pickupLat = Number((data as any).pickup_lat)
        const pickupLng = Number((data as any).pickup_lng)
        const driverLat = lastLoc.current?.[1] ?? location[1]
        const driverLng = lastLoc.current?.[0] ?? location[0]
        if (pickupLat && pickupLng && driverLat && driverLng) {
          const dist = getDistanceKm(driverLat, driverLng, pickupLat, pickupLng)
          if (dist > pickupRef.current.distance) {
            await supabase.from('ride_requests').update({ status: 'declined' }).eq('ride_id', p.new.ride_id).eq('driver_id', profile.id)
            return
          }
          if (pickupRef.current.autoAccept) { await accept(p.new.ride_id); return }
        }
        setIncoming(data as Ride)
      }
    }).subscribe(); return () => { supabase.removeChannel(ch) }
  }, [isOnline, ride])

  const pct = ((pickupDistance - MIN_KM) / (MAX_KM - MIN_KM)) * 100

  // STEP 4: Blue brand, respects dark/light - no more hardcoded black/green
  const PickupDistanceCard = (
    <div style={{ background: isDark ? '#111a2a' : '#ffffff', borderRadius: 24, padding: 20, color: THEME_TEXT, border: `1px solid ${THEME_BORDER}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 20 }}>Maximum pickup distance</span>
        <button onClick={() => void savePickupDistance(pickupDistance, !autoAccept)} style={{ width: 52, height: 32, borderRadius: 999, border: 0, background: autoAccept ? BLUE : '#2a2a2a', position: 'relative', cursor: 'pointer' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: autoAccept ? 22 : 2, transition: '0.2s' }} />
        </button>
      </div>
      <div style={{ color: THEME_SUB, fontSize: 16, marginTop: 16, lineHeight: 1.4 }}>Rides within this distance will be<br />automatically accepted</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 20 }}>
        <button onClick={() => pickupDistance > MIN_KM && void savePickupDistance(pickupDistance - 1, autoAccept)} disabled={pickupDistance <= MIN_KM} style={{ width: 60, height: 60, borderRadius: '50%', border: 0, background: isDark ? '#1a2332' : '#f5f5f7', color: THEME_TEXT, fontSize: 30, cursor: 'pointer', opacity: pickupDistance <= MIN_KM ? 0.4 : 1 }}>—</button>
        <div style={{ textAlign: 'center', minWidth: 70 }}><div style={{ fontSize: 52, fontWeight: 800 }}>{pickupDistance}</div><div style={{ color: THEME_SUB, fontSize: 16, marginTop: -4 }}>km</div></div>
        <button onClick={() => pickupDistance < MAX_KM && void savePickupDistance(pickupDistance + 1, autoAccept)} disabled={pickupDistance >= MAX_KM} style={{ width: 60, height: 60, borderRadius: '50%', border: 0, background: isDark ? '#1a2332' : '#f5f5f7', color: THEME_TEXT, fontSize: 30, cursor: 'pointer', opacity: pickupDistance >= MAX_KM ? 0.4 : 1 }}>+</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, padding: '0 8px' }}>
        <div style={{ color: BLUE, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}><span style={{ fontSize: 18 }}>{MIN_KM}</span><span style={{ fontSize: 16, marginTop: 4 }}>min</span></div>
        <div style={{ flex: 1, margin: '0 16px', position: 'relative', height: 30, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', height: 6, background: isDark ? '#29364a' : '#E4E7EC', borderRadius: 999 }}><div style={{ width: `${pct}%`, height: 6, background: BLUE, borderRadius: 999 }} /></div>
          <div style={{ position: 'absolute', left: `calc(${pct}% - 3px)`, top: 0, width: 6, height: 22, background: BLUE, borderRadius: 999 }} />
        </div>
        <div style={{ color: THEME_SUB, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}><span style={{ fontSize: 18 }}>{MAX_KM}</span><span style={{ fontSize: 16, marginTop: 4 }}>max</span></div>
      </div>
      {savingDistance && <div style={{ fontSize: 11, color: BLUE, marginTop: 8, textAlign: 'center' }}>Saving...</div>}
    </div>
  )

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: THEME_BG }}>
      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, bottom: 0 }}><DriverTomTomMap center={mapCenter} driverLocation={location} route={route} theme={theme} /></div>
      <header style={{ position: 'relative', zIndex: 300, display: 'flex', gap: 8, padding: 12, background: THEME_BG, borderBottom: `1px solid ${THEME_BORDER}`, alignItems: 'center' }}>
        <NavigationMenu profile={profile} theme={theme} onThemeChange={setTheme} onSignOut={() => supabase.auth.signOut()} />
        <button onClick={() => window.location.href = '/driver/bundle'} style={{ flex: 1, borderRadius: 999, padding: '8px 12px', border: `1px solid ${isDark ? '#334155' : '#DBEAFE'}`, background: isDark ? '#1e293b' : '#EFF6FF', color: BLUE, fontWeight: 800, fontSize: 12 }}>{bundleCredits ?? 0} trips • {bundleCount} bundles</button>
        <button onClick={() => setShowSettings(true)} style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${THEME_BORDER}`, background: isDark ? '#1e293b' : '#F2F4F7', display: 'grid', placeItems: 'center', fontSize: 20 }}>⚙️</button>
        <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} style={{ width: 44, height: 32, borderRadius: 999, border: `1px solid ${THEME_BORDER}`, background: isDark ? '#1e293b' : '#F2F4F7', display: 'grid', placeItems: 'center', fontSize: 16 }}>{isDark ? '🌙' : '☀️'}</button>
      </header>
      {needsFix && (
        <div onClick={() => setShowFix(true)} style={{ position: 'relative', zIndex: 250, margin: '8px 12px 0', padding: '10px 14px', borderRadius: 999, background: isDark ? '#7F1D1D' : '#FEF3F2', color: isDark ? '#FECACA' : '#B42318', fontSize: 12, fontWeight: 700, border: `1px solid ${isDark ? '#991B1B' : '#FECACA'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <span>⚠️ Fix: {missingLabels.join(', ')}</span>
          <span style={{ background: BLUE, color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 11 }}>FIX →</span>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 60 }}>
        <BottomSheet snapPoint={sheetSnap} onSnapChange={setSheetSnap} theme={theme}>
          {!ride ? (
            <div style={{ padding: '0 4px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#12B76A' : '#98A2B3' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: THEME_TEXT }}>{isOnline ? 'You are online' : 'You are offline'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: THEME_SUB }}>{bundleCredits ?? 0} trips</span>
                  <button onClick={() => setShowSettings(true)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, border: `1px solid ${THEME_BORDER}`, background: THEME_BG, color: THEME_TEXT }}>⚙️ Settings</button>
                </div>
              </div>
              <button onClick={toggleOnline} style={{ width: '100%', padding: 18, borderRadius: 100, background: isOnline ? (isDark ? '#334155' : '#1D2939') : BLUE, color: 'white', border: 0, fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,102,255,.25)' }}>
                {isOnline ? 'GO OFFLINE' : needsFix ? 'FIX & GO ONLINE' : canGoOnline ? 'GO ONLINE' : 'WAITING APPROVAL'}
              </button>
              <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11, color: THEME_SUB }}>POPIA • 6 months • {isDark ? 'Dark' : 'Light'} mode</div>
            </div>
          ) : (
            <div style={{ padding: '0 4px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: THEME_TEXT }}>R{ride.fare}</h3><span style={{ background: isDark ? '#fff' : '#101828', color: isDark ? '#000' : '#fff', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>CASH • CARD</span></div>
              <p style={{ fontSize: 13, color: THEME_SUB, margin: '8px 0' }}>{ride.pickup_address} → {ride.dropoff_address}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setShowChat(true)} style={{ padding: 12, borderRadius: 100, background: isDark ? '#1e293b' : '#F2F4F7', border: `1px solid ${THEME_BORDER}`, width: 48, height: 48 }}>💬</button>
                <button onClick={handleTripAction} style={{ flex: 1, padding: 16, borderRadius: 100, background: BLUE, color: 'white', border: 0, fontWeight: 800, fontSize: 15 }}>{String(ride.status) === 'arrived' ? 'Start ride' : 'Complete ride'}</button>
              </div>
            </div>
          )}
        </BottomSheet>
      </div>
      {incoming && <IncomingRideSheet ride={incoming} countdown={countdown} onAccept={accept} onDecline={decline} />}

      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 7000, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'end center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: isDark ? '#0f172a' : '#FFFFFF', borderRadius: '20px 20px 0 0', padding: 20, maxHeight: '90dvh', overflowY: 'auto', color: THEME_TEXT, border: `1px solid ${THEME_BORDER}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Settings</h3>
              <button onClick={() => setShowSettings(false)} style={{ border: 0, background: isDark ? '#1e293b' : '#F2F4F7', borderRadius: 999, padding: '8px 14px', fontWeight: 800, color: THEME_TEXT, fontSize: 14 }}>✕ Close</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 12, border: `1px solid ${THEME_BORDER}`, background: THEME_BG, marginBottom: 12 }}>
              <span style={{ fontWeight: 700 }}>Theme</span>
              <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${THEME_BORDER}`, background: isDark ? '#1e293b' : '#F2F4F7', color: THEME_TEXT, fontWeight: 800 }}>{isDark ? '🌙 Dark' : '☀️ Light'}</button>
            </div>
            {PickupDistanceCard}
          </div>
        </div>
      )}

      {showChat && ride && (<div style={{position:'fixed',inset:0,zIndex:5000,background: THEME_BG}}><button onClick={() => setShowChat(false)} style={{position:'absolute',top:12,right:12,zIndex:5001,padding:'8px 12px',borderRadius:999,border:`1px solid ${THEME_BORDER}`,background: THEME_BG,color: THEME_TEXT,fontWeight:800}}>✕ Close</button><RideChat rideId={ride.id} myId={profile.id} /></div>)}
      {showFix && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'end center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: THEME_BG, borderRadius: '20px 20px 0 0', padding: 20, maxHeight: '85dvh', overflowY: 'auto', color: THEME_TEXT, border: `1px solid ${THEME_BORDER}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>Complete to Go Online</h3><button onClick={() => setShowFix(false)} style={{ border: 0, background: isDark ? '#1e293b' : '#F2F4F7', borderRadius: 999, padding: '6px 12px', fontWeight: 800, color: THEME_TEXT }}>✕</button></div>
            <div style={{ fontWeight: 800, margin: '12px 0 6px' }}>📍 Service Area</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(allZones.length ? allZones : [{id:'polokwane',name:'Polokwane'},{id:'seshego',name:'Seshego'},{id:'mankweng',name:'Mankweng'}]).map(z => { const on = selectedZones.includes(z.id); return <button key={z.id} onClick={() => setSelectedZones(s => on ? s.filter(x => x!==z.id) : [...s, z.id])} style={{ padding: '10px 14px', borderRadius: 999, border: on ? `2px solid ${BLUE}` : `1px solid ${THEME_BORDER}`, background: on ? (isDark ? '#1e293b' : '#EFF6FF') : THEME_BG, color: on ? BLUE : THEME_TEXT, fontWeight: 800 }}>{on ? '✓ ' : ''}{z.name}</button> })}
            </div>
            <div style={{ fontWeight: 800, margin: '16px 0 6px' }}>🚙 Ride Type</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORIES.map(t => { const on = selectedRideType === t.id; return <button key={t.id} onClick={() => setSelectedRideType(t.id)} style={{ padding: '12px 14px', borderRadius: 12, border: on ? `2px solid ${BLUE}` : `1px solid ${THEME_BORDER}`, background: on ? (isDark ? '#1e293b' : '#EFF6FF') : THEME_BG, color: on ? BLUE : THEME_TEXT, fontWeight: 800, textAlign: 'left' }}>{on ? '✓ ' : ''}{t.name} • {t.seats}<div style={{ fontSize: 11, fontWeight: 400, color: THEME_SUB }}>{t.desc}</div></button> })}
            </div>
            <div style={{ fontWeight: 800, margin: '16px 0 6px' }}>🚗 Vehicle</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={vMake} onChange={e=>setVMake(e.target.value)} placeholder="Make e.g. Toyota" style={{ padding: '12px', borderRadius: 10, border: `1px solid ${THEME_BORDER}`, background: THEME_BG, color: THEME_TEXT }} />
              <input value={vModel} onChange={e=>setVModel(e.target.value)} placeholder="Model e.g. Corolla" style={{ padding: '12px', borderRadius: 10, border: `1px solid ${THEME_BORDER}`, background: THEME_BG, color: THEME_TEXT }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={vColour} onChange={e=>setVColour(e.target.value)} placeholder="Colour" style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${THEME_BORDER}`, background: THEME_BG, color: THEME_TEXT }} />
                <input value={vYear} onChange={e=>setVYear(e.target.value)} placeholder="Year" style={{ width: 100, padding: '12px', borderRadius: 10, border: `1px solid ${THEME_BORDER}`, background: THEME_BG, color: THEME_TEXT }} />
              </div>
              <input value={vReg} onChange={e=>setVReg(e.target.value.toUpperCase())} placeholder="HCM 339 L" style={{ padding: '12px', borderRadius: 10, border: `1px solid ${THEME_BORDER}`, background: THEME_BG, color: THEME_TEXT, fontWeight: 700 }} />
            </div>
            <button onClick={saveFix} disabled={savingFix} style={{ width: '100%', marginTop: 20, padding: 16, borderRadius: 100, background: BLUE, color: '#fff', border: 0, fontWeight: 900 }}>{savingFix ? 'Saving...' : 'Save & Go Online →'}</button>
          </div>
        </div>
      )}
    </div>
  )
}