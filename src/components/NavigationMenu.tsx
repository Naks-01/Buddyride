import { useState, useEffect } from 'react'

type View = 'main' | 'profile' | 'navigation' | 'defaultnav' | 'vehicles' | 'safety' | 'account'

interface Props {
  profile?: any
  onSignOut?: () => void
  isOpen?: boolean
  onClose?: () => void
  userName?: string
}

export function NavigationMenu({ profile, onSignOut, isOpen: propIsOpen, onClose, userName: propName }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [view, setView] = useState<View>('main')
  const [defaultNav, setDefaultNav] = useState('Bolt Navigation')

  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : internalOpen
  const close = () => {
    if (onClose) onClose()
    else setInternalOpen(false)
    setTimeout(()=>setView('main'),200)
  }
  const open = () => setInternalOpen(true)

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const userName = propName || profile?.full_name || "Nakampe Trevor Mokgalaka"
  const phone = profile?.phone || "+27793051213"

  return (
    <>
      {!isControlled && (
        <button onClick={open} style={{width:42,height:42,borderRadius:21,background:'#242428',border:'1px solid rgba(255,255,255,0.1)',color:'white',fontSize:18}}>☰</button>
      )}

      {isOpen && (
        <div style={{position:'fixed',inset:0,zIndex:99999,display:'flex'}}>
          <div onClick={close} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.6)'}} />
          <div style={{position:'relative',width:'92%',maxWidth:400,height:'100%',background:'#151a28',color:'white',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            
            <div style={{padding:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:600,color:'#9aa0b5',fontSize:14}}>BuddyRide Driver</div>
              <button onClick={close} style={{width:32,height:32,borderRadius:8,background:'transparent',color:'white',fontSize:22}}>✕</button>
            </div>

            <div style={{padding:'0 20px 20px'}}>
              <div style={{display:'flex',gap:16,alignItems:'center'}}>
                <img src={"https://i.pravatar.cc/150?u="+userName} style={{width:72,height:72,borderRadius:36,objectFit:'cover'}} alt="" />
                <div>
                  <div style={{fontWeight:800,fontSize:22,lineHeight:'1.2'}}>{userName}</div>
                  <div style={{marginTop:8,display:'inline-flex',alignItems:'center',gap:6,background:'#2a3147',padding:'4px 10px',borderRadius:20,fontSize:13,color:'#d0d6e8'}}>🛡️ Silver</div>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:20}}>
                <div style={{background:'#232b41',borderRadius:12,padding:'12px 8px',textAlign:'center'}}>
                  <div style={{color:'#1de28f',fontSize:18}}>↗️</div>
                  <div style={{fontWeight:800,fontSize:20,marginTop:4}}>89%</div>
                  <div style={{fontSize:11,color:'#7a8196',marginTop:2}}>Driver Score</div>
                </div>
                <div style={{background:'#232b41',borderRadius:12,padding:'12px 8px',textAlign:'center'}}>
                  <div style={{color:'#ffcc33',fontSize:18}}>⭐</div>
                  <div style={{fontWeight:800,fontSize:20,marginTop:4}}>4.70</div>
                  <div style={{fontSize:11,color:'#7a8196',marginTop:2}}>Rating</div>
                </div>
                <div style={{background:'#232b41',borderRadius:12,padding:'12px 8px',textAlign:'center'}}>
                  <div style={{color:'#1de28f',fontSize:18}}>%</div>
                  <div style={{fontWeight:800,fontSize:20,marginTop:4}}>70%</div>
                  <div style={{fontSize:11,color:'#7a8196',marginTop:2}}>Acceptance</div>
                </div>
              </div>
            </div>

            <div style={{height:1,background:'#232b41',margin:'0 20px'}} />

            <div style={{flex:1,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:12}}>
              <button style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:16,borderRadius:14,background:'#232b41',color:'white',textAlign:'left'}}>
                <span style={{width:44,height:44,borderRadius:22,background:'#1de28f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>💳</span>
                <span style={{fontWeight:600,fontSize:17,flex:1}}>Earnings</span>
                <span style={{color:'#5a637e'}}>›</span>
              </button>

              <button style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:16,borderRadius:14,background:'#232b41',color:'white',textAlign:'left'}}>
                <span style={{width:44,height:44,borderRadius:22,background:'#1de28f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>📢</span>
                <span style={{fontWeight:600,fontSize:17,flex:1}}>Campaigns</span>
                <span style={{color:'#5a637e'}}>›</span>
              </button>

              <button onClick={()=>setView('profile')} style={{width:'100%',display:'flex',alignItems:'center',gap:14,padding:16,borderRadius:14,background:'#232b41',color:'white',textAlign:'left'}}>
                <span style={{width:44,height:44,borderRadius:22,background:'#1de28f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>⚙️</span>
                <span style={{fontWeight:600,fontSize:17,flex:1}}>Settings</span>
                <span style={{color:'#5a637e'}}>›</span>
              </button>

              <button onClick={onSignOut} style={{marginTop:20,width:'100%',display:'flex',alignItems:'center',gap:14,padding:16,borderRadius:14,background:'#232b41',color:'#8b92a8',textAlign:'left'}}>
                <span>↩️</span><span>Log Out</span>
              </button>
            </div>

            {view !== 'main' && (
              <div style={{position:'absolute',inset:0,background:'#151a28',zIndex:2,padding:20,overflowY:'auto'}}>
                <button onClick={()=>setView('main')} style={{color:'#8b92a8',background:'transparent',padding:'8px 0'}}>← Back</button>
                <div style={{marginTop:20}}>
                  <div style={{fontWeight:700}}>{userName}</div>
                  <div style={{fontSize:12,color:'#7a8196'}}>{phone}</div>
                  <div style={{marginTop:20,display:'flex',flexDirection:'column',gap:1,background:'#1f2536',borderRadius:12,overflow:'hidden'}}>
                    <div style={{padding:16,background:'#232b41'}}>Vehicles<br/><small style={{color:'#7a8196'}}>HCM339L • Renault Kwid 2022</small></div>
                    <div style={{padding:16,background:'#232b41'}}>Navigation</div>
                    <div style={{padding:16,background:'#232b41'}}>Safety</div>
                    <div style={{padding:16,background:'#232b41'}}>Account</div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  )
}

export default NavigationMenu