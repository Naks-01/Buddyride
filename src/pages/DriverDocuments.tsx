"use client"
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeDocType as canonicalType } from '../lib/driverDocuments'
import compressImageFile from '../lib/compressImageFile'

// BUNDLE MODEL: No commission, no payout. Bank NOT required. Driver keeps 100%.
// BOLT COMPLETE: 4 Exterior + 3 Interior (Dashboard added) + Vehicle Details + Service Area + Ride Type

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

// FIX PDP ONLY
function canonicalKey(raw: string | null | undefined) {
  const t = String(raw || '').toLowerCase().trim()
  if (t.includes('prdp') || t.includes('pdp') || t === 'professional_driving_permit' || t.includes('pr_dp')) return 'prdp'
  return canonicalType(raw || '')
}

function getExpiryForType(expiryDates: Record<string, string>, key: string): string | null {
  const c = canonicalKey(key)
  return expiryDates[c] || expiryDates[key] || null
}

const DOC_TYPES = [
  { key: 'profile_photo', label: 'Profile Photo', bucket: 'profile-photos', folder: 'profile_photo' },
  { key: 'selfie', label: 'Selfie', bucket: 'driver-documents', folder: 'selfie' },
  { key: 'sa_id', label: 'SA ID', bucket: 'driver-documents', folder: 'sa_id' },
  { key: 'drivers_license', label: "Driver's License", bucket: 'driver-documents', folder: 'drivers_license' },
  { key: 'prdp', label: 'PrDP', bucket: 'driver-documents', folder: 'prdp' },
  { key: 'vehicle_registration', label: 'Vehicle Papers', bucket: 'driver-documents', folder: 'vehicle_registration' },
  { key: 'license_disc', label: 'License Disc', bucket: 'driver-documents', folder: 'license_disc' },
  { key: 'vehicle_photo_1', label: 'Vehicle Photo 1 - Front', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_photo_2', label: 'Vehicle Photo 2 - Back', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_photo_3', label: 'Vehicle Photo 3 - Left Side', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_photo_4', label: 'Vehicle Photo 4 - Right Side', bucket: 'driver-documents', folder: 'vehicle_photos' },
  { key: 'vehicle_interior_photo_1', label: 'Vehicle Interior 1 - Dashboard', bucket: 'driver-documents', folder: 'vehicle_interior' },
  { key: 'vehicle_interior_photo_2', label: 'Vehicle Interior 2 - Front Seats', bucket: 'driver-documents', folder: 'vehicle_interior' },
  { key: 'vehicle_interior_photo_3', label: 'Vehicle Interior 3 - Back Seats', bucket: 'driver-documents', folder: 'vehicle_interior' },
  { key: 'huru_criminal_check', label: 'Huru Check', bucket: 'driver-documents', folder: 'huru_criminal_check' },
  { key: 'vehicle_inspection_report', label: 'Vehicle Inspection Report', bucket: 'driver-documents', folder: 'vehicle_inspection_report' },
] as const

type DocKey = typeof DOC_TYPES[number]['key']
const TOTAL_DOCS = DOC_TYPES.length
const southAfricanToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const EXPIRING_DOCS = new Set<string>([
  'drivers_license',
  'prdp',
  'license_disc',
  'huru_criminal_check',
  'vehicle_inspection_report'
])

// === FIX: DD/MM/YYYY helpers ===
function parseDDMMYYYYToISO(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, '')
  if (digits.length !== 8) return null
  const dd = Number(digits.slice(0,2))
  const mm = Number(digits.slice(2,4))
  const yyyy = Number(digits.slice(4,8))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return null
  const iso = `${String(yyyy).padStart(4,'0')}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`
  // Validate real date
  const d = new Date(iso)
  if (d.getFullYear() !== yyyy || d.getMonth()+1 !== mm || d.getDate() !== dd) return null
  return iso
}
function formatISOToDDMMYYYY(iso: string): string {
  if (!iso) return ''
  const clean = iso.slice(0,10)
  const parts = clean.split('-')
  if (parts.length !== 3) return ''
  const [y,m,d] = parts
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}
function formatTyping(v: string): string {
  const digits = v.replace(/[^0-9]/g, '').slice(0,8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
}

function safeUUID() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function isValidSAID(id: string) {
  if (!/^\d{13}$/.test(id)) return false
  const yy = Number(id.slice(0, 2)); const month = Number(id.slice(2, 4)); const day = Number(id.slice(4, 6))
  const currentYear = new Date().getFullYear(); const currentYearTwoDigits = currentYear % 100
  const year = yy <= currentYearTwoDigits ? 2000 + yy : 1900 + yy
  const birthDate = new Date(year, month - 1, day)
  const validBirthDate = birthDate.getFullYear() === year && birthDate.getMonth() === month - 1 && birthDate.getDate() === day && birthDate <= new Date()
  if (!validBirthDate) return false
  let sum = 0; let doubleDigit = true
  for (let index = 11; index >= 0; index -= 1) { let digit = Number(id[index]); if (doubleDigit) { digit *= 2; if (digit > 9) digit -= 9 } sum += digit; doubleDigit = !doubleDigit }
  return (sum + Number(id[12])) % 10 === 0
}

async function signedUrlFor(ref: string): Promise<string | null> {
  if (!ref) return null
  if (ref.startsWith('http')) return ref
  const [bucket, ...rest] = ref.split(':')
  const path = rest.join(':')
  if (!bucket || !path) {
    const { data } = await supabase.storage.from('driver-documents').createSignedUrl(ref, 3600)
    if (data?.signedUrl) return data.signedUrl
    const { data: pub } = supabase.storage.from('driver-documents').getPublicUrl(ref)
    return pub?.publicUrl || null
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (!error && data?.signedUrl) return data.signedUrl
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
  return pub?.publicUrl || null
}

export function DriverDocuments({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [docs, setDocs] = useState<any[]>([])
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [profileUrl, setProfileUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState<DocKey | null>(null)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [expiryDisplay, setExpiryDisplay] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [driverIdNumber, setDriverIdNumber] = useState('')
  const [licenceNumber, setLicenceNumber] = useState('')
  const [vehicleDetails, setVehicleDetails] = useState({ year: '', make_model: '', colour: '', registration: '' })
  const [serviceZones, setServiceZones] = useState<{id: string, name: string}[]>([])
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [rideTypes, setRideTypes] = useState<{category: string}[]>([])
  const [selectedRideType, setSelectedRideType] = useState('')

  async function saveIdNumbers(idNum: string, licNum: string) {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || driverId
    if (!ownerId) return
    if (!idNum.trim() && !licNum.trim()) return
    await supabase.from('profiles').update({
      id_number: idNum.trim() || null,
      licence_number: licNum.trim() || null,
      driver_licence_number: licNum.trim() || null,
    } as any).eq('id', ownerId)
  }

  async function saveVehicleNow() {
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || driverId
    if (!ownerId) return
    const payload: any = {
      driver_id: ownerId,
      vehicle_year: vehicleDetails.year ? Number(vehicleDetails.year) : null,
      make_model: vehicleDetails.make_model.trim() || null,
      colour: vehicleDetails.colour.trim() || null,
      registration: vehicleDetails.registration.trim().toUpperCase() || null,
      service_zones: selectedZones,
      ride_type: selectedRideType || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('driver_vehicles').upsert(payload, { onConflict: 'driver_id' })
    if (error) {
      await supabase.from('profiles').update({
        vehicle_year: payload.vehicle_year,
        vehicle_make_model: payload.make_model,
        vehicle_colour: payload.colour,
        vehicle_registration: payload.registration,
        service_zones: selectedZones,
        ride_type: selectedRideType || null,
      } as any).eq('id', ownerId)
    }
    try {
      localStorage.setItem('br_vehicle', JSON.stringify(vehicleDetails))
      localStorage.setItem('br_zones', JSON.stringify(selectedZones))
      localStorage.setItem('br_ride_type', selectedRideType)
    } catch {}
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const effectiveId = user?.id || driverId
    const [docsRes, profileRes, zonesRes, faresRes, vehicleRes] = await Promise.all([
      supabase.from('driver_documents').select('id,doc_type,document_type,status,file_url,document_url,file_path,storage_path,expiry_date,created_at').eq('driver_id', effectiveId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('avatar_url,id_number,licence_number,driver_licence_number,vehicle_year,vehicle_make_model,vehicle_colour,vehicle_registration,service_zones,ride_type').eq('id', effectiveId).single(),
      supabase.from('service_zones').select('id,name').eq('active', true).order('name'),
      supabase.from('fare_rules').select('category').eq('active', true).order('category'),
      supabase.from('driver_vehicles').select('*').eq('driver_id', effectiveId).maybeSingle(),
    ])
    if (docsRes.error) console.warn('load docs error', docsRes.error.message)
    if (zonesRes.data) setServiceZones(zonesRes.data as any)
    if (faresRes.data) setRideTypes(faresRes.data as any)
    const v: any = vehicleRes.data || profileRes.data
    if (v) {
      setVehicleDetails({
        year: v.vehicle_year ? String(v.vehicle_year) : '',
        make_model: v.make_model || v.vehicle_make_model || '',
        colour: v.colour || v.vehicle_colour || '',
        registration: v.registration || v.vehicle_registration || '',
      })
      if (Array.isArray(v.service_zones)) setSelectedZones(v.service_zones)
      if (v.ride_type) setSelectedRideType(v.ride_type)
    }
    try {
      const savedV = JSON.parse(localStorage.getItem('br_vehicle') || '{}')
      if (savedV.make_model) setVehicleDetails(savedV)
      const savedZ = JSON.parse(localStorage.getItem('br_zones') || '[]')
      if (Array.isArray(savedZ) && savedZ.length) setSelectedZones(savedZ)
      const savedR = localStorage.getItem('br_ride_type') || ''
      if (savedR) setSelectedRideType(savedR)
    } catch {}
    if (docsRes.data) {
      const latest = new Map<string, any>()
      for (const d of docsRes.data as any[]) {
        const key = canonicalKey(d.doc_type || d.document_type || '')
        if (!latest.has(key)) latest.set(key, { ...d, doc_type: key, document_type: key })
      }
      const deduped = [...latest.values()]
      setDocs(deduped)
      const exp: Record<string, string> = {}
      const expDisplay: Record<string, string> = {}
      for (const d of deduped) {
        const key = canonicalKey(d.doc_type || d.document_type)
        if (key && d.expiry_date && !exp[key]) {
          const iso = String(d.expiry_date).slice(0, 10)
          exp[key] = iso
          expDisplay[key] = formatISOToDDMMYYYY(iso)
        }
      }
      setExpiryDates(prev => ({ ...prev, ...exp }))
      setExpiryDisplay(prev => ({ ...prev, ...expDisplay }))
      const previews: Record<string, string> = {}
      await Promise.all(deduped.map(async (d) => {
        const key = canonicalKey(d.doc_type || d.document_type)
        const ref = d.file_url || d.document_url || d.file_path || d.storage_path
        if (key && ref) {
          const url = await signedUrlFor(String(ref))
          if (url) previews[key] = url
        }
      }))
      setPreviewUrls(previews)
    }
    const avatar = (profileRes.data as any)?.avatar_url
    if (typeof avatar === 'string' && avatar.startsWith('http')) setProfileUrl(avatar)
    setDriverIdNumber(prev => prev || (profileRes.data as any)?.id_number || '')
    setLicenceNumber(prev => prev || (profileRes.data as any)?.licence_number || (profileRes.data as any)?.driver_licence_number || '')
  }

  useEffect(() => { void load() }, [driverId])

  async function saveExpiry(key: DocKey, isoValue: string) {
    const cKey = canonicalKey(key)
    if (isoValue && isoValue.length !== 10) return
    setExpiryDates(prev => {
      const next = { ...prev, [cKey]: isoValue, [key]: isoValue }
      try { localStorage.setItem('br_expiry_dates', JSON.stringify(next)) } catch {}
      return next
    })
    if (!isoValue) return
    const { data: { user } } = await supabase.auth.getUser()
    const ownerId = user?.id || driverId
    if (!ownerId) return
    await supabase.from('driver_documents').update({ expiry_date: isoValue }).eq('driver_id', ownerId).or(`doc_type.eq.${cKey},document_type.eq.${cKey}`)
    setDocs(prev => prev.map(d => canonicalKey(d.doc_type || d.document_type) === cKey ? { ...d, expiry_date: isoValue } : d))
  }

  async function upload(key: DocKey, file: File) {
    setUploading(key)
    setMsg('')
    setIsError(false)
    let uploadedPath: string | null = null
    const meta = DOC_TYPES.find(d => d.key === key)!
    const cKey = canonicalKey(key)
    try {
      const extFromName = file.name.split('.').pop()?.toLowerCase() || ''
      if (['heic','heif'].includes(extFromName)) throw new Error('iPhone HEIC not supported. Screenshot the document or pick JPG.')
      const guessedType = file.type || (extFromName === 'pdf' ? 'application/pdf' : extFromName === 'png' ? 'image/png' : extFromName === 'webp' ? 'image/webp' : 'image/jpeg')
      if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('File must be greater than 0 bytes and smaller than 20 MB.')
      const expiryForUpload = getExpiryForType(expiryDates, key)
      if (EXPIRING_DOCS.has(cKey) && !expiryForUpload) throw new Error(`Please select Expiry Date for ${meta.label} FIRST, then click Upload. Use DD/MM/YYYY format e.g. 23/11/2026`)
      if (EXPIRING_DOCS.has(cKey) && expiryForUpload && expiryForUpload < southAfricanToday()) {
        throw new Error('This document has expired. Upload a current document.')
      }
      const isImage = guessedType.startsWith('image/')
      let blob: Blob | File = file
      if (isImage) {
        try {
          setMsg(`Compressing ${(file.size / 1024 / 1024).toFixed(1)}MB...`)
          blob = await compressImageFile(file)
        } catch (compressErr) {
          console.warn('Compress failed on mobile, using original', compressErr)
          blob = file
        }
      }
      if (blob.size > 20 * 1024 * 1024) throw new Error('Processed file must be smaller than 20 MB.')
      const outputType = isImage ? 'image/jpeg' : guessedType
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in - please log in again')
      const ownerId = user.id
      await saveIdNumbers(driverIdNumber, licenceNumber)
      const path = `${ownerId}/${meta.folder}/${cKey}_${safeUUID()}.${isImage ? 'jpg' : (extFromName === 'pdf' ? 'pdf' : 'jpg')}`
      uploadedPath = path
      const { error: upErr } = await supabase.storage.from(meta.bucket).upload(path, blob, {
        contentType: outputType,
        upsert: true,
      })
      if (upErr) throw upErr
      const storageRef = `${meta.bucket}:${path}`
      const payload: any = {
        driver_id: ownerId,
        doc_type: cKey,
        document_type: cKey,
        file_url: storageRef,
        document_url: storageRef,
        file_path: path,
        storage_path: path,
        file_name: file.name,
        status: 'PENDING',
        expiry_date: EXPIRING_DOCS.has(cKey) ? (expiryForUpload || null) : null,
      }
      const { data: existingList } = await supabase.from('driver_documents').select('id').eq('driver_id', ownerId).or(`doc_type.eq.${cKey},document_type.eq.${cKey}`).limit(1)
      const existing = existingList?.[0]
      let dbErr: any = null
      if (existing) {
        const res = await supabase.from('driver_documents').update(payload).eq('id', existing.id)
        dbErr = res.error
      } else {
        const res = await supabase.from('driver_documents').insert(payload)
        dbErr = res.error
      }
      if (dbErr) throw dbErr
      const { data: allForType } = await supabase.from('driver_documents').select('id,created_at').eq('driver_id', ownerId).or(`doc_type.eq.${cKey},document_type.eq.${cKey}`).order('created_at', { ascending: false })
      if (allForType && allForType.length > 1) {
        const idsToDelete = allForType.slice(1).map((r: any) => r.id)
        await supabase.from('driver_documents').delete().in('id', idsToDelete)
      }
      if (cKey === 'profile_photo') {
        const { data: publicData } = supabase.storage.from(meta.bucket).getPublicUrl(path)
        const { error: profErr } = await supabase.from('profiles').update({ avatar_url: publicData.publicUrl }).eq('id', ownerId)
        if (profErr) throw profErr
        setProfileUrl(publicData.publicUrl)
      }
      uploadedPath = null
      setMsg(`${meta.label} uploaded ✅`)
      await load()
    } catch (e: unknown) {
      if (uploadedPath) await supabase.storage.from(meta.bucket).remove([uploadedPath]).catch(()=>{})
      setIsError(true)
      const errMsg = e instanceof Error ? e.message : String(e)
      setMsg(`Upload failed: ${errMsg}`)
      console.error(errMsg)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setUploading(null)
    }
  }

  async function submitForReview() {
    setSubmitting(true)
    setMsg('')
    setIsError(false)
    try {
      const trimmedId = driverIdNumber.trim()
      if (!trimmedId) throw new Error('Enter your SA ID number / Passport number - required.')
      if (/^\d{13}$/.test(trimmedId) && !isValidSAID(trimmedId)) throw new Error('Enter a valid 13-digit SA ID number.')
      if (!licenceNumber.trim()) throw new Error('Enter your driver licence number - required.')
      if (!vehicleComplete) throw new Error('Complete Vehicle Details: Year + Make/Model + Colour + Registration (exactly as licence disc).')
      if (!zonesComplete) throw new Error('Choose at least 1 Service Area where you want to drive.')
      if (!rideTypeComplete) throw new Error('Choose your Ride Type.')
      for (const t of DOC_TYPES) {
        if (EXPIRING_DOCS.has(canonicalKey(t.key))) {
          const exp = getExpiryForType(expiryDates, t.key)
          if (!exp) throw new Error(`Enter expiry date for ${t.label} before submitting.`)
          if (exp < southAfricanToday()) throw new Error(`${t.label} is expired.`)
        }
      }
      const { data: { user } } = await supabase.auth.getUser()
      const ownerId = user?.id || driverId
      await saveVehicleNow()
      const { error: saveErr } = await supabase.from('profiles').update({ id_number: trimmedId, licence_number: licenceNumber.trim(), service_zones: selectedZones, ride_type: selectedRideType } as any).eq('id', ownerId)
      if (saveErr) throw new Error('Could not save ID numbers: ' + saveErr.message)
      const { error } = await supabase.rpc('submit_driver_documents_for_review')
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes('argument') || msg.includes('function')) {
          const { error: retryError } = await supabase.rpc('submit_driver_documents_for_review', { p_driver_id: ownerId } as any)
          if (retryError) throw retryError
        } else throw error
      }
      setMsg('Your documents have been submitted for admin review.')
      await load()
    } catch (submitError: unknown) {
      setIsError(true)
      setMsg(`Could not submit for review: ${submitError instanceof Error ? submitError.message : String(submitError)}.`)
    } finally {
      setSubmitting(false)
    }
  }

  const getDoc = (key: DocKey) => docs.find(d => canonicalKey(d.doc_type || d.document_type || '') === canonicalKey(key))
  const getStatus = (key: DocKey) => {
    const latest = getDoc(key)
    return latest ? latest.status : 'Missing'
  }
  const uploadedCount = DOC_TYPES.filter(t => {
    const d = getDoc(t.key)
    return Boolean(d?.file_url || d?.document_url || d?.file_path || d?.storage_path)
  }).length
  const hasIdNumbers = Boolean(driverIdNumber.trim() && licenceNumber.trim())
  const vehicleComplete = Boolean(vehicleDetails.year && vehicleDetails.make_model.trim() && vehicleDetails.colour.trim() && vehicleDetails.registration.trim())
  const zonesComplete = selectedZones.length > 0
  const rideTypeComplete = Boolean(selectedRideType)
  const canSubmit = uploadedCount === TOTAL_DOCS && hasIdNumbers && vehicleComplete && zonesComplete && rideTypeComplete

  return (
    <main style={{ minHeight: '100dvh', background: '#F8F9FA', color: '#182230', padding: '20px 16px 32px', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: '#fff', border: '1px solid #E4E7EC', color: '#344054', padding: '8px 14px', borderRadius: 10, marginBottom: 12, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
        <p style={{ color: BLUE, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', margin: 0 }}>Step 4 of 4</p>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 0', letterSpacing: '-.02em' }}>Driver documents</h1>
        <p style={{ color: '#667085', marginTop: 6, fontSize: 14 }}>Your {TOTAL_DOCS} driver verification documents - ID, licence, licence disk and selfie. Plus Vehicle, Service Area & Ride Type.</p>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, height: 9, background: '#E5E9EF', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${(uploadedCount/TOTAL_DOCS)*100}%`, height: '100%', background: BLUE, transition: 'width 0.3s', borderRadius: 99 }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: uploadedCount === TOTAL_DOCS ? BLUE : '#667085' }}>{uploadedCount}/{TOTAL_DOCS} {uploadedCount === TOTAL_DOCS ? '✅ READY' : ''}</span>
        </div>
        {msg && <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: isError ? '#FEF3F2' : BLUE_LIGHT, color: isError ? '#B42318' : BLUE_DARK, fontSize: 13, border: `1px solid ${isError ? '#FECDCA' : '#B2CCFF'}` }}>{msg}</div>}
        <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: '#fff', border: '1px solid #EDF0F3', display: 'grid', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>ID & Licence Numbers - Required</strong>
          <p style={{ margin: 0, fontSize: 12, color: '#667085' }}>Enter numbers exactly as on documents. Must match SA ID + Licence photos below.</p>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>SA ID Number / Passport Number *
            <input value={driverIdNumber} onChange={e => setDriverIdNumber(e.target.value)} onBlur={() => void saveIdNumbers(driverIdNumber, licenceNumber)} placeholder="e.g. 9001015009087" inputMode="numeric" style={{ padding: '10px 8px', border: '1px solid #D0D5DD', borderRadius: 9 }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Driver Licence Number *
            <input value={licenceNumber} onChange={e => setLicenceNumber(e.target.value)} onBlur={() => void saveIdNumbers(driverIdNumber, licenceNumber)} placeholder="As on licence card" style={{ padding: '10px 8px', border: '1px solid #D0D5DD', borderRadius: 9 }} />
          </label>
          {driverIdNumber && /^\d{13}$/.test(driverIdNumber.trim()) && !isValidSAID(driverIdNumber.trim()) && <p style={{ color: '#B42318', fontSize: 12, margin: 0 }}>Invalid SA ID - check digits.</p>}
        </div>
        <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: '#fff', border: '1px solid #EDF0F3', display: 'grid', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>🚗 Vehicle Details - Exactly as Licence Disc {vehicleComplete ? '✅' : '❌'}</strong>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Vehicle year *
            <select value={vehicleDetails.year} onChange={e => setVehicleDetails(c => ({ ...c, year: e.target.value }))} onBlur={() => void saveVehicleNow()} style={{ padding: '10px 8px', border: '1px solid #D0D5DD', borderRadius: 9, background: '#fff' }}><option value="">Year</option>{Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Make and model *
            <input value={vehicleDetails.make_model} onChange={e => setVehicleDetails(c => ({ ...c, make_model: e.target.value }))} onBlur={() => void saveVehicleNow()} placeholder="Search vehicle (e.g. Polo Vivo)" style={{ padding: '10px 8px', border: '1px solid #D0D5DD', borderRadius: 9 }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Colour *
            <input value={vehicleDetails.colour} onChange={e => setVehicleDetails(c => ({ ...c, colour: e.target.value }))} onBlur={() => void saveVehicleNow()} placeholder="Colour (e.g. White, Silver)" style={{ padding: '10px 8px', border: '1px solid #D0D5DD', borderRadius: 9 }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>Registration number *
            <input value={vehicleDetails.registration} onChange={e => setVehicleDetails(c => ({ ...c, registration: e.target.value.toUpperCase() }))} onBlur={() => void saveVehicleNow()} placeholder="Vehicle registration" style={{ padding: '10px 8px', border: '1px solid #D0D5DD', borderRadius: 9, textTransform: 'uppercase' }} />
          </label>
        </div>
        <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: '#fff', border: '1px solid #EDF0F3', display: 'grid', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>📍 Service Area - Choose where you drive {zonesComplete ? `✅ ${selectedZones.length} selected` : '❌'}</strong>
          <p style={{ margin: 0, fontSize: 12, color: '#667085' }}>Pick at least 1. You only get requests in these zones.</p>
          {serviceZones.map(z => {
            const checked = selectedZones.includes(z.id)
            return <label key={z.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderRadius: 10, border: checked ? '2px solid #0066FF' : '1px solid #D0D5DD', background: checked ? BLUE_LIGHT : '#fff', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => setSelectedZones(prev => prev.includes(z.id) ? prev.filter(x => x !== z.id) : [...prev, z.id])} onBlur={() => void saveVehicleNow()} /><strong style={{ fontSize: 14 }}>{z.name}</strong></label>
          })}
          {serviceZones.length === 0 && <p style={{ fontSize: 12, color: '#667085' }}>No zones - Admin must create service_zones.</p>}
        </div>
        <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: '#fff', border: '1px solid #EDF0F3', display: 'grid', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>🚙 Ride Type {rideTypeComplete ? `✅ ${selectedRideType}` : '❌'}</strong>
          <p style={{ margin: 0, fontSize: 12, color: '#667085' }}>Save vehicle first to unlock (like Bolt).</p>
          {rideTypes.map(r => {
            const checked = selectedRideType === r.category
            return <label key={r.category} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderRadius: 10, border: checked ? '2px solid #0066FF' : '1px solid #D0D5DD', background: checked ? BLUE_LIGHT : '#fff', cursor: 'pointer', opacity: !vehicleComplete ? 0.5 : 1 }}><input type="radio" name="ride_type" checked={checked} disabled={!vehicleComplete} onChange={() => { setSelectedRideType(r.category); void saveVehicleNow() }} /><strong style={{ fontSize: 14 }}>{r.category}</strong></label>
          })}
          {!vehicleComplete && <p style={{ fontSize: 12, color: '#B54708', fontWeight: 700 }}>⚠️ Save vehicle details first to unlock ride type.</p>}
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {DOC_TYPES.map(t => {
            const status = getStatus(t.key)
            const isApproved = String(status).toLowerCase() === 'approved'
            const isExpiring = EXPIRING_DOCS.has(canonicalKey(t.key))
            const doc = getDoc(t.key)
            const uploaded = Boolean(doc?.file_url || doc?.document_url)
            const preview = previewUrls[canonicalKey(t.key)]
            const expiryMissing = isExpiring && uploaded && !doc?.expiry_date && !getExpiryForType(expiryDates, t.key)
            const isoVal = getExpiryForType(expiryDates, t.key) || ''
            const displayVal = expiryDisplay[canonicalKey(t.key)] ?? expiryDisplay[t.key] ?? formatISOToDDMMYYYY(isoVal)
            return (
              <div key={t.key} style={{ padding: 16, border: `1px solid ${isApproved ? '#B2CCFF' : '#EDF0F3'}`, borderRadius: 16, background: isApproved ? BLUE_LIGHT : '#fff', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 5px 18px rgba(20,33,50,0.045)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{t.label} {isExpiring && <span style={{ fontSize: 10, background: '#FEF0C7', color: '#B54708', padding: '2px 6px', borderRadius: 99, marginLeft: 6, fontWeight: 800 }}>NEEDS EXPIRY</span>}</div><div style={{ marginTop: 6, display: 'inline-block', padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800, background: isApproved ? BLUE : uploaded ? '#ECFDF3' : '#F2F4F7', color: isApproved ? '#fff' : uploaded ? '#067647' : '#667085' }}>{isApproved ? 'VERIFIED' : expiryMissing ? 'EXPIRY MISSING' : String(status).toUpperCase()}</div>{doc?.expiry_date && <div style={{ fontSize: 11, color: '#667085', marginTop: 4 }}>Expires: {formatISOToDDMMYYYY(String(doc.expiry_date))}</div>}<div style={{ fontSize: 10, color: '#98A2B3', marginTop: 2 }}>📁 {t.folder}/</div></div>
                  <label style={{ background: isApproved ? '#fff' : BLUE, color: isApproved ? BLUE : 'white', border: isApproved ? `1px solid ${BLUE}` : 'none', padding: '10px 14px', borderRadius: 11, fontWeight: 800, fontSize: 13, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                    {uploading === t.key ? 'Uploading...' : status === 'Missing' ? 'Upload' : 'Replace'}
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} disabled={!!uploading} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(t.key, f); e.currentTarget.value = '' }} />
                  </label>
                </div>
                {isExpiring && (
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#344054', fontWeight: 700 }}>
                    Expiry Date - REQUIRED BEFORE UPLOAD (DD/MM/YYYY)
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="23/11/2026"
                      value={displayVal}
                      onChange={e => {
                        const formatted = formatTyping(e.target.value)
                        setExpiryDisplay(prev => ({ ...prev, [canonicalKey(t.key)]: formatted, [t.key]: formatted }))
                        const iso = parseDDMMYYYYToISO(formatted)
                        if (iso) void saveExpiry(t.key, iso)
                        else if (formatted.length === 0) {
                          setExpiryDates(prev => {
                            const n = { ...prev }
                            delete n[canonicalKey(t.key)]; delete n[t.key]
                            return n
                          })
                        }
                      }}
                      style={{ background: '#fff', border: '1px solid #D0D5DD', color: '#182230', padding: '10px 8px', borderRadius: 9, letterSpacing: '0.02em' }}
                    />
                    {expiryMissing && <span style={{ color: '#B54708', fontSize: 11 }}>⚠️ File uploaded but expiry missing - type date as DD/MM/YYYY then click Replace.</span>}
                  </label>
                )}
                {preview && (
                  <a href={preview} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: BLUE, fontWeight: 700, textDecoration: 'none' }}>
                    Preview uploaded document ↗
                  </a>
                )}
              </div>
            )
          })}
        </div>
        <button disabled={!canSubmit || submitting || !!uploading} onClick={() => void submitForReview()} style={{ marginTop: 20, width: '100%', padding: 16, borderRadius: 14, background: canSubmit && !submitting ? BLUE : '#CBD2DA', color: 'white', border: 0, fontWeight: 800, fontSize: 16, opacity: submitting ? 0.7 : 1, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
          {submitting ? 'Submitting…' : canSubmit ? '✅ SUBMIT FOR REVIEW' : !hasIdNumbers ? `Enter ID Number + Licence Number (${uploadedCount}/${TOTAL_DOCS})` : !vehicleComplete ? 'Complete Vehicle Details to submit' : !zonesComplete ? 'Choose Service Area to submit' : !rideTypeComplete ? 'Choose Ride Type to submit' : `Upload all ${TOTAL_DOCS} documents (${uploadedCount}/${TOTAL_DOCS})`}
        </button>
      </section>
    </main>
  )
}
export default DriverDocuments;