import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { cjkPdf, lockedPdf, singlePagePdf } from '../tests/browser/nativeReflow.fixture.mjs'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright')
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.pdf': 'application/pdf', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html' }
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost').pathname
  const file = url.startsWith('/plugins/siyuan-sireader/')
    ? resolve('dist', url.slice('/plugins/siyuan-sireader/'.length))
    : url === '/source.pdf' ? resolve('tmp/native-browser/source.pdf') : resolve('tmp/native-browser/build', url === '/' ? 'index.html' : url.slice(1))
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404)
    return res.end()
  }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
  createReadStream(file).pipe(res)
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true })
const page = await browser.newPage({ viewport: { width: 1000, height: 850 } })
const errors = []
page.on('pageerror', error => { errors.push(error.message); console.error(error) })
try {
  await page.goto('http://127.0.0.1:' + server.address().port)
  await page.waitForFunction(() => window.ready.length === 1)
  const nativeFeatures = await page.evaluate(() => {
    const commands = window.registry.get('commands')
    return ['document:open', 'mode:measure'].map(id => commands.resolveCommand(id)?.visible)
  })
  assert.deepEqual(nativeFeatures, [true, true])
  await page.locator('embedpdf-viewer img[src^="blob:"]').first().waitFor()
  const primary = await page.evaluate(() => window.registry.documents.getActiveId())
  await page.evaluate(async () => {
    const viewer = window.registry
    await viewer.commands.execute('sireader:read-only')
    if (!document.querySelector('embedpdf-viewer').readOnly) throw new Error('Viewer did not enter read-only mode')
    await viewer.commands.execute('sireader:read-only')
    const bytes = await (await fetch('/source.pdf')).arrayBuffer()
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([bytes], 'dropped.pdf', { type: 'application/pdf' }))
    document.querySelector('embedpdf-viewer').shadowRoot.querySelector('img[src^="blob:"]')
      .dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, composed: true, cancelable: true }))
  })
  await page.waitForFunction(id => {
    const documents = window.registry.documents
    return documents.getCount() === 2 && documents.getActive()?.status === 'ready' && documents.getActiveId() !== id
  }, primary, { timeout: 7000 })
  await page.evaluate(async id => {
    const viewer = window.registry
    const secondary = viewer.documents.getActiveId()
    if (viewer.get('commands').resolveCommand('sireader:pdf-reflow')?.visible) throw new Error('Book action exposed on auxiliary tab')
    viewer.documents.setActive(id)
    await viewer.documents.close(secondary)
  }, primary)
  await page.evaluate(async () => {
    const viewer = window.registry
    const outline = viewer.get('outline')
    const { item } = await outline.create({
      title: 'Export probe',
      target: { kind: 'goto', destination: { kind: 'xyz', page: viewer.documents.getPage(1).ref, x: 20, y: 100, zoom: 1.5 } },
    })
    outline.activate(item.ref)
  })
  await page.waitForFunction(() => window.registry.get('stage').getZoomLevel() === 1.5)
  const exportData = async command => {
    const pending = page.waitForEvent('download', { timeout: 5000 })
    await page.evaluate(id => window.registry.commands.execute(id), command)
    return readFileSync(await (await pending).path())
  }
  const importData = async (command, name, buffer) => {
    const pending = page.waitForEvent('filechooser')
    await page.evaluate(id => window.registry.commands.execute(id), command)
    await (await pending).setFiles({ name, mimeType: 'application/octet-stream', buffer })
  }
  const bundle = await exportData('sireader:export-annotations')
  assert(bundle.length > 0)
  const layer = await exportData('sireader:export-layer')
  await importData('sireader:import-layer', 'changes.epdf-layer', layer)
  await page.waitForFunction(id => window.registry.documents.getActive()?.status === 'ready' && window.registry.documents.getActiveId() !== id, primary, { timeout: 7000 })
  await page.evaluate(async id => {
    const viewer = window.registry
    const secondary = viewer.documents.getActiveId()
    const outline = viewer.get('outline')
    await outline.ensureLoaded()
    if (!outline.list().some(item => item.title === 'Export probe')) throw new Error('Change layer lost the outline edit')
    viewer.documents.setActive(id)
    await viewer.documents.close(secondary)
  }, primary)
  await page.evaluate(() => window.registry.documents.open({ kind: 'url', url: '/source.pdf?batch=1' }, { name: 'Batch target' }))
  await importData('sireader:import-annotations', 'annotations.json', bundle)
  await page.waitForFunction(() => window.registry.get('annotation').list().some(item => item.nm === 'legacy-highlight'))
  await page.evaluate(async id => {
    const viewer = window.registry
    const secondary = viewer.documents.getActiveId()
    viewer.documents.setActive(id)
    await viewer.documents.close(secondary)
  }, primary)
  const downloaded = page.waitForEvent('download', { timeout: 5000 })
  await page.evaluate(() => window.registry.commands.execute('document:download'))
  assert.match((await downloaded).suggestedFilename(), /\.pdf$/i)
  await page.evaluate(() => {
    const stage = window.registry.get('stage')
    stage.zoomTo({ mode: 'fit-width' })
    stage.goToPage(0, { behavior: 'instant' })
  })
  await page.evaluate(() => window.setQuickDocs([{ id: 'note', name: 'First target' }]))
  await page.waitForFunction(() => window.registry.get('commands').resolveCommand('sireader:send-selection:slot-0')?.label === 'First target')
  await page.evaluate(() => window.setQuickDocs([{ id: 'updated', name: 'Updated target' }]))
  await page.waitForFunction(() => window.registry.get('commands').resolveCommand('sireader:send-selection:slot-0')?.label === 'Updated target')
  await page.evaluate(() => window.setQuickDocs([]))
  const layouts = await page.evaluate(async () => {
    const viewer = window.registry
    const stage = viewer.get('stage')
    await viewer.commands.execute('view:scroll-horizontal')
    const horizontal = stage.getSettings().layout
    await viewer.commands.execute('view:scroll-vertical')
    return [horizontal, stage.getSettings().layout]
  })
  assert.deepEqual(layouts, ['horizontal', 'vertical'])
  const bottom = page.locator('[part~="toolbar-pager"]')
  const main = page.locator('[part~="toolbar-main"]')
  await page.evaluate(() => {
    window.readerActions = []
    for (const event of ['sireader:togglePdfToc', 'sireader:open-quick-notes']) {
      window.addEventListener(event, () => window.readerActions.push(event))
    }
  })
  await bottom.getByRole('button', { name: 'Table of contents', exact: true }).click({ timeout: 3000 })
  await bottom.getByRole('button', { name: 'Notebook', exact: true }).click()
  assert.deepEqual(await page.evaluate(() => window.readerActions), ['sireader:togglePdfToc', 'sireader:open-quick-notes'])
  await bottom.getByRole('button', { name: 'Hide top toolbar', exact: true }).click()
  await main.first().waitFor({ state: 'hidden' })
  await bottom.getByRole('button', { name: 'Show top toolbar', exact: true }).click()
  await main.first().waitFor({ state: 'visible' })
  await page.evaluate(async () => {
    const viewer = window.registry
    const annotation = viewer.get('annotation')
    const highlight = annotation.list()[0]
    const { annotation: redaction } = await annotation.create(0, {
      subtype: 'redact', nm: 'redaction-probe', rect: { x: 190, y: 55, width: 70, height: 15 },
    })
    annotation.selection.select([highlight.ref, redaction.ref])
    await viewer.commands.execute('sireader:delete-redactions')
    if (annotation.list().length !== 2) throw new Error('Redaction shortcut modified a mixed selection')
    annotation.selection.select([redaction.ref])
    await viewer.commands.execute('sireader:delete-redactions')
    if (annotation.list().some(item => item.nm === 'redaction-probe')) throw new Error('Redaction shortcut did not remove the selected redaction')
    annotation.selection.select([highlight.ref])
    await viewer.commands.execute('sireader:translate-annotation')
  })
  await page.locator('.sireader-pdf-translate').waitFor({ state: 'attached', timeout: 3000 })
  await page.locator('.sireader-pdf-translate').evaluate(element => element.parentElement.remove())
  await page.evaluate(() => window.registry.get('annotation').selection.clear())
  const pdfPage = page.locator('embedpdf-viewer img[src^="blob:"]').first()
  await pdfPage.waitFor()
  const bounds = await pdfPage.boundingBox()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(() => navigator.clipboard.writeText('snapshot test'))
  await page.evaluate(() => window.registry.commands.execute('sireader:capture-copy'))
  await page.mouse.move(bounds.x + 120, bounds.y + 100)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 180, bounds.y + 150, { steps: 5 })
  await page.mouse.up()
  await page.waitForFunction(async () => (await navigator.clipboard.read()).some(item => item.types.includes('image/png')), {}, { timeout: 5000 })
  await page.evaluate(() => window.registry.commands.execute('tool:pointer'))
  await page.mouse.move(bounds.x + bounds.width * 60 / 600, bounds.y + bounds.height * 48 / 800)
  await page.getByRole('tooltip').filter({ hasText: 'Existing highlight' }).waitFor({ timeout: 3000 })
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.getByRole('tooltip').filter({ hasText: 'Existing highlight' }).waitFor({ state: 'hidden' })
  await page.evaluate(() => window.registry.get('selection').selectPage(0))
  await page.waitForFunction(() => window.registry.get('selection').listSelectedPages().length > 0)
  await page.evaluate(() => window.registry.commands.execute('sireader:translate-selection'))
  await page.locator('.sireader-pdf-translate').waitFor({ state: 'attached', timeout: 3000 })
  await page.locator('.sireader-pdf-translate').evaluate(element => element.parentElement.remove())
  await page.evaluate(() => window.registry.get('selection').clear())
  const toolDefaults = await page.evaluate(() => {
    const { tools } = window.registry.get('annotation')
    return { square: tools.getDefaults('square'), arrow: tools.getDefaults('arrow'), ink: tools.getDefaults('ink-highlight') }
  })
  assert.equal(toolDefaults.square.color.toLowerCase(), '#ffffff')
  assert.equal(toolDefaults.square.borderStyle, 'dashed')
  assert.deepEqual(toolDefaults.square.dashArray, [6, 2])
  assert.deepEqual(toolDefaults.arrow.lineEndings, { start: 'none', end: 'open-arrow' })
  assert.equal(toolDefaults.ink.strokeWidth, 3)
  await page.locator('embedpdf-viewer').click({ position: { x: 500, y: 330 } })
  await page.evaluate(() => window.registry.get('stage').zoomTo(1))
  await page.keyboard.press('Control+=')
  await page.waitForFunction(() => window.registry.get('stage').getZoomLevel() === 1.25)
  await page.keyboard.press('Control+-')
  await page.waitForFunction(() => window.registry.get('stage').getZoomLevel() === 1)
  const initial = await page.evaluate(async () => {
    const viewer = window.registry
    const stage = viewer.get('stage')
    stage.zoomTo(1)
    await viewer.commands.execute('zoom:in')
    const zoom = stage.getZoomLevel()
    await viewer.commands.execute('zoom:out')
    return { zoom, restored: stage.getZoomLevel(), annotations: viewer.get('annotation').list().map(a => a.nm) }
  })
  assert.deepEqual(initial, { zoom: 1.25, restored: 1, annotations: ['legacy-highlight'] })
  console.log('OPEN AND ZOOM', initial)
  await page.evaluate(async () => {
    const viewer = window.registry
    const annotations = viewer.get('annotation')
    const image = await viewer.get('render').renderPage(0, { width: 30, format: 'png' })
    await annotations.create(0, { subtype: 'stamp', nm: 'stamp', box: { x: 200, y: 50, width: 40, height: 60 } }, { appearance: await image.blob() })
    await annotations.create(0, { subtype: 'ink', nm: 'ink', color: '#000000', inkList: [[{ x: 200, y: 120 }, { x: 220, y: 140 }]] })
    const parent = annotations.list().find(item => item.nm === 'legacy-highlight')
    await annotations.comments.reply(parent.ref, 'Stored reply')
  })
  await page.waitForFunction(() => window.records['original-record'].length >= 4)
  await page.evaluate(() => window.remountReader())
  await page.waitForFunction(() => window.ready.length === 2)
  const restored = await page.evaluate(() => window.registry.get('annotation').list().map(item => ({ name: item.nm, contents: item.contents })))
  assert(restored.some(item => item.name === 'stamp'))
  assert(restored.some(item => item.name === 'ink'))
  assert(restored.some(item => item.contents === 'Stored reply'))
  console.log('PERSISTED STAMP, INK AND REPLY', restored)
  await page.evaluate(() => window.registry.get('stage').goToPage(1, { behavior: 'instant' }))
  await page.waitForFunction(() => window.registry.get('stage').getCurrentPageIndex() === 1)
  await page.getByRole('button', { name: 'Text reflow', exact: true }).click()
  await page.waitForFunction(() => window.ready.length === 3 && window.ready[2].bookUrl.includes('/reflow/'), { timeout: 30000 })
  await page.evaluate(async () => {
    const viewer = window.registry
    viewer.get('selection').selectPage(viewer.get('stage').getCurrentPageIndex())
  })
  await page.waitForFunction(() => {
    const selection = window.registry.get('selection')
    return selection.listSelectedPages().some(page => selection.listSegments(page).length)
  })
  await page.evaluate(() => window.registry.commands.execute('sireader:create-hole'))
  await page.waitForFunction(() => window.writes.some(key => key.includes('/reflow/')) && window.writes.includes('original-record'))
  await page.getByRole('button', { name: 'Text reflow', exact: true }).click()
  await page.waitForFunction(() => window.ready.length === 4 && window.ready[3].storageKey === 'original-record')
  assert.equal(await page.evaluate(() => window.registry.get('stage').getCurrentPageIndex()), 1)
  const records = await page.evaluate(() => window.registry.get('annotation').list().map(item => item.nm))
  assert(records.includes('legacy-highlight'))
  assert(records.length >= 2)
  assert.deepEqual(errors, [])
  console.log('REFLOW ROUND TRIP', records)
  const compact = await browser.newPage({ viewport: { width: 390, height: 760 } })
  await compact.route('**/source.pdf', route => route.fulfill({ contentType: 'application/pdf', body: singlePagePdf }))
  await compact.goto(page.url())
  await compact.waitForFunction(() => window.ready.length === 1 && window.registry.get('stage').getPageCount() === 1)
  const compactBottom = compact.locator('[part~="toolbar-pager"]')
  await compactBottom.getByRole('button', { name: 'Notebook', exact: true }).waitFor({ timeout: 3000 })
  await compactBottom.getByRole('button', { name: 'Hide top toolbar', exact: true }).click()
  await compactBottom.getByRole('button', { name: 'Show top toolbar', exact: true }).click()
  await compact.route('**/source.pdf', route => route.fulfill({ contentType: 'application/pdf', body: lockedPdf }))
  await compact.reload()
  await compact.waitForFunction(() => document.querySelector('embedpdf-viewer')?.viewer?.documents.getActive()?.status === 'locked')
  assert.equal(await compact.evaluate(() => window.ready.length), 0)
  await compact.evaluate(() => {
    const documents = document.querySelector('embedpdf-viewer').viewer.documents
    return documents.unlock(documents.getActiveId(), { password: 'fixture' })
  })
  await compact.waitForFunction(() => window.ready.length === 1)
  await compact.route('**/source.pdf', route => route.fulfill({ contentType: 'application/pdf', body: cjkPdf }))
  await compact.reload()
  await compact.waitForFunction(() => window.ready.length === 1)
  const cjk = await compact.evaluate(async () => {
    const viewer = window.registry
    const selection = viewer.get('selection')
    const page = viewer.documents.getPage(0).ref
    await selection.ensureLoaded(page)
    selection.selectPage(page)
    const image = await viewer.get('render').renderPage(0, { width: 360, format: 'png' })
    return { text: await selection.readText(), rendered: (await image.blob()).size > 0 }
  })
  assert.deepEqual(cjk, { text: '国标规范测试', rendered: true })
} catch (error) {
  console.error(await page.evaluate(() => ({ ready: window.ready, messages: window.messages, diagnostics: window.diagnostics.map(([level, message, detail]) => [level, message, detail?.error?.message, detail?.error?.details]), text: document.body.innerText })))
  throw error
} finally {
  await browser.close()
  server.close()
}
