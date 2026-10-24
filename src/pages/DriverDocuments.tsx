import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DRIVER_DOCUMENTS } from './AdminDocuments'

type StoredDocument = {
  id: string
  doc_type: string
  status: string
  file_url: string
  expiry_date?: string | null
}

function isExpired(expiryDate?: string | null) {
  if (!expiryDate) return false
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return expiry < today
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 900 * 1024) return file

  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const max = 1600
    let width = bitmap.width
    let height = bitmap.height
    if (width > height && width > max) { height = height * max / width; width = max }
    else if (height > max) { width = width * max / height; height = max }
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image compression failed')), 'image/jpeg', 0.75)
    })
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function DriverDocuments({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [docs, setDocs] = useState<StoredDocument[]>([])
  const [uploading, setUploading] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(){
    setError('')
    const {data, error: loadError}=await supabase.from('driver_documents').select('*').eq('driver_id',driverId)
    if (loadError) {
      setError('Could not load documents: ' + loadError.message)
    } else {
      setDocs((data || []) as StoredDocument[])
    }
    setLoading(false)
  }
  useEffect(()=>{ void load() },[driverId])

  async function doUpload(docType:string, file:File){
    setUploading(docType)
    setError('')
    try {
      const compressed = await compressImage(file)
      const ext = compressed.name.split('.').pop() || 'jpg'
      const path=`${driverId}/${docType}_${Date.now()}.${ext}`
      const {error: uploadError}=await supabase.storage.from('driver-documents').upload(path, compressed, {
        upsert: true,
        contentType: compressed.type,
        cacheControl: '3600'
      })
      if(uploadError) throw uploadError

      const {data: urlData}=supabase.storage.from('driver-documents').getPublicUrl(path)
      const {error: dbError}=await supabase.from('driver_documents').upsert({
        driver_id: driverId,
        doc_type: docType,
        file_url: urlData.publicUrl,
        status: 'pending',
        expiry_date: null
      } as any,{onConflict:'driver_id,doc_type'})
      if(dbError) throw dbError
      await load()
    } catch (uploadError: any) {
      console.error('Upload failed:', uploadError)
      setError('Upload failed: ' + (uploadError.message || 'Please try again.'))
    } finally {
      setUploading(null)
    }
  }

  const canGoOnline = DRIVER_DOCUMENTS.slice(0, 6).every(requirement => {
    const doc = docs.find(item=>item.doc_type===requirement.id)
    return doc?.status.toLowerCase()==='approved' && !isExpired(doc.expiry_date)
  })
  const huru = docs.find(doc=>doc.doc_type==='huru_check')

  return <div style={{padding:'16px', background:'#0e0e10', minHeight:'100vh', color:'white'}}>
    <button onClick={onBack} style={{marginBottom:'12px', background:'#242428', color:'white', border:'1px solid #333', padding:'8px 12px', borderRadius:'8px'}}>← Back</button>
    <h2 style={{margin:'0 0 4px'}}>My Documents</h2>
    <p style={{color: canGoOnline?'#00d181':'#ff9500', fontSize:'13px'}}>{canGoOnline?'All required documents approved — You can go online':'Documents 1–6 must be approved before you can go online'}</p>
    {huru?.status.toLowerCase()!=='approved' && <p style={{background:'#422006', color:'#fcd34d', padding:'10px', borderRadius:'8px'}}>Upload Huru within 7 days</p>}
    {error && <p role="alert" style={{color:'#ff6b6b'}}>{error}</p>}
    {loading && <p style={{color:'#9ca3af'}}>Loading documents…</p>}

    {DRIVER_DOCUMENTS.map(requirement=>{
      const doc=docs.find(item=>item.doc_type===requirement.id)
      const approved=doc?.status.toLowerCase()==='approved' && !isExpired(doc.expiry_date)
      const expired=isExpired(doc?.expiry_date)
      return <div key={requirement.id} style={{
        background:expired?'#450a0a':'#18181b',
        border:expired?'2px solid #ef4444':'1px solid rgba(255,255,255,0.1)',
        borderRadius:'12px',
        padding:'12px',
        marginTop:'10px',
        display:'flex',
        justifyContent:'space-between',
        alignItems:'center',
        gap:'12px'
      }}>
        <div>
          <strong>{requirement.label} {approved && <span aria-label="Approved" style={{color:'#00d181'}}>✓</span>}</strong>
          <div style={{fontSize:'12px', color:'#9ca3af', marginTop:'4px'}}>{requirement.helper}</div>
          <div style={{fontSize:'12px', color:approved?'#00d181':expired||doc?.status.toLowerCase()==='rejected'?'#ff6b6b':'#ff9500', marginTop:'5px'}}>
            {expired?'EXPIRED':doc?.status.toUpperCase() || 'MISSING'}
          </div>
        </div>
        <label style={{flexShrink:0, background:uploading===requirement.id?'#555':'#00a86b', padding:'8px 12px', borderRadius:'8px', fontSize:'12px', cursor:uploading===requirement.id?'wait':'pointer', fontWeight:'bold'}}>
          {uploading===requirement.id?'Uploading…':doc?'Replace':'Upload'}
          <input
            hidden
            type="file"
            accept={requirement.accept}
            disabled={uploading!==null}
            onChange={event=>{
              const file=event.target.files?.[0]
              if(file) void doUpload(requirement.id,file)
              event.target.value=''
            }}
          />
        </label>
      </div>
    })}
  </div>
}
