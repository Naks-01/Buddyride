import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createRealtimeChannel } from '../lib/realtime'

export function useNearbyCars() {
  const [nearbyCars, setNearbyCars] = useState<any[]>([])
  useEffect(() => {
    supabase.from('driver_status').select('*').eq('is_online', true).gt('updated_at', new Date(Date.now() - 5*60*1000).toISOString()).then(({data})=>data&&setNearbyCars(data))
    const ch = createRealtimeChannel('buddyride-cars-live').on('postgres_changes', {event:'*', schema:'public', table:'driver_status'}, p=>{
      const car=p.new as any; if(!car) return
      if(car.is_online) setNearbyCars(prev=> prev.find(c=>c.driver_id===car.driver_id) ? prev.map(c=>c.driver_id===car.driver_id?car:c) : [...prev,car])
      else setNearbyCars(prev=>prev.filter(c=>c.driver_id!==car.driver_id))
    }).subscribe()
    return ()=>{ supabase.removeChannel(ch) }
  }, [])
  return nearbyCars
}