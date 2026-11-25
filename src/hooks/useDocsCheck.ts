import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useDocsCheck(driverId: string) {
  const [docsOk, setDocsOk] = useState(false)
  const [verified, setVerified] = useState(false)
  useEffect(() => {
    supabase.from('profiles').select('is_verified,verification_status').eq('id', driverId).single()
      .then(({ data }) => { if (data) setVerified(data.is_verified && ['approved','verified'].includes(String(data.verification_status).toLowerCase())) })
    supabase.from('driver_documents').select('status').eq('driver_id', driverId)
      .then(({ data }) => setDocsOk((data||[]).filter((d:any)=>String(d.status).toUpperCase()==='APPROVED').length >= 4))
  }, [driverId])
  return { docsOk, verified }
}