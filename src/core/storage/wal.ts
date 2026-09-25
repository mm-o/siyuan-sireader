import { pluginStorageAdapter, type StorageAdapter } from './adapter'
import { storageEngine, type StorageEngine, type StorageKey } from './engine'
import type { StorageOperation } from './types'
import { stableStringify } from './codec'
import { walOperationId } from './types'

export interface WalStep {
  id: string
  kind: string
  payload: unknown
}

interface WalEntry {
  version: 1
  id: string
  label: string
  state: 'prepared' | 'committed'
  createdAt: number
  steps: WalStep[]
  completedStepIds: string[]
}

type WalHandler = (payload: unknown, entry: Readonly<WalEntry>) => Promise<void>
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export class WalCoordinator {
  private handlers = new Map<string, WalHandler>()
  private cleanupHandlers = new Map<string, WalHandler>()
  private recovery: Promise<void> | null = null

  constructor(private readonly adapter: StorageAdapter) {}

  register(kind: string, handler: WalHandler) {
    this.handlers.set(kind, handler)
    return this
  }

  registerCleanup(kind: string, handler: WalHandler) {
    this.cleanupHandlers.set(kind, handler)
    return this
  }

  private key(entry: Pick<WalEntry, 'id'>) { return `transactions/${entry.id}.json` }

  private async persist(entry: WalEntry) {
    await this.adapter.write(this.key(entry), entry)
    const stored = await this.adapter.read(this.key(entry))
    const value = stored.value as WalEntry | undefined
    if (!stored.found || stableStringify(value) !== stableStringify(entry)) {
      throw new Error(`WAL verification failed for ${entry.label}`)
    }
  }

  private async resume(entry: WalEntry) {
    if (entry.state === 'committed') {
      await this.cleanup(entry)
      await this.adapter.remove(this.key(entry))
      return
    }
    const completed = new Set(entry.completedStepIds)
    for (const step of entry.steps) {
      if (completed.has(step.id)) continue
      const handler = this.handlers.get(step.kind)
      if (!handler) throw new Error(`No WAL handler registered for ${step.kind}`)
      await handler(step.payload, entry)
      completed.add(step.id)
      entry.completedStepIds = [...completed]
      await this.persist(entry)
    }
    entry.state = 'committed'
    await this.persist(entry)
    await this.cleanup(entry)
    await this.adapter.remove(this.key(entry))
  }

  private async cleanup(entry: WalEntry) {
    for (const step of entry.steps) {
      const handler = this.cleanupHandlers.get(step.kind)
      if (handler) await handler(step.payload, entry)
    }
  }

  async runAtomic(label: string, steps: WalStep[]) {
    if (!steps.length) return
    const entryId = id()
    const normalizedSteps = structuredClone(steps).map(step => {
      if (step.kind !== 'storage:transact') return step
      const payload = step.payload as StorageTransactionPayload
      return {
        ...step,
        payload: {
          ...payload,
          operations: payload.operations.map((operation, index) => ({ ...operation, id: walOperationId(entryId, step.id, index) })),
        },
      }
    })
    const entry: WalEntry = {
      version: 1,
      id: entryId,
      label,
      state: 'prepared',
      createdAt: Date.now(),
      steps: normalizedSteps,
      completedStepIds: [],
    }
    await this.persist(entry)
    await this.resume(entry)
  }

  recoverTransactions() {
    if (this.recovery) return this.recovery
    this.recovery = (async () => {
      const keys = (await this.adapter.list('transactions/')).sort()
      for (const key of keys) {
        const stored = await this.adapter.read(key)
        if (!stored.found) continue
        const entry = stored.value as WalEntry
        if (entry?.version !== 1 || !entry.id || !Array.isArray(entry.steps) || !Array.isArray(entry.completedStepIds)) {
          throw new Error(`Invalid WAL entry: ${key}`)
        }
        await this.resume(entry)
      }
    })().finally(() => { this.recovery = null })
    return this.recovery
  }
}

interface StorageTransactionPayload {
  key: string
  defaultValue: unknown
  operations: StorageOperation[]
}

export const registerStorageWalHandler = (coordinator: WalCoordinator, engine: StorageEngine = storageEngine) => {
  coordinator.register('storage:transact', async raw => {
    const payload = raw as StorageTransactionPayload
    if (!payload?.key || !Array.isArray(payload.operations)) throw new Error('Invalid storage WAL step')
    const key: StorageKey<unknown> = {
      name: payload.key,
      defaultValue: () => structuredClone(payload.defaultValue),
    }
    await engine.transact(key, payload.operations)
  })
  coordinator.registerCleanup('storage:transact', async raw => {
    const payload = raw as StorageTransactionPayload
    const key: StorageKey<unknown> = { name: payload.key, defaultValue: () => structuredClone(payload.defaultValue) }
    await engine.releaseOperationIds(key, payload.operations.map(operation => operation.id))
  })
  return coordinator
}

export const storageTransactionStep = <T>(
  id: string,
  key: { name: string, defaultValue: T },
  operations: StorageOperation[],
): WalStep => ({
  id,
  kind: 'storage:transact',
  payload: { key: key.name, defaultValue: key.defaultValue, operations },
})

export const createWalCoordinator = (adapter: StorageAdapter) => new WalCoordinator(adapter)
export const walCoordinator = registerStorageWalHandler(createWalCoordinator(pluginStorageAdapter))
export const runAtomic = (label: string, steps: WalStep[]) => walCoordinator.runAtomic(label, steps)
export const recoverTransactions = () => walCoordinator.recoverTransactions()
