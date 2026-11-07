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
  if (['selfie', 'selfie face verification', 'face selfie'].includes(t)) return 'selfie'
  if (['sa id', 'sa id passport', 'id document', 'id doc', 'id', 'passport'].includes(t)) return 'sa_id'
  if (['drivers license', 'drivers licence', 'license', 'licence', 'drivers'].includes(t)) return 'drivers_license'
  if (['license disc', 'licence disc', 'disc', 'license doc'].includes(t)) return 'license_disc'
  if (['vehicle registration', 'vehicle registration papers'].includes(t)) return 'vehicle_registration'
  if (['huru criminal check', 'huru check'].includes(t)) return 'huru_criminal_check'
  if (['vehicle inspection report', 'inspection report'].includes(t)) return 'vehicle_inspection_report'
  if (t === 'vehicle photo') return 'vehicle_photo_1'
  if (t === 'vehicle') return 'vehicle_registration'
  if (['furn check', 'furn'].includes(t)) return 'furn_check'
  if (['pdp', 'prdp', 'pdp doc', 'prdp doc'].includes(t)) return 'prdp'
  if (['insurance', 'insurance doc'].includes(t)) return 'insurance'
  return t.replace(/\s+/g, '_')
}

export function isFakeFile(filePath?: string | null): boolean {
  const normalizedPath = filePath?.trim().toLowerCase()
  return !normalizedPath
    || ['example.com', 'test', 'placeholder', 'bypassed.jpg'].some(value => normalizedPath.includes(value))
}

export const normalizeDriverDocType = normalizeDocType
export const normalizedDocType = normalizeDocType
export const normalizedDriverDocType = normalizeDocType
export const normalizeDoc = normalizeDocType
export const normalizeDriverDoc = normalizeDocType

export async function createDriverDocumentSignedUrl(filePath?: string | null): Promise<string> {
  if (!filePath?.trim()) {
    throw new Error('No document uploaded yet')
  }
  filePath = filePath.trim()
  if (isFakeFile(filePath)) {
    throw new Error('No real file uploaded - test data')
  }
  if (/^https?:\/\//i.test(filePath)) return filePath
  const separator = filePath.indexOf(':')
  const bucket = separator >= 0 ? filePath.slice(0, separator) : 'driver-documents'
  const path = separator >= 0 ? filePath.slice(separator + 1) : filePath
  if (!['driver-documents', 'vehicle-documents', 'profile-photos'].includes(bucket) || !path) {
    throw new Error('Unsupported driver document storage path')
  }
  if (bucket === 'profile-photos') {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}
export async function createPassengerDocumentSignedUrl(filePath: string): Promise<string> {
  return createDriverDocumentSignedUrl(filePath)
}

export function getRequiredDocsForRole(role: string) {
  if (role === 'passenger' || role === 'rider') return PASSENGER_DOCUMENTS
  return REQUIRED_DOCS
}