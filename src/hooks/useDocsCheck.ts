import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { REQUIRED_DOCS, normalizeDocType } from '../lib/driverDocuments'

// YOUR REAL 15 - from Supabase video - NO insurance, NO bank, NO proof_of_address
// This is the SINGLE SOURCE OF TRUTH, same as DriverHome.tsx

function isApprovedStatus(status: string) {
  const s = String(status || '').toUpperCase().trim()
  return s === 'VERIFIED' || s === 'APPROVED' || s === 'APPROVED_TO_DRIVE' || s === 'VERIFIED_APPROVED' || s === 'ACCEPTED'
}

export function useDocsCheck(driverId: string, requiredCount?: number) {
  const [docsOk, setDocsOk] = useState(false)
  const [verified, setVerified] = useState(false)
  const [approvedCount, setApprovedCount] = useState(0)
  const [totalDocs, setTotalDocs] = useState(REQUIRED_DOCS.length)
  const [missingDocs, setMissingDocs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const reqIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!driverId) {
      setDocsOk(false); setVerified(false); setApprovedCount(0)
      setTotalDocs(REQUIRED_DOCS.length)
      setMissingDocs(REQUIRED_DOCS.map(d => d.type))
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError('')
    try {
      const { data, error: docsErr } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('driver_id', driverId)
      if (reqId !== reqIdRef.current) return
      if (docsErr) throw docsErr

      const docs = (data || []) as any[]

      // Map: normalized doc_type -> doc (keep latest by updated_at)
      const map = new Map<string, any>()
      for (const d of docs) {
        const key = normalizeDocType(d.doc_type || d.document_type || d.type || d.name || '')
        if (!key) continue
        const existing = map.get(key)
        if (!existing || new Date(d.updated_at || 0) > new Date(existing.updated_at || 0)) {
          map.set(key, d)
        }
      }

      // Count using SAME list as DriverHome
      const required = REQUIRED_DOCS
      const total = requiredCount ?? required.length

      const approvedSlots = required.filter(slot => {
        const found = map.get(normalizeDocType(slot.type))
        return found && isApprovedStatus(found.status)
      })

      const missing = required
        .filter(slot => {
          const found = map.get(normalizeDocType(slot.type))
          return !found || !isApprovedStatus(found.status)
        })
        .map(s => s.type)

      const approved = approvedSlots.length

      setApprovedCount(approved)
      setTotalDocs(total)
      setMissingDocs(missing)

      // VERIFIED = all REQUIRED_DOCS are APPROVED in driver_documents
      // DO NOT require profiles.is_verified or driver_vehicles.is_approved
      // Admin approves docs only - that's what your Admin UI does
      const allApproved = approved >= total
      setVerified(allApproved)
      setDocsOk(allApproved)
    } catch (e: any) {
      if (reqId !== reqIdRef.current) return
      setError(e?.message || 'Could not check documents')
      setDocsOk(false)
      setVerified(false)
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [driverId, requiredCount])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!driverId) return
    const ch = supabase.channel(`docs-${driverId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${driverId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [driverId, load])

  return { docsOk, verified, approvedCount, totalDocs, missingDocs, loading, error, canGoOnline: docsOk && verified, reloadDocs: load, reload: load }
}
export default useDocsCheck