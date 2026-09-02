<MapContainer center={POLOKWANE} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap - Polokwane" />
        <Marker position={pickup} icon={icon} />
        {dest && <Marker position={dest} icon={icon} />}
        {dest && <Polyline positions={[pickup, dest]} color="#000" weight={5} />}
        <Recenter pos={dest || pickup} />
      </MapContainer>

      {dest && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'white', borderRadius: '20px 20px 0 0',
          padding: 16, zIndex: 9999, pointerEvents: 'auto'
        }}>
          <div style={{ width: 40, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', marginBottom: 8 }}>
            <span>{distance.toFixed(1)} km • {Math.round(distance*2)} min</span>
            <span>👤 Pax: <select value={pax} onChange={e => setPax(Number(e.target.value))}>
              {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
            </select></span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {cats.map(c => {
              const p = Math.round(distance * c.rate + 20)
              const active = category === c.id
              return (
                <button key={c.id} onClick={() => setCategory(c.id as any)}
                  style={{ flex: 1, padding: '10px 4px', borderRadius: 14, border: 2px solid ${active?'#000':'#eee'}, background: active?'#000':'white', color: active?'white':'black' }}>
                  <div style={{ fontWeight: 800 }}>{c.label}</div>
                  <div style={{ fontSize: 10 }}>{c.sub}</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>R{p}</div>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
            <span>Cash • {currentCat.label} • {pax} pax</span><b>R{price}</b>
          </div>

          <button
            onClick={() => {
              const current = cats.find(c => c.id === category)
              if (pax > current.seats) { alert(current.label + ' max ' + current.seats); return }
              setLoading(true)
              setTimeout(() => { setLoading(false); setRequested(true) }, 800)
            }}
            style={{
              width: '100%', background: 'black', color: 'white',
              padding: 16, borderRadius: 12, fontSize: 18,
              fontWeight: 800, border: 'none', pointerEvents: 'auto'
            }}
          >
            Request BuddyRide • R{price}
          </button>
        </div>
      )}
    </div>
  )
}