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
  profiles?: { full_name: string | null, email: string | null, is_verified?: boolean | null } | null
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

function displayStatus(doc?: StoredDocument, optional = false) {
  if (!doc) return optional ? 'OPTIONAL' : 'MISSING'
  if (doc.status.toLowerCase() === 'expired' || isExpired(doc.expiry_date)) return 'EXPIRED'
  const status = doc.status.toUpperCase()
  return status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING'
}

export function AdminDocuments({ profile: _profile, onBack }: { profile: Profile, onBack: ()=>void }){
  const [driverDocs,setDriverDocs]=useState<StoredDocument[]>([])
  const [passengerDocs,setPassengerDocs]=useState<StoredDocument[]>([])
  const [tab,setTab]=useState<'driver'|'passenger'>('driver')
  const [showUnapprovedOnly, setShowUnapprovedOnly] = useState(false)
  const [loadingId, setLoadingId] = useState<string|null>(null)
  const [rejectModal, setRejectModal] = useState<{id:string, table:'driver_documents'|'passenger_documents'}|null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(()=>{ void load() },[])

  async function load(){
    setError('')
    const [driverResult, passengerResult] = await Promise.all([
      supabase.from('driver_documents').select('*, profiles!driver_documents_driver_id_fkey(full_name,email,is_verified)').order('created_at',{ascending:false}),
      supabase.from('passenger_documents').select('*, profiles!passenger_documents_passenger_id_fkey(full_name,email)').order('created_at',{ascending:false}),
    ])
    if (!driverResult.error) setDriverDocs((driverResult.data || []) as StoredDocument[])
    if (!passengerResult.error) setPassengerDocs((passengerResult.data || []) as StoredDocument[])
    const loadErrors = [driverResult.error, passengerResult.error].filter(Boolean)
    if (loadErrors.length) {
      setError(loadErrors.map(loadError=>loadError?.message).join(' · '))
    }
  }

  async function updateDocumentStatus(
    doc:StoredDocument,
    table:'driver_documents'|'passenger_documents',
    status:'approved'|'rejected',
    driverEmail:string
  ): Promise<boolean> {
    console.log(status==='approved'?'Approving':'Rejecting', doc.id, driverEmail, doc.doc_type)
    setLoadingId(doc.id)
    setError('')
    try {
      const update = (changes: Record<string, string | null>) => supabase.from(table).update(changes as any).eq('id',doc.id)
      const changes: Record<string, string | null> = status==='approved'
        ? { status, verified_at:new Date().toISOString() }
        : { status, rejection_reason:reason.trim() || null }
      let { error: updateError } = await update(changes)
      let metadataColumnMissing = false
      if (updateError) {
        const optionalColumn = status==='approved' ? 'verified_at' : 'rejection_reason'
        const errorText = `${updateError.message} ${updateError.details || ''}`.toLowerCase()
        if (errorText.includes(optionalColumn.toLowerCase()) && (errorText.includes('column') || errorText.includes('schema cache'))) {
          metadataColumnMissing = true
          const fallback = await update({ status })
          updateError = fallback.error
        }
      }
      if (updateError) throw updateError

      const updateLocal = (documents: StoredDocument[]) => documents.map(item =>
        item.id===doc.id ? { ...item, status, rejection_reason:status==='rejected' ? reason.trim() || null : null } : item
      )
      if (table==='driver_documents') setDriverDocs(updateLocal)
      else setPassengerDocs(updateLocal)
      if (metadataColumnMissing) {
        console.warn(`Document status updated, but ${status==='approved'?'verified_at':'rejection_reason'} is not available in ${table}.`)
      }
      await load()
      if (metadataColumnMissing) {
        alert(`Document status updated, but ${status==='approved'?'verified_at':'rejection_reason'} is not available in the ${table} table.`)
      }
      return true
    } catch (e:any) {
      const action = status==='approved'?'Approve':'Reject'
      alert(`${action} failed: ${e.message} - Check the ${table} UPDATE RLS policy for the authenticated admin role.`)
      console.error(e)
      return false
    } finally {
      setLoadingId(null)
    }
  }

  async function approveToDrive(driverId: string) {
    const loadingKey = `approval:${driverId}`
    setLoadingId(loadingKey)
    setError('')
    try {
      const { error: profileError } = await supabase.from('profiles').update({ is_verified: true } as any).eq('id', driverId)
      if (profileError) throw profileError
      await load()
    } catch (approvalError: any) {
      setError('Could not approve driver to go online: ' + approvalError.message)
    } finally {
      setLoadingId(null)
    }
  }

  async function doReject(){
    if (!rejectModal) return
    if (!reason.trim()) { alert('Enter reason'); return }
    const docs = rejectModal.table==='driver_documents' ? driverDocs : passengerDocs
    const doc = docs.find(item=>item.id===rejectModal.id)
    if (!doc) {
      setError('Could not reject document: it is no longer in the loaded document list. Refresh and try again.')
      return
    }
    const succeeded = await updateDocumentStatus(doc,rejectModal.table,'rejected',doc.profiles?.email || doc.user_email || doc.email || '')
    if (succeeded) {
      setRejectModal(null)
      setReason('')
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
    const status = displayStatus(doc, !required)
    const badgeColors: Record<string, { color: string, background: string }> = {
      APPROVED: { color:'#86efac', background:'#14532d' },
      MISSING: { color:'#fca5a5', background:'#7f1d1d' },
      OPTIONAL: { color:'#d1d5db', background:'#374151' },
      PENDING: { color:'#fde68a', background:'#713f12' },
      REJECTED: { color:'#fca5a5', background:'#7f1d1d' },
      EXPIRED: { color:'#fca5a5', background:'#7f1d1d' },
    }
    const badge = badgeColors[status] || badgeColors.PENDING
    return <div key={id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'10px 0', borderTop:'1px solid #333'}}>
      <div style={{minWidth:0}}>
        <strong>{label}</strong>{!required && <span style={{fontSize:'11px', color:'#9ca3af'}}> (Optional)</span>}
        <span style={{display:'inline-block', marginTop:'4px', padding:'3px 8px', borderRadius:'999px', fontSize:'11px', fontWeight:700, color:badge.color, background:badge.background}}>{status}</span>
        {doc?.rejection_reason && <div style={{fontSize:'12px', color:'#ff6b6b'}}>Reason: {doc.rejection_reason}</div>}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', justifyContent:'flex-end', gap:'6px'}}>
        <button disabled={!doc} onClick={()=>doc && window.open(doc.file_url,'_blank')} style={{background:'#333', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none'}}>View Doc</button>
        <button disabled={!doc || loadingId===doc.id} onClick={()=>doc && void updateDocumentStatus(doc,table,'approved',doc.profiles?.email || doc.user_email || doc.email || '')} style={{background:'#00a86b', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none'}}>Approve</button>
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
        <label style={{display:'flex', alignItems:'center', gap:'8px', margin:'8px 0 12px', color:'#d1d5db', fontSize:'14px'}}>
          <input type="checkbox" checked={showUnapprovedOnly} onChange={event=>setShowUnapprovedOnly(event.target.checked)} />
          Show only drivers who are not yet approved
        </label>
        {Object.entries(driverGroups).filter(([, docs]) => !showUnapprovedOnly || docs[0]?.profiles?.is_verified !== true).map(([email, docs]) => {
          const approvedCount = docs.filter(doc=>doc.status.toLowerCase()==='approved').length
          const requiredDocs = DRIVER_DOCUMENTS.filter(requirement=>requirement.required)
          const missingRequired = requiredDocs.filter(requirement => {
            const doc = docs.find(item=>item.doc_type===requirement.id)
            return displayStatus(doc)!=='APPROVED'
          })
          const canApproveToDrive = missingRequired.length===0
          const prdpApproved = displayStatus(docs.find(item=>item.doc_type==='prdp'))==='APPROVED'
          const progressColor = !prdpApproved ? '#ef4444' : canApproveToDrive ? '#22c55e' : '#f59e0b'
          const progressPercent = Math.round(approvedCount / DRIVER_DOCUMENTS.length * 100)
          const driverId = docs.find(doc=>doc.driver_id)?.driver_id
          const isApproved = docs[0]?.profiles?.is_verified === true
          const approvalReason = missingRequired.length
            ? `Missing approval: ${missingRequired.map(requirement=>requirement.label).join(', ')}`
            : ''
          return <section key={email} style={{border:'1px solid #333', padding:'12px', borderRadius:'12px', marginTop:'10px', background:'#18181b'}}>
            <h3 style={{margin:'0 0 4px'}}>{email} - {approvedCount}/7 approved ({progressPercent}%)</h3>
            <div role="progressbar" aria-label={`${email} document approval progress`} aria-valuemin={0} aria-valuemax={7} aria-valuenow={approvedCount} style={{height:'10px', background:'#333', borderRadius:'999px', overflow:'hidden', margin:'8px 0 12px'}}>
              <div style={{width:`${progressPercent}%`, height:'100%', background:progressColor, transition:'width 180ms ease'}} />
            </div>
            {DRIVER_DOCUMENTS.map(requirement => renderDocumentRow(
              docs.find(item=>item.doc_type===requirement.id),
              requirement.id,
              requirement.label,
              'driver_documents',
              requirement.required
            ))}
            <div style={{borderTop:'1px solid #333', marginTop:'8px', paddingTop:'12px'}}>
              <button
                disabled={!canApproveToDrive || !driverId || loadingId===`approval:${driverId}` || isApproved}
                onClick={()=>driverId && void approveToDrive(driverId)}
                style={{width:'100%', padding:'14px', borderRadius:'9px', border:'none', color:'white', fontWeight:700, fontSize:'15px', background:canApproveToDrive?'#15803d':'#4b5563', cursor:canApproveToDrive && !isApproved?'pointer':'not-allowed'}}
              >
                {driverId && loadingId===`approval:${driverId}` ? 'Approving…' : isApproved ? 'Approved to Drive' : 'Approve to Drive - Go Online'}
              </button>
              {!canApproveToDrive && <div style={{fontSize:'12px', color:'#fca5a5', marginTop:'6px'}}>{approvalReason}</div>}
              {canApproveToDrive && !isApproved && <div style={{fontSize:'12px', color:'#9ca3af', marginTop:'6px'}}>Huru is optional and may be uploaded within 7 days.</div>}
            </div>
          </section>
        })}
        {Object.entries(driverGroups).filter(([, docs]) => !showUnapprovedOnly || docs[0]?.profiles?.is_verified !== true).length===0 && <p style={{color:'#9ca3af'}}>{showUnapprovedOnly?'No unapproved drivers.':'No driver documents uploaded yet.'}</p>}
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
