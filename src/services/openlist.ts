import type { CloudDriveAccount } from '@/composables/useSetting'

export interface OpenListEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  sign?: string
}

export interface OpenListSearchOptions {
  maxDirs?: number
  maxResults?: number
  onProgress?: (message: string) => void
}

const tokens = new Map<string, string>()
const SUPPORTED_EXTS = ['epub', 'pdf', 'mobi', 'azw3', 'azw', 'fb2', 'cbz', 'txt']

export const isSupportedCloudBook = (name = '') => new RegExp(`\\.(${SUPPORTED_EXTS.join('|')})$`, 'i').test(name)

const trimSlashes = (value = '') => value.replace(/^\/+|\/+$/g, '')
const normalizeServer = (server = '') => server.trim().replace(/\/+$/g, '')
const accountKey = (account: CloudDriveAccount) => `${account.id}:${account.server}:${account.pathPrefix}:${account.username}`
const apiBase = (account: CloudDriveAccount) => {
  const prefix = trimSlashes(account.pathPrefix)
  return `${normalizeServer(account.server)}${prefix ? `/${prefix}` : ''}`
}
const joinPath = (dir: string, name: string) => `${dir === '/' ? '' : dir}/${name}`.replace(/\/+/g, '/') || '/'
const encodePath = (path: string) => path.split('/').map(part => encodeURIComponent(part)).join('/')
const decodePath = (path: string) => path.split('/').map(part => decodeURIComponent(part)).join('/')

export const createOpenListBookUrl = (account: CloudDriveAccount, path: string) =>
  `openlist://${encodeURIComponent(account.id)}${encodePath(path.startsWith('/') ? path : `/${path}`)}`

export const parseOpenListBookUrl = (url: string) => {
  const match = url.match(/^openlist:\/\/([^/]+)(\/.*)$/)
  if (!match) return null
  return {
    accountId: decodeURIComponent(match[1]),
    path: decodePath(match[2] || '/'),
  }
}

