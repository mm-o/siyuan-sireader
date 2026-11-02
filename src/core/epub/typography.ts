import type { ReaderSettings } from '@/composables/useSetting'

// Keep captions, centered titles, code, and image-only paragraphs independent.
const prose = ['p', 'li', 'dd', 'blockquote', 'div:not(:has(*:not(b,a,em,i,strong,u,span,font)))']
  .map(tag => `${tag}:not(:has(img,svg,video,pre,code)):not([align="center"]):not(.center):not(.aligned-center)`)
const proseSelector = prose.join(',')
const indentSelector = prose.map(selector => `${selector}:not(.noindent):not(.nonindent)`).join(',')
const inlineSelector = prose.map(selector => `${selector} :is(span,font,b,strong,i,em,u,a)`).join(',')

/** Override only the properties the reader explicitly chose; leave book structure intact. */
export function getEpubTypographyCSS(settings: ReaderSettings): string {
  const text = settings.textSettings
  const paragraph = settings.paragraphSettings
  const rules: string[] = []
  if (text.overrideFontSize) rules.push(`font-size:${text.fontSize}px!important`)
  if (text.overrideLetterSpacing) rules.push(`letter-spacing:${text.letterSpacing}em!important`)
  if (paragraph.overrideLineHeight) rules.push(`line-height:${paragraph.lineHeight}!important`)
  if (paragraph.overrideParagraphSpacing) rules.push(`margin-block:${paragraph.paragraphSpacing}em!important`)
  if (text.overrideAlignment) {
    const align = ['left', 'right', 'center', 'justify'].includes(text.textAlign || '') ? text.textAlign : 'justify'
    rules.push(`text-align:${align}!important`)
  }
  const css = rules.length ? `${proseSelector}{${rules.join(';')}}` : ''
  const root = text.overrideFontSize
    ? `html,body{font-size:${text.fontSize}px!important}[style*="font-size: 16px"],[style*="font-size:16px"]{font-size:1rem!important}` : ''
  const indent = paragraph.overrideIndent
    ? `${indentSelector}{text-indent:${paragraph.textIndent}em!important}` : ''
  const inlineRules = [
    text.overrideFontSize && 'font-size:inherit!important',
    text.overrideLetterSpacing && 'letter-spacing:inherit!important',
    paragraph.overrideLineHeight && 'line-height:inherit!important',
  ].filter(Boolean)
  const inline = inlineRules.length
    ? `${inlineSelector}{${inlineRules.join(';')}}` : ''
  return root + css + indent + inline
}
