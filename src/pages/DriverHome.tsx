import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MapboxMapView } from '../components/MapboxMapView'
import { getRoute } from '../lib/mapbox'

const TEST_DRIVER_EMAILS = ['mokgalaka.nt@gmail.com', 'testdriver@buddyride.co.za', 'testdriver@buddyride.com']

export default function DriverHome() {
  const navigate = useNavigate()
  const [user, setUser] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(false)
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null)
  const [rideRequest, setRideRequest] = useState<any>(null)
  const [activeRide, setActiveRide] = useState<any>(null)
  const [rideState, setRideState] = useState<'offline' | 'online' | 'request' | 'pickup' | 'arrived' | 'onboard' | 'completed' | 'rating'>('offline')
  const [route, setRoute] = useState<any>(null)
  const [countdown, setCountdown] = useState(15)
  const [docsApproved, setDocsApproved] = useState(false)
  const beepInterval = useRef<any>(null)
  const countdownInterval = useRef<any>(null)

  // --- SOUND ---
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 900
      gain.gain.setValueAtTime(0.5, ctx.currentTime)
      osc.start()
      osc.stop(ctx.currentTime + 0.2)
    } catch {}
  }

  // --- INIT USER + LOCATION ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate('/login')
      else setUser(data.user)
    })

    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((pos) => {
        setDriverLocation([pos.coords.longitude, pos.coords.latitude])
      })
    }
  }, [])

  // --- CHECK DOCS - 7 huru ---
  useEffect(() => {
    if (!user) return
    const isTestDriver = TEST_DRIVER_EMAILS.includes(user.email)
    if (isTestDriver) { setDocsApproved(true); return }
    
    const checkDocs = async () => {
      const { data } = await supabase.from('driver_documents').select('*').eq('user_id', user.id)
      if (data && data.length >= 7 && data.every((d: any) => d.status === 'approved')) {
        setDocsApproved(true)
      }
    }
    checkDocs()
  }, [user])

  // --- REALTIME RIDE REQUESTS ---
  useEffect(() => {
    if (!isOnline || !user) return

    const channel = supabase.channel('ride_requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides' }, (payload) => {
        if (payload.new.status === 'searching') {
          setRideRequest(payload.new)
          setRideState('request')
          setCountdown(15)
          playBeep()
          beepInterval.current = setInterval(playBeep, 3500)
          countdownInterval.current = setInterval(() => {
            setCountdown(c => {
              if (c <= 1) { declineRide(); return 0 }
              return c - 1
            })
          }, 1000)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      clearInterval(beepInterval.current)
      clearInterval(countdownInterval.current)
    }
  }, [isOnline, user])

  const toggleOnline = async () => {
    if (!docsApproved) { navigate('/documents'); return }
    const newState = !isOnline
    setIsOnline(newState)
    setRideState(newState ? 'online' : 'offline')
    if (user) {
      await supabase.from('drivers').update({ is_online: newState, location: driverLocation }).eq('user_id', user.id)
    }
  }

  const acceptRide = async () => {
    clearInterval(beepInterval.current)
    clearInterval(countdownInterval.current)
    if (!rideRequest) return
    
    const { data } = await supabase.from('rides').update({ 
      status: 'accepted', 
      driver_id: user.id 
    }).eq('id', rideRequest.id).select().single()
    
    setActiveRide(data || rideRequest)
    setRideRequest(null)
    setRideState('pickup')

    // Get route to pickup - ORANGE #FF6B00
    if (driverLocation && data?.pickup_lnglat) {
      const r = await getRoute(driverLocation, [data.pickup_lnglat[0], data.pickup_lnglat[1]])
      setRoute(r)
    }
  }

  const declineRide = async () => {
    clearInterval(beepInterval.current)
    clearInterval(countdownInterval.current)
    if (rideRequest) {
      await supabase.from('rides').update({ status: 'searching' }).eq('id', rideRequest.id)
    }
    setRideRequest(null)
    setRideState('online')
    setCountdown(15)
  }

  const handleArrived = async () => {
    setRideState('arrived')
    if (activeRide) {
      await supabase.from('rides').update({ status: 'arrived' }).eq('id', activeRide.id)
    }
  }

  const handleOnBoard = async () => {
    setRideState('onboard')
    if (activeRide && driverLocation) {
      await supabase.from('rides').update({ status: 'on_trip' }).eq('id', activeRide.id)
      const r = await getRoute(driverLocation, [activeRide.dropoff_lnglat[0], activeRide.dropoff_lnglat[1]])
      setRoute(r)
    }
  }

  const completeRide = async () => {
    setRideState('completed')
    if (activeRide) {
      await supabase.from('rides').update({ status: 'completed' }).eq('id', activeRide.id)
    }
  }

  const ratePassenger = async (stars: number) => {
    if (activeRide) {
      await supabase.from('rides').update({ driver_rating: stars }).eq('id', activeRide.id)
    }
    setActiveRide(null)
    setRoute(null)
    setRideState('online')
  }

  if (!user) return <div className="bg-black text-white h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="relative w-full h-[100dvh] bg-[#0A0A0B] overflow-hidden font-sans">
      {/* MAP - BEHIND EVERYTHING - DARK */}
      <div className="absolute inset-0 z-0">
        <MapboxMapView
          center={driverLocation || [29.4589, -23.9045]}
          driverLocation={driverLocation || [29.4589, -23.9045]}
          passengerLocation={activeRide ? activeRide.pickup_lnglat : rideRequest ? rideRequest.pickup_lnglat : null}
          route={route}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          isNavigating={rideState === 'pickup' || rideState === 'onboard'}
          followDriver={true}
          theme="dark"
        />
      </div>

      {/* TOP BAR - GLASS */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-12 flex justify-between items-center pointer-events-none">
        <button onClick={() => navigate('/menu')} className="pointer-events-auto w-10 h-10 bg-[#121214] rounded-full flex items-center justify-center border border-white/10">
          <span className="text-white text-lg">☰</span>
        </button>
        <div className="bg-[#121214]/90 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
          <span className={`text-sm font-semibold ${isOnline ? 'text-green-400' : 'text-white/60'}`}>
            ● {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        <div className="w-10 h-10 bg-[#121214] rounded-full flex items-center justify-center border border-white/10">
          <span className="text-white">🔔</span>
        </div>
      </div>

      {/* BOTTOM SHEETS - PREMIUM rounded-t-[28px] + HANDLE BAR */}

      {/* 1. OFFLINE - Go Online Big Green */}
      {rideState === 'offline' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-[#121214] rounded-t-[28px] p-6 pb-10">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />
          <h2 className="text-white text-2xl font-bold mb-2">You're offline</h2>
          <p className="text-white/60 text-sm mb-6">Go online to start receiving Buddy requests in Polokwane</p>
          <button onClick={toggleOnline} className="w-full bg-[#00C853] text-white py-4 rounded-2xl font-bold text-lg">
            Go Online
          </button>
          <button onClick={() => navigate('/documents')} className="w-full mt-3 bg-white/10 text-white py-3 rounded-2xl font-medium">
            My Documents (7) {docsApproved ? '✓' : 'huru'}
          </button>
        </div>
      )}

      {/* 2. ONLINE - Waiting */}
      {rideState === 'online' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-[#121214] rounded-t-[28px] p-6 pb-10">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white text-xl font-bold">You're online</h2>
            <span className="text-green-400 text-sm">● Searching...</span>
          </div>
          <p className="text-white/60 text-sm mb-6">Waiting for Buddy requests near you</p>
          <button onClick={toggleOnline} className="w-full bg-red-500/20 text-red-400 border border-red-500/30 py-3 rounded-2xl font-bold">
            Go Offline
          </button>
        </div>
      )}

      {/* 3. BUDDY REQUEST - 15s countdown R fare DECLINE / ACCEPT */}
      {rideState === 'request' && rideRequest && (
        <div className="absolute bottom-0 left-0 right-0 z-40 bg-[#121214] rounded-t-[28px] p-6 pb-10 border-t border-[#FF6B00]/30">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white text-xl font-bold">Buddy Request</h2>
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-white font-bold">{countdown}</span>
            </div>
          </div>
          <div className="bg-white/5 rounded-2xl p-4 mb-4">
            <p className="text-white font-medium">{rideRequest.pickup_address || 'Rissik Street, Polokwane'}</p>
            <p className="text-white/40 text-sm mt-1">→ {rideRequest.dropoff_address || 'Mall of the North'}</p>
          </div>
          <div className="flex justify-between items-center mb-6">
            <span className="text-white/60">Distance • 2.3 km</span>
            <span className="bg-[#FF6B00] text-white px-4 py-1.5 rounded-full font-bold">R {rideRequest.fare || 89}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={declineRide} className="flex-1 bg-white/10 text-white py-4 rounded-2xl font-bold">DECLINE</button>
            <button onClick={acceptRide} className="flex-1 bg-[#00C853] text-white py-4 rounded-2xl font-bold">ACCEPT</button>
          </div>
        </div>
      )}

      {/* 4. GO TO PICKUP + Fare to Collect green card + Navigate + I Have Arrived */}
      {rideState === 'pickup' && activeRide && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-[#121214] rounded-t-[28px] p-6 pb-8">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
          <h2 className="text-white text-xl font-bold mb-3">Go to Pickup</h2>
          <div className="bg-[#00C853]/15 border border-[#00C853]/30 rounded-2xl p-4 mb-4 flex justify-between">
            <span className="text-white/60 text-sm">Fare to Collect</span>
            <span className="text-[#00C853] font-bold">R {activeRide.fare || 89} CASH</span>
          </div>
          <p className="text-white mb-2">{activeRide.pickup_address}</p>
          <p className="text-white/50 text-sm mb-5">Passenger: {activeRide.passenger_name || 'Buddy'}</p>
          <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${activeRide.pickup_lnglat[1]},${activeRide.pickup_lnglat[0]}`)} className="w-full bg-[#FF6B00] text-white py-4 rounded-2xl font-bold mb-3">
            Navigate
          </button>
          <button onClick={handleArrived} className="w-full bg-white text-black py-4 rounded-2xl font-bold">
            I Have Arrived
          </button>
        </div>
      )}

      {/* 5. ARRIVED - On Board */}
      {rideState === 'arrived' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-[#121214] rounded-t-[28px] p-6 pb-10">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />
          <h2 className="text-white text-xl font-bold mb-6 text-center">Passenger is here?</h2>
          <button onClick={handleOnBoard} className="w-full bg-[#00C853] text-white py-4 rounded-2xl font-bold text-lg">
            On Board • Drive to Dropoff
          </button>
        </div>
      )}

      {/* 6. ON BOARD - Drive to dropoff */}
      {rideState === 'onboard' && activeRide && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-[#121214] rounded-t-[28px] p-6 pb-8">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
          <h2 className="text-white text-lg font-bold">Drive to dropoff</h2>
          <p className="text-white/60 text-sm mt-1 mb-4">{activeRide.dropoff_address}</p>
          <button onClick={completeRide} className="w-full bg-[#FF6B00] text-white py-4 rounded-2xl font-bold">
            Complete Trip
          </button>
        </div>
      )}

      {/* 7. Trip Completed R 89 CASH orange pill + 7.3km / 18min stats */}
      {rideState === 'completed' && activeRide && (
        <div className="absolute bottom-0 left-0 right-0 z-40 bg-[#121214] rounded-t-[28px] p-6 pb-10">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />
          <h2 className="text-white text-2xl font-bold text-center">Trip Completed</h2>
          <div className="flex justify-center mt-4 mb-6">
            <span className="bg-[#FF6B00] text-white px-6 py-2 rounded-full font-bold text-lg">R {activeRide.fare || 89} CASH</span>
          </div>
          <div className="flex justify-center gap-8 mb-6">
            <div className="text-center"><p className="text-white font-bold">7.3 km</p><p className="text-white/40 text-xs">Distance</p></div>
            <div className="text-center"><p className="text-white font-bold">18 min</p><p className="text-white/40 text-xs">Duration</p></div>
            <div className="text-center"><p className="text-white font-bold">R 89</p><p className="text-white/40 text-xs">Earned</p></div>
          </div>
          <button onClick={() => setRideState('rating')} className="w-full bg-white text-black py-4 rounded-2xl font-bold">
            Continue
          </button>
        </div>
      )}

      {/* 8. Rate Passenger 5 stars orange */}
      {rideState === 'rating' && (
        <div className="absolute bottom-0 left-0 right-0 z-40 bg-[#121214] rounded-t-[28px] p-6 pb-10">
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-6" />
          <h2 className="text-white text-xl font-bold text-center mb-6">Rate Passenger</h2>
          <div className="flex justify-center gap-3 mb-8">
            {[1,2,3,4,5].map(s => (
              <button key={s} onClick={() => ratePassenger(s)} className="w-12 h-12 rounded-full bg-[#FF6B00] text-white font-bold text-xl">
                ★
              </button>
            ))}
          </div>
          <p className="text-white/40 text-center text-sm">Tap to rate</p>
        </div>
      )}
    </div>
  )
}