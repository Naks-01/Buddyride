export default function LandingPage(){
  return (
    <div style={{minHeight:'100vh', background:'#ffffff', color:'#111827', fontFamily:'system-ui, -apple-system, Segoe UI, Roboto', overflowX:'hidden'}}>
      <header style={{position:'sticky', top:0, background:'#ffffff', borderBottom:'1px solid #e5e7eb', zIndex:50}}>
        <div style={{maxWidth:'1200px', margin:'0 auto', padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <b style={{fontSize:'20px', letterSpacing:'-0.5px'}}>BuddyRide</b>
          <span style={{fontSize:'11px', background:'#dcfce7', color:'#166534', padding:'6px 12px', borderRadius:'999px', fontWeight:700, letterSpacing:'0.5px'}}>● LIVE IN POLOKWANE • LIMPOPO</span>
        </div>
      </header>

      <section style={{maxWidth:'1200px', margin:'0 auto', padding:'48px 24px', display:'grid', gridTemplateColumns:'1fr', gap:'32px'}}>
        <div>
          <h1 style={{fontSize:'48px', fontWeight:900, lineHeight:'0.95', margin:0, letterSpacing:'-2px'}}>Your ride,<br/>your <span style={{background:'#facc15', padding:'0 14px'}}>buddy.</span></h1>
          <p style={{marginTop:'20px', color:'#4b5563', fontSize:'18px', lineHeight:'1.5', maxWidth:'520px'}}>Limpopo's first local ride-hailing. Built for our roads, our people. Cheaper for riders, more for drivers than other e-hailing apps.</p>
          
          <div style={{marginTop:'32px', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'12px', maxWidth:'420px'}}>
            <div style={{background:'#f9fafb', padding:'14px', borderRadius:'16px'}}><div style={{fontWeight:900, fontSize:'18px'}}>R25</div><div style={{fontSize:'12px', color:'#6b7280'}}>Min fare</div></div>
            <div style={{background:'#f9fafb', padding:'14px', borderRadius:'16px'}}><div style={{fontWeight:900, fontSize:'18px'}}>3 min</div><div style={{fontSize:'12px', color:'#6b7280'}}>Avg pickup</div></div>
            <div style={{background:'#f9fafb', padding:'14px', borderRadius:'16px'}}><div style={{fontWeight:900, fontSize:'18px'}}>85%</div><div style={{fontSize:'12px', color:'#6b7280'}}>To drivers</div></div>
          </div>

          <p style={{marginTop:'20px', fontSize:'13px', color:'#6b7280'}}>✓ Local support ✓ Cash & card ✓ Safe trips</p>
        </div>

        <div style={{background:'#f3f4f6', borderRadius:'32px', padding:'24px'}}>
          <div style={{background:'white', borderRadius:'24px', boxShadow:'0 20px 40px rgba(0,0,0,0.12)', padding:'20px', maxWidth:'360px', margin:'0 auto'}}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'16px', fontWeight:800, fontSize:'14px'}}>
              <span>Where to?</span><span style={{fontSize:'11px', background:'#dcfce7', color:'#166534', padding:'4px 10px', borderRadius:'999px'}}>● Online</span>
            </div>
            <div style={{padding:'12px 14px', background:'#f9fafb', borderRadius:'12px', fontSize:'14px'}}>📍 Mall of the North</div>
            <div style={{padding:'12px 14px', background:'#111827', color:'white', borderRadius:'12px', marginTop:'8px', fontSize:'14px'}}>🏁 Seshego Zone 4</div>
            <div style={{marginTop:'16px', padding:'14px 16px', background:'#facc15', borderRadius:'12px', display:'flex', justifyContent:'space-between', fontWeight:900, fontSize:'14px'}}>
              <span>Est. R85 • 12 min</span><span>→</span>
            </div>
            <div style={{marginTop:'12px', textAlign:'center', fontSize:'11px', color:'#9ca3af'}}>BuddyRide • Limpopo eHailing</div>
          </div>
        </div>
      </section>

      <footer style={{background:'#111827', color:'white', padding:'32px 24px', textAlign:'center'}}>
        <div style={{fontWeight:700}}>© 2026 BuddyRide • buddyride.co.za</div>
        <div style={{fontSize:'13px', opacity:0.7, marginTop:'6px'}}>Polokwane, Limpopo • Local is Lekker</div>
        <div style={{fontSize:'12px', opacity:0.5, marginTop:'8px'}}>Lower fees than other e-hailing platforms. More earnings stay in Limpopo.</div>
      </footer>
    </div>
  )
}