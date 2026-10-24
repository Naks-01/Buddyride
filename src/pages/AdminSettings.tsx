import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type FareSettings = { base_fare:number, per_km:number, per_min:number, min_fare:number, commission:number }
const DEFAULT_SETTINGS: FareSettings = { base_fare:15, per_km:7, per_min:0, min_fare:15, commission:15 }

export function AdminSettings({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('app_settings').select('base_fare,per_km,per_min,min_fare,commission').eq('id',1).maybeSingle()
      if (error) setMessage('Could not load settings: ' + error.message)
      else if (data) setSettings({
        base_fare:Number(data.base_fare), per_km:Number(data.per_km), per_min:Number(data.per_min),
        min_fare:Number(data.min_fare), commission:Number(data.commission),
      })
      setLoading(false)
    }
    void load()
  }, [])

  async function save() {
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('app_settings').update({...settings, updated_at:new Date().toISOString()}).eq('id',1)
    setSaving(false)
    setMessage(error ? 'Could not save settings: ' + error.message : 'Settings saved.')
  }

  const fields: { key:keyof FareSettings, label:string }[] = [
    {key:'base_fare',label:'Base fare (R)'}, {key:'per_km',label:'Per kilometer (R)'},
    {key:'per_min',label:'Per minute (R)'}, {key:'min_fare',label:'Minimum fare (R)'},
    {key:'commission',label:'Commission (%)'},
  ]
  return <main style={{minHeight:'100vh', background:'#0f172a', color:'white', padding:'16px'}}>
    <button onClick={onBack}>← Admin home</button><h1>Admin Settings</h1>
    {loading ? <p>Loading settings…</p> : <section style={{maxWidth:'520px', background:'#1e293b', padding:'16px', borderRadius:'12px'}}>
      {fields.map(field=><label key={field.key} style={{display:'block', marginBottom:'12px'}}>
        {field.label}
        <input type="number" value={settings[field.key]} onChange={event=>setSettings(previous=>({...previous,[field.key]:Number(event.target.value)}))} style={{display:'block', width:'100%', boxSizing:'border-box', padding:'10px', marginTop:'4px'}} />
      </label>)}
      <button disabled={saving} onClick={()=>void save()}>{saving?'Saving…':'Save settings'}</button>
    </section>}
    {message && <p role="status">{message}</p>}
  </main>
}
