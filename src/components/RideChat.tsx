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
    // FIXED: clear old ride's messages on ride change - was merging A + B
    setMsgs([])
    setError('')
    setText('')
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id,ride_id,sender_id,message,created_at')
          .eq('ride_id', rideId)
          .order('created_at', { ascending: true })
        if (!active) return
        if (error) setError(`Could not load messages: ${error.message}`)
        else setMsgs((data || []) as RideMessage[])
      } catch (loadError) {
        if (active) setError(`Could not load messages: ${loadError instanceof Error ? loadError.message : 'Network request failed'}`)
      }
    }
    void load()

    const ch = supabase.channel(`chat-${rideId}-${Date.now()}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ride_id=eq.${rideId}` },
        payload => {
          const incoming = payload.new as RideMessage
          // FIXED: ignore messages for other rides - filter can leak on reconnect
          if (incoming.ride_id !== rideId) return
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
    // FIXED: optimistic UI - message appears instantly, removed if insert fails
    const tempId = `temp-${Date.now()}`
    const optimistic: RideMessage = { id: tempId, ride_id: rideId, sender_id: myId, message, created_at: new Date().toISOString() }
    setMsgs(prev => [...prev, optimistic])
    setText('')
    try {
      const { data, error: sendError } = await supabase
        .from('messages')
        .insert({ ride_id: rideId, sender_id: myId, message })
        .select('id,ride_id,sender_id,message,created_at')
        .single()

      if (sendError) {
        setMsgs(prev => prev.filter(m => m.id !== tempId))
        setText(message)
        setError(`Could not send message: ${sendError.message}`)
      } else if (data) {
        setMsgs(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempId)
          if (withoutTemp.some(existing => existing.id === data.id)) return withoutTemp
          return [...withoutTemp, data as RideMessage].sort((a, b) => a.created_at.localeCompare(b.created_at))
        })
      }
    } catch (sendError) {
      setMsgs(prev => prev.filter(m => m.id !== tempId))
      setText(message)
      setError(`Could not send message: ${sendError instanceof Error ? sendError.message : 'Network request failed'}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#1e1e1e', borderRadius: '12px' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
        {msgs.length === 0 && <div style={{ color: '#999', fontSize: 12, textAlign: 'center', marginTop: 20 }}>No messages yet — say hi to your driver / passenger 👋</div>}
        {msgs.map(m => (
          <div key={m.id} style={{ alignSelf: m.sender_id === myId? 'flex-end' : 'flex-start', background: m.sender_id === myId? '#ff7a00' : '#2a2a2a', color: 'white', padding: '8px 12px', borderRadius: '16px', maxWidth: '75%', fontSize: '13px', overflowWrap: 'anywhere', opacity: m.id.startsWith('temp-') ? 0.6 : 1 }}>
            {m.message}
            <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2, textAlign: 'right' }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <div role="alert" style={{ color: '#fca5a5', padding: '0 10px 6px', fontSize: '12px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', padding: '8px', borderTop: '1px solid #333', alignItems: 'center' }}>
        <input value={text} maxLength={2000} disabled={sending} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} placeholder="Type message..." style={{ flex: 1, height: 44, marginTop: 0, background: '#2a2a2a', border: 'none', borderRadius: '20px', padding: '10px 14px', color: 'white' }} />
        <button onClick={() => void send()} disabled={sending || !text.trim()} style={{ background: '#00d181', border: 'none', borderRadius: '20px', padding: '10px 16px', color: 'white', fontWeight: 'bold', opacity: sending || !text.trim() ? 0.6 : 1, minHeight: 44 }}>{sending ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  )
}