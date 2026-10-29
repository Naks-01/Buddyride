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

  useEffect(() => {
    async function load() {
      const [categoryResult, settingsResult] = await Promise.all([
        supabase.from('fare_categories').select('id,label,base_fare,per_km,per_min,min_fare,max_fare,active').order('id'),
        supabase.from('app_settings').select('commission').eq('id', 1).single(),
      ])
      if (categoryResult.error || settingsResult.error) {
        setMessage(`Could not load fare settings: ${categoryResult.error?.message || settingsResult.error?.message}`)
      } else {
        setCategories((categoryResult.data || []).map(category => ({
          ...category,
          base_fare: Number(category.base_fare),
          per_km: Number(category.per_km),
          per_min: Number(category.per_min),
          min_fare: Number(category.min_fare),
          max_fare: Number(category.max_fare),
        })))
        setCommission(Number(settingsResult.data.commission))
      }
      setLoading(false)
    }
    void load()
  }, [])

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('save_fare_settings', {
        p_categories: categories,
        p_commission: commission,
      })
      if (error) throw error
      setMessage('Fare settings saved.')
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

  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button>
    <h1>Fare Settings</h1>
    {loading ? <p>Loading fare categories…</p> : <>
      {categories.map(category => <section key={category.id} style={{maxWidth:'720px', background:'#1e293b', padding:'16px', borderRadius:'12px', marginBottom:'12px'}}>
        <h2 style={{marginTop:0}}>{category.label}</h2>
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
            <input type={field === 'label' ? 'text' : 'number'} min="0" step="0.5" value={category[field]} onChange={event=>updateCategory(category.id, field, event.target.value)} style={{display:'block', width:'100%', boxSizing:'border-box', padding:'10px', marginTop:'4px'}} />
          </label>)}
        </div>
      </section>)}
      <section style={{maxWidth:'720px', background:'#1e293b', padding:'16px', borderRadius:'12px'}}>
        <label>Platform commission (%)
          <input type="number" min="0" max="100" step="0.5" value={commission} onChange={event=>setCommission(Number(event.target.value))} style={{display:'block', width:'100%', boxSizing:'border-box', padding:'10px', marginTop:'4px'}} />
        </label>
        <button disabled={saving || categories.length === 0} onClick={()=>void save()} style={{marginTop:'14px'}}>
          {saving ? 'Saving…' : 'Save fare settings'}
        </button>
      </section>
    </>}
    {message && <p role={message.startsWith('Could not') ? 'alert' : 'status'}>{message}</p>}
  </main>
}
