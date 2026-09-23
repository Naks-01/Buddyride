import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co';
const rawKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key';
const url = /^https:\/\/[a-z0-9-]+\.supabase\.co(?:\/)?.*$/i.test(rawUrl) ? rawUrl : 'https://example.supabase.co';
const key = rawKey || 'public-anon-key';

console.log('Supabase URL exists:', !!url && !url.includes('localhost'));

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});