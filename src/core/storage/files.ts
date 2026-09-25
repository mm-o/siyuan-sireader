import { putFile, removeFile, renameFile } from '@/api'
import { walCoordinator } from './wal'
const verifyPath = (path: string) => {
  const normalized = path.replace(/\\/g, '/')
  if (!normalized.startsWith('/data/public/')) throw new Error(`Managed file is outside public data: ${path}`)
  return normalized.slice('/data'.length)
}
export const verifyManagedFileSize = async (path: string, expected: number) => {
  const response = await fetch(verifyPath(path), { method: 'HEAD', cache: 'no-store' })
  if (!response.ok) throw new Error(`Managed file verification failed: HTTP ${response.status}`)
  const header = response.headers.get('content-length')
  const actual = header == null || header.trim() === '' ? Number.NaN : Number(header)
  if (!Number.isFinite(actual) || actual !== expected) throw new Error(`Managed file size mismatch: expected ${expected}, got ${header || 'unknown'}`)
}

const TRANSACTION_ROOT = '/data/public/siyuan-sireader/.transactions'
const publicDataPath = (path: string) => path.startsWith('/public/') ? `/data${path}` : path
const basename = (path: string) => path.replace(/\\/g, '/').split('/').pop() || 'file'
const transactionId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
const fileQueues = new Map<string, Promise<unknown>>()

const withFileLock = <T>(path: string, task: () => Promise<T>): Promise<T> => {
  const previous = fileQueues.get(path) || Promise.resolve()
  const current = previous.catch(() => undefined).then(() => {
    const locks = globalThis.navigator?.locks
    return locks?.request
      ? locks.request(`sireader:file:${path}`, task) as unknown as Promise<T>
      : task()
  })
  const tracked = current.finally(() => { if (fileQueues.get(path) === tracked) fileQueues.delete(path) })
  fileQueues.set(path, tracked)
  return tracked
}

const fileExists = async (path: string) => {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '')
  const slash = normalized.lastIndexOf('/')
  const parent = normalized.slice(0, slash) || '/'
  const name = normalized.slice(slash + 1)
  const response = await fetch('/api/file/readDir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: parent }),
  })
  if (!response.ok) throw new Error(`Managed file existence check failed: HTTP ${response.status}`)
  const payload = await response.json()
  if (payload?.code === 404) return false
  if (typeof payload?.code === 'number' && payload.code !== 0) throw new Error(payload.msg || `Managed file existence check failed (${payload.code})`)
  return Array.isArray(payload?.data) && payload.data.some((entry: any) => entry?.name === name)
}

walCoordinator
  .register('file:rename', async payload => {
    const { from, to, allowMissing } = payload as { from: string, to: string, allowMissing?: boolean }
    if (!await fileExists(from)) {
      if (await fileExists(to) || allowMissing) return
      throw new Error(`Transactional source is missing: ${from}`)
    }
    if (await fileExists(to)) return
    await renameFile(from, to)
  })
  .register('file:remove', async payload => {
    const path = (payload as { path: string }).path
    if (await fileExists(path)) await removeFile(path)
  })

export const writeManagedFile = (blob: Blob, destination: string, name = basename(destination)) => withFileLock(publicDataPath(destination), async () => {
  const tx = transactionId()
  const staged = `${TRANSACTION_ROOT}/${tx}/${name}`
  const destinationPath = publicDataPath(destination)
  const backup = `${TRANSACTION_ROOT}/${tx}/previous-${name}`
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
  await putFile(`${TRANSACTION_ROOT}/${tx}`, true, new File([], ''))
  await putFile(staged, false, file)
  await verifyManagedFileSize(staged, blob.size)
  await walCoordinator.runAtomic('managed-file-write', [
    { id: 'backup', kind: 'file:rename', payload: { from: destinationPath, to: backup, allowMissing: true } },
    { id: 'publish', kind: 'file:rename', payload: { from: staged, to: destinationPath } },
    { id: 'cleanup', kind: 'file:remove', payload: { path: `${TRANSACTION_ROOT}/${tx}` } },
  ])
  return destination
})

export const removeManagedFileTransactionally = (path: string) => withFileLock(publicDataPath(path), async () => {
  const source = publicDataPath(path)
  const tx = transactionId()
  const staged = `${TRANSACTION_ROOT}/${tx}/${basename(source)}`
  await putFile(`${TRANSACTION_ROOT}/${tx}`, true, new File([], ''))
  await walCoordinator.runAtomic('managed-file-remove', [
    { id: 'stage-delete', kind: 'file:rename', payload: { from: source, to: staged, allowMissing: true } },
    { id: 'remove-staged', kind: 'file:remove', payload: { path: `${TRANSACTION_ROOT}/${tx}` } },
  ])
})
