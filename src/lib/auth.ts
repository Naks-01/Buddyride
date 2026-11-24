import { supabase, type Profile, type Role } from './supabase'

// === ADMIN LOCK - ONLY THIS EMAIL IS ADMIN ===
export const ADMIN_EMAIL = 'buddyride@outlook.com'
export const isAdmin = (email?: string | null) => {
  return email?.toLowerCase().trim() === ADMIN_EMAIL
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function ensureProfile(userId: string, email: string | null, roleParam?: Role) {
  const normalizedEmail = email?.toLowerCase().trim() || null
  const existing = await getProfile(userId)
  if (existing) {
    localStorage.removeItem('buddyride_pending_role')
    return existing
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError

  const pendingRole = localStorage.getItem('buddyride_pending_role') as Role | null
  
  let selectedRole: Role
  if (roleParam === 'driver' || roleParam === 'passenger') {
    selectedRole = roleParam
  } else if (pendingRole === 'driver' || pendingRole === 'passenger') {
    selectedRole = pendingRole
  } else {
    selectedRole = user?.user_metadata?.role === 'driver' ? 'driver' : 'passenger'
  }

  const fullName = (user?.user_metadata?.full_name as string) || 'User'
  const phoneValue = (user?.user_metadata?.phone_number as string) || (user?.user_metadata?.phone as string) || ''
  
  const { data, error } = await supabase
   .from('profiles')
   .insert({
      id: userId,
      email: normalizedEmail,
      full_name: fullName,
      phone_number: phoneValue,
      phone: phoneValue,
      role: selectedRole,
      wallet_balance: 0,
      trips_completed: 0,
      // FIXED: was 5.0 - new user has NO rating, null = show "—"
      rating: null,
      is_online: false,
      // FIXED: was pending_verification for drivers - new driver must start
      // at not_started so App sends them to Onboarding, not Pending screen
      verification_status: 'not_started',
      is_verified: false,
      id_verified: false,
    } as any)
   .select()
   .single()

  if (error) {
    if ((error as any).code === '23505') {
      localStorage.removeItem('buddyride_pending_role')
      const retry = await getProfile(userId)
      if (retry) return retry
    }
    throw error
  }
  localStorage.removeItem('buddyride_pending_role')
  return data as Profile
}

export async function signIn(email: string, password: string) {
  localStorage.removeItem('buddyride_pending_role')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signUp(email: string, password: string, role: Exclude<Role, 'admin'>, fullName: string, phone: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (isAdmin(normalizedEmail)) {
    throw new Error('This email is reserved for admin. Use login, not signup.')
  }
  localStorage.setItem('buddyride_pending_role', role)
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: { data: { role, full_name: fullName.trim(), phone: formatSAPhone(phone), phone_number: formatSAPhone(phone) } },
  })
  if (error) {
    localStorage.removeItem('buddyride_pending_role')
    throw error
  }
  if (data.user) {
    try {
      // Only create profile if we have a session - if email confirmation is on,
      // getUser() will be null and App.loadProfile will create it on first login
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) await ensureProfile(data.user.id, normalizedEmail, role)
    } catch (e) {
      console.error('ensureProfile failed after signup:', e)
    }
  }
  return data.user
}

// FIXED: was `return true` stub - now actually checks last_selfie_date
// Returns true if selfie already taken TODAY (locked), false if allowed
export async function checkSelfieLock(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.from('profiles').select('last_selfie_date').eq('id', userId).maybeSingle()
    if (!data?.last_selfie_date) return false
    const today = new Date()
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
    return String((data as any).last_selfie_date).slice(0, 10) === todayStr
  } catch {
    return false
  }
}

export async function updateSelfieDate(userId: string, selfieUrl: string) {
  const now = new Date()
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
  const { error } = await supabase.from('profiles').update({
    last_selfie_date: today,
    last_selfie_url: selfieUrl
  } as any).eq('id', userId)
  if (error) throw error
}

export function formatSAPhone(phone: string): string {
  let p = phone.trim().replace(/[\s-]/g, '')
  if (p.startsWith('+')) return p
  if (p.startsWith('0')) return '+27' + p.slice(1)
  if (p.startsWith('27')) return '+' + p
  return p
}

export async function sendSmsOtp(phone: string): Promise<void> {
  const cleanPhone = formatSAPhone(phone)
  if (!/^\+27[0-9]{9}$/.test(cleanPhone)) throw new Error('Enter a valid South African mobile number.')
  const { data, error } = await supabase.functions.invoke('send-sms-otp', { body: { phone: cleanPhone } })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
}

export async function verifySmsOtp(phone: string, code: string): Promise<boolean> {
  const cleanPhone = formatSAPhone(phone)
  if (!/^\+27[0-9]{9}$/.test(cleanPhone) || !/^\d{6}$/.test(code.trim())) return false
  const { data, error } = await supabase.functions.invoke('verify-sms-otp', { body: { phone: cleanPhone, code: code.trim() } })
  if (error) throw new Error(error.message)
  if ((data as any)?.error) throw new Error((data as any).error)
  return (data as any)?.verified === true
}