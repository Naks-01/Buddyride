import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col font-sans">
      {/* TOP LOGO - BIGGER CENTERED */}
      <header className="bg-white py-6 px-4 flex flex-col items-center justify-center shadow-sm">
        <img src="/buddyride-logo.png" alt="BuddyRide" className="w-28 h-28 object-contain" />
        <div className="mt-2 text-center">
          <div className="text-[28px] font-black tracking-tight">
            <span className="text-[#1e40af]">Buddy</span><span className="text-[#ff6a00]">Ride</span>
          </div>
          <div className="text-[11px] text-[#3b82f6] font-semibold tracking-widest">Your Community Connection</div>
        </div>
      </header>

      {/* MISSION BANNER - FITS NICE 2 LINES */}
      <div className="bg-[#f0f0f0] py-5 px-6 text-center border-y border-gray-200">
        <h1 className="text-[26px] md:text-[32px] font-black leading-[1.1] text-black max-w-4xl mx-auto">
          We are restoring e-hailing services to normal<br />
          and ending driver exploitation.
        </h1>
      </div>

      {/* SPLIT - PASSENGER / DRIVER */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2">
        {/* PASSENGER - ORANGE */}
        <div className="bg-[#ff7a00] p-6 md:p-8 flex flex-col items-center md:items-start text-center md:text-left">
          <div className="bg-white/20 md:bg-transparent md:p-0 p-4 rounded-2xl w-full max-w-[360px]">
            <div className="flex justify-center md:justify-start gap-2 mb-2">
              <span className="text-white/90">👥</span>
            </div>
            <h2 className="text-white text-[28px] font-black leading-[1.1]">
              Passenger<br />Need a ride?
            </h2>
            <div className="mt-4 bg-white rounded-xl p-2 shadow-lg">
              <div className="h-[110px] bg-gray-100 rounded-lg relative overflow-hidden">
                <img src="https://maps.googleapis.com/maps/api/staticmap?center=Polokwane&zoom=13&size=400x200&key=demo" alt="" className="opacity-30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-bold">Polokwane CBD 📍</span>
                </div>
              </div>
              <div className="mt-2 flex justify-center">
                <div className="w-12 h-20 bg-[#1e3a8a] rounded-lg flex flex-col items-center justify-center text-white text-[8px] font-bold">
                  <div>Request</div><div>Buddy</div>
                </div>
              </div>
            </div>
            <Link to="/passenger" className="mt-5 block w-full bg-[#1e3a8a] text-white text-center py-3.5 rounded-full font-bold text-[15px]">
              Request Buddy
            </Link>
          </div>
        </div>

        {/* DRIVER - BLACK */}
        <div className="bg-[#111] p-6 md:p-8 flex flex-col text-white">
          <div className="flex items-center gap-2 text-[#ff7a00]">
            <span className="text-xl">⛙</span>
            <span className="font-black text-[28px]">Driver</span>
          </div>
          <h2 className="text-[32px] font-black leading-[1] mt-1">Want to earn?<br /><span className="text-[#ff7a00]">Keep 80%</span></h2>
          <p className="mt-3 text-[15px] leading-[1.3]">
            <span className="font-bold">You pocket 80% of every ride</span><br />
            <span className="text-gray-300 text-[14px]">BuddyRide takes only 20%</span>
          </p>
          <div className="my-6 flex justify-end">
            <div className="text-[90px] leading-none">🚙</div>
          </div>
          <Link to="/driver" className="mt-auto bg-[#ff7a00] text-white text-center py-3.5 rounded-full font-black text-[15px]">
            Start Driving Today
          </Link>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="bg-[#1e3a8a] text-white py-4 px-4 text-center">
        <div className="font-bold text-[14px] md:text-[16px]">Trusted in Polokwane • Mankweng • Seshego</div>
        <div className="text-[11px] md:text-[12px] text-blue-200 mt-1">Community Focused • Ending Exploitation • Fair for Passengers • Fair for Drivers</div>
      </footer>
    </main>
  )
}