import { useState } from 'react'
import { History, LogOut, Menu, Settings, UserRound, X, CreditCard, HelpCircle } from 'lucide-react'
import { supabase, type Profile } from '../lib/supabase'

export function NavigationMenu({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', border:'1px solid #ddd', borderRadius:'20px', padding:'8px 12px', cursor:'pointer' }}>
        <Menu size={20} /> Menu
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:999999, background:'rgba(0,0,0,0.6)', display:'flex' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'340px', maxWidth:'85vw', height:'100%', background:'#1C1C1E', color:'white', display:'flex', flexDirection:'column' }}>
            
            <div style={{ padding:'16px', display:'flex', justifyContent:'space-between', borderBottom:'1px solid #333' }}>
              <strong style={{ fontSize:'18px' }}>BuddyRide</strong>
              <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:'white' }}><X size={22} /></button>
            </div>

            <div style={{ padding:'16px', display:'flex', gap:12, alignItems:'center', background:'#242428', margin:'12px', borderRadius:'12px' }}>
              <div style={{ width:'50px', height:'50px', borderRadius:'25px', background:'#00d181', display:'grid', placeItems:'center', fontWeight:900, fontSize:'20px' }}>{profile.full_name?.[0] || 'U'}</div>
              <div>
                <div style={{ fontWeight:700, fontSize:'16px' }}>{profile.full_name}</div>
                <div style={{ fontSize:'12px', opacity:0.6 }}>{profile.email}</div>
                <div style={{ fontSize:'11px', color:'#00d181', fontWeight:700 }}>{profile.role?.toUpperCase()} • {profile.id_number ? 'VERIFIED' : 'UNVERIFIED'}</div>
              </div>
            </div>

            {/* MENU - FULL, NOT EMPTY */}
            <div style={{ flex:1, padding:'12px', display:'flex', flexDirection:'column', gap:'10px' }}>
              <div style={item}><UserRound size={18} /> <span><b>Profile</b><br/><small style={{opacity:0.6}}>{profile.phone || 'Add phone'}</small></span></div>
              <div style={item}><History size={18} /> <span><b>My Rides</b><br/><small style={{opacity:0.6}}>View trip history</small></span></div>
              <div style={item}><CreditCard size={18} /> <span><b>Payment</b><br/><small style={{opacity:0.6}}>Cash only - Limpopo</small></span></div>
              <div style={item}><Settings size={18} /> <span><b>Settings</b><br/><small style={{opacity:0.6}}>Navigation: mapbox</small></span></div>
              <div style={item}><HelpCircle size={18} /> <span><b>Help</b><br/><small style={{opacity:0.6}}>Support 24/7</small></span></div>
            </div>

            {/* LOGOUT - RED, ALWAYS VISIBLE */}
            <button onClick={async () => { setOpen(false); await supabase.auth.signOut(); onSignOut(); localStorage.clear(); location.href='/' }} 
              style={{ margin:'16px', padding:'16px', background:'#ef4444', color:'white', border:'none', borderRadius:'12px', fontWeight:900, display:'flex', gap:10, justifyContent:'center', fontSize:'16px', cursor:'pointer' }}>
              <LogOut size={20} /> LOGOUT
            </button>

          </div>
        </div>
      )}
    </>
  )
}
const item = { display:'flex', gap:12, alignItems:'center', padding:'14px', background:'#242428', borderRadius:'12px', border:'1px solid #333' } as const