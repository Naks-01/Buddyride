import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function PanicButton({ rideId, lat, lng, userId }: { rideId: string, lat?: number | null, lng?: number | null, userId?: string }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function panic() {
    // FIX: Double-tap guard - was inserting duplicate emergency_logs + opening 2x WhatsApp
    if (sending || sent) return
    setSending(true)
    setError('')
    try {
      // FIX: Validate coords - was logging lat/lng = undefined / NaN
      const validLat = typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null
      const validLng = typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null
      const { data: { user } } = await supabase.auth.getUser()
      const { error: logError } = await supabase.from('emergency_logs').insert({
        ride_id: rideId || null,
        user_id: userId || user?.id || null,
        lat: validLat,
        lng: validLng,
        status: 'triggered',
        // FIX: Timestamp + source - was no way to know when / from where SOS came
        created_at: new Date().toISOString(),
        source: 'panic_button',
      } as any)
      if (logError) throw logError
      setSent(true)
      const loc = validLat != null && validLng != null
        ? `https://www.google.com/maps?q=${validLat},${validLng}`
        : 'Location unavailable - open BuddyRide app'
      const msg = `🚨 BUDDYRIDE EMERGENCY! Trip ${rideId || 'unknown'} ${loc} - Please help. I need emergency assistance.`
      // FIX: Don't use window.location.href = tel: - it unloads page and kills WhatsApp share.
      // Open dialer in a way that doesn't kill the page, then WhatsApp as backup.
      const a = document.createElement('a')
      a.href = 'tel:10111'
      a.click()
      // FIX: WhatsApp share as fallback - delayed so dialer opens first, but page stays alive
      setTimeout(() => window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'), 800)
    } catch (e: any) {
      // FIX: Even if DB log fails, STILL call 10111 - safety must never depend on Supabase
      setError('Could not log emergency - calling 10111 anyway.')
      const a = document.createElement('a')
      a.href = 'tel:10111'
      a.click()
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => void panic()}
        disabled={sending || sent}
        aria-label="Emergency SOS - call 10111"
        style={{ width: '100%', background: sent ? '#16A34A' : '#DC2626', color: 'white', border: 0, borderRadius: 12, padding: 14, fontWeight: 900, cursor: sending || sent ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}
      >
        {sent ? '✅ SOS SENT - HELP CALLED' : sending ? 'Sending SOS…' : '🆘 EMERGENCY SOS'}
      </button>
      {error && <p role="alert" style={{ color: '#DC2626', fontSize: 12, marginTop: 6, textAlign: 'center' }}>{error}</p>}
      {sent && <p style={{ color: '#067647', fontSize: 12, marginTop: 6, textAlign: 'center' }}>Emergency logged. Dialling 10111 + WhatsApp share opened. Stay safe.</p>}
    </div>
  )
}
export default PanicButton