import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminBundles() {
  const [bundles, setBundles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('bundle_prices').select('*').order('trips').order('category')
    setBundles(data || [])
    setLoading(false)
  }

  useEffect(()=>{ load() }, [])

  async function updatePrice(id: string, field: string, value: any) {
    const { error } = await supabase.from('bundle_prices').update({ [field]: value }).eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (loading) return <div className="p-4">Loading bundles...</div>

  return (
    <div className="p-4 bg-zinc-950 text-white min-h-screen">
      <h1 className="text-2xl font-black mb-2">Bundle Prices - Edit Live</h1>
      <p className="text-gray-400 text-sm mb-4">Changes here update driver app instantly.</p>
      
      <div className="grid gap-3">
        {bundles.map(b => (
          <div key={b.id} className="bg-zinc-900 p-3 rounded-xl flex items-center justify-between">
            <div>
              <div className="font-bold">{b.label}</div>
              <div className="text-xs text-gray-500">{b.category} • {b.trips} trips</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">R</span>
              <input
                type="number"
                defaultValue={b.price}
                onBlur={e => updatePrice(b.id, 'price', parseFloat(e.target.value))}
                className="w-20 bg-black border border-zinc-700 rounded-lg px-2 py-1 text-white"
              />
              <button onClick={()=>updatePrice(b.id, 'active', !b.active)} className={`px-3 py-1 rounded-full text-xs ${b.active?'bg-green-600':'bg-red-600'}`}>
                {b.active?'Active':'Off'}
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-6 text-xs text-gray-500">
        Tip: Click price, change, then click outside. No save button needed.
      </div>
    </div>
  )
}