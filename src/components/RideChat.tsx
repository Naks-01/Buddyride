import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function RideChat({ rideId, myId }: { rideId: string, myId: string }) {
  const [msgs, setMsgs] = useState<any[]>([])
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rideId) return;
    
    const load = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('ride_id', rideId)
        .order('created_at', { ascending: true })
      
      if (error) console.log("LOAD ERROR:", error);
      else setMsgs(data || []);
    }
    load();

    const ch = supabase
      .channel(`chat-${rideId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ride_id=eq.${rideId}` }, 
        payload => {
          setMsgs(prev => {
            // avoid duplicate if we already added optimistically
            if (prev.find(p => p.id === (payload.new as any).id)) return prev;
            return [...prev, payload.new as any];
          });
        }
      )
      .subscribe((status) => console.log("CHAT CHANNEL:", status, rideId))

    return () => { supabase.removeChannel(ch) }
  }, [rideId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async () => {
    if (!text.trim() || !rideId) return;
    const t = text.trim();
    
    // optimistic - show immediately
    const tempId = Date.now().toString();
    const optimisticMsg = { id: tempId, ride_id: rideId, sender_id: myId, message: t, text: t, created_at: new Date().toISOString() };
    setMsgs(prev => [...prev, optimisticMsg]);
    setText('');

    // try both column names - your table might use text or message
    const { data, error } = await supabase
      .from('messages')
      .insert({ ride_id: rideId, sender_id: myId, message: t })
      .select()
      .single();

    if (error) {
      console.log("SEND ERROR:", error);
      // remove optimistic and restore text
      setMsgs(prev => prev.filter(m => m.id !== tempId));
      setText(t);
      alert("Send failed: " + error.message + " — check RLS or column name");
    } else {
      // replace temp with real
      setMsgs(prev => prev.map(m => m.id === tempId ? data : m));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '300px', background: '#1e1e1e', borderRadius: '12px' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {msgs.map(m => (
          <div key={m.id} style={{ alignSelf: m.sender_id === myId? 'flex-end' : 'flex-start', background: m.sender_id === myId? '#ff7a00' : '#2a2a2a', color: 'white', padding: '8px 12px', borderRadius: '16px', maxWidth: '75%', fontSize: '13px' }}>
            {m.message || m.text}
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