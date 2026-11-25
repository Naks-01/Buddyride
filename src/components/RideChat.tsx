import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

type RideMessage = {
  id: string
  ride_id: string
  sender_id: string
  message: string
  created_at: string
}

export function RideChat({ rideId, myId, theme = 'light' }: { rideId: string, myId: string, theme?: 'dark' | 'light' }) {
  const [msgs, setMsgs] = useState<RideMessage[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastSendRef = useRef(0)

  const isDark = theme === 'dark'
  const bg = isDark ? '#1e1e1e' : '#ffffff'
  const bubbleMine = '#0066FF'
  const bubbleOther = isDark ? '#2a2a2a' : '#F2F4F7'
  const textMine = '#ffffff'
  const textOther = isDark ? '#ffffff' : '#111827'
  const inputBg = isDark ? '#2a2a2a' : '#F2F4F7'
  const inputText = isDark ? '#ffffff' : '#111827'
  const border = isDark ? '#333333' : '#E4E7EC'
  const muted = isDark ? '#999999' : '#667085'

  useEffect(() => {
    let active = true
    setMsgs([])
    setError('')
    setText('')
    // FIX: Guard empty rideId - was querying messages with ride_id = '' / undefined
    if (!rideId) { setError('No ride selected'); return }
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id,ride_id,sender_id,message,created_at')
          .eq('ride_id', rideId)
          .order('created_at', { ascending: true })
          .limit(200)
        if (!active) return
        if (error) setError(`Could not load messages: ${error.message}`)
        else setMsgs((data || []) as RideMessage[])
      } catch (loadError) {
        if (active) setError(`Could not load messages: ${loadError instanceof Error ? loadError.message : 'Network request failed'}`)
      }
    }
    void load()

    const ch = supabase.channel(`chat-${rideId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ride_id=eq.${rideId}` },
        payload => {
          const incoming = payload.new as RideMessage
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
    if (!message || sending || message.length > 2000 || !rideId || !myId) return
    // FIX: Rate limit 1 msg / 1s - was spam-able, floods driver + DB
    const now = Date.now()
    if (now - lastSendRef.current < 1000) { setError('Slow down - wait 1 second between messages'); return }
    lastSendRef.current = now
    setSending(true)
    setError('')
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: bg, borderRadius: '12px', border: `1px solid ${border}` }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
        {msgs.length === 0 && <div style={{ color: muted, fontSize: 12, textAlign: 'center', marginTop: 20 }}>No messages yet — say hi to your driver / passenger 👋</div>}
        {msgs.map(m => {
          const mine = m.sender_id === myId
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', background: mine ? bubbleMine : bubbleOther, color: mine ? textMine : textOther, padding: '8px 12px', borderRadius: '16px', maxWidth: '75%', fontSize: '13px', overflowWrap: 'anywhere', opacity: m.id.startsWith('temp-') ? 0.6 : 1 }}>
              {m.message}
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2, textAlign: 'right' }}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      {error && <div role="alert" style={{ color: isDark ? '#fca5a5' : '#B42318', padding: '0 10px 6px', fontSize: '12px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', padding: '8px', borderTop: `1px solid ${border}`, alignItems: 'center' }}>
        <input value={text} maxLength={2000} disabled={sending} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} placeholder="Type message..." style={{ flex: 1, height: 44, marginTop: 0, background: inputBg, border: 'none', borderRadius: '20px', padding: '10px 14px', color: inputText }} />
        <button onClick={() => void send()} disabled={sending || !text.trim()} style={{ background: '#0066FF', border: 'none', borderRadius: '20px', padding: '10px 16px', color: 'white', fontWeight: 'bold', opacity: sending || !text.trim() ? 0.6 : 1, minHeight: 44, cursor: sending || !text.trim() ? 'not-allowed' : 'pointer' }}>{sending ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  )
}
export default RideChat