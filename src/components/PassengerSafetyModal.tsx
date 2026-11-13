import type { FormEvent } from 'react'

export type PassengerIdMethod = 'id_photo' | 'id_number'

type PassengerSafetyModalProps = {
  dark: boolean
  avatarUrl: string | null
  idDocumentUrl: string | null
  idNumber: string
  idMethod: PassengerIdMethod
  paymentMethod: 'cash' | 'paystack'
  loading: boolean
  uploading: boolean
  error: string
  onIdNumberChange: (value: string) => void
  onIdMethodChange: (method: PassengerIdMethod) => void
  onPaymentMethodChange: (method: 'cash' | 'paystack') => void
  onOpenCamera: (type: 'passenger_selfie' | 'passenger_id') => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function PassengerSafetyModal({
  dark,
  avatarUrl,
  idDocumentUrl,
  idNumber,
  idMethod,
  paymentMethod,
  loading,
  uploading,
  error,
  onIdNumberChange,
  onIdMethodChange,
  onPaymentMethodChange,
  onOpenCamera,
  onSubmit,
  onClose,
}: PassengerSafetyModalProps) {
  const bg = dark ? '#18181b' : '#fff'
  const bg2 = dark ? '#27272a' : '#f4f4f5'
  const text = dark ? '#fff' : '#18181b'
  const muted = dark ? '#a1a1aa' : '#71717a'
  const border = dark ? '#3f3f46' : '#e4e4e7'

  // FIX: Validate the SELECTED method only - old code accepted photo OR number regardless of tab, so admin got incomplete verification
  const idComplete = idMethod === 'id_photo' ? !!idDocumentUrl : !!idNumber.trim()
  const canSubmit = !!avatarUrl && idComplete && !loading && !uploading

  return <div role="dialog" aria-modal="true" aria-labelledby="passenger-safety-title" style={{ position: 'fixed', inset: 0, zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.72)' }}>
    <form onSubmit={onSubmit} style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', padding: 20, borderRadius: 20, background: bg, color: text, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h2 id="passenger-safety-title" style={{ margin: 0, fontSize: 21 }}>Quick Safety Check - For Your Safety</h2>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: 13 }}>We verify your ID to keep drivers safe</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close safety check" style={{ width: 36, height: 36, borderRadius: 18, border: `1px solid ${border}`, background: bg2, color: text }}>✕</button>
      </div>

      <section style={{ display: 'grid', gap: 10, padding: 14, marginBottom: 14, borderRadius: 14, border: `1px solid ${border}` }}>
        <div>
          <strong>Section 1: Selfie (Mandatory)</strong>
          <p style={{ margin: '4px 0 0', color: muted, fontSize: 13 }}>Take a clear selfie to continue.</p>
        </div>
        <button type="button" disabled={uploading} onClick={() => onOpenCamera('passenger_selfie')} style={{ minHeight: 44, padding: 10, borderRadius: 10, border: 0, background: avatarUrl ? '#15803d' : '#ff7a00', color: '#fff', fontWeight: 700, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'Uploading…' : avatarUrl ? '✓ Selfie saved — Retake' : '📸 Take selfie'}
        </button>
      </section>

      <section style={{ display: 'grid', gap: 12, padding: 14, marginBottom: 14, borderRadius: 14, border: `1px solid ${border}` }}>
        <strong>Section 2: ID Verification (Choose 1)</strong>
        <div role="tablist" aria-label="ID verification method" style={{ display: 'flex', gap: 8 }}>
          <button type="button" role="tab" aria-selected={idMethod === 'id_photo'} onClick={() => onIdMethodChange('id_photo')} style={{ flex: 1, minHeight: 44, padding: 8, borderRadius: 10, border: `1px solid ${idMethod === 'id_photo' ? '#ff7a00' : border}`, background: idMethod === 'id_photo' ? (dark ? '#3a2a1a' : '#fff3e0') : bg2, color: text, fontWeight: 700 }}>📸 Photo ID</button>
          <button type="button" role="tab" aria-selected={idMethod === 'id_number'} onClick={() => onIdMethodChange('id_number')} style={{ flex: 1, minHeight: 44, padding: 8, borderRadius: 10, border: `1px solid ${idMethod === 'id_number' ? '#ff7a00' : border}`, background: idMethod === 'id_number' ? (dark ? '#3a2a1a' : '#fff3e0') : bg2, color: text, fontWeight: 700 }}>🔢 Type ID Number</button>
        </div>
        {idMethod === 'id_photo' ? <>
          <button type="button" disabled={uploading} onClick={() => onOpenCamera('passenger_id')} style={{ minHeight: 44, padding: 10, borderRadius: 10, border: 0, background: idDocumentUrl ? '#15803d' : '#ff7a00', color: '#fff', fontWeight: 700, opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'Uploading…' : idDocumentUrl ? '✓ Photo ID saved — Retake' : '📸 Take photo of SA ID / Passport'}
          </button>
        </> : <>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
            ID Number
            <input value={idNumber} onChange={event => onIdNumberChange(event.target.value)} autoComplete="off" maxLength={32} placeholder="13-digit SA ID or passport number" style={{ width: '100%', height: 44, minHeight: 44, marginTop: 0, padding: '10px 12px', borderRadius: 10, border: `1px solid ${border}`, background: bg2, color: text, boxSizing: 'border-box' }} />
          </label>
          <p style={{ margin: 0, color: muted, fontSize: 13 }}>We will verify this with Home Affairs later</p>
        </>}
      </section>

      <section style={{ display: 'grid', gap: 8, padding: 14, marginBottom: 14, borderRadius: 14, border: `1px solid ${border}` }}>
        <strong>Payment</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['cash', 'Cash'], ['paystack', 'Card']] as const).map(([method, label]) => (
            <button key={method} type="button" aria-pressed={paymentMethod === method} onClick={() => onPaymentMethodChange(method)} style={{ flex: 1, minHeight: 42, borderRadius: 10, border: `1px solid ${paymentMethod === method ? '#ff7a00' : border}`, background: paymentMethod === method ? (dark ? '#3a2a1a' : '#fff3e0') : bg2, color: text, fontWeight: 700 }}>{label}{method === 'cash' ? ' (default)' : ''}</button>
          ))}
        </div>
      </section>

      {error && <p role="alert" style={{ margin: '0 0 12px', color: '#dc2626', fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={!canSubmit} style={{ width: '100%', minHeight: 50, padding: 12, borderRadius: 12, border: 0, background: loading || uploading ? '#555' : '#16a34a', color: '#fff', fontWeight: 800, opacity: !canSubmit ? 0.6 : 1 }}>
        {loading ? 'Submitting…' : 'Submit for Admin Approval'}
      </button>
    </form>
  </div>
}