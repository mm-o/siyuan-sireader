import { pluginStorageAdapter, type StorageAdapter } from './adapter'
import { decodeStoredValue, encodeStoredValue } from './codec'
import { applyOperations } from './reducer'
import type { StorageOperation, StoredEnvelope } from './types'
import { compactOperationIds } from './types'

export interface StorageKey<T> {
  name: string
  defaultValue: () => T
}

export interface StorageCommitEvent<T = unknown> {
  key: string
  envelope: StoredEnvelope<T>
}

const clone = <T>(value: T): T => structuredClone(value)
const transactionId = () => globalThis.crypto?.randomUUID?.()
  || `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export class StorageEngine {
  private cache = new Map<string, StoredEnvelope<unknown>>()
  private present = new Set<string>()
  private queues = new Map<string, Promise<unknown>>()
  private failures = new Map<string, { error: unknown, retry: () => Promise<unknown> }>()
  private listeners = new Set<(event: StorageCommitEvent) => void>()
  private accepting = true

  constructor(private readonly adapter: StorageAdapter) {}

  private publishCache<T>(key: string, envelope: StoredEnvelope<T>, found: boolean) {
    const cached = this.cache.get(key) as StoredEnvelope<T> | undefined
    const winner = cached && (cached.revision > envelope.revision
      || (cached.revision === envelope.revision && cached.updatedAt > envelope.updatedAt))
      ? cached
      : envelope
    this.cache.set(key, clone(winner))
    if (winner === envelope) {
      if (found) this.present.add(key)
      else this.present.delete(key)
    }
    return winner
  }

  private async freshState<T>(key: StorageKey<T>): Promise<{ found: boolean, envelope: StoredEnvelope<T> }> {
    const stored = await this.adapter.read(key.name)
    if (!stored.found) {
      return { found: false, envelope: encodeStoredValue(clone(key.defaultValue()), {
        revision: 0,
        transactionId: '',
        updatedAt: 0,
        appliedOperationIds: [],
      }) }
    }
    return { found: true, envelope: decodeStoredValue<T>(stored.value).envelope }
  }

  private async freshEnvelope<T>(key: StorageKey<T>) { return (await this.freshState(key)).envelope }

  private withCrossContextLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks
    return locks?.request
      ? locks.request(`sireader:${key}`, task) as unknown as Promise<T>
      : task()
  }

  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) || Promise.resolve()
    const current = previous.catch(() => undefined).then(async () => {
      const failed = this.failures.get(key)
      if (failed) {
        try {
          await this.withCrossContextLock(key, failed.retry)
          if (this.failures.get(key) === failed) this.failures.delete(key)
        } catch (error) {
          failed.error = error
          throw error
        }
      }
      try {
        return await this.withCrossContextLock(key, task)
      } catch (error) {
        this.failures.set(key, { error, retry: task })
        throw error
      }
    })
    const tracked = current.finally(() => {
      if (this.queues.get(key) === tracked) this.queues.delete(key)
    })
    this.queues.set(key, tracked)
    return tracked
  }

  async read<T>(key: StorageKey<T>, fresh = false): Promise<T> {
    if (!fresh) {
      const cached = this.cache.get(key.name) as StoredEnvelope<T> | undefined
      if (cached) return clone(cached.data)
    }
    const { found, envelope } = await this.freshState(key)
    return clone(this.publishCache(key.name, envelope, found).data)
  }

  async readState<T>(key: StorageKey<T>, fresh = false): Promise<{ found: boolean, value: T }> {
    if (!fresh && this.cache.has(key.name)) {
      return { found: this.present.has(key.name), value: await this.read(key) }
    }
    const { found, envelope } = await this.freshState(key)
    const published = this.publishCache(key.name, envelope, found)
    return { found: this.present.has(key.name), value: clone(published.data) }
  }

  transact<T>(key: StorageKey<T>, operations: StorageOperation[], onCommit?: (data: T) => void): Promise<T> {
    if (!this.accepting) return Promise.reject(new Error('Storage is shutting down'))
    const captured = clone(operations)
    let notified = false
    return this.enqueue(key.name, async () => {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await this.freshEnvelope(key)
        const result = applyOperations(current.data, captured, current.appliedOperationIds)
        const next = encodeStoredValue(result.data, {
          revision: current.revision + 1,
          transactionId: transactionId(),
          updatedAt: Date.now(),
          appliedOperationIds: result.appliedOperationIds,
        })
        try { await this.adapter.write(key.name, next) }
        catch (error) { lastError = error; continue }
        let verified: StoredEnvelope<T>
        try { verified = await this.freshEnvelope(key) }
        catch (error) { lastError = error; continue }
        if (verified.revision !== next.revision
          || verified.transactionId !== next.transactionId
          || verified.checksum !== next.checksum) {
          lastError = new Error('Concurrent storage write detected')
          continue
        }
        this.publishCache(key.name, verified, true)
        const event = { key: key.name, envelope: clone(verified) }
        for (const listener of this.listeners) {
          try { listener(event) }
          catch (error) { console.error(`[Storage commit listener] ${key.name}`, error) }
        }
        if (!notified && onCommit) {
          notified = true
          try { onCommit(clone(verified.data)) }
          catch (error) { console.error(`[Storage commit callback] ${key.name}`, error) }
        }
        return clone(verified.data)
      }
      const verificationError = new Error(`Storage verification failed for ${key.name}`)
      ;(verificationError as Error & { cause?: unknown }).cause = lastError
      throw verificationError
    })
  }

  mutate<T>(key: StorageKey<T>, mutationId: string, update: (current: T) => T): Promise<T> {
    if (!this.accepting) return Promise.reject(new Error('Storage is shutting down'))
    return this.enqueue(key.name, async () => {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await this.freshEnvelope(key)
        if (current.appliedOperationIds.includes(mutationId)) return clone(current.data)
        const data = update(clone(current.data))
        const next = encodeStoredValue(data, {
          revision: current.revision + 1,
          transactionId: transactionId(),
          updatedAt: Date.now(),
          appliedOperationIds: compactOperationIds([...current.appliedOperationIds, mutationId]),
        })
        try { await this.adapter.write(key.name, next) }
        catch (error) { lastError = error; continue }
        let verified: StoredEnvelope<T>
        try { verified = await this.freshEnvelope(key) }
        catch (error) { lastError = error; continue }
        if (verified.revision !== next.revision || verified.transactionId !== next.transactionId || verified.checksum !== next.checksum) {
          lastError = new Error('Concurrent storage write detected')
          continue
        }
        this.publishCache(key.name, verified, true)
        const event = { key: key.name, envelope: clone(verified) }
        for (const listener of this.listeners) {
          try { listener(event) }
          catch (error) { console.error(`[Storage commit listener] ${key.name}`, error) }
        }
        return clone(verified.data)
      }
      const error = new Error(`Storage verification failed for ${key.name}`) as Error & { cause?: unknown }
      error.cause = lastError
      throw error
    })
  }

  remove(key: string) {
    if (!this.accepting) return Promise.reject(new Error('Storage is shutting down'))
    return this.enqueue(key, async () => {
      await this.adapter.remove(key)
      this.cache.delete(key)
      this.present.delete(key)
    })
  }

  releaseOperationIds<T>(key: StorageKey<T>, operationIds: string[]): Promise<T> {
    const remove = new Set(operationIds)
    return this.enqueue(key.name, async () => {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await this.freshEnvelope(key)
        const retained = current.appliedOperationIds.filter(id => !remove.has(id))
        if (retained.length === current.appliedOperationIds.length) return clone(current.data)
        const next = encodeStoredValue(current.data, {
          revision: current.revision + 1,
          transactionId: transactionId(),
          updatedAt: Date.now(),
          appliedOperationIds: retained,
        })
        try { await this.adapter.write(key.name, next) }
        catch (error) { lastError = error; continue }
        const verified = await this.freshEnvelope(key).catch(error => { lastError = error; return null })
        if (verified?.transactionId !== next.transactionId || verified.checksum !== next.checksum) {
          lastError = new Error('Concurrent storage write detected')
          continue
        }
        this.publishCache(key.name, verified, true)
        return clone(verified.data)
      }
      const error = new Error(`Storage operation ID cleanup failed for ${key.name}`) as Error & { cause?: unknown }
      error.cause = lastError
      throw error
    })
  }

  invalidate(key?: string) {
    if (key) {
      this.cache.delete(key)
      this.present.delete(key)
    } else {
      this.cache.clear()
      this.present.clear()
    }
  }

  subscribe(listener: (event: StorageCommitEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async flush() {
    while (this.queues.size) {
      await Promise.allSettled([...this.queues.values()])
    }
    if (this.failures.size) {
      await Promise.allSettled([...this.failures.keys()].map(key => this.enqueue(key, async () => undefined)))
      while (this.queues.size) await Promise.allSettled([...this.queues.values()])
    }
    const errors = [...this.failures.values()].map(failure => failure.error)
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) {
      const error = new Error(`Storage flush failed (${errors.length} errors)`) as Error & { errors?: unknown[] }
      error.errors = errors
      throw error
    }
  }

  stopAccepting() { this.accepting = false }
}

export const createStorageEngine = (adapter: StorageAdapter) => new StorageEngine(adapter)
export const storageEngine = createStorageEngine(pluginStorageAdapter)
export const invalidateStorage = (key?: string) => storageEngine.invalidate(key)
export const flushStorage = () => storageEngine.flush()
