import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type SosReport = { id: string, created_at?: string, status?: string, message?: string, description?: string, user_id?: string, ride_id?: string, user_name?: string, user_phone?: string, user_role?: string, type?: string, resolved_at?: string | null, admin_note?: string | null, acknowledged_at?: string | null }

function toWhatsAppNumber(phone: string | null | undefined) {
  if (!phone) return ''
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (digits.startsWith('27') && digits.length === 11) return digits
  if (digits.length === 9) return '27' + digits
  return digits
}

function isResolvedStatus(s: string | null | undefined) {
  const v = String(s || '').toLowerCase().trim()
  return v === 'resolved' || v === 'closed'
}

export function AdminSupport({ onBack }: { onBack: () => void }) {
  const [reports, setReports] = useState<SosReport[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      const { data, error: loadError } = await supabase.from('sos_reports').select('*').order('created_at', { ascending: false }).limit(200)
      if (loadError) throw loadError
      const rows = (data || []) as SosReport[]
      const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[]
      let enriched = rows
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id,full_name,phone,phone_number,role').in('id', ids)
        const map = Object.fromEntries((profiles || []).map((p: any) => [p.id, { ...p, phone: p.phone ?? p.phone_number }]))
        enriched = rows.map(r => {
          const p: any = r.user_id ? map[r.user_id] : null
          return p ? { ...r, user_name: p.full_name, user_phone: p.phone, user_role: p.role } : r
        })
      }
      setReports(enriched)
      setError('')
    } catch (e: any) { setError('Could not load SOS reports: ' + (e?.message || String(e))) } finally { setLoading(false) }
  }

  useEffect(() => {
    void load()
    const ch = supabase.channel('admin-sos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_reports' }, () => { void load(true) })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [])

  // FIX: Try with resolved_at, fallback to status-only if column doesn't exist
  async function updateStatus(report: SosReport, status: string, note?: string) {
    setBusyId(report.id)
    setError('')
    setMsg('')
    try {
      const base: Record<string, any> = { status }
      if (status === 'resolved') base.resolved_at = new Date().toISOString()
      if (status === 'acknowledged') base.acknowledged_at = new Date().toISOString()
      if (note) base.admin_note = note
      if (status === 'open') {
        base.resolved_at = null
        base.acknowledged_at = null
      }
      let { error: updateError } = await supabase.from('sos_reports').update(base as any).eq('id', report.id)
      if (updateError && /resolved_at|acknowledged_at|admin_note|column/i.test(updateError.message)) {
        // Fallback: status only
        const fallback: Record<string, any> = { status }
        const retry = await supabase.from('sos_reports').update(fallback as any).eq('id', report.id)
        updateError = retry.error
      }
      if (updateError) throw updateError
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status, resolved_at: status === 'resolved' ? new Date().toISOString() : r.resolved_at, admin_note: note ?? r.admin_note } : r))
      setMsg(`✅ SOS ${report.id.slice(0, 8)} → ${status}`)
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusyId(null) }
  }

  async function resolve(report: SosReport) {
    if (!confirm(`Mark SOS ${report.id.slice(0, 8)} as resolved?`)) return
    const note = prompt('Admin note (optional - what did you do?):', 'Called user, confirmed safe')
    await updateStatus(report, 'resolved', note ?? undefined)
  }

  async function acknowledge(report: SosReport) {
    await updateStatus(report, 'acknowledged', 'Admin acknowledged - calling user')
  }

  async function reopen(report: SosReport) {
    if (!confirm(`Reopen SOS ${report.id.slice(0, 8)}?`)) return
    await updateStatus(report, 'open')
  }

  const filtered = reports.filter(r => {
    if (filter === 'open') return !isResolvedStatus(r.status)
    if (filter === 'resolved') return isResolvedStatus(r.status)
    return true
  })
  const openCount = reports.filter(r => !isResolvedStatus(r.status)).length

  return (
    <main style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '16px' }}>
      <button onClick={onBack} style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>← Admin home</button>
      <h1>SOS Support Reports</h1>
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      {msg && <p style={{ color: '#86efac', background: '#14532d', padding: 10, borderRadius: 8 }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        <div style={{ background: openCount > 0 ? '#7f1d1d' : '#1e293b', padding: '10px 14px', borderRadius: 10, fontWeight: 800 }}>🚨 {openCount} Open SOS</div>
        <div style={{ background: '#1e293b', padding: '10px 14px', borderRadius: 10 }}>Total: {reports.length}</div>
        <button onClick={() => load()} style={{ padding: '8px 14px', borderRadius: 20, background: '#0ea5e9', color: 'white', border: 0, fontWeight: 700 }}>{loading ? '...' : '↻ Refresh'}</button>
        <a href="tel:10111" style={{ padding: '8px 14px', borderRadius: 20, background: '#ef4444', color: 'white', fontWeight: 800, textDecoration: 'none' }}>🚓 Call SAPS 10111</a>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['open', 'all', 'resolved'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: filter === f ? 'white' : '#334155', color: filter === f ? 'black' : 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{f}</button>
        ))}
      </div>
      {loading && <p>Loading SOS reports...</p>}
      {openCount > 0 && filter === 'open' && <p style={{ background: '#7f1d1d', padding: 12, borderRadius: 10, fontWeight: 700 }}>⚠️ Action needed: Call the user immediately. If someone is in danger, call SAPS 10111.</p>}
      {filtered.map(report => {
        const resolved = isResolvedStatus(report.status)
        const acknowledged = String(report.status || '').toLowerCase() === 'acknowledged'
        const wa = toWhatsAppNumber(report.user_phone)
        const tel = wa ? `+${wa}` : (report.user_phone ?? '')
        return (
          <article key={report.id} style={{ background: resolved ? '#1e293b' : acknowledged ? '#1e293b' : '#450a0a', borderLeft: `4px solid ${resolved ? '#22c55e' : acknowledged ? '#f59e0b' : '#ef4444'}`, padding: '12px', borderRadius: '8px', marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>🚨 SOS {report.id.slice(0, 8)} {report.type ? `· ${report.type}` : ''}</strong>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: resolved ? '#14532d' : acknowledged ? '#78350f' : '#991b1b', fontWeight: 800 }}>{(report.status ?? 'OPEN').toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>User: <strong>{report.user_name ?? report.user_id ?? 'Unknown'}</strong> {report.user_role ? `(${report.user_role})` : ''} · Ride: {report.ride_id ? report.ride_id.slice(0, 8) : 'N/A'} · Phone: {report.user_phone ?? 'No phone'}</div>
            <p style={{ margin: '8px 0' }}>{report.message ?? report.description ?? 'No report details supplied.'}</p>
            {report.admin_note && <p style={{ fontSize: 12, color: '#86efac' }}>Admin note: {report.admin_note}</p>}
            {report.created_at && <small style={{ color: '#cbd5e1' }}>{new Date(report.created_at).toLocaleString()}{report.resolved_at ? ` • Resolved: ${new Date(report.resolved_at).toLocaleString()}` : ''}</small>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {tel && <a href={`tel:${tel}`} style={{ padding: '8px 14px', borderRadius: 8, background: '#22c55e', color: 'black', fontWeight: 800, textDecoration: 'none' }}>📞 Call {report.user_name ?? 'User'}</a>}
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ padding: '8px 14px', borderRadius: 8, background: '#25D366', color: 'black', fontWeight: 800, textDecoration: 'none' }}>WhatsApp</a>}
              {!resolved && !acknowledged && <button disabled={busyId === report.id} onClick={() => void acknowledge(report)} style={{ padding: '8px 14px', borderRadius: 8, background: '#f59e0b', color: 'black', fontWeight: 800, border: 0, cursor: 'pointer' }}>{busyId === report.id ? '...' : '👀 Acknowledge'}</button>}
              {!resolved && <button disabled={busyId === report.id} onClick={() => void resolve(report)} style={{ padding: '8px 14px', borderRadius: 8, background: 'white', color: 'black', fontWeight: 800, border: 0, cursor: 'pointer' }}>{busyId === report.id ? '...' : 'Mark Resolved ✓'}</button>}
              {resolved && <button disabled={busyId === report.id} onClick={() => void reopen(report)} style={{ padding: '8px 14px', borderRadius: 8, background: '#334155', color: 'white', fontWeight: 800, border: 0, cursor: 'pointer' }}>{busyId === report.id ? '...' : '↩ Reopen'}</button>}
            </div>
          </article>
        )
      })}
      {!loading && filtered.length === 0 && <p>No SOS reports found{filter !== 'all' ? ` in ${filter}` : ''}.</p>}
    </main>
  )
}