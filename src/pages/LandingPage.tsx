import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'
const BLUE_NAVY = '#0A2540'

export default function LandingPage({ onLogin, onDriverLogin }: { onLogin: () => void; onDriverLogin?: () => void }) {
  const [commission, setCommission] = useState(20)
  const [logoIndex, setLogoIndex] = useState(0)
  const logoCandidates = ['/buddyride-logo.jpg', '/buddyride-logo-main.jpg', '/buddyridelogo.jpg']
  const logoFailed = logoIndex >= logoCandidates.length

  useEffect(() => {
    let active = true
    // FIXED 100%: Removed .catch() - Supabase builder is PromiseLike<void>, TS2339
    void (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', 'commission_percent').maybeSingle()
        if (!active || data?.value == null) return
        const parsed = Number(data.value)
        if (!Number.isNaN(parsed)) setCommission(parsed)
      } catch {
        // ignore - keep default 20%
      }
    })()
    return () => { active = false }
  }, [])

  const driverKeeps = 100 - commission

  const handleDriverClick = () => {
    if (onDriverLogin) { onDriverLogin(); return }
    try { localStorage.setItem('buddyride_pending_role', 'driver') } catch {}
    onLogin()
  }
  const handlePassengerClick = () => {
    try { localStorage.setItem('buddyride_pending_role', 'passenger') } catch {}
    onLogin()
  }

  return (
    <div style={{ background: "white", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "white", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "1px solid #eee" }}>
        {!logoFailed ? (
          <img src={logoCandidates[logoIndex]} alt="BuddyRide" style={{ width: 110, height: 110, objectFit: "contain" }} onError={() => setLogoIndex(i => i + 1)} />
        ) : (
          <div style={{ width: 110, height: 110, display: 'grid', placeItems: 'center', fontSize: 48, background: BLUE_LIGHT, borderRadius: 20 }}>🚗</div>
        )}
        <div style={{ fontWeight: 900, fontSize: 28, marginTop: 8 }}>
          <span style={{ color: BLUE_DARK }}>Buddy</span><span style={{ color: BLUE }}>Ride</span>
        </div>
        <div style={{ fontSize: 11, color: BLUE, letterSpacing: 2, fontWeight: 700 }}>Your Community Connection</div>
      </div>

      <div style={{ background: BLUE_LIGHT, padding: "24px 16px", textAlign: "center" }}>
        <h1 style={{ fontWeight: 900, fontSize: 26, lineHeight: 1.15, color: "#182230", margin: "0 auto", maxWidth: 800 }}>
          We are restoring e-hailing services to normal<br />and ending driver exploitation.
        </h1>
        <p style={{ maxWidth: 700, margin: "12px auto 0", color: "#475467", fontSize: 15 }}>
          BuddyRide is a South African e-hailing platform based in Limpopo. We connect passengers with verified local drivers. Drivers keep {driverKeeps}% of every trip.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ background: BLUE, flex: "1 1 320px", padding: 32, color: "white" }}>
          <h2 style={{ fontWeight: 900, fontSize: 26, color: "white" }}>Passenger<br />Need a ride?</h2>
          <div style={{ marginTop: 16, background: "white", borderRadius: 12, padding: 12, color: BLUE_DARK, textAlign: "center", fontWeight: 800 }}>Limpopo 📍</div>
          <button onClick={handlePassengerClick} style={{ marginTop: 20, width: "100%", background: "#fff", color: BLUE, padding: 14, borderRadius: 999, fontWeight: 800, border: "none", cursor: "pointer" }}>Request Buddy</button>
          <p style={{ marginTop: 12, fontSize: 13, color: "white" }}>Safe, affordable rides in Polokwane, Mankweng & Seshego. Pay with cash or card via Paystack.</p>
        </div>
        <div style={{ background: BLUE_NAVY, flex: "1 1 320px", padding: 32, color: "white" }}>
          <div style={{ color: BLUE, fontWeight: 900, fontSize: 26 }}>Driver</div>
          <h2 style={{ fontWeight: 900, fontSize: 30, color: "white" }}>Want to earn?<br /><span style={{ color: BLUE }}>Keep {driverKeeps}%</span></h2>
          <p style={{ marginTop: 10, color: "white" }}>You pocket {driverKeeps}% of every ride<br /><span style={{ color: "#B2CCFF", fontSize: 13 }}>BuddyRide takes only {commission}% - lowest in SA</span></p>
          <button onClick={handleDriverClick} style={{ marginTop: 20, width: "100%", background: BLUE, color: "white", padding: 14, borderRadius: 999, fontWeight: 900, border: "none", cursor: "pointer" }}>Start Driving Today</button>
        </div>
      </div>

      <div style={{ padding: "40px 20px", background: "white", textAlign: "center" }}>
        <h2 style={{ fontWeight: 900, fontSize: 24, color: "#182230" }}>How BuddyRide Works</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center", marginTop: 24, maxWidth: 900, marginLeft: "auto", marginRight: "auto" }}>
          <div style={{ flex: "1 1 200px", padding: 16 }}>
            <div style={{ fontSize: 36 }}>📍</div>
            <h3 style={{ color: "#182230", fontWeight: 800, margin: "10px 0 6px" }}>1. Request</h3>
            <p style={{ fontSize: 14, color: "#667085" }}>Enter pickup & destination in Limpopo</p>
          </div>
          <div style={{ flex: "1 1 200px", padding: 16 }}>
            <div style={{ fontSize: 36 }}>🚗</div>
            <h3 style={{ color: "#182230", fontWeight: 800, margin: "10px 0 6px" }}>2. Get Matched</h3>
            <p style={{ fontSize: 14, color: "#667085" }}>Verified driver accepts in seconds</p>
          </div>
          <div style={{ flex: "1 1 200px", padding: 16 }}>
            <div style={{ fontSize: 36 }}>💳</div>
            <h3 style={{ color: "#182230", fontWeight: 800, margin: "10px 0 6px" }}>3. Pay Securely</h3>
            <p style={{ fontSize: 14, color: "#667085" }}>Pay with card or cash. Powered by Paystack</p>
          </div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handlePassengerClick} style={{ background: BLUE, color: 'white', border: 'none', padding: '12px 24px', borderRadius: 999, fontWeight: 800, cursor: 'pointer' }}>Book a Ride →</button>
          <button onClick={handleDriverClick} style={{ background: 'white', color: BLUE_DARK, border: `2px solid ${BLUE}`, padding: '12px 24px', borderRadius: 999, fontWeight: 800, cursor: 'pointer' }}>Become a Driver →</button>
        </div>
      </div>

      <div style={{ background: BLUE_NAVY, color: "white", padding: "32px 20px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 30, justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 250px" }}>
            <div style={{ fontWeight: 900, fontSize: 20 }}><span style={{ color: "#fff" }}>Buddy</span><span style={{ color: BLUE }}>Ride</span></div>
            <p style={{ fontSize: 13, color: "#B2CCFF", marginTop: 8, lineHeight: 1.5 }}>
              BuddyRide (Pty) Ltd<br/>
              E-hailing service in Limpopo, South Africa.<br/>
              Trusted in Polokwane • Mankweng • Seshego
            </p>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>Company</h4>
            <div style={{ fontSize: 13, color: "#B2CCFF", marginTop: 8, lineHeight: 2 }}>
              <button onClick={handlePassengerClick} style={{ background: 'none', border: 'none', color: "#B2CCFF", cursor: 'pointer', padding: 0, fontSize: 13 }}>Book a Ride</button><br/>
              <button onClick={handleDriverClick} style={{ background: 'none', border: 'none', color: "#B2CCFF", cursor: 'pointer', padding: 0, fontSize: 13 }}>Drive With Us</button>
            </div>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>Legal</h4>
            <div style={{ fontSize: 13, color: "#B2CCFF", marginTop: 8, lineHeight: 2 }}>
              <a href="/terms" style={{ color: "#B2CCFF", textDecoration: "none" }}>Terms & Conditions</a><br/>
              <a href="/privacy" style={{ color: "#B2CCFF", textDecoration: "none" }}>Privacy Policy</a><br/>
              <a href="/terms#refunds" style={{ color: "#B2CCFF", textDecoration: "none" }}>Cancellation & Refunds</a>
            </div>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>Contact</h4>
            <div style={{ fontSize: 13, color: "#B2CCFF", marginTop: 8, lineHeight: 1.8 }}>
              Email: <a href="mailto:buddyride@outlook.com" style={{ color: "#B2CCFF", textDecoration: "none" }}>buddyride@outlook.com</a><br/>
              Phone: <a href="tel:0641018991" style={{ color: "#B2CCFF", textDecoration: "none" }}>064 101 8991</a><br/>
              WhatsApp: <a href="https://wa.me/27641018991" target="_blank" rel="noreferrer" style={{ color: "#B2CCFF", textDecoration: "none" }}>064 101 8991</a><br/>
              Address: Polokwane, Limpopo, SA<br/>
              Support: 8am - 8pm daily
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1e293b", marginTop: 24, paddingTop: 16, textAlign: "center", fontSize: 12, color: "#64748b" }}>
          © {new Date().getFullYear()} BuddyRide Pty Ltd. All rights reserved. Payments secured by Paystack.
        </div>
      </div>
    </div>
  )
}