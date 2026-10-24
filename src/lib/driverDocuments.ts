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
