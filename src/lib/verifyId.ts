import { VERIFICATION } from '../config/verification';

/**
 * Validates a 13-digit South African ID number using the Luhn checksum
 * algorithm required by the Department of Home Affairs.
 */
export function isValidSAID(id: string): boolean {
  if (!VERIFICATION.idNumberRegex.test(id)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(id[i]);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(id[12]);
}

/** Returns the last 4 digits for display, e.g. "**** 8088". */
export function getIdLast4(id: string): string {
  return `**** ${id.slice(-4)}`;
}

/** SHA-256 hash of the ID number, used only for duplicate detection. Never store the raw ID. */
export async function hashIdNumber(id: string): Promise<string> {
  const encoded = new TextEncoder().encode(id);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface SelfieValidationResult {
  valid: boolean;
  error?: string;
}

/** Validates a selfie upload: must be an image under the configured size limit. */
export function validateSelfie(file: File): SelfieValidationResult {
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }
  if (file.size > VERIFICATION.maxSelfieSizeBytes) {
    return { valid: false, error: 'Image must be smaller than 5MB' };
  }
  return { valid: true };
}
