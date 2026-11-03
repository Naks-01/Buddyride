import { supabase } from './supabase'

export const REQUIRED_DOCS = [
  { type: 'sa_id', label: 'SA ID' },
  { type: 'drivers_license', label: 'Drivers License' },
  { type: 'prdp', label: 'PrDP' },
  { type: 'profile_photo', label: 'Profile Photo' },
  { type: 'selfie_holding_id', label: 'Selfie holding ID' },
  { type: 'vehicle_registration', label: 'Vehicle Registration Papers' },
  { type: 'license_disc', label: 'Licence Disc' },
  { type: 'car_photo_1', label: 'Vehicle Photo 1' },
  { type: 'car_photo_2', label: 'Vehicle Photo 2' },
  { type: 'car_photo_3', label: 'Vehicle Photo 3' },
  { type: 'car_photo_4', label: 'Vehicle Photo 4' },
]

export const REQUIRED_DOCS_ALL = REQUIRED_DOCS
export const DRIVER_DOCUMENTS = REQUIRED_DOCS
export const PASSENGER_DOCUMENTS = REQUIRED_DOCS
export type DriverDocumentType = string
export type DocumentRequirement = { type: string; label: string }

export function normalizeDocType(type: any): string {
  const t = String(type || '').toLowerCase().trim().replace(/[_/-]+/g,' ').replace(/\s+/g,' ')
  const vehiclePhoto = t.match(/^(?:vehicle|car) photo (\d+)$/)
  if (vehiclePhoto) return `car_photo_${vehiclePhoto[1]}`
  if (['profile', 'profile photo', 'profile photo selfie', 'selfie', 'photo'].includes(t)) return 'profile_photo'
  if (['sa id', 'sa id passport', 'id document', 'id doc', 'id', 'passport'].includes(t)) return 'sa_id'
  if (['drivers license', 'drivers licence', 'license', 'licence', 'drivers'].includes(t)) return 'drivers_license'
  if (['license disc', 'licence disc', 'disc', 'license doc'].includes(t)) return 'license_disc'
  if (['vehicle registration', 'vehicle registration papers'].includes(t)) return 'vehicle_registration'
  if (['furn check', 'vehicle photo', 'furn', 'vehicle'].includes(t)) return 'furn_check'
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
export function getRequiredDocsForRole(_role: string) { return REQUIRED_DOCS }