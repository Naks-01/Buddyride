import { useState } from 'react'
import { supabase } from '../lib/supabase'

function isValidSAID(id: string){
  if(!/^\d{13}$/.test(id)) return false
  let sum=0, alt=false
  for(let i=id.length-1;i>=0;i--){
    let n=parseInt(id[i]); if(alt){ n*=2; if(n>9) n-=9 } sum+=n; alt=!alt
  }
  return sum%10===0
}

// Accept both profile and user to prevent future errors
export function PassengerDocuments({ profile, user, onBack }: any){
  const currentUser = profile || user
  const userId = currentUser?.id

  const [idNumber, setIdNumber] = useState(currentUser?.id_number || '')
  const [phone, setPhone] = useState(currentUser?.phone || '')
  const [files, setFiles] = useState<{selfie: string, idDoc: string}>({ selfie: currentUser?.selfie_url || '', idDoc: currentUser?.id_doc_url || '' })
  const [uploading, setUploading] = useState('')

  async function handleUpload(type: 'selfie' | 'id_document', file: File){
    if(!userId){ alert('No user'); return }
    if(!isValidSAID(idNumber)){
      alert('Enter valid 13-digit SA ID Number first')
      return
    }
    if(!phone || phone.length < 10){
      alert('Enter cellphone number first (10 digits)')
      return
    }
    setUploading(type)
    const path = `${userId}/${type}_${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, file, { upsert: true })
    if(upErr){ alert(upErr.message); setUploading(''); return }
    const { data } = supabase.storage.from('driver-documents').getPublicUrl(path)
    const url = data.publicUrl

    await supabase.from('passenger_documents').upsert({
      passenger_id: userId,
      doc_type: type,
      file_url: url,
      id_number: idNumber,
      phone: phone,
      status: 'approved'
    } as any, { onConflict: 'passenger_id,doc_type' })

    await supabase.from('profiles').update({
      id_number: idNumber,
      phone: phone,
      selfie_url: type==='selfie'? url : files.selfie || undefined,
      id_doc_url: type==='id_document'? url : files.idDoc || undefined,
      is_verified: true
    } as any).eq('id', userId)

    if(type==='selfie') setFiles(f=>({...f, selfie: url}))
    else setFiles(f=>({...f, idDoc: url}))
    setUploading('')
  }

  const allDone = files.selfie && files.idDoc

  return (
    <div style={{ background:'#0e0e10', minHeight:'100vh', color:'white', padding:'16px', fontFamily:'system-ui' }}>
      <button onClick={onBack} style={{ background:'none', border:'none', color:'#9ca3af', marginBottom:'12px' }}>← Back</button>
      <h2 style={{fontWeight:700, fontSize:'20px'}}>Passenger Verification - 4 Fields</h2>
      <p style={{color:'#9ca3af', fontSize:'13px', marginTop:'4px'}}>Bolt compliance for Limpopo: Selfie + ID Number + ID Doc + Cellphone</p>

      <div style={{marginTop:'20px', display:'flex', flexDirection:'column', gap:'12px'}}>
        <div style={{background:'#18181b', padding:'12px', borderRadius:'12px', border: phone.length>=10? '1px solid #00d181':'1px solid #333'}}>
          <label style={{fontSize:'12px', color:'#9ca3af'}}>4. Cellphone No *</label>
          <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))} maxLength={10} placeholder="0712345678" style={{width:'100%', marginTop:'6px', padding:'12px', borderRadius:'8px', background:'#242428', color:'white', border:'none', fontSize:'16px'}}/>
        </div>

        <div style={{background:'#18181b', padding:'12px', borderRadius:'12px', border: isValidSAID(idNumber)? '1px solid #00d181':'1px solid #333'}}>
          <label style={{fontSize:'12px', color:'#9ca3af'}}>2. ID Number (13 digits) *</label>
          <input value={idNumber} onChange={e=>setIdNumber(e.target.value.replace(/\D/g,''))} maxLength={13} placeholder="9601015800084" style={{width:'100%', marginTop:'6px', padding:'12px', borderRadius:'8px', background:'#242428', color:'white', border:'none', fontSize:'16px'}}/>
          {isValidSAID(idNumber) && <div style={{color:'#00d181', fontSize:'11px', marginTop:'6px'}}>✓ Valid SA ID</div>}
        </div>

        <div style={{background:'#18181b', padding:'14px', borderRadius:'12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div><b>1. Selfie *</b><br/><span style={{fontSize:'11px', color:'#9ca3af'}}>{files.selfie?'Uploaded':'Face forward'}</span></div>
          <label style={{background: files.selfie?'#00d181':'white', color: files.selfie?'white':'black', padding:'10px 16px', borderRadius:'20px', cursor:'pointer', fontWeight:700}}>
            {uploading==='selfie'? '...': files.selfie?'✓ Done':'Upload'}
            <input type="file" hidden accept="image/*" capture="user" onChange={e=> e.target.files?.[0] && handleUpload('selfie', e.target.files[0])} />
          </label>
        </div>

        <div style={{background:'#18181b', padding:'14px', borderRadius:'12px', display:'flex', justifyContent:'space-between', alignItems:'center', opacity: isValidSAID(idNumber)?1:0.5}}>
          <div><b>3. ID Document *</b><br/><span style={{fontSize:'11px', color:'#9ca3af'}}>{files.idDoc?'Uploaded':'SA ID card'}</span></div>
          <label style={{background: files.idDoc?'#00d181':'white', color: files.idDoc?'white':'black', padding:'10px 16px', borderRadius:'20px', cursor:'pointer', fontWeight:700}}>
            {uploading==='id_document'? '...': files.idDoc?'✓ Done':'Upload'}
            <input type="file" hidden accept="image/*" onChange={e=> e.target.files?.[0] && handleUpload('id_document', e.target.files[0])} />
          </label>
        </div>
      </div>

      {allDone && <div style={{marginTop:'20px', background:'#00d181', color:'black', padding:'14px', borderRadius:'12px', textAlign:'center', fontWeight:700}}>✓ All 4 captured — Verified!</div>}
    </div>
  )
}

export default PassengerDocuments