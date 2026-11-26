import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../lib/supabase'

// FIX: Blue Lite only - was orange #ff6b00, fought whole app Blue #0066FF
const BRAND = '#0066FF'
const BRAND_DARK = '#0052CC'
const SUPPORT_WA = '27641018991'

const CATEGORIES = [
  { id: 'buddy_lite', name: 'Buddy Lite', icon: '🛺', seats: '2 seats', desc: 'Small & cheapest' },
  { id: 'buddy_plus', name: 'Buddy Plus', icon: '🚗', seats: '3 seats', desc: 'Standard - popular' },
  { id: 'buddy_max', name: 'Buddy Max', icon: '🚐', seats: '7 seats', desc: 'Family van' },
]
function normalizeCategory(raw: string | null | undefined) {
  const v = String(raw || '').toLowerCase().trim()
  if (v === 'go' || v === 'economy' || v === 'buddy' || v === 'buddy_lite') return 'buddy_lite'
  if (v === 'comfort' || v === 'buddy_plus') return 'buddy_plus'
  if (v === 'xl' || v === 'buddy_xl' || v === 'buddy_family' || v === 'family' || v === 'buddy_max') return 'buddy_max'
  return 'buddy_plus'
}

type Bundle = {
  id: string
  name: string
  trips: number
  price: number
  popular?: boolean
  saving?: string
  category?: string
}

