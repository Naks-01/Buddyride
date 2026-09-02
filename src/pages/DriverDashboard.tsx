import { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'

type RideStatus = 'searching' | 'accepted' | 'arrived' | 'onTrip' | 'completed'

interface Ride {
  id: string
  from: string
  to: string
  price: number
  rideType: string
  status: RideStatus
}

export default function DriverDashboard() {
  const [requests, setRequests] = useState<Ride[]>([])
  const [acceptedRide, setAcceptedRide] = useState<Ride | null>(null)
  const name = 'Thabo'
  const phone = '0821234567'
  const car = 'Toyota Corolla'
  const plate = 'ABC 123'

  useEffect(() => {
    if (acceptedRide) return

    const q = query(collection(db, 'rides'), where('status', '==', 'searching'))
    const unsub = onSnapshot(q, snap => {
      const rides = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Ride, 'id'>) }))
      setRequests(rides)
    })

    return unsub
  }, [acceptedRide])

  useEffect(() => {
    if (!acceptedRide) return

    const unsub = onSnapshot(doc(db, 'rides', acceptedRide.id), snap => {
      const data = snap.data()
      if (!data) return
      setAcceptedRide(prev => (prev ? { ...prev, status: data.status } : prev))
      if (data.status === 'completed') {
        setAcceptedRide(null)
      }
    })

    return unsub
  }, [acceptedRide?.id])

  const handleAccept = async (ride: Ride) => {
    const uid = auth.currentUser?.uid
    await updateDoc(doc(db, 'rides', ride.id), {
      status: 'accepted',
      driverId: uid,
      driver: { name, phone, car, plate, eta: '3 min' },
    })
    setAcceptedRide({ ...ride, status: 'accepted' })
  }

  const handleArrived = async () => {
    if (!acceptedRide) return
    await updateDoc(doc(db, 'rides', acceptedRide.id), { status: 'arrived' })
    setAcceptedRide({ ...acceptedRide, status: 'arrived' })
  }

  const handleStartTrip = async () => {
    if (!acceptedRide) return
    await updateDoc(doc(db, 'rides', acceptedRide.id), { status: 'onTrip' })
    setAcceptedRide({ ...acceptedRide, status: 'onTrip' })
  }

  const handleCompleteTrip = async () => {
    if (!acceptedRide) return
    await updateDoc(doc(db, 'rides', acceptedRide.id), { status: 'completed' })
    setAcceptedRide(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: 16 }}>
      <h1 style={{ color: 'black', fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>Driver Dashboard</h1>

      {!acceptedRide && (
        <div>
          {requests.length === 0 && <p style={{ color: '#6b7280' }}>No incoming requests</p>}
          {requests.map(ride => (
            <div
              key={ride.id}
              style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            >
              <p style={{ color: 'black', fontWeight: 'bold' }}>{ride.from} → {ride.to}</p>
              <p style={{ color: '#6b7280' }}>{ride.rideType} - R{ride.price}</p>
              <button
                onClick={() => handleAccept(ride)}
                style={{ width: '100%', marginTop: 8, padding: 12, borderRadius: 8, border: 'none', background: 'black', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Accept
              </button>
            </div>
          ))}
        </div>
      )}

      {acceptedRide && (
        <div style={{ background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <p style={{ color: 'black', fontWeight: 'bold' }}>{acceptedRide.from} → {acceptedRide.to}</p>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>{acceptedRide.rideType} - R{acceptedRide.price}</p>

          {acceptedRide.status === 'accepted' && (
            <button
              onClick={handleArrived}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: 'black', color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}
            >
              I Have Arrived
            </button>
          )}

          {acceptedRide.status === 'arrived' && (
            <button
              onClick={handleStartTrip}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: 'black', color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}
            >
              Start Trip
            </button>
          )}

          {acceptedRide.status === 'onTrip' && (
            <button
              onClick={handleCompleteTrip}
              style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: 'black', color: 'white', fontWeight: 'bold', fontSize: 16, cursor: 'pointer' }}
            >
              Complete Trip
            </button>
          )}
        </div>
      )}
    </div>
  )
}
