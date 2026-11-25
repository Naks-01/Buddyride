import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export type VehicleInfo = {
  service_area: string | null
  ride_type: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: number | null
  vehicle_color: string | null
  vehicle_registration: string | null
  vehicle_seats: number | null
}

const REQUIRED_FIELDS: (keyof VehicleInfo)[] = [
  'service_area',
  'ride_type',
  'vehicle_make',
  'vehicle_model',
  'vehicle_color',
  'vehicle_registration',
]

const FIELD_LABELS: Record<string, string> = {
  service_area: 'Service Area',
  ride_type: 'Ride Type',
  vehicle_make: 'Vehicle Make',
  vehicle_model: 'Vehicle Model',
  vehicle_color: 'Vehicle Colour',
  vehicle_registration: 'Registration Plate',
  vehicle_year: 'Vehicle Year',
  vehicle_seats: 'Seats',
}

export function useVehicleCheck(driverId: string) {
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [missingLabels, setMissingLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    // FIX: Empty driverId => NOT ok - was vehicleOk = true because missing = [] on mount
    if (!driverId) {
      setVehicle(null)
      setMissing([...REQUIRED_FIELDS])
      setMissingLabels(REQUIRED_FIELDS.map(f => FIELD_LABELS[f] || f))
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError('')
    try {
      const { data, error: qError } = await supabase.from('profiles')
        .select('service_area,ride_type,vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_registration,vehicle_seats')
        .eq('id', driverId).single()
      if (reqId !== reqIdRef.current) return
      if (qError) throw qError
      if (!data) { setVehicle(null); setMissing([...REQUIRED_FIELDS]); setMissingLabels(REQUIRED_FIELDS.map(f => FIELD_LABELS[f] || f)); return }
      const v = data as VehicleInfo
      setVehicle(v)
      const miss = REQUIRED_FIELDS.filter(f => {
        const val = (v as any)[f]
        return val == null || String(val).trim() === ''
      })
      setMissing(miss)
      setMissingLabels(miss.map(f => FIELD_LABELS[f] || f))
    } catch (e: any) {
      if (reqId !== reqIdRef.current) return
      setError(e?.message || 'Could not check vehicle')
      setVehicle(null)
      setMissing([...REQUIRED_FIELDS])
      setMissingLabels(REQUIRED_FIELDS.map(f => FIELD_LABELS[f] || f))
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [driverId])

  useEffect(() => { void load() }, [load])

  // FIX: Realtime - vehicleOk updates when driver completes profile, was stale until remount
  useEffect(() => {
    if (!driverId) return
    const ch = supabase.channel(`vehicle-${driverId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${driverId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [driverId, load])

  return {
    vehicle,
    missingFields: missing,
    missingLabels,
    loading,
    error,
    // FIX: vehicleOk = vehicle loaded AND nothing missing - was true on mount / empty driver
    vehicleOk: vehicle != null && missing.length === 0,
    reloadVehicle: load,
  }
}
export default useVehicleCheck