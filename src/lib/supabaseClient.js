import { supabase } from '../supabaseClient';

export { supabase };

let currentUser = null;
supabase.auth.getUser().then(({ data }) => {
  currentUser = data.user;
});
supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
});

function compatibilityUser(user) {
  if (!user) return null;
  return {
    ...user,
    uid: user.id,
    phoneNumber: user.phone ?? null,
    displayName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    photoURL: user.user_metadata?.avatar_url ?? null,
  };
}

export const auth = {
  get currentUser() {
    return compatibilityUser(currentUser);
  },
  getUser: () => supabase.auth.getUser(),
  signOut: () => supabase.auth.signOut(),
};