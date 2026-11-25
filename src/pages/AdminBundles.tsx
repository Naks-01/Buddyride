import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Bundle = {
  id: string
  label: string
  category: string
  trips: number
  price: number
  active?: boolean
  is_active?: boolean
}

export default function AdminBundles() {
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.from('bundle_prices').select('*').order('trips').order('category')
    if (loadError) setError(loadError.message)
    setBundles(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function updatePrice(id: string, field: string, value: any) {
    // FIX: Price validation - was saving NaN / negative / 0, broke driver app
    if (field === 'price') {
      const num = Number(value)
      if (!Number.isFinite(num) || num < 0) { alert('Enter a valid price (0 or more)'); load(); return }
      value = num
    }
    setSavingId(id)
    const { error: updateError } = await supabase.from('bundle_prices').update({ [field]: value }).eq('id', id)
    setSavingId(null)
    if (updateError) alert(updateError.message)
    else load()
  }

  if (loading) return <div className="p-4">Loading bundles...</div>

  return (
    <div className="p-4 bg-zinc-950 text-white min-h-screen">
      <h1 className="text-2xl font-black mb-2">Bundle Prices - Edit Live</h1>
      <p className="text-gray-400 text-sm mb-4">Changes here update driver app instantly.</p>
      {error && <div className="bg-red-900/50 text-red-200 p-3 rounded-xl mb-4 text-sm">{error}</div>}

      <div className="grid gap-3">
        {bundles.map(b => {
          // FIX: Support both `active` and `is_active` columns - was toggling wrong column, driver app ignored it
          const isActive = b.active ?? b.is_active ?? true
          return (
            <div key={b.id} className="bg-zinc-900 p-3 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold">{b.label}</div>
                <div className="text-xs text-gray-500">{b.category} • {b.trips} trips</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">R</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  // FIX: Controlled value - was defaultValue, edits lost if you typed then clicked toggle
                  value={b.price}
                  onChange={e => setBundles(prev => prev.map(x => x.id === b.id ? { ...x, price: Number(e.target.value) } : x))}
                  onBlur={e => updatePrice(b.id, 'price', parseFloat(e.target.value))}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  disabled={savingId === b.id}
                  className="w-20 bg-black border border-zinc-700 rounded-lg px-2 py-1 text-white"
                />
                <button
                  onClick={() => updatePrice(b.id, b.active !== undefined ? 'active' : 'is_active', !isActive)}
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