import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// FIX: 15 required docs - was >= 4 APPROVED, so driver with 4/15 docs passed and went online
export const REQUIRED_DRIVER_DOCS = [
  'id_document',
  'drivers_licence',
  'pdp',
  'vehicle_registration',
  'vehicle_licence_disc',
  'roadworthy',
  'insurance',
  'profile_photo',
  'vehicle_photo_front',
  'vehicle_photo_back',
  'vehicle_photo_side',
  'vehicle_photo_interior',
  'criminal_record',
  'proof_of_address',
  'bank_confirmation',
] as const

export function useDocsCheck(driverId: string, requiredCount: number = REQUIRED_DRIVER_DOCS.length) {
  const [docsOk, setDocsOk] = useState(false)
  const [verified, setVerified] = useState(false)
  const [approvedCount, setApprovedCount] = useState(0)
  const [totalDocs, setTotalDocs] = useState(0)
  const [missingDocs, setMissingDocs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    // FIX: Guard empty driverId - was querying id = '' 
    if (!driverId) { setDocsOk(false); setVerified(false); setApprovedCount(0); setTotalDocs(0); setMissingDocs([...REQUIRED_DRIVER_DOCS]); return }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError('')
    try {
      const [profileRes, docsRes] = await Promise.all([
        supabase.from('profiles').select('is_verified,verification_status').eq('id', driverId).single(),
        supabase.from('driver_documents').select('document_type,status').eq('driver_id', driverId),
      ])
      if (reqId !== reqIdRef.current) return
      if (profileRes.error) throw profileRes.error
      if (docsRes.error) throw docsRes.error
      const isVerified = !!profileRes.data?.is_verified && ['approved', 'verified'].includes(String(profileRes.data?.verification_status || '').toLowerCase())
      setVerified(isVerified)
      const docs = (docsRes.data || []) as { document_type: string; status: string }[]
      const approvedTypes = new Set(docs.filter(d => String(d.status).toUpperCase() === 'APPROVED').map(d => String(d.document_type).toLowerCase()))
      // FIX: Count DISTINCT approved types - was counting rows, so 4 uploads of same doc = pass
      const approved = REQUIRED_DRIVER_DOCS.filter(t => approvedTypes.has(t)).length
      const missing = REQUIRED_DRIVER_DOCS.filter(t => !approvedTypes.has(t))
      setApprovedCount(approved)
      setTotalDocs(requiredCount)
      setMissingDocs(missing)
      // FIX: docsOk = ALL required approved, not >= 4
      setDocsOk(approved >= requiredCount)
    } catch (e: any) {
      if (reqId !== reqIdRef.current) return
      setError(e?.message || 'Could not check documents')
      setDocsOk(false)
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [driverId, requiredCount])

  useEffect(() => { void load() }, [load])

  // FIX: Realtime - docsOk updates when admin approves, was stale until remount
  useEffect(() => {
    if (!driverId) return
    const ch = supabase.channel(`docs-${driverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${driverId}` }, () => { void load() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${driverId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [driverId, load])

  return { docsOk, verified, approvedCount, totalDocs, missingDocs, loading, error, canGoOnline: docsOk && verified, reloadDocs: load }
}
export default useDocsCheck