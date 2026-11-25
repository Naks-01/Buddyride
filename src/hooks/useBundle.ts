import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export type DriverBundle = {
  id: string
  trips_remaining: number
  expires_at: string | null
  status: string | null
  bundle_type?: string | null
  created_at?: string | null
}

export function useBundle(driverId: string) {
  const [credits, setCredits] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const [bundles, setBundles] = useState<DriverBundle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    // FIX: Guard empty driverId - was querying driver_id = '' and returning other drivers' bundles if RLS broken
    if (!driverId) { setCredits(0); setCount(0); setBundles([]); return 0 }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError('')
    try {
      const { data, error: qError } = await supabase.from('driver_bundles')
        .select('id,trips_remaining,expires_at,status,bundle_type,created_at')
        .eq('driver_id', driverId)
        .eq('status', 'active')
        .gt('trips_remaining', 0)
        .order('expires_at', { ascending: true })
      // FIX: Race guard - slow request must not overwrite newer one
      if (reqId !== reqIdRef.current) return 0
      if (qError) throw qError
      const now = new Date()
      const valid = ((data || []) as DriverBundle[]).filter((b) => !b.expires_at || new Date(b.expires_at) > now)
      const total = valid.reduce((s, b) => s + Number(b.trips_remaining || 0), 0)
      setCredits(total)
      setCount(valid.length)
      setBundles(valid)
      return total
    } catch (e: any) {
      if (reqId !== reqIdRef.current) return 0
      setError(e?.message || 'Could not load bundle')
      setCredits(0)
      setCount(0)
      setBundles([])
      return 0
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [driverId])

  useEffect(() => { void load() }, [load])

  // FIX: Realtime - bundle credits now update when admin approves / trip consumes, was stale until remount
  useEffect(() => {
    if (!driverId) return
    const ch = supabase.channel(`bundle-${driverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_bundles', filter: `driver_id=eq.${driverId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [driverId, load])

  // FIX: Expiry helper - UI can warn "Expires in 2 days"
  const soonestExpiry = bundles.length > 0 ? bundles[0].expires_at : null
  const expiresSoon = soonestExpiry ? (new Date(soonestExpiry).getTime() - Date.now()) < 3 * 24 * 60 * 60 * 1000 : false
  const hasCredits = (credits ?? 0) > 0

  return { bundleCredits: credits, bundleCount: count, bundles, loading, error, hasCredits, soonestExpiry, expiresSoon, reloadBundle: load }
}
export default useBundle