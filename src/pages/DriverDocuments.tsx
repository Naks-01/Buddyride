import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const REQ = [
  { k: 'id', label: 'SA ID' },
  { k: 'license', label: 'Driver License' },
  { k: 'pdp', label: 'PDP' },
  { k: 'car_papers', label: 'Car Papers' },
  { k: 'disc', label: 'Disc' },
  { k: 'selfie', label: 'Selfie' },
]

export function DriverDocuments({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [up, setUp] = useState<string|null>(null)
  async function load(){ const {data}=await supabase.from('driver_documents').select('*').eq('driver_id',driverId); setDocs(data||[]) }
  useEffect(()=>{ load() },[])

  async function doUpload(k:string, f:File){
    setUp(k)
    const path=`${driverId}/${k}_${Date.now()}.jpg`
    const {error}=await supabase.storage.from('driver-docs').upload(path,f)
    if(error){alert(error.message); setUp(null); return}
    const {data:u}=supabase.storage.from('driver-docs').getPublicUrl(path)
    await supabase.from('driver_documents').upsert({ driver_id:driverId, doc_type:k, file_url:u.publicUrl, status:'pending'},{onConflict:'driver_id,doc_type'})
    setUp(null); load()
  }

  return <div style={{padding:'16px', background:'#0e0e10', minHeight:'100vh', color:'white'}}>
    <button onClick={onBack} style={{marginBottom:'12px', background:'#242428', color:'white', border:'1px solid #333', padding:'8px 12px', borderRadius:'8px'}}>← Back</button>
    <h2 style={{margin:'0 0 4px'}}>My Documents</h2>
    <p style={{color:'#9ca3af', fontSize:'13px'}}>{docs.filter((d:any)=>d.status==='approved').length}/6 Approved — No Insurance needed</p>
    {REQ.map(r=>{
      const d=docs.find((x:any)=>x.doc_type===r.k)
      return <div key={r.k} style={{background:'#18181b', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'12px', padding:'12px', marginTop:'10px', display:'flex', justifyContent:'space-between'}}>
        <div><b>{r.label}</b><div style={{fontSize:'12px', color: d?.status==='approved'?'#00d181':'#ff9500'}}>{d?d.status:'Missing'}</div></div>
        <label style={{background:'#00d181', padding:'8px 12px', borderRadius:'8px', fontSize:'12px'}}>{up===r.k?'...': d?'Replace':'Upload'}<input hidden type="file" accept="image/*" onChange={e=> e.target.files&&doUpload(r.k, e.target.files[0])}/></label>
      </div>
    })}
  </div>
}