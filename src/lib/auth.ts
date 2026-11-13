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

export async function ensureProfile(userId: string, email: string | null) {
  const normalizedEmail = email?.toLowerCase().trim() || null
  const existing = await getProfile(userId)
  if (existing) {
    if (isAdmin(normalizedEmail) && existing.role !== 'admin') {
      const { data } = await supabase
        .from('profiles')
        .update({ role: 'admin', verification_status: 'verified', is_verified: true } as any)
        .eq('id', userId)
        .select()
        .single()
      localStorage.removeItem('buddyride_pending_role')
      return (data as Profile) || existing
    }
    if (!isAdmin(normalizedEmail) && existing.role === 'admin') {
      const { data } = await supabase
        .from('profiles')
        .update({ role: 'passenger' } as any)
        .eq('id', userId)
        .select()
        .single()
      return (data as Profile) || existing
    }
    const pendingRole = localStorage.getItem('buddyride_pending_role') as Role | null
    if (pendingRole === 'driver' && existing.role === 'passenger') {
      const { data } = await supabase
        .from('profiles')
        .update({ role: 'driver', verification_status: 'not_started' } as any)
        .eq('id', userId)
        .select()
        .single()
      localStorage.removeItem('buddyride_pending_role')
      return (data as Profile) || existing
    }
    localStorage.removeItem('buddyride_pending_role')
    return existing
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const pendingRole = localStorage.getItem('buddyride_pending_role') as Role | null
  let selectedRole: Role
  if (isAdmin(normalizedEmail)) {
    selectedRole = 'admin'
  } else {
    selectedRole = 
      (pendingRole === 'driver' ? 'driver' : null) ||
      (user?.user_metadata?.role === 'driver' ? 'driver' : 'passenger')
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
      rating: 5.0,
      is_online: false,
      verification_status: isAdmin(normalizedEmail) ? 'verified' : 'not_started',
      is_verified: isAdmin(normalizedEmail) ? true : false,
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
      await ensureProfile(data.user.id, normalizedEmail)
    } catch (e) {
      console.error('ensureProfile failed after signup:', e)
    }
  }
  return data.user
}

export async function checkSelfieLock(userId: string): Promise<boolean> {
  return true
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

// ===== REAL SMS OTP - SMSMessenger Integration =====
// 0821234567 -> +27821234567 | +27821234567 stays same | 27821234567 -> +27821234567
export function formatSAPhone(phone: string): string {
  let p = phone.trim().replace(/[\s-]/g, '')
  if (p.startsWith('+')) return p
  if (p.startsWith('0')) return '+27' + p.slice(1)
  if (p.startsWith('27')) return '+' + p
  return p
}

export async function sendSmsOtp(phone: string): Promise<void> {
  const cleanPhone = formatSAPhone(phone)
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min expiry - FIX: was NULL before

  // Mark old codes as used so only latest works
  await supabase.from('sms_otps').update({ verified: true } as any).eq('phone', cleanPhone).eq('verified', false)

  const { error: dbError } = await supabase.from('sms_otps').insert({ phone: cleanPhone, code, expires_at: expiresAt, verified: false } as any)
  if (dbError) throw new Error('Could not save OTP: ' + dbError.message)

  const { data, error } = await supabase.functions.invoke('send-sms-otp', {
    body: { phone: cleanPhone, code }
  })
  if (error) throw new Error('SMS send failed: ' + (error.message || JSON.stringify(error)))
  console.log('REAL SMS sent to', cleanPhone, data)
  // DO NOT return code - security
}

export async function verifySmsOtp(phone: string, code: string): Promise<boolean> {
  const cleanPhone = formatSAPhone(phone)
  const { data, error } = await supabase
    .from('sms_otps')
    .select('*')
    .eq('phone', cleanPhone)
    .eq('code', code.trim())
    .gt('expires_at', new Date().toISOString())
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('Verify failed: ' + error.message)
  if (!data) return false
  await supabase.from('sms_otps').update({ verified: true } as any).eq('id', (data as any).id)
  return true
}