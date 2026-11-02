import { supabase } from './supabase'

export function createRealtimeChannel(name: string) {
  return supabase.channel(name)
}
