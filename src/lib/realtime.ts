import { supabase } from './supabase'

// FIX: Cache channels by name - old code created a NEW channel every render -> duplicate events, duplicate toasts, driver marker jumping
const channels = new Map<string, ReturnType<typeof supabase.channel>>()

export function createRealtimeChannel(name: string) {
  const existing = channels.get(name)
  if (existing) return existing
  const channel = supabase.channel(name)
  channels.set(name, channel)
  return channel
}

export function removeRealtimeChannel(name: string) {
  const channel = channels.get(name)
  if (channel) {
    supabase.removeChannel(channel)
    channels.delete(name)
  }
}

export function removeAllRealtimeChannels() {
  for (const [name, channel] of channels) {
    supabase.removeChannel(channel)
    channels.delete(name)
  }
}

// Helper: Subscribe to one ride's status changes - use this in PassengerHome / DriverHome instead of raw channel
export function subscribeToRide(
  rideId: string,
  onUpdate: (payload: any) => void,
) {
  const name = `ride-${rideId}`
  // FIX: Remove old channel first, otherwise .on() stacks up and you get duplicate events
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
  // FIX: Same - remove old first
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