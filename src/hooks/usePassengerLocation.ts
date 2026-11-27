import { useState, useEffect, useRef } from 'react'
import { reverseTomTom } from '../lib/tomtom'
const POLOKWANE_CENTER: [number, number] = [29.4589, -23.9045]

export function usePassengerLocation() {
  const [location, setLocation] = useState<[number, number]>(POLOKWANE_CENTER)
  const [mapCenter, setMapCenter] = useState<[number, number]>(POLOKWANE_CENTER)
  const [pickup, setPickup] = useState('')
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null)
  const [dropoff, setDropoff] = useState('')
  const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(null)
  const [pinTarget, setPinTarget] = useState<'pickup'|'dropoff'>('pickup')
  const [isMapMoving, setIsMapMoving] = useState(false)
  const mapTimeout = useRef<any>(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(async pos => {
      const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
      setLocation(p); setMapCenter(p); setPickupCoords(p)
      try { setPickup(await reverseTomTom(p)) } catch { setPickup('My Location - Polokwane') }
    }, () => { setPickup('Polokwane Central') })
  }, [])

  function onMapMove(coords: [number, number], setPickupFn: any, setDropoffFn: any) {
    setIsMapMoving(true)
    if (pinTarget === 'pickup') setPickupCoords(coords)
    else setDropoffCoords(coords)
    if (mapTimeout.current) clearTimeout(mapTimeout.current)
    const id = ++reqId.current
    mapTimeout.current = setTimeout(async () => {
      try { 
        const addr = await reverseTomTom(coords)
        if (id === reqId.current) { pinTarget==='pickup' ? setPickupFn(addr) : setDropoffFn(addr); setIsMapMoving(false) }
      } catch { setIsMapMoving(false) }
    }, 600)
  }

  return { location, mapCenter, setMapCenter, pickup, setPickup, pickupCoords, setPickupCoords, dropoff, setDropoff, dropoffCoords, setDropoffCoords, pinTarget, setPinTarget, isMapMoving, onMapMove }
}