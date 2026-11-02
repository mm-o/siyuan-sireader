// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest'
import { getEpubTypographyCSS } from '../src/core/epub/typography'

const settings = (text = {}, paragraph = {}) => ({
  textSettings: { fontSize: 20, letterSpacing: 0.1, ...text },
  paragraphSettings: { lineHeight: 1.8, paragraphSpacing: 1, textIndent: 2, ...paragraph },
}) as any

afterEach(() => { document.head.innerHTML = ''; document.body.innerHTML = '' })

test('book typography survives when overrides are disabled, including old settings', () => {
  document.head.innerHTML = `<style>p{line-height:2.4;text-indent:1em;text-align:center;margin-top:3em}</style><style>${getEpubTypographyCSS(settings())}</style>`
  document.body.innerHTML = '<p>书籍段落</p>'
  const style = getComputedStyle(document.querySelector('p')!)
  expect(style.lineHeight).toBe('2.4')
  expect(style.textIndent).toBe('1em')
  expect(style.textAlign).toBe('center')
  expect(style.marginTop).toBe('3em')
})

test('overrides emit only selected properties on prose selectors', () => {
  const css = getEpubTypographyCSS(settings({ overrideAlignment: true, textAlign: 'left' }, { overrideLineHeight: true }))
  document.head.innerHTML = `<style>p{line-height:2.4;text-indent:1em;text-align:center}h1{line-height:3}pre{line-height:4}</style><style>${css}</style>`
  document.body.innerHTML = '<h1>标题</h1><p>段落</p><pre>代码</pre>'
  const rule = document.styleSheets[1].cssRules[0] as CSSStyleRule
  expect(rule.style.getPropertyValue('line-height')).toBe('1.8')
  expect(rule.style.getPropertyValue('text-indent')).toBe('')
  expect(rule.style.getPropertyValue('text-align')).toBe('left')
  expect(rule.selectorText).not.toContain('h1')
  expect(rule.selectorText).toContain(':not(:has(img,svg,video,pre,code))')
})

test('indent overrides exclude no-indent paragraphs independently of line spacing', () => {
  const css = getEpubTypographyCSS(settings({}, { overrideLineHeight: true, overrideIndent: true }))
  // jsdom cannot evaluate nested :has(); inspect CSSOM to verify the independent rules.
  const style = document.head.appendChild(document.createElement('style'))
  style.textContent = css
  const [spacing, indent] = [...style.sheet!.cssRules] as CSSStyleRule[]
  expect(spacing.style.getPropertyValue('line-height')).toBe('1.8')
  expect(spacing.selectorText).not.toContain('.noindent')
  expect(indent.style.getPropertyValue('text-indent')).toBe('2em')
  expect(indent.selectorText.split(/,(?![^()]*\))/).filter(s => s.startsWith('p:'))[0]).toContain(':not(.noindent)')
})

test('each enabled property emits an important override and alignment is allowlisted', () => {
  const css = getEpubTypographyCSS(settings({ overrideFontSize: true, overrideLetterSpacing: true, overrideAlignment: true, textAlign: 'invalid' }, { overrideLineHeight: true, overrideParagraphSpacing: true, overrideIndent: true }))
  for (const rule of ['font-size:20px!important', 'letter-spacing:0.1em!important', 'line-height:1.8!important', 'margin-block:1em!important', 'text-indent:2em!important', 'text-align:justify!important']) expect(css).toContain(rule)
})

test('inline book styles follow the selected overrides without resetting emphasis', () => {
  const css = getEpubTypographyCSS(settings({ overrideFontSize: true }, { overrideLineHeight: true }))
  const style = document.head.appendChild(document.createElement('style'))
  style.textContent = css
  const inline = [...style.sheet!.cssRules].at(-1) as CSSStyleRule
  expect(inline.selectorText).toContain(':is(span,font,b,strong,i,em,u,a)')
  expect(inline.style.getPropertyValue('font-size')).toBe('inherit')
  expect(inline.style.getPropertyValue('line-height')).toBe('inherit')
  expect(inline.style.getPropertyValue('font-weight')).toBe('')
  expect(inline.style.getPropertyValue('font-style')).toBe('')
})

test('root and legacy font-size overrides share the same switch as prose', () => {
  expect(getEpubTypographyCSS(settings())).toBe('')
  const css = getEpubTypographyCSS(settings({ overrideFontSize: true }))
  document.head.innerHTML = `<style>${css}</style>`
  const root = document.styleSheets[0].cssRules[0] as CSSStyleRule
  expect(root.selectorText).toBe('html,body')
  expect(root.style.getPropertyValue('font-size')).toBe('20px')
  expect(css).toContain('[style*="font-size:16px"]{font-size:1rem!important}')
})
