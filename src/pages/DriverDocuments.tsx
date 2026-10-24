import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CANONICAL_DOCS, normalizeDriverDocType } from '../lib/driverDocuments'

type StoredDocument = {
  id: string
  doc_type: string
  status: 'pending' | 'approved' | 'rejected'
  file_url: string
  rejection_reason?: string | null
}

const statusStyles = {
  missing: { label: 'Missing', color: '#fde68a', background: '#713f12' },
  pending: { label: 'Pending', color: '#93c5fd', background: '#1e3a8a' },
  approved: { label: 'Approved', color: '#86efac', background: '#14532d' },
  rejected: { label: 'Rejected', color: '#fca5a5', background: '#7f1d1d' },
}

export function DriverDocuments({ driverId, onBack }: { driverId: string, onBack: () => void }) {
  const [docs, setDocs] = useState<StoredDocument[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function load() {
    setError('')
    const { data, error: loadError } = await supabase
      .from('driver_documents')
      .select('id,doc_type,status,file_url,rejection_reason')
      .eq('driver_id', driverId)

    if (loadError) {
      setError(`Could not load documents: ${loadError.message}`)
    } else {
      setDocs((data || []) as StoredDocument[])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [driverId])

  async function doUpload(docType: string, file: File) {
    setUploading(docType)
    setError('')
    setToast('')
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${driverId}/${docType}-${Date.now()}`
      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(path, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
          cacheControl: '3600',
        })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('driver-documents').getPublicUrl(path)
      const { error: dbError } = await supabase.from('driver_documents').upsert({
        driver_id: driverId,
        doc_type: docType,
        file_url: urlData.publicUrl,
        status: 'pending',
        rejection_reason: null,
      }, { onConflict: 'driver_id,doc_type' })
      if (dbError) throw dbError

      await load()
      setToast('Submitted - waiting for admin approval')
    } catch (uploadError: unknown) {
      const message = uploadError instanceof Error ? uploadError.message : String(uploadError)
      setError(`Upload failed: ${message}`)
    } finally {
      setUploading(null)
    }
  }

  const approvedCount = CANONICAL_DOCS.filter((requirement) => docs.some((doc) =>
    normalizeDriverDocType(doc.doc_type) === requirement.doc_type && doc.status.toLowerCase() === 'approved',
  )).length

  return (
    <div style={{ padding: '16px', background: '#0e0e10', minHeight: '100vh', color: 'white' }}>
      <button onClick={onBack} style={{ marginBottom: 12, background: '#242428', color: 'white', border: '1px solid #333', padding: '8px 12px', borderRadius: 8 }}>
        ← Back
      </button>
      <h2 style={{ margin: '0 0 4px' }}>My Documents</h2>
      <p style={{ color: '#9ca3af', marginTop: 6 }}>Profile progress: {approvedCount}/7 approved</p>
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      {toast && <p role="status" style={{ color: '#86efac' }}>{toast}</p>}
      {loading && <p style={{ color: '#9ca3af' }}>Loading documents…</p>}

      {CANONICAL_DOCS.map((requirement) => {
        const matchingDocs = docs.filter((item) => normalizeDriverDocType(item.doc_type) === requirement.doc_type)
        const doc = matchingDocs.find((item) => item.status.toLowerCase() === 'approved')
          || matchingDocs.find((item) => item.doc_type === requirement.doc_type)
          || matchingDocs[0]
        const status = doc?.status.toLowerCase() === 'approved'
          ? 'approved'
          : doc?.status.toLowerCase() === 'rejected'
            ? 'rejected'
            : doc
              ? 'pending'
              : 'missing'
        const badge = statusStyles[status]
        const action = status === 'missing'
          ? 'Upload'
          : status === 'rejected'
            ? 'Re-upload'
            : 'View'

        return (
          <div
            key={requirement.doc_type}
            style={{
              background: '#18181b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: 12,
              marginTop: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong>{requirement.label}</strong>
              <div style={{ marginTop: 6 }}>
                <span style={{ color: badge.color, background: badge.background, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                  {badge.label}
                </span>
              </div>
              {status === 'rejected' && doc?.rejection_reason && (
                <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 6 }}>
                  Reason: {doc.rejection_reason}
                </div>
              )}
            </div>
            {doc && status !== 'rejected' ? (
              <a
                href={doc?.file_url}
                target="_blank"
                rel="noreferrer"
                style={{ flexShrink: 0, color: 'white', background: '#374151', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
              >
                View
              </a>
            ) : (
              <label style={{ flexShrink: 0, color: 'white', background: uploading === requirement.doc_type ? '#555' : '#00a86b', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: uploading === requirement.doc_type ? 'wait' : 'pointer', fontWeight: 700 }}>
                {uploading === requirement.doc_type ? 'Uploading…' : action}
                <input
                  hidden
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploading !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void doUpload(requirement.doc_type, file)
                    event.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
