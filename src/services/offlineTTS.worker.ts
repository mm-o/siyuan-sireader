import createWasmModule from '@/libs/sherpa-onnx/sherpa-onnx-wasm'
import { createOfflineTts } from '@/libs/sherpa-onnx/sherpa-onnx-tts'
import type { OfflineTTSModelManifest } from './offlineTTSModels'

type WorkerTTS = { sampleRate: number; generate: (config: { text: string; sid?: number; speed?: number }) => { samples: Float32Array; sampleRate: number }; free: () => void }
type TTSModule = { FS: { writeFile: (path: string, data: Uint8Array) => void; mkdirTree: (path: string) => void }; [key: string]: any }

let inference: WorkerTTS | null = null
let activeModelId = ''
let stage = 'worker-loaded'
let requestQueue = Promise.resolve()
const workerScope = self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void; onmessage: ((event: MessageEvent) => void) | null; addEventListener: (type: string, listener: (event: any) => void) => void }
const report = (error: unknown, request: unknown = {}) => {
  const details = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) }
  console.error('[SiReader Offline TTS] Worker failure', { stage, modelId: activeModelId, request, error: details })
  return details.message
}

workerScope.addEventListener('error', event => {
  console.error('[SiReader Offline TTS] Uncaught worker error', { stage, modelId: activeModelId, message: event.message, filename: event.filename, line: event.lineno, column: event.colno, error: event.error })
})
workerScope.addEventListener('unhandledrejection', event => {
  const message = report(event.reason)
  event.preventDefault()
  workerScope.postMessage({ type: 'fatal', error: `${stage}: ${message}` })
})

const modelRoot = (id: string) => `/public/siyuan-sireader/tts/${id}`
const modelFiles = (manifest: OfflineTTSModelManifest) => {
  const files = manifest.files?.length ? [...manifest.files] : [
    manifest.model,
    manifest.tokens,
    ...(manifest.config ? [manifest.config] : []),
    ...(manifest.voices ? [manifest.voices] : []),
    ...(manifest.lexicon?.split(',') || []),
    ...(manifest.ruleFsts?.split(',') || []),
  ]
  return [...new Set(files.filter(Boolean))]
}
const fetchModelFile = async (manifest: OfflineTTSModelManifest, name: string) => {
  const response = await fetch(`${modelRoot(manifest.id)}/${name.split('/').map(encodeURIComponent).join('/')}`, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`离线模型文件读取失败（HTTP ${response.status}）：${name}`)
  return new Uint8Array(await response.arrayBuffer())
}
const configFor = (manifest: OfflineTTSModelManifest) => {
  const path = (value?: string) => value ? `/${value}` : ''
  const modelConfig = manifest.kind === 'kokoro'
    ? { offlineTtsKokoroModelConfig: { model: path(manifest.model), voices: path(manifest.voices), tokens: path(manifest.tokens), dataDir: path(manifest.dataDir), lexicon: manifest.lexicon?.split(',').map(path).join(','), lang: '' } }
    : { offlineTtsVitsModelConfig: { model: path(manifest.model), tokens: path(manifest.tokens), lexicon: manifest.lexicon?.split(',').map(path).join(','), dataDir: path(manifest.dataDir) } }
  return {
    offlineTtsModelConfig: { ...modelConfig, numThreads: 1, debug: false, provider: 'cpu' },
    ruleFsts: manifest.ruleFsts?.split(',').map(path).join(',') || '',
    maxNumSentences: 1,
  }
}

const initialize = async (manifest: OfflineTTSModelManifest, pluginName: string) => {
  if (activeModelId === manifest.id && inference) return
  activeModelId = manifest.id
  stage = 'initialize:wasm-fetch'
  inference?.free()
  inference = null
  const wasmUrl = '/public/siyuan-sireader/runtime/sherpa-onnx/sherpa-onnx.wasm'
  const wasmResponse = await fetch(wasmUrl, { cache: 'force-cache' })
  if (!wasmResponse.ok) throw new Error(`离线语音引擎加载失败（HTTP ${wasmResponse.status}）`)
  const wasm = await wasmResponse.arrayBuffer()
  if (!wasm.byteLength) throw new Error('离线语音引擎文件为空，请重新安装插件')
  stage = 'initialize:wasm-instance'
  const module = await createWasmModule({ wasmBinary: wasm, locateFile: () => wasmUrl }) as TTSModule
  for (const name of modelFiles(manifest)) {
    stage = `initialize:model-file:${name}`
    const data = await fetchModelFile(manifest, manifest.storagePaths?.[name] || name)
    const path = `/${name}`
    const directory = path.slice(0, path.lastIndexOf('/'))
    if (directory) module.FS.mkdirTree(directory)
    module.FS.writeFile(path, data)
  }
  stage = 'initialize:sherpa-model'
  const created = createOfflineTts(module, configFor(manifest)) as WorkerTTS
  if (!created || !created.sampleRate) throw new Error(`无法初始化离线模型：${manifest.name}`)
  inference = created
  activeModelId = manifest.id
  stage = 'ready'
}

const handle = async (message: any) => {
  const { id, type } = message || {}
  try {
    if (type === 'initialize') {
      await initialize(message.manifest, message.pluginName)
      workerScope.postMessage({ id, result: true })
      return
    }
    if (type === 'synthesize') {
      if (!inference) throw new Error('离线语音模型尚未初始化')
      stage = `synthesize:sid-${message.sid ?? 0}`
      const result = inference.generate({ text: message.text, speed: message.speed, sid: message.sid })
      workerScope.postMessage({ id, result }, [result.samples.buffer as ArrayBuffer])
      stage = 'ready'
      return
    }
    if (type === 'dispose') {
      inference?.free()
      inference = null
      activeModelId = ''
      workerScope.postMessage({ id, result: true })
      return
    }
    throw new Error(`未知的离线语音请求：${type}`)
  } catch (error) {
    const detail = report(error, { id, type })
    workerScope.postMessage({ id, error: `${stage}: ${detail}` })
  }
}

workerScope.onmessage = event => {
  const message = event.data
  requestQueue = requestQueue.then(() => handle(message), () => handle(message))
}
workerScope.postMessage({ type: 'ready' })
