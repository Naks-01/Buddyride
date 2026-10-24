export const CANONICAL_DOCS = [
  { label: 'Profile Photo', doc_type: 'profile_photo' },
  { label: 'SA ID', doc_type: 'sa_id' },
  { label: "Driver's License", doc_type: 'driver_license' },
  { label: 'PrDP', doc_type: 'prdp' },
  { label: 'Vehicle Papers', doc_type: 'vehicle_registration' },
  { label: 'License Disc', doc_type: 'license_disc' },
  { label: 'Huru Check', doc_type: 'huru_check' },
] as const

const docMap: Record<string, string> = {
  profile_photo: 'profile_photo',
  profile_selfie: 'profile_photo',
  selfie: 'huru_check',
  sa_id: 'sa_id',
  drivers_license: 'driver_license',
  driver_license: 'driver_license',
  prdp: 'prdp',
  vehicle_papers: 'vehicle_registration',
  vehicle_registration: 'vehicle_registration',
  license_disc: 'license_disc',
  huru_check: 'huru_check',
}

export function normalizeDriverDocType(docType: string) {
  return docMap[docType] || docType
}
