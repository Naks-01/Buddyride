import imageCompression from 'browser-image-compression'

export default async function compressImageFile(file: File): Promise<File> {
  if (file.type === 'application/pdf') return file
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return file
  if (file.size < 1.5 * 1024 * 1024) return file

  // 1. Try library - fixes HEIC + EXIF rotation (iPhone problem)
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.6,
    })
    return new File([compressed], file.name.replace(/\.\w+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    // 2. Fallback to canvas if worker fails (old phones)
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        try {
          const max = 1024
          let w = img.width, h = img.height
          if (w > h) { if (w > max) { h = h * max / w; w = max } }
          else { if (h > max) { w = w * max / h; h = max } }
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(w)
          canvas.height = Math.floor(h)
          const ctx = canvas.getContext('2d')
          if (!ctx) { URL.revokeObjectURL(url); resolve(file); return }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return }
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }))
          }, 'image/jpeg', 0.6)
        } catch { URL.revokeObjectURL(url); resolve(file) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }
}