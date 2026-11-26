import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Bundle = {
  id: string
  label: string
  category: string
  trips: number
  price: number
  active?: boolean | null
  is_active?: boolean | null
}

function isBundleActive(b: Bundle): boolean {
  // FIX: No ?? + || mixing - use only ?? chain here
  return (b.active ?? b.is_active) ?? true
}

export default function AdminBundles() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.from('bundle_prices').select('*').order('trips').order('category')
    if (loadError) setError(loadError.message)
    setBundles((data || []) as Bundle[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updatePrice(id: string, field: string, value: any, originalValue?: any) {
    // FIX: Don't save if nothing changed - was spamming Supabase on every blur
    if (originalValue !== undefined && Number(value) === Number(originalValue)) return
    if (field === 'price') {
      const num = Number(value)
      if (!Number.isFinite(num) || num < 0) { alert('Enter a valid price (0 or more)'); void load(); return }
      value = num
    }
    if (field === 'trips') {
      const num = Number(value)
      if (!Number.isFinite(num) || num <= 0) { alert('Trips must be > 0'); void load(); return }
      value = Math.round(num)
    }
    setSavingId(id)
    setMsg('')
    // FIX: Update BOTH active columns so driver app sees it regardless of which column it reads
    let payload: Record<string, any> = { [field]: value }
    if (field === 'active' || field === 'is_active') {
      payload = { active: value, is_active: value }
    }
    const { error: updateError } = await supabase.from('bundle_prices').update(payload).eq('id', id)
    setSavingId(null)
    if (updateError) {
      // FIX: If one column doesn't exist, retry with only the other - was failing whole save
      if (/column|active/i.test(updateError.message) && (field === 'active' || field === 'is_active')) {
        const fallbackField = field === 'active' ? 'is_active' : 'active'
        const { error: retryError } = await supabase.from('bundle_prices').update({ [fallbackField]: value }).eq('id', id)
        if (retryError) alert(retryError.message)
        else setMsg('✅ Saved')
      } else {
        alert(updateError.message)
      }
    } else {
      setMsg('✅ Saved - driver app updated')
    }
    void load()
  }

  if (loading) return <div className="p-4">Loading bundles...</div>

  return (
    <div className="p-4 bg-zinc-950 text-white min-h-screen">
      <h1 className="text-2xl font-black mb-2">Bundle Prices - Edit Live</h1>
      <p className="text-gray-400 text-sm mb-4">Changes here update driver app instantly.</p>
      {error && <div className="bg-red-900/50 text-red-200 p-3 rounded-xl mb-4 text-sm">{error}</div>}
      {msg && <div className="bg-green-900/50 text-green-200 p-3 rounded-xl mb-4 text-sm">{msg}</div>}

      <div className="grid gap-3">
        {bundles.map(b => {
          const isActive = isBundleActive(b)
          return (
            <div key={b.id} className="bg-zinc-900 p-3 rounded-xl flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-bold">{b.label || `${b.trips} trips`}</div>
                <div className="text-xs text-gray-500">{b.category} • {b.trips} trips • R{(Number(b.price) / Math.max(1, Number(b.trips))).toFixed(2)}/trip</div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Trips</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={b.trips}
                  onChange={e => setBundles(prev => prev.map(x => x.id === b.id ? { ...x, trips: Number(e.target.value) } : x))}
                  onBlur={e => void updatePrice(b.id, 'trips', e.target.value, b.trips)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  disabled={savingId === b.id}
                  className="w-16 bg-black border border-zinc-700 rounded-lg px-2 py-1 text-white"
                />
                <span className="text-gray-500">R</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={b.price}
                  onChange={e => setBundles(prev => prev.map(x => x.id === b.id ? { ...x, price: Number(e.target.value) } : x))}
                  onBlur={e => void updatePrice(b.id, 'price', parseFloat(e.target.value), b.price)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  disabled={savingId === b.id}
                  className="w-20 bg-black border border-zinc-700 rounded-lg px-2 py-1 text-white"
                />
                <button
                  onClick={() => void updatePrice(b.id, 'active', !isActive)}
                  disabled={savingId === b.id}
                  className={`px-3 py-1 rounded-full text-xs disabled:opacity-50 ${isActive ? 'bg-green-600' : 'bg-red-600'}`}
                >
                  {savingId === b.id ? 'Saving...' : isActive ? 'Active' : 'Off'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {bundles.length === 0 && !error && <p className="text-gray-500 text-sm mt-4">No bundles found. Check `bundle_prices` table.</p>}

      <div className="mt-6 text-xs text-gray-500">
        Tip: Click price, change, then click outside or press Enter. No save button needed.
      </div>
    </div>
  )
}