export function compressImageFile(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { resolve(file); return }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      const max = 1280
      let w = img.width, h = img.height
      if (w > h) { if (w > max) { h *= max / w; w = max } }
      else { if (h > max) { w *= max / h; h = max } }
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')) }
    img.src = url
  })
}
export const compressImage = compressImageFile
export const compressFile = compressImageFile
export default compressImageFile
