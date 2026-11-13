import { supabase } from './supabase'

export const REQUIRED_DOCS = [
  { type: 'sa_id', label: 'SA ID', section: 'Driver Identity' },
  { type: 'drivers_license', label: 'Drivers License', section: 'Driver Identity', expiryRequired: true },
  { type: 'prdp', label: 'PDP / PrDP', section: 'Driver Identity', expiryRequired: true },
  { type: 'profile_photo', label: 'Profile Photo', section: 'Driver Identity' },
  { type: 'selfie', label: 'Selfie (face verification)', section: 'Driver Identity' },
  { type: 'vehicle_registration', label: 'Vehicle Registration Papers', section: 'Vehicle Papers' },
  { type: 'license_disc', label: 'Licence Disc', section: 'Vehicle Papers', expiryRequired: true },
  { type: 'vehicle_photo_1', label: 'Vehicle Photo 1', section: 'Vehicle Exterior', helper: 'Front' },
  { type: 'vehicle_photo_2', label: 'Vehicle Photo 2', section: 'Vehicle Exterior', helper: 'Back' },
  { type: 'vehicle_photo_3', label: 'Vehicle Photo 3', section: 'Vehicle Exterior', helper: 'Left Side' },
  { type: 'vehicle_photo_4', label: 'Vehicle Photo 4', section: 'Vehicle Exterior', helper: 'Right Side' },
  { type: 'vehicle_interior_photo_1', label: 'Vehicle Interior Photo 1', section: 'Vehicle Interior', helper: 'Front seats/dashboard' },
  { type: 'vehicle_interior_photo_2', label: 'Vehicle Interior Photo 2', section: 'Vehicle Interior', helper: 'Back seats' },
  { type: 'huru_criminal_check', label: 'Huru Criminal Check', section: 'Safety', expiryRequired: true },
  { type: 'vehicle_inspection_report', label: 'Vehicle Inspection Report', section: 'Safety', expiryRequired: true },
]

export const EXPIRING_DRIVER_DOCUMENT_TYPES = new Set(
  REQUIRED_DOCS.filter(document => document.expiryRequired).map(document => document.type),
)

export const REQUIRED_DOCS_ALL = REQUIRED_DOCS
export const DRIVER_DOCUMENTS = REQUIRED_DOCS

export const PASSENGER_DOCUMENTS = [
  { type: 'sa_id', label: 'SA ID', section: 'Identity' },
  { type: 'profile_photo', label: 'Profile Photo', section: 'Identity' },
  { type: 'selfie', label: 'Selfie (face verification)', section: 'Identity' },
]

export type DriverDocumentType = string
export type DocumentRequirement = { type: string; label: string; section?: string; expiryRequired?: boolean; helper?: string }

export function normalizeDocType(type: any): string {
  const t = String(type || '').toLowerCase().trim().replace(/[_/-]+/g,' ').replace(/\s+/g,' ')
  const vehiclePhoto = t.match(/^(?:vehicle|car) photos? (\d+)$/)
  if (vehiclePhoto) return 'vehicle_photo_' + vehiclePhoto[1]
  const interiorPhoto = t.match(/^vehicle interior photos? (\d+)$/)
  if (interiorPhoto) return 'vehicle_interior_photo_' + interiorPhoto[1]
  if (['profile', 'profile photo'].includes(t)) return 'profile_photo'
  if (['selfie', 'selfie face verification', 'face selfie', 'selfie with id'].includes(t)) return 'selfie'
  // FIXED: Passport is NOT SA ID - keep it separate so Admin can reject it correctly
  if (t === 'passport') return 'passport'
  if (['sa id', 'sa id passport', 'id document', 'id doc', 'id', 'south african id', 'sa id document'].includes(t)) return 'sa_id'
  if (['drivers license', 'drivers licence', 'license', 'licence', 'drivers', 'driver license', 'driver licence'].includes(t)) return 'drivers_license'
  if (['license disc', 'licence disc', 'disc', 'license doc', 'licence disc document'].includes(t)) return 'license_disc'
  if (['vehicle registration', 'vehicle registration papers', 'registration'].includes(t)) return 'vehicle_registration'
  if (['huru criminal check', 'huru check', 'criminal check', 'police clearance'].includes(t)) return 'huru_criminal_check'
  if (['vehicle inspection report', 'inspection report', 'inspection'].includes(t)) return 'vehicle_inspection_report'
  if (t === 'vehicle photo') return 'vehicle_photo_1'
  if (t === 'vehicle') return 'vehicle_registration'
  // FIXED: furn_check / insurance don't exist in REQUIRED_DOCS - map to real docs, don't create ghost types
  if (['furn check', 'furn'].includes(t)) return 'huru_criminal_check'
  if (['pdp', 'prdp', 'pdp doc', 'prdp doc'].includes(t)) return 'prdp'
  if (['insurance', 'insurance doc'].includes(t)) return 'vehicle_registration'
  return t.replace(/\s+/g, '_')
}

