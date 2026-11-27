import { supabase } from './supabase'

export type SavedPlace = {
  id: string
  user_id: string
  label: 'Home' | 'Work' | 'Other'
  address: string
  coords: [number, number]
  created_at: string
}

export async function getSavedPlaces(): Promise<SavedPlace[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('saved_places').select('*').eq('user_id', user.id).order('created_at')
  if (error) { console.error(error); return [] }
  return data as SavedPlace[]
}

export async function addSavedPlace(label: 'Home' | 'Work' | 'Other', address: string, coords: [number, number]) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  // Replace if Home/Work already exists
  if (label !== 'Other') {
    await supabase.from('saved_places').delete().eq('user_id', user.id).eq('label', label)
  }
  const { data, error } = await supabase.from('saved_places').insert({ user_id: user.id, label, address, coords }).select().single()
  if (error) throw error
  return data
}

export async function deleteSavedPlace(id: string) {
  const { error } = await supabase.from('saved_places').delete().eq('id', id)
  if (error) throw error
}