import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SosReport = { id: string, created_at?: string, status?: string, message?: string, description?: string, user_id?: string, ride_id?: string, user_name?: string, user_phone?: string, user_role?: string, type?: string }

// FIX: SA 082... -> 2782..., +27... -> 27... - same fix as AdminPassengers
function toWhatsAppNumber(phone: string | null | undefined) {
  if (!phone) return ''
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (digits.startsWith('27') && digits.length === 11) return digits
  if (digits.length === 9) return '27' + digits
  return digits
}

export function AdminSupport({ onBack }: { onBack: () => void }) {
  const [reports, setReports] = useState<SosReport[]>([])
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // FIX: silent=true for realtime - don't flash "Loading..." when new SOS arrives while admin is reading
  async function load(silent = false) {
    if (!silent) setLoading(true)
    const { data, error: loadError } = await supabase.from('sos_reports').select('*').order('created_at',{ascending:false}).limit(200)
    if (loadError) { setError('Could not load SOS reports: ' + loadError.message); setLoading(false); return }
    const rows = (data || []) as SosReport[]
    const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[]
    let enriched = rows
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,full_name,phone,role').in('id', ids)
      const map = Object.fromEntries((profiles || []).map(p => [p.id, p]))
      // FIX: Don't mutate Supabase rows in place - map to new objects
      enriched = rows.map(r => {
        const p: any = r.user_id ? map[r.user_id] : null
        return p ? { ...r, user_name: p.full_name, user_phone: p.phone, user_role: p.role } : r
      })
    }
    setReports(enriched)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    const ch = supabase.channel('admin-sos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_reports' }, () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function resolve(report: SosReport) {
    if (!confirm(`Mark SOS ${report.id.slice(0,8)} as resolved?`)) return
    setBusyId(report.id)
    const { error: updateError } = await supabase.from('sos_reports').update({ status: 'resolved' } as any).eq('id', report.id)
    if (updateError) setError(updateError.message)
    else setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'resolved' } : r))
    setBusyId(null)
  }

  const filtered = reports.filter(r => {
    if (filter === 'open') return (r.status || 'open').toLowerCase() !== 'resolved'
    if (filter === 'resolved') return (r.status || '').toLowerCase() === 'resolved'
    return true
  })
  const openCount = reports.filter(r => (r.status || 'open').toLowerCase() !== 'resolved').length

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>SOS Support Reports</h1>
    {error && <p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
      <div style={{ background: openCount > 0 ? '#7f1d1d' : '#1e293b', padding: '10px 14px', borderRadius: 10, fontWeight: 800 }}>🚨 {openCount} Open SOS</div>
      <div style={{ background: '#1e293b', padding: '10px 14px', borderRadius: 10 }}>Total: {reports.length}</div>
      <button onClick={() => load()} style={{ padding: '8px 14px', borderRadius: 20, background: '#0ea5e9', color: 'white', border: 0, fontWeight: 700 }}>{loading ? '...' : '↻ Refresh'}</button>
    </div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      {(['open','all','resolved'] as const).map(f => (
        <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: filter === f ? 'white' : '#334155', color: filter === f ? 'black' : 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{f}</button>
      ))}
    </div>
    {loading && <p>Loading SOS reports...</p>}
    {openCount > 0 && filter === 'open' && <p style={{ background: '#7f1d1d', padding: 12, borderRadius: 10, fontWeight: 700 }}>⚠️ Action needed: Call the user immediately. If someone is in danger, call SAPS 10111.</p>}
    {filtered.map(report => {
      const resolved = (report.status || '').toLowerCase() === 'resolved'
      const wa = toWhatsAppNumber(report.user_phone)
      return <article key={report.id} style={{ background: resolved ? '#1e293b' : '#450a0a', borderLeft: `4px solid ${resolved ? '#22c55e' : '#ef4444'}`, padding:'12px', borderRadius:'8px', marginTop:'10px'}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>🚨 SOS {report.id.slice(0,8)} {report.type ? `· ${report.type}` : ''}</strong>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: resolved ? '#14532d' : '#991b1b', fontWeight: 800 }}>{(report.status || 'OPEN').toUpperCase()}</span>
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>User: <strong>{report.user_name || report.user_id || 'Unknown'}</strong> {report.user_role ? `(${report.user_role})` : ''} · Ride: {report.ride_id ? report.ride_id.slice(0,8) : 'N/A'}</div>
        <p style={{ margin: '8px 0' }}>{report.message || report.description || 'No report details supplied.'}</p>
        {report.created_at && <small style={{ color: '#cbd5e1' }}>{new Date(report.created_at).toLocaleString()}</small>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {report.user_phone && <a href={`tel:${report.user_phone.replace(/\s/g,'')}`} style={{ padding: '8px 14px', borderRadius: 8, background: '#22c55e', color: 'black', fontWeight: 800, textDecoration: 'none' }}>📞 Call {report.user_name || 'User'}</a>}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 8, background: '#25D366', color: 'black', fontWeight: 800, textDecoration: 'none' }}>WhatsApp</a>}
          {!resolved && <button disabled={busyId === report.id} onClick={() => resolve(report)} style={{ padding: '8px 14px', borderRadius: 8, background: 'white', color: 'black', fontWeight: 800, border: 0, cursor: 'pointer' }}>{busyId === report.id ? '...' : 'Mark Resolved ✓'}</button>}
        </div>
      </article>
    })}
    {!loading && filtered.length===0 && <p>No SOS reports found{filter !== 'all' ? ` in ${filter}` : ''}.</p>}
  </main>
}