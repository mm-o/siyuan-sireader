import loadBZip2WASM from 'bzip2-wasm/bzip2-1.0.8/bzip2.mjs'
import pluginInfo from '@/../plugin.json'
import { BUILTIN_KOKORO, BUILTIN_XIAO_YA, createPiperImportManifest, isSafeOfflineModelId, modelAssetStoragePath, normalizeModelRelativePath, safeTarFilePath, validateArchiveFiles, validateOfflineModelAssetPath, OFFLINE_MODEL_VOICES, type ImportFileMetadata, type OfflineTTSModelManifest } from './offlineTTSModels'

const ROOT = '/data/public/siyuan-sireader/tts'
const PUBLIC_ROOT = '/public/siyuan-sireader/tts'
import { ensureRuntime, SHERPA_FILES } from '@/services/runtimeAssets'
export const OFFICIAL_TTS_MODELS_URL = 'https://k2-fsa.github.io/sherpa/onnx/tts/all/'
const MANIFEST_FILE = 'sireader-model.json'

class BZip2 {
  private module: any
  async init() { this.module ||= await loadBZip2WASM({ locateFile: (file: string) => file.includes('.wasm') ? new URL('bzip2-wasm/bzip2-1.0.8/bzip2.wasm', import.meta.url).href : file }); return this }
  decompress(compressed: Uint8Array, decompressedLength: number) {
    const m = this.module, source = m._malloc(compressed.length), dest = m._malloc(decompressedLength), length = m._malloc(4)
    m.HEAPU8.set(compressed, source); m.setValue(length, decompressedLength, 'i32')
    const code = m._BZ2_bzBuffToBuffDecompress(dest, length, source, compressed.length, 0, 0)
    const size = m.getValue(length, 'i32'), result = new Uint8Array(m.HEAPU8.subarray(dest, dest + size))
    m._free(source); m._free(dest); m._free(length)
    if (code !== 0) throw new Error(`bzip2 decompression failed (${code})`)
    return result
  }
}

