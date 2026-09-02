import { useState } from 'react'

const cats = [
  { id: 'go', label: 'Go', seats: 2, price: 45 },
  { id: 'comfort', label: 'Comfort', seats: 3, price: 65 },
  { id: 'xl', label: 'XL', seats: 6, price: 95 },
] as const

type CategoryId = (typeof cats)[number]['id']

export default function App() {
  const [category, setCategory] = useState<CategoryId>('go')
  const [pax, setPax] = useState(1)
  const [loading, setLoading] = useState(false)
  const [requested, setRequested] = useState(false)
  const [from] = useState('Polokwane')
  const [to, setTo] = useState('Mall of the North')
  const current = cats.find(c => c.id === category)!
  const price = current.price * pax

  if (requested) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h1>Searching driver...</h1>
        <p>{from} to {to}</p>
        <p>{current.label} - {pax} pax - R{price}</p>
        <button onClick={() => setRequested(false)} style={{ marginTop: 20, padding: 12, background: 'black', color: 'white', borderRadius: 8 }}>Cancel</button>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Map - Polokwane
        <div style={{ position: 'absolute', top: 20, left: 16, right: 16 }}>
          <input value={to} onChange={event => setTo(event.target.value)} placeholder="Where to?" style={{ width: '100%', padding: 12, borderRadius: 12 }} />
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', padding: 16, zIndex: 9999, pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {cats.map(c => (
            <button key={c.id} onClick={() => { setCategory(c.id); setPax(Math.min(pax, c.seats)) }} style={{ flex: 1, padding: 10, borderRadius: 10, background: category === c.id ? 'black' : '#eee', color: category === c.id ? 'white' : 'black' }}>
              {c.label} ({c.seats})
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <span>Pax:</span>
          <button onClick={() => setPax(Math.max(1, pax - 1))}>-</button>
          <span style={{ fontWeight: 800 }}>{pax}</span>
          <button onClick={() => setPax(Math.min(current.seats, pax + 1))}>+</button>
          <span style={{ fontSize: 12, color: '#666' }}>Max {current.seats} for {current.label}</span>
        </div>

        <button onClick={() => {
          if (pax > current.seats) { alert(current.label + ' max ' + current.seats + ' passengers'); return }
          setLoading(true)
          setTimeout(() => { setLoading(false); setRequested(true) }, 800)
        }} style={{ width: '100%', background: 'black', color: 'white', padding: 16, borderRadius: 12, fontSize: 18, fontWeight: 800, border: 'none', pointerEvents: 'auto', cursor: 'pointer' }}>
          {loading ? 'Loading...' : `Request BuddyRide - R${price}`}
        </button>
      </div>
    </div>
  )
}