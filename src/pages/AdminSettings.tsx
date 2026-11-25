import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type FareRule = { id: string, category: string, base_fare: number, per_km: number, per_min: number, min_fare: number, max_fare: number, commission_percent: number, active: boolean, _isNew?: boolean }
type BundlePrice = { id: string, trips: number, price: number, label: string, category: 'buddy_lite' | 'buddy_plus' | 'buddy_max', active: boolean, _isNew?: boolean }

export function AdminSettings({ onBack }: { onBack: () => void }) {
  const [rules, setRules] = useState<FareRule[]>([])
  const [bundles, setBundles] = useState<BundlePrice[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewKm, setPreviewKm] = useState(5)
  const [previewMin, setPreviewMin] = useState(10)

  useEffect(() => {
    async function load() {
      const [fareRes, bundleRes] = await Promise.all([
        supabase.from('fare_rules').select('id,category,base_fare,per_km,per_min,min_fare,max_fare,commission_percent,active').order('category'),
        supabase.from('bundle_prices').select('id,trips,price,label,category,active').order('trips'),
      ])
      if (fareRes.error) setMessage(`Could not load fare_rules: ${fareRes.error.message} — Run: UPDATE fare_rules SET commission_percent=0;`)
      else setRules((fareRes.data || []).map((r: any) => ({ id: r.id, category: r.category, base_fare: Number(r.base_fare ?? 0), per_km: Number(r.per_km ?? 0), per_min: Number(r.per_min ?? 0), min_fare: Number(r.min_fare ?? 0), max_fare: Number(r.max_fare ?? 0), commission_percent: 0, active: r.active ?? true })))
      if (bundleRes.error) setMessage((prev) => prev + ` | Bundle prices: ${bundleRes.error.message}`)
      else setBundles((bundleRes.data || []).map((b: any) => ({ id: b.id, trips: Number(b.trips ?? 0), price: Number(b.price ?? 0), label: b.label || `${b.trips} trips`, category: b.category || 'buddy_plus', active: b.active ?? true })))
      setLoading(false)
    }
    void load()
  }, [])

  async function save() {
    setSaving(true); setMessage('')
    const invalid = rules.find(c => [c.base_fare, c.per_km, c.per_min, c.min_fare, c.max_fare].some(v => Number.isNaN(v) || v < 0) || (c.max_fare > 0 && c.min_fare > c.max_fare) || !c.category.trim())
    if (invalid) { setMessage(`Check ${invalid.category || 'a category'}: All fares must be 0 or more, Min cannot be > Max (0 = no cap), name cannot be empty.`); setSaving(false); return }
    const invalidBundle = bundles.find(b => !b.label.trim() || !b.category || Number.isNaN(b.trips) || Number.isNaN(b.price) || b.trips <= 0 || b.price <= 0)
    if (invalidBundle) { setMessage(`Check bundle ${invalidBundle.label}: Trips and Price must be > 0.`); setSaving(false); return }
    try {
      // FIX: Insert new rows without ID, update existing by ID - was upserting fake rule_ IDs, creating duplicate rows
      for (const r of rules) {
        const payload = { category: r.category, base_fare: r.base_fare, per_km: r.per_km, per_min: r.per_min, min_fare: r.min_fare, max_fare: r.max_fare, commission_percent: 0, active: r.active }
        if (r._isNew) { const { error, data } = await supabase.from('fare_rules').insert(payload as any).select('id').single(); if (error) throw error; if (data) r.id = data.id; r._isNew = false }
        else { const { error } = await supabase.from('fare_rules').update(payload as any).eq('id', r.id); if (error) throw error }
      }
      for (const b of bundles) {
        const payload = { trips: b.trips, price: b.price, label: b.label, name: b.label, category: b.category, active: b.active }
        if (b._isNew) { const { error, data } = await supabase.from('bundle_prices').insert(payload as any).select('id').single(); if (error) throw error; if (data) b.id = data.id; b._isNew = false }
        else { const { error } = await supabase.from('bundle_prices').update(payload as any).eq('id', b.id); if (error) throw error }
      }
      setMessage(`✅ Saved. Fare rules and bundle prices saved. Drivers keep 100% of fares.`)
    } catch (error) { setMessage(`Could not save: ${error instanceof Error ? error.message : String(error)}`) } finally { setSaving(false) }
  }

  function updateRule(id: string, field: 'category' | 'active' | 'base_fare' | 'per_km' | 'per_min' | 'min_fare' | 'max_fare', value: string | boolean) {
    setRules(current => current.map(r => {
      if (r.id !== id) return r
      if (field === 'category') return { ...r, category: String(value) }
      if (field === 'active') return { ...r, active: Boolean(value) }
      const num = value === '' ? 0 : Number(value)
      return { ...r, [field]: Number.isNaN(num) ? 0 : num }
    }))
  }
  function updateBundle(id: string, field: 'trips' | 'price' | 'label' | 'category' | 'active', value: string | boolean) {
    setBundles(current => current.map(b => {
      if (b.id !== id) return b
      if (field === 'label') return { ...b, label: String(value) }
      if (field === 'category') return { ...b, category: value as BundlePrice['category'] }
      if (field === 'active') return { ...b, active: Boolean(value) }
      const num = value === '' ? 0 : Number(value)
      return { ...b, [field]: Number.isNaN(num) ? 0 : num }
    }))
  }
  function addRule() {
    setRules(prev => [...prev, { id: `new_${Date.now()}`, category: 'New Category', base_fare: 20, per_km: 8, per_min: 1, min_fare: 30, max_fare: 0, commission_percent: 0, active: true, _isNew: true }])
  }
  function addBundle() {
    setBundles(prev => [...prev, { id: `new_${Date.now()}`, trips: 0, price: 0, label: '', category: 'buddy_plus', active: false, _isNew: true }])
  }
  async function deleteRule(id: string) {
    const target = rules.find(r => r.id === id)
    if (!target || !confirm(`Delete fare ${target.category}?`)) return
    // FIX: Check _isNew, not id prefix - was startsWith('rule_') but new IDs were randomUUID, delete never hit DB
    if (!target._isNew) { const { error } = await supabase.from('fare_rules').delete().eq('id', id); if (error) { setMessage(`Could not delete: ${error.message}`); return } }
    setRules(prev => prev.filter(r => r.id !== id)); setMessage('Fare deleted.')
  }
  async function deleteBundle(id: string) {
    const target = bundles.find(b => b.id === id)
    if (!target || !confirm(`Delete bundle ${target.label}?`)) return
    if (!target._isNew) { const { error } = await supabase.from('bundle_prices').delete().eq('id', id); if (error) { setMessage(`Could not delete: ${error.message}`); return } }
    setBundles(prev => prev.filter(b => b.id !== id)); setMessage('Bundle deleted.')
  }

  const safePreviewKm = Number.isNaN(previewKm) ? 0 : previewKm
  const safePreviewMin = Number.isNaN(previewMin) ? 0 : previewMin
  function calcFare(c: FareRule) { const raw = c.base_fare + (c.per_km * safePreviewKm) + (c.per_min * safePreviewMin); const withMin = Math.max(raw, c.min_fare); return c.max_fare > 0 ? Math.min(withMin, c.max_fare) : withMin }
  function perTripCost(b: BundlePrice) { return b.trips > 0 ? b.price / b.trips : 0 }

  return <main style={{ minHeight: '100vh', background: '#0f172a', color: 'white', padding: '16px' }}>
    <button onClick={onBack} style={{ background: '#334155', color: 'white', border: 0, padding: '8px 14px', borderRadius: 999, fontWeight: 700, cursor: 'pointer' }}>← Admin home</button>
    <h1>Fare & Bundle Settings - Bundle Model</h1>
    <p style={{ color: '#86efac', fontSize: 13 }}>Driver keeps 100% of fare • Your profit = Bundle sales only • Drivers receive the full trip fare</p>
    {loading ? <p>Loading fare_rules + bundle_prices…</p> : <>
      <section style={{ maxWidth: '720px', background: '#14532d', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
        <h2 style={{ marginTop: 0 }}>Driver Fare Policy</h2>
        <p style={{ fontSize: 28, fontWeight: 800, margin: '4px 0' }}>No fare deductions</p>
        <p style={{ margin: '8px 0 0', fontSize: 13 }}>Driver keeps <strong>100%</strong> • Example: R100 ride = You get R0 from ride, Driver gets R100. You already got paid when driver bought bundle.</p>
      </section>
      <section style={{ maxWidth: '720px', background: '#1e293b', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
        <h2 style={{ marginTop: 0 }}>🎫 Bundle Prices - YOUR PROFIT (Edit This)</h2>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>Configure each bundle by vehicle category, number of trip credits and actual price. Drivers retain 100% of fares; Paystack is used only to buy bundles.</p>
        {bundles.map(b => (
          <div key={b.id} style={{ background: '#0f172a', padding: '12px', borderRadius: '10px', marginBottom: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '10px' }}>
            <label>Label<input type="text" value={b.label} onChange={e => updateBundle(b.id, 'label', e.target.value)} style={{ display: 'block', width: '100%', padding: '10px', marginTop: '4px', borderRadius: 8, border: 0 }} /></label>
            <label>Vehicle category<select value={b.category} onChange={e => updateBundle(b.id, 'category', e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8 }}><option value="buddy_lite">Buddy Lite</option><option value="buddy_plus">Buddy Plus</option><option value="buddy_max">Buddy Max</option></select></label>
            <label>Trips<input type="number" min="1" value={b.trips} onChange={e => updateBundle(b.id, 'trips', e.target.value)} style={{ display: 'block', width: '100%', padding: '10px', marginTop: '4px', borderRadius: 8, border: 0 }} /></label>
            <label>Price (R)<input type="number" min="0" step="1" value={b.price} onChange={e => updateBundle(b.id, 'price', e.target.value)} style={{ display: 'block', width: '100%', padding: '10px', marginTop: '4px', borderRadius: 8, border: 0 }} /></label>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#86efac', fontWeight: 700 }}>Bundle price per trip: R{perTripCost(b).toFixed(2)}</span>
              <label style={{ fontSize: 12 }}><input type="checkbox" checked={b.active} onChange={e => updateBundle(b.id, 'active', e.target.checked)} /> Active</label>
              <button onClick={() => void deleteBundle(b.id)} style={{ padding: '6px 12px', borderRadius: 8, background: '#7f1d1d', color: 'white', border: 0, cursor: 'pointer' }}>Delete bundle</button>
            </div>
          </div>
        ))}
        {bundles.length === 0 && <p style={{ color: '#94a3b8' }}>No bundles configured yet. Add a bundle and set its category, trips and price.</p>}
        <button onClick={addBundle} style={{ padding: '10px 18px', borderRadius: 10, background: '#0ea5e9', color: 'white', fontWeight: 800, border: 0, cursor: 'pointer' }}>+ Add Bundle</button>
      </section>
      <section style={{ maxWidth: '720px', background: '#1e293b', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
        <h2 style={{ marginTop: 0 }}>Fare Preview</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label>Distance (km)<input type="number" min="0" value={Number.isNaN(previewKm) ? '' : previewKm} onChange={e => setPreviewKm(e.target.value === '' ? 0 : Number(e.target.value))} style={{ display: 'block', width: 100, padding: 8, marginTop: 4, borderRadius: 8, border: 0 }} /></label>
          <label>Time (min)<input type="number" min="0" value={Number.isNaN(previewMin) ? '' : previewMin} onChange={e => setPreviewMin(e.target.value === '' ? 0 : Number(e.target.value))} style={{ display: 'block', width: 100, padding: 8, marginTop: 4, borderRadius: 8, border: 0 }} /></label>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Polokwane example: CBD → Seshego ≈ 5km, 10 min • Set Max Fare to 0 = no cap • Driver keeps 100% of preview fare</p>
      </section>
      {rules.map(category => <section key={category.id} style={{ maxWidth: '720px', background: '#1e293b', padding: '16px', borderRadius: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginTop: 0 }}>{category.category}</h2>
          <span style={{ background: '#0f172a', padding: '6px 12px', borderRadius: 20, fontWeight: 800 }}>Preview: R{calcFare(category).toFixed(2)} • Driver gets R{calcFare(category).toFixed(2)}</span>
        </div>
        <label style={{ display: 'block', marginBottom: '12px' }}><input type="checkbox" checked={category.active} onChange={event => updateRule(category.id, 'active', event.target.checked)} />{' '}Available to passengers</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px' }}>
          {([
            ['category', 'Category name'], ['base_fare', 'Base fare (R)'], ['per_km', 'Per kilometer (R)'], ['per_min', 'Per minute (R)'], ['min_fare', 'Minimum fare (R)'], ['max_fare', 'Maximum fare (R) - 0 = no cap'],
          ] as const).map(([field, label]) => <label key={field} style={{ display: 'block' }}>{label}<input type={field === 'category' ? 'text' : 'number'} min="0" step="0.5" value={category[field]} onChange={event => updateRule(category.id, field, event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px', marginTop: '4px', borderRadius: 8, border: 0 }} /></label>)}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>Formula: R{category.base_fare} + (R{category.per_km} × {safePreviewKm}km) + (R{category.per_min} × {safePreviewMin}min) = R{calcFare(category).toFixed(2)} • Driver gets R{calcFare(category).toFixed(2)} (100%) • You get R0 from ride</p>
        <button onClick={() => void deleteRule(category.id)} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 8, background: '#7f1d1d', color: 'white', border: 0, cursor: 'pointer' }}>Delete category</button>
      </section>)}
      {rules.length === 0 && <p style={{ color: '#94a3b8' }}>No fare rules yet. Add one below.</p>}
      <section style={{ maxWidth: '720px', background: '#1e293b', padding: '16px', borderRadius: '12px' }}>
        <p>Drivers receive 100% of the fare. Platform revenue comes from paid bundle purchases.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={addRule} style={{ marginTop: '14px', padding: '12px 20px', borderRadius: 10, background: '#0ea5e9', color: 'white', fontWeight: 800, border: 0, cursor: 'pointer' }}>+ Add Category</button>
          <button disabled={saving || rules.length === 0} onClick={() => void save()} style={{ marginTop: '14px', padding: '12px 20px', borderRadius: 10, background: '#22c55e', color: 'black', fontWeight: 800, border: 0, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save fare + bundle settings'}</button>
        </div>
      </section>
    </>}
    {message && <p role={message.startsWith('Could not') || message.startsWith('Check') ? 'alert' : 'status'} style={{ color: message.startsWith('Could not') ? '#fca5a5' : '#86efac' }}>{message}</p>}
  </main>
}