const trimTarName = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/\0.*$/, '').trim()
const octal = (bytes: Uint8Array) => parseInt(trimTarName(bytes).replace(/[^0-7]/g, '') || '0', 8)
export const tarEntries = (tar: Uint8Array) => {
  const files: { name: string; data: Uint8Array }[] = []
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (!header.some(Boolean)) break
    const name = trimTarName(header.subarray(0, 100))
    const prefix = trimTarName(header.subarray(345, 500))
    const size = octal(header.subarray(124, 136))
    const type = header[156]
    if (offset + 512 + size > tar.length) throw new Error('模型压缩包内容不完整')
    const safeName = safeTarFilePath(prefix, name, type)
    if (safeName) files.push({ name: safeName, data: tar.subarray(offset + 512, offset + 512 + size) })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

const readDirectory = async (path: string) => {
  try {
    const result = await (await import('@/api')).readDir(path, true)
    return Array.isArray(result) ? result : []
  } catch { return [] }
}
const managedPath = (id: string) => `${PUBLIC_ROOT}/${id}`
const writeModelManifest = async (manifest: OfflineTTSModelManifest) => {
  const { writeManagedFile } = await import('@/core/storage')
  await writeManagedFile(new Blob([JSON.stringify(manifest)], { type: 'application/json' }), `${managedPath(manifest.id)}/${MANIFEST_FILE}`, MANIFEST_FILE)
}
const storeModelFiles = async (id: string, files: { name: string; data: Uint8Array | Blob }[], onProgress?: (value: number) => void) => {
  const { writeManagedFiles } = await import('@/core/storage')
  const storagePaths: Record<string, string> = {}, runtimePaths = new Map<string, string>()
  const writes = files.map(file => {
    const { runtimePath, path } = modelAssetStoragePath(file.name)
    const blob = file.data instanceof Blob ? file.data : new Blob([file.data.buffer.slice(file.data.byteOffset, file.data.byteOffset + file.data.byteLength) as ArrayBuffer])
    if (path !== runtimePath) storagePaths[runtimePath] = path
    const destination = `${managedPath(id)}/${path}`
    runtimePaths.set(destination, runtimePath)
    return { blob, destination, name: path.split('/').pop() }
  })
  try { await writeManagedFiles(writes, onProgress) }
  catch (error) {
    const failedPath = (error as any)?.path
    throw new Error(`模型文件写入失败（${runtimePaths.get(failedPath) || failedPath || files[0]?.name || id}）：${error instanceof Error ? error.message : String(error)}`)
  }
  return storagePaths
}

const extractAndInstall = async (archive: Uint8Array, manifest: OfflineTTSModelManifest, onProgress: (value: number) => void) => {
  const bz = await new BZip2().init()
  let length = archive.length * 6
  let tar: Uint8Array
  while (true) {
    try { tar = bz.decompress(archive, length); break } catch (error) { if (length > archive.length * 128) throw error; length *= 2 }
  }
  const entries = tarEntries(tar!)
  if (!entries.length) throw new Error('离线语音包中没有可用文件')
  const files = entries.map(file => ({ ...file, name: validateOfflineModelAssetPath(file.name) }))
  validateArchiveFiles(files.map(file => file.name), manifest)
  const installed = { ...manifest, files: files.map(file => file.name), installed: true }
  // Archives from Sherpa have one named root directory. Normalize the model
  // paths against the actual extracted files instead of assuming that root.
  const names = new Set(files.map(file => file.name))
  const fixPath = (path: string) => names.has(path) ? path : [...names].find(name => name.endsWith(`/${path}`)) || path
  installed.model = fixPath(manifest.model)
  installed.tokens = fixPath(manifest.tokens)
  if (installed.voices) installed.voices = fixPath(manifest.voices!)
  if (installed.lexicon) installed.lexicon = installed.lexicon.split(',').map(fixPath).join(',')
  if (installed.dataDir) installed.dataDir = files.some(file => file.name.startsWith(`${installed.dataDir}/`)) ? installed.dataDir : files.find(file => file.name.includes('/espeak-ng-data/'))?.name.split('/espeak-ng-data/')[0] + '/espeak-ng-data'
  try {
    const storagePaths = await storeModelFiles(manifest.id, files)
    await writeModelManifest({ ...installed, ...(Object.keys(storagePaths).length ? { storagePaths } : {}) })
  } catch (error) {
    await new OfflineTTSManager().remove(manifest.id).catch(() => {})
    throw error
  }
  onProgress(100)
  return files.length
}

export class OfflineTTSManager {
  async list() {
    const entries = await readDirectory(ROOT)
    const ids = new Set([BUILTIN_XIAO_YA.id, BUILTIN_KOKORO.id, ...entries.map(entry => entry?.name).filter((name): name is string => typeof name === 'string' && isSafeOfflineModelId(name))])
    const manifests: OfflineTTSModelManifest[] = []
    for (const id of ids) {
      if (!await this.hasDirectory(id)) continue
      const response = await fetch(`${managedPath(id)}/${MANIFEST_FILE}`, { cache: 'no-store' }).catch(() => null)
      if (response?.ok) {
        try {
          const manifest = await response.json()
          if (manifest.id === id && (manifest.kind === 'piper-vits' || manifest.kind === 'kokoro')) manifests.push({ ...manifest, installed: true })
        } catch {}
      } else if (id === BUILTIN_XIAO_YA.id && await this.hasRequiredFiles(BUILTIN_XIAO_YA)) manifests.push({ ...BUILTIN_XIAO_YA, installed: true })
    }
    return [
      { ...BUILTIN_XIAO_YA, installed: manifests.some(item => item.id === BUILTIN_XIAO_YA.id) },
      { ...BUILTIN_KOKORO, installed: manifests.some(item => item.id === BUILTIN_KOKORO.id) },
      ...manifests.filter(item => ![BUILTIN_XIAO_YA.id, BUILTIN_KOKORO.id].includes(item.id)),
    ]
  }

  private async hasDirectory(id: string) { return (await readDirectory(`${ROOT}/${id}`)).length > 0 }
  private async hasRequiredFiles(manifest: OfflineTTSModelManifest) {
    const entries = await readDirectory(`${ROOT}/${manifest.id}`)
    const names = new Set(entries.map(entry => entry?.name))
    return names.has(manifest.model) && names.has(manifest.tokens)
  }
  async installed() { return (await this.list()).some(model => model.id === BUILTIN_XIAO_YA.id && model.installed) }
  async importKokoroArchive(file: File, onProgress: (value: number) => void = () => {}) {
    if (!/\.tar\.bz2$/i.test(file.name)) throw new Error('请选择 Kokoro 官方 .tar.bz2 压缩包')
    if (await this.hasDirectory(BUILTIN_KOKORO.id)) throw new Error('Kokoro 模型目录已存在，请先在设置中删除已有模型')
    return extractAndInstall(new Uint8Array(await file.arrayBuffer()), BUILTIN_KOKORO, onProgress)
  }
  async importPiper(files: FileList | File[], onProgress: (value: number) => void = () => {}) {
    const selected = Array.from(files)
    const metadata: ImportFileMetadata[] = await Promise.all(selected.map(async file => ({
      name: file.name,
      relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      text: /\.onnx\.json$/i.test(file.name) ? await file.text() : undefined,
    })))
    const manifest = createPiperImportManifest(metadata)
    if (await this.hasDirectory(manifest.id)) throw new Error(`模型“${manifest.name}”已存在，请先删除或重命名来源文件夹`)
    try {
      const storagePaths = await storeModelFiles(manifest.id, selected.map((file, index) => ({ name: normalizeModelRelativePath(metadata[index].relativePath), data: file })), onProgress)
      await writeModelManifest({ ...manifest, installed: true, ...(Object.keys(storagePaths).length ? { storagePaths } : {}) })
    } catch (error) {
      await this.remove(manifest.id).catch(() => {})
      throw error
    }
    return manifest
  }
  async remove(id: string) {
    if (!isSafeOfflineModelId(id)) throw new Error('模型 ID 无效')
    await disposeOfflineTTS()
    const { removeFile } = await import('@/api')
    const root = `${ROOT}/${id}`
    if (!await this.hasDirectory(id)) return
    const removeNested = async (path: string) => {
      for (const entry of await readDirectory(path)) {
        const name = String(entry?.name || '')
        if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) continue
        const child = `${path}/${name}`
        if (entry.isDir) await removeNested(child)
        else await removeFile(child)
      }
      await removeFile(path)
    }
    await removeNested(root)
  }
  voices(manifest: OfflineTTSModelManifest) { return OFFLINE_MODEL_VOICES(manifest) }
  async getManifest(id: string): Promise<OfflineTTSModelManifest> {
    if (!isSafeOfflineModelId(id)) throw new Error('模型 ID 无效')
    if (id === BUILTIN_XIAO_YA.id || id === BUILTIN_KOKORO.id) {
      const response = await fetch(`${managedPath(id)}/${MANIFEST_FILE}`, { cache: 'no-store' }).catch(() => null)
      if (!response?.ok) {
        const installed = (await this.list()).some(item => item.id === id && item.installed)
        return { ...(id === BUILTIN_XIAO_YA.id ? BUILTIN_XIAO_YA : BUILTIN_KOKORO), installed }
      }
      return { ...await response.json(), installed: true }
    }
    const response = await fetch(`${managedPath(id)}/${MANIFEST_FILE}`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`无法读取离线模型配置：${id}`)
    const manifest = await response.json()
    if (manifest.id !== id) throw new Error('离线模型配置 ID 不匹配')
    return { ...manifest, installed: true }
  }
}

