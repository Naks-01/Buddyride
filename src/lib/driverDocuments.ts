export const REQUIRED_DOCS = [
  { type: 'profile_photo', label: 'Profile Photo' },
  { type: 'sa_id', label: 'SA ID' },
  { type: 'drivers_license', label: "Driver's License" },
  { type: 'prdp', label: 'PrDP' },
  { type: 'vehicle_papers', label: 'Vehicle Papers' },
  { type: 'license_disc', label: 'License Disc' },
  { type: 'huru_check', label: 'Huru Check' },
] as const

export function normalizeDriverDocType(input: string): string {
  if (!input) return ''
  const lower = input.toLowerCase().trim().replace(/\s+/g, '_')
  const map: Record<string, string> = {
    'profile_photo': 'profile_photo',
    'profile-photo': 'profile_photo',
    'profile_photo': 'profile_photo',
    'sa_id': 'sa_id',
    'sa-id': 'sa_id',
    'drivers_license': 'drivers_license',
    'driver_license': 'drivers_license',
    'prdp': 'prdp',
    'vehicle_papers': 'vehicle_papers',
    'vehicle_registration': 'vehicle_papers',
    'license_disc': 'license_disc',
    'huru_check': 'huru_check',
  }
  // direct map or fallback
  if (map[lower]) return map[lower]
  // handle with spaces
  const spaceKey = input.toLowerCase().trim()
  const spaceMap: Record<string, string> = {
    'profile photo': 'profile_photo',
    'sa id': 'sa_id',
    'drivers license': 'drivers_license',
    "driver's license": 'drivers_license',
    'vehicle papers': 'vehicle_papers',
    'vehicle registration': 'vehicle_papers',
    'license disc': 'license_disc',
    'huru check': 'huru_check',
  }
  return spaceMap[spaceKey] || lower
}