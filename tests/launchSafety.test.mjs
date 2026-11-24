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

test('bundle-model finance does not pretend to execute driver bank payouts', async () => {
  const finance = await read('../src/pages/AdminFinance.tsx')
  assert.match(finance, /Bundle Sales/)
  assert.match(finance, /Driver keeps 100% of fare/)
  assert.doesNotMatch(finance, /Mark Paid|currently filtered unpaid trips/)
})

test('driver earnings pay 100 percent of the fare and do not offer Google Maps', async () => {
  const menu = await read('../src/components/NavigationMenu.tsx')
  assert.match(menu, /Number\(ride\.fare \|\| 0\)/)
  assert.match(menu, /100% of each fare/)
  assert.doesNotMatch(menu, /commission_percent|commissionPercent|Google Maps/)
})

test('bundle purchases cannot create credits from the browser or simulated success', async () => {
  const page = await read('../src/pages/DriverBundlePurchase.tsx')
  assert.match(page, /start-bundle-checkout/)
  assert.match(page, /verify-bundle-payment/)
  assert.doesNotMatch(page, /simulate success|sim_\$\{|driver_bundles.*insert/)
})

test('trip acceptance is enforced by the server-side bundle RPC', async () => {
  const driver = await read('../src/pages/DriverHome.tsx')
  const sql = await read('../supabase/migrations/20261124000200_bundle_model_paystack.sql')
  assert.match(driver, /accept_ride_with_bundle/)
  assert.match(sql, /create or replace function public\.accept_ride_with_bundle/)
  assert.match(sql, /active bundle with enough credits/)
})
