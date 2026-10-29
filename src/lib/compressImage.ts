/** Compress an image to JPEG, bounding its longest side to 1280px at 0.75 quality. */
export async function compressImageFile(file: File): Promise<Blob | File> {
  if (!file.type.startsWith('image/')) return file
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const maxSide = 1280
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
        const width = Math.max(1, Math.round(image.naturalWidth * scale))
        const height = Math.max(1, Math.round(image.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Image compression is unavailable in this browser.')
        context.drawImage(image, 0, 0, width, height)
        canvas.toBlob(blob => {
          URL.revokeObjectURL(objectUrl)
          if (blob) resolve(blob)
          else reject(new Error('Could not compress this image. Please choose another photo.'))
        }, 'image/jpeg', 0.75)
      } catch (error) {
        URL.revokeObjectURL(objectUrl)
        reject(error)
      }
    }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('This image could not be opened.')) }
    image.src = objectUrl
  })
}
