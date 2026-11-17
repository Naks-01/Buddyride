import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')
const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER')
const hashSecret = Deno.env.get('OTP_HASH_SECRET')
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
  if (!twilioSid || !twilioToken || !twilioFrom || !hashSecret) return response({ error: 'SMS service is not configured. Contact BuddyRide support.' }, 503, origin)

  try {
    const { phone } = await request.json()
    if (typeof phone !== 'string' || !/^\+27[0-9]{9}$/.test(phone)) return response({ error: 'Enter a valid South African mobile number.' }, 400, origin)
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count, error: rateError } = await db.from('sms_otps').select('id', { count: 'exact', head: true }).eq('phone', phone).gte('created_at', since)
    if (rateError) throw rateError
    if ((count || 0) >= 3) return response({ error: 'Too many codes requested. Please wait 15 minutes.' }, 429, origin)

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const codeHash = await digest(`${phone}:${code}:${hashSecret}`)
    const { error: insertError } = await db.from('sms_otps').insert({ phone, code_hash: codeHash, expires_at: expiresAt, verified: false, attempts: 0 })
    if (insertError) throw insertError

    const body = new URLSearchParams({ To: phone, From: twilioFrom, Body: `Your BuddyRide verification code is ${code}. It expires in 5 minutes. Do not share it.` })
    const sms = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
      method: 'POST', headers: { Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    })
    const payload = await sms.json()
    if (!sms.ok) {
      await db.from('sms_otps').update({ verified: true }).eq('phone', phone).eq('code_hash', codeHash)
      console.error('Twilio SMS failed', payload?.code || sms.status)
      return response({ error: 'Could not send SMS. Check the mobile number or try again later.' }, 502, origin)
    }
    return response({ sent: true, expires_in_seconds: 300 }, 200, origin)
  } catch (error) {
    console.error('OTP request failed', error)
    return response({ error: 'Could not send verification code. Please try again.' }, 500, origin)
  }
})
