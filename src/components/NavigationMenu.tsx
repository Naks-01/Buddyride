import { useState } from 'react'
import { History, LogOut, Menu, Settings, UserRound, X, CreditCard, HelpCircle, Star, Shield } from 'lucide-react'
import { supabase, type Profile } from '../lib/supabase'

export function NavigationMenu({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* MENU BUTTON - BLACK PILL LIKE UBER */}
      <button onClick={() => setOpen(true)} style={{ 
        display:'flex', alignItems:'center', gap:8, 
        background:'#111', color:'white', 
        border:'1px solid #2a2a2a', borderRadius:'28px', 
        padding:'10px 18px', cursor:'pointer', fontWeight:800,
        fontSize:'13px', letterSpacing:'0.5px',
        boxShadow:'0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <Menu size={16} /> MENU
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:999999, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(8px)', display:'flex' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'380px', maxWidth:'88vw', height:'100%', background:'#0f0f0f', color:'white', display:'flex', flexDirection:'column', borderRight:'1px solid #222' }}>
            
            {/* HEADER */}
            <div style={{ padding:'20px 20px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <div style={{ width:'36px', height:'36px', background:'#00d181', borderRadius:'10px', display:'grid', placeItems:'center', fontWeight:900, color:'#000', fontSize:'16px' }}>B</div>
                <span style={{ fontWeight:900, fontSize:'18px', letterSpacing:'-0.5px' }}>BuddyRide</span>
              </div>
              <button onClick={() => setOpen(false)} style={{ background:'#1e1e1e', border:'1px solid #333', color:'white', width:'38px', height:'38px', borderRadius:'50%', display:'grid', placeItems:'center' }}><X size={18} /></button>
            </div>

            {/* PROFILE - PREMIUM CARD */}
            <div style={{ margin:'8px 16px 16px', padding:'16px', display:'flex', gap:14, alignItems:'center', background:'#181818', borderRadius:'20px', border:'1px solid #242424' }}>
              <div style={{ width:'56px', height:'56px', borderRadius:'50%', background:'linear-gradient(135deg, #00d181, #00a866)', display:'grid', placeItems:'center', fontWeight:900, fontSize:'22px', color:'#000', flexShrink:0 }}>{profile.full_name?.[0] || 'U'}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:'15px', display:'flex', alignItems:'center', gap:6 }}>{profile.full_name?.slice(0,18)} <Shield size={14} color={profile.id_number ? "#00d181" : "#555"} /></div>
                <div style={{ fontSize:'12px', opacity:0.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile.email}</div>
                <div style={{ marginTop:'6px', display:'flex', gap:6 }}>
                  <span style={{ fontSize:'9px', fontWeight:900, background:'#00d181', color:'#000', padding:'4px 10px', borderRadius:'20px', letterSpacing:'0.5px' }}>{profile.role?.toUpperCase()}</span>
                  <span style={{ fontSize:'9px', fontWeight:800, background: profile.id_number ? '#123a26' : '#3a1e1e', color: profile.id_number ? '#00d181' : '#ff6b6b', padding:'4px 10px', borderRadius:'20px' }}>{profile.id_number ? 'VERIFIED ✓' : 'UNVERIFIED'}</span>
                </div>
              </div>
            </div>

            {/* MENU LIST - CLEAN */}
            <div style={{ flex:1, padding:'0 16px', display:'flex', flexDirection:'column', gap:'10px', overflowY:'auto' }}>
              <Item icon={<UserRound size={18} />} title="Profile" sub={profile.phone || 'Add phone number'} />
              <Item icon={<History size={18} />} title="My Rides" sub="Trip history & receipts" />
              <Item icon={<CreditCard size={18} />} title="Payment" sub="Cash • Limpopo only" />
              <Item icon={<Star size={18} />} title="Rating" sub="5.0 • 12 trips" badge="NEW" />
              <Item icon={<Settings size={18} />} title="Settings" sub="Mapbox • Notifications" />
              <Item icon={<HelpCircle size={18} />} title="Help Center" sub="24/7 Support" />

              <div style={{ margin:'14px 0 0', padding:'12px', textAlign:'center', fontSize:'10px', opacity:0.25, letterSpacing:'0.5px' }}>
                v2.1 • LIMPOPO • MAPBOX NAVIGATION-DAY
              </div>
            </div>

            {/* LOGOUT */}
            <div style={{ padding:'16px', borderTop:'1px solid #1a1a1a' }}>
              <button onClick={async () => { setOpen(false); await supabase.auth.signOut(); onSignOut(); localStorage.clear(); location.href='/' }} 
                style={{ width:'100%', padding:'15px', background:'#181818', color:'#ff4d4d', border:'1px solid #2a1e1e', borderRadius:'14px', fontWeight:800, display:'flex', gap:10, justifyContent:'center', fontSize:'14px', cursor:'pointer' }}>
                <LogOut size={18} /> Log Out
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}

function Item({ icon, title, sub, badge }: { icon:any, title:string, sub:string, badge?:string }) {
  return (
    <div style={{ display:'flex', gap:14, alignItems:'center', padding:'14px 14px', background:'#181818', borderRadius:'16px', border:'1px solid #222', cursor:'pointer' }}>
      <div style={{ width:'42px', height:'42px', background:'#222', borderRadius:'12px', display:'grid', placeItems:'center', flexShrink:0 }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:'14px', display:'flex', gap:8, alignItems:'center' }}>{title} {badge && <span style={{ fontSize:'8px', background:'#00d181', color:'#000', padding:'2px 6px', borderRadius:'10px', fontWeight:900 }}>{badge}</span>}</div>
        <div style={{ fontSize:'11px', opacity:0.5, marginTop:'2px' }}>{sub}</div>
      </div>
      <div style={{ opacity:0.15, fontSize:'20px' }}>›</div>
    </div>
  )
}