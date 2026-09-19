import { createClient } from '@supabase/supabase-js';

console.log(
  'ENV CHECK URL:',
  !!import.meta.env.VITE_SUPABASE_URL,
  'KEY:',
  !!import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  },
);