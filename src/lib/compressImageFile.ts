import imageCompression from 'browser-image-compression'

const MAX_INPUT = 20 * 1024 * 1024
const SKIP_BELOW = 500 * 1024 // FIXED: was 1.5MB - still slow on 3G in Limpopo

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
    // FIXED: Single timer, single resolve
    const timer = setTimeout(() => finish(file), 8000)

    img.onload = () => {
      try {
        const max = 1280 // FIXED: was 1024 - 1024 is too blurry for ID numbers
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
        canvas.toBlob((blob) => {
          if (!blob) { finish(file); return }
          finish(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: Date.now() }))
        }, 'image/jpeg', 0.65) // FIXED: was 0.6 - 0.65 keeps ID numbers readable
      } catch { finish(file) }
    }
    img.onerror = () => finish(file)
    img.src = url
  })
}

export default async function compressImageFile(file: File): Promise<File> {
  if (file.type === 'application/pdf') return file
  if (!isImageFile(file)) return file
  if (file.size < SKIP_BELOW) return file
  // HEIC: browser-image-compression can't decode on Android Chrome - go straight to canvas (which also fails, so return file)
  // Don't waste 10s trying library
  if (/\.(heic|heif)$/i.test(file.name) && !file.type.includes('jpeg')) {
    // Let canvas try, if it fails we return original - admin will ask driver to convert
    const canvasResult = await compressWithCanvas(file)
    return canvasResult.size < file.size ? canvasResult : file
  }

  // 1. Try library - WITHOUT WebWorker on mobile
  try {
    const compressed = await withTimeout(
      imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1280, // FIXED: was 1024
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
  } catch {
    // Fall through to canvas
  }

  // 2. Fallback to canvas
  try {
    const canvasResult = await compressWithCanvas(file)
    if (canvasResult.size < file.size) return canvasResult
    return file
  } catch {
    return file
  }
}