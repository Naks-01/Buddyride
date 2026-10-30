import { supabase } from './supabase'

export const REQUIRED_DOCS = [
  { type: 'sa_id', label: 'SA ID' },
  { type: 'drivers_license', label: 'Drivers License' },
  { type: 'license_disc', label: 'License Disc' },
  { type: 'furn_check', label: 'Vehicle Photo' },
  { type: 'profile_photo', label: 'Profile Photo' },
  { type: 'pdp', label: 'PrDP' },
  { type: 'insurance', label: 'Insurance' },
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
  if (['license_disc','license-disc','vehicle_registration','vehicle-registration','disc','license_doc'].includes(t)) return 'license_disc'
  if (['furn_check','furn-check','vehicle_photo','vehicle-photo','furn','vehicle'].includes(t)) return 'furn_check'
  if (['pdp','prdp','pdp_doc','prdp_doc'].includes(t)) return 'pdp'
  if (['insurance','insurance_doc'].includes(t)) return 'insurance'
  return t
}

export const normalizeDriverDocType = normalizeDocType
export const normalizedDocType = normalizeDocType
export const normalizedDriverDocType = normalizeDocType
export const normalizeDoc = normalizeDocType
export const normalizeDriverDoc = normalizeDocType

export async function createDriverDocumentSignedUrl(filePath: string): Promise<string> {
  try {
    const { data, error } = await supabase.storage.from('driver-documents').createSignedUrl(filePath, 60)
    if (error) throw error
    return data.signedUrl
  } catch { return '' }
}
export async function createPassengerDocumentSignedUrl(filePath: string): Promise<string> { 
  return createDriverDocumentSignedUrl(filePath) 
}
export function getRequiredDocsForRole(_role: string) { return REQUIRED_DOCS }