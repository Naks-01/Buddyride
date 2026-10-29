import { useEffect, useState } from 'react'
import { supabase } from './supabase'

type DriverLocationRow = {
  driver_id: string
  lat: number
  lng: number
  updated_at: string
}

type DriverLiveLocation = {
  coordinates: [number, number]
  updatedAt: string
}

export function useDriverLiveLocation(driverId: string | null) {
  const [location, setLocation] = useState<DriverLiveLocation | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!driverId) {
      setLocation(null)
      setError('')
      return
    }

    let active = true
    let receivedRealtimeUpdate = false
    const applyLocation = (row: DriverLocationRow | null) => {
      if (!active) return
      if (!row || !Number.isFinite(row.lng) || !Number.isFinite(row.lat)) {
        setLocation(null)
        return
      }
      setLocation({ coordinates: [row.lng, row.lat], updatedAt: row.updated_at })
    }

    const channel = supabase
      .channel(`passenger-driver-location-${driverId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'driver_locations',
        filter: `driver_id=eq.${driverId}`,
      }, payload => {
        receivedRealtimeUpdate = true
        if (payload.eventType === 'DELETE') {
          applyLocation(null)
          return
        }
        applyLocation(payload.new as DriverLocationRow)
      })
      .subscribe((status, subscribeError) => {
        if (!active) return
        if (status === 'SUBSCRIBED') setError('')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(`Live driver location connection failed: ${subscribeError?.message || status}`)
        }
      })

    void supabase
      .from('driver_locations')
      .select('driver_id,lat,lng,updated_at')
      .eq('driver_id', driverId)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active || receivedRealtimeUpdate) return
        if (queryError) {
          setError(`Could not load the driver's location: ${queryError.message}`)
          return
        }
        applyLocation(data as DriverLocationRow | null)
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [driverId])

  return { location, error }
}
