import { pluginStorageAdapter, type StorageAdapter } from './adapter'
import { decodeStoredValue, stableStringify } from './codec'
import { storageEngine, type StorageEngine, type StorageKey } from './engine'
import { recoverTransactions } from './wal'

let initialization: Promise<void> | null = null
const markerKey: StorageKey<{ completedAt: number, migrated: number, keys: string[] }> = {
  name: 'storage-migration-v2.json',
  defaultValue: () => ({ completedAt: 0, migrated: 0, keys: [] }),
}

export const migrateLegacyStorage = async (
  adapter: StorageAdapter = pluginStorageAdapter,
  engine: StorageEngine = storageEngine,
) => {
  if ((await engine.readState(markerKey, true)).found) return
  const known = ['bookshelf.json', 'settings.json', 'daily.json', 'sireader_license', 'sireader_usage_report_day', 'page-scripts.json']
  const records = await adapter.list('records')
  const keys = [...new Set([...known, ...records])]
  const timestamp = Date.now()
  let migrated = 0
  const migratedKeys: string[] = []
  for (const name of keys) {
    const stored = await adapter.read(name)
    if (!stored.found) continue
    const decoded = decodeStoredValue(stored.value)
    if (!decoded.legacy) continue
    const backupKey = `backups/storage-v1/${timestamp}/${name}`
    await adapter.write(backupKey, stored.value)
    const backup = await adapter.read(backupKey)
    if (!backup.found || stableStringify(backup.value) !== stableStringify(stored.value)) {
      throw new Error(`backup verification failed for ${name}`)
    }
    const key: StorageKey<unknown> = { name, defaultValue: () => null }
    await engine.transact(key, [{ id: `migration:${timestamp}:${name}`, type: 'set', path: [], value: decoded.envelope.data }])
    const verified = await engine.readState(key, true)
    if (!verified.found || stableStringify(verified.value) !== stableStringify(decoded.envelope.data)) {
      throw new Error(`Storage migration verification failed for ${name}`)
    }
    migrated++
    migratedKeys.push(name)
  }
  await engine.transact(markerKey, [{
    id: `migration:complete:${timestamp}`,
    type: 'set',
    path: [],
    value: { completedAt: Date.now(), migrated, keys: migratedKeys.sort() },
  }])
}

/** Recover durable work before any repository or UI reads plugin data. */
export const initializeStorage = () => initialization ||= import('./files').then(() => recoverTransactions()).then(() => migrateLegacyStorage()).catch(error => {
  initialization = null
  throw error
})
