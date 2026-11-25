type IncomingRide = {
  id: string
  fare?: number | null
  pickup_address?: string | null
  dropoff_address?: string | null
  distance_km?: number | null
  duration_min?: number | null
  ride_category?: string | null
  payment_method?: string | null
}

export function IncomingRideSheet({ ride, countdown, onAccept, onDecline, theme = 'light' }: {
  ride: IncomingRide | null
  countdown: number
  onAccept: (id: string) => void
  onDecline: (id: string) => void
  theme?: 'dark' | 'light'
}) {
  // FIX: Guard null ride - was crashing on ride.fare when ride cleared mid-countdown
  if (!ride) return null

  const isDark = theme === 'dark'
  const fare = Number(ride.fare ?? 0)
  const urgent = countdown <= 5
  const bg = isDark ? '#171719' : 'white'
  const ink = isDark ? '#f8fafc' : '#111827'
  const soft = isDark ? '#242426' : '#f5f5f7'
  const muted = isDark ? '#a1a1aa' : '#667085'

  return (
    <div role="dialog" aria-modal="true" aria-label="New ride request" style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.85)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ background: bg, color: ink, borderRadius: 16, padding: 20, width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, color: urgent ? '#DC2626' : '#16A34A' }}>
          NEW RIDE • {Math.max(0, countdown)}s {urgent ? '— HURRY!' : ''}
        </div>
        {/* FIX: Progress bar - driver sees time left, was just a number */}
        <div style={{ height: 6, borderRadius: 3, background: soft, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(100, (countdown / 30) * 100))}%`, height: '100%', background: urgent ? '#DC2626' : '#0066FF', transition: 'width 1s linear' }} />
        </div>
        <h1 style={{ fontSize: 44, margin: '12px 0' }}>R{fare.toFixed(2)}</h1>
        {ride.distance_km != null && (
          <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>
            {Number(ride.distance_km).toFixed(1)} km{ride.duration_min != null ? ` • ~${Math.round(Number(ride.duration_min))} min` : ''}{ride.ride_category ? ` • ${ride.ride_category}` : ''}{ride.payment_method ? ` • ${ride.payment_method === 'cash' ? 'Cash' : ride.payment_method === 'card' ? 'Card' : ride.payment_method}` : ''}
          </div>
        )}
        <div style={{ textAlign: 'left', fontSize: 13, padding: 10, background: soft, borderRadius: 10, lineHeight: 1.5 }}>
          📍 {ride.pickup_address || 'Pickup location'}
          <br />🏁 {ride.dropoff_address || 'Drop-off location'}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={() => onDecline(ride.id)} style={{ flex: 1, padding: 14, borderRadius: 12, background: isDark ? '#242426' : '#eee', color: ink, border: 0, cursor: 'pointer', fontWeight: 700 }}>Decline</button>
          <button onClick={() => onAccept(ride.id)} style={{ flex: 2, padding: 14, borderRadius: 12, background: '#0066FF', color: 'white', border: 0, fontWeight: 900, cursor: 'pointer' }}>Accept R{fare.toFixed(2)}</button>
        </div>
      </div>
    </div>
  )
}
export default IncomingRideSheet