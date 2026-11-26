import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export type VehicleInfo = {
  service_zones: string[] | null
  ride_type: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: number | null
  vehicle_color: string | null
  vehicle_registration: string | null
  vehicle_seats: number | null
}

const REQUIRED_FIELDS: (keyof VehicleInfo)[] = [
  'service_zones',
  'ride_type',
  'vehicle_make',
  'vehicle_model',
  'vehicle_color',
  'vehicle_registration',
]

const FIELD_LABELS: Record<string, string> = {
  service_zones: 'Service Area',
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
      const [{ data: prof, error: pErr }, { data: veh }] = await Promise.all([
        supabase.from('profiles').select('service_zones,ride_type,vehicle_make,vehicle_model,vehicle_year,vehicle_color,vehicle_colour,vehicle_registration,vehicle_seats').eq('id', driverId).single(),
        supabase.from('driver_vehicles').select('*').eq('driver_id', driverId).maybeSingle()
      ])
      if (reqId !== reqIdRef.current) return
      if (pErr) throw pErr

      const p: any = prof || {}
      const v: any = veh || {}

      const zonesArray: string[] = Array.isArray(v.service_zones) && v.service_zones.length ? v.service_zones
        : Array.isArray(p.service_zones) && p.service_zones.length ? p.service_zones : []

      // FIX STEP 1: Check ALL naming variants for make/model/color
      const makeModelRaw = v.make_model || v.vehicle_make_model || p.vehicle_make_model || ''
      const [makeFromModel, ...modelRest] = String(makeModelRaw).split(' ').filter(Boolean)
      const merged: VehicleInfo = {
        service_zones: zonesArray.length ? zonesArray : null,
        ride_type: v.ride_type || p.ride_type || null,
        vehicle_make: p.vehicle_make || v.vehicle_make || makeFromModel || null,
        vehicle_model: p.vehicle_model || v.vehicle_model || modelRest.join(' ') || null,
        vehicle_year: p.vehicle_year || v.vehicle_year || v.year || null,
        // FIX: Added v.vehicle_color + v.vehicle_colour + v.color
        vehicle_color: p.vehicle_color || p.vehicle_colour || v.vehicle_color || v.vehicle_colour || v.colour || v.color || null,
        vehicle_registration: p.vehicle_registration || v.registration || v.vehicle_registration || null,
        vehicle_seats: p.vehicle_seats || v.vehicle_seats || v.seats || null,
      }

      setVehicle(merged)
      const miss = REQUIRED_FIELDS.filter(f => {
        const val = (merged as any)[f]
        if (f === 'service_zones') return !val || !Array.isArray(val) || val.length === 0
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

  useEffect(() => {
    if (!driverId) return
    const ch = supabase.channel(`vehicle-${driverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${driverId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_vehicles', filter: `driver_id=eq.${driverId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [driverId, load])

  return {
    vehicle,
    missingFields: missing,
    missingLabels,
    loading,
    error,
    vehicleOk: vehicle != null && missing.length === 0,
    reload: load,
    reloadVehicle: load,
  }
}
export default useVehicleCheck