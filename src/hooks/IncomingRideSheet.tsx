export function IncomingRideSheet({ ride, countdown, onAccept, onDecline }: any) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(0,0,0,0.85)',display:'grid',placeItems:'center',padding:20}}>
      <div style={{background:'white',borderRadius:16,padding:20,width:'100%',maxWidth:380,textAlign:'center'}}>
        <div style={{fontWeight:800,color:'#16A34A'}}>NEW RIDE • {countdown}s</div>
        <h1 style={{fontSize:44,margin:'12px 0'}}>R{ride.fare}</h1>
        <div style={{textAlign:'left',fontSize:13,padding:10,background:'#f5f5f7',borderRadius:10}}>📍 {ride.pickup_address}<br/>🏁 {ride.dropoff_address}</div>
        <div style={{display:'flex',gap:10,marginTop:12}}>
          <button onClick={()=>onDecline(ride.id)} style={{flex:1,padding:14,borderRadius:12,background:'#eee',border:0}}>Decline</button>
          <button onClick={()=>onAccept(ride.id)} style={{flex:2,padding:14,borderRadius:12,background:'#16A34A',color:'white',border:0,fontWeight:900}}>Accept R{ride.fare}</button>
        </div>
      </div>
    </div>
  )
}