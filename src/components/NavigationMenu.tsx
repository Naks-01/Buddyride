import { useState, useEffect } from 'react'

type View = 'main' | 'profile' | 'navigation' | 'defaultnav' | 'vehicles' | 'safety' | 'account' | 'appsettings' | 'communications' | 'about'

interface Props {
  profile?: any
  onSignOut?: () => void
  isOpen?: boolean
  onClose?: () => void
  userName?: string
  onNavigate?: any
}

export function NavigationMenu({ profile, onSignOut, isOpen: propIsOpen, onClose, userName: propName }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [view, setView] = useState<View>('main')
  const [defaultNav, setDefaultNav] = useState('Bolt Navigation')
  const [autoStart, setAutoStart] = useState(false)

  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : internalOpen
  
  const close = () => {
    if (onClose) onClose()
    else setInternalOpen(false)
    setTimeout(()=>setView('main'),200)
  }
  const open = () => setInternalOpen(true)

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const userName = propName || profile?.full_name || "Nakampe Trevor Mokgalaka"
  const phone = profile?.phone || "+27793051213"
  const vehicle = "HCM339L - Renault Kwid 2022"

  return (
    <>
      {!isControlled && (
        <button onClick={open} style={{width:42,height:42,borderRadius:21,background:'#242428',border:'1px solid rgba(255,255,255,0.1)',color:'white',fontSize:18}}>☰</button>
      )}

      {isOpen && (
        <div style={{position:'fixed',inset:0,zIndex:99999,display:'flex'}}>
          <div onClick={close} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)'}} />
          
          <div style={{position:'relative',width:'88%',maxWidth:380,height:'100%',background:'#151a28',color:'white',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 0 50px rgba(0,0,0,0.8)'}}>
            <button onClick={close} style={{position:'absolute',top:12,right:12,width:32,height:32,borderRadius:16,background:'#242b3d',color:'white',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10}}>✕</button>
            
            <div style={{padding:20,paddingTop:32}}>
              <div style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onClick={() => setView('profile')}>
                <img src={"https://i.pravatar.cc/100?u="+userName} style={{width:40,height:40,borderRadius:20}} alt="" />
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{userName}</div>
                  <div style={{fontSize:12,color:'#7a8196'}}>◆ Silver ›</div>
                </div>
              </div>
              {view === 'main' && (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:16}}>
                    <div style={{background:'#242b3d',borderRadius:12,padding:12}}><div style={{fontWeight:700}}>89%</div><div style={{fontSize:11,color:'#7a8196'}}>Driver score</div></div>
                    <div style={{background:'#242b3d',borderRadius:12,padding:12}}><div style={{fontWeight:700}}>4.70</div><div style={{fontSize:11,color:'#7a8196'}}>Star rating</div></div>
                  </div>
                  <div style={{background:'#242b3d',borderRadius:12,padding:12,marginTop:8,width:'48%'}}><div style={{fontWeight:700}}>70%</div><div style={{fontSize:11,color:'#7a8196'}}>Acceptance rate</div></div>
                </>
              )}
            </div>

            <div style={{flex:1,overflowY:'auto',padding:'0 8px 24px'}}>
              {view === 'main' && (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  <button style={{width:'100%',display:'flex',gap:16,padding:'14px 16px',borderRadius:12,background:'#242b3d',textAlign:'left',color:'white'}}><span>💰</span><b>Earnings</b></button>
                  <button style={{width:'100%',display:'flex',gap:16,padding:'14px 16px',borderRadius:12,background:'#242b3d',textAlign:'left',color:'white'}}><span>🏷️</span><b>Campaigns</b></button>
                  <button onClick={()=>setView('profile')} style={{width:'100%',display:'flex',gap:16,padding:'14px 16px',borderRadius:12,background:'#242b3d',textAlign:'left',color:'white'}}><span>⚙️</span><b>Settings</b></button>
                  <div style={{padding:'24px 16px',display:'flex',flexDirection:'column',gap:16,fontSize:14,color:'#8b92a8'}}><div>Invite friends to drive</div><div>Driver Portal</div><div>Privacy</div></div>
                </div>
              )}

              {view === 'profile' && (
                <div>
                  <button onClick={()=>setView('main')} style={{padding:'8px 16px',fontSize:14,color:'#8b92a8'}}>← Back</button>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid #242b3d'}}><div style={{fontWeight:700}}>{userName}</div><div style={{fontSize:12,color:'#7a8196'}}>{phone}</div></div>
                  <button onClick={()=>setView('vehicles' as View)} style={{width:'100%',display:'flex',justifyContent:'space-between',padding:'16px',borderBottom:'1px solid #1f2536',textAlign:'left',color:'white',background:'transparent'}}><span>Vehicles<span style={{display:'block',fontSize:12,color:'#7a8196'}}>{vehicle}</span></span><span>›</span></button>
                  <button onClick={()=>setView('navigation')} style={{width:'100%',display:'flex',justifyContent:'space-between',padding:'16px',borderBottom:'1px solid #1f2536',textAlign:'left',color:'white',background:'transparent'}}><span>Navigation</span><span>›</span></button>
                  <button onClick={()=>setView('safety')} style={{width:'100%',display:'flex',justifyContent:'space-between',padding:'16px',borderBottom:'1px solid #1f2536',textAlign:'left',color:'white',background:'transparent'}}><span>Safety</span><span>›</span></button>
                  <button onClick={()=>setView('account')} style={{width:'100%',display:'flex',justifyContent:'space-between',padding:'16px',borderBottom:'1px solid #1f2536',textAlign:'left',color:'white',background:'transparent'}}><span>Account</span><span>›</span></button>
                  <button onClick={()=>setView('about')} style={{width:'100%',display:'flex',justifyContent:'space-between',padding:'16px',textAlign:'left',color:'white',background:'transparent'}}><span>About</span><span>›</span></button>
                </div>
              )}

              {view === 'navigation' && (
                <div>
                  <button onClick={()=>setView('profile')} style={{padding:'12px 16px',fontWeight:700,color:'white',background:'transparent'}}>← Navigation</button>
                  <button onClick={()=>setView('defaultnav')} style={{width:'100%',display:'flex',justifyContent:'space-between',padding:'12px 16px',borderTop:'1px solid #242b3d',borderBottom:'1px solid #242b3d',textAlign:'left',color:'white',background:'transparent'}}><div><div style={{fontSize:14}}>Default navigation</div><div style={{fontSize:12,color:'#7a8196'}}>{defaultNav}</div></div><span>›</span></button>
                  <div style={{padding:'16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:14}}>Navigation auto-start</span>
                    <button onClick={()=>setAutoStart(!autoStart)} style={{width:48,height:28,borderRadius:14,padding:2,background:autoStart?'#1de28f':'#2a344d',transition:'all 0.2s'}}>
                      <div style={{width:20,height:20,background:'white',borderRadius:10,transform:autoStart?'translateX(20px)':'translateX(0)',transition:'all 0.2s'}} />
                    </button>
                  </div>
                </div>
              )}

              {view === 'defaultnav' && (
                <div>
                  <button onClick={()=>setView('navigation')} style={{padding:'12px 16px',fontWeight:700,color:'white',background:'transparent'}}>← Default navigation</button>
                  {['Bolt Navigation','Google Maps','Waze'].map(n=>(
                    <label key={n} style={{display:'flex',gap:12,padding:'16px',cursor:'pointer'}}><input type="radio" checked={defaultNav===n} onChange={()=>{setDefaultNav(n); setView('navigation')}} />{n}</label>
                  ))}
                </div>
              )}

              {view === 'account' && (
                <div>
                  <button onClick={()=>setView('profile')} style={{padding:'12px 16px',fontWeight:700,color:'white',background:'transparent'}}>← Account</button>
                  <div style={{margin:12,background:'#1e2538',padding:12,borderRadius:12}}><div style={{fontSize:14}}>🎁 Earn up to</div><div style={{fontWeight:700}}>R 510 by inviting drivers</div></div>
                  <button onClick={onSignOut} style={{width:'100%',textAlign:'left',padding:'16px',color:'#ff6b6b',background:'transparent'}}>↪ Log out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default NavigationMenu