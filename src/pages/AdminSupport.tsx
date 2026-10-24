import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SosReport = { id: string, created_at?: string, status?: string, message?: string, description?: string, user_id?: string, ride_id?: string }

export function AdminSupport({ onBack }: { onBack: () => void }) {
  const [reports, setReports] = useState<SosReport[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error: loadError } = await supabase.from('sos_reports').select('*').order('created_at',{ascending:false}).limit(200)
      if (loadError) setError('Could not load SOS reports: ' + loadError.message)
      else setReports((data || []) as SosReport[])
    }
    void load()
  }, [])

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>SOS Support Reports</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    {reports.map(report=><article key={report.id} style={{background:'#1e293b', borderLeft:'4px solid #ef4444', padding:'12px', borderRadius:'8px', marginTop:'10px'}}>
      <strong>SOS {report.id}</strong>
      <div>Status: {report.status || 'Unspecified'} · User: {report.user_id || 'Unknown'} · Ride: {report.ride_id || 'N/A'}</div>
      <p>{report.message || report.description || 'No report details supplied.'}</p>
      {report.created_at && <small>{new Date(report.created_at).toLocaleString()}</small>}
    </article>)}
    {!error && reports.length===0 && <p>No SOS reports found.</p>}
  </main>
}
