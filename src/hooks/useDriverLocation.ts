import { useEffect, useState, useRef, useCallback } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import { supabase } from '../lib/supabase'

const POLOKWANE: [number, number] = [29.4589, -23.9045]

export function useDriverLocation(driverId: string, isOnline: boolean, hasRide: boolean) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE)
  const [gpsError, setGpsError] = useState('')
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
  const lastLoc = useRef<[number, number]>(POLOKWANE)
  const lastUploadRef = useRef(0)
  const lastUploadedRef = useRef<[number, number] | null>(null)
  const watchId = useRef<string | null>(null)
  const onlineRef = useRef(isOnline)
  const rideRef = useRef(hasRide)
  const driverRef = useRef(driverId)

  useEffect(() => { onlineRef.current = isOnline }, [isOnline])
  useEffect(() => { rideRef.current = hasRide }, [hasRide])
  useEffect(() => { driverRef.current = driverId }, [driverId])

  const upload = useCallback(async (lng: number, lat: number) => {
    const id = driverRef.current
    if (!id) return
    if (!onlineRef.current && !rideRef.current) return
    // FIX: Throttle 5s + min 10m move - was upserting on EVERY GPS tick, hammering DB + battery
    const now = Date.now()
    const last = lastUploadedRef.current
    if (last && now - lastUploadRef.current < 5000) return
    if (last) {
      const dist = Math.hypot((lng - last[0]) * 111000, (lat - last[1]) * 111000)
      if (dist < 10 && now - lastUploadRef.current < 30000) return
    }
    lastUploadRef.current = now
    lastUploadedRef.current = [lng, lat]
    const { error } = await supabase.from('driver_locations').upsert({
      driver_id: id, lat, lng,
      is_online: onlineRef.current, updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id' })
    if (error) console.warn('[useDriverLocation] upload failed', error.message)
  }, [])

  useEffect(() => {
    let active = true
    let cancelled = false
    const start = async () => {
      try {
        const perm = await Geolocation.requestPermissions()
        if (!active) return
        // FIX: Permission handling - was ignoring denied, watch silently failed
        const status = (perm as any)?.location ?? (perm as any)?.coarseLocation ?? 'unknown'
        setPermission(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'prompt')
        if (status === 'denied') { setGpsError('Location permission denied - enable in Settings to go online'); return }
        const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
        if (!active || cancelled) return
        if (p.coords.accuracy != null && p.coords.accuracy > 100) {
          // FIX: Ignore >100m accuracy - was jumping driver to wrong street
          setGpsError('GPS accuracy low - waiting for better signal…')
        } else {
          const pos: [number, number] = [p.coords.longitude, p.coords.latitude]
          setLocation(pos); lastLoc.current = pos
          void upload(pos[0], pos[1])
        }
      } catch (e: any) {
        if (active) setGpsError(e?.message || 'Could not get location')
      }
      // FIX: Watch started ONCE - was recreated on every isOnline/hasRide change, leaking watchers
      const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }, (pos, err) => {
        if (err) { setGpsError(err.message || 'GPS error'); return }
        if (!pos?.coords) return
        // FIX: Ignore junk GPS - 0,0 or >100m accuracy
        if (pos.coords.latitude === 0 && pos.coords.longitude === 0) return
        if (pos.coords.accuracy != null && pos.coords.accuracy > 100) return
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
        setLocation(p); lastLoc.current = p
        void upload(p[0], p[1])
      })
      if (cancelled) { void Geolocation.clearWatch({ id }); return }
      watchId.current = id
    }
    void start()
    return () => {
      cancelled = true
      active = false
      if (watchId.current) { void Geolocation.clearWatch({ id: watchId.current }); watchId.current = null }
    }
    // FIX: Empty deps + refs - watch lives for component life, not recreated on online toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // FIX: When driver goes offline, mark offline in DB - was staying online forever
  useEffect(() => {
    if (isOnline || !driverId) return
    void supabase.from('driver_locations').upsert({ driver_id: driverId, lat: lastLoc.current[1], lng: lastLoc.current[0], is_online: false, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' })
  }, [isOnline, driverId])

  return { location, lastLoc, gpsError, permission }
}
export default useDriverLocation