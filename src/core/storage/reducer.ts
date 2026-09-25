import type { OperationResult, StorageOperation } from './types'
import { compactOperationIds } from './types'

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const itemValue = (item: unknown, key: string) => key.split('.').reduce<unknown>(
  (value, part) => isObject(value) ? value[part] : undefined,
  item,
)

const updateAtPath = (root: unknown, path: string[], update: (value: unknown) => unknown, createParents = false): unknown => {
  if (!path.length) return update(root)
  if (!isObject(root) && !Array.isArray(root)) throw new TypeError(`Invalid operation path: ${path.join('.')}`)
  const [head, ...tail] = path
  if (!(head in root)) {
    if (tail.length && !createParents) throw new TypeError(`Invalid operation path: ${path.join('.')}`)
    if (tail.length) {
      const child = updateAtPath({}, tail, update, true)
      return Array.isArray(root)
        ? Object.assign(root.slice(), { [head]: child })
        : { ...root, [head]: child }
    }
    return Array.isArray(root)
      ? Object.assign(root.slice(), { [head]: update(undefined) })
      : { ...root, [head]: update(undefined) }
  }
  const child = updateAtPath((root as Record<string, unknown>)[head], tail, update, createParents)
  if (Array.isArray(root)) {
    const clone = root.slice()
    ;(clone as unknown as Record<string, unknown>)[head] = child
    return clone
  }
  return { ...root, [head]: child }
}

const applyOperation = (data: unknown, operation: StorageOperation): unknown => {
  switch (operation.type) {
    case 'set':
      return updateAtPath(data, operation.path, () => structuredClone(operation.value))
    case 'patch':
      return updateAtPath(data, operation.path, current => {
        if (current === undefined) return structuredClone(operation.value)
        if (!isObject(current)) throw new TypeError(`Patch target is not an object: ${operation.path.join('.')}`)
        return { ...current, ...structuredClone(operation.value) }
      }, true)
    case 'upsert':
      return updateAtPath(data, operation.path, current => {
        if (!Array.isArray(current)) throw new TypeError(`Upsert target is not an array: ${operation.path.join('.')}`)
        const keyValue = itemValue(operation.value, operation.itemKey)
        if (keyValue === undefined) throw new TypeError(`Upsert value is missing key: ${operation.itemKey}`)
        const index = current.findIndex(item => itemValue(item, operation.itemKey) === keyValue)
        const clone = current.slice()
        const value = structuredClone(operation.value)
        if (index < 0) clone.push(value)
        else clone[index] = value
        return clone
      })
    case 'delete':
      if (operation.itemKey) {
        return updateAtPath(data, operation.path, current => {
          if (!Array.isArray(current)) throw new TypeError(`Delete target is not an array: ${operation.path.join('.')}`)
          return current.filter(item => itemValue(item, operation.itemKey!) !== operation.itemValue)
        })
      }
      if (!operation.path.length) throw new TypeError('Cannot delete the storage root')
      return updateAtPath(data, operation.path.slice(0, -1), current => {
        if (!isObject(current)) throw new TypeError(`Delete parent is not an object: ${operation.path.join('.')}`)
        const clone = { ...current }
        delete clone[operation.path.at(-1)!]
        return clone
      })
    case 'increment':
      return updateAtPath(data, operation.path, current => {
        if (current === undefined) return operation.value
        if (typeof current !== 'number') throw new TypeError(`Increment target is not a number: ${operation.path.join('.')}`)
        return current + operation.value
      }, true)
    case 'max':
      return updateAtPath(data, operation.path, current => {
        if (current === undefined) return operation.value
        if (typeof current !== 'number') throw new TypeError(`Max target is not a number: ${operation.path.join('.')}`)
        return Math.max(current, operation.value)
      }, true)
  }
}

export const applyOperations = <T>(
  source: T,
  operations: StorageOperation[],
  previouslyApplied: string[] = [],
): OperationResult<T> => {
  let data: unknown = source
  const applied = new Set(previouslyApplied)
  const appliedIds = previouslyApplied.slice()
  for (const operation of operations) {
    if (applied.has(operation.id)) continue
    data = applyOperation(data, operation)
    applied.add(operation.id)
    appliedIds.push(operation.id)
  }
  return { data: data as T, appliedOperationIds: compactOperationIds(appliedIds) }
}
