import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { expect, test, vi } from 'vitest'

// Execute the actual command bodies without starting PDFium or a browser viewer.
const source = readFileSync('src/components/EmbedPdfReader.vue', 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const names = ['createPdfHoleFromSelection', 'createPdfTranslationAnnotation', 'updateSelectedPdfBlockId']
const ast = ts.createSourceFile('commands.ts', source, ts.ScriptTarget.Latest, true)
const commands = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name.getText(ast)))).map(node => node.getText(ast)).join('\n')
const script = ts.transpileModule(commands, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const setup = () => {
  const rect = { origin: { x: 1, y: 2 }, size: { width: 10, height: 10 } }
  const selection = { getFormattedSelection: () => [{ pageIndex: 0, rect, segmentRects: [rect] }], clear: vi.fn() }
  const scope = { createAnnotation: vi.fn(), updateAnnotation: vi.fn() }
  const context = {
    getCapability: () => ({ forDocument: () => selection }), documentId: 'test',
    activeAnnotationScope: scope, filterPdfSelectionColumns: (items: any[]) => items,
    refreshPdfTooltipAnnotations: vi.fn(), showMessage: vi.fn(), props: { i18n: {} },
  }
  const actions = new Function(...Object.keys(context), `${script}; return { ${names.join(',')} }`)(...Object.values(context))
  return { actions, scope, context }
}

test('hole command creates annotations without calling the removed whole-record saver', async () => {
  const { actions, scope } = setup()
  await actions.createPdfHoleFromSelection({})
  expect(scope.createAnnotation).toHaveBeenCalledTimes(1)
})

test('translation command creates a parent and reply without a save reference error', async () => {
  const { actions, scope, context } = setup()
  await actions.createPdfTranslationAnnotation({}, 'source', 'translation')
  expect(scope.createAnnotation).toHaveBeenCalledTimes(2)
  expect(context.showMessage).toHaveBeenCalledWith('已添加翻译批注', 1200)
})

test('backlink command updates custom data through the annotation API', async () => {
  const { actions, scope } = setup()
  await actions.updateSelectedPdfBlockId({ annotation: { id: 'a', pageIndex: 0, custom: { text: 'keep' } } }, { blockId: 'block' })
  expect(scope.updateAnnotation).toHaveBeenCalledWith(0, 'a', { custom: { text: 'keep', blockId: 'block' } })
})

test('native PDF navigation follows page animation without losing its destination', () => {
  const setupNode = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === 'setupPdfNavigation'))!
  const setupScript = ts.transpileModule(setupNode.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  let behavior = 'instant'
  const setupNavigation = new Function('pdfPageBehavior', `${setupScript}; return setupPdfNavigation`)(() => behavior)
  const scrollToPage = vi.fn()
  const plugin = { scrollToPage, provides: () => ({ scrollToPage: (options: any) => plugin.scrollToPage(options, 'pdf') }) }
  const nativeScope = plugin.provides()
  setupNavigation({ getPlugin: () => plugin })
  const target = { pageNumber: 9, pageCoordinates: { x: 12, y: 34 }, alignY: 25, behavior: 'smooth' }
  nativeScope.scrollToPage(target)
  expect(scrollToPage).toHaveBeenLastCalledWith({ ...target, behavior: 'instant' }, 'pdf')
  behavior = 'smooth'
  nativeScope.scrollToPage(target)
  expect(scrollToPage).toHaveBeenLastCalledWith(target, 'pdf')
  nativeScope.scrollToPage({ ...target, behavior: 'instant' })
  expect(scrollToPage).toHaveBeenLastCalledWith({ ...target, behavior: 'instant' }, 'pdf')
})

