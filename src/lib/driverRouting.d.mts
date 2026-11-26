export function getDriverEntryPath(
  role: string,
  verificationStatus: string | null | undefined,
  currentPath: string
): string | null;

export function isDriverOnboardingPath(path: string): boolean;

export function isDriverDashboardPath(path: string): boolean;

export function shouldBlockDriverOnline(
  verificationStatus: string | null | undefined,
  docsOk: boolean,
  vehicleOk: boolean
): boolean;