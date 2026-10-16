import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const style = {
    bg: '#0e0e10',
    card: '#18181b',
    border: '#27272a',
    orange: '#ff7a00',
    yellow: '#FFD60A',
    green: '#00d181',
    text: 'white',
    muted: '#9ca3af'
  } as const

  return (
    <div style={{ background: style.bg, minHeight:'100vh', color: style.text, fontFamily:'Inter, system-ui, sans-serif', overflowX:'hidden' }}>
      
      {/* Header */}
      <header style={{ padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid ${style.border}`, position:'sticky', top:0, background:style.bg, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ width:'32px', height:'32px', background:style.orange, borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900 }}>B</div>
          <b style={{ fontSize:'18px' }}>BuddyRide<span style={{ color:style.orange }}>.</span></b>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', background:style.card, border:`1px solid ${style.border}`, padding:'6px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:700 }}>
          <span style={{ width:'6px', height:'6px', background:style.green, borderRadius:'50%', display:'inline-block', boxShadow:`0 0 8px ${style.green}` }}></span> LIVE IN POLOKWANE
        </div>
      </header>

      {/* Hero */}
      <div style={{ maxWidth:'1150px', margin:'0 auto', padding:'32px 20px', display:'flex', flexWrap:'wrap', gap:'32px', alignItems:'center' }}>
        
        {/* Left */}
        <div style={{ flex:'1 1 360px' }}>
          <div style={{ background:style.card, border:`1px solid ${style.border}`, display:'inline-flex', padding:'6px 12px', borderRadius:'20px', fontSize:'11px', color:style.muted, marginBottom:'16px' }}>
            🚗 Limpopo's first local e-hailing • Built for our roads
          </div>

          <h1 style={{ fontSize:'clamp(36px,6vw,56px)', lineHeight:'0.95', fontWeight:900, margin:0, letterSpacing:'-2px' }}>
            Your ride,<br/>
            <span style={{ background:style.yellow, color:'black', padding:'2px 14px', borderRadius:'10px', display:'inline-block', transform:'rotate(-1deg)', marginTop:'6px' }}>your buddy.</span>
          </h1>

          <p style={{ color:style.muted, marginTop:'18px', fontSize:'16px', lineHeight:'1.5', maxWidth:'420px' }}>
            Cheaper than Bolt. More for drivers. Local drivers who know Polokwane, Seshego, Bendor, Mankweng roads.
          </p>

          {/* Stats */}
          <div style={{ display:'flex', gap:'10px', marginTop:'24px' }}>
            {[
              { k:'R25', v:'Min fare' },
              { k:'3 min', v:'Avg pickup' },
              { k:'80%', v:'To drivers' },
            ].map(s=>(
              <div key={s.k} style={{ background:style.card, border:`1px solid ${style.border}`, borderRadius:'16px', padding:'14px 16px', flex:1 }}>
                <div style={{ fontSize:'20px', fontWeight:900 }}>{s.k}</div>
                <div style={{ fontSize:'11px', color:style.muted, marginTop:'2px' }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display:'flex', gap:'12px', marginTop:'24px', flexWrap:'wrap' }}>
            <button style={{ flex:'1 1 160px', background:style.orange, color:'white', border:'none', padding:'16px', borderRadius:'14px', fontWeight:800, fontSize:'15px', cursor:'pointer' }}>Get a Ride Now →</button>
            <button style={{ flex:'1 1 160px', background:'transparent', color:'white', border:`1px solid ${style.border}`, padding:'16px', borderRadius:'14px', fontWeight:700, fontSize:'14px' }}>Drive & Earn 80%</button>
          </div>

          <div style={{ marginTop:'18px', display:'flex', gap:'16px', fontSize:'11px', color:style.muted, flexWrap:'wrap' }}>
            <span>✅ Cash & Card</span><span>✅ HURU Verified</span><span>✅ Share Trip</span><span>✅ Local Support</span>
          </div>
        </div>

        {/* Right - Phone Mockup */}
        <div style={{ flex:'1 1 300px', display:'flex', justifyContent:'center', position:'relative' }}>
          {/* Glow */}
          <div style={{ position:'absolute', width:'400px', height:'400px', background:`radial-gradient(circle, ${style.orange}22, transparent 70%)`, filter:'blur(40px)', top:'10%' }}></div>
          
          <div style={{ width:'300px', height:'560px', background:'linear-gradient(180deg,#232326,#0e0e10)', borderRadius:'36px', border:`5px solid ${style.border}`, padding:'10px', position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ background:'#0a0a0a', height:'100%', borderRadius:'26px', overflow:'hidden', display:'flex', flexDirection:'column', position:'relative' }}>
              {/* Fake map */}
              <div style={{ flex:1, background:'#141414', position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(45deg,#1a1a1a 25%,transparent 25%),linear-gradient(-45deg,#1a1a1a 25%,transparent 25%)', backgroundSize:'40px 40px', opacity:0.3 }}></div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'40px' }}>🗺️</div>
                  <div style={{ fontSize:'12px', color:style.muted, marginTop:'8px' }}>Polokwane Central<br/>Thabo Mbeki St</div>
                  <div style={{ marginTop:'16px', display:'flex', gap:'8px', justifyContent:'center' }}>
                    <div style={{ width:'12px', height:'12px', background:style.green, borderRadius:'50%', boxShadow:`0 0 10px ${style.green}` }}></div>
                    <div style={{ width:'32px', height:'2px', background:style.orange, marginTop:'5px' }}></div>
                    <div style={{ width:'12px', height:'12px', background:style.orange, borderRadius:'50%' }}></div>
                  </div>
                </div>
                {/* Car pins */}
                <div style={{ position:'absolute', top:'20%', left:'20%', background:'white', color:'black', borderRadius:'50%', width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>🚗</div>
                <div style={{ position:'absolute', top:'60%', right:'20%', background:'white', color:'black', borderRadius:'50%', width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px' }}>🚗</div>
              </div>

              {/* Bottom sheet */}
              <div style={{ background:'#18181b', borderTopLeftRadius:'20px', borderTopRightRadius:'20px', padding:'16px', borderTop:`1px solid ${style.border}` }}>
                <div style={{ width:'40px', height:'4px', background:'#333', borderRadius:'2px', margin:'0 auto 12px' }}></div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:'14px' }}>Driver Found!</div>
                    <div style={{ fontSize:'11px', color:style.muted }}>Thabo • Toyota Corolla • ND 123 L</div>
                  </div>
                  <div style={{ background:style.green, width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>✓</div>
                </div>
                <div style={{ marginTop:'12px', background:style.orange, color:'white', padding:'12px', borderRadius:'12px', textAlign:'center', fontWeight:800, fontSize:'13px' }}>● 2 min away - Arriving</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Why section */}
      <div style={{ maxWidth:'1150px', margin:'0 auto', padding:'20px 20px 80px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'14px' }}>
        {[
          { icon:'💰', title:'For Riders', desc:'R25 min fare, 3 min pickup in Polokwane Central, Seshego, Bendor. Cheaper than Bolt, local drivers.' },
          { icon:'🚗', title:'For Drivers - Keep 80%', desc:'Bolt takes 30-40%. We give you 80%. Weekly payouts, Limpopo support, more trips.' },
          { icon:'🛡️', title:'Safety - HURU Verified', desc:'Selfie check Mon/Sat, SA ID verified, criminal check via HURU, share trip live.' },
        ].map(c=>(
          <div key={c.title} style={{ background:style.card, border:`1px solid ${style.border}`, borderRadius:'18px', padding:'18px' }}>
            <div style={{ fontSize:'24px' }}>{c.icon}</div>
            <div style={{ fontWeight:800, marginTop:'8px' }}>{c.title}</div>
            <div style={{ fontSize:'13px', color:style.muted, marginTop:'6px', lineHeight:'1.5' }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}