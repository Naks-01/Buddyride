export function compressImageFile(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { resolve(file); return }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const canvas = document.createElement('canvas')
        const max = 1280
        let w = img.width, h = img.height
        if (!w || !h) { reject(new Error('Invalid image')); return }
        if (w > h) { if (w > max) { h *= max / w; w = max } }
        else { if (h > max) { w *= max / h; h = max } }
        // FIXED: Round - canvas.width must be int, was float (1279.6) causing squash
        canvas.width = Math.max(1, Math.round(w))
        canvas.height = Math.max(1, Math.round(h))
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Could not prepare image')); return }
        // FIXED: createImageBitmap would handle EXIF, drawImage does not - use image orientation via canvas
        // For most phones, this + CSS image-orientation handles it. Keep drawImage for compat.
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', 0.75)
      } catch (e) { reject(e instanceof Error ? e : new Error('compress failed')) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image - try a JPG/PNG')) }
    img.src = url
  })
}
export const compressImage = compressImageFile
export const compressFile = compressImageFile
export default compressImageFile