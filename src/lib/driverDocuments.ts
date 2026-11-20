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

// FIXED: Always canonical - so .has(canonical) and .has(raw) both work
export const EXPIRING_DRIVER_DOCUMENT_TYPES = new Set(
  REQUIRED_DOCS.filter(document => document.expiryRequired).map(document => normalizeDocType(document.type)),
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

// FIXED: Single source of truth - handles ALL variants: _, -, space, licence/license, singular/plural
export function normalizeDocType(type: any): string {
  if (!type) return ''
  const t = String(type).toLowerCase().trim().replace(/[_/-]+/g, ' ').replace(/\s+/g, ' ')

  // Vehicle photos - check BEFORE generic, because "vehicle photo 1" would otherwise fall through
  const vehiclePhoto = t.match(/^(?:vehicle|car) photos? (\d+)$/)
  if (vehiclePhoto) return 'vehicle_photo_' + vehiclePhoto[1]
  const interiorPhoto = t.match(/^vehicle interior photos? (\d+)$/)
  if (interiorPhoto) return 'vehicle_interior_photo_' + interiorPhoto[1]
  // Also handle "vehicle interior 1" without word "photo"
  const interiorShort = t.match(/^vehicle interior (\d+)$/)
  if (interiorShort) return 'vehicle_interior_photo_' + interiorShort[1]

  if (['profile', 'profile photo', 'profile picture', 'avatar'].includes(t)) return 'profile_photo'
  if (['selfie', 'selfie face verification', 'face selfie', 'selfie with id', 'face verification'].includes(t)) return 'selfie'

  if (t === 'passport') return 'passport'

  // SA ID - ALL aliases, including the ones that were creating ghost types
  if ([
    'sa id', 'sa id passport', 'id document', 'id doc', 'id', 'south african id',
    'sa id document', 'south african id document', 'south african id doc',
    'sa id card', 'id card', 'national id', 'south africa id'
  ].includes(t)) return 'sa_id'

  // Drivers License - ALL licence/license + singular/plural + driver/drivers
  if ([
    'drivers license', 'drivers licence', 'license', 'licence', 'drivers', 'driver license', 'driver licence',
    'drivers license card', 'drivers licence card', 'driver license card', 'driver licence card',
    'driving license', 'driving licence', 'drivers licence document', 'drivers license document'
  ].includes(t)) return 'drivers_license'

  if (['license disc', 'licence disc', 'disc', 'license doc', 'licence disc document', 'license disk', 'licence disk', 'disc document'].includes(t)) return 'license_disc'
  if (['vehicle registration', 'vehicle registration papers', 'registration', 'vehicle papers', 'registration papers', 'vehicle registration document'].includes(t)) return 'vehicle_registration'
  if (['huru criminal check', 'huru check', 'criminal check', 'police clearance', 'huru', 'furn check', 'furn'].includes(t)) return 'huru_criminal_check'
  if (['vehicle inspection report', 'inspection report', 'inspection', 'vehicle inspection'].includes(t)) return 'vehicle_inspection_report'
  if (t === 'vehicle photo') return 'vehicle_photo_1'
  if (t === 'vehicle') return 'vehicle_registration'
  if (['pdp', 'prdp', 'pdp doc', 'prdp doc', 'pdp prdp', 'professional driving permit'].includes(t)) return 'prdp'
  if (['insurance', 'insurance doc', 'insurance document'].includes(t)) return 'vehicle_registration'

  // Fallback: underscores, but also strip "document/doc" suffix if it creates ghost type
  // e.g. "sa id document" already handled above, this is for unknown future types
  return t.replace(/\s+/g, '_')
}

export function isFakeFile(filePath?: string | null): boolean {
  const normalizedPath = filePath?.trim().toLowerCase()
  if (!normalizedPath) return true
  // FIXED: Only flag placeholder URLs, NOT real filenames like test.jpg / dummy.jpg
  // Must be http AND contain placeholder domain, or be exactly a placeholder filename
  if (normalizedPath.startsWith('http')) {
    return ['example.com', 'placeholder', 'via.placeholder.com', 'picsum.photos', 'fake.jpg', 'bypassed.jpg'].some(value => normalizedPath.includes(value))
  }
  return false
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
      const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
      if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) }
      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) return { bucket: parts[0], path: decodeURIComponent(parts.slice(1).join('/')) }
    } catch {}
    return { bucket: 'driver-documents', path: ref.replace(/^\/+/, '') }
  }
  const separator = ref.indexOf(':')
  if (separator >= 0) {
    return { bucket: ref.slice(0, separator), path: ref.slice(separator + 1).replace(/^\/+/, '').trim() }
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

  // All buckets are PRIVATE - MUST use signed URL. getPublicUrl on private bucket returns 403.
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