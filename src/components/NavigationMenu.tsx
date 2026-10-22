import { useState } from 'react'
import { History, LogOut, Menu, Settings, UserRound, X, CreditCard, HelpCircle, Star, Shield, Wallet } from 'lucide-react'
import { supabase, type Profile } from '../lib/supabase'

export function NavigationMenu({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ 
        display:'flex', alignItems:'center', gap:6, 
        background:'#111', color:'white', border:'1px solid #333', 
        borderRadius:'20px', padding:'8px 14px', fontWeight:800, fontSize:'12px' 
      }}>
        <Menu size={16} /> MENU
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:999999, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)', display:'flex' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'380px', maxWidth:'85vw', height:'100%', background:'#0f0f0f', color:'white', display:'flex', flexDirection:'column' }}>
            
            <div style={{ padding:'18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <div style={{ width:'34px', height:'34px', background:'#00d181', borderRadius:'8px', display:'grid', placeItems:'center', fontWeight:900, color:'#000' }}>B</div>
                <b style={{ fontSize:'17px' }}>BuddyRide</b>
              </div>
              <button onClick={() => setOpen(false)} style={{ background:'#222', border:'none', color:'white', width:'36px', height:'36px', borderRadius:'50%', display:'grid', placeItems:'center' }}><X size={18} /></button>
            </div>

            <div style={{ margin:'0 14px 14px', padding:'14px', background:'#1a1a1a', borderRadius:'16px', border:'1px solid #262626', display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ width:'52px', height:'52px', borderRadius:'50%', background:'#00d181', display:'grid', placeItems:'center', fontWeight:900, fontSize:'20px', color:'#000' }}>{profile.full_name?.[0] || 'U'}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:'14px', display:'flex', gap:6, alignItems:'center' }}>{profile.full_name} <Shield size={12} color="#00d181" /></div>
                <div style={{ fontSize:'11px', opacity:0.5 }}>{profile.email}</div>
                <div style={{ marginTop:'5px', display:'flex', gap:6 }}>
                  <span style={{ fontSize:'9px', background:'#00d181', color:'#000', padding:'3px 8px', borderRadius:'20px', fontWeight:900 }}>{profile.role?.toUpperCase()}</span>
                  <span style={{ fontSize:'9px', background:'#133a25', color:'#00d181', padding:'3px 8px', borderRadius:'20px', fontWeight:800 }}>VERIFIED ✓</span>
                </div>
              </div>
            </div>

            {/* FULL MENU - FIX FOR YOUR BUG */}
            <div style={{ flex:1, padding:'0 14px', display:'flex', flexDirection:'column', gap:'10px', overflowY:'auto' }}>
              <MenuRow icon={<UserRound size={18}/>} title="Profile" sub={profile.phone || 'Add phone'} />
              <MenuRow icon={<History size={18}/>} title="My Rides" sub="History & receipts" />
              <MenuRow icon={<Wallet size={18}/>} title="Earnings" sub="R0.00 today" badge="NEW" />
              <MenuRow icon={<CreditCard size={18}/>} title="Payment" sub="Cash only - Limpopo" />
              <MenuRow icon={<Star size={18}/>} title="Rating" sub="5.0 ★ Excellent" />
              <MenuRow icon={<Settings size={18}/>} title="Settings" sub="Mapbox • Navigation" />
              <MenuRow icon={<HelpCircle size={18}/>} title="Help" sub="24/7 Support" />
            </div>

            <div style={{ padding:'14px', borderTop:'1px solid #1a1a1a' }}>
              <button onClick={async () => { setOpen(false); await supabase.auth.signOut(); onSignOut(); localStorage.clear(); location.href='/' }} 
                style={{ width:'100%', padding:'14px', background:'#1e1e1e', color:'#ff4d4d', border:'1px solid #2a2020', borderRadius:'12px', fontWeight:800, display:'flex', gap:8, justifyContent:'center' }}>
                <LogOut size={18} /> Log Out
              </button>
              <div style={{ textAlign:'center', fontSize:'10px', opacity:0.2, marginTop:'8px' }}>v2.1 • Mapbox Streets • Limpopo 🇿🇦</div>
            </div>

          </div>
        </div>
      )}
    </>
  )
}

function MenuRow({ icon, title, sub, badge }: any) {
  return (
    <div style={{ display:'flex', gap:12, alignItems:'center', padding:'13px 14px', background:'#1a1a1a', borderRadius:'14px', border:'1px solid #222' }}>
      <div style={{ width:'38px', height:'38px', background:'#252525', borderRadius:'10px', display:'grid', placeItems:'center' }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:'13px', display:'flex', gap:6 }}>{title} {badge && <span style={{ fontSize:'8px', background:'#00d181', color:'#000', padding:'2px 6px', borderRadius:'10px', fontWeight:900 }}>{badge}</span>}</div>
        <div style={{ fontSize:'11px', opacity:0.5 }}>{sub}</div>
      </div>
      <div style={{ opacity:0.2 }}>›</div>
    </div>
  )
}