export function isFakeFile(filePath?: string | null): boolean {
  const normalizedPath = filePath?.trim().toLowerCase()
  if (!normalizedPath) return true
  // FIXED: Only flag placeholder URLs, NOT real filenames like test.jpg / dummy.jpg that drivers actually upload
  return ['example.com', 'placeholder', 'via.placeholder.com', 'picsum.photos', 'fake.jpg', 'dummy.jpg', 'bypassed.jpg'].some(value => normalizedPath.includes(value)) && normalizedPath.startsWith('http')
}

export function hasRealDocument(filePath?: string | null): boolean {
  if (!filePath?.trim()) return false
  if (isFakeFile(filePath)) return false
  return true
}

export const normalizeDriverDocType = normalizeDocType
export const normalizedDocType = normalizeDocType
export const normalizedDriverDocType = normalizeDocType
export const normalizeDoc = normalizeDocType
export const normalizeDriverDoc = normalizeDocType

function parseStorageRef(reference: string): { bucket: string, path: string } {
  const ref = reference.trim()
  if (/^https?:\/\//i.test(ref)) {
    try {
      const parsed = new URL(ref)
      // FIXED: Keep FULL path after bucket, not just last segment
      const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
      if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) }
      const parts = parsed.pathname.split('/').filter(Boolean)
      // Legacy: /driver-documents/user-id/file.jpg -> bucket = driver-documents, path = user-id/file.jpg
      if (parts.length >= 2) return { bucket: parts[0], path: decodeURIComponent(parts.slice(1).join('/')) }
    } catch {}
    return { bucket: 'driver-documents', path: ref.replace(/^\/+/, '') }
  }
  const separator = ref.indexOf(':')
  if (separator >= 0) {
    return { bucket: ref.slice(0, separator), path: ref.slice(separator+1).replace(/^\/+/, '').trim() }
  }
  return { bucket: 'driver-documents', path: ref.replace(/^\/+/, '').trim() }
}

export async function createDriverDocumentSignedUrl(filePath?: string | null): Promise<string> {
  if (!filePath?.trim()) throw new Error('No document uploaded yet')
  const reference = filePath.trim()
  if (isFakeFile(reference)) throw new Error('No real file uploaded - test data')

  const { bucket, path } = parseStorageRef(reference)

  if (!['driver-documents', 'vehicle-documents', 'profile-photos', 'safety-selfies', 'passenger-ids'].includes(bucket) || !path) {
    throw new Error('Unsupported driver document storage path: ' + bucket)
  }

  // FIXED: All buckets are PRIVATE - MUST use signed URL.
  // getPublicUrl on private bucket returns 403, so NEVER use it.
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error) throw new Error(`Could not load document: ${error.message}`)
  return data.signedUrl
}

export async function createPassengerDocumentSignedUrl(filePath: string): Promise<string> {
  return createDriverDocumentSignedUrl(filePath)
}

export function getRequiredDocsForRole(role: string) {
  if (role === 'passenger' || role === 'rider') return PASSENGER_DOCUMENTS
  return REQUIRED_DOCS
}