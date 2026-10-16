import { useState } from 'react'
import { supabase } from '../lib/supabase'

function isValidSAID(id: string){
  if(!/^\d{13}$/.test(id)) return false
  let sum=0, alt=false
  for(let i=id.length-1;i>=0;i--){
    let n=parseInt(id[i]); if(alt){n*=2; if(n>9)n-=9} sum+=n; alt=!alt
  }
  return sum%10===0
}

export default function PassengerDocuments({ user }: any){
  const [idNumber, setIdNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState({selfie: '', idDoc: ''})
  const [uploading, setUploading] = useState('')

  async function handleUpload(type: 'selfie' | 'id_document', file: File){
    if(!isValidSAID(idNumber)){
      alert('First enter valid 13-digit SA ID Number')
      return
    }
    if(!phone || phone.length < 10){
      alert('First enter cellphone number')
      return
    }
    setUploading(type)
    const path = `${user.id}/${type}_${Date.now()}.jpg`

    const { error: upErr } = await supabase.storage.from('driver-documents').upload(path, file)
    if(upErr){ alert(upErr.message); setUploading(''); return }

    const { data } = supabase.storage.from('driver-documents').getPublicUrl(path)

    // save to passenger_documents
    await supabase.from('passenger_documents').upsert({
      passenger_id: user.id,
      doc_type: type,
      file_url: data.publicUrl,
      id_number: idNumber,
      phone: phone,
      status: 'approved'
    } as any, { onConflict: 'passenger_id,doc_type' })

    // save to profiles for Admin + compliance
    await supabase.from('profiles').upsert({
      id: user.id,
      id_number: idNumber,
      phone: phone,
      selfie_url: type==='selfie'? data.publicUrl : undefined,
      id_doc_url: type==='id_document'? data.publicUrl : undefined,
      is_verified: true
    } as any)

    setStatus(s=> ({...s, [type==='selfie'?'selfie':'idDoc']: 'done'}))
    setUploading('')
  }

  const allDone = status.selfie && status.idDoc

  return (
    <div style={{ background:'#0e0e10', minHeight:'100vh', color:'white', padding:'16px', fontFamily:'system-ui' }}>
      <h2 style={{fontWeight:700}}>Passenger Verification</h2>
      <p style={{color:'#9ca3af', fontSize:'13px'}}>Required to ride in whole Limpopo (like Bolt)</p>

      <div style={{marginTop:'20px', display:'flex', flexDirection:'column', gap:'12px'}}>

        <div style={{background:'#18181b', padding:'12px', borderRadius:'12px', border: phone.length>=10? '1px solid #00d181':'1px solid #333'}}>
          <label style={{fontSize:'12px', color:'#9ca3af'}}>4. Cellphone No *</label>
          <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))}
            placeholder="0712345678" style={{width:'100%', marginTop:'6px', padding:'12px', borderRadius:'8px', background:'#242428', color:'white', border:'none', fontSize:'16px'}}/>
        </div>

        <div style={{background:'#18181b', padding:'12px', borderRadius:'12px', border: isValidSAID(idNumber)? '1px solid #00d181':'1px solid #333'}}>
          <label style={{fontSize:'12px', color:'#9ca3af'}}>2. ID Number *</label>
          <input value={idNumber} onChange={e=>setIdNumber(e.target.value.replace(/\D/g,''))} maxLength={13}
            placeholder="e.g. 9601015800084" style={{width:'100%', marginTop:'6px', padding:'12px', borderRadius:'8px', background:'#242428', color:'white', border:'none', fontSize:'16px'}}/>
          {isValidSAID(idNumber) && <span style={{color:'#00d181', fontSize:'11px'}}>✓ Valid SA ID format</span>}
        </div>

        <div style={{background:'#18181b', padding:'14px', borderRadius:'12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div><b>1. Selfie *</b><br/><span style={{fontSize:'11px', color:'#9ca3af'}}>Face forward</span></div>
          <label style={{background: status.selfie?'#00d181':'white', color: status.selfie?'white':'black', padding:'10px 16px', borderRadius:'20px', cursor:'pointer', fontWeight:700}}>
            {uploading==='selfie'? '...': status.selfie?'✓ Done':'Upload'}
            <input type="file" hidden accept="image/*" capture="user" onChange={e=> e.target.files?.[0] && handleUpload('selfie', e.target.files[0])} />
          </label>
        </div>

        <div style={{background:'#18181b', padding:'14px', borderRadius:'12px', display:'flex', justifyContent:'space-between', alignItems:'center', opacity: isValidSAID(idNumber)?1:0.6}}>
          <div><b>3. ID Document *</b><br/><span style={{fontSize:'11px', color:'#9ca3af'}}>SA ID card/book</span></div>
          <label style={{background: status.idDoc?'#00d181':'white', color: status.idDoc?'white':'black', padding:'10px 16px', borderRadius:'20px', cursor:'pointer', fontWeight:700}}>
            {uploading==='id_document'? '...': status.idDoc?'✓ Done':'Upload'}
            <input type="file" hidden accept="image/*" onChange={e=> e.target.files?.[0] && handleUpload('id_document', e.target.files[0])} />
          </label>
        </div>
      </div>

      {allDone && <div style={{marginTop:'20px', background:'#00d181', color:'black', padding:'14px', borderRadius:'12px', textAlign:'center', fontWeight:700}}>✓ All 4 captured — Verified!</div>}
    </div>
  )
}