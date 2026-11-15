import { expect, test, vi } from 'vitest'
vi.mock('siyuan', () => ({ showMessage: vi.fn() }))
vi.mock('@/core/storage', () => ({ storageEngine: { readState: vi.fn(), read: vi.fn(), transact: vi.fn() } }))
import { LicenseManager } from '@/core/license'
import { storageEngine } from '@/core/storage'

test('concurrent license checks share only the in-flight request, not a lasting cache', async () => {
  vi.mocked(storageEngine.readState).mockResolvedValue({ found: true, value: { userId: 'test', type: 'annual', expiresAt: 0, lastVerifiedAt: Date.now() } })
  await Promise.all([LicenseManager.getLicense(), LicenseManager.getLicense(), LicenseManager.getLicense()])
  expect(storageEngine.readState).toHaveBeenCalledTimes(1)
  vi.mocked(storageEngine.readState).mockResolvedValue({ found: false, value: null })
  expect(await LicenseManager.getLicense()).toBeNull()
  expect(storageEngine.readState).toHaveBeenCalledTimes(2)
})
