import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

let currentUser = null;
supabase.auth.getUser().then(({ data }) => {
  currentUser = data.user;
});
supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
});

export const auth = {
  get currentUser() {
    return currentUser;
  },
  getUser: () => supabase.auth.getUser(),
  signOut: () => supabase.auth.signOut(),
};