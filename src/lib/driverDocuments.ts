import { supabase } from './supabase'
export const REQUIRED_DOCS = [
  { type: 'profile_photo', label: 'Profile Photo' },
  { type: 'sa_id', label: 'SA ID' },
  { type: 'drivers_license', label: 'Drivers License' },
  { type: 'vehicle_registration', label: 'Vehicle Registration' },
  { type: 'vehicle_photo', label: 'Vehicle Photo' },
  { type: 'pdp', label: 'PrDP' },
  { type: 'insurance', label: 'Insurance' },
]
export const REQUIRED_DOCS_ALL = REQUIRED_DOCS
export const DRIVER_DOCUMENTS = REQUIRED_DOCS
export const PASSENGER_DOCUMENTS = REQUIRED_DOCS
export type DriverDocumentType = string
export type DocumentRequirement = { type: string; label: string }
export function normalizeDocType(type: any): string { return String(type || '').toLowerCase().trim() }
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
export async function createPassengerDocumentSignedUrl(filePath: string): Promise<string> { return createDriverDocumentSignedUrl(filePath) }
export function getRequiredDocsForRole(_role: string) { return REQUIRED_DOCS }
