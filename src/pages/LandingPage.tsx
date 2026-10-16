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

      {/* MISSION BANNER - FITS NICE */}
      <div style={{ background: "#f2f2f2", padding: "20px 16px", textAlign: "center" }}>
        <h1 style={{ fontWeight: 900, fontSize: 24, lineHeight: 1.15, color: "#000", margin: "0 auto", maxWidth: 800 }}>
          We are restoring e-hailing services to normal<br />and ending driver exploitation.
        </h1>
      </div>

      {/* SPLIT */}
      <div style={{ display: "flex", flexWrap: "wrap", flex: 1 }}>
        <div style={{ background: "#ff7a00", flex: "1 1 320px", padding: 24, color: "white" }}>
          <h2 style={{ fontWeight: 900, fontSize: 26 }}>Passenger<br />Need a ride?</h2>
          <div style={{ marginTop: 16, background: "white", borderRadius: 12, padding: 12, color: "black", textAlign: "center", fontWeight: 700 }}>Polokwane CBD 📍</div>
          <button onClick={onLogin} style={{ marginTop: 20, width: "100%", background: "#1e3a8a", color: "white", padding: 14, borderRadius: 999, fontWeight: 700, border: "none" }}>Request Buddy</button>
        </div>
        <div style={{ background: "#121212", flex: "1 1 320px", padding: 24, color: "white" }}>
          <div style={{ color: "#ff7a00", fontWeight: 900, fontSize: 26 }}>Driver</div>
          <h2 style={{ fontWeight: 900, fontSize: 30 }}>Want to earn?<br /><span style={{ color: "#ff7a00" }}>Keep 80%</span></h2>
          <p style={{ marginTop: 10 }}>You pocket 80% of every ride<br /><span style={{ color: "#aaa", fontSize: 13 }}>BuddyRide takes only 20%</span></p>
          <button onClick={onLogin} style={{ marginTop: 20, width: "100%", background: "#ff7a00", color: "white", padding: 14, borderRadius: 999, fontWeight: 900, border: "none" }}>Start Driving Today</button>
        </div>
      </div>

      <div style={{ background: "#1e3a8a", color: "white", padding: 14, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
        Trusted in Polokwane • Mankweng • Seshego
      </div>
    </div>
  )
}