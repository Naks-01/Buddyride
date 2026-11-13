import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Profile } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { uploadProfilePhoto } from '../lib/uploadProfilePhoto'

const BLUE = '#0066FF'
const BLUE_DARK = '#0052CC'
const BLUE_LIGHT = '#E6F0FF'

type View = 'main'|'profile'|'trips'|'help'
type Theme = 'light' | 'dark'

function errMsg(e: any) {
  return e?.message || e?.error_description || (typeof e === 'string' ? e : JSON.stringify(e))
}

interface Props {
  isOpen?: boolean; onClose?: () => void; profile?: Profile | null; onSignOut?: () => void
  userName?: string; theme?: Theme; onThemeChange?: (theme: Theme) => void
  verificationStatus?: string
  verificationRejectionReason?: string
  onReuploadVerification?: () => void
}

export function PassengerNavigationMenu({ isOpen: propIsOpen, onClose, profile, onSignOut, userName: propUserName, theme: propTheme, verificationStatus, verificationRejectionReason, onReuploadVerification }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [view, setView] = useState<View>('main')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '')
  const [photoError, setPhotoError] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const isControlled = propIsOpen !== undefined
  const isOpen = isControlled ? propIsOpen : internalOpen
  const theme = propTheme ?? 'light'
  const isDark = theme === 'dark'
  const ink = isDark ? '#f8fafc' : '#111827'
  const muted = isDark ? '#a1a1aa' : '#6b7280'
  const border = isDark ? '#38383a' : '#e5e7eb'
  const soft = isDark ? '#242426' : '#F2F4F7'
  const surface = isDark ? '#171719' : '#ffffff'
  const controlSurface = isDark ? '#242426' : '#ffffff'
  const success = BLUE
  const danger = isDark ? '#f87171' : '#b42318'
  const name = propUserName || fullName || profile?.full_name || 'BuddyRide passenger'
  const rating = Number(profile?.rating ?? 5).toFixed(2)

  useEffect(() => {
    setFullName(profile?.full_name || '')
    setPhone(profile?.phone || '')
    if (profile?.avatar_url) {
      if (typeof profile.avatar_url === 'string' && profile.avatar_url.startsWith('http')) setAvatarUrl(profile.avatar_url)
      else if (typeof profile.avatar_url === 'string') {
        try {
          const { data } = supabase.storage.from('profile-photos').getPublicUrl(profile.avatar_url)
          setAvatarUrl(data.publicUrl)
        } catch { setAvatarUrl(profile.avatar_url) }
      }
    }
  }, [profile?.avatar_url, profile?.full_name, profile?.phone])

  const handleProfilePhotoUpload = async (file?: File) => {
    if (!file || !profile?.id) return
    setPhotoUploading(true); setPhotoError(''); setMsg('')
    try {
      // FIX: Use ONE shared helper - old code had a 2nd copy of compress + upload here, no 10MB guard
      const publicUrl = await uploadProfilePhoto(profile.id, file)
      setAvatarUrl(publicUrl)
      setMsg('Photo updated ✅')
    } catch (uploadError: unknown) {
      setPhotoError(`Could not update profile photo: ${errMsg(uploadError)}`)
    } finally { setPhotoUploading(false) }
  }

  async function saveProfile() {
    if (!profile?.id) return
    setSaving(true); setMsg(''); setPhotoError('')
    try {
      const { error } = await supabase.from('profiles').update({ full_name: fullName.trim(), phone: phone.trim() }).eq('id', profile.id)
      if (error) throw error
      setMsg('Profile updated ✅'); setEditing(false)
    } catch (e: any) { setMsg(errMsg(e)) } finally { setSaving(false) }
  }

  const close = () => { if (onClose) onClose(); else setInternalOpen(false); setView('main') }
  const open = () => { setView('main'); setInternalOpen(true) }

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown) }
  }, [isOpen])

  const itemStyle = { width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 16, padding: '12px 4px', background: surface, color: ink, textAlign: 'left' as const, borderBottom: `1px solid ${border}`, borderRadius: 0 }
  const iconStyle = { width: 28, flexShrink: 0, textAlign: 'center' as const, fontSize: 21 }
  const backButton = (<button type="button" onClick={() => setView('main')} style={{ display: 'block', padding: '8px 0', marginBottom: 20, background: 'transparent', color: ink, fontSize: 16 }}>← Back</button>)
  const menuItem = (icon: string, label: string, nextView: View) => (<button key={label} type="button" onClick={() => setView(nextView)} style={itemStyle}><span style={iconStyle}>{icon}</span><span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{label}</span><span style={{ color: '#9ca3af', fontSize: 22 }}>›</span></button>)

  const renderView = () => {
    switch (view) {
      case 'profile':
        return (<>
          {backButton}<h2 style={{ margin: '0 0 20px', fontSize: 22 }}>My Profile</h2>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0066FF&color=fff`} alt={`${name} profile`} style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', background: soft, border: `2px solid ${BLUE}` }} />
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'inline-block', color: success, fontSize: 13, cursor: photoUploading ? 'wait' : 'pointer', fontWeight: 700 }}>{photoUploading ? 'Uploading...' : 'Change photo'}<input type="file" accept="image/*" disabled={photoUploading} onChange={event => { void handleProfilePhotoUpload(event.target.files?.[0]); event.target.value = '' }} style={{ display: 'none' }} /></label>
            </div>
            {photoError && <p role="alert" style={{ color: danger, fontSize: 12, marginTop: 8 }}>{photoError}</p>}
            {msg && <p style={{ color: success, fontSize: 12, marginTop: 8 }}>{msg}</p>}
          </div>

          {verificationStatus === 'rejected' && (
            <section role="alert" style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: isDark ? '#450a0a' : '#fef2f2', border: `1px solid ${isDark ? '#b91c1c' : '#fecaca'}`, color: isDark ? '#fecaca' : '#991b1b' }}>
              <strong>Verification Rejected: {verificationRejectionReason || 'Please re-upload.'}</strong>
              <button type="button" onClick={() => { close(); onReuploadVerification?.() }} style={{ display: 'block', width: '100%', marginTop: 12, padding: 11, border: 0, borderRadius: 8, background: '#b91c1c', color: 'white', fontWeight: 700 }}>Re-upload Now</button>
            </section>
          )}

          {!editing ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div><div style={{ fontSize: 18, fontWeight: 700 }}>{fullName || 'BuddyRide passenger'}</div><div style={{ color: muted, marginTop: 4, fontSize: 13 }}>{phone || 'Add phone number'}</div><div style={{ fontSize: 13, marginTop: 5 }}>{rating} ★ • {profile?.trips_completed ?? 0} trips</div></div>
                <button onClick={() => setEditing(true)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${border}`, background: soft, color: ink }}>Edit</button>
              </div>
              <div style={{ marginTop: 12, color: muted, fontSize: 12 }}>{profile?.email || ''}</div>
            </>
          ) : (
            <>
              <label style={{ display: 'block', marginBottom: 12, fontWeight: 600, color: ink }}>Full name
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" style={{ display: 'block', width: '100%', height: 44, minHeight: 44, marginTop: 6, padding: '12px', borderRadius: 10, border: `1px solid ${border}`, background: controlSurface, color: ink, boxSizing: 'border-box' }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16, fontWeight: 600, color: ink }}>Phone
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="071 123 4567" style={{ display: 'block', width: '100%', height: 44, minHeight: 44, marginTop: 6, padding: '12px', borderRadius: 10, border: `1px solid ${border}`, background: controlSurface, color: ink, boxSizing: 'border-box' }} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveProfile} disabled={saving} style={{ flex: 1, padding: 12, borderRadius: 10, background: BLUE, color: 'white', fontWeight: 700, border: 'none' }}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 12, borderRadius: 10, background: soft, border: `1px solid ${border}`, color: ink }}>Cancel</button>
              </div>
            </>
          )}
        </>)
      case 'trips': return (<>{backButton}<h2 style={{ margin: '0 0 8px', fontSize: 22 }}>My Trips</h2><div style={{ padding: 20, background: soft, borderRadius: 14, textAlign: 'center', marginTop: 20 }}><div style={{ fontSize: 28 }}>🕘</div><strong style={{ display: 'block', marginTop: 10, color: ink }}>Your rides will appear here</strong><p style={{ color: muted, fontSize: 14, marginBottom: 0 }}>Completed trips show here.</p></div></>)
      case 'help': return (<>{backButton}<h2 style={{ margin: '0 0 16px', fontSize: 22 }}>Help & Support</h2><div style={{ padding: 16, background: soft, borderRadius: 14 }}><strong style={{ color: ink }}>BuddyRide Support — Limpopo</strong><p style={{ color: muted, fontSize: 14, lineHeight: 1.5 }}>Need help with a trip or payment? Chat to us.</p><a href="https://wa.me/27641018991?text=Hi BuddyRide, I need help with my ride" target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: 13, borderRadius: 12, background: BLUE, color: '#fff', fontWeight: 900, textDecoration: 'none', marginTop: 12 }}>💬 WhatsApp 064 101 8991</a><a href="tel:+27641018991" style={{ display: 'block', textAlign: 'center', padding: 13, borderRadius: 12, background: surface, color: ink, border: `1px solid ${border}`, fontWeight: 700, textDecoration: 'none', marginTop: 8 }}>📞 Call Support</a><p style={{ color: muted, fontSize: 11, marginTop: 14, lineHeight: 1.4 }}>BuddyRide • Polokwane • Safety first • Cash & Paystack</p></div></>)
      default: return null
    }
  }

  return (<>
    {!isControlled && (<button type="button" onClick={open} aria-label="Open menu" aria-expanded={isOpen} style={{ width: 42, height: 42, padding: 0, borderRadius: '50%', background: surface, border: `1px solid ${border}`, color: ink, fontSize: 20 }}>☰</button>)}
    {isOpen && createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', fontFamily: 'Inter, system-ui, sans-serif', color: ink }}>
      <button type="button" aria-label="Close menu" onClick={close} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, borderRadius: 0, background: 'rgba(0,0,0,0.48)' }} />
      <aside aria-label="Passenger menu" style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: 'min(85vw, 360px)', height: '100%', background: surface, color: ink, boxShadow: '12px 0 35px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '24px 20px 20px', borderBottom: `1px solid ${border}` }}>
          <img src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0066FF&color=fff`} alt={`${name} profile`} style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', background: soft, border: `2px solid ${BLUE}` }} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 16, overflowWrap: 'anywhere' }}>{name}</div><div style={{ color: muted, fontSize: 12, marginTop: 3 }}>{phone || 'Add phone'}</div><div style={{ fontSize: 12, marginTop: 4 }}>{rating} ★</div></div>
          <button type="button" onClick={() => setView('profile')} style={{ background: BLUE_LIGHT, color: BLUE_DARK, padding: '8px 10px', fontSize: 12, borderRadius: 8, border: 'none', fontWeight: 700 }}>Edit</button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
          {menuItem('👤', 'My Profile', 'profile')}
          {menuItem('🕘', 'My Trips', 'trips')}
          {menuItem('❓', 'Help & Support', 'help')}
          <button type="button" onClick={onSignOut} style={{ ...itemStyle, color: danger, borderBottom: 0 }}><span style={iconStyle}>↩️</span><span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Log Out</span></button>
        </nav>
        {view !== 'main' && (<section aria-label={`${view} screen`} style={{ position: 'absolute', inset: 0, zIndex: 2, padding: 20, background: surface, color: ink, overflowY: 'auto' }}>{renderView()}</section>)}
      </aside>
    </div>, document.body)}
  </>)
}
export default PassengerNavigationMenu