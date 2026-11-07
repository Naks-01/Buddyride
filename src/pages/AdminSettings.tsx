import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type FareCategory = {
  id: string
  label: string
  base_fare: number
  per_km: number
  per_min: number
  min_fare: number
  max_fare: number
  active: boolean
}

export function AdminSettings({ onBack }: { onBack: () => void }) {
  const [categories, setCategories] = useState<FareCategory[]>([])
  const [commission, setCommission] = useState(20)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewKm, setPreviewKm] = useState(5)
  const [previewMin, setPreviewMin] = useState(10)

  useEffect(() => {
    async function load() {
      const [fareRes, settingsRes] = await Promise.all([
        supabase.from('fare_categories').select('id,label,base_fare,per_km,per_min,min_fare,max_fare,active').order('id'),
        supabase.from('app_settings').select('value').eq('key', 'commission_percent').maybeSingle(),
      ])
      if (fareRes.error) {
        setMessage(`Could not load fare settings: ${fareRes.error.message}`)
      } else {
        setCategories((fareRes.data || []).map(category => ({
          ...category,
          base_fare: Number(category.base_fare),
          per_km: Number(category.per_km),
          per_min: Number(category.per_min),
          min_fare: Number(category.min_fare),
          max_fare: Number(category.max_fare),
        })))
      }
      // Load commission - fallback 20 if table / row missing
      if (!settingsRes.error && settingsRes.data?.value) {
        setCommission(Number(settingsRes.data.value))
      }
      setLoading(false)
    }
    void load()
  }, [])

  async function save() {
    setSaving(true)
    setMessage('')
    // Validate before save
    const invalid = categories.find(c => c.min_fare > c.max_fare || c.base_fare < 0 || c.per_km < 0)
    if (invalid) {
      setMessage(`Check ${invalid.label}: Min fare cannot be > Max fare, fares cannot be negative.`)
      setSaving(false)
      return
    }
    if (commission < 0 || commission > 50) {
      setMessage('Commission must be between 0% and 50%.')
      setSaving(false)
      return
    }
    try {
      const { error } = await supabase.rpc('save_fare_settings', {
        p_categories: categories,
        p_commission: commission,
      })
      if (error) throw error
      // Also save to app_settings so other pages can read it
      await supabase.from('app_settings').upsert({ key: 'commission_percent', value: String(commission) } as any, { onConflict: 'key' })
      setMessage(`Fare settings saved. Commission: ${commission}% (Driver keeps ${100 - commission}%).`)
    } catch (error) {
      setMessage(`Could not save fare settings: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  function updateCategory(id: string, field: 'label' | 'active' | 'base_fare' | 'per_km' | 'per_min' | 'min_fare' | 'max_fare', value: string | boolean) {
    setCategories(current => current.map(category => {
      if (category.id !== id) return category
      if (field === 'label') return { ...category, label: String(value) }
      if (field === 'active') return { ...category, active: Boolean(value) }
      return { ...category, [field]: Number(value) }
    }))
  }

  function calcFare(c: FareCategory) {
    const raw = c.base_fare + (c.per_km * previewKm) + (c.per_min * previewMin)
    return Math.min(Math.max(raw, c.min_fare), c.max_fare)
  }

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button>
    <h1>Fare Settings</h1>
    {loading ? <p>Loading fare categories…</p> : <>
      <section style={{maxWidth:'720px', background:'#f97316', padding:'16px', borderRadius:'12px', marginBottom:'12px'}}>
        <h2 style={{ marginTop: 0 }}>Platform Commission</h2>
        <label style={{ display: 'block' }}>
          Commission % (BuddyRide keeps)
          <input type="number" min="0" max="50" step="1" value={commission} onChange={e => setCommission(Number(e.target.value))} style={{ display: 'block', width: 120, padding: 10, marginTop: 4, borderRadius: 8, border: 0, fontSize: 18, fontWeight: 800 }} />
        </label>
        <p style={{ margin: '8px 0 0', fontSize: 13 }}>Driver keeps <strong>{100 - commission}%</strong> • Example: R100 ride = You get R{commission.toFixed(0)}, Driver gets R{(100 - commission).toFixed(0)}</p>
      </section>

      <section style={{maxWidth:'720px', background:'#1e293b', padding:'16px', borderRadius:'12px', marginBottom:'12px'}}>
        <h2 style={{ marginTop: 0 }}>Fare Preview</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label>Distance (km)<input type="number" min="0" value={previewKm} onChange={e => setPreviewKm(Number(e.target.value))} style={{ display: 'block', width: 100, padding: 8, marginTop: 4, borderRadius: 8, border: 0 }} /></label>
          <label>Time (min)<input type="number" min="0" value={previewMin} onChange={e => setPreviewMin(Number(e.target.value))} style={{ display: 'block', width: 100, padding: 8, marginTop: 4, borderRadius: 8, border: 0 }} /></label>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Polokwane example: CBD → Seshego ≈ 5km, 10 min</p>
      </section>

      {categories.map(category => <section key={category.id} style={{maxWidth:'720px', background:'#1e293b', padding:'16px', borderRadius:'12px', marginBottom:'12px'}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{marginTop:0}}>{category.label}</h2>
          <span style={{ background: '#0f172a', padding: '6px 12px', borderRadius: 20, fontWeight: 800 }}>Preview: R{calcFare(category).toFixed(2)}</span>
        </div>
        <label style={{display:'block', marginBottom:'12px'}}>
          <input type="checkbox" checked={category.active} onChange={event=>updateCategory(category.id, 'active', event.target.checked)} />
          {' '}Available to passengers
        </label>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:'10px'}}>
          {([
            ['label','Category name'],
            ['base_fare','Base fare (R)'],
            ['per_km','Per kilometer (R)'],
            ['per_min','Per minute (R)'],
            ['min_fare','Minimum fare (R)'],
            ['max_fare','Maximum fare (R)'],
          ] as const).map(([field,label])=><label key={field} style={{display:'block'}}>
            {label}
            <input type={field === 'label' ? 'text' : 'number'} min="0" step="0.5" value={category[field]} onChange={event=>updateCategory(category.id, field, event.target.value)} style={{display:'block', width:'100%', boxSizing:'border-box', padding:'10px', marginTop:'4px', borderRadius:8, border:0}} />
          </label>)}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>Formula: R{category.base_fare} + (R{category.per_km} × {previewKm}km) + (R{category.per_min} × {previewMin}min) = R{calcFare(category).toFixed(2)} • Driver gets R{(calcFare(category) * (100 - commission) / 100).toFixed(2)}</p>
      </section>)}
      <section style={{maxWidth:'720px', background:'#1e293b', padding:'16px', borderRadius:'12px'}}>
        <p>Platform commission is <strong>{commission}%</strong> (drivers keep {100 - commission}%).</p>
        <button disabled={saving || categories.length === 0} onClick={()=>void save()} style={{marginTop:'14px', padding:'12px 20px', borderRadius:10, background:'#22c55e', color:'black', fontWeight:800, border:0, cursor:'pointer'}}>
          {saving ? 'Saving…' : 'Save fare settings'}
        </button>
      </section>
    </>}
    {message && <p role={message.startsWith('Could not') || message.startsWith('Check') || message.startsWith('Commission must') ? 'alert' : 'status'} style={{ color: message.startsWith('Could not') ? '#fca5a5' : '#86efac' }}>{message}</p>}
  </main>
}