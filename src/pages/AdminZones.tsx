import { useState } from 'react'

export function AdminZones({ onBack }: { onBack: () => void }) {
  const [zone] = useState({ name:'Polokwane', latitude:-23.9045, longitude:29.4689, radiusKm:15, baseFare:15, perKm:7 })
  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Service Zones</h1>
    <section style={{background:'#1e293b', padding:'16px', borderRadius:'12px', marginTop:'12px'}}>
      <h2>{zone.name}</h2>
      <p>Center: {zone.latitude}, {zone.longitude}</p>
      <p>Service radius: {zone.radiusKm} km</p>
      <p>Base fare: R{zone.baseFare.toFixed(2)}</p>
      <p>Per kilometer: R{zone.perKm.toFixed(2)}</p>
    </section>
  </main>
}
