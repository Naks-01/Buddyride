import { supabase, type Profile, type Role } from './supabase'

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function ensureProfile(userId: string, email: string | null) {
  const existing = await getProfile(userId)
  if (existing) return existing
  const { data, error } = await supabase
    .from('profiles')
    .insert({ 
      id: userId, 
      email, 
      role: 'passenger',
      wallet_balance: 0,
      trips_completed: 0,
      rating: 5.0,
      is_online: false
    } as any)
    .select()
    .single()
  if (error) throw error
  return data as Profile
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signUp(email: string, password: string, role: Role, fullName: string, phone: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, full_name: fullName, phone } },
  })
  if (error) throw error
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id, 
      email, 
      role, 
      full_name: fullName, 
      phone,
      wallet_balance: 0,
      trips_completed: 0,
      rating: 5.0,
      is_online: false
    } as any, { onConflict: 'id' })
  }
  return data.user
}