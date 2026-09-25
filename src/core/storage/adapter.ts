export interface StorageAdapter {
  read(key: string): Promise<{ found: boolean, value: unknown }>
  write(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

const STORAGE_ROOT = '/data/storage/petal'

const safeKey = (key: string) => {
  const parts = key.replace(/\\/g, '/').split('/').filter(part => part && part !== '.')
  if (!parts.length || parts.some(part => part === '..')) throw new TypeError(`Invalid storage key: ${key}`)
  return parts.join('/')
}

const plugin = async () => (await import('@/main')).usePlugin() as any
const root = async () => `${STORAGE_ROOT}/${(await plugin()).name}`

const apiError = (value: unknown) => {
  const item = value as Record<string, unknown> | null
  return !!item && typeof item === 'object' && typeof item.code === 'number'
    && item.code !== 0 && 'msg' in item && 'data' in item
}

export const pluginStorageAdapter: StorageAdapter = {
  async read(key) {
    const response = await fetch('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${await root()}/${safeKey(key)}` }),
    })
    if (response.status === 404) return { found: false, value: undefined }
    if (!response.ok) throw new Error(`Storage read failed for ${key}: HTTP ${response.status}`)
    const text = await response.text()
    if (!text) throw new Error(`Storage read returned an empty response for ${key}`)
    let value: unknown
    try { value = JSON.parse(text) }
    catch (error) { throw new SyntaxError(`Malformed storage JSON for ${key}: ${(error as Error).message}`) }
    if (apiError(value)) {
      const error = value as any
      if (error.code === 404 || (error.code === -1 && /not exist|not found|不存在/i.test(`${error.msg}`))) return { found: false, value: undefined }
      throw new Error(`Storage read failed for ${key}: ${error.msg || error.code}`)
    }
    return { found: true, value }
  },

  async write(key, value) {
    const instance = await plugin()
    await instance.saveData(safeKey(key), value)
    if (instance.data) instance.data[key] = value
  },

  async remove(key) {
    const instance = await plugin()
    await instance.removeData(safeKey(key))
    if (instance.data) delete instance.data[key]
  },

  async list(prefix) {
    const normalized = safeKey(prefix)
    const response = await fetch('/api/file/readDir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${await root()}/${normalized}` }),
    })
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`Storage list failed for ${prefix}: HTTP ${response.status}`)
    const payload = await response.json()
    if (apiError(payload)) {
      if ((payload as any).code === 404) return []
      throw new Error(`Storage list failed for ${prefix}: ${(payload as any).msg || (payload as any).code}`)
    }
    const entries = Array.isArray(payload?.data) ? payload.data : []
    return entries.filter((item: any) => !item.isDir && item.name).map((item: any) => `${normalized}/${item.name}`)
  },
}
