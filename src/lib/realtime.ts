import { supabase } from './supabase'

const channels = new Map<string, ReturnType<typeof supabase.channel>>()

export function createRealtimeChannel(name: string) {
  const old = channels.get(name)
  if (old) {
    try { void supabase.removeChannel(old) } catch {}
    channels.delete(name)
  }
  try {
    const existing = (supabase as any).getChannels?.()?.find((c: any) => c.topic === `realtime:${name}` || c.topic === name)
    if (existing) void supabase.removeChannel(existing)
  } catch {}
  const channel = supabase.channel(name)
  channels.set(name, channel)
  return channel
}

export function removeRealtimeChannel(name: string) {
  const channel = channels.get(name)
  if (channel) {
    try { void supabase.removeChannel(channel) } catch {}
    channels.delete(name)
  }
  // FIX: Also remove Supabase-internal channel with same topic - was leaking on fast unmount/remount
  try {
    const existing = (supabase as any).getChannels?.()?.find((c: any) => c.topic === `realtime:${name}` || c.topic === name)
    if (existing) void supabase.removeChannel(existing)
  } catch {}
}

export function removeAllRealtimeChannels() {
  for (const [name, channel] of [...channels]) {
    try { void supabase.removeChannel(channel) } catch {}
    channels.delete(name)
  }
}

export function subscribeToRide(
  rideId: string,
  onUpdate: (payload: any) => void,
) {
  // FIX: Empty rideId guard - was subscribing to "id=eq." and getting every ride update
  if (!rideId) return () => {}
  const name = `ride-${rideId}`
  removeRealtimeChannel(name)
  const channel = createRealtimeChannel(name)
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
    onUpdate,
  )
  channel.subscribe()
  let cleaned = false
  return () => { if (!cleaned) { cleaned = true; removeRealtimeChannel(name) } }
}

export function subscribeToDriverLocation(
  driverId: string,
  onUpdate: (payload: any) => void,
) {
  if (!driverId) return () => {}
  const name = `driver-location-${driverId}`
  removeRealtimeChannel(name)
  const channel = createRealtimeChannel(name)
  channel.on(
    'postgres_changes',
    // FIX: Was listening to `profiles` - driver location lives in `driver_locations`, so map never moved
    { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
    onUpdate,
  )
  channel.subscribe()
  let cleaned = false
  return () => { if (!cleaned) { cleaned = true; removeRealtimeChannel(name) } }
}

// FIX: New helper - was no way to listen for new ride requests, driver had to poll
export function subscribeToDriverRequests(
  driverId: string,
  onInsert: (payload: any) => void,
) {
  if (!driverId) return () => {}
  const name = `driver-requests-${driverId}`
  removeRealtimeChannel(name)
  const channel = createRealtimeChannel(name)
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'rides', filter: `driver_id=eq.${driverId}` },
    onInsert,
  )
  channel.subscribe()
  let cleaned = false
  return () => { if (!cleaned) { cleaned = true; removeRealtimeChannel(name) } }
}