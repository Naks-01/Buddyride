import { supabase } from './supabase'
import compressImageFile from './compressImageFile'

const MAX_PROFILE_PHOTO_SIZE = 10 * 1024 * 1024

function safeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function uploadProfilePhoto(userId: string, file: File) {
  // FIX: Guard empty userId - was uploading to "/profile_photo-..." and overwriting others
  if (!userId) throw new Error('You must be logged in to upload a profile photo.')
  if (!file || file.size === 0) throw new Error('Empty file - please choose a photo again.')

  // FIX: HEIC guard - was crashing compress on iPhone HEIC
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (['heic', 'heif'].includes(ext)) throw new Error('iPhone HEIC not supported - screenshot the photo and upload that.')

  // FIX: Fallback by ext - file.type is empty on some Android pickers, was rejecting valid JPGs
  const isImage = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
  if (!isImage) throw new Error('Choose an image file for your profile photo.')
  if (file.size > MAX_PROFILE_PHOTO_SIZE) throw new Error('Profile photo too big - take photo with lower quality (max 10MB).')

  // FIX: Verify auth matches userId - was any logged-in user could upload to any userId
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== userId) throw new Error('Session mismatch - please log in again.')

  // FIX: Get old avatar BEFORE overwrite - for cleanup, was keeping every old photo
  const { data: oldProfile } = await supabase.from('profiles').select('avatar_url').eq('id', userId).single()
  const oldUrl = (oldProfile as any)?.avatar_url as string | null

  const compressed = await compressImageFile(file)

  // FIX: randomUUID not Date.now() - Date.now() collides if user double-taps upload
  const objectPath = `${userId}/profile_photo-${safeId()}.jpg`

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(objectPath, compressed, {
      upsert: false,
      contentType: 'image/jpeg',
      cacheControl: '3600',
    })
  if (uploadError) throw new Error(uploadError.message)

  const { data } = supabase.storage.from('profile-photos').getPublicUrl(objectPath)
  // FIX: Cache-bust - was showing old cached photo after upload
  const avatarUrl = data.publicUrl + `?v=${Date.now()}`

  if (!avatarUrl.startsWith('http')) {
    // FIX: Cleanup orphan file if URL invalid - was leaving junk in storage
    await supabase.storage.from('profile-photos').remove([objectPath]).catch(() => {})
    throw new Error('Supabase did not return a valid public profile photo URL.')
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl } as any)
    .eq('id', userId)

  if (profileError) {
    // FIX: Cleanup orphan file if profile update fails - was leaving orphan photos in bucket
    await supabase.storage.from('profile-photos').remove([objectPath]).catch(() => {})
    throw new Error(profileError.message)
  }

  // FIX: Delete old avatar after success - was storage bloat, every upload kept old file
  if (oldUrl && oldUrl.includes('profile-photos/')) {
    const oldPath = oldUrl.split('profile-photos/')[1]?.split('?')[0]
    if (oldPath && oldPath !== objectPath) {
      await supabase.storage.from('profile-photos').remove([decodeURIComponent(oldPath)]).catch(() => {})
    }
  }

  return avatarUrl
}