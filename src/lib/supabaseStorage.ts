import { supabase } from './supabase';

export const storage = supabase.storage;

export function ref(_storage: typeof storage, path: string) {
  return { path };
}

export async function uploadBytes(reference: { path: string }, file: File) {
  const { error } = await supabase.storage.from('documents').upload(reference.path, file, { upsert: true });
  if (error) throw error;
}

export async function getDownloadURL(reference: { path: string }) {
  const { data } = supabase.storage.from('documents').getPublicUrl(reference.path);
  return data.publicUrl;
}