const request = async (account: CloudDriveAccount, endpoint: string, body: any, token?: string) => {
  const res = await fetch(`${apiBase(account)}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || data?.code !== 200) throw new Error(data?.message || data?.msg || `OpenList HTTP ${res.status}`)
  return data.data
}

export const loginOpenList = async (account: CloudDriveAccount) => {
  const key = accountKey(account)
  if (tokens.has(key)) return tokens.get(key)!
  const data = await request(account, '/api/auth/login', {
    username: account.username,
    password: account.password,
  })
  const token = data?.token
  if (!token) throw new Error('OpenList 登录失败：未返回 token')
  tokens.set(key, token)
  return token
}

export const listOpenListDir = async (account: CloudDriveAccount, path = '/') => {
  const token = await loginOpenList(account)
  const data = await request(account, '/api/fs/list', {
    path,
    password: '',
    page: 1,
    per_page: 0,
    refresh: false,
  }, token)
  return ((data?.content || []) as any[]).map(item => ({
    name: item.name || '',
    path: joinPath(path, item.name || ''),
    isDir: !!item.is_dir,
    size: item.size || 0,
    modified: item.modified || item.updated_at || '',
    sign: item.sign || '',
  })).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'zh-CN')) as OpenListEntry[]
}

export const searchOpenListFiles = async (account: CloudDriveAccount, keywords: string, parent = '/') => {
  const token = await loginOpenList(account)
  const data = await request(account, '/api/fs/search', {
    parent,
    keywords,
    scope: 0,
    page: 1,
    per_page: 100,
    password: '',
  }, token)
  return ((data?.content || data || []) as any[]).map(item => {
    const name = item.name || item.path?.split('/').pop() || ''
    const dir = item.parent || parent
    return {
      name,
      path: item.path || joinPath(dir, name),
      isDir: !!item.is_dir,
      size: item.size || 0,
      modified: item.modified || item.updated_at || '',
      sign: item.sign || '',
    }
  }).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'zh-CN')) as OpenListEntry[]
}

export const deepSearchOpenListFiles = async (account: CloudDriveAccount, keywords: string, parent = '/', options: OpenListSearchOptions = {}) => {
  const needle = keywords.trim().toLowerCase()
  if (!needle) return []
  const maxDirs = options.maxDirs ?? 2000
  const maxResults = options.maxResults ?? 300
  const queue = [parent || '/']
  const results: OpenListEntry[] = []
  const visited = new Set<string>()
  let scanned = 0

  while (queue.length && scanned < maxDirs && results.length < maxResults) {
    const dir = queue.shift() || '/'
    if (visited.has(dir)) continue
    visited.add(dir)
    scanned++
    options.onProgress?.(`搜索中... 已扫描 ${scanned} 个目录`)

    let entries: OpenListEntry[] = []
    try {
      entries = await listOpenListDir(account, dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.toLowerCase().includes(needle)) results.push(entry)
      if (entry.isDir && !visited.has(entry.path)) queue.push(entry.path)
      if (results.length >= maxResults) break
    }
  }

  return results.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, 'zh-CN'))
}

export const getOpenListDownloadUrl = async (account: CloudDriveAccount, path: string) => {
  const token = await loginOpenList(account)
  const data = await request(account, '/api/fs/get', { path, password: '' }, token).catch(() => null)
  if (data?.raw_url) return data.raw_url as string
  const sign = data?.sign ? `?sign=${encodeURIComponent(data.sign)}` : ''
  return `${apiBase(account)}/d${encodePath(path)}${sign}`
}

const withDownloadFlag = (url: string) => url.includes('?') ? `${url}&download=true` : `${url}?download=true`
const getExt = (path: string) => path.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || ''
const isPdfBlob = async (blob: Blob) => (await blob.slice(0, 5).text().catch(() => '')) === '%PDF-'
const isZipBlob = async (blob: Blob) => (await blob.slice(0, 2).text().catch(() => '')) === 'PK'
const validateBookBlob = async (blob: Blob, path: string, url: string) => {
  const ext = getExt(path)
  if (ext === 'pdf' && await isPdfBlob(blob)) return
  if (['epub', 'mobi', 'azw3', 'azw', 'fb2', 'cbz'].includes(ext) && await isZipBlob(blob)) return
  if (ext === 'txt' && blob.size > 0) return
  if (!SUPPORTED_EXTS.includes(ext) && blob.size > 0) return
  const text = await blob.slice(0, 120).text().catch(() => '')
  const hint = text.trim().replace(/\s+/g, ' ').slice(0, 80)
  throw new Error(`OpenList 下载内容不是有效的 ${ext.toUpperCase()} 文件：${hint || url}`)
}

const fetchOpenListBlob = async (urls: string[], token: string, path: string) => {
  let lastError: unknown = null
  for (const url of [...new Set(urls.flatMap(item => [item, withDownloadFlag(item)]))]) {
    for (const init of [{ headers: { Authorization: token } }, undefined] as Array<RequestInit | undefined>) {
      try {
        const res = await fetch(url, init)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        await validateBookBlob(blob, path, url)
        return blob
      } catch (error) {
        lastError = error
      }
    }
  }
  if (lastError instanceof Error) throw lastError
  throw new Error('OpenList 下载失败')
}

const getOpenListDownloadUrls = async (account: CloudDriveAccount, path: string, token: string) => {
  const data = await request(account, '/api/fs/get', { path, password: '' }, token).catch(() => null)
  const sign = data?.sign ? `?sign=${encodeURIComponent(data.sign)}` : ''
  return [
    data?.raw_url || '',
    `${apiBase(account)}/d${encodePath(path)}${sign}`,
  ].filter(Boolean)
}

export const downloadOpenListFile = async (account: CloudDriveAccount, path: string) => {
  const token = await loginOpenList(account)
  const blob = await fetchOpenListBlob(await getOpenListDownloadUrls(account, path, token), token, path)
  const name = decodeURIComponent(path.split('/').pop() || 'book')
  return new File([blob], name, {
    type: blob.type || 'application/octet-stream',
    lastModified: Date.now(),
  })
}

export const clearOpenListToken = (account: CloudDriveAccount) => tokens.delete(accountKey(account))
