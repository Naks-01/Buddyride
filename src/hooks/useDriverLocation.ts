import { useEffect, useState, useRef } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import { supabase } from '../lib/supabase'

const POLOKWANE: [number, number] = [29.4589, -23.9045]

export function useDriverLocation(driverId: string, isOnline: boolean, hasRide: boolean) {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE)
  const lastLoc = useRef<[number, number]>(POLOKWANE)
  const watchId = useRef<string | null>(null)

  useEffect(() => {
    Geolocation.requestPermissions()
    Geolocation.getCurrentPosition({ enableHighAccuracy: true }).then(p => {
      const pos: [number, number] = [p.coords.longitude, p.coords.latitude]
      setLocation(pos); lastLoc.current = pos
    })
    Geolocation.watchPosition({ enableHighAccuracy: true }, (pos) => {
      if (!pos?.coords) return
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p); lastLoc.current = p
      if (isOnline || hasRide) {
        supabase.from('driver_locations').upsert({
          driver_id: driverId, lat: pos.coords.latitude, lng: pos.coords.longitude,
          is_online: isOnline, updated_at: new Date().toISOString()
        }, { onConflict: 'driver_id' })
      }
    }).then(id => watchId.current = id)
    return () => { if (watchId.current) Geolocation.clearWatch({ id: watchId.current }) }
  }, [isOnline, hasRide])

  return { location, lastLoc }
}