export default function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{ background: "white", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "sans-serif" }}>
      {/* LOGO - WHITE */}
      <div style={{ background: "white", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "1px solid #eee" }}>
        <img src="/buddyride-logo.jpg" alt="BuddyRide" style={{ width: 110, height: 110, objectFit: "contain" }} onError={(e) => { (e.currentTarget as any).src = "/buddyride-logo-main.jpg" }} />
        <div style={{ fontWeight: 900, fontSize: 28, marginTop: 8 }}>
          <span style={{ color: "#0f4a8a" }}>Buddy</span><span style={{ color: "#ff7a00" }}>Ride</span>
        </div>
        <div style={{ fontSize: 11, color: "#3b82f6", letterSpacing: 2, fontWeight: 600 }}>Your Community Connection</div>
      </div>

      {/* MISSION BANNER */}
      <div style={{ background: "#f2f2f2", padding: "24px 16px", textAlign: "center" }}>
        <h1 style={{ fontWeight: 900, fontSize: 26, lineHeight: 1.15, color: "#000", margin: "0 auto", maxWidth: 800 }}>
          We are restoring e-hailing services to normal<br />and ending driver exploitation.
        </h1>
        <p style={{ maxWidth: 700, margin: "12px auto 0", color: "#444", fontSize: 15 }}>
          BuddyRide is a South African e-hailing platform based in Limpopo. We connect passengers with verified local drivers. Drivers keep 80% of every trip.
        </p>
      </div>

      {/* SPLIT */}
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ background: "#ff7a00", flex: "1 1 320px", padding: 32, color: "white" }}>
          <h2 style={{ fontWeight: 900, fontSize: 26, color: "white" }}>Passenger<br />Need a ride?</h2>
          <div style={{ marginTop: 16, background: "white", borderRadius: 12, padding: 12, color: "black", textAlign: "center", fontWeight: 700 }}>Limpopo 📍</div>
          <button onClick={onLogin} style={{ marginTop: 20, width: "100%", background: "#1e3a8a", color: "white", padding: 14, borderRadius: 999, fontWeight: 700, border: "none", cursor: "pointer" }}>Request Buddy</button>
          <p style={{ marginTop: 12, fontSize: 13, color: "white" }}>Safe, affordable rides in Polokwane, Mankweng & Seshego. Pay with card via Paystack.</p>
        </div>
        <div style={{ background: "#121212", flex: "1 1 320px", padding: 32, color: "white" }}>
          <div style={{ color: "#ff7a00", fontWeight: 900, fontSize: 26 }}>Driver</div>
          <h2 style={{ fontWeight: 900, fontSize: 30, color: "white" }}>Want to earn?<br /><span style={{ color: "#ff7a00" }}>Keep 80%</span></h2>
          <p style={{ marginTop: 10, color: "white" }}>You pocket 80% of every ride<br /><span style={{ color: "#aaa", fontSize: 13 }}>BuddyRide takes only 20% - lowest in SA</span></p>
          <button onClick={onLogin} style={{ marginTop: 20, width: "100%", background: "#ff7a00", color: "white", padding: 14, borderRadius: 999, fontWeight: 900, border: "none", cursor: "pointer" }}>Start Driving Today</button>
        </div>
      </div>

      {/* HOW IT WORKS - FIXED */}
      <div style={{ padding: "40px 20px", background: "white", textAlign: "center" }}>
        <h2 style={{ fontWeight: 900, fontSize: 24, color: "#000" }}>How BuddyRide Works</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center", marginTop: 24, maxWidth: 900, marginLeft: "auto", marginRight: "auto" }}>
          <div style={{ flex: "1 1 200px", padding: 16 }}>
            <div style={{ fontSize: 36 }}>📍</div>
            <h3 style={{ color: "#000", fontWeight: 800, margin: "10px 0 6px" }}>1. Request</h3>
            <p style={{ fontSize: 14, color: "#555" }}>Enter pickup & destination in Limpopo</p>
          </div>
          <div style={{ flex: "1 1 200px", padding: 16 }}>
            <div style={{ fontSize: 36 }}>🚗</div>
            <h3 style={{ color: "#000", fontWeight: 800, margin: "10px 0 6px" }}>2. Get Matched</h3>
            <p style={{ fontSize: 14, color: "#555" }}>Verified driver accepts in seconds</p>
          </div>
          <div style={{ flex: "1 1 200px", padding: 16 }}>
            <div style={{ fontSize: 36 }}>💳</div>
            <h3 style={{ color: "#000", fontWeight: 800, margin: "10px 0 6px" }}>3. Pay Securely</h3>
            <p style={{ fontSize: 14, color: "#555" }}>Pay with card or cash. Powered by Paystack</p>
          </div>
        </div>
      </div>

      {/* FOOTER - MANDATORY FOR PAYSTACK */}
      <div style={{ background: "#0f172a", color: "white", padding: "32px 20px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 30, justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 250px" }}>
            <div style={{ fontWeight: 900, fontSize: 20 }}><span style={{ color: "#fff" }}>Buddy</span><span style={{ color: "#ff7a00" }}>Ride</span></div>
            <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 8, lineHeight: 1.5 }}>
              BuddyRide (Pty) Ltd<br/>
              E-hailing service in Limpopo, South Africa.<br/>
              Trusted in Polokwane • Mankweng • Seshego
            </p>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>Company</h4>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8, lineHeight: 2 }}>
              <a href="/about" style={{ color: "#94a3b8", textDecoration: "none" }}>About Us</a><br/>
              <a href="/how-it-works" style={{ color: "#94a3b8", textDecoration: "none" }}>How it Works</a><br/>
              <a href="/driver" style={{ color: "#94a3b8", textDecoration: "none" }}>Drive With Us</a>
            </div>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>Legal</h4>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8, lineHeight: 2 }}>
              <a href="/terms" style={{ color: "#94a3b8", textDecoration: "none" }}>Terms & Conditions</a><br/>
              <a href="/privacy" style={{ color: "#94a3b8", textDecoration: "none" }}>Privacy Policy</a><br/>
              <a href="/refund" style={{ color: "#94a3b8", textDecoration: "none" }}>Refund Policy</a>
            </div>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <h4 style={{ fontWeight: 700, fontSize: 14 }}>Contact</h4>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8, lineHeight: 1.8 }}>
              Email: mokgalaka.nt@gmail.com<br/>
              Phone: 079 305 1213<br/>
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