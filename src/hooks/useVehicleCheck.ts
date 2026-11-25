import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useVehicleCheck(driverId: string) {
  const [vehicle, setVehicle] = useState<any>({})
  const [missing, setMissing] = useState<string[]>([])
  useEffect(() => {
    supabase.from('profiles').select('service_area,ride_type,vehicle_make,vehicle_registration')
      .eq('id', driverId).single().then(({ data }) => {
        if (!data) return
        setVehicle(data)
        setMissing(Object.entries(data).filter(([,v]) => !String(v||'').trim()).map(([k])=>k))
      })
  }, [driverId])
  return { vehicle, missingFields: missing, vehicleOk: missing.length === 0 }
}