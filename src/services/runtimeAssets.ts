import { putFile, readDir } from '@/api'
import { diagnosticLog } from '@/core/diagnostics'
import pluginInfo from '../../plugin.json'

/**
 * 大体积运行时（wasm 引擎）不随插件包分发：
 * 首次用到时下载到 public 目录（用户数据，升级插件不丢），之后直接本地加载。
 * 下载源：同名的平铺文件（mupdf.js / mupdf-wasm.js / mupdf-wasm.wasm / sherpa-onnx.wasm）。
 */
const DOWNLOAD_BASE = 'https://github.com/mm-o/siyuan-sireader/releases/download/runtime-v1'
const RUNTIME_ROOT = '/data/public/siyuan-sireader/runtime'
const PLUGIN_ROOT = `/plugins/${pluginInfo.name}`

const tasks = new Map<string, Promise<void>>()

// 只在运行时提示，避免模块顶层依赖 siyuan（测试/无 UI 环境也能加载）
const notify = (message: string, type: 'info' | 'error') => {
  void import('siyuan').then(({ showMessage }) => showMessage(message, type === 'error' ? 4000 : 2600, type)).catch(() => {})
}

// 用 readDir 查文件名：getFile 对二进制返回原始字节（不是 JSON），不能用来判断存在性
const exists = async (name: string, file: string) => {
  try {
    const result: any = await readDir(`${RUNTIME_ROOT}/${name}`)
    const entries = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []
    return entries.some((item: any) => String(item?.name || '') === file)
  } catch {
    return false
  }
}

/** 运行时文件在浏览器里可用的 URL。 */
export const runtimeUrl = (name: string, file: string) => `/public/siyuan-sireader/runtime/${name}/${file}`

/** 运行时文件需要手动放置时，展示给用户的绝对路径。 */
export const runtimeHint = (name: string, file: string) => `${RUNTIME_ROOT}/${name}/${file}`

const base = () => String((globalThis as any).__sireaderRuntimeBase || DOWNLOAD_BASE).replace(/\/$/, '')

// 旧版本的插件目录里可能还留着这些文件，能直接用就不必下载
const localSources = (name: string, file: string) => [`${PLUGIN_ROOT}/${name}/${file}`, `${base()}/${file}`]

const fetchRuntime = async (name: string, file: string) => {
  for (const source of localSources(name, file)) {
    try {
      const response = await fetch(source)
      if (!response.ok) continue
      const blob = await response.blob()
      if (blob.size) return { blob, source }
    } catch { /* 下一个来源 */ }
  }
  return null
}

export const ensureRuntime = (name: string, files: string[]) => {
  // 非浏览器环境（单测/无 location）不做下载：相对 URL 无法解析，这里也不该有副作用
  if (typeof location === 'undefined') return Promise.resolve()
  const running = tasks.get(name)
  if (running) return running
  const task = (async () => {
    let announced = false
    for (const file of files) {
      if (await exists(name, file)) continue
      if (!announced) {
        announced = true
        notify(`首次使用需要下载运行时组件（${name}），请稍候…`, 'info')
      }
      const found = await fetchRuntime(name, file)
      if (!found) {
        throw new Error(`缺少运行时组件 ${name}/${file}：请把它放到 ${runtimeHint(name, file)}`)
      }
      try {
        await putFile(`${RUNTIME_ROOT}/${name}/${file}`, false, new File([found.blob], file))
      } catch (error: any) {
        // 思源在插件重载时会返回 410 Plugin lifecycle has ended
        const text = String(error?.msg || error?.message || error)
        if (text.includes('lifecycle') || error?.code === 410) throw new Error('插件正在重载，请稍后重试该操作')
        throw new Error(`写入 ${runtimeHint(name, file)} 失败：${text}`)
      }
      diagnosticLog('info', 'runtime.download.done', { name, file, bytes: found.blob.size, source: found.source })
    }
  })().catch(error => {
    const message = String(error?.message || error)
    diagnosticLog('error', 'runtime.ensure.failed', { name, message })
    notify(message, 'error')
  }).finally(() => { tasks.delete(name) })
  tasks.set(name, task)
  return task
}

export const MUPDF_FILES = ['mupdf.js', 'mupdf-wasm.js', 'mupdf-wasm.wasm']
export const SHERPA_FILES = ['sherpa-onnx.wasm']
