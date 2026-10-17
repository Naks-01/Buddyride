import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const REQ = [
  { k: 'id', label: 'SA ID', hasExpiry: false },
  { k: 'license', label: 'Driver License', hasExpiry: true },
  { k: 'pdp', label: 'PDP', hasExpiry: true },
  { k: 'car_papers', label: 'Car Papers', hasExpiry: false },
  { k: 'disc', label: 'Disc', hasExpiry: true },
  { k: 'selfie', label: 'Selfie', hasExpiry: false },
  { k: 'huru', label: 'HURU Criminal Check', hasExpiry: true },
]

function isExpired(expiryDate: string | null | undefined) {
  if (!expiryDate) return false
  const today = new Date()
  today.setHours(0,0,0,0)
  const exp = new Date(expiryDate)
  exp.setHours(0,0,0,0)
  return exp < today
}

function daysLeft(expiryDate: string) {
  const today = new Date()
  today.setHours(0,0,0,0)
  const exp = new Date(expiryDate)
  exp.setHours(0,0,0,0)
  return Math.ceil((exp.getTime() - today.getTime()) / (1000*60*60*24))
}

// NEW: compress image to < 1MB before upload
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size < 900 * 1024) return file // already small

  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const max = 1600
    let w = bitmap.width, h = bitmap.height
    if (w > h && w > max) { h = h * max / w; w = max }
    else if (h > max) { w = w * max / h; h = max }
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.75)!)
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function DriverDocuments({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [up, setUp] = useState<string|null>(null)
  const [expiryMap, setExpiryMap] = useState<Record<string,string>>({})

  async function load(){
    const {data}=await supabase.from('driver_documents').select('*').eq('driver_id',driverId);
    setDocs(data||[])
    const map: Record<string,string> = {}
    ;(data||[]).forEach((d:any)=>{
      if(d.expiry_date) map[d.doc_type] = d.expiry_date.split('T')[0]
    })
    setExpiryMap(map)
  }
  useEffect(()=>{ load() },[])

  async function doUpload(k:string, f:File){
    const expiry = expiryMap[k] || undefined
    if (REQ.find(r=>r.k===k)?.hasExpiry && !expiry) {
      alert(`Please select expiry date for ${k} first`)
      return
    }
    setUp(k)
    try {
      const compressed = await compressImage(f)
      const ext = compressed.name.split('.').pop() || 'jpg'
      const path=`${driverId}/${k}_${Date.now()}.${ext}`
      
      const {error}=await supabase.storage.from('driver-documents').upload(path, compressed, {
        upsert: true,
        contentType: compressed.type,
        cacheControl: '3600'
      })
      if(error) throw error
      
      const {data:u}=supabase.storage.from('driver-documents').getPublicUrl(path)
      
      const {error: dbError}=await supabase.from('driver_documents').upsert({
        driver_id: driverId,
        doc_type: k,
        file_url: u.publicUrl,
        status: 'pending',
        expiry_date: expiry || null
      } as any,{onConflict:'driver_id,doc_type'})
      
      if(dbError) throw dbError
      
      await load()
    } catch (e: any) {
      console.error('Upload failed full error:', e)
      alert('Upload failed: ' + (e.message || 'Failed to fetch - try smaller image'))
    } finally {
      setUp(null)
    }
  }

  return <div style={{padding:'16px', background:'#0e0e10', minHeight:'100vh', color:'white'}}>
    <button onClick={onBack} style={{marginBottom:'12px', background:'#242428', color:'white', border:'1px solid #333', padding:'8px 12px', borderRadius:'8px'}}>← Back</button>
    <h2 style={{margin:'0 0 4px'}}>My Documents</h2>
    <p style={{color:'#9ca3af', fontSize:'13px'}}>{docs.filter((d:any)=>d.status==='approved').length}/7 Approved — Including HURU</p>

    {REQ.map(r=>{
      const d=docs.find((x:any)=>x.doc_type===r.k)
      const expired = isExpired(d?.expiry_date)
      const left = d?.expiry_date? daysLeft(d.expiry_date) : null

      return (
        <div key={r.k} style={{
          background: expired? '#450a0a' : left!==null && left<=7 && left>=0? '#422006' : '#18181b',
          border: expired? '2px solid #ef4444' : left!==null && left<=7 && left>=0? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
          borderRadius:'12px',
          padding:'12px',
          marginTop:'10px',
          display:'flex',
          justifyContent:'space-between',
          alignItems:'center'
        }}>
          <div>
            <b style={{color: expired? '#fca5a5' : left!==null && left<=7 && left>=0? '#fcd34d' : 'white'}}>
              {r.label} {expired && '⚠️ EXPIRED'} {left!==null && left<=7 && left>=0 && `⚠️ ${left}d left`} {r.k==='huru' && '(PostNet)'}
            </b>
            <div style={{fontSize:'12px', color: expired? '#ef4444' : d?.status==='approved'?'#00d181':'#ff9500', fontWeight: expired? 700 : 400}}>
              {expired? `Expired on ${new Date(d.expiry_date).toLocaleDateString()}` : d? d.status : 'Missing'}
            </div>
            {r.hasExpiry && d?.expiry_date &&!expired && (
              <div style={{fontSize:'11px', color: r.k==='huru'? '#f59e0b' : '#9ca3af'}}>
                Exp: {new Date(d.expiry_date).toLocaleDateString()} {r.k==='huru' && '(Bolt rule: 30 days)'}
              </div>
            )}
            {r.k==='huru' &&!d && (
              <div style={{fontSize:'11px', color:'#9ca3af', marginTop:'4px'}}>Go to PostNet/Jetline with ID → R335-R565</div>
            )}
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:'6px', alignItems:'flex-end'}}>
            {r.hasExpiry && (
              <input
                type="date"
                value={expiryMap[r.k] || ''}
                onChange={e=> setExpiryMap(prev=> ({...prev, [r.k]: e.target.value}))}
                style={{fontSize:'11px', background:'#242428', color:'white', border:'1px solid #333', borderRadius:'6px', padding:'4px'}}
              />
            )}
            <label style={{background: expired? '#ef4444' : '#00d181', padding:'8px 12px', borderRadius:'8px', fontSize:'12px', cursor:'pointer', fontWeight:'bold'}}>
              {up===r.k?'...': d?'Replace':'Upload'}
              <input hidden type="file" accept="image/*,.pdf" onChange={e=> {
                if (!e.target.files?.[0]) return
                doUpload(r.k, e.target.files[0])
              }}/>
            </label>
          </div>
        </div>
      )
    })}

    <div style={{marginTop:'20px', background:'#1f1f23', padding:'12px', borderRadius:'10px'}}>
      <b style={{fontSize:'13px'}}>How to get HURU:</b>
      <ol style={{fontSize:'12px', color:'#9ca3af', paddingLeft:'16px', margin:'6px 0'}}>
        <li>Go to PostNet/Jetline with SA ID</li>
        <li>Fingerprints + photo</li>
        <li>Pay R335 (48h), R395 (5h), R565 (2h)</li>
        <li>Upload PDF here</li>
      </ol>
    </div>
  </div>
}