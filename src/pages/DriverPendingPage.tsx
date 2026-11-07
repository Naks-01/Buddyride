import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function DriverPendingPage({ onApproved }: { onApproved?: () => void }) {
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState('pending_verification')
  const [checking, setChecking] = useState(false)

  async function checkStatus() {
    setChecking(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setChecking(false); return }
    const { data } = await supabase.from('profiles')
      .select('phone_number, phone, verification_status, is_verified')
      .eq('id', user.id).single()
    if (data) {
      setPhone((data as any).phone_number || (data as any).phone || '')
      setStatus((data as any).verification_status || 'pending_verification')
      if ((data as any).verification_status === 'approved' && (data as any).is_verified) {
        onApproved?.()
        window.location.href = '/driver'
      }
    }
    setChecking(false)
  }

  useEffect(() => {
    checkStatus()
    // Auto-check every 30s - driver auto-moves to DriverHome when admin approves
    const timer = setInterval(checkStatus, 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F8F9FA', color: '#182230', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ width: 'min(100%, 480px)', padding: 32, borderRadius: 16, background: '#fff', textAlign: 'center', boxShadow: '0 5px 18px rgba(20,33,50,.06)' }}>
        <div style={{ margin: '0 auto 18px', width: 72, height: 72, borderRadius: 36, display: 'grid', placeItems: 'center', background: '#FFF4E5', fontSize: 32 }}>⏳</div>
        <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Driver application under review</h1>
        <p style={{ margin: 0, color: '#667085', lineHeight: 1.6 }}>
          Thanks for submitting your documents. Our team is reviewing them now.<br /><br />
          We will WhatsApp you {phone ? <>on <strong style={{ color: '#182230' }}>{phone}</strong></> : 'on your registered number'} within 24 hours after review.
        </p>
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#98A2B3' }}>Status: {status.replace(/_/g, ' ')}</p>
        <button onClick={checkStatus} disabled={checking} style={{ marginTop: 20, width: '100%', padding: 14, border: 0, borderRadius: 12, background: checking ? '#cbd2da' : '#087f5b', color: '#fff', fontWeight: 800, fontSize: 15, cursor: checking ? 'not-allowed' : 'pointer' }}>
          {checking ? 'Checking...' : 'Check Approval Status'}
        </button>
        <button onClick={() => window.location.href = '/driver/documents'} style={{ marginTop: 10, width: '100%', padding: 14, border: '1px solid #d0d5dd', borderRadius: 12, background: '#fff', color: '#344054', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          View My Documents
        </button>
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#98A2B3' }}>Need help? WhatsApp Support on 079 305 1213</p>
      </section>
    </main>
  )
}