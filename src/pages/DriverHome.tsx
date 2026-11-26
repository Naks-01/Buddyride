import { useState, useRef, useEffect } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { DriverTomTomMap } from '../components/DriverTomTomMap'
import { RideChat } from '../components/RideChat'
import { getTomTomRoute as getRoute } from '../lib/tomtom'
import { createRealtimeChannel } from '../lib/realtime'
import { updateRide } from '../lib/rideUpdates'
import { supabase, type Profile, type Ride } from '../lib/supabase'
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
  const [showMenu, setShowMenu] = useState(false)
  const [sheetSnap, setSheetSnap] = useState<25 | 50 | 80 | 90>(25)
  const [allZones, setAllZones] = useState<{id:string, name:string}[]>([])
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [selectedRideType, setSelectedRideType] = useState('buddy_plus')
  const [savingFix, setSavingFix] = useState(false)
  const [vMake, setVMake] = useState('')
  const [vModel, setVModel] = useState('')
  const [vColour, setVColour] = useState('')
  const [vReg, setVReg] = useState('')
  const [vYear, setVYear] = useState('')
  const [pickupDistance, setPickupDistance] = useState(MIN_KM)
  const [autoAccept, setAutoAccept] = useState(true)
  const [savingDistance, setSavingDistance] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [docsList, setDocsList] = useState<any[]>([])
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const docInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
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

  const go = (path: string) => { setShowMenu(false); setTimeout(() => { window.location.assign(path) }, 80) }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: data.publicUrl } as any).eq('id', profile.id)
      window.location.reload()
    } catch (err: any) { alert(err.message || 'Photo failed') } finally { setUploadingPhoto(false) }
  }

  async function uploadDoc(type: string, file: File) {
    setUploadingDoc(type)
    try {
      const ext = file.name.split('.').pop()
      const path = `${profile.id}/${type}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('driver_docs').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('driver_docs').getPublicUrl(path)
      const existing = docsList.find((d: any) => d.doc_type === type)
      if (existing) {
        await supabase.from('driver_documents').update({ file_url: data.publicUrl, status: 'pending', updated_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await supabase.from('driver_documents').insert({ driver_id: profile.id, doc_type: type, file_url: data.publicUrl, status: 'pending' })
      }
      const { data: fresh } = await supabase.from('driver_documents').select('*').eq('driver_id', profile.id)
      if (fresh) setDocsList(fresh)
    } catch (e: any) { alert(e.message) } finally { setUploadingDoc(null) }
  }

  async function savePickupDistance(newDist: number, newAuto: boolean) {
    const clamped = Math.min(MAX_KM, Math.max(MIN_KM, newDist))
    setPickupDistance(clamped); setAutoAccept(newAuto); setSavingDistance(true)
    await supabase.from('profiles').update({ search_radius_km: clamped, auto_accept_enabled: newAuto } as any).eq('id', profile.id)
    setSavingDistance(false)
  }

  useEffect(() => {
    void (async () => {
      const [{ data: v }, { data: zones }, { data: p }, { data: docs }] = await Promise.all([
        supabase.from('driver_vehicles').select('*').eq('driver_id', profile.id).maybeSingle(),
        supabase.from('service_zones').select('id,name').order('name'),
        supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle(),
        supabase.from('driver_documents').select('*').eq('driver_id', profile.id),
      ])
      if (zones) setAllZones(zones as any)
      if (docs) setDocsList(docs)
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
        driver_id: profile.id, service_zones: selectedZones, ride_type: selectedRideType,
        vehicle_make: vMake, vehicle_model: vModel, vehicle_color: vColour, vehicle_colour: vColour,
        vehicle_registration: vReg, vehicle_year: vYear ? Number(vYear) : null,
        make_model: `${vMake} ${vModel}`.trim(), vehicle_make_model: `${vMake} ${vModel}`.trim(),
        colour: vColour, registration: vReg, year: vYear ? Number(vYear) : null, updated_at: new Date().toISOString()
      }
      const { data: existing } = await supabase.from('driver_vehicles').select('driver_id').eq('driver_id', profile.id).maybeSingle()
      const { error: vErr } = existing
        ? await supabase.from('driver_vehicles').update(payloadVehicles).eq('driver_id', profile.id)
        : await supabase.from('driver_vehicles').insert(payloadVehicles)
      if (vErr) throw vErr
      await supabase.from('profiles').update({ service_zones: selectedZones, ride_type: selectedRideType, vehicle_make: vMake, vehicle_model: vModel, vehicle_color: vColour, vehicle_colour: vColour, vehicle_registration: vReg, vehicle_year: vYear ? Number(vYear) : null } as any).eq('id', profile.id)
      if (reloadVehicle) await reloadVehicle()
      setShowFix(false)
      if ((bundleCredits ?? 0) <= 0) { go('/driver/bundle'); return }
    } catch (e: any) { alert(e.message || 'Could not save') } finally { setSavingFix(false) }
  }

  async function toggleOnline() {
    if (!isOnline) {
      if (needsFix) { setShowFix(true); return }
      if ((bundleCredits ?? 0) <= 0) { go('/driver/bundle'); return }
      if (!docsOk || !verified) { alert('Waiting admin approval - check Documents in menu'); setShowMenu(true); return }
    }
    const next = !isOnline
    const { error } = await supabase.from('driver_status').upsert({ driver_id: profile.id, is_online: next, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' })
    if (error) { alert('Could not go online'); return }
    setIsOnline(next)
  }

  async function accept(id: string) {
    clearInterval(timer.current)
    const { error } = await supabase.rpc('accept_ride_with_bundle', { p_ride_id: id })
    if (error) { if (String(error.message || '').includes('NO_CREDITS')) { go('/driver/bundle'); return } alert(error.message); return }
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
        const pickupLat = Number((data as any).pickup_lat); const pickupLng = Number((data as any).pickup_lng)
        const driverLat = lastLoc.current?.[1] ?? location[1]; const driverLng = lastLoc.current?.[0] ?? location[0]
        if (pickupLat && pickupLng && driverLat && driverLng) {
          const dist = getDistanceKm(driverLat, driverLng, pickupLat, pickupLng)
          if (dist > pickupRef.current.distance) {
            await supabase.from('ride_requests').update({ status: 'declined' }).eq('ride_id', p.new.ride_id).eq('driver_id', profile.id); return
          }
          if (pickupRef.current.autoAccept) { await accept(p.new.ride_id); return }
        }
        setIncoming(data as Ride)
      }
    }).subscribe(); return () => { supabase.removeChannel(ch) }
  }, [isOnline, ride])

  const pct = ((pickupDistance - MIN_KM) / (MAX_KM - MIN_KM)) * 100
  const initials = (profile.full_name || 'N').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  const PickupDistanceCard = (
    <div style={{ background: isDark ? '#111a2a' : '#ffffff', borderRadius: 20, padding: 18, color: THEME_TEXT, border: `1px solid ${THEME_BORDER}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Maximum pickup distance</span>
        <button onClick={() => void savePickupDistance(pickupDistance, !autoAccept)} style={{ width: 48, height: 28, borderRadius: 999, border: 0, background: autoAccept ? BLUE : '#2a2a2a', position: 'relative', cursor: 'pointer' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: autoAccept ? 22 : 2, transition: '0.2s' }} />
        </button>
      </div>
      <div style={{ color: THEME_SUB, fontSize: 12, marginTop: 8 }}>Rides within this distance will be automatically accepted</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 14 }}>
        <button onClick={() => pickupDistance > MIN_KM && void savePickupDistance(pickupDistance - 1, autoAccept)} disabled={pickupDistance <= MIN_KM} style={{ width: 48, height: 48, borderRadius: '50%', border: 0, background: isDark ? '#1a2332' : '#F0F0F5', color: THEME_TEXT, fontSize: 24, cursor: 'pointer', opacity: pickupDistance <= MIN_KM ? 0.4 : 1 }}>—</button>
        <div style={{ textAlign: 'center', minWidth: 60 }}><div style={{ fontSize: 42, fontWeight: 800 }}>{pickupDistance}</div><div style={{ color: THEME_SUB, fontSize: 12 }}>km</div></div>
        <button onClick={() => pickupDistance < MAX_KM && void savePickupDistance(pickupDistance + 1, autoAccept)} disabled={pickupDistance >= MAX_KM} style={{ width: 48, height: 48, borderRadius: '50%', border: 0, background: isDark ? '#1a2332' : '#F0F0F5', color: THEME_TEXT, fontSize: 24, cursor: 'pointer', opacity: pickupDistance >= MAX_KM ? 0.4 : 1 }}>+</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
        <span style={{ color: BLUE, fontWeight: 700, fontSize: 12 }}>{MIN_KM} min</span>
        <div style={{ flex: 1, margin: '0 12px', height: 4, background: isDark ? '#29364a' : '#E4E7EC', borderRadius: 999 }}><div style={{ width: `${pct}%`, height: 4, background: BLUE, borderRadius: 999 }} /></div>
        <span style={{ color: THEME_SUB, fontWeight: 700, fontSize: 12 }}>{MAX_KM} max</span>
      </div>
      {savingDistance && <div style={{ fontSize: 11, color: BLUE, marginTop: 6, textAlign: 'center' }}>Saving...</div>}
    </div>
  )

  const DocsInBurger = (
    <div style={{ background: isDark ? '#111a2a' : '#fff', borderRadius: 20, padding: 14, border: `1px solid ${THEME_BORDER}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: THEME_TEXT }}>📄 My Documents</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 800, background: docsOk && verified ? '#ECFDF3' : '#FFFAEB', color: docsOk && verified ? '#12B76A' : '#F79009' }}>{docsOk && verified ? '✓ Verified' : '⏳ Pending'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { id: 'license', name: "Driver's License", icon: '🪪' },
          { id: 'id_doc', name: 'SA ID / Passport', icon: '🆔' },
          { id: 'vehicle_disc', name: 'Vehicle Disc', icon: '🚗' },
          { id: 'insurance', name: 'Insurance', icon: '🛡️' },
        ].map(doc => {
          const existing = docsList.find((d: any) => d.doc_type === doc.id)
          const status = existing?.status || 'missing'
          return (
            <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: isDark ? '#0b1120' : '#F8FAFC', borderRadius: 12, border: `1px solid ${THEME_BORDER}` }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>{doc.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: THEME_TEXT }}>{doc.name}</div>
                  <div style={{ fontSize: 10, color: status === 'verified' ? '#12B76A' : status === 'pending' ? '#F79009' : '#EF4444', fontWeight: 700 }}>
                    {status === 'verified' ? '✓ Verified' : status === 'pending' ? '⏳ Pending review' : '✕ Missing'}
                  </div>
                </div>
              </div>
              <div>
                <input type="file" accept="image/*,.pdf" ref={(el: HTMLInputElement | null) => { docInputRefs.current[doc.id] = el }} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(doc.id, f) }} />
                <button onClick={() => docInputRefs.current[doc.id]?.click()} disabled={uploadingDoc === doc.id} style={{ padding: '6px 12px', borderRadius: 999, border: 0, background: existing ? (isDark ? '#1e293b' : '#EFF6FF') : BLUE, color: existing ? BLUE : '#fff', fontWeight: 800, fontSize: 11, cursor: 'pointer' }}>
                  {uploadingDoc === doc.id ? '...' : existing ? 'Update' : 'Upload'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: THEME_BG }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
      <div style={{ position: 'absolute', top: 56, left: 0, right: 0, bottom: 0 }}><DriverTomTomMap center={mapCenter} driverLocation={location} route={route} theme={theme} /></div>

      <header style={{ position: 'relative', zIndex: 300, display: 'flex', gap: 10, padding: 12, background: THEME_BG, borderBottom: `1px solid ${THEME_BORDER}`, alignItems: 'center' }}>
        <button onClick={() => setShowMenu(true)} style={{ width: 44, height: 44, borderRadius: '50%', border: `1px solid ${THEME_BORDER}`, background: isDark ? '#1e293b' : '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, color: THEME_TEXT, cursor: 'pointer', flexShrink: 0 }}>☰</button>
        <button onClick={() => go('/driver/bundle')} style={{ flex: 1, borderRadius: 999, padding: '10px 14px', border: `1px solid ${isDark ? '#334155' : '#DBEAFE'}`, background: isDark ? '#1e293b' : '#EFF6FF', color: BLUE, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>{bundleCredits ?? 0} trips • {bundleCount} bundles</button>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#12B76A' : '#98A2B3' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: THEME_TEXT }}>{isOnline ? 'You are online' : 'You are offline'}</span>
              </div>
              <button onClick={toggleOnline} style={{ width: '100%', padding: 18, borderRadius: 100, background: isOnline ? (isDark ? '#334155' : '#1D2939') : BLUE, color: 'white', border: 0, fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,102,255,.25)' }}>
                {isOnline ? 'GO OFFLINE' : needsFix ? 'FIX & GO ONLINE' : canGoOnline ? 'GO ONLINE' : 'WAITING APPROVAL'}
              </button>
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

      {showMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 7000, display: 'flex' }}>
          <div style={{ width: '88%', maxWidth: 360, height: '100%', background: isDark ? '#0f172a' : '#F0F6FF', overflowY: 'auto', boxShadow: '8px 0 30px rgba(0,0,0,0.3)' }}>
            <div style={{ background: isDark ? '#1e293b' : '#fff', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME_BORDER}`, position: 'sticky', top: 0, zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 32, height: 32, background: BLUE, color: '#fff', borderRadius: 8, display: 'grid', placeItems: 'center', fontWeight: 800 }}>B</span><span style={{ fontWeight: 800, color: THEME_TEXT }}>BuddyRide Driver</span></div>
              <button onClick={() => setShowMenu(false)} style={{ width: 36, height: 36, borderRadius: '50%', border: 0, background: isDark ? '#334155' : '#F2F4F7', color: THEME_TEXT, fontWeight: 800, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ margin: 14, background: isDark ? '#1e293b' : '#fff', borderRadius: 20, padding: 16, border: `1px solid ${THEME_BORDER}` }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#DBEAFE', border: `2px solid ${BLUE}`, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, color: BLUE, overflow: 'hidden', flexShrink: 0 }}>
                  {(profile as any).avatar_url ? <img src={(profile as any).avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: THEME_TEXT, fontSize: 15, lineHeight: 1.2 }}>{profile.full_name || 'Nakampe Trevor Mokgalaka'}</div>
                  <span style={{ fontSize: 10, background: '#EFF6FF', color: BLUE, padding: '2px 8px', borderRadius: 999, fontWeight: 800, border: `1px solid ${BLUE}33` }}>🛡️ New</span>
                  <button onClick={() => fileRef.current?.click()} style={{ display: 'block', fontSize: 12, color: BLUE, fontWeight: 700, marginTop: 4, border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}>{uploadingPhoto ? 'Uploading...' : 'Change profile photo'}</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
                {[['↗','-','Driver Score'],['⭐','5.00','Rating'],['%','-','Acceptance'],['✕','-','Cancellation']].map(([icon,val,label]) => (
                  <div key={label} style={{ background: isDark ? '#111a2a' : '#E6F0FF', borderRadius: 12, padding: '10px 8px', textAlign: 'center', border: `1px solid ${isDark ? '#1e293b' : '#DBEAFE'}` }}>
                    <div style={{ color: BLUE, fontSize: 14 }}>{icon}</div><div style={{ fontWeight: 800, color: THEME_TEXT, fontSize: 14 }}>{val}</div><div style={{ fontSize: 10, color: THEME_SUB }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: THEME_SUB, marginTop: 10, fontWeight: 600 }}>{(profile as any).phone || profile.phone || '+27793051213'}</div>
              <div style={{ fontSize: 11, color: THEME_SUB, marginTop: 2 }}>{vMake} {vModel} {vReg ? `• ${vReg}` : ''}</div>
            </div>

            <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'My Profile', sub: 'Vehicle, zones', icon: '👤', action: () => { setShowMenu(false); setShowFix(true) } },
                { label: 'Earnings', sub: 'Your payouts', icon: '💳', action: () => go('/driver/earnings') },
                { label: 'My Trips', sub: 'History & receipts', icon: '🚕', action: () => go('/driver/trips') },
                { label: 'My Bundles', sub: `${bundleCredits ?? 0} trips left`, icon: '📦', action: () => go('/driver/bundle') },
              ].map(m => (
                <button key={m.label} onClick={m.action} style={{ width: '100%', background: isDark ? '#1e293b' : '#fff', borderRadius: 16, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${THEME_BORDER}`, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span style={{ width: 40, height: 40, background: '#DBEAFE', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 18 }}>{m.icon}</span><span><div style={{ fontWeight: 700, color: THEME_TEXT, fontSize: 14 }}>{m.label}</div><div style={{ fontSize: 11, color: THEME_SUB }}>{m.sub}</div></span></span>
                  <span style={{ color: BLUE, fontWeight: 800 }}>›</span>
                </button>
              ))}

              <div style={{ fontSize: 10, fontWeight: 800, color: THEME_SUB, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, padding: '0 4px' }}>Documents - Update Anytime</div>
              {DocsInBurger}

              <div style={{ fontSize: 10, fontWeight: 800, color: THEME_SUB, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, padding: '0 4px' }}>Settings</div>
              <div style={{ background: isDark ? '#1e293b' : '#fff', borderRadius: 16, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${THEME_BORDER}` }}>
                <span style={{ fontWeight: 700, color: THEME_TEXT, fontSize: 14 }}>{isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}</span>
                <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} style={{ width: 44, height: 26, borderRadius: 999, border: 0, background: isDark ? BLUE : '#E4E7EC', position: 'relative', cursor: 'pointer' }}><div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: isDark ? 20 : 2, transition: '0.22s' }} /></button>
              </div>
              {PickupDistanceCard}

              <button onClick={() => { if (confirm('Log out?')) { setShowMenu(false); supabase.auth.signOut() } }} style={{ width: '100%', background: isDark ? '#1e293b' : '#fff', color: '#EF4444', borderRadius: 16, padding: 14, border: `1px solid ${isDark ? '#7F1D1D' : '#FECACA'}`, fontWeight: 800, cursor: 'pointer', marginTop: 10 }}>Log out</button>
              <div style={{ textAlign: 'center', fontSize: 10, color: THEME_SUB, padding: '10px 0 20px', lineHeight: 1.5 }}>{bundleCredits ?? 0} trips • {bundleCount} bundles • POPIA<br/>6 months • {isDark ? 'Dark' : 'Light'} mode</div>
            </div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} onClick={() => setShowMenu(false)} />
        </div>
      )}

      {showChat && ride && (<div style={{position:'fixed',inset:0,zIndex:5000,background: THEME_BG}}><button onClick={() => setShowChat(false)} style={{position:'absolute',top:12,right:12,zIndex:5001,padding:'8px 12px',borderRadius:999,border:`1px solid ${THEME_BORDER}`,background: THEME_BG,color: THEME_TEXT,fontWeight:800}}>✕ Close</button><RideChat rideId={ride.id} myId={profile.id} /></div>)}
      {showFix && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'end center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: THEME_BG, borderRadius: '20px 20px 0 0', padding: 20, maxHeight: '85dvh', overflowY: 'auto', color: THEME_TEXT, border: `1px solid ${THEME_BORDER}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0, fontWeight: 800 }}>Complete to Go Online</h3><button onClick={() => setShowFix(false)} style={{ border: 0, background: isDark ? '#1e293b' : '#F2F4F7', borderRadius: 999, padding: '6px 12px', fontWeight: 800, color: THEME_TEXT }}>✕</button></div>
            <div style={{ fontWeight: 800, margin: '12px 0 6px', fontSize: 13 }}>📍 Service Area</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(allZones.length ? allZones : [{id:'polokwane',name:'Polokwane'},{id:'seshego',name:'Seshego'},{id:'mankweng',name:'Mankweng'}]).map(z => { const on = selectedZones.includes(z.id); return <button key={z.id} onClick={() => setSelectedZones(s => on ? s.filter(x => x!==z.id) : [...s, z.id])} style={{ padding: '10px 14px', borderRadius: 999, border: on ? `2px solid ${BLUE}` : `1px solid ${THEME_BORDER}`, background: on ? (isDark ? '#1e293b' : '#EFF6FF') : THEME_BG, color: on ? BLUE : THEME_TEXT, fontWeight: 800 }}>{on ? '✓ ' : ''}{z.name}</button> })}
            </div>
            <div style={{ fontWeight: 800, margin: '16px 0 6px', fontSize: 13 }}>🚙 Ride Type</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORIES.map(t => { const on = selectedRideType === t.id; return <button key={t.id} onClick={() => setSelectedRideType(t.id)} style={{ padding: '12px 14px', borderRadius: 12, border: on ? `2px solid ${BLUE}` : `1px solid ${THEME_BORDER}`, background: on ? (isDark ? '#1e293b' : '#EFF6FF') : THEME_BG, color: on ? BLUE : THEME_TEXT, fontWeight: 800, textAlign: 'left' }}>{on ? '✓ ' : ''}{t.name} • {t.seats}<div style={{ fontSize: 11, fontWeight: 400, color: THEME_SUB }}>{t.desc}</div></button> })}
            </div>
            <div style={{ fontWeight: 800, margin: '16px 0 6px', fontSize: 13 }}>🚗 Vehicle</div>
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