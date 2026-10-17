import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

export function AdminDocuments({ profile, onBack }: { profile: Profile, onBack: ()=>void }){
  const [drivers,setDrivers]=useState<any[]>([]); 
  const [passengers,setPassengers]=useState<any[]>([]); 
  const [tab,setTab]=useState<'driver'|'passenger'>('driver')
  const [loadingId, setLoadingId] = useState<string|null>(null)
  const [rejectModal, setRejectModal] = useState<{id:string, table:string}|null>(null)
  const [reason, setReason] = useState('')

  useEffect(()=>{ load() },[])
  
  async function load(){ 
    const {data:d}= await supabase.from('driver_documents').select('*, profiles!driver_documents_driver_id_fkey(full_name,email)').order('created_at',{ascending:false}); 
    const {data:p}= await supabase.from('passenger_documents').select('*, profiles!passenger_documents_passenger_id_fkey(full_name,email)').order('created_at',{ascending:false}); 
    if(d) setDrivers(d); 
    if(p) setPassengers(p) 
  }

  async function approve(doc:any, table:any){ 
    setLoadingId(doc.id)
    try {
      // 1. Approve document
      const { error: docErr } = await supabase.from(table).update({ status:'approved', rejection_reason: null } as any).eq('id',doc.id)
      if (docErr) throw docErr
      
      // 2. Also verify profile
      const userId = doc.driver_id || doc.passenger_id
      const { error: profErr } = await supabase.from('profiles').update({ is_verified: true } as any).eq('id', userId)
      if (profErr) console.warn('Profile verify failed (non-critical):', profErr.message)
      
      load() 
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
      const { error } = await supabase.from(rejectModal.table).update({ status:'rejected', rejection_reason: reason } as any).eq('id', rejectModal.id)
      if (error) throw error
      setRejectModal(null)
      setReason('')
      load()
    } catch (e:any) {
      alert('Reject failed: ' + e.message + '\n\nRun this SQL if column missing:\nALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT;')
      console.error(e)
    } finally {
      setLoadingId(null)
    }
  }

  return <div style={{ padding:'16px', background:'#0e0e10', minHeight:'100vh', color:'white' }}>
    <button onClick={onBack} style={{ background:'#242428', color:'white', border:'1px solid #333', padding:'8px 12px', borderRadius:'8px' }}>⬅ Back</button>
    <h2>👑 Admin Docs</h2>
    <div style={{ display:'flex', gap:'8px', margin:'12px 0' }}>
      <button onClick={()=> setTab('driver')} style={{ flex:1, padding:'12px', background: tab==='driver'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none' }}>Drivers ({drivers.filter((d:any)=>d.status==='pending').length})</button>
      <button onClick={()=> setTab('passenger')} style={{ flex:1, padding:'12px', background: tab==='passenger'?'#ff7a00':'#333', color:'white', borderRadius:'8px', border:'none' }}>Passengers ({passengers.filter((d:any)=>d.status==='pending').length})</button>
    </div>

    {(tab==='driver'?drivers:passengers).map((doc:any)=>
      <div key={doc.id} style={{ border:'1px solid #333', padding:'12px', borderRadius:'12px', marginTop:'10px', background:'#1e1e1e', color:'white' }}>
        <b>{doc.profiles?.full_name} ({doc.profiles?.email})</b> - {doc.doc_type} - <span style={{ color: doc.status==='approved'?'#00d181': doc.status==='rejected'?'#ff3b30':'#ff9500' }}>{doc.status}</span>
        {doc.rejection_reason && <div style={{ fontSize:'12px', color:'#ff3b30' }}>Reason: {doc.rejection_reason}</div>}
        <br/>
        <button onClick={()=> window.open(doc.file_url,'_blank')} style={{ marginTop:'6px', background:'#333', color:'white', padding:'6px 10px', borderRadius:'6px', border:'none' }}>View Doc</button>
        <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
          <button disabled={loadingId===doc.id} onClick={()=> approve(doc, tab==='driver'?'driver_documents':'passenger_documents')} style={{ flex:1, background: loadingId===doc.id?'#555':'#00d181', color:'white', padding:'10px', borderRadius:'8px', border:'none' }}>{loadingId===doc.id?'...':'Approve'}</button>
          <button disabled={loadingId===doc.id} onClick={()=> setRejectModal({id: doc.id, table: tab==='driver'?'driver_documents':'passenger_documents'})} style={{ flex:1, background:'#ff3b30', color:'white', padding:'10px', borderRadius:'8px', border:'none' }}>Reject</button>
        </div>
      </div>
    )}

    {rejectModal && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
        <div style={{ background:'#1e1e1e', padding:'20px', borderRadius:'12px', width:'90%', maxWidth:'380px', border:'1px solid #333' }}>
          <h3 style={{ margin:'0 0 8px' }}>Reject Reason</h3>
          <p style={{ fontSize:'12px', color:'#9ca3af' }}>Driver will see this reason</p>
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