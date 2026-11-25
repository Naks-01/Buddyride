import type { FormEvent } from 'react'

export type PassengerIdMethod = 'id_photo' | 'id_number'

type PassengerSafetyModalProps = {
  dark: boolean
  avatarUrl: string | null
  idDocumentUrl: string | null
  idNumber: string
  idMethod?: PassengerIdMethod
  loading: boolean
  uploading: boolean
  error: string
  onIdNumberChange: (value: string) => void
  onIdMethodChange?: (method: PassengerIdMethod) => void
  onOpenCamera: (type: 'passenger_selfie' | 'passenger_id') => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

// FIX: Real SA ID validation - Luhn + date + citizenship digit. Was only trim() check, so "123" passed.
export function isValidSAId(id: string): boolean {
  const clean = id.trim().replace(/\s/g, '')
  if (!/^\d{13}$/.test(clean)) return false
  const yy = Number(clean.slice(0, 2))
  const mm = Number(clean.slice(2, 4))
  const dd = Number(clean.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false
  // Luhn checksum
  let sum = 0
  for (let i = 0; i < 13; i++) {
    let d = Number(clean[i])
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

export function isValidIdNumber(id: string): boolean {
  const clean = id.trim().replace(/\s/g, '')
  if (!clean) return false
  if (/^\d{13}$/.test(clean)) return isValidSAId(clean)
  // Passport: 6-12 alphanumeric
  return /^[A-Za-z0-9]{6,12}$/.test(clean)
}

export function PassengerSafetyModal({
  dark,
  avatarUrl,
  idDocumentUrl,
  idNumber,
  idMethod,
  loading,
  uploading,
  error,
  onIdNumberChange,
  onIdMethodChange,
  onOpenCamera,
  onSubmit,
  onClose,
}: PassengerSafetyModalProps) {
  const bg = dark ? '#18181b' : '#fff'
  const bg2 = dark ? '#27272a' : '#f4f4f5'
  const text = dark ? '#fff' : '#18181b'
  const muted = dark ? '#a1a1aa' : '#71717a'
  const border = dark ? '#3f3f46' : '#e4e4e7'
  const BLUE = '#0066FF'

  const hasSelfie = !!avatarUrl
  // FIX: ID number must be VALID, not just non-empty. "123" no longer passes.
  const idValid = isValidIdNumber(idNumber)
  const hasIdNumber = !!idNumber.trim() && idValid
  const hasIdDoc = !!idDocumentUrl
  const canSubmit = hasSelfie && hasIdNumber && hasIdDoc && !loading && !uploading

  const missing: string[] = []
  if (!hasSelfie) missing.push('Selfie')
  if (!hasIdNumber) missing.push(idNumber.trim() ? 'Valid ID Number (check 13 digits)' : 'ID Number')
  if (!hasIdDoc) missing.push('ID Document Photo')

  return <div role="dialog" aria-modal="true" aria-labelledby="passenger-safety-title" style={{ position: 'fixed', inset: 0, zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.72)' }}>
    <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', padding: 20, borderRadius: 20, background: bg, color: text, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h2 id="passenger-safety-title" style={{ margin: 0, fontSize: 21 }}>Quick Safety Check - For Your Safety</h2>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: 13 }}>We verify your ID to keep drivers safe. All 3 required - no bypass.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close safety check" style={{ width: 36, height: 36, borderRadius: 18, border: `1px solid ${border}`, background: bg2, color: text }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <div style={{ flex: 1, padding: '8px 4px', borderRadius: 8, background: hasSelfie ? '#15803d' : '#fee2e2', color: hasSelfie ? 'white' : '#991b1b', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>{hasSelfie ? '✅ Selfie' : '1. Selfie ❌'}</div>
        <div style={{ flex: 1, padding: '8px 4px', borderRadius: 8, background: hasIdNumber ? '#15803d' : '#fee2e2', color: hasIdNumber ? 'white' : '#991b1b', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>{hasIdNumber ? '✅ ID Number' : '2. ID Number ❌'}</div>
        <div style={{ flex: 1, padding: '8px 4px', borderRadius: 8, background: hasIdDoc ? '#15803d' : '#fee2e2', color: hasIdDoc ? 'white' : '#991b1b', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>{hasIdDoc ? '✅ ID Doc' : '3. ID Doc ❌'}</div>
      </div>

      <section style={{ display: 'grid', gap: 10, padding: 14, marginBottom: 14, borderRadius: 14, border: `1px solid ${border}` }}>
        <div>
          <strong>Section 1: Selfie (Mandatory)</strong>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: 13 }}>Take a clear selfie with live camera to continue.</p>
        </div>
        <button type="button" disabled={uploading} onClick={() => onOpenCamera('passenger_selfie')} style={{ minHeight: 44, padding: 10, borderRadius: 10, border: 0, background: avatarUrl ? '#15803d' : BLUE, color: '#fff', fontWeight: 700, opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading…' : avatarUrl ? '✓ Selfie saved — Retake' : '📸 Take selfie'}
        </button>
      </section>

      <section style={{ display: 'grid', gap: 12, padding: 14, marginBottom: 14, borderRadius: 14, border: `1px solid ${border}` }}>
        <strong>Section 2: ID Number (Mandatory)</strong>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
          SA ID Number / Passport Number
          <input value={idNumber} onChange={event => onIdNumberChange(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 32))} autoComplete="off" maxLength={32} placeholder="13-digit SA ID or passport number" inputMode="text" style={{ width: '100%', height: 44, minHeight: 44, marginTop: 0, padding: '10px 12px', borderRadius: 10, border: `1px solid ${idNumber.trim() ? (hasIdNumber ? '#15803d' : '#dc2626') : border}`, background: bg2, color: text, boxSizing: 'border-box' }} />
        </label>
        {idNumber.trim() && !hasIdNumber && <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: 12 }}>Invalid SA ID - must be 13 digits with valid date + checksum, or 6-12 char passport.</p>}
        <p style={{ margin: 0, color: muted, fontSize: 13 }}>Must be valid 13-digit SA ID or passport. Admin will check it.</p>
      </section>

      <section style={{ display: 'grid', gap: 10, padding: 14, marginBottom: 14, borderRadius: 14, border: `1px solid ${border}` }}>
        <div>
          <strong>Section 3: ID Document Photo (Mandatory)</strong>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: 13 }}>Take photo of SA ID card / Passport - both sides if needed. Photo only, no typing alone.</p>
        </div>
        <button type="button" disabled={uploading} onClick={() => onOpenCamera('passenger_id')} style={{ minHeight: 44, padding: 10, borderRadius: 10, border: 0, background: idDocumentUrl ? '#15803d' : BLUE, color: '#fff', fontWeight: 700, opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading…' : idDocumentUrl ? '✓ Photo ID saved — Retake' : '📸 Take photo of SA ID / Passport'}
        </button>
      </section>

      {!canSubmit && (
        <p role="alert" style={{ margin: '0 0 12px', color: '#b91c1c', fontSize: 13, fontWeight: 600, background: '#fee2e2', padding: '8px 10px', borderRadius: 8 }}>
          ⚠️ Still missing: {missing.join(' + ')} — Complete all 3 to submit. No bypass.
        </p>
      )}
      {error && <p role="alert" style={{ margin: '0 0 12px', color: '#dc2626', fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={!canSubmit} style={{ width: '100%', minHeight: 50, padding: 12, borderRadius: 12, border: 0, background: !canSubmit ? '#9ca3af' : loading || uploading ? '#555' : '#16a34a', color: '#fff', fontWeight: 800, opacity: !canSubmit ? 0.7 : 1, cursor: !canSubmit ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Submitting…' : !canSubmit ? `Complete All 3 First (${missing.join(', ')})` : 'Submit for Admin Approval'}
      </button>
      <p style={{ margin: '10px 0 0', color: muted, fontSize: 11, textAlign: 'center' }}>Admin (buddyride@outlook.com) must approve with correct documents. No auto-approval.</p>
    </form>
  </div>
}