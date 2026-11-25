import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabase'

type DriverLocationRow = {
  driver_id: string
  lat: number
  lng: number
  heading?: number | null
  updated_at: string
}

type DriverLiveLocation = {
  coordinates: [number, number]
  bearing: number
  updatedAt: string
  isStale: boolean
}

export function useDriverLiveLocation(driverId: string | null) {
  const [location, setLocation] = useState<DriverLiveLocation | null>(null)
  const [error, setError] = useState('')
  const lastUpdatedRef = useRef(0)

  useEffect(() => {
    if (!driverId) { setLocation(null); setError(''); return }
    let active = true
    let receivedRealtimeUpdate = false

    const applyLocation = (row: DriverLocationRow | null) => {
      if (!active) return
      if (!row || !Number.isFinite(row.lng) || !Number.isFinite(row.lat)) { setLocation(null); return }
      const ts = new Date(row.updated_at).getTime()
      if (Number.isFinite(ts) && ts < lastUpdatedRef.current) return
      if (Number.isFinite(ts)) lastUpdatedRef.current = ts
      if (row.lat === 0 && row.lng === 0) return
      if (row.lat < -90 || row.lat > 90 || row.lng < -180 || row.lng > 180) return
      setLocation({
        coordinates: [row.lng, row.lat],
        bearing: Number.isFinite(row.heading) ? (row.heading ?? 0) : 0,
        updatedAt: row.updated_at,
        isStale: Date.now() - ts > 30000,
      })
    }

    const channel = supabase.channel(`passenger-driver-location-${driverId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'driver_locations',
        filter: `driver_id=eq.${driverId}`,
      }, payload => {
        receivedRealtimeUpdate = true
        if (payload.eventType === 'DELETE') { applyLocation(null); return }
        applyLocation(payload.new as DriverLocationRow)
      })
      .subscribe((status, subscribeError) => {
        if (!active) return
        if (status === 'SUBSCRIBED') setError('')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(`Live driver location connection failed: ${subscribeError?.message || status}`)
        }
      })

    void supabase.from('driver_locations')
      .select('driver_id,lat,lng,heading,updated_at')
      .eq('driver_id', driverId).maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active || receivedRealtimeUpdate) return
        if (queryError) { setError(`Could not load the driver's location: ${queryError.message}`); return }
        applyLocation(data as DriverLocationRow | null)
      })

    const poll = setInterval(async () => {
      if (!active || receivedRealtimeUpdate) return
      const { data } = await supabase.from('driver_locations')
        .select('driver_id,lat,lng,heading,updated_at')
        .eq('driver_id', driverId).maybeSingle()
      if (data) applyLocation(data as DriverLocationRow)
    }, 3000)

    return () => { active = false; clearInterval(poll); void supabase.removeChannel(channel) }
  }, [driverId])

  return { location, error }
}
export default useDriverLiveLocation