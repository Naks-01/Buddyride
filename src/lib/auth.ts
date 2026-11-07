import { supabase, type Profile, type Role } from './supabase'

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function ensureProfile(userId: string, email: string | null) {
  const existing = await getProfile(userId)
  if (existing) return existing
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const selectedRole: Role = user?.id === userId && user.user_metadata?.role === 'driver'
    ? 'driver'
    : 'passenger'
  const { data, error } = await supabase
   .from('profiles')
   .insert({
      id: userId,
      email,
      role: selectedRole,
      wallet_balance: 0,
      trips_completed: 0,
      rating: 5.0,
      is_online: false,
      // FIXED: Was missing - null verification_status broke pending checks
      verification_status: 'not_started',
      is_verified: false,
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

export async function signUp(email: string, password: string, role: Exclude<Role, 'admin'>, fullName: string, phone: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { role, full_name: fullName.trim(), phone: phone.trim(), phone_number: phone.trim() } },
  })
  if (error) throw error
  if (data.user) {
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      email: normalizedEmail,
      role,
      full_name: fullName.trim(),
      phone: phone.trim(),
      phone_number: phone.trim(),
      wallet_balance: 0,
      trips_completed: 0,
      rating: 5.0,
      is_online: false,
      // FIXED: Was 'pending' - blocked safety modal. Must match App.tsx + PassengerHome
      verification_status: 'not_started',
      is_verified: false,
    } as any, { onConflict: 'id' })
    if (profileError && data.session) throw profileError
  }
  return data.user
}

// Selfie lock - Monday & Saturday (drivers & passengers)
export async function checkSelfieLock(userId: string): Promise<boolean> {
  const now = new Date()
  const day = now.getDay() // 1=Monday, 6=Saturday
  const isLockDay = (day === 1 || day === 6)
  if (!isLockDay) return true

  const { data } = await supabase
  .from('profiles')
  .select('last_selfie_date')
  .eq('id', userId)
  .single()

  // FIXED: Use local SA date, not UTC. toISOString() is UTC - in Polokwane at 01:00, UTC is still yesterday
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  if (data?.last_selfie_date === today) return true

  return false
}

export async function updateSelfieDate(userId: string, selfieUrl: string) {
  // FIXED: Same local date fix
  const now = new Date()
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  const { error } = await supabase.from('profiles').update({
    last_selfie_date: today,
    last_selfie_url: selfieUrl
  } as any).eq('id', userId)
  if (error) throw error
}