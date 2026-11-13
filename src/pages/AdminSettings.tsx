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
          base_fare: Number(category.base_fare ?? 0),
          per_km: Number(category.per_km ?? 0),
          per_min: Number(category.per_min ?? 0),
          min_fare: Number(category.min_fare ?? 0),
          max_fare: Number(category.max_fare ?? 0),
        })))
      }
      if (!settingsRes.error && settingsRes.data?.value != null) {
        const parsed = Number(settingsRes.data.value)
        if (!Number.isNaN(parsed)) setCommission(parsed)
      }
      setLoading(false)
    }
    void load()
  }, [])

  async function save() {
    setSaving(true)
    setMessage('')
    // FIX: max_fare = 0 means NO CAP, not R0. Old validation blocked min=30, max=0
    const invalid = categories.find(c =>
      [c.base_fare, c.per_km, c.per_min, c.min_fare, c.max_fare].some(v => Number.isNaN(v) || v < 0) ||
      (c.max_fare > 0 && c.min_fare > c.max_fare) ||
      !c.label.trim()
    )
    if (invalid) {
      setMessage(`Check ${invalid.label || 'a category'}: All fares must be 0 or more, Min cannot be > Max (0 = no cap), name cannot be empty.`)
      setSaving(false)
      return
    }
    if (Number.isNaN(commission) || commission < 0 || commission > 50) {
      setMessage('Commission must be between 0% and 50%.')
      setSaving(false)
      return
    }
    try {
      const { error } = await supabase.rpc('save_fare_settings', {
        p_categories: categories,
        p_commission: commission,
      })
      if (error) {
        // FIX: Fall back to direct upsert on ANY RPC error, not only "function does not exist"
        // RPC may fail on type mismatch / permissions - direct upsert is the reliable path
        const { error: directError } = await supabase.from('fare_categories').upsert(categories as any, { onConflict: 'id' })
        if (directError) throw directError
      }
      const { error: commError } = await supabase.from('app_settings').upsert({ key: 'commission_percent', value: String(commission) } as any, { onConflict: 'key' })
      if (commError) throw commError
      setMessage(`Fare settings saved. Commission: ${commission}% (Driver keeps ${100 - commission}%). NOTE: Finance page still uses 20% until you update it to read this setting.`)
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
      const num = value === '' ? 0 : Number(value)
      return { ...category, [field]: Number.isNaN(num) ? 0 : num }
    }))
  }

  // FIX: Add new category - was impossible if table was empty (Save disabled)
  function addCategory() {
    const newCat: FareCategory = {
      id: `cat_${Date.now()}`,
      label: 'New Category',
      base_fare: 20,
      per_km: 8,
      per_min: 1,
      min_fare: 30,
      max_fare: 0,
      active: true,
    }
    setCategories(prev => [...prev, newCat])
  }

  function deleteCategory(id: string) {
    if (!confirm('Delete this fare category?')) return
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  const safeCommission = Number.isNaN(commission) ? 20 : commission
  const safePreviewKm = Number.isNaN(previewKm) ? 0 : previewKm
  const safePreviewMin = Number.isNaN(previewMin) ? 0 : previewMin

  function calcFare(c: FareCategory) {
    // FIX: Use safe preview values - raw NaN made preview show NaN
    const raw = c.base_fare + (c.per_km * safePreviewKm) + (c.per_min * safePreviewMin)
    const withMin = Math.max(raw, c.min_fare)
    return c.max_fare > 0 ? Math.min(withMin, c.max_fare) : withMin
  }

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button>
    <h1>Fare Settings</h1>
    {loading ? <p>Loading fare categories…</p> : <>
      <section style={{maxWidth:'720px', background:'#f97316', padding:'16px', borderRadius:'12px', marginBottom:'12px'}}>
        <h2 style={{ marginTop: 0 }}>Platform Commission</h2>
        <label style={{ display: 'block' }}>
          Commission % (BuddyRide keeps)
          <input type="number" min="0" max="50" step="1" value={Number.isNaN(commission) ? '' : commission} onChange={e => setCommission(e.target.value === '' ? NaN : Number(e.target.value))} style={{ display: 'block', width: 120, padding: 10, marginTop: 4, borderRadius: 8, border: 0, fontSize: 18, fontWeight: 800 }} />
        </label>
        <p style={{ margin: '8px 0 0', fontSize: 13 }}>Driver keeps <strong>{100 - safeCommission}%</strong> • Example: R100 ride = You get R{safeCommission.toFixed(0)}, Driver gets R{(100 - safeCommission).toFixed(0)}</p>
      </section>

      <section style={{maxWidth:'720px', background:'#1e293b', padding:'16px', borderRadius:'12px', marginBottom:'12px'}}>
        <h2 style={{ marginTop: 0 }}>Fare Preview</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label>Distance (km)<input type="number" min="0" value={Number.isNaN(previewKm) ? '' : previewKm} onChange={e => setPreviewKm(e.target.value === '' ? 0 : Number(e.target.value))} style={{ display: 'block', width: 100, padding: 8, marginTop: 4, borderRadius: 8, border: 0 }} /></label>
          <label>Time (min)<input type="number" min="0" value={Number.isNaN(previewMin) ? '' : previewMin} onChange={e => setPreviewMin(e.target.value === '' ? 0 : Number(e.target.value))} style={{ display: 'block', width: 100, padding: 8, marginTop: 4, borderRadius: 8, border: 0 }} /></label>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>Polokwane example: CBD → Seshego ≈ 5km, 10 min • Set Max Fare to 0 = no cap</p>
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
            ['max_fare','Maximum fare (R) - 0 = no cap'],
          ] as const).map(([field,label])=><label key={field} style={{display:'block'}}>
            {label}
            <input type={field === 'label' ? 'text' : 'number'} min="0" step="0.5" value={category[field]} onChange={event=>updateCategory(category.id, field, event.target.value)} style={{display:'block', width:'100%', boxSizing:'border-box', padding:'10px', marginTop:'4px', borderRadius:8, border:0}} />
          </label>)}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 0' }}>Formula: R{category.base_fare} + (R{category.per_km} × {safePreviewKm}km) + (R{category.per_min} × {safePreviewMin}min) = R{calcFare(category).toFixed(2)} • Driver gets R{(calcFare(category) * (100 - safeCommission) / 100).toFixed(2)}</p>
        <button onClick={() => deleteCategory(category.id)} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 8, background: '#7f1d1d', color: 'white', border: 0, cursor: 'pointer' }}>Delete category</button>
      </section>)}
      {categories.length === 0 && <p style={{ color: '#94a3b8' }}>No fare categories yet. Add one below.</p>}
      <section style={{maxWidth:'720px', background:'#1e293b', padding:'16px', borderRadius:'12px'}}>
        <p>Platform commission is <strong>{safeCommission}%</strong> (drivers keep {100 - safeCommission}%).</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={addCategory} style={{ marginTop: '14px', padding: '12px 20px', borderRadius: 10, background: '#0ea5e9', color: 'white', fontWeight: 800, border: 0, cursor: 'pointer' }}>+ Add Category</button>
          <button disabled={saving || categories.length === 0} onClick={()=>void save()} style={{marginTop:'14px', padding:'12px 20px', borderRadius:10, background:'#22c55e', color:'black', fontWeight:800, border:0, cursor:'pointer'}}>
            {saving ? 'Saving…' : 'Save fare settings'}
          </button>
        </div>
      </section>
    </>}
    {message && <p role={message.startsWith('Could not') || message.startsWith('Check') || message.startsWith('Commission must') ? 'alert' : 'status'} style={{ color: message.startsWith('Could not') ? '#fca5a5' : '#86efac' }}>{message}</p>}
  </main>
}