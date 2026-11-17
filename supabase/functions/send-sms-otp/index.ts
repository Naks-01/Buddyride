import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const smsEmail = Deno.env.get('SMS_MESSENGER_EMAIL')!
const smsToken = Deno.env.get('SMS_MESSENGER_TOKEN')!
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
  } catch { }
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
  if (!smsEmail || !smsToken || !hashSecret) return response({ error: 'SMS service not configured' }, 503, origin)

  try {
    const bodyJson = await request.json()
    const { phone, action, code } = bodyJson

    // ---- VERIFY BRANCH (NEW) ----
    if (action === 'verify' || code) {
      const cleanCode = String(code || '').trim()
      if (typeof phone !== 'string' || !/^\+27[0-9]{9}$/.test(phone)) return response({ error: 'Invalid number' }, 400, origin)
      if (!/^[0-9]{6}$/.test(cleanCode)) return response({ error: 'Enter 6-digit code' }, 400, origin)

      const codeHash = await digest(`${phone}:${cleanCode}:${hashSecret}`)
      const { data: otp, error: fetchErr } = await db.from('sms_otps').select('id, attempts, expires_at, verified').eq('phone', phone).eq('code_hash', codeHash).eq('verified', false).order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (fetchErr) throw fetchErr
      if (!otp) return response({ error: 'Incorrect code' }, 401, origin)
      if (new Date(otp.expires_at).getTime() < Date.now()) return response({ error: 'Code expired. Request new one.' }, 401, origin)
      if ((otp.attempts || 0) >= 5) return response({ error: 'Too many attempts' }, 429, origin)

      await db.from('sms_otps').update({ verified: true }).eq('id', otp.id)
      return response({ verified: true }, 200, origin)
    }

    // ---- SEND BRANCH (YOUR WORKING CODE - UNTOUCHED LOGIC) ----
    if (typeof phone !== 'string' || !/^\+27[0-9]{9}$/.test(phone)) return response({ error: 'Enter valid SA number' }, 400, origin)

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count, error: rateError } = await db.from('sms_otps').select('id', { count: 'exact', head: true }).eq('phone', phone).gte('created_at', since)
    if (rateError) throw rateError
    if ((count || 0) >= 3) return response({ error: 'Too many codes. Wait 15 mins.' }, 429, origin)

    const newCode = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const codeHash = await digest(`${phone}:${newCode}:${hashSecret}`)
    const { error: insertError } = await db.from('sms_otps').insert({ phone, code_hash: codeHash, expires_at: expiresAt, verified: false, attempts: 0 })
    if (insertError) throw insertError

    // SMS Messenger REST API - send.json with email/token headers【6888641791389949605†L12-L14】
    const smsRes = await fetch('https://sms1.smsmessenger.co.za/app/api/rest/v1/sms/send.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', email: smsEmail, token: smsToken },
      body: JSON.stringify({ recipientNumber: phone.replace('+', ''), message: `Your BuddyRide code is ${newCode}. Expires in 5 mins. Do not share it.` }),
    })
    const payload = await smsRes.json().catch(() => ({}))
    if (!smsRes.ok) {
      console.error('SMS Messenger failed', payload)
      await db.from('sms_otps').update({ verified: true }).eq('phone', phone).eq('code_hash', codeHash)
      return response({ error: 'Could not send SMS. Try later.' }, 502, origin)
    }
    console.log(`SMSMessenger HTTP ${smsRes.status} RAW:`, JSON.stringify(payload))
    return response({ sent: true, expires_in_seconds: 300 }, 200, origin)

  } catch (e) {
    console.error('OTP failed', e)
    return response({ error: 'Could not send code. Try again.' }, 500, origin)
  }
})