export function DriverBundlePurchase({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [credits, setCredits] = useState<number | null>(null)
  const [loadingCredits, setLoadingCredits] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('buddy_plus')
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loadingBundles, setLoadingBundles] = useState(true)

  async function loadCredits() {
    setLoadingCredits(true)
    try {
      const { data, error } = await supabase
        .from('driver_bundles')
        .select('trips_remaining')
        .eq('driver_id', profile.id)
        .eq('status', 'active')
        .gt('trips_remaining', 0)
        .gt('expires_at', new Date().toISOString())
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

  async function loadBundlesForCategory(cat: string) {
    setLoadingBundles(true)
    try {
      const normalized = normalizeCategory(cat)
      const { data, error } = await supabase.from('bundle_prices').select('*').eq('category', normalized).order('trips', { ascending: true })
      if (!error && data && data.length > 0) {
        const mapped: Bundle[] = (data as any[]).map((r, i) => ({
          id: String(r.id || `bundle_${r.trips}`),
          name: String(r.name || r.label || `${r.trips} trips`),
          trips: Number(r.trips || r.trip_count || r.quantity || 0),
          price: Number(r.price || r.amount || (r.price_cents ? r.price_cents / 100 : 0) || 0),
          saving: r.saving || `R${(Number(r.price || 0) / Math.max(1, Number(r.trips || 1))).toFixed(0)}/trip`,
          popular: i === 1 || r.popular === true || r.is_popular === true,
          category: normalized,
        })).filter(b => b.trips > 0 && b.price > 0)
        if (mapped.length > 0) { setBundles(mapped); return }
      }
      setBundles([])
    } catch (error) {
      setBundles([])
      setMsg(error instanceof Error ? error.message : 'Could not load bundle prices')
      setIsError(true)
    } finally {
      setLoadingBundles(false)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference')
    if (params.get('bundle_payment') !== 'verify' || !reference) return
    let active = true
    setMsg('Confirming your Paystack payment securely…')
    setIsError(false)
    const clean = new URL(window.location.href)
    clean.searchParams.delete('bundle_payment'); clean.searchParams.delete('reference')
    window.history.replaceState({}, '', clean.toString())
    void supabase.functions.invoke('verify-bundle-payment', { body: { reference } }).then(async ({ data, error }) => {
      if (!active) return
      if (error || data?.paid !== true) { setIsError(true); setMsg(error?.message || data?.error || 'Payment has not been confirmed. Your bundle has not been activated.'); return }
      setMsg('Payment confirmed. Your bundle credits are now active.')
      await loadCredits()
    })
    return () => { active = false }
  }, [profile.id])

  useEffect(() => { void loadCredits() }, [profile.id])
  useEffect(() => { void loadBundlesForCategory(selectedCategory) }, [selectedCategory])

  useEffect(() => {
    const rt = (profile as any)?.ride_type
    if (rt) setSelectedCategory(normalizeCategory(rt))
  }, [profile])

  async function handleBuy(bundle: Bundle) {
    if (buying) return
    setBuying(bundle.id)
    setMsg('')
    setIsError(false)
    try {
      const { data, error } = await supabase.functions.invoke('start-bundle-checkout', {
        body: { bundle_price_id: bundle.id, category: normalizeCategory(selectedCategory) },
      })
      if (error) throw error
      if (!data?.authorization_url) throw new Error(data?.error || 'Paystack checkout URL was not returned')
      window.location.assign(data.authorization_url)
    } catch (e: any) {
      setIsError(true)
      setMsg(`Could not start Paystack checkout: ${e.message || String(e)}`)
      setBuying(null)
    }
  }

  const selectedCatInfo = CATEGORIES.find(c => c.id === normalizeCategory(selectedCategory)) || CATEGORIES[1]

  return (
    <main style={{ minHeight: '100dvh', background: '#f5f5f7', color: '#111827', padding: '20px 16px 32px', fontFamily: 'Inter, sans-serif' }}>
      <section style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={onBack} style={{ background: '#fff', border: '1px solid #E4E7EC', color: '#111827', padding: '8px 14px', borderRadius: 10, marginBottom: 12, fontWeight: 700, cursor: 'pointer' }}>← Back to Driver Home</button>

        <div style={{ background: BRAND, color: 'white', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', opacity: 0.9 }}>Bundle Model - You keep 100%</p>
          <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 800 }}>Buy trips to Go Online</h1>
          <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.9, lineHeight: 1.5 }}>
            Riders pay you directly in Cash or Card. Platform revenue comes from bundle purchases, not your trip fares.
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
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ background: 'rgba(255,255,255,.2)', padding: '6px 10px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>💵 CASH + CARD</span>
            <span style={{ background: 'rgba(255,255,255,.2)', padding: '6px 10px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>🇿🇦 LIMPOPO OWN</span>
            <span style={{ background: 'rgba(255,255,255,.2)', padding: '6px 10px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>⏳ EXPIRES 31 DAYS</span>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E4E7EC', borderRadius: 16, padding: 14, marginBottom: 16 }}>
          <strong style={{ fontSize: 14 }}>1. Choose your category</strong>
          <p style={{ margin: '4px 0 10px', fontSize: 12, color: '#667085' }}>Must match your car + what passenger books.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {CATEGORIES.map(c => {
              const isSel = normalizeCategory(selectedCategory) === c.id
              return (
                <button key={c.id} onClick={() => setSelectedCategory(c.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: 12, borderRadius: 12, border: isSel ? `2px solid ${BRAND}` : '1px solid #E4E7EC', background: isSel ? '#E6F0FF' : '#F2F4F7', cursor: 'pointer', color: '#111827' }}>
                  <span style={{ fontSize: 22 }}>{c.icon}</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: 14, color: '#111827' }}>{c.name} • {c.seats}</strong>
                    <span style={{ fontSize: 12, color: '#667085' }}>{c.desc}</span>
                  </span>
                  {isSel && <span style={{ fontSize: 18, color: BRAND }}>✓</span>}
                </button>
              )
            })}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#667085' }}>Buying for: <strong style={{ color: '#111827' }}>{selectedCatInfo.icon} {selectedCatInfo.name} • {selectedCatInfo.seats}</strong></p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E4E7EC', borderRadius: 16, padding: 14, marginBottom: 16 }}>
          <strong style={{ fontSize: 14 }}>How credits work:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#667085', lineHeight: 1.6 }}>
            <li><strong style={{ color: '#111827' }}>1 credit = Normal ride</strong> - Trips under 100km</li>
            <li><strong style={{ color: '#111827' }}>2 credits = Long distance</strong> - Trips of 100km or longer</li>
            <li>Rider pays YOU directly. No hidden fees.</li>
            <li><strong style={{ color: '#111827' }}>All bundles expire 31 days after purchase</strong> - use them before they expire. No refunds after expiry.</li>
          </ul>
        </div>

        {msg && (
          <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: isError ? '#FEF3F2' : '#E6F0FF', color: isError ? '#B42318' : BRAND_DARK, fontSize: 13, border: `1px solid ${isError ? '#FECDCA' : '#B2CCFF'}` }}>
            {msg}
          </div>
        )}

        <strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>2. Choose bundle for {selectedCatInfo.name}</strong>
        {loadingBundles ? <p style={{ fontSize: 13, color: '#667085' }}>Loading bundles for {selectedCatInfo.name}...</p> : bundles.length === 0 ? <p style={{fontSize:13,color:'#B42318'}}>No active bundles are configured for this vehicle category. Please contact BuddyRide support.</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {bundles.map(bundle => {
            const isBuying = buying === bundle.id
            return (
              <div key={bundle.id} style={{ padding: 16, borderRadius: 16, background: '#fff', border: bundle.popular ? `2px solid ${BRAND}` : '1px solid #E4E7EC', boxShadow: bundle.popular ? `0 0 0 4px rgba(0,102,255,.12)` : '0 5px 18px rgba(0,0,0,.08)', position: 'relative' }}>
                {bundle.popular && <span style={{ position: 'absolute', top: -10, left: 16, background: BRAND, color: 'white', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99 }}>MOST POPULAR</span>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{bundle.name} - {bundle.trips} trips</strong>
                    <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{selectedCatInfo.name} • Expires 31 days</div>
                  </div>
                  <strong style={{ fontSize: 20 }}>R{bundle.price}</strong>
                </div>
                <button
                  disabled={!!buying}
                  onClick={() => void handleBuy(bundle)}
                  style={{ marginTop: 12, width: '100%', padding: 14, borderRadius: 12, border: 0, background: bundle.popular ? BRAND : '#111827', color: 'white', fontWeight: 800, fontSize: 15, cursor: buying ? 'not-allowed' : 'pointer', opacity: buying ? 0.6 : 1 }}
                >
                  {isBuying ? 'Processing...' : `Buy ${bundle.trips} trips - R${bundle.price} • ${selectedCatInfo.name}`}
                </button>
              </div>
            )
          })}
        </div>
        )}

        <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #E4E7EC' }}>
          <strong style={{ fontSize: 13 }}>Need help?</strong>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#667085' }}>
            After payment trips are added instantly. Secure Paystack checkout - Card / EFT. WhatsApp Support: <a href={`https://wa.me/${SUPPORT_WA}`} target="_blank" rel="noreferrer" style={{ color: BRAND_DARK, fontWeight: 700 }}>064 101 8991</a>
          </p>
        </div>
      </section>
    </main>
  )
}

export default DriverBundlePurchase