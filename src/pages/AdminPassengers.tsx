import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// BUNDLE MODEL: No change needed here.
// Passengers approval has no commission, no fare, no payout logic. Already compatible.

type Passenger = { id: string, full_name: string | null, email: string | null, phone: string | null, is_banned?: boolean | null, verification_status?: string | null, is_verified?: boolean | null, created_at?: string, ride_count?: number, selfie_url?: string | null, id_document_url?: string | null, id_number?: string | null, verification_rejection_reason?: string | null }

function norm(s?: string | null) { return (s || '').toLowerCase().trim() }
function isPendingStatus(s?: string | null) {
  const n = norm(s)
  return n === 'pending' || n === 'pending_verification'
}
function isVerifiedPassenger(p: Passenger) {
  return p.is_verified === true || norm(p.verification_status) === 'verified' || norm(p.verification_status) === 'approved'
}
function toWhatsAppNumber(phone: string | null) {
  if (!phone) return ''
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '27' + digits.slice(1)
  if (digits.startsWith('27') && digits.length === 11) return digits
  if (digits.length === 9) return '27' + digits
  return digits
}
// FIXED: Convert "bucket:path" -> public URL, keep https as-is
function resolveDocUrl(raw?: string | null): string {
  if (!raw) return ''
  if (raw.startsWith('http')) return raw
  if (raw.includes(':')) {
    const [bucket, ...rest] = raw.split(':')
    const path = rest.join(':').replace(/^\//, '')
    if (bucket && path) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      return data?.publicUrl || raw
    }
  }
  return raw
}
function hasAllDocs(p: Passenger) {
  return !!(p.selfie_url && p.id_document_url && p.id_number?.trim())
}
function missingDocs(p: Passenger) {
  const m: string[] = []
  if (!p.selfie_url) m.push('Selfie')
  if (!p.id_number?.trim()) m.push('ID Number')
  if (!p.id_document_url) m.push('ID Document')
  return m
}

