import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

export const DRIVER_DOCUMENTS = [
  { id: 'profile_photo', label: 'Profile Photo', helper: 'Clear selfie, white background, no cap', accept: '.jpg,.jpeg', required: true, order: 1 },
  { id: 'sa_id', label: 'SA ID / Passport', helper: 'Front and back of ID in one photo', accept: '.jpg,.jpeg,.pdf', required: true, order: 2 },
  { id: 'driver_license', label: "Driver's License", helper: 'Code B license, front and back, must not be expired', accept: '.jpg,.jpeg,.pdf', required: true, order: 3 },
  { id: 'prdp', label: 'PrDP - Professional Driving Permit', helper: 'PrDP card to carry passengers. Must be valid. Without this you cannot go online in Polokwane', accept: '.jpg,.jpeg,.pdf', required: true, order: 4 },
  { id: 'vehicle_registration', label: 'Vehicle Papers (Natis)', helper: 'Registration certificate showing owner and car', accept: '.jpg,.jpeg,.pdf', required: true, order: 5 },
  { id: 'license_disc', label: 'Vehicle License Disc', helper: 'Photo of disc on windscreen, must be valid', accept: '.jpg,.jpeg', required: true, order: 6 },
  { id: 'huru_check', label: 'Police Clearance / Huru Check', helper: 'Huru criminal check report. Less than 3 months old. If you dont have it, we run Huru for R150 from first trip', accept: '.pdf,.jpg,.jpeg', required: false, graceDays: 7, order: 7 },
] as const

type StoredDocument = {
  id: string
  driver_id?: string
  passenger_id?: string
  user_email?: string | null
  email?: string | null
  doc_type: string
  file_url: string
  status: string
  expiry_date?: string | null
  rejection_reason?: string | null
  profiles?: { full_name: string | null, email: string | null } | null
}

const PASSENGER_DOCUMENTS = [
  { id: 'profile_photo', label: 'Profile Photo', aliases: [] as string[], required: true },
  { id: 'sa_id', label: 'SA ID / Passport', aliases: ['id_document'], required: false },
  { id: 'selfie', label: 'Selfie verification', aliases: [] as string[], required: false },
]

function groupByUser(docs: StoredDocument[]) {
  return docs.reduce<Record<string, StoredDocument[]>>((groups, doc) => {
    const key = doc.user_email || doc.email || doc.profiles?.email || doc.driver_id || doc.passenger_id || doc.id
    if (!groups[key]) groups[key] = []
    groups[key].push(doc)
    return groups
  }, {})
}

function isExpired(expiryDate?: string | null) {
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return expiry < today
}

function displayStatus(doc?: StoredDocument) {
  if (!doc) return 'PENDING'
  if (doc.status.toLowerCase() === 'expired' || isExpired(doc.expiry_date)) return 'EXPIRED'
  const status = doc.status.toUpperCase()
  return status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING'
}

