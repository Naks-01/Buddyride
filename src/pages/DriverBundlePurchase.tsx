"use client"
import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

// BUNDLE MODEL: No commission. Driver keeps 100% of fare. Platform earns from Bundles.
// 1 credit = normal ride (<150km). 2 credits = Long distance (Polokwane <-> Gauteng 150-300km)

type Bundle = {
  id: string
  name: string
  trips: number
  price: number
  popular?: boolean
  saving?: string
}

const BUNDLES: Bundle[] = [
  { id: 'bundle_5', name: 'Starter', trips: 5, price: 55, saving: 'R11/trip' },
  { id: 'bundle_15', name: 'Driver Favourite', trips: 15, price: 165, popular: true, saving: 'R11/trip - Most popular' },
  { id: 'bundle_30', name: 'Pro', trips: 30, price: 300, saving: 'R10/trip - Save R30' },
  { id: 'bundle_50', name: 'Fleet', trips: 50, price: 450, saving: 'R9/trip - Best value' },
]

export function DriverBundlePurchase({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [credits, setCredits] = useState<number | null>(null)
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  async function loadCredits() {
    setLoadingCredits(true)
    try {
      const { data, error } = await supabase
        .from('driver_bundles')
        .select('trips_remaining')
        .eq('driver_id', profile.id)
        .gt('trips_remaining', 0)
      if (error) throw error
      const total = (data as any[]).reduce((sum, b) => sum + Number(b.trips_remaining || 0), 0)
      setCredits(total)
    } catch (e: any) {
      console.warn('load bundles', e.message)
      setCredits(0)
    } finally {
      setLoadingCredits(false)
    }
  }

  useEffect(() => { void loadCredits() }, [profile.id])

  async function handleBuy(bundle: Bundle) {
    if (buying) return
    setBuying(bundle.id)
    setMsg('')
    setIsError(false)
    try {
      // 1. Insert pending bundle - Replace this with real Paystack callback
      // For now we simulate success - In production call your Edge Function: create-paystack-payment
      const confirmBuy = window.confirm(
        `Buy ${bundle.name} - ${bundle.trips} trips for R${bundle.price}?\n\nYou keep 100% of every fare.\n\nClick OK to simulate Paystack success (replace with real Paystack later).`
      )
      if (!confirmBuy) { setBuying(null); return }

      const { error } = await supabase.from('driver_bundles').insert({
        driver_id: profile.id,
        bundle_id: bundle.id,
        trips_total: bundle.trips,
        trips_remaining: bundle.trips,
        amount_paid: bundle.price,
        status: 'active',
        payment_reference: `sim_${Date.now()}_${bundle.id}`,
      } as any)

      if (error) throw error

      setMsg(`✅ ${bundle.trips} trips added! You now have ${(credits || 0) + bundle.trips} trips. You can Go Online now.`)
      await loadCredits()
      setTimeout(() => onBack(), 1500)
    } catch (e: any) {
      setIsError(true)
      setMsg(`Failed to buy bundle: ${e.message || String(e)}`)
    } finally {
      setBuying(null)
    }
  }

  return (
    <main style={{ minHeight: '100dvh', background: '#F8F9FA', color: '#182230', padding: '20px 16px 32px', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: '#fff', border: '1px solid #E4E7EC', color: '#344054', padding: '8px 14px', borderRadius: 10, marginBottom: 12, fontWeight: 700, cursor: 'pointer' }}>← Back to Driver Home</button>

        <div style={{ background: BLUE, color: 'white', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.9 }}>Bundle Model - You keep 100%</p>
          <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 800 }}>Buy trips to Go Online</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.9, lineHeight: 1.5 }}>
            No commission. Rider pays you directly (cash/card). Platform earns from bundle, not from your fare.
          </p>
          <div style={{ marginTop: 14, background: 'rgba(255,255,255,.15)', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>Trips left:</span>
            <span style={{ fontWeight: 800, fontSize: 20 }}>{loadingCredits ? '...' : `${credits ?? 0} trips`}</span>
          </div>
          {credits === 0 && !loadingCredits && (
            <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '8px 10px', borderRadius: 8 }}>
              ⚠️ 0 trips = You cannot Go Online. Buy a bundle below.
            </p>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #EDF0F3', borderRadius: 16, padding: 14, marginBottom: 16 }}>
          <strong style={{ fontSize: 14 }}>How credits work:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#667085', lineHeight: 1.6 }}>
            <li><strong style={{ color: '#182230' }}>1 credit = Normal ride</strong> - Inside Polokwane / short trips (&lt;150km)</li>
            <li><strong style={{ color: '#182230' }}>2 credits = Long distance</strong> - Polokwane ↔ Gauteng (150-300km)</li>
            <li>Rider pays YOU directly. No hidden fees.</li>
          </ul>
        </div>

        {msg && (
          <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: isError ? '#FEF3F2' : BLUE_LIGHT, color: isError ? '#B42318' : BLUE_DARK, fontSize: 13, border: `1px solid ${isError ? '#FECDCA' : '#B2CCFF'}` }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {BUNDLES.map(bundle => {
            const isBuying = buying === bundle.id
            return (
              <div key={bundle.id} style={{ padding: 16, borderRadius: 16, background: '#fff', border: bundle.popular ? `2px solid ${BLUE}` : '1px solid #EDF0F3', boxShadow: bundle.popular ? `0 0 0 4px ${BLUE_LIGHT}` : '0 5px 18px rgba(20,33,50,0.045)', position: 'relative' }}>
                {bundle.popular && <span style={{ position: 'absolute', top: -10, left: 16, background: BLUE, color: 'white', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99 }}>MOST POPULAR</span>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{bundle.name} - {bundle.trips} trips</strong>
                    <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{bundle.saving}</div>
                  </div>
                  <strong style={{ fontSize: 20 }}>R{bundle.price}</strong>
                </div>
                <button
                  disabled={!!buying}
                  onClick={() => void handleBuy(bundle)}
                  style={{ marginTop: 12, width: '100%', padding: 14, borderRadius: 12, border: 0, background: bundle.popular ? BLUE : '#111827', color: 'white', fontWeight: 800, fontSize: 15, cursor: buying ? 'not-allowed' : 'pointer', opacity: buying ? 0.6 : 1 }}
                >
                  {isBuying ? 'Processing...' : `Buy ${bundle.trips} trips - R${bundle.price}`}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #EDF0F3' }}>
          <strong style={{ fontSize: 13 }}>Need help?</strong>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#667085' }}>
            After payment trips are added instantly. WhatsApp Support: <a href="https://wa.me/27641018991" target="_blank" rel="noreferrer" style={{ color: BLUE_DARK, fontWeight: 700 }}>064 101 8991</a>
          </p>
        </div>
      </section>
    </main>
  )
}

export default DriverBundlePurchase