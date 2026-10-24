import { supabase } from './supabase'

export const REQUIRED_DOCS = [
  { label: 'Profile Photo', type: 'profile_photo' },
  { label: 'SA ID', type: 'sa_id' },
  { label: "Driver's License", type: 'driver_license' },
  { label: 'PrDP', type: 'prdp' },
  { label: 'Vehicle Papers', type: 'vehicle_registration' },
  { label: 'License Disc', type: 'license_disc' },
  { label: 'Huru Check', type: 'huru_check' },
] as const

const docMap: Record<string, string> = {
  profile_photo: 'profile_photo',
  profile_selfie: 'profile_photo',
  selfie: 'huru_check',
  id: 'sa_id',
  sa_id: 'sa_id',
  license: 'driver_license',
  drivers_license: 'driver_license',
  driver_license: 'driver_license',
  pdp: 'prdp',
  prdp: 'prdp',
  car_papers: 'vehicle_registration',
  vehicle_papers: 'vehicle_registration',
  vehicle_registration: 'vehicle_registration',
  disc: 'license_disc',
  license_disc: 'license_disc',
  huru: 'huru_check',
  huru_check: 'huru_check',
}

export function normalizeDriverDocType(docType: string) {
  return docMap[docType] || docType
}

export async function createDriverDocumentSignedUrl(fileUrlOrPath: string) {
  const bucketMarker = '/driver-documents/'
  let objectPath = fileUrlOrPath

  if (/^https?:\/\//i.test(fileUrlOrPath)) {
    const parsedUrl = new URL(fileUrlOrPath)
    const markerIndex = parsedUrl.pathname.indexOf(bucketMarker)
    if (markerIndex < 0) return fileUrlOrPath
    objectPath = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + bucketMarker.length))
  }

  const { data, error } = await supabase.storage
    .from('driver-documents')
    .createSignedUrl(objectPath, 60)
  if (error) throw error
  return data.signedUrl
}
