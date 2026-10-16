import { useState } from "react"
export default function LandingPage(){
  return (
  <div className="min-h-screen bg-white font-sans">
  <header className="sticky top-0 bg-white border-b z-50">
    <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
      <b className="text-xl">BuddyRide</b>
      <a href="/passenger" className="px-5 py-2.5 rounded-full bg-black text-white text-sm font-bold">Open App</a>
    </div>
  </header>
  <section className="max-w-7xl mx-auto px-6 pt-16 pb-12 grid md:grid-cols-2 gap-10 items-center">
    <div>
      <div className="inline-flex px-3 py-1 rounded-full bg-yellow-100 text-xs font-bold mb-4">LIVE IN POLOKWANE • LIMPOPO</div>
      <h1 className="text-5xl font-extrabold leading-none">Your ride,<br/>your <span style={{background:'#facc15', padding:'0 8px'}}>buddy.</span></h1>
      <p className="mt-5 text-gray-600">Polokwane's first local ride-hailing. Cheaper for riders, more for drivers.</p>
      <div className="mt-8 flex gap-3">
        <a href="/passenger" className="px-7 py-4 rounded-full bg-black text-white font-bold">Book a Ride →</a>
        <a href="/driver" className="px-7 py-4 rounded-full border-2 border-black font-bold">Drive & Earn</a>
      </div>
    </div>
    <div className="bg-gray-100 rounded-3xl p-6">
      <div className="bg-white rounded-2xl shadow-2xl p-5">
        <div className="flex justify-between mb-4"><span className="font-bold">Where to?</span><span className="text-xs bg-green-100 px-2 py-1 rounded-full">● Online</span></div>
        <div className="p-3 bg-gray-50 rounded-xl">📍 Mall of the North</div>
        <div className="p-3 bg-black text-white rounded-xl mt-2">🏁 Seshego Zone 4</div>
        <div className="mt-4 p-4 bg-yellow-400 rounded-xl flex justify-between font-bold"><span>Est. R85 • 12 min</span><span>→</span></div>
      </div>
    </div>
  </section>
  <section className="bg-black text-white py-12 px-6 text-center">© 2026 BuddyRide • buddyride.co.za • Polokwane</section>
  </div>)
}