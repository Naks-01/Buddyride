import { supabase } from './supabase'

// FIX: Never reuse a subscribed channel. Supabase throws:
// "tried to join multiple times, join can only be called a single time per channel instance"
// So we always remove the old one first, then create a fresh one.
const channels = new Map<string, ReturnType<typeof supabase.channel>>()

export function createRealtimeChannel(name: string) {
  // 1. Remove old cached one if exists
  const old = channels.get(name)
  if (old) {
    try { supabase.removeChannel(old) } catch {}
    channels.delete(name)
  }
  // 2. Also remove any Supabase-internal channel with same topic
  try {
    const existing = (supabase as any).getChannels?.()?.find((c: any) => c.topic === `realtime:${name}` || c.topic === name)
    if (existing) supabase.removeChannel(existing)
  } catch {}

  // 3. Create fresh channel every time
  const channel = supabase.channel(name)
  channels.set(name, channel)
  return channel
}

export function removeRealtimeChannel(name: string) {
  const channel = channels.get(name)
  if (channel) {
    try { supabase.removeChannel(channel) } catch {}
    channels.delete(name)
  }
}

export function removeAllRealtimeChannels() {
  for (const [name, channel] of [...channels]) {
    try { supabase.removeChannel(channel) } catch {}
    channels.delete(name)
  }
}

// Helper: Subscribe to one ride's status changes
export function subscribeToRide(
  rideId: string,
  onUpdate: (payload: any) => void,
) {
  const name = `ride-${rideId}`
  removeRealtimeChannel(name)
  const channel = createRealtimeChannel(name)
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
    onUpdate,
  )
  channel.subscribe()
  return () => removeRealtimeChannel(name)
}

// Helper: Subscribe to driver location for a ride
export function subscribeToDriverLocation(
  driverId: string,
  onUpdate: (payload: any) => void,
) {
  const name = `driver-location-${driverId}`
  removeRealtimeChannel(name)
  const channel = createRealtimeChannel(name)
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${driverId}` },
    onUpdate,
  )
  channel.subscribe()
  return () => removeRealtimeChannel(name)
}