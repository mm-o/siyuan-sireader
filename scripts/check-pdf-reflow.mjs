// Run after pnpm build: node scripts/check-pdf-reflow.mjs /absolute/path/book.pdf
import { Worker } from 'node:worker_threads'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import * as mupdf from 'mupdf'

if (!process.argv[2]) throw new Error('Pass a local PDF path')
const bytes = await readFile(process.argv[2])
const output = process.argv[3] === '--output' ? process.argv[4] : undefined
const document = mupdf.Document.openDocument(bytes, 'application/pdf')
const sizes = Array.from({ length: document.countPages() }, (_, n) => {
  const page = document.loadPage(n), box = page.getBounds()
  page.destroy()
  return { width: box[2] - box[0], height: box[3] - box[1] }
})
document.destroy()
const worker = new Worker(`
  const { parentPort } = require('node:worker_threads');
  globalThis.self = globalThis;
  globalThis.postMessage = data => parentPort.postMessage(data);
  const ready = import(${JSON.stringify(pathToFileURL(resolve('dist/pdfReflow.worker.js')).href)});
  parentPort.on('message', async data => { await ready; globalThis.onmessage({data}); });
`, { eval: true })
let sequence = 0
const pending = new Map()
worker.on('message', data => {
  const entry = pending.get(data.id)
  if (!entry) return
  pending.delete(data.id)
  if (data.error) entry.reject(new Error(data.error)); else entry.resolve(data.result)
})
worker.on('error', error => { for (const entry of pending.values()) entry.reject(error); pending.clear() })
const request = (command, payload) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject }); worker.postMessage({ id, command, payload })
})
try {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  await request('open', { buffer, sizes, engineUrl: pathToFileURL(resolve('dist/mupdf/mupdf.js')).href })
  if (output) await request('layout-begin', { width: 360, height: 600, fontSize: 18 })
  for (let index = 0; index < sizes.length; index++) {
    const page = await request('page', { index })
    if (output) {
      if (page.needsOCR) throw new Error('This page needs SiYuan OCR; run conversion in the plugin with SiYuan active')
      await request('layout-page', page)
    }
    console.log(JSON.stringify({ page: index + 1, blocks: page.blocks.length, characters: page.blocks.reduce((n, b) => n + b.text.length, 0), furniture: page.blocks.filter(b => ['header', 'footer', 'pagenum', 'linenum'].includes(b.role)).length, needsOCR: page.needsOCR }))
  }
  if (output) {
    const result = await request('layout-finish', {})
    await writeFile(output, new Uint8Array(result.buffer))
    console.log(JSON.stringify({ output, outputPages: result.pageMap.length, sourcePages: sizes.length }))
  }
} finally { await worker.terminate() }
