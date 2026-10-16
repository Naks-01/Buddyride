import { useState } from 'react'

const logoCandidates = ['/buddyride-logo-main.jpg', '/buddyridelogo.jpg', '/logos/app-icon.png', '/favicon.png']

export default function LandingPage() {
  const [logoIndex, setLogoIndex] = useState(0)

  return (
    <main style={{
      minHeight:'100vh',
      background:'#0f0f0f',
      color:'white',
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      padding:'24px',
      textAlign:'center'
    }}>
      {/* LOGOS - The old style */}
      <div style={{
        width:'140px',
        height:'140px',
        borderRadius:'28px',
        background:'white',
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        marginBottom:'24px',
        overflow:'hidden',
        boxShadow:'0 8px 32px rgba(255,122,0,0.3)'
      }}>
        <img
          src={logoCandidates[logoIndex]}
          onError={() => setLogoIndex((c) => Math.min(c + 1, logoCandidates.length - 1))}
          alt="BuddyRide"
          style={{ width:'100%', height:'100%', objectFit:'contain', padding:'12px' }}
        />
      </div>

      <h1 style={{ fontSize:'42px', fontWeight:900, margin:'0 0 8px 0', letterSpacing:'-1px' }}>
        BuddyRide
      </h1>
      <p style={{ fontSize:'16px', color:'#ff7a00', fontWeight:700, margin:'0 0 4px 0', letterSpacing:'2px', textTransform:'uppercase' }}>
        Limpopo eHailing
      </p>
      <p style={{ fontSize:'16px', color:'#9ca3af', margin:'0 0 32px 0' }}>
        Your ride. Your way.
      </p>

      {/* Old buttons - simple */}
      <div style={{ display:'grid', gap:'12px', width:'100%', maxWidth:'320px' }}>
        <div style={{
          background:'#1a1a1a',
          border:'1px solid #2a2a2a',
          borderRadius:'16px',
          padding:'16px',
          display:'flex',
          alignItems:'center',
          gap:'12px'
        }}>
          <span style={{ fontSize:'24px' }}>👤</span>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontWeight:700, fontSize:'14px' }}>Passenger</div>
            <div style={{ fontSize:'12px', color:'#9ca3af' }}>Request a ride in Polokwane</div>
          </div>
        </div>
        <div style={{
          background:'#1a1a1a',
          border:'1px solid #2a2a2a',
          borderRadius:'16px',
          padding:'16px',
          display:'flex',
          alignItems:'center',
          gap:'12px'
        }}>
          <span style={{ fontSize:'24px' }}>🚗</span>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontWeight:700, fontSize:'14px' }}>Driver</div>
            <div style={{ fontSize:'12px', color:'#9ca3af' }}>Earn with BuddyRide</div>
          </div>
        </div>
      </div>

      <p style={{ fontSize:'11px', color:'#555', marginTop:'32px' }}>
        Perskebult • Polokwane • Mankweng • Limpopo
      </p>
    </main>
  )
}