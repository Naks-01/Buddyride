// src/lib/tomtom.ts - FINAL - GPS 9 Marmer Street - No Ward 20 - No Municipality
import { OpenLocationCode } from 'open-location-code'
const KEY = import.meta.env.VITE_TOMTOM_API_KEY as string
const olc = new OpenLocationCode()

export function getPlusCodeFromCoords(lat:number,lng:number){return olc.encode(lat,lng,10)}
export function decodePlusCode(code:string){
  try{
    const clean=code.trim().toUpperCase().replace(/\s/g,'')
    const match=clean.match(/([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/)
    if(!match) return null
    const d=olc.decode(match[1])
    return{lat:d.latitudeCenter,lng:d.longitudeCenter,code:match[1]}
  }catch{return null}
}
function isKeyOk(){return !(!KEY||KEY==='undefined'||KEY.length<10)}
const reverseCache=new Map<string,string>()
const searchCache=new Map<string,any[]>()

async function reversePhoton(coords:[number,number]):Promise<string|null>{
  try{
    const res=await fetch(`https://photon.komoot.io/reverse?lon=${coords[0]}&lat=${coords[1]}&lang=en`)
    if(!res.ok) return null
    const p=(await res.json()).features?.[0]?.properties
    if(!p) return null
    const num=p.housenumber||''
    const street=p.street||p.name||''
    if(!street) return null
    return num?`${num} ${street}`:street
  }catch{return null}
}

async function getNearestNumber(coords:[number,number],street:string):Promise<string|null>{
  try{
    if(!street||!isKeyOk()) return null
    const r=await fetch(`https://api.tomtom.com/search/2/fuzzySearch/${encodeURIComponent(street)}.json?key=${KEY}&countrySet=ZA&lat=${coords[1]}&lon=${coords[0]}&radius=300&limit=15&idxSet=Addr`)
    if(!r.ok) return null
    const data=await r.json()
    let best=null,bd=Infinity
    for(const x of data.results||[]){
      const n=x.address?.streetNumber
      if(!n) continue
      const d=Math.hypot(x.position.lat-coords[1],x.position.lon-coords[0])
      if(d<bd){bd=d;best=n}
    }
    return bd<0.0015?best:null
  }catch{return null}
}

export async function reverseTomTom(coords:[number,number]):Promise<string>{
  const plus=getPlusCodeFromCoords(coords[1],coords[0])
  const key=`${coords[0].toFixed(5)},${coords[1].toFixed(5)}`
  if(reverseCache.has(key)) return reverseCache.get(key)!
  if(isKeyOk()){
    try{
      const res=await fetch(`https://api.tomtom.com/search/2/reverseGeocode/${coords[1]},${coords[0]}.json?key=${KEY}&entityType=Address`)
      if(res.ok){
        const a=(await res.json()).addresses?.[0]?.address
        if(a){
          const street=a.streetName||a.street||''
          let num=a.streetNumber||''
          if(street&&!num){
            const near=await getNearestNumber(coords,street)
            if(near) num=near
          }
          if(street){
            const out=num?`${num} ${street}`:street
            reverseCache.set(key,out)
            return out
          }
        }
      }
    }catch{}
  }
  const photon=await reversePhoton(coords)
  if(photon){reverseCache.set(key,photon);return photon}
  reverseCache.set(key,plus)
  return plus
}

async function searchPhoton(q:string){
  try{
    const r=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=-23.9045&lon=29.4589&limit=8&lang=en`)
    if(!r.ok) return []
    const d=await r.json()
    return(d.features||[]).map((f:any)=>{
      const[lon,lat]=f.geometry.coordinates
      const p=f.properties||{}
      const num=p.housenumber?`${p.housenumber} `:'' 
      const name=p.name||`${num}${p.street||q}`
      const place=[p.name,p.street?`${num}${p.street}`:'',p.district,p.city].filter(Boolean).join(', ')
      return{id:`photon_${lon}_${lat}`,center:[lon,lat] as any,text:name,place_name:place||name,geometry:{coordinates:[lon,lat]}}
    })
  }catch{return[]}
}

export async function geocodeTomTom(q:string){
  if(!q||q.trim().length<2) return[]
  const qq=q.trim()
  const ck=qq.toLowerCase()
  if(searchCache.has(ck)) return searchCache.get(ck)!
  const plus=decodePlusCode(qq)
  if(plus){
    const o=[{id:`plus_${plus.code}`,center:[plus.lng,plus.lat] as any,text:`📍 ${plus.code}`,place_name:`${plus.code}`,geometry:{coordinates:[plus.lng,plus.lat]}}]
    searchCache.set(ck,o);return o
  }
  let res:any[]=[]
  if(isKeyOk()){
    try{
      const r=await fetch(`https://api.tomtom.com/search/2/fuzzySearch/${encodeURIComponent(qq)}.json?key=${KEY}&countrySet=ZA&lat=-23.9045&lon=29.4589&radius=200000&limit=10&idxSet=POI,Addr,Geo`)
      if(r.ok){const d=await r.json();res=(d.results||[]).map((x:any)=>({id:`tomtom_${x.id}`,center:[x.position.lon,x.position.lat] as any,text:x.poi?.name||x.address.freeformAddress.split(',')[0],place_name:x.poi?.name?`${x.poi.name}, ${x.address.freeformAddress}`:x.address.freeformAddress,geometry:{coordinates:[x.position.lon,x.position.lat]}}))}
    }catch{}
  }
  if(res.length===0){const ph=await searchPhoton(qq);if(ph.length>0){searchCache.set(ck,ph);return ph}}
  searchCache.set(ck,res.slice(0,10))
  return res.slice(0,10)
}

export async function getTomTomRoute(from:[number,number],to:[number,number]){
  if(!isKeyOk()) throw new Error('TomTom key missing')
  const url=`https://api.tomtom.com/routing/1/calculateRoute/${from[1]},${from[0]}:${to[1]},${to[0]}/json?key=${KEY}&routeType=fastest&traffic=true`
  const r=await fetch(url);if(!r.ok) throw new Error('route failed')
  const data=await r.json();const route=data.routes?.[0];if(!route) throw new Error('no route')
  const pts=route.legs?.[0]?.points?.map((p:any)=>[p.longitude,p.latitude])||[]
  return{geometry:{type:'LineString',coordinates:pts},distance:route.summary.lengthInMeters,distanceKm:route.summary.lengthInMeters/1000,duration:route.summary.travelTimeInSeconds,durationMin:route.summary.travelTimeInSeconds/60,legs:[],steps:[],route}
}
export const reverseGeocode=reverseTomTom
export const searchTomTom=geocodeTomTom