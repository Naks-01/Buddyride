import { useState } from 'react'

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

  // Support both modes: DriverHome (no isOpen) and controlled (isOpen prop)
  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : internalOpen
  const close = () => {
    if (onClose) onClose()
    else setInternalOpen(false)
    setTimeout(()=>setView('main'),200)
  }
  const open = () => setInternalOpen(true)

  const userName = propName || profile?.full_name || "Nakampe Trevor Mokgalaka"
  const phone = profile?.phone || "+27793051213"
  const vehicle = "HCM339L • Renault Kwid 2022"

  return (
    <>
      {/* Burger button for DriverHome mode */}
      {!isControlled && (
        <button onClick={open} style={{width:42,height:42,borderRadius:21,background:'#242428',border:'1px solid rgba(255,255,255,0.1)',color:'white',fontSize:18}}>☰</button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex">
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <div className="relative w-[88%] max-w-[380px] h-full bg-[#151a28] text-white flex flex-col overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('profile')}>
                <img src={`https://i.pravatar.cc/100?u=${userName}`} className="w-10 h-10 rounded-full" alt="" />
                <div className="flex-1">
                  <div className="font-bold text-[15px]">{userName}</div>
                  <div className="text-[12px] text-[#7a8196]">◆ Silver ›</div>
                </div>
              </div>
              {view === 'main' && (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="bg-[#242b3d] rounded-xl p-3"><div className="font-bold">89%</div><div className="text-[11px] text-[#7a8196]">Driver score</div></div>
                    <div className="bg-[#242b3d] rounded-xl p-3"><div className="font-bold">4.70</div><div className="text-[11px] text-[#7a8196]">Star rating</div></div>
                  </div>
                  <div className="bg-[#242b3d] rounded-xl p-3 mt-2 w-[48%]"><div className="font-bold">70%</div><div className="text-[11px] text-[#7a8196]">Acceptance rate</div></div>
                </>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-6">
              {view === 'main' && (
                <div className="space-y-1">
                  <button className="w-full flex gap-4 px-4 py-3.5 rounded-xl bg-[#242b3d] text-left"><span>💰</span><b>Earnings</b></button>
                  <button className="w-full flex gap-4 px-4 py-3.5 rounded-xl bg-[#242b3d] text-left"><span>🏷️</span><b>Campaigns</b></button>
                  <button onClick={()=>setView('profile')} className="w-full flex gap-4 px-4 py-3.5 rounded-xl bg-[#242b3d] text-left"><span>⚙️</span><b>Settings</b></button>
                  <div className="pt-6 px-4 space-y-4 text-[14px] text-[#8b92a8]"><div>Invite friends to drive</div><div>Driver Portal</div><div>Privacy</div></div>
                </div>
              )}

              {view === 'profile' && (
                <div>
                  <button onClick={()=>setView('main')} className="px-4 py-2 text-sm text-[#8b92a8]">← Back</button>
                  <div className="px-4 py-3 border-b border-[#242b3d]"><div className="font-bold">{userName}</div><div className="text-xs text-[#7a8196]">{phone}</div></div>
                  <button onClick={()=>setView('vehicles' as View)} className="w-full flex justify-between px-4 py-4 border-b border-[#1f2536] text-left"><span>Vehicles<span className="block text-xs text-[#7a8196]">{vehicle}</span></span><span>›</span></button>
                  <button onClick={()=>setView('navigation')} className="w-full flex justify-between px-4 py-4 border-b border-[#1f2536] text-left"><span>Navigation</span><span>›</span></button>
                  <button onClick={()=>setView('safety')} className="w-full flex justify-between px-4 py-4 border-b border-[#1f2536] text-left"><span>Safety</span><span>›</span></button>
                  <button onClick={()=>setView('account')} className="w-full flex justify-between px-4 py-4 border-b border-[#1f2536] text-left"><span>Account</span><span>›</span></button>
                  <button onClick={()=>setView('about')} className="w-full flex justify-between px-4 py-4 text-left"><span>About</span><span>›</span></button>
                </div>
              )}

              {view === 'navigation' && (
                <div>
                  <button onClick={()=>setView('profile')} className="px-4 py-3 font-bold">← Navigation</button>
                  <button onClick={()=>setView('defaultnav')} className="w-full flex justify-between px-4 py-3 border-y border-[#242b3d] text-left"><div><div className="text-sm">Default navigation</div><div className="text-xs text-[#7a8196]">{defaultNav}</div></div><span>›</span></button>
                  <div className="px-4 py-4 flex justify-between items-center"><span className="text-sm">Navigation auto-start</span><button onClick={()=>setAutoStart(!autoStart)} className={`w-12 h-7 rounded-full p-1 ${autoStart?'bg-[#1de28f]':'bg-[#2a344d]'}`}><div className={`w-5 h-5 bg-white rounded-full ${autoStart?'translate-x-5':''} transition-all`} /></button></div>
                </div>
              )}

              {view === 'defaultnav' && (
                <div>
                  <button onClick={()=>setView('navigation')} className="px-4 py-3 font-bold">← Default navigation</button>
                  {['Bolt Navigation','Google Maps','Waze'].map(n=>(
                    <label key={n} className="flex gap-3 px-4 py-4 cursor-pointer"><input type="radio" checked={defaultNav===n} onChange={()=>{setDefaultNav(n); setView('navigation')}} className="accent-[#1de28f]" />{n}</label>
                  ))}
                </div>
              )}

              {view === 'account' && (
                <div>
                  <button onClick={()=>setView('profile')} className="px-4 py-3 font-bold">← Account</button>
                  <div className="m-3 bg-[#1e2538] p-3 rounded-xl"><div className="text-sm">🎁 Earn up to</div><div className="font-bold">R 510 by inviting drivers</div></div>
                  <button onClick={onSignOut} className="w-full text-left px-4 py-4 text-[#ff6b6b]">↪ Log out</button>
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