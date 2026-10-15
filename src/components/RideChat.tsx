import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function RideChat({ rideId, myId }: { rideId: string, myId: string }) {
  const [msgs, setMsgs] = useState<any[]>([])
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('messages').select('*').eq('ride_id', rideId).order('created_at', { ascending: true }).then(({ data }) => setMsgs(data || []))

    const ch = supabase.channel(`chat-${rideId}`)
     .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `ride_id=eq.${rideId}` }, payload => {
        setMsgs(prev => [...prev, payload.new as any])
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [rideId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async () => {
    if (!text.trim()) return
    const t = text; setText('')
    await supabase.from('messages').insert({ ride_id: rideId, sender_id: myId, message: t })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '300px', background: '#1e1e1e', borderRadius: '12px' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {msgs.map(m => (
          <div key={m.id} style={{ alignSelf: m.sender_id === myId? 'flex-end' : 'flex-start', background: m.sender_id === myId? '#ff7a00' : '#2a2a2a', color: 'white', padding: '8px 12px', borderRadius: '16px', maxWidth: '75%', fontSize: '13px' }}>
            {m.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: '8px', padding: '8px', borderTop: '1px solid #333' }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type message..." style={{ flex: 1, background: '#2a2a2a', border: 'none', borderRadius: '20px', padding: '10px 14px', color: 'white' }} />
        <button onClick={send} style={{ background: '#00d181', border: 'none', borderRadius: '20px', padding: '10px 16px', color: 'white', fontWeight: 'bold' }}>Send</button>
      </div>
    </div>
  )
}