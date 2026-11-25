// DRIVER SIDE - publishes GPS to Supabase so passenger sees car move like Bolt
import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

export function useDriverLocationPublisher(driverId: string | null, isOnline: boolean) {
  const lastUpdate = useRef(0)
  const lastPos = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!driverId || !isOnline) return
    if (!navigator.geolocation) { console.error('GPS not supported'); return }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, heading, accuracy } = pos.coords
        // FIX: Ignore bad GPS - was saving 500m accuracy jumps, car teleported on passenger map
        if (accuracy != null && accuracy > 100) return
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
        if (latitude === 0 && longitude === 0) return

        const now = Date.now()
        // FIX: Distance filter - was spamming Supabase every 3s even when parked, burnt quota + battery
        if (lastPos.current) {
          const dLat = latitude - lastPos.current.lat
          const dLng = longitude - lastPos.current.lng
          const distM = Math.sqrt(dLat * dLat + dLng * dLng) * 111320
          if (distM < 8 && now - lastUpdate.current < 10000) return // parked: only every 10s
        }
        if (now - lastUpdate.current < 3000) return // moving: every 3s
        lastUpdate.current = now
        lastPos.current = { lat: latitude, lng: longitude }

        const { error } = await supabase.from('driver_locations').upsert({
          driver_id: driverId,
          lat: latitude,
          lng: longitude,
          heading: heading ?? 0,
          is_online: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'driver_id' })
        if (error) console.error('Driver location upsert failed:', error.message)
      },
      (err) => console.error('Driver GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      // FIX: Fire-and-forget + catch - was unhandled promise, and ran even if driver just toggled offline/online quickly
      void supabase.from('driver_locations').update({ is_online: false, updated_at: new Date().toISOString() }).eq('driver_id', driverId).then(({ error }) => {
        if (error) console.error('Failed to mark driver offline:', error.message)
      })
    }
  }, [driverId, isOnline])
}
export default useDriverLocationPublisher