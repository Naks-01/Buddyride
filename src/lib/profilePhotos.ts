import { supabase } from './supabase'
import compressImageFile from './compressImageFile' // <-- USE THE ONE GOOD FILE

const MAX_PROFILE_PHOTO_SIZE = 10 * 1024 * 1024 // 50MB -> 10MB, stops crash

export async function uploadProfilePhoto(userId: string, file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file for your profile photo.')
  }
  if (file.size > MAX_PROFILE_PHOTO_SIZE) {
    throw new Error('Profile photo too big - take photo with lower quality (max 10MB).')
  }

  // USE SHARED COMPRESS - 12MB -> 250KB, no crash
  const compressed = await compressImageFile(file)

  const objectPath = `${userId}/profile_photo-${Date.now()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(objectPath, compressed, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '0',
    })
  if (uploadError) throw new Error(uploadError.message)

  const { data } = supabase.storage.from('profile-photos').getPublicUrl(objectPath)
  const avatarUrl = data.publicUrl

  if (!avatarUrl.startsWith('http')) {
    throw new Error('Supabase did not return a valid public profile photo URL.')
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)

  if (profileError) throw new Error(profileError.message)

  return avatarUrl
}