export type OfflineAudio = { samples: Float32Array; sampleRate: number }
type PendingRequest = { type: string; resolve: (value: any) => void; reject: (error: Error) => void }
let worker: Worker | null = null
let requestId = 0
let activeManifestId = ''
const pending = new Map<number, PendingRequest>()
const failWorker = (error: Error) => {
  for (const request of pending.values()) request.reject(error)
  pending.clear()
  worker?.terminate()
  worker = null
  activeManifestId = ''
}
const inspectWorkerResponse = async (url: string) => {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    const content = await response.clone().text()
    console.error('[SiReader Offline TTS] Worker script response', { url, status: response.status, contentType: response.headers.get('content-type'), contentLength: response.headers.get('content-length'), preview: content.slice(0, 240) })
  } catch (error) {
    console.error('[SiReader Offline TTS] Worker script diagnostic fetch failed', { url, error })
  }
}
const getWorker = () => {
  if (worker) return worker
  const url = `/plugins/${pluginInfo.name}/offlineTTS.worker.js`
  console.info('[SiReader Offline TTS] Starting worker', { url, modelId: activeManifestId || undefined })
  worker = new Worker(url, { name: 'sireader-offline-tts' })
  worker.onmessage = (event: MessageEvent) => {
    const { id, result, error, type } = event.data || {}
    if (type === 'ready') {
      console.info('[SiReader Offline TTS] Worker script started', { url })
      return
    }
    if (type === 'fatal') {
      const failure = new Error(`离线语音工作线程异常：${error || 'Worker fatal error'}`)
      console.error('[SiReader Offline TTS] Worker reported fatal error', { modelId: activeManifestId, error })
      failWorker(failure)
      return
    }
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    if (error) {
      console.error('[SiReader Offline TTS] Worker request failed', { id, type: request.type, modelId: activeManifestId, error })
      request.reject(new Error(error))
    } else request.resolve(result)
  }
  worker.onerror = event => {
    const workerError = event.error instanceof Error ? event.error : null
    const details = [event.message, workerError?.stack, event.filename && `${event.filename}:${event.lineno || 0}:${event.colno || 0}`].filter(Boolean).join(' ')
    const error = new Error(details ? `离线语音工作线程异常：${details}` : '离线语音工作线程异常')
    console.error('[SiReader Offline TTS] Worker crashed', { modelId: activeManifestId, message: event.message, filename: event.filename, line: event.lineno, column: event.colno, error: event.error, pending: [...pending].map(([id, request]) => ({ id, type: request.type })) })
    event.preventDefault()
    void inspectWorkerResponse(url)
    failWorker(error)
  }
  return worker
}
const requestWorker = <T>(type: string, data: Record<string, unknown> = {}) => new Promise<T>((resolve, reject) => {
  const id = ++requestId
  pending.set(id, { type, resolve, reject })
  try { getWorker().postMessage({ id, type, ...data }) }
  catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    console.error('[SiReader Offline TTS] Worker request dispatch failed', { id, type, modelId: activeManifestId, error: failure })
    pending.delete(id)
    reject(failure)
  }
})

export const initializeOfflineTTS = async (manifest: OfflineTTSModelManifest) => {
  await ensureRuntime('sherpa-onnx', SHERPA_FILES)
  await requestWorker<void>('initialize', { manifest, pluginName: pluginInfo.name })
  activeManifestId = manifest.id
}
export const synthesizeOfflineTTS = async (manifest: OfflineTTSModelManifest, text: string, speed = 1, sid = 0) => {
  if (!text.trim()) throw new Error('没有可朗读的文本')
  if (activeManifestId !== manifest.id) {
    await initializeOfflineTTS(manifest)
  }
  return requestWorker<OfflineAudio>('synthesize', { text, speed, sid })
}
export const disposeOfflineTTS = async () => {
  activeManifestId = ''
  if (!worker) return
  await requestWorker<void>('dispose').catch(() => {})
  worker?.terminate()
  worker = null
}
