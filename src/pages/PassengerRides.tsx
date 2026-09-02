import { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, addDoc, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'

const cats = [
  { id: 'go', label: 'Go', seats: 2, price: 45 },
  { id: 'comfort', label: 'Comfort', seats: 3, price: 65 },
  { id: 'xl', label: 'XL', seats: 6, price: 95 },
] as const

type CategoryId = (typeof cats)[number]['id']
type BookingStatus = 'idle' | 'searching' | 'accepted' | 'arrived' | 'onTrip' | 'completed'

const prices: Record<CategoryId, number> = { go: 45, comfort: 65, xl: 95 }

interface DriverInfo {
  name: string
  phone: string
  car: string
  plate: string
  eta: number
}

export function PassengerRides() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rideType, setRideType] = useState<CategoryId>('go')
  const [passengers, setPassengers] = useState(1)
  const [rideId, setRideId] = useState<string | null>(null)
  const [rideStatus, setRideStatus] = useState<BookingStatus>('idle')
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null)

  const current = cats.find(c => c.id === rideType)!
  const maxPassengers = current.seats
  const price = prices[rideType]

  useEffect(() => {
    if (!rideId) return

    const unsub = onSnapshot(doc(db, 'rides', rideId), snap => {
      const data = snap.data()
      if (!data) return
      setRideStatus(data.status)
      if (data.driver) setDriverInfo(data.driver)
      if (data.status === 'completed') {
        alert('Trip completed!')
        setRideStatus('idle')
        setRideId(null)
        setDriverInfo(null)
      }
    })

    return unsub
  }, [rideId])

  const handleRequestRide = async () => {
    if (!from || !to) {
      alert('Please enter both From and To locations')
      return
    }
    setRideStatus('searching')
    const ref = await addDoc(collection(db, 'rides'), {
      from,
      to,
      rideType,
      passengers,
      price,
      status: 'searching',
      passengerId: auth.currentUser?.uid,
      createdAt: serverTimestamp(),
    })
    setRideId(ref.id)
  }

  const handleCancel = async () => {
    if (rideId) {
      await updateDoc(doc(db, 'rides', rideId), { status: 'cancelled' })
    }
    setRideStatus('idle')
    setRideId(null)
    setDriverInfo(null)
  }

  const handleStartTrip = async () => {
    if (rideId) {
      await updateDoc(doc(db, 'rides', rideId), { status: 'onTrip' })
    }
  }

  const handleCompleteTrip = async () => {
    if (rideId) {
      await updateDoc(doc(db, 'rides', rideId), { status: 'completed' })
    }
  }

  const handleCallDriver = () => {
    if (driverInfo?.phone) window.location.href = `tel:${driverInfo.phone}`
  }

  const decreasePassengers = () => setPassengers(p => Math.max(1, p - 1))
  const increasePassengers = () => setPassengers(p => Math.min(maxPassengers, p + 1))

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <span style={{ color: '#374151' }}>Map - Polokwane</span>

        <div style={{ position: 'absolute', top: 20, left: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={from}
            onChange={event => setFrom(event.target.value)}
            placeholder="From - Current location"
            disabled={rideStatus !== 'idle'}
            style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'white', color: 'black', opacity: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', boxSizing: 'border-box' }}
          />
          <input
            value={to}
            onChange={event => setTo(event.target.value)}
            placeholder="To - Where to?"
            disabled={rideStatus !== 'idle'}
            style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: 'white', color: 'black', opacity: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <div style={{ background: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, boxShadow: '0 -4px 16px rgba(0,0,0,0.1)', position: 'relative' }}>
        {rideStatus === 'idle' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {cats.map(cat => {
                const selected = cat.id === rideType
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setRideType(cat.id)
                      setPassengers(p => Math.min(p, cat.seats))
                    }}
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                      background: selected ? 'black' : 'white',
                      color: selected ? 'white' : 'black',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 'bold' }}>{cat.label} ({cat.seats})</div>
                    <div>R{cat.price}</div>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 'bold', color: 'black' }}>{passengers} Passengers</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Max {maxPassengers} for {current.label}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={decreasePassengers}
                  style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #d1d5db', background: 'white', color: 'black', fontSize: 18, cursor: 'pointer' }}
                >
                  -
                </button>
                <span style={{ color: 'black', minWidth: 16, textAlign: 'center' }}>{passengers}</span>
                <button
                  onClick={increasePassengers}
                  style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #d1d5db', background: 'white', color: 'black', fontSize: 18, cursor: 'pointer' }}
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={handleRequestRide}
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 12,
                border: 'none',
                background: 'black',
                color: 'white',
                fontWeight: 'bold',
                fontSize: 16,
                cursor: 'pointer',
                position: 'relative',
                zIndex: 9999,
                pointerEvents: 'auto',
              }}
            >
              Request Ride - R{price}
            </button>
          </>
        )}

        {rideStatus === 'searching' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ margin: '0 auto 16px', width: 40, height: 40, borderRadius: '50%', border: '4px solid #e5e7eb', borderTopColor: 'black', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: 'black', fontWeight: 'bold' }}>Searching for driver near Polokwane...</p>
            <button
              onClick={handleCancel}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: '1px solid #d1d5db', background: 'white', color: 'black', fontWeight: 'bold', fontSize: 16, cursor: 'pointer', marginTop: 16 }}
            >
              Cancel
            </button>
          </div>
        )}

        {rideStatus === 'accepted' && driverInfo && (
          <div>
            <p style={{ color: 'black', fontWeight: 'bold', marginBottom: 8 }}>
              Driver {driverInfo.name} is coming - {driverInfo.eta} min
            </p>
            <p style={{ color: '#6b7280', marginBottom: 16 }}>
              {driverInfo.car} - {driverInfo.plate}
            </p>
            <button
              onClick={handleCallDriver}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: 'black', color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer', marginBottom: 8 }}
            >
              Call Driver
            </button>
            <button
              onClick={handleCancel}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: '1px solid #d1d5db', background: 'white', color: 'black', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}

        {rideStatus === 'arrived' && (
          <div>
            <p style={{ color: 'black', fontWeight: 'bold', marginBottom: 16 }}>Driver has arrived</p>
            <button
              onClick={handleStartTrip}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: 'black', color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}
            >
              Start Trip
            </button>
          </div>
        )}

        {rideStatus === 'onTrip' && (
          <div>
            <p style={{ color: 'black', fontWeight: 'bold', marginBottom: 16 }}>On trip to {to}</p>
            <button
              onClick={handleCompleteTrip}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: 'black', color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}
            >
              Complete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
