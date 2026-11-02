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
  const t = String(type || '').toLowerCase().trim().replace(/-/g,'_')
  if (['profile','profile_photo','photo'].includes(t)) return 'profile_photo'
  if (['sa_id','sa-id','id_doc','id'].includes(t)) return 'sa_id'
  if (['drivers_license','drivers-license','license','drivers'].includes(t)) return 'drivers_license'
  if (['license_disc','disc','license_doc'].includes(t)) return 'license_disc'
  if (['furn_check','furn-check','vehicle_photo','vehicle-photo','furn','vehicle'].includes(t)) return 'furn_check'
  if (['pdp','prdp','pdp_doc','prdp_doc'].includes(t)) return 'prdp'
  if (['insurance','insurance_doc'].includes(t)) return 'insurance'
  return t
}

export const normalizeDriverDocType = normalizeDocType
export const normalizedDocType = normalizeDocType
export const normalizedDriverDocType = normalizeDocType
export const normalizeDoc = normalizeDocType
export const normalizeDriverDoc = normalizeDocType

export async function createDriverDocumentSignedUrl(filePath: string): Promise<string> {
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