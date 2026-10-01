import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
	console.warn('Supabase environment is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable backend features.')
}

export const supabase = createClient(
	supabaseUrl || 'http://127.0.0.1:54321',
	supabaseAnonKey || 'missing-supabase-anon-key',
)