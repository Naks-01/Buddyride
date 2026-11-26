"use client"
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { normalizeDocType as canonicalType, REQUIRED_DOCS } from '../lib/driverDocuments'

const BLUE = '#0066FF'
const BLUE_LIGHT = '#E6F0FF'
const BLUE_DARK = '#0052CC'
const TOTAL_EXPECTED = REQUIRED_DOCS.length
const IDENTITY_TYPES = new Set(['profile_photo', 'selfie', 'sa_id', 'drivers_license'])

type DocRow = { name: string, reason: string, status: string }

export function DriverPendingPage({ onApproved }: { onApproved?: () => void }) {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('pending_verification')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [rejectedDocs, setRejectedDocs] = useState<DocRow[]>([])
  const [pendingDocs, setPendingDocs] = useState<DocRow[]>([])
  const [approvedCount, setApprovedCount] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [identityCount, setIdentityCount] = useState(0)
  const [missingDocs, setMissingDocs] = useState<string[]>([])
  const [hasIdNumbers, setHasIdNumbers] = useState(false)
  const [licenseExpiryMissing, setLicenseExpiryMissing] = useState(false)
  const [vehicleDetails, setVehicleDetails] = useState({ year: '', make_model: '', colour: '', registration: '' })
  const [selectedZones, setSelectedZones] = useState<string[]>([])
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({})
  const [selectedRideType, setSelectedRideType] = useState('')
  const [bundleCredits, setBundleCredits] = useState<number | null>(null)
  const checkingRef = useRef(false)
  const needsRecheckRef = useRef(false)

  const normalizeKey = (raw: string) => {
    const t = String(raw || '').toLowerCase().trim()
    if (t.includes('prdp') || t.includes('pdp') || t === 'professional_driving_permit' || t.includes('pr_dp')) return 'prdp'
    return canonicalType(raw || '')
  }
  const prettyName = (key: string) => {
    const k = normalizeKey(key)
    if (k === 'sa_id') return 'SA ID'
    if (k === 'drivers_license') return 'Drivers License'
    if (k === 'license_disc') return 'License Disc'
    if (k === 'prdp') return 'PrDP'
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  const ALL_DOCS = REQUIRED_DOCS.map(d => normalizeKey(d.type))

  async function checkStatus() {
    if (checkingRef.current) { needsRecheckRef.current = true; return }
    checkingRef.current = true; setChecking(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Not logged in - please log in again'); return }
      const [profileRes, docsRes, zonesRes, vehicleRes, bundlesRes] = await Promise.all([
        supabase.from('profiles').select('phone_number, phone, verification_status, is_verified, verification_rejection_reason, id_number, licence_number, driver_licence_number, vehicle_year, vehicle_make_model, vehicle_colour, vehicle_registration, service_zones, ride_type').eq('id', user.id).single(),
        supabase.from('driver_documents').select('doc_type,document_type,status,rejection_reason,created_at,file_url,document_url,expiry_date').eq('driver_id', user.id).order('created_at', { ascending: false }),
        supabase.from('service_zones').select('id,name'),
        supabase.from('driver_vehicles').select('*').eq('driver_id', user.id).maybeSingle(),
        supabase.from('driver_bundles').select('trips_remaining').eq('driver_id', user.id).eq('status', 'active').gt('trips_remaining', 0).gt('expires_at', new Date().toISOString()),
      ])
      if (profileRes.error) throw new Error(`Profile: ${profileRes.error.message}`)
      if (docsRes.error) throw new Error(`Documents: ${docsRes.error.message}`)
      if (zonesRes.data) setZoneNames(Object.fromEntries((zonesRes.data as any).map((z: any) => [z.id, z.name])))
      if (!bundlesRes.error && bundlesRes.data) setBundleCredits((bundlesRes.data as any).reduce((s: number, b: any) => s + Number(b.trips_remaining || 0), 0))
      const data = profileRes.data
      const v: any = vehicleRes.data || data
      if (v) {
        setVehicleDetails({ year: v.vehicle_year ? String(v.vehicle_year) : '', make_model: v.make_model || v.vehicle_make_model || '', colour: v.colour || v.vehicle_colour || '', registration: v.registration || v.vehicle_registration || '' })
        if (Array.isArray(v.service_zones)) setSelectedZones(v.service_zones)
        else if (Array.isArray((data as any)?.service_zones)) setSelectedZones((data as any).service_zones)
        setSelectedRideType(v.ride_type || (data as any)?.ride_type || '')
      }
      if (data) {
        setPhone((data as any).phone_number || (data as any).phone || '')
        const vStatus = (data as any).verification_status || 'pending_verification'
        setStatus(vStatus)
        setRejectionReason((data as any).verification_rejection_reason || null)
        setHasIdNumbers(Boolean(((data as any).id_number || '').toString().trim() && (((data as any).licence_number || (data as any).driver_licence_number || '').toString().trim())))
        const isApproved = (data as any).is_verified === true && ['approved', 'verified'].includes(String(vStatus).toLowerCase())
        if (isApproved) { if (onApproved) onApproved(); return }
      }
      const latest = new Map<string, any>()
      for (const d of (docsRes.data || [])) {
        const key = normalizeKey(d.doc_type || d.document_type || '')
        if (!key) continue
        if (!latest.has(key)) latest.set(key, { ...d, doc_type: key, document_type: key })
      }
      const deduped = [...latest.values()]
      setUploadedCount(deduped.filter(d => d.file_url || d.document_url).length)
      setIdentityCount(deduped.filter(d => IDENTITY_TYPES.has(normalizeKey(d.doc_type)) && (d.file_url || d.document_url)).length)
      const licenseDoc = deduped.find(d => normalizeKey(d.doc_type) === 'drivers_license')
      setLicenseExpiryMissing(Boolean(licenseDoc && (licenseDoc.file_url || licenseDoc.document_url) && !licenseDoc.expiry_date))
      setMissingDocs(ALL_DOCS.filter(k => !latest.has(normalizeKey(k))).map(prettyName))
      setApprovedCount(deduped.filter(d => String(d.status || '').toUpperCase() === 'APPROVED').length)
      setRejectedDocs(deduped.filter(d => String(d.status || '').toUpperCase() === 'REJECTED').map((d: any) => ({ name: prettyName(normalizeKey(d.doc_type || d.document_type || 'Document')), reason: d.rejection_reason || 'Please re-upload a clearer photo.', status: d.status })))
      setPendingDocs(deduped.filter(d => String(d.status || '').toUpperCase() === 'PENDING').map((d: any) => ({ name: prettyName(normalizeKey(d.doc_type || d.document_type || 'Document')), reason: 'Waiting for admin review', status: d.status })))
    } catch (e: any) { setError(e?.message || String(e)) } finally {
      checkingRef.current = false; setChecking(false)
      if (needsRecheckRef.current) { needsRecheckRef.current = false; void checkStatus() }
    }
  }

  useEffect(() => {
    void checkStatus()
    let channel: any = null; let cancelled = false
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user || cancelled) return
      channel = supabase.channel(`pending-${data.user.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${data.user.id}` }, () => { void checkStatus() })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${data.user.id}` }, () => { void checkStatus() })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_vehicles', filter: `driver_id=eq.${data.user.id}` }, () => { void checkStatus() })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel) }
  }, [])

  const isRejected = status.toLowerCase() === 'rejected' || !!rejectionReason || rejectedDocs.length > 0
  // FIX: Also respect localStorage flag - DB may still say pending_verification even though identity is done
  const hasLocalIdentityFlag = typeof window !== 'undefined' && localStorage.getItem('br_identity_complete') === '1'
  const isIdentityComplete = !isRejected && !licenseExpiryMissing && (status.toLowerCase() === 'identity_complete' || hasLocalIdentityFlag || (identityCount === 4 && uploadedCount >= 4 && hasIdNumbers))
  const isIdentityPhotosOnly = !isRejected && !isIdentityComplete && identityCount === 4 && uploadedCount >= 4 && (!hasIdNumbers || licenseExpiryMissing)
  const isFullPending = ['pending', 'pending_verification', 'submitted', 'under_review', 'in_review'].includes(status.toLowerCase())
  const vehicleComplete = Boolean(vehicleDetails.year && vehicleDetails.make_model.trim() && vehicleDetails.colour.trim() && vehicleDetails.registration.trim())
  const zonesComplete = selectedZones.length > 0
  const rideTypeComplete = Boolean(selectedRideType)
  const allComplete = uploadedCount >= TOTAL_EXPECTED && vehicleComplete && zonesComplete && rideTypeComplete && hasIdNumbers && !licenseExpiryMissing
  const missingVehicleItems: string[] = []
  if (!vehicleComplete) missingVehicleItems.push('Vehicle Details (Year + Make/Model + Colour + Registration)')
  if (!zonesComplete) missingVehicleItems.push('Service Area (pick at least 1 zone)')
  if (!rideTypeComplete) missingVehicleItems.push('Ride Type')
  const goFixDocuments = () => { window.location.href = '/driver/onboarding' }
  const goViewDocuments = () => { window.location.href = '/driver/onboarding' }
  // FIX: DO NOT call onApproved() - onApproved in App.tsx does refreshProfile() which fetches pending_verification from DB and bounces back to this page. Go direct to /driver, App.tsx will read br_identity_complete flag.
  const enterApp = () => {
    try {
      localStorage.setItem('br_identity_complete', '1')
      // Background DB sync - fire and forget, never block / never refresh
      supabase.auth.getUser().then(({ data }) => {
        const id = data.user?.id
        if (id) supabase.from('profiles').update({ verification_status: 'identity_complete' } as any).eq('id', id).then(() => {})
      })
    } catch {}
    window.location.assign('/driver')
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#182230', fontFamily: 'Inter, sans-serif', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, touchAction: 'pan-y' as any }}>
      <section style={{ width: 'min(100%, 480px)', padding: 32, borderRadius: 16, background: '#fff', textAlign: 'center', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
        {error && <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginBottom: 12, textAlign: 'left', fontSize: 13, color: '#b42318' }}>{error}</div>}
        {isIdentityPhotosOnly && (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: '#FEF3C7', fontSize: 32 }}>⚠️</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>{licenseExpiryMissing ? 'License Expiry Missing' : 'Almost There - ID Numbers Missing'}</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>{licenseExpiryMissing ? <>You uploaded 4 identity photos ✅ but <strong>Drivers License expiry date is missing.</strong><br />Go back, pick expiry date then click Replace to re-upload License.</> : <>You uploaded 4 identity photos ✅ but SA ID Number + Licence Number are missing.<br />Enter them to unlock Enter App.</>}</p>
            <button onClick={goViewDocuments} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>{licenseExpiryMissing ? 'Fix License Expiry →' : 'Enter ID Numbers →'}</button>
          </>
        )}
        {isIdentityComplete && (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: '#ECFDF3', fontSize: 32 }}>🎉</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Identity Complete!</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>You did identity: Selfie + SA ID + Licence + ID Numbers ✅<br />You can enter the app now. Finish <strong style={{ color: '#182230' }}>{TOTAL_EXPECTED - uploadedCount} docs</strong> inside to unlock Go Online.</p>
            <div style={{ marginTop: 16, textAlign: 'left', background: BLUE_LIGHT, border: '1px solid #B2CCFF', padding: 12, borderRadius: 10, fontSize: 13 }}>
              <strong>Progress: {uploadedCount}/{TOTAL_EXPECTED} docs • Identity {identityCount}/4 ✅</strong>
              <div style={{ height: 9, background: '#E5E9EF', borderRadius: 99, overflow: 'hidden', marginTop: 8 }}><div style={{ width: `${(uploadedCount / TOTAL_EXPECTED) * 100}%`, height: '100%', background: BLUE, borderRadius: 99 }} /></div>
              {missingDocs.length > 0 && <div style={{ marginTop: 8, color: '#667085' }}>Still needed: {missingDocs.join(', ')}</div>}
              {missingVehicleItems.length > 0 && <div style={{ marginTop: 8, color: '#B54708', fontWeight: 700 }}>Still needed: {missingVehicleItems.join(' • ')}</div>}
              {vehicleComplete && <div style={{ marginTop: 8, color: '#067647' }}>🚗 {vehicleDetails.year} {vehicleDetails.make_model} • {vehicleDetails.colour} • {vehicleDetails.registration}</div>}
              {zonesComplete && <div style={{ marginTop: 4, color: '#067647' }}>📍 {selectedZones.map(z => zoneNames[z] || z).join(', ')}</div>}
              {rideTypeComplete && <div style={{ marginTop: 4, color: '#067647' }}>🚙 Ride Type: {selectedRideType}</div>}
              <div style={{ marginTop: 8, color: BLUE_DARK, fontWeight: 700 }}>Go Online is blocked until all {TOTAL_EXPECTED} docs + Vehicle + Zones + Ride Type + Admin approval + Bundle.</div>
            </div>
            <button onClick={enterApp} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: '#16A34A', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', touchAction: 'manipulation' }}>🚀 Enter App - Finish Rest Inside →</button>
            <button onClick={goViewDocuments} style={{ marginTop: 10, width: '100%', padding: 14, border: '1px solid #d0d5dd', borderRadius: 12, background: '#fff', color: '#344054', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Continue Uploading Docs</button>
          </>
        )}
        {isRejected ? (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: '#FEF3F2', fontSize: 32 }}>❌</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Documents Need Attention</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>An admin rejected the following. Fix and resubmit:</p>
            {rejectionReason && <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 12, textAlign: 'left', fontSize: 13 }}><strong>Application:</strong> {rejectionReason}</div>}
            {rejectedDocs.map((d, i) => (
              <div key={i} style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: 12, borderRadius: 10, marginTop: 8, textAlign: 'left' }}><strong style={{ textTransform: 'uppercase', fontSize: 13 }}>{d.name}</strong><div style={{ fontSize: 13, color: '#667085' }}>{d.reason}</div></div>
            ))}
            <button onClick={goFixDocuments} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Fix Documents →</button>
          </>
        ) : !isIdentityComplete && !isIdentityPhotosOnly && isFullPending && (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: BLUE_LIGHT, fontSize: 32, color: BLUE }}>⏳</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Driver application under review</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>Thanks for submitting your documents. Our team is reviewing them now.<br /><br />We will WhatsApp you {phone ? <>on <strong style={{ color: '#182230' }}>{phone}</strong></> : 'on your registered number'} within 24 hours after review.</p>
            <div style={{ marginTop: 16, textAlign: 'left', background: BLUE_LIGHT, border: '1px solid #B2CCFF', padding: 12, borderRadius: 10, fontSize: 13 }}>
              <strong>Documents: {uploadedCount}/{TOTAL_EXPECTED} uploaded • {approvedCount} Approved</strong>
              {pendingDocs.length > 0 && <div style={{ marginTop: 8, color: '#667085' }}>Still pending: {pendingDocs.map(d => d.name).join(', ')}</div>}
              {missingDocs.length > 0 && <div style={{ marginTop: 8, color: '#667085' }}>Missing: {missingDocs.join(', ')}</div>}
              {missingVehicleItems.length > 0 && <div style={{ marginTop: 8, color: '#B54708', fontWeight: 700 }}>Missing Vehicle: {missingVehicleItems.join(' • ')}</div>}
              {vehicleComplete && <div style={{ marginTop: 8, color: '#067647' }}>🚗 {vehicleDetails.year} {vehicleDetails.make_model} • {vehicleDetails.colour} • {vehicleDetails.registration} • {selectedRideType} • {selectedZones.map(z => zoneNames[z] || z).join(', ')}</div>}
              {bundleCredits !== null && <div style={{ marginTop: 8, color: BLUE_DARK, fontWeight: 700 }}>🎫 Bundle trips left: {bundleCredits} {bundleCredits === 0 ? '- Buy a bundle after approval to Go Online' : ''}</div>}
              <div style={{ marginTop: 8, color: BLUE_DARK, fontWeight: 700 }}>Final approval is done by Admin — you will be notified on WhatsApp. After approval, buy a Bundle to Go Online. You keep 100% of every fare.</div>
            </div>
          </>
        )}
        {!isIdentityComplete && !isIdentityPhotosOnly && !isRejected && !isFullPending && (
          <>
            <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: BLUE_LIGHT, fontSize: 32, color: BLUE }}>📄</div>
            <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Start Your Driver Application</h1>
            <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>Step 1: Identity - Selfie + SA ID + Licence + ID Numbers. Then app opens. Step 2: Vehicle + Photos + Service Area + Ride Type. Step 3: Buy Bundle → Go Online. Keep 100%.</p>
            <button onClick={goViewDocuments} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Start Onboarding →</button>
          </>
        )}
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#98A2B3' }}>Status: {String(status || 'pending_verification').replace(/_/g, ' ')}{allComplete ? ' • ✅ All docs + Vehicle + Zones + Ride Type complete - waiting for Admin' : ''}</p>
        <button onClick={() => void checkStatus()} disabled={checking} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: checking ? '#cbd2da' : BLUE, color: '#fff', fontWeight: 800, fontSize: 15, cursor: checking ? 'not-allowed' : 'pointer' }}>{checking ? 'Checking...' : 'Check Approval Status'}</button>
        {!isIdentityComplete && <button onClick={goViewDocuments} style={{ marginTop: 10, width: '100%', padding: 14, border: '1px solid #d0d5dd', borderRadius: 12, background: '#fff', color: '#344054', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>View My Documents</button>}
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#98A2B3' }}>Need help? WhatsApp Support on <a href="https://wa.me/27641018991" target="_blank" rel="noreferrer" style={{ color: BLUE, fontWeight: 700 }}>064 101 8991</a></p>
      </section>
    </main>
  )
}