export function AdminDocuments({ profile: _profile, onBack }: { profile: Profile, onBack: ()=>void }){
  const [driverDocs,setDriverDocs]=useState<StoredDocument[]>([])
  const [passengerDocs,setPassengerDocs]=useState<StoredDocument[]>([])
  const [tab,setTab]=useState<'driver'|'passenger'>('driver')
  const [loadingId, setLoadingId] = useState<string|null>(null)
  const [rejectModal, setRejectModal] = useState<{id:string, table:'driver_documents'|'passenger_documents'}|null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(()=>{ void load() },[])

  async function load(){
    setError('')
    const {data:d, error: driverError}= await supabase.from('driver_documents').select('*, profiles!driver_documents_driver_id_fkey(full_name,email)').order('created_at',{ascending:false})
    const {data:p, error: passengerError}= await supabase.from('passenger_documents').select('*, profiles!passenger_documents_passenger_id_fkey(full_name,email)').order('created_at',{ascending:false})
    if(driverError || passengerError) {
      setError(driverError?.message || passengerError?.message || 'Could not load documents.')
      return
    }
    setDriverDocs((d || []) as StoredDocument[])
    setPassengerDocs((p || []) as StoredDocument[])
  }

  async function approve(doc:StoredDocument, table:'driver_documents'|'passenger_documents'){
    setLoadingId(doc.id)
    try {
      const { error: docErr } = await supabase.from(table).update({ status:'approved', rejection_reason: null } as any).eq('id',doc.id)
      if (docErr) throw docErr

      const userId = doc.driver_id || doc.passenger_id
      if (userId) {
        const { error: profErr } = await supabase.from('profiles').update({ is_verified: true } as any).eq('id', userId)
        if (profErr) console.warn('Profile verify failed (non-critical):', profErr.message)
      }
      await load()
    } catch (e:any) {
      alert('Approve failed: ' + e.message)
      console.error(e)
    } finally {
      setLoadingId(null)
    }
  }

  async function doReject(){
    if (!rejectModal) return
    if (!reason.trim()) { alert('Enter reason'); return }
    setLoadingId(rejectModal.id)
    try {
      const { error: updateError } = await supabase.from(rejectModal.table).update({ status:'rejected', rejection_reason: reason } as any).eq('id', rejectModal.id)
      if (updateError) throw updateError
      setRejectModal(null)
      setReason('')
      await load()
    } catch (e:any) {
      alert('Reject failed: ' + e.message + '\n\nRun this SQL if column missing:\nALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT;')
      console.error(e)
    } finally {
      setLoadingId(null)
    }
  }

  const driverGroups = groupByUser(driverDocs)
  const passengerGroups = groupByUser(passengerDocs)

  function renderDocumentRow(
    doc: StoredDocument | undefined,
    id: string,
    label: string,
    table: 'driver_documents'|'passenger_documents',
    required: boolean
  ) {
    const status = displayStatus(doc)
    return <div key={id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'10px 0', borderTop:'1px solid #333'}}>
      <div style={{minWidth:0}}>
        <strong>{label}</strong>{!required && <span style={{fontSize:'11px', color:'#9ca3af'}}> (Optional)</span>}
        <div style={{fontSize:'12px', color:status==='APPROVED'?'#00d181':status==='REJECTED'||status==='EXPIRED'?'#ff6b6b':'#ff9500'}}>{status}</div>
        {doc?.rejection_reason && <div style={{fontSize:'12px', color:'#ff6b6b'}}>Reason: {doc.rejection_reason}</div>}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', justifyContent:'flex-end', gap:'6px'}}>
        <button disabled={!doc} onClick={()=>doc && window.open(doc.file_url,'_blank')} style={{background:'#333', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none'}}>View Doc</button>
        <button disabled={!doc || loadingId===doc.id} onClick={()=>doc && approve(doc,table)} style={{background:'#00a86b', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none'}}>Approve</button>
        <button disabled={!doc || loadingId===doc.id} onClick={()=>doc && setRejectModal({id:doc.id,table})} style={{background:'#c62828', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none'}}>Reject</button>
      </div>
    </div>
  }

  return <div style={{ padding:'16px', background:'#0e0e10', minHeight:'100vh', color:'white' }}>
    <button onClick={onBack} style={{ background:'#242428', color:'white', border:'1px solid #333', padding:'8px 12px', borderRadius:'8px' }}>⬅ Back</button>
    <h2>👑 Admin Docs</h2>
    <div style={{ display:'flex', gap:'8px', margin:'12px 0' }}>
      <button onClick={()=> setTab('driver')} style={{ flex:1, padding:'12px', background: tab==='driver'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none' }}>Drivers ({Object.keys(driverGroups).length})</button>
      <button onClick={()=> setTab('passenger')} style={{ flex:1, padding:'12px', background: tab==='passenger'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none' }}>Passengers ({Object.keys(passengerGroups).length})</button>
    </div>
    {error && <p role="alert" style={{color:'#ff6b6b'}}>{error}</p>}

    {tab==='driver' ? (
      <div>
        {Object.entries(driverGroups).map(([email, docs]) => {
          const approvedCount = DRIVER_DOCUMENTS.filter(requirement => {
            const doc = docs.find(item=>item.doc_type===requirement.id)
            return displayStatus(doc)==='APPROVED'
          }).length
          return <section key={email} style={{border:'1px solid #333', padding:'12px', borderRadius:'12px', marginTop:'10px', background:'#18181b'}}>
            <h3 style={{margin:'0 0 4px'}}>{email}</h3>
            <div style={{fontSize:'12px', color:'#9ca3af', marginBottom:'8px'}}>Progress: {approvedCount}/7 approved</div>
            {DRIVER_DOCUMENTS.map(requirement => renderDocumentRow(
              docs.find(item=>item.doc_type===requirement.id),
              requirement.id,
              requirement.label,
              'driver_documents',
              requirement.required
            ))}
          </section>
        })}
        {Object.keys(driverGroups).length===0 && <p style={{color:'#9ca3af'}}>No driver documents uploaded yet.</p>}
      </div>
    ) : (
      <div>
        {Object.entries(passengerGroups).map(([email, docs]) => {
          const baseDocs = PASSENGER_DOCUMENTS.slice(0, 2)
          const uploadedCount = baseDocs.filter(requirement => docs.some(doc =>
            doc.doc_type===requirement.id || requirement.aliases.includes(doc.doc_type)
          )).length
          return <section key={email} style={{border:'1px solid #333', padding:'12px', borderRadius:'12px', marginTop:'10px', background:'#18181b'}}>
            <h3 style={{margin:'0 0 4px'}}>{email}</h3>
            <div style={{fontSize:'12px', color:'#9ca3af', marginBottom:'8px'}}>Progress: {uploadedCount}/2 uploaded</div>
            {PASSENGER_DOCUMENTS.map(requirement => {
              const doc = docs.find(item=>item.doc_type===requirement.id || requirement.aliases.includes(item.doc_type))
              return renderDocumentRow(doc, requirement.id, requirement.label, 'passenger_documents', requirement.required)
            })}
          </section>
        })}
        {Object.keys(passengerGroups).length===0 && <p style={{color:'#9ca3af'}}>No passenger documents uploaded yet.</p>}
      </div>
    )}

    {rejectModal && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
        <div style={{ background:'#1e1e1e', padding:'20px', borderRadius:'12px', width:'90%', maxWidth:'380px', border:'1px solid #333' }}>
          <h3 style={{ margin:'0 0 8px' }}>Reject Reason</h3>
          <p style={{ fontSize:'12px', color:'#9ca3af' }}>The user will see this reason</p>
          <input value={reason} onChange={e=> setReason(e.target.value)} autoFocus placeholder="e.g. Blurry photo, expired" style={{ width:'100%', padding:'10px', borderRadius:'8px', background:'#242428', color:'white', border:'1px solid #444', marginTop:'8px', boxSizing:'border-box' }}/>
          <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
            <button onClick={()=> { setRejectModal(null); setReason('') }} style={{ flex:1, background:'#333', color:'white', padding:'10px', borderRadius:'8px', border:'none' }}>Cancel</button>
            <button onClick={doReject} style={{ flex:1, background:'#ff3b30', color:'white', padding:'10px', borderRadius:'8px', border:'none' }}>Confirm Reject</button>
          </div>
        </div>
      </div>
    )}
  </div>
}
