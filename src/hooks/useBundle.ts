import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useBundle(driverId: string) {
  const [credits, setCredits] = useState<number | null>(null)
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    const { data } = await supabase.from('driver_bundles')
      .select('trips_remaining,expires_at').eq('driver_id', driverId)
      .eq('status','active').gt('trips_remaining',0)
    const valid = (data || []).filter((b: any) => !b.expires_at || new Date(b.expires_at) > new Date())
    const total = valid.reduce((s: number, b: any) => s + Number(b.trips_remaining||0), 0)
    setCredits(total); setCount(valid.length); return total
  }, [driverId])

  useEffect(() => { void load() }, [load])
  return { bundleCredits: credits, bundleCount: count, reloadBundle: load }
}