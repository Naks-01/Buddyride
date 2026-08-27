// SA National Land Transport Act (NLTA) passenger ID verification config
export const VERIFICATION = {
  required: true,
  idNumberRegex: /^(\d{13})$/,
  selfieRequired: true,
  allowCashBeforeVerified: false,
  maxSelfieSizeBytes: 5 * 1024 * 1024, // 5MB
};

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'failed';
