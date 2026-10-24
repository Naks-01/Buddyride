import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createDriverDocumentSignedUrl, REQUIRED_DOCS, normalizeDriverDocType } from '../lib/driverDocuments'

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
      const path = `${driverId}/${docType}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('driver-documents')
        .upload(path, file, {
          upsert: true,
          contentType: file.type || 'application/octet-stream',
          cacheControl: '3600',
        })
      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from('driver_documents').upsert({
        driver_id: driverId,
        doc_type: docType,
        file_url: path,
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

  async function viewDocument(fileUrl: string) {
    const newWindow = window.open('about:blank', '_blank')
    try {
      const signedUrl = await createDriverDocumentSignedUrl(fileUrl)
      if (newWindow) newWindow.location.href = signedUrl
      else window.location.href = signedUrl
    } catch (viewError: unknown) {
      newWindow?.close()
      const message = viewError instanceof Error ? viewError.message : String(viewError)
      setError(`Could not open document: ${message}`)
    }
  }

  const approvedCount = REQUIRED_DOCS.filter((requirement) => docs.some((doc) =>
    normalizeDriverDocType(doc.doc_type) === requirement.type && doc.status.toLowerCase() === 'approved',
  )).length

  return (
    <div style={{ padding: '16px', background: '#0e0e10', minHeight: '100vh', color: 'white' }}>
      <button onClick={onBack} style={{ marginBottom: 12, background: '#242428', color: 'white', border: '1px solid #333', padding: '8px 12px', borderRadius: 8 }}>
        ← Back
      </button>
      <h2 style={{ margin: '0 0 4px' }}>My Documents</h2>
      <p style={{ color: '#9ca3af', marginTop: 6 }}>Your 7 driver verification documents. {approvedCount}/7 Approved</p>
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      {toast && <p role="status" style={{ color: '#86efac' }}>{toast}</p>}
      {loading && <p style={{ color: '#9ca3af' }}>Loading documents…</p>}

      {REQUIRED_DOCS.map((requirement) => {
        const matchingDocs = docs.filter((item) => normalizeDriverDocType(item.doc_type) === requirement.type)
        const doc = matchingDocs.find((item) => item.status.toLowerCase() === 'approved')
          || matchingDocs.find((item) => item.doc_type === requirement.type)
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
            key={requirement.type}
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
              <button
                type="button"
                onClick={() => void viewDocument(doc.file_url)}
                style={{ flexShrink: 0, color: 'white', background: '#374151', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
              >
                View
              </button>
            ) : (
              <label style={{ flexShrink: 0, color: 'white', background: uploading === requirement.type ? '#555' : '#00a86b', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: uploading === requirement.type ? 'wait' : 'pointer', fontWeight: 700 }}>
                {uploading === requirement.type ? 'Uploading…' : action}
                <input
                  hidden
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploading !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void doUpload(requirement.type, file)
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
