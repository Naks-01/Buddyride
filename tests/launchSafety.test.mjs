import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('new passenger profiles start unverified', async () => {
  const app = await read('../src/App.tsx')
  assert.match(app, /verification_status:\s*'not_started',\s*is_verified:\s*false/)
  assert.doesNotMatch(app, /verification_status:\s*'verified',\s*is_verified:\s*true/)
})

test('browser login never promotes an account role', async () => {
  const app = await read('../src/App.tsx')
  assert.doesNotMatch(app, /update\(\{\s*role:\s*'admin'/)
  assert.doesNotMatch(app, /update\(\{\s*role:\s*intendedRole/)
  assert.match(app, /Never change passenger\/driver/)
})

test('the historical storage migration cannot drop user data', async () => {
  const sql = await read('../supabase/migrations/20261108000100_storage_and_admin_hardening.sql')
  assert.doesNotMatch(sql, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM\s+storage\.objects/i)
})

test('passenger My Trips loads the signed-in passenger ride history', async () => {
  const menu = await read('../src/components/PassengerNavigationMenu.tsx')
  assert.match(menu, /\.eq\('passenger_id',\s*profile\.id\)/)
  assert.match(menu, /case 'trips'/)
  assert.doesNotMatch(menu, /Your rides will appear here/)
})

test('driver online state depends on a successful dispatch status write', async () => {
  const driver = await read('../src/pages/DriverHome.tsx')
  assert.match(driver, /async function safeUpsertDriverStatus\(payload: any\): Promise<boolean>/)
  assert.match(driver, /if \(!statusSaved\) throw new Error\('Could not save your availability to the dispatch system/)
})

test('bulk payout only updates the currently filtered ride IDs', async () => {
  const finance = await read('../src/pages/AdminFinance.tsx')
  assert.match(finance, /\.in\('id',\s*rideIds\)/)
  assert.match(finance, /currently filtered unpaid trips/)
})

test('driver settings use the saved commission and do not offer Google Maps', async () => {
  const menu = await read('../src/components/NavigationMenu.tsx')
  assert.match(menu, /commission_percent/)
  assert.match(menu, /100 - commissionPercent/)
  assert.doesNotMatch(menu, /Google Maps/)
})
