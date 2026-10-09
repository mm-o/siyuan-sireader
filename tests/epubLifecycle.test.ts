import { readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import ts from 'typescript'

afterEach(() => vi.unstubAllGlobals())

test('resize delivery is deferred, coalesced, size-aware, and cancelled on disconnect', async () => {
  let deliver!: (entries: any[]) => void
  const frames = new Map<number, Function>()
  let id = 0
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class { constructor(callback: any) { deliver = callback } disconnect = disconnect })
  vi.stubGlobal('requestAnimationFrame', (callback: Function) => { frames.set(++id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  const { observeResize } = await import('../node_modules/foliate-js/resize-observer.js')
  const update = vi.fn()
  const observer = observeResize(update)
  const target = { isConnected: true }
  const entry = (width: number) => [{ target, contentRect: { width, height: 100 } }]
  deliver(entry(100)); deliver(entry(200))
  expect(update).not.toHaveBeenCalled()
  expect(frames.size).toBe(1)
  const run = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()) }
  run()
  expect(update).toHaveBeenCalledTimes(1)
  deliver(entry(200)); run()
  expect(update).toHaveBeenCalledTimes(1)
  deliver(entry(300)); observer.disconnect(); run()
  expect(disconnect).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledTimes(1)
  deliver(entry(400)); run()
  expect(update).toHaveBeenCalledTimes(1)
})
test('paginator disconnects every observed target when destroyed', () => {
  const source = readFileSync('node_modules/foliate-js/paginator.js', 'utf8')
  expect(source).not.toContain('this.#observer.unobserve(this)')
  expect(source).toContain('this.#observer.disconnect()')
})

test('reader stops layout and settings listeners before awaiting persistence', async () => {
  const source = readFileSync('src/core/epub/reader.ts', 'utf8')
  const ast = ts.createSourceFile('reader.ts', source, ts.ScriptTarget.Latest, true)
  const reader = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'FoliateReader') as ts.ClassDeclaration
  const method = reader.members.find(node => node.name?.getText(ast) === 'destroy')!.getText(ast)
  const script = ts.transpileModule(`const lifecycle = { ${method} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const destroy = new Function('diagnosticLog', 'readText', `${script}; return lifecycle.destroy`)(vi.fn(), (value: any) => value)
  const removeEventListener = vi.fn()
  vi.stubGlobal('window', { removeEventListener })
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const context = { destroyed: false, onSettingsChanged: vi.fn(), themeObserver: { disconnect: vi.fn() }, eventListeners: new Map(), clockTimer: null,
    marks: { destroy: () => pending }, view: { close: vi.fn(), remove: vi.fn(), book: { destroy: vi.fn() } } }
  const closing = destroy.call(context)
  expect(context.view.close).toHaveBeenCalledTimes(1)
  expect(removeEventListener).toHaveBeenCalledWith('sireaderSettingsUpdated', context.onSettingsChanged)
  release()
  await closing
  await destroy.call(context)
  expect(context.view.close).toHaveBeenCalledTimes(1)
  expect(context.view.remove).toHaveBeenCalledTimes(1)
})

test('mark deletion cleans the reader before waiting for block synchronization', () => {
  const source = readFileSync('src/core/MarkManager.ts', 'utf8')
  const method = source.match(/async deleteMark\(idOrKey:string\|any\):Promise<boolean>\{([\s\S]*?)\n  \}\r?\n\s*async addBookmark/)?.[1]
  expect(method).toBeTruthy()
  expect(method).toContain('void this.queueAutoSyncDelete(m)')
  expect(method).not.toContain('await this.queueAutoSyncDelete(m)')
  expect(method!.indexOf('cleanTooltips(m.id)')).toBeLessThan(method!.indexOf('void this.queueAutoSyncDelete(m)'))
})

test('epub toc reopens the current chapter ancestors', () => {
  const source = readFileSync('src/components/ReaderToc.vue', 'utf8')
  expect(source).toContain('hasCurrentDescendant(item.subitems, href) && next[key] !== true')
})

test('epub reader exposes a bottom percentage jump control', () => {
  const source = readFileSync('src/components/Reader.vue', 'utf8')
  expect(source).toContain('reader-progress-jump')
  expect(source).toContain('submitProgressJump')
})

test('EPUB font settings match Readest without flattening book typography', () => {
  const reader = readFileSync('src/core/epub/reader.ts', 'utf8')
  const settings = readFileSync('src/composables/useSetting.ts', 'utf8')
  const ui = readFileSync('src/components/Settings.vue', 'utf8')
  expect(settings).toContain('overrideFont?: boolean')
  expect(ui).toContain("key:'overrideFont'")
  expect(reader).toContain("${overrideFont ? 'font-family:revert!important' : ''}")
  expect(reader).toContain('[style*="font-size: 16px"],[style*="font-size:16px"]{font-size:1rem!important}')
  expect(reader).not.toContain('font-size:inherit!important')
})
test('EPUB footer metrics are individually controlled by layout settings', () => {
  const settings = readFileSync('src/composables/useSetting.ts', 'utf8')
  const reader = readFileSync('src/components/Reader.vue', 'utf8')
  const zh = JSON.parse(readFileSync('src/i18n/zh_CN.json', 'utf8'))
  const en = JSON.parse(readFileSync('src/i18n/en_US.json', 'utf8'))
  for (const key of ['showRemainingTime', 'showCurrentBatteryStatus']) {
    expect(settings).toMatch(new RegExp(`c\\('${key}'\\)`))
    expect(settings).toMatch(new RegExp(`${key}:\\s*boolean`))
    expect(reader).toContain(`layout?.${key}`)
    expect(settings).toMatch(new RegExp(`${key}:\\s*false`))
    expect(typeof zh[key]).toBe('string')
    expect(typeof en[key]).toBe('string')
  }
})
