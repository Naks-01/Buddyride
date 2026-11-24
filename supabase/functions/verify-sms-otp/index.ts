import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const hashSecret = Deno.env.get('OTP_HASH_SECRET')!
const appUrl = Deno.env.get('APP_BASE_URL')
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

function cors(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return null
  try {
    const parsed = new URL(origin)
    if (origin.startsWith('capacitor://') || origin.startsWith('ionic://') || parsed.hostname === 'localhost') return origin
    if (appUrl && new URL(appUrl).origin === parsed.origin) return parsed.origin
  } catch { /* invalid origin */ }
  return null
}
function response(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
  } })
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async request => {
  const origin = cors(request)
  if (request.method === 'OPTIONS') return response({}, 200, origin)
  if (!origin && request.headers.get('origin')) return response({ error: 'Origin not allowed' }, 403, null)
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, origin)
  if (!hashSecret) return response({ error: 'OTP service is not configured.' }, 503, origin)

  try {
    const { phone, code } = await request.json()
    if (typeof phone !== 'string' || !/^\+27[0-9]{9}$/.test(phone) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return response({ verified: false, error: 'Enter the six-digit code sent to your phone.' }, 400, origin)
    }
    const { data: otp, error } = await db.from('sms_otps').select('id,code_hash,expires_at,attempts')
      .eq('phone', phone).eq('verified', false).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!otp || Number(otp.attempts) >= 5) return response({ verified: false, error: 'Code expired or too many attempts. Request a new code.' }, 400, origin)
    const suppliedHash = await digest(`${phone}:${code}:${hashSecret}`)
    if (suppliedHash !== otp.code_hash) {
      await db.from('sms_otps').update({ attempts: Number(otp.attempts) + 1 }).eq('id', otp.id)
      return response({ verified: false, error: 'Incorrect verification code.' }, 400, origin)
    }
    const { error: updateError } = await db.from('sms_otps').update({ verified: true }).eq('id', otp.id).eq('verified', false)
    if (updateError) throw updateError
    const { error: verificationError } = await db.from('phone_verifications').upsert({ phone, verified_at: new Date().toISOString(), consumed_at: null }, { onConflict: 'phone' })
    if (verificationError) throw verificationError
    return response({ verified: true }, 200, origin)
  } catch (error) {
    console.error('OTP verification failed', error)
    return response({ verified: false, error: 'Could not verify the code. Please try again.' }, 500, origin)
  }
})
