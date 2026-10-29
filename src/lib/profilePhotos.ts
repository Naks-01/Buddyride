import { supabase } from './supabase'

const MAX_PROFILE_PHOTO_SIZE = 50 * 1024 * 1024

function compress(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement('canvas')
      const max = 1280
      let w = img.width, h = img.height
      if (w > h) {
        if (w > max) { h *= max / w; w = max }
      } else {
        if (h > max) { w *= max / h; h = max }
      }
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('compress failed'))),
        'image/jpeg',
        0.75
      )
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load failed')) }
    img.src = objectUrl
  })
}

export async function uploadProfilePhoto(userId: string, file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file for your profile photo.')
  }
  if (file.size > MAX_PROFILE_PHOTO_SIZE) {
    throw new Error('Profile photos must be 50 MB or smaller.')
  }

  // FIX: compress 6MB -> 700KB before upload
  const blob = await compress(file)

  // FIX: unique path with timestamp to bust cache, with .jpg extension
  const objectPath = `${userId}/profile_photo-${Date.now()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(objectPath, blob, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '0',
    })
  if (uploadError) {
    // FIX: throw real message, not object
    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from('profile-photos').getPublicUrl(objectPath)
  const avatarUrl = data.publicUrl // STRING ONLY - FIXES [object Object]

  if (!avatarUrl.startsWith('http')) {
    throw new Error('Supabase did not return a valid public profile photo URL.')
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)

  if (profileError) {
    throw new Error(profileError.message)
  }

  return avatarUrl // Returns STRING like https://.../avatar-123.jpg
}