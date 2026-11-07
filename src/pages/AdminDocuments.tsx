import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'
import { createDriverDocumentSignedUrl, isFakeFile, REQUIRED_DOCS, normalizeDriverDocType } from '../lib/driverDocuments'

export const DRIVER_DOCUMENTS = REQUIRED_DOCS.map((document, index) => ({
  id: document.type,
  label: document.type === 'prdp' ? 'PDP / PrDP' : document.label,
  helper: document.label,
  accept: 'image/*,application/pdf',
  required: true,
  order: index + 1,
}))

function linkedDriverDocumentTypes(type: string) {
  return [type]
}

function findDriverRequirementDocument(docs: StoredDocument[], type: string) {
  const matchingDocuments = docs.filter(item => normalizeDriverDocType(item.doc_type) === type)
  return matchingDocuments.find(item => hasRealDocument(item)) || matchingDocuments[0]
}

type StoredDocument = {
  id: string
  driver_id?: string
  user_id?: string
  passenger_id?: string
  user_email?: string | null
  email?: string | null
  doc_type: string
  file_url?: string | null
  file_path?: string | null
  storage_path?: string | null
  file_name?: string | null
  status: string
  expiry_date?: string | null
  rejection_reason?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
  profiles?: {
    id?: string
    email?: string | null
    full_name?: string | null
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    is_verified?: boolean | null
    verification_status?: string | null
  } | null
}

