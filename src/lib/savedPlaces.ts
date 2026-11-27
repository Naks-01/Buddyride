import { supabase } from './supabase'

export type SavedPlace = {
  id: string
  user_id: string
  label: 'Home' | 'Work' | 'Other'
  address: string
  coords: [number, number]
  created_at: string
}

function normalizeCoords(raw: any): [number, number] {
  if (Array.isArray(raw) && raw.length >= 2) return [Number(raw[0]), Number(raw[1])]
  if (raw && typeof raw === 'object') {
    const lng = raw.lng ?? raw.lon ?? raw.longitude ?? raw[0]
    const lat = raw.lat ?? raw.latitude ?? raw[1]
    if (lng != null && lat != null) return [Number(lng), Number(lat)]
  }
  return [29.4589, -23.9045] // Polokwane fallback, never crash
}

export async function getSavedPlaces(): Promise<SavedPlace[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('saved_places').select('*').eq('user_id', user.id).order('created_at')
  if (error) { console.error(error); return [] }
  return (data || []).map((d: any) => ({
    ...d,
    coords: normalizeCoords(d.coords),
  })) as SavedPlace[]
}

export async function addSavedPlace(label: 'Home' | 'Work' | 'Other', address: string, coords: [number, number]) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  if (!address?.trim()) throw new Error('Address required')
  if (!Array.isArray(coords) || coords.length < 2 || !isFinite(coords[0]) || !isFinite(coords[1])) throw new Error('Invalid coordinates')
  
  // Upsert instead of delete-then-insert (no data loss if insert fails)
  const { data, error } = await supabase.from('saved_places')
    .upsert(
      { user_id: user.id, label, address: address.trim(), coords: [coords[0], coords[1]] },
      { onConflict: 'user_id,label' }
    )
    .select().single()
  if (error) {
    // Fallback if unique constraint doesn't exist yet - old delete+insert
    if (label !== 'Other') {
      await supabase.from('saved_places').delete().eq('user_id', user.id).eq('label', label)
    }
    const { data: d2, error: e2 } = await supabase.from('saved_places').insert({ user_id: user.id, label, address: address.trim(), coords: [coords[0], coords[1]] }).select().single()
    if (e2) throw e2
    return d2
  }
  return data
}

export async function deleteSavedPlace(id: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  const { error } = await supabase.from('saved_places').delete().eq('id', id).eq('user_id', user.id)
  if (error) throw error
}