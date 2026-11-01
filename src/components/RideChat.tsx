import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

type RideMessage = {
  id: string
  ride_id: string
  sender_id: string
  message: string
  created_at: string
}

export function RideChat({ rideId, myId }: { rideId: string, myId: string }) {
  const [msgs, setMsgs] = useState<RideMessage[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id,ride_id,sender_id,message,created_at')
          .eq('ride_id', rideId)
          .order('created_at', { ascending: true })
        if (!active) return
        if (error) setError(`Could not load messages: ${error.message}`)
        else setMsgs(previous => {
          const messagesById = new Map((data || []).map(message => [message.id, message as RideMessage]))
          previous.forEach(message => messagesById.set(message.id, message))
          return [...messagesById.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
        })
      } catch (loadError) {
        if (active) setError(`Could not load messages: ${loadError instanceof Error ? loadError.message : 'Network request failed'}`)
      }
    }
    void load()

    const ch = supabase
      .channel(`chat-${rideId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ride_id=eq.${rideId}` }, 
        payload => {
          const incoming = payload.new as RideMessage
          setMsgs(prev => {
            if (prev.some(message => message.id === incoming.id)) return prev
            return [...prev, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at))
          })
        }
      )
      .subscribe((status, subscribeError) => {
        if (!active) return
        if (status === 'SUBSCRIBED') setError('')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(`Chat connection failed: ${subscribeError?.message || status}`)
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(ch)
    }
  }, [rideId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async () => {
    const message = text.trim()
    if (!message || sending || message.length > 2000) return
    setSending(true)
    setError('')
    try {
      const { data, error: sendError } = await supabase
        .from('messages')
        .insert({ ride_id: rideId, sender_id: myId, message })
        .select('id,ride_id,sender_id,message,created_at')
        .single()

      if (sendError) {
        setError(`Could not send message: ${sendError.message}`)
      } else if (data) {
        setMsgs(prev => prev.some(existing => existing.id === data.id)
          ? prev
          : [...prev, data as RideMessage].sort((a, b) => a.created_at.localeCompare(b.created_at)))
        setText('')
      }
    } catch (sendError) {
      setError(`Could not send message: ${sendError instanceof Error ? sendError.message : 'Network request failed'}`)
    } finally {
      setSending(false)
    }
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
      {error && <div role="alert" style={{ color: '#fca5a5', padding: '0 10px 6px', fontSize: '12px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', padding: '8px', borderTop: '1px solid #333' }}>
        <input value={text} maxLength={2000} disabled={sending} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} placeholder="Type message..." style={{ flex: 1, background: '#2a2a2a', border: 'none', borderRadius: '20px', padding: '10px 14px', color: 'white' }} />
        <button onClick={() => void send()} disabled={sending || !text.trim()} style={{ background: '#00d181', border: 'none', borderRadius: '20px', padding: '10px 16px', color: 'white', fontWeight: 'bold', opacity: sending || !text.trim() ? 0.6 : 1 }}>{sending ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  )
}