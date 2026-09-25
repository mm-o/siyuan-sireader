import type { StoredEnvelope } from './types'
import { compactOperationIds } from './types'

export class StorageCorruptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageCorruptionError'
  }
}

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    const toJSON = (value as { toJSON?: () => unknown }).toJSON
    if (typeof toJSON === 'function') return normalize(toJSON.call(value))
    return Object.keys(value as object).sort().reduce<Record<string, unknown>>((result, key) => {
      const item = (value as Record<string, unknown>)[key]
      if (item !== undefined) result[key] = normalize(item)
      return result
    }, {})
  }
  return value
}

export const stableStringify = (value: unknown) => JSON.stringify(normalize(value))

const checksumOf = (value: unknown) => {
  const text = stableStringify(value)
  let hash = 0x811C9DC5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

type EnvelopeMetadata = Pick<StoredEnvelope<unknown>, 'revision' | 'transactionId' | 'updatedAt' | 'appliedOperationIds'>

const checksumPayload = <T>(envelope: Omit<StoredEnvelope<T>, 'checksum'>) => envelope

export const encodeStoredValue = <T>(data: T, metadata: EnvelopeMetadata): StoredEnvelope<T> => {
  const base = {
    storageVersion: 2 as const,
    revision: metadata.revision,
    transactionId: metadata.transactionId,
    updatedAt: metadata.updatedAt,
    appliedOperationIds: compactOperationIds(metadata.appliedOperationIds),
    data,
  }
  return { ...base, checksum: checksumOf(checksumPayload(base)) }
}

const isEnvelope = (value: unknown): value is StoredEnvelope<unknown> =>
  !!value && typeof value === 'object' && (value as Record<string, unknown>).storageVersion === 2

export const decodeStoredValue = <T>(value: unknown): { legacy: boolean, envelope: StoredEnvelope<T> } => {
  if (!isEnvelope(value)) {
    return {
      legacy: true,
      envelope: encodeStoredValue(value as T, {
        revision: 0,
        transactionId: '',
        updatedAt: 0,
        appliedOperationIds: [],
      }),
    }
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0
    || typeof value.transactionId !== 'string'
    || typeof value.updatedAt !== 'number'
    || typeof value.checksum !== 'string'
    || !Array.isArray(value.appliedOperationIds)
    || value.appliedOperationIds.some(id => typeof id !== 'string')) {
    throw new StorageCorruptionError('Invalid storage envelope')
  }
  const { checksum, ...payload } = value
  if (checksumOf(checksumPayload(payload)) !== checksum) {
    throw new StorageCorruptionError('Storage checksum mismatch')
  }
  return { legacy: false, envelope: value as StoredEnvelope<T> }
}
