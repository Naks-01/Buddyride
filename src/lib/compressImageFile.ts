import imageCompression from 'browser-image-compression'

const MAX_INPUT = 20 * 1024 * 1024
const SKIP_BELOW = 500 * 1024

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(null) }
    }, ms)
    promise.then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v) } },
      () => { if (!done) { done = true; clearTimeout(timer); resolve(null) } }
    )
  })
}

async function compressWithCanvas(file: File): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    let settled = false
    const cleanup = () => { try { URL.revokeObjectURL(url) } catch {} }
    const finish = (f: File) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      resolve(f)
    }
    const timer = setTimeout(() => finish(file), 8000)
    img.onload = () => {
      try {
        const max = 1280
        let w = img.naturalWidth || img.width
        let h = img.naturalHeight || img.height
        if (!w || !h || w > 12000 || h > 12000) { finish(file); return }
        if (w > h) { if (w > max) { h = Math.round(h * max / w); w = max } }
        else { if (h > max) { w = Math.round(w * max / h); h = max } }
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(w))
        canvas.height = Math.max(1, Math.floor(h))
        const ctx = canvas.getContext('2d')
        if (!ctx) { finish(file); return }
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // FIX: toBlob timeout - was hanging forever on corrupt / huge images
        let blobDone = false
        const blobTimer = setTimeout(() => { if (!blobDone) { blobDone = true; finish(file) } }, 5000)
        canvas.toBlob((blob) => {
          if (blobDone) return
          blobDone = true
          clearTimeout(blobTimer)
          if (!blob) { finish(file); return }
          finish(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }))
        }, 'image/jpeg', 0.65)
      } catch { finish(file) }
    }
    img.onerror = () => finish(file)
    img.src = url
  })
}

export default async function compressImageFile(file: File): Promise<File> {
  if (!file || file.size === 0) throw new Error('Empty file - please select a photo again.')
  if (file.type === 'application/pdf') return file
  if (!isImageFile(file)) return file
  if (file.size > MAX_INPUT) throw new Error('Image must be under 20MB. Take a smaller photo or screenshot it.')
  // FIX: HEIC + AVIF - canvas can't decode either on Android Chrome, don't waste 8-10s
  if (/\.(heic|heif|avif)$/i.test(file.name) || ['image/heic', 'image/heif', 'image/avif'].includes(file.type)) {
    return file
  }
  if (file.size < SKIP_BELOW) return file

  try {
    const compressed = await withTimeout(
      imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1280,
        useWebWorker: false,
        fileType: 'image/jpeg',
        initialQuality: 0.65,
        alwaysKeepResolution: false,
      }),
      10000
    )
    if (compressed && compressed.size > 0 && compressed.size < file.size) {
      return new File([compressed], file.name.replace(/\.\w+$/, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
    }
    if (compressed === null) return file
    if (compressed && compressed.size >= file.size) return file
  } catch {
    // Fall through to canvas only on throw
  }

  try {
    const canvasResult = await compressWithCanvas(file)
    if (canvasResult.size < file.size) return canvasResult
    return file
  } catch {
    return file
  }
}