function groupDriversById(docs: StoredDocument[]) {
  return docs.reduce<Record<string, StoredDocument[]>>((groups, doc) => {
    const userId = doc.user_id || doc.driver_id
    if (!userId) return groups
    if (!groups[userId]) groups[userId] = []
    groups[userId].push(doc)
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

function getDocumentUrl(doc?: Pick<StoredDocument, 'file_url'>) {
  return doc?.file_url?.trim() || ''
}

function hasRealDocument(doc?: Pick<StoredDocument, 'file_url'>) {
  const filePath = getDocumentUrl(doc)
  if (isFakeFile(filePath)) return false

  if (/^https?:\/\//i.test(filePath)) {
    try {
      const fileUrl = new URL(filePath)
      const supabaseUrl = new URL(import.meta.env.VITE_SUPABASE_URL)
      return fileUrl.origin === supabaseUrl.origin && fileUrl.pathname.includes('/storage/v1/object/')
    } catch {
      return false
    }
  }

  const separator = filePath.indexOf(':')
  const bucket = separator >= 0 ? filePath.slice(0, separator) : 'driver-documents'
  const path = separator >= 0 ? filePath.slice(separator + 1) : filePath
  return ['driver-documents', 'vehicle-documents', 'profile-photos'].includes(bucket) && Boolean(path)
}

function displayStatus(doc?: StoredDocument, optional = false) {
  if (!doc) return optional ? 'OPTIONAL' : 'MISSING'
  if (!hasRealDocument(doc)) return 'MISSING'
  if (doc.status.trim().toLowerCase() === 'expired' || isExpired(doc.expiry_date)) return 'EXPIRED'
  const status = doc.status.trim().toUpperCase()
  return status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING'
}

type PassengerSafetyReview = Pick<Profile,
  'id' | 'email' | 'full_name' | 'phone' | 'avatar_url' | 'selfie_url' | 'id_document_url' | 'id_number' | 'id_verification_method' | 'verification_status' | 'verification_rejection_reason'
> & {
  id_photo_preview_url?: string | null
  updated_at?: string | null
}

export function AdminDocuments({ profile: _profile, onBack }: { profile: Profile, onBack: ()=>void }){
  const [driverDocs,setDriverDocs]=useState<StoredDocument[]>([])
  const [pendingDriverDocumentCount, setPendingDriverDocumentCount] = useState(0)
  const [pendingPassengerProfiles, setPendingPassengerProfiles] = useState<PassengerSafetyReview[]>([])
  const [approvedPassengerProfiles, setApprovedPassengerProfiles] = useState<PassengerSafetyReview[]>([])
  const [tab,setTab]=useState<'driver'|'passenger-safety'|'approved-passengers'>('driver')
  const [search,setSearch] = useState('')
  const [showUnapprovedOnly, setShowUnapprovedOnly] = useState(false)
  const [loadingId, setLoadingId] = useState<string|null>(null)
  const [rejectModal, setRejectModal] = useState<{id:string, kind:'driver-document'|'passenger-safety'}|null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionCategory, setRejectionCategory] = useState('')
  const [error, setError] = useState('')

  async function viewDriverDocument(fileUrl?: string | null) {
    const docUrl = fileUrl?.trim()
    if (isFakeFile(docUrl)) {
      setError('No real file uploaded - test data')
      return
    }
    if (!docUrl) {
      setError('No document uploaded yet')
      return
    }

    const newWindow = window.open('about:blank', '_blank')
    try {
      const signedUrl = await createDriverDocumentSignedUrl(docUrl)
      if (newWindow) newWindow.location.href = signedUrl
      else window.location.href = signedUrl
    } catch (viewError: unknown) {
      newWindow?.close()
      const message = viewError instanceof Error ? viewError.message : String(viewError)
      setError(`Could not open document: ${message}`)
    }
  }

  useEffect(()=>{ void load() },[])

  async function load(){
    setError('')
    const [driverResult, pendingPassengerResult, approvedPassengerResult] = await Promise.all([
      supabase.from('driver_documents').select('*,profiles!driver_documents_driver_id_fkey!inner(*)').order('created_at',{ascending:false}),
      supabase.from('profiles')
        .select('id,email,full_name,phone,avatar_url,selfie_url,id_document_url,id_number,id_verification_method,verification_status,verification_rejection_reason,updated_at')
        .eq('role', 'passenger')
        .eq('verification_status', 'pending_verification')
        .not('selfie_url', 'is', null),
      supabase.from('profiles')
        .select('id,email,full_name,phone,avatar_url,selfie_url,id_document_url,id_number,id_verification_method,verification_status,verification_rejection_reason,updated_at')
        .eq('role', 'passenger')
        .eq('verification_status', 'verified')
        .order('updated_at', { ascending: false }),
    ])
    let profileLoadError = ''
    if (!driverResult.error) {
      const loadedDocuments = driverResult.data || []
      setPendingDriverDocumentCount(loadedDocuments.filter(document =>
        document.status.trim().toLocaleLowerCase() === 'pending',
      ).length)
      const latestByType = new Map<string, typeof driverResult.data[number]>()
      for (const document of loadedDocuments) {
        const key = `${document.driver_id}:${document.doc_type}`
        if (!latestByType.has(key)) latestByType.set(key, document)
      }
      setDriverDocs([...latestByType.values()].map(document => ({
        ...document,
        profiles: Array.isArray(document.profiles) ? document.profiles[0] || null : document.profiles || null,
      })))
    }
    const loadPassengerProfiles = async (profiles: PassengerSafetyReview[]) => Promise.all(profiles.map(async passenger => {
        if (!passenger.id_document_url) return { ...passenger, id_photo_preview_url: null }
        const { data, error: signedUrlError } = await supabase.storage
          .from('passenger-ids')
          .createSignedUrl(passenger.id_document_url, 60)
        if (signedUrlError) {
          profileLoadError = [profileLoadError, `Could not open passenger ID photo for ${passenger.email || passenger.id}: ${signedUrlError.message}`]
            .filter(Boolean)
            .join(' · ')
          return { ...passenger, id_photo_preview_url: null }
        }
        return { ...passenger, id_photo_preview_url: data.signedUrl }
      }))
    if (!pendingPassengerResult.error) {
      setPendingPassengerProfiles(await loadPassengerProfiles(pendingPassengerResult.data || []))
    }
    if (!approvedPassengerResult.error) {
      setApprovedPassengerProfiles(await loadPassengerProfiles(approvedPassengerResult.data || []))
    }
    const loadErrors = [
      driverResult.error,
      pendingPassengerResult.error,
      approvedPassengerResult.error,
    ].filter(Boolean)
    const loadErrorMessages = [
      ...loadErrors.map(loadError => loadError?.message),
      profileLoadError,
    ].filter(Boolean)
    if (loadErrorMessages.length) {
      setError(loadErrorMessages.join(' · '))
    }
  }

  async function updateDocumentStatus(
    doc:StoredDocument,
    table:'driver_documents',
    status:'approved'|'rejected',
    driverEmail:string,
    rejectionReason = '',
  ): Promise<boolean> {
    console.log(status==='approved'?'Approving':'Rejecting', doc.id, driverEmail, doc.doc_type)
    setLoadingId(doc.id)
    setError('')
    try {
      const update = (changes: Record<string, string | null>) => {
        const query = supabase.from('driver_documents').update(changes as any)
        if (doc.driver_id) return query.eq('driver_id', doc.driver_id).in('doc_type', linkedDriverDocumentTypes(doc.doc_type))
        return query.eq('id', doc.id)
      }
      const documentStatus = status.toUpperCase()
      const reviewedAt = new Date().toISOString()
      const changes: Record<string, string | null> = {
        status: documentStatus,
        rejection_reason: status === 'rejected' ? rejectionReason.trim() : null,
        reviewed_at: reviewedAt,
        reviewed_by: _profile.id,
      }
      let { error: updateError } = await update(changes)
      if (updateError) throw updateError

      const linkedTypes = new Set(linkedDriverDocumentTypes(doc.doc_type))
      const updateLocal = (documents: StoredDocument[]) => documents.map(item =>
        item.id === doc.id || (item.driver_id === doc.driver_id && linkedTypes.has(item.doc_type)) ? {
          ...item,
          status: documentStatus,
          rejection_reason: status === 'rejected' ? rejectionReason.trim() || null : null,
          reviewed_at: reviewedAt,
          reviewed_by: _profile.id,
        } : item
      )
      setDriverDocs(updateLocal)

      let verificationSyncError = ''
      if (status === 'rejected') {
        const profileId = doc.driver_id || doc.user_id || doc.profiles?.id
        if (!profileId) {
          verificationSyncError = 'The driver profile could not be identified.'
        } else {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              is_verified: false,
              verification_status: 'rejected',
              verification_rejection_reason: rejectionReason.trim(),
              verified_at: null,
            })
            .eq('id', profileId)
          if (profileError) verificationSyncError = profileError.message
        }
      }
      await load()
      if (verificationSyncError) {
        setError(`Document status updated, but driver verification could not be synchronized: ${verificationSyncError}`)
        return false
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
      const { error: profileError } = await supabase.from('profiles')
        .update({ is_verified: true, verification_status: 'approved' } as any)
        .eq('id', driverId)
      if (profileError) throw profileError
      await load()
    } catch (approvalError: any) {
      setError('Could not approve driver to go online: ' + approvalError.message)
    } finally {
      setLoadingId(null)
    }
  }

  async function approvePassengerSafety(passengerId: string) {
    setLoadingId(`passenger-safety:${passengerId}`)
    setError('')
    try {
      const { error: approvalError } = await supabase.rpc('approve_passenger_safety', {
        p_passenger_id: passengerId,
      })
      if (approvalError) throw approvalError
      await load()
    } catch (reviewError: unknown) {
      const message = reviewError instanceof Error ? reviewError.message : String(reviewError)
      setError(`Could not approve passenger safety verification: ${message}`)
    } finally {
      setLoadingId(null)
    }
  }

  async function doReject(){
    if (!rejectModal) return
    const reason = rejectionCategory
      ? `${rejectionCategory}: ${rejectionReason.trim()}`
      : rejectionReason.trim()
    if (rejectionReason.trim().length < 10) {
      setError('Please enter at least 10 characters explaining the rejection.')
      return
    }
    let succeeded = false
    if (rejectModal.kind === 'passenger-safety') {
      setLoadingId(`passenger-safety:${rejectModal.id}`)
      setError('')
      try {
        const { data, error: rejectionError } = await supabase.from('profiles')
          .update({
            id_verified: false,
            is_verified: false,
            verification_status: 'rejected',
            verification_rejection_reason: reason,
            verified_at: null,
          })
          .eq('id', rejectModal.id)
          .eq('role', 'passenger')
          .eq('verification_status', 'pending_verification')
          .select('id')
          .maybeSingle()
        if (rejectionError) throw rejectionError
        if (!data) throw new Error('Pending passenger safety verification was not found.')
        await load()
        succeeded = true
      } catch (reviewError: unknown) {
        const message = reviewError instanceof Error ? reviewError.message : String(reviewError)
        setError(`Could not reject passenger safety verification: ${message}`)
      } finally {
        setLoadingId(null)
      }
    } else {
      const doc = driverDocs.find(item=>item.id===rejectModal.id)
      if (!doc) {
        setError('Could not reject document: it is no longer in the loaded document list. Refresh and try again.')
        return
      }
      succeeded = await updateDocumentStatus(
        doc,
        'driver_documents',
        'rejected',
        doc.profiles?.email || doc.user_email || doc.email || '',
        reason,
      )
    }
    if (succeeded) {
      setRejectModal(null)
      setRejectionReason('')
      setRejectionCategory('')
    }
  }

  const driversById = groupDriversById(driverDocs)
  const matchesPassenger = (passenger: PassengerSafetyReview, query: string) => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return !normalizedQuery || [
      passenger.full_name,
      passenger.email,
      passenger.phone,
      passenger.id_number,
      passenger.id,
    ].some(value => value?.toLocaleLowerCase().includes(normalizedQuery))
  }
  const pendingPassengers = pendingPassengerProfiles.filter(passenger => matchesPassenger(passenger, search))
  const approvedPassengers = approvedPassengerProfiles.filter(passenger => matchesPassenger(passenger, search))
  const normalizedDriverSearch = search.trim().toLocaleLowerCase()
  const matchesDriver = (docs: StoredDocument[]) => {
    const profile = docs[0]?.profiles
    return !normalizedDriverSearch || [profile?.full_name, profile?.email]
      .some(value => value?.toLocaleLowerCase().includes(normalizedDriverSearch))
  }
  const isPendingDocument = (doc: StoredDocument) => doc.status.trim().toLocaleLowerCase() === 'pending'
  const isApprovedDocument = (doc: StoredDocument) => doc.status.trim().toLocaleLowerCase() === 'approved'
  const pendingDrivers = Object.entries(driversById).filter(([, docs]) =>
    docs.some(isPendingDocument),
  )
  const visibleDrivers = Object.entries(driversById).filter(([, docs]) =>
    docs.some(showUnapprovedOnly ? isPendingDocument : doc => isPendingDocument(doc) || isApprovedDocument(doc))
      && matchesDriver(docs),
  )

  function renderDocumentRow(
    doc: StoredDocument | undefined,
    id: string,
    label: string,
    table: 'driver_documents',
    required: boolean
  ) {
    const status = displayStatus(doc)
    const docUrl = getDocumentUrl(doc)
    const canViewDocument = status !== 'MISSING' && hasRealDocument(doc)
    const badgeColors: Record<string, { color: string, background: string }> = {
      APPROVED: { color:'#86efac', background:'#14532d' },
      MISSING: { color:'#fde68a', background:'#713f12' },
      OPTIONAL: { color:'#d1d5db', background:'#374151' },
      PENDING: { color:'#93c5fd', background:'#1e3a8a' },
      REJECTED: { color:'#fca5a5', background:'#7f1d1d' },
      EXPIRED: { color:'#fca5a5', background:'#7f1d1d' },
    }
    const badge = badgeColors[status] || badgeColors.PENDING
    return <div key={id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px', padding:'10px 0', borderTop:'1px solid #333'}}>
      <div style={{minWidth:0}}>
        <strong>{label}</strong>{!required && <span style={{fontSize:'11px', color:'#9ca3af'}}> (Optional)</span>}
        <span style={{display:'inline-block', marginTop:'4px', padding:'3px 8px', borderRadius:'999px', fontSize:'11px', fontWeight:700, color:badge.color, background:badge.background}}>{status}</span>
        {isFakeFile(docUrl) && <div role="status" style={{fontSize:'12px', color:'#fbbf24'}}>No real file uploaded - test data</div>}
        {doc?.rejection_reason && <div style={{fontSize:'12px', color:'#ff6b6b'}}>Reason: {doc.rejection_reason}</div>}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', justifyContent:'flex-end', gap:'6px'}}>
        <button disabled={!canViewDocument} title={isFakeFile(docUrl)?'No real file uploaded - test data':undefined} onClick={()=>void viewDriverDocument(docUrl)} style={{background:canViewDocument?'#333':'#4b5563', color:canViewDocument?'white':'#d1d5db', padding:'7px 9px', borderRadius:'6px', border:'none', cursor:canViewDocument?'pointer':'not-allowed', opacity:canViewDocument?1:0.5}}>View Doc</button>
        <button disabled={!doc || loadingId===doc.id} onClick={()=>doc && void updateDocumentStatus(doc,table,'approved',doc.profiles?.email || doc.user_email || doc.email || '')} style={{background:'#00a86b', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none'}}>Approve</button>
        <button disabled={!doc || loadingId===doc.id} onClick={()=>doc && setRejectModal({id:doc.id,kind:'driver-document'})} style={{background:'#c62828', color:'white', padding:'7px 9px', borderRadius:'6px', border:'none'}}>Reject</button>
      </div>
    </div>
  }

  function renderPassengerSafetyCard(passenger: PassengerSafetyReview, allowReview: boolean) {
    return <section key={passenger.id} style={{ border:'1px solid #333', padding:14, borderRadius:12, marginTop:10, background:'#18181b' }}>
      <div style={{ fontWeight:700 }}>{passenger.full_name || passenger.email || 'Passenger'}</div>
      <div style={{ marginTop:4, fontSize:13, opacity:0.8 }}>{passenger.email || 'No email'}{passenger.phone ? ` - ${passenger.phone}` : ''}</div>
      <div style={{ marginTop:4, fontSize:11, opacity:0.55 }}>{passenger.id}</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, marginTop:14 }}>
        <div>
          <strong style={{ display:'block', marginBottom:6 }}>Selfie</strong>
          {passenger.selfie_url
            ? <a href={passenger.selfie_url} target="_blank" rel="noreferrer"><img src={passenger.selfie_url} alt={`${passenger.full_name || 'Passenger'} selfie`} style={{ width:'100%', maxHeight:240, objectFit:'contain', background:'#09090b', borderRadius:8 }} /></a>
            : <span style={{ color:'red' }}>FAIL - No selfie_url - ask user to re-upload</span>}
        </div>
        <div>
          <strong style={{ display:'block', marginBottom:6 }}>ID</strong>
          {passenger.id_photo_preview_url
            ? <a href={passenger.id_photo_preview_url} target="_blank" rel="noreferrer"><img src={passenger.id_photo_preview_url} alt={`${passenger.full_name || 'Passenger'} ID`} style={{ width:'100%', maxHeight:240, objectFit:'contain', background:'#09090b', borderRadius:8 }} /></a>
            : <span>ID Number: {passenger.id_number || 'Not provided'}</span>}
        </div>
      </div>
      <div style={{ marginTop:5 }}><strong>Method:</strong> {passenger.id_verification_method || 'Not recorded'}</div>
      {allowReview && <div style={{ display:'flex', gap:8, marginTop:14 }}>
        <button type="button" disabled={loadingId===`passenger-safety:${passenger.id}`} onClick={()=>void approvePassengerSafety(passenger.id)} style={{ flex:1, padding:11, border:0, borderRadius:8, background:'#15803d', color:'white', fontWeight:700 }}>
          {loadingId===`passenger-safety:${passenger.id}` ? 'Saving…' : 'Approve'}
        </button>
        <button type="button" disabled={loadingId===`passenger-safety:${passenger.id}`} onClick={()=>setRejectModal({id:passenger.id,kind:'passenger-safety'})} style={{ flex:1, padding:11, border:0, borderRadius:8, background:'#b91c1c', color:'white', fontWeight:700 }}>Reject</button>
      </div>}
    </section>
  }

  return <div style={{ padding:'16px', background:'#0e0e10', minHeight:'100vh', color:'white' }}>
    <button onClick={onBack} style={{ background:'#242428', color:'white', border:'1px solid #333', padding:'8px 12px', borderRadius:'8px' }}>⬅ Back</button>
    <h2>👑 Admin Docs</h2>
    <label style={{ display:'block', margin:'12px 0 8px', color:'#d1d5db', fontSize:14 }}>
      Search drivers by name, email, phone, or user ID
      <input value={search} onChange={event=>{
        setSearch(event.target.value)
      }} placeholder="e.g. MR NAKAMPE T" style={{ display:'block', width:'100%', boxSizing:'border-box', marginTop:6, padding:10, borderRadius:8, border:'1px solid #444', background:'#242428', color:'white' }} />
    </label>
    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', margin:'12px 0' }}>
      <button onClick={()=> setTab('driver')} style={{ flex:1, minWidth:140, padding:'12px', background: tab==='driver'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none' }}>Drivers Pending ({pendingDrivers.length}; {pendingDriverDocumentCount} documents)</button>
    </div>
    {error && <p role="alert" style={{color:'#ff6b6b'}}>{error}</p>}

    {tab==='driver' ? (
      <div>
        <label style={{display:'flex', alignItems:'center', gap:'8px', margin:'8px 0 12px', color:'#d1d5db', fontSize:'14px'}}>
          <input type="checkbox" checked={showUnapprovedOnly} onChange={event=>setShowUnapprovedOnly(event.target.checked)} />
          Show only drivers who are not yet approved
        </label>
        {visibleDrivers.map(([driverId, docs]) => {
          const driverProfile = docs[0]?.profiles
          const fullName = driverProfile?.full_name
            || `${driverProfile?.first_name || ''} ${driverProfile?.last_name || ''}`.trim()
            || driverProfile?.email
            || 'Unknown Driver'
          const email = docs.find(doc=>doc.profiles?.email || doc.user_email || doc.email)?.profiles?.email
            || docs.find(doc=>doc.user_email || doc.email)?.user_email
            || docs.find(doc=>doc.email)?.email
            || driverProfile?.email
          const userId = docs[0]?.user_id || driverProfile?.id || driverId
          const requiredDocs = DRIVER_DOCUMENTS.filter(requirement => requirement.required)
          const approvedCount = requiredDocs.filter(requirement =>
            displayStatus(findDriverRequirementDocument(docs, requirement.id)) === 'APPROVED',
          ).length
          const missingRequired = requiredDocs.filter(requirement => {
            const doc = findDriverRequirementDocument(docs, requirement.id)
            return displayStatus(doc)!=='APPROVED'
          })
          const canApproveToDrive = missingRequired.length===0
          const progressColor = canApproveToDrive ? '#22c55e' : '#f59e0b'
          const progressPercent = Math.round(approvedCount / requiredDocs.length * 100)
          const isApproved = docs[0]?.profiles?.is_verified === true
          const approvalReason = missingRequired.length
            ? `Missing approval: ${missingRequired.map(requirement=>requirement.label).join(', ')}`
            : ''
          return <section key={driverId} style={{border:'1px solid #333', padding:'12px', borderRadius:'12px', marginTop:'10px', background:'#18181b'}}>
            <div style={{margin:'0 0 4px'}}>
              <div style={{fontWeight:700}}>{fullName}</div>
              <div style={{fontSize:13, opacity:0.8}}>{email || 'No email'}{driverProfile?.phone ? ` - ${driverProfile.phone}` : ''}</div>
              <div style={{fontSize:11, opacity:0.5}}>{userId} - {approvedCount}/{requiredDocs.length}</div>
            </div>
            <div role="progressbar" aria-label={`${email} document approval progress`} aria-valuemin={0} aria-valuemax={requiredDocs.length} aria-valuenow={approvedCount} style={{height:'10px', background:'#333', borderRadius:'999px', overflow:'hidden', margin:'8px 0 12px'}}>
              <div style={{width:`${progressPercent}%`, height:'100%', background:progressColor, transition:'width 180ms ease'}} />
            </div>
            {DRIVER_DOCUMENTS.map(requirement => renderDocumentRow(
              findDriverRequirementDocument(docs, requirement.id),
              requirement.id,
              requirement.label,
              'driver_documents',
              requirement.required
            ))}
            <div style={{borderTop:'1px solid #333', marginTop:'8px', paddingTop:'12px'}}>
              <button
                disabled={!canApproveToDrive || loadingId===`approval:${driverId}` || isApproved}
                onClick={()=>driverId && void approveToDrive(driverId)}
                style={{width:'100%', padding:'14px', borderRadius:'9px', border:'none', color:'white', fontWeight:700, fontSize:'15px', background:canApproveToDrive?'#15803d':'#4b5563', cursor:canApproveToDrive && !isApproved?'pointer':'not-allowed'}}
              >
                {driverId && loadingId===`approval:${driverId}` ? 'Approving…' : isApproved ? 'Approved to Drive' : 'Approve to Drive - Go Online'}
              </button>
              {!canApproveToDrive && <div style={{fontSize:'12px', color:'#fca5a5', marginTop:'6px'}}>{approvalReason}</div>}
            </div>
          </section>
        })}
        {visibleDrivers.length===0 && <p style={{color:'#9ca3af'}}>No drivers are waiting for verification.</p>}
      </div>
    ) : tab === 'passenger-safety' ? (
      <div>
        {pendingPassengers.map(passenger => renderPassengerSafetyCard(passenger, true))}
        {pendingPassengers.length===0 && <p style={{ color:'#9ca3af' }}>No passengers are waiting for safety verification.</p>}
      </div>
    ) : (
      <div>
        {approvedPassengers.map(passenger => renderPassengerSafetyCard(passenger, false))}
        {approvedPassengers.length===0 && <p style={{ color:'#9ca3af' }}>No approved passengers found.</p>}
      </div>
    )}

    {rejectModal && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
        <div style={{ background:'#1e1e1e', padding:'20px', borderRadius:'12px', width:'90%', maxWidth:'380px', border:'1px solid #333' }}>
          <h3 style={{ margin:'0 0 8px' }}>Reject Reason</h3>
          <label style={{ display:'block', fontSize:13, color:'#d1d5db' }}>
            Suggested reason
            <select value={rejectionCategory} onChange={event=>setRejectionCategory(event.target.value)} style={{ display:'block', width:'100%', padding:10, borderRadius:8, background:'#242428', color:'white', border:'1px solid #444', marginTop:6, boxSizing:'border-box' }}>
              <option value="">Choose a reason (optional)</option>
              <option>ID blurry</option>
              <option>Selfie not clear</option>
              <option>ID number mismatch</option>
              <option>Wrong document</option>
              <option>Other</option>
            </select>
          </label>
          <label style={{ display:'block', fontSize:13, color:'#d1d5db', marginTop:12 }}>
            Why are you rejecting? (required)
            <textarea value={rejectionReason} onChange={e=> { setRejectionReason(e.target.value); setError('') }} autoFocus placeholder="Enter at least 10 characters" rows={3} style={{ display:'block', width:'100%', padding:'10px', borderRadius:'8px', background:'#242428', color:'white', border:'1px solid #444', marginTop:'6px', boxSizing:'border-box', resize:'vertical' }}/>
          </label>
          {rejectionReason.trim().length < 10 && <p role="alert" style={{ fontSize:12, color:'#fca5a5', margin:'6px 0 0' }}>Enter at least 10 characters.</p>}
          <div style={{ display:'flex', gap:'8px', marginTop:'12px' }}>
            <button onClick={()=> { setRejectModal(null); setRejectionReason(''); setRejectionCategory(''); setError('') }} style={{ flex:1, background:'#333', color:'white', padding:'10px', borderRadius:'8px', border:'none' }}>Cancel</button>
            <button disabled={rejectionReason.trim().length < 10 || loadingId !== null} onClick={()=>void doReject()} style={{ flex:1, background:'#ff3b30', color:'white', padding:'10px', borderRadius:'8px', border:'none', opacity:rejectionReason.trim().length < 10 ? 0.5 : 1 }}>Confirm Reject</button>
          </div>
        </div>
      </div>
    )}
  </div>
}
