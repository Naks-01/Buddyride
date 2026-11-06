import assert from 'node:assert/strict'
import test from 'node:test'
import { getDriverEntryPath } from '../src/lib/driverRouting.mjs'

test('a newly signed-up driver stays on the driver flow', () => {
  const profile = {
    email: 'driver@example.com',
    role: 'driver',
    verification_status: 'not_started',
  }

  assert.equal(
    getDriverEntryPath(profile.role, profile.verification_status, '/'),
    '/driver/onboarding',
  )
})

test('a driver awaiting review is routed to the pending page', () => {
  assert.equal(getDriverEntryPath('driver', 'pending', '/'), '/driver-pending')
  assert.equal(getDriverEntryPath('driver', 'pending_verification', '/driver/dashboard'), '/driver-pending')
})

test('passengers are not routed into the driver flow', () => {
  assert.equal(getDriverEntryPath('passenger', 'pending', '/'), null)
})

test('active driver navigation URLs are preserved', () => {
  assert.equal(getDriverEntryPath('driver', 'approved', '/driver/navigation/ride-123'), null)
})
