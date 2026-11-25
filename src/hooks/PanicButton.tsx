import { supabase } from '../lib/supabase'
export function PanicButton({ rideId, lat, lng }: { rideId: string, lat: number, lng: number }) {
  async function panic() {
    await supabase.from('emergency_logs').insert({ ride_id: rideId, lat, lng })
    const msg = `🚨 BUDDYRIDE EMERGENCY! Trip ${rideId} https://www.google.com/maps?q=${lat},${lng}`
    window.location.href = 'tel:10111'
    setTimeout(()=> window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank'), 600)
  }
  return <button onClick={panic} style={{width:'100%',background:'#DC2626',color:'white',border:0,borderRadius:12,padding:14,fontWeight:900}}>🆘 EMERGENCY SOS</button>
}