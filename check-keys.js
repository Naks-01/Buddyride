import fs from 'fs'
const envFile = fs.existsSync('.env')? '.env' : fs.existsSync('.env.local')? '.env.local' : null
if (!envFile) { console.log("❌ NO .env FILE"); process.exit() }
console.log(`Found: ${envFile}`)
const content = fs.readFileSync(envFile, 'utf8')
content.split('\n').forEach(l=>{
  if(l.includes('VITE_')){
    const parts=l.split('=')
    if(parts[1]) console.log(`${parts[0]}: ✅ ${parts[1].substring(0,12)}...`)
    else console.log(`${parts[0]}: ❌ EMPTY`)
  }
})
