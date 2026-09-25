export interface StoredEnvelope<T> {
  storageVersion: 2
  revision: number
  transactionId: string
  updatedAt: number
  checksum: string
  appliedOperationIds: string[]
  data: T
}

export type StorageOperation<_T = any> =
  | { id: string, type: 'set', path: string[], value: unknown }
  | { id: string, type: 'patch', path: string[], value: Record<string, unknown> }
  | { id: string, type: 'upsert', path: string[], itemKey: string, value: Record<string, unknown> }
  | { id: string, type: 'delete', path: string[], itemKey?: string, itemValue?: unknown }
  | { id: string, type: 'increment', path: string[], value: number }
  | { id: string, type: 'max', path: string[], value: number }

export interface OperationResult<T> {
  data: T
  appliedOperationIds: string[]
}

const WAL_PREFIX = 'wal:'
export const compactOperationIds = (ids: string[], limit = 512) => {
  const unique = [...new Set(ids)]
  return [...unique.filter(id => id.startsWith(WAL_PREFIX)), ...unique.filter(id => !id.startsWith(WAL_PREFIX)).slice(-limit)]
}
export const walOperationId = (entryId: string, stepId: string, index: number) => `${WAL_PREFIX}${entryId}:${stepId}:${index}`

const isPlainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const deepMerge = <T>(base: T, patch: unknown): T => {
  if (!isPlainObject(base) || !isPlainObject(patch)) return structuredClone(patch) as T
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) result[key] = isPlainObject(value) && isPlainObject(result[key]) ? deepMerge(result[key], value) : structuredClone(value)
  return result as T
}
export const diffLeaves = (current: Record<string, unknown>, baseline: Record<string, unknown>) => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(current)) {
    const previous = baseline[key]
    if (equal(value, previous)) continue
    if (isPlainObject(value) && isPlainObject(previous)) { const nested = diffLeaves(value, previous); if (Object.keys(nested).length) result[key] = nested }
    else result[key] = structuredClone(value)
  }
  return result
}
export const leafEntries = (patch: Record<string, unknown>, prefix: string[] = []): Array<[string[], unknown]> =>
  Object.entries(patch).flatMap(([key, value]) => { const path = [...prefix, key]; return isPlainObject(value) && Object.keys(value).length ? leafEntries(value, path) : [[path, structuredClone(value)]] })