export function AdminPassengers({ onBack }: { onBack: () => void }) {
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'verified' | 'pending' | 'banned'>('all')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('profiles').select('id,full_name,email,phone,phone_number,is_banned,verification_status,is_verified,created_at,selfie_url,id_document_url,id_number,verification_rejection_reason').eq('role','passenger').order('created_at',{ascending:false})
    if (loadError) { setError(loadError.message); setLoading(false); return }
    const ids = (data || []).map(p => p.id)
    let counts: Record<string, number> = {}
    if (ids.length) {
      const { data: rides } = await supabase.from('rides').select('passenger_id').in('passenger_id', ids)
      rides?.forEach(r => { if (r.passenger_id) counts[r.passenger_id] = (counts[r.passenger_id] || 0) + 1 })
    }
    // FIXED: phone fallback phone_number, resolve doc URLs
    setPassengers((data || []).map((p: any) => ({ ...p, phone: p.phone || p.phone_number || null, ride_count: counts[p.id] || 0 })) as Passenger[])
    setLoading(false)
  }
  useEffect(()=>{ void load() },[])

  async function approvePassenger(passenger: Passenger) {
    if (!hasAllDocs(passenger)) {
      setError(`Cannot approve ${passenger.full_name || passenger.email} - Missing: ${missingDocs(passenger).join(', ')}. Ask them to re-upload.`)
      return
    }
    if (!confirm(`Approve ${passenger.full_name || passenger.email}?\n\nSelfie: ✅\nID Number: ${passenger.id_number}\nID Doc: ✅\n\nThey can request rides.`)) return
    setBusyId(passenger.id); setError('')
    const { error: e } = await supabase.from('profiles').update({ verification_status: 'verified', is_verified: true, verification_rejection_reason: null } as any).eq('id', passenger.id)
    if (e) setError('Approve failed: ' + e.message)
    else await load()
    setBusyId(null)
  }

  async function rejectPassenger(passenger: Passenger) {
    const reason = prompt(`Reject ${passenger.full_name || passenger.email}?\nEnter reason (shown to passenger):`, 'ID photo not clear - please re-upload')
    if (reason === null) return
    setBusyId(passenger.id); setError('')
    const { error: e } = await supabase.from('profiles').update({ verification_status: 'rejected', is_verified: false, verification_rejection_reason: reason } as any).eq('id', passenger.id)
    if (e) setError('Reject failed: ' + e.message)
    else await load()
    setBusyId(null)
  }

  async function toggleBan(passenger: Passenger) {
    if (!confirm(passenger.is_banned ? `Unban ${passenger.full_name || passenger.email}?` : `Ban ${passenger.full_name || passenger.email}? They will not be able to request rides.`)) return
    setBusyId(passenger.id); setError('')
    const { error: updateError } = await supabase.from('profiles').update({ is_banned: !passenger.is_banned } as any).eq('id',passenger.id)
    if (updateError) setError('Could not update passenger ban status: ' + updateError.message)
    else await load()
    setBusyId(null)
  }

  const filtered = passengers.filter(p => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [p.full_name, p.email, p.phone, p.id_number].some(v => v?.toLowerCase().includes(q))
    if (!matchesSearch) return false
    if (filter === 'verified') return isVerifiedPassenger(p)
    if (filter === 'pending') return isPendingStatus(p.verification_status)
    if (filter === 'banned') return !!p.is_banned
    return true
  })

  const verifiedCount = passengers.filter(p => isVerifiedPassenger(p)).length
  const pendingCount = passengers.filter(p => isPendingStatus(p.verification_status)).length
  const bannedCount = passengers.filter(p => p.is_banned).length

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Passengers ({passengers.length})</h1>
    {error && <p role="alert" style={{color:'#fca5a5', background:'#7f1d1d', padding:10, borderRadius:8}}>{error}</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, margin: '12px 0' }}>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Total</div><strong style={{ fontSize: 20 }}>{passengers.length}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Verified</div><strong style={{ fontSize: 20, color: '#22c55e' }}>{verifiedCount}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Pending</div><strong style={{ fontSize: 20, color: '#f59e0b' }}>{pendingCount}</strong></div>
      <div style={{ background: '#1e293b', padding: 12, borderRadius: 10 }}><div style={{ fontSize: 11, color: '#94a3b8' }}>Banned</div><strong style={{ fontSize: 20, color: '#ef4444' }}>{bannedCount}</strong></div>
    </div>
    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone, ID number..." style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, background: '#1e293b', color: 'white', border: '1px solid #334155', marginBottom: 10 }} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {(['all','verified','pending','banned'] as const).map(f => (
        <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: filter === f ? 'white' : '#334155', color: filter === f ? 'black' : 'white', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer' }}>{f}</button>
      ))}
      <button onClick={() => load()} style={{ padding: '6px 14px', borderRadius: 20, border: 0, background: '#0ea5e9', color: 'white', fontWeight: 700 }}>↻ Refresh</button>
    </div>
    {loading && <p>Loading passengers...</p>}
    {filtered.map(passenger=>{
      const wa = toWhatsAppNumber(passenger.phone)
      const expanded = expandedId === passenger.id
      const selfie = resolveDocUrl(passenger.selfie_url)
      const idPhoto = resolveDocUrl(passenger.id_document_url)
      const docsOk = hasAllDocs(passenger)
      return <section key={passenger.id} style={{background: passenger.is_banned ? '#7f1d1d' : '#1e293b', padding:'12px', borderRadius:'10px', marginTop:'10px', border: !docsOk && isPendingStatus(passenger.verification_status) ? '2px solid #ef4444' : 'none'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10}}>
        <div>
          <strong>{passenger.full_name || 'Unnamed passenger'}</strong>
          <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: passenger.is_banned ? '#991b1b' : isVerifiedPassenger(passenger) ? '#14532d' : '#78350f', color: isVerifiedPassenger(passenger) ? '#86efac' : '#fcd34d' }}>{passenger.is_banned ? 'BANNED' : isVerifiedPassenger(passenger) ? 'VERIFIED ✓' : (passenger.verification_status || 'pending').replace(/_/g,' ').toUpperCase()}</span>
          <div style={{ fontSize: 13, color: '#cbd5e1' }}>{passenger.email}</div><div style={{ fontSize: 13, color: '#cbd5e1' }}>{passenger.phone || 'No phone'}</div>
          <div style={{ fontSize: 13, color: passenger.id_number ? '#86efac' : '#fca5a5' }}>ID Number: {passenger.id_number || '❌ MISSING'}</div>
          <div style={{ fontSize: 12, color: docsOk ? '#86efac' : '#fca5a5' }}>Docs: {docsOk ? '✅ Selfie + ID Number + ID Doc' : `❌ Missing: ${missingDocs(passenger).join(', ')}`}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{passenger.ride_count} rides • Joined {passenger.created_at ? new Date(passenger.created_at).toLocaleDateString() : '—'}</div>
          {passenger.verification_rejection_reason && <div style={{fontSize:12, color:'#fca5a5'}}>Rejection: {passenger.verification_rejection_reason}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
          <button onClick={() => setExpandedId(expanded ? null : passenger.id)} style={{ padding:'8px 12px', background:'#334155', color:'white', border:0, borderRadius:'6px', fontWeight:700, cursor:'pointer' }}>{expanded ? 'Hide ID' : 'View Selfie / ID'}</button>
          {isPendingStatus(passenger.verification_status) && <>
            <button disabled={busyId===passenger.id || !docsOk} title={!docsOk ? `Missing: ${missingDocs(passenger).join(', ')}` : 'Approve'} onClick={()=>void approvePassenger(passenger)} style={{padding:'8px 12px', background: docsOk ? '#22c55e' : '#555', color: docsOk ? 'black' : 'white', border:0, borderRadius:'6px', fontWeight:800, cursor: docsOk ? 'pointer' : 'not-allowed'}}>{busyId===passenger.id ? '...' : docsOk ? '✅ Approve' : '❌ Missing Docs'}</button>
            <button disabled={busyId===passenger.id} onClick={()=>void rejectPassenger(passenger)} style={{padding:'8px 12px', background:'#ef4444', color:'white', border:0, borderRadius:'6px', fontWeight:700, cursor:'pointer'}}>{busyId===passenger.id ? '...' : '❌ Reject'}</button>
          </>}
          {isVerifiedPassenger(passenger) && <button disabled={busyId===passenger.id} onClick={()=>void rejectPassenger(passenger)} style={{padding:'8px 12px', background:'#f59e0b', color:'black', border:0, borderRadius:'6px', fontWeight:700, cursor:'pointer'}}>Revoke</button>}
          <button onClick={() => window.open(`https://wa.me/${wa}`, '_blank')} disabled={!wa} style={{ padding:'8px 12px', background:'#22c55e', color:'black', border:0, borderRadius:'6px', fontWeight:700, cursor:'pointer' }}>WhatsApp</button>
          <button disabled={busyId===passenger.id} onClick={()=>void toggleBan(passenger)} style={{padding:'8px 12px', background:passenger.is_banned?'#15803d':'#b91c1c', color:'white', border:0, borderRadius:'6px', cursor:'pointer'}}>{busyId===passenger.id ? '...' : passenger.is_banned?'Unban':'Ban'}</button>
        </div>
      </div>
      {expanded && <div style={{display:'flex', gap:12, marginTop:12, flexWrap:'wrap'}}>
        <div><div style={{fontSize:12, color:'#94a3b8', marginBottom:4}}>Selfie {passenger.selfie_url ? '✅' : '❌'}</div>{selfie ? <img src={selfie} alt="Selfie" style={{width:140, height:140, objectFit:'cover', borderRadius:8}} onError={(e)=>{(e.target as HTMLImageElement).style.display='none'}} /> : <div style={{fontSize:12, color:'#fca5a5'}}>No selfie uploaded</div>}</div>
        <div><div style={{fontSize:12, color:'#94a3b8', marginBottom:4}}>SA ID Document {passenger.id_document_url ? '✅' : '❌'}</div>{idPhoto ? <img src={idPhoto} alt="ID" style={{width:220, height:140, objectFit:'cover', borderRadius:8}} onError={(e)=>{(e.target as HTMLImageElement).style.display='none'}} /> : <div style={{fontSize:12, color:'#fca5a5'}}>No ID document uploaded</div>}<div style={{fontSize:11, color:'#64748b', marginTop:4, maxWidth:220, wordBreak:'break-all'}}>{passenger.id_document_url?.startsWith('http') ? '' : passenger.id_document_url}</div></div>
        <div style={{fontSize:12, color:'#cbd5e1'}}><div>ID Number: <strong>{passenger.id_number || 'MISSING'}</strong></div><div style={{marginTop:6}}>Check: Does ID number match photo?<br/>Does selfie face match ID photo face?</div><a href={idPhoto} target="_blank" rel="noreferrer" style={{color:'#38bdf8'}}>Open ID full size ↗</a></div>
      </div>}
    </section>})}
    {!loading && filtered.length===0 && <p>No passengers found.</p>}
  </main>
}