// DRIVER SIDE - publishes GPS to Supabase so passenger sees car move like Bolt
import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

export function useDriverLocationPublisher(driverId: string | null, isOnline: boolean) {
  const lastUpdate = useRef(0)

  useEffect(() => {
    if (!driverId || !isOnline) return
    if (!navigator.geolocation) { console.error('GPS not supported'); return }

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, heading } = pos.coords
        const now = Date.now()
        if (now - lastUpdate.current < 3000) return // Bolt: every 3s
        lastUpdate.current = now

        await supabase.from('driver_locations').upsert({
          driver_id: driverId,
          lat: latitude,
          lng: longitude,
          heading: heading ?? 0,
          is_online: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'driver_id' })
      },
      (err) => console.error('Driver GPS error:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      if (driverId) supabase.from('driver_locations').update({ is_online: false }).eq('driver_id', driverId)
    }
  }, [driverId, isOnline])
}