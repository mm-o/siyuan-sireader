#!/usr/bin/env node
/**
 * 思阅文档生成器：把源码里的结构化事实渲染成文档页，避免设置项/权益/快捷键/更新日志失同步。
 *
 * 输入（唯一真实来源，都在本仓库）：
 *   src/composables/useSetting.ts  UI_CONFIG / DEFAULT_NAV_ITEMS / NOTE_MODE_LABELS / LINK_FORMAT_PRESETS / NOTE_TARGET_OPTIONS
 *   src/core/license.ts            PAID_FEATURES
 *   src/utils/keyboard.ts          PDF_SHORTCUT_COMMANDS
 *   src/index.ts                   addHotkeys 命令表
 *   src/i18n/zh_CN.json            中文界面文案
 *   CHANGELOG.md                   版本变更
 *
 * 输出（提交到仓库，但禁止手改）：
 *   docs/site/sireader/settings-reference.mdx
 *   docs/site/sireader/membership-matrix.mdx
 *   docs/site/sireader/shortcuts.mdx
 *   docs/site/changelog/sireader.mdx
 *
 * 用法：node scripts/docs-gen.mjs [--check]
 *   --check  只比对不写盘，有差异时退出码 1（供 CI / 发版门禁使用）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')

const read = relative => readFileSync(join(root, relative), 'utf8')
const i18n = JSON.parse(read('src/i18n/zh_CN.json'))
const pkg = JSON.parse(read('package.json'))

const t = (key, fallback = '') => (key && i18n[key]) || fallback || key || ''
const header = '> 本页由脚本自动生成，请勿手改。修改来源：`src/composables/useSetting.ts`、`src/core/license.ts`、`src/utils/keyboard.ts` 或 `CHANGELOG.md`；改完运行 `pnpm docs:gen`。'

/** 从 TS 源码里取出一个字面量（对象或数组），支持字符串与注释，忽略括号内的嵌套。 */
function extractLiteral(source, marker) {
  const start = source.indexOf(marker)
  if (start < 0) throw new Error(`找不到标记：${marker}`)
  // 类型标注里可能出现 `[]`（如 NavItem[]）或 `[number]`（如 Record<..., string>），
  // 所以只把“前面是赋值号”的 `{` 或 `[` 当作字面量起点，并排除箭头函数与比较运算符。
  let from = -1
  for (let i = start + marker.length; i < source.length; i++) {
    if (source[i] !== '{' && source[i] !== '[') continue
    let j = i - 1
    while (j > start && /\s/.test(source[j])) j--
    if (source[j] !== '=') continue
    if ('=!<>'.includes(source[j - 1] || '')) continue
    if (source[i + 1] === '>') continue
    from = i
    break
  }
  if (from < 0) throw new Error(`标记后没有找到赋值字面量：${marker}`)
  const openChar = source[from]
  const closeChar = openChar === '{' ? '}' : ']'
  let depth = 0
  let quote = null
  for (let i = from; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; continue }
    if (ch === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i++; continue }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++
      i++
      continue
    }
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return source.slice(from, i + 1)
    }
  }
  throw new Error(`字面量括号不配对：${marker}`)
}

/** 字面量里可能有 `as const`，去掉后交给 Function 求值（内容只含对象/数组/字符串/数字）。 */
function evalLiteral(text, prelude = '') {
  const body = text.replace(/\s+as const/g, '')
  // eslint-disable-next-line no-new-func
  return new Function(`${prelude}\nreturn (${body})`)()
}

const rangeHelpers = [
  'const r = (key, min, max, step, unit = \'\') => ({ key, type: \'range\', min, max, step, unit })',
  'const c = key => ({ key, type: \'checkbox\' })',
].join('\n')

const useSetting = read('src/composables/useSetting.ts')
const ui = evalLiteral(extractLiteral(useSetting, 'export const UI_CONFIG ='), rangeHelpers)
const navItems = evalLiteral(extractLiteral(useSetting, 'export const DEFAULT_NAV_ITEMS'))
const noteModeLabels = evalLiteral(extractLiteral(useSetting, 'export const NOTE_MODE_LABELS'))
const noteTargets = evalLiteral(extractLiteral(useSetting, 'export const NOTE_TARGET_OPTIONS'))
const linkPresets = evalLiteral(extractLiteral(useSetting, 'export const LINK_FORMAT_PRESETS'))

const paidFeatures = evalLiteral(extractLiteral(read('src/core/license.ts'), 'const PAID_FEATURES'))
const pdfCommands = evalLiteral(extractLiteral(read('src/utils/keyboard.ts'), 'export const PDF_SHORTCUT_COMMANDS'))
const hotkeyCommands = evalLiteral(
  extractLiteral(read('src/index.ts'), 'const cmds ='),
  'const noop = () => {}',
)

/* ============================ 设置参考 ============================ */

const typeText = item => {
  if (item.type === 'range') return `${item.min}–${item.max}${item.unit || ''}`
  if (item.type === 'checkbox') return '开关'
  if (item.type === 'color') return '颜色'
  if (item.opts) return item.opts.map((opt, index) => (item.labels ? t(item.labels[index], opt) : t(opt, opt))).join(' / ')
  return '文本'
}

const itemLabel = item => t(item.label || item.key, item.key)
const itemDesc = item => i18n[`${item.key}Desc`] || ''

function settingsTable(items) {
  const rows = items.map(item => {
    const desc = itemDesc(item)
    return `| ${itemLabel(item)} | ${typeText(item)} | ${desc || '—'} |`
  })
  return ['| 设置项 | 取值 | 说明 |', '| --- | --- | --- |', ...rows].join('\n')
}

function settingsSection(title, items) {
  if (!items?.length) return ''
  return `## ${title}\n\n${settingsTable(items)}\n`
}

const appearanceSections = (ui.appearanceGroups || [])
  .map(group => settingsSection(t(group.title, group.title), group.items))
  .filter(Boolean)

const navRows = (navItems || []).map(item => `| ${t(item.tip, item.id)} | \`${item.id}\` | ${item.id === 'notes' ? '速记与笔记本' : ''} |`)
const navTable = ['| 模块 | 标识 | 说明 |', '| --- | --- | --- |', ...navRows].join('\n')

const noteTargetRows = (noteTargets || []).map(key => `| ${t(key, key)} | \`${key}\` |`)
const noteTargetTable = ['| 插入目标 | 标识 |', '| --- | --- |', ...noteTargetRows].join('\n')

const noteModeRows = Object.entries(noteModeLabels || {}).map(([key, labelKey]) => `| ${t(labelKey, key)} | \`${key}\` |`)
const noteModeTable = ['| 插入方式 | 标识 |', '| --- | --- |', ...noteModeRows].join('\n')

const LINK_PRESET_NAME = { simple: '简洁', heading: '标题', list: '列表', quote: '引用', code: '代码' }
const linkPresetBlocks = Object.entries(linkPresets || {})
  .map(([key, value]) => `### ${LINK_PRESET_NAME[key] || key}\n\n\`\`\`md\n${value}\n\`\`\``)
  .join('\n\n')

const settingsPage = `---
title: 阅读设置参考
description: 思阅全部阅读设置项、取值范围与默认行为的可检索速查表。
appliesTo: ">=${pkg.version}"
generated: true
---

${header}

本页由源码自动生成，逐项列出设置面板中的全部选项。操作方法与调整思路见 [阅读设置](/docs/sireader/reading-settings/)。

${settingsSection('界面与打开', ui.interfaceItems)}
${settingsSection('自定义主题', ui.customThemeItems)}
${appearanceSections.join('\n')}
${settingsSection('朗读参数', [...(ui.ttsItems || []), ...(ui.ttsOptions || [])])}
## 阅读器导航模块

${navTable}

## 笔记插入

目标：

${noteTargetTable}

方式：

${noteModeTable}

## 链接模板预设

${linkPresetBlocks}
`

/* ============================ 会员权益对照 ============================ */

const LEVEL_TEXT = { free: '免费', trial: '体验会员', monthly: '月付会员', annual: '年付会员', lifetime: '永久会员' }
const FEATURE_LABEL = {
  'reader-theme': '阅读主题与自定义主题',
  'reader-stats': '详细阅读统计',
  'quick-mark': '快速标注',
  'quick-send': '快捷发送',
  'folder-group': '手动分组',
  'smart-group': '智能分组',
  'book-edit': '书籍编辑',
  'batch-operation': '批量操作',
  'doc-assets': '文档 assets 同步',
  'book-search': '在线搜书',
  tts: '朗读',
  'tts-online': '在线语音',
  translate: '翻译',
  'dict-offline': '离线词典',
  'dict-advanced': '高级词典',
  'siyuan-sync': '思源同步',
}
const LEVEL_RANK = { trial: 1, monthly: 2, annual: 3, lifetime: 4 }
const featureRows = Object.entries(paidFeatures)
  .sort((a, b) => (LEVEL_RANK[a[1]] - LEVEL_RANK[b[1]]) || a[0].localeCompare(b[0]))
  .map(([key, level]) => `| ${FEATURE_LABEL[key] || key} | \`${key}\` | ${LEVEL_TEXT[level] || level} |`)
const freeRows = [
  '| 基础阅读（EPUB/PDF/TXT/在线） | — | 免费 |',
  '| 普通标注与书签 | — | 免费 |',
  '| 有道、必应基础词典 | — | 免费 |',
]

const membershipPage = `---
title: 会员权益对照
description: 按当前源码的功能门槛列出各会员等级可用能力，用于核对权益而不是替代购买页。
appliesTo: ">=${pkg.version}"
generated: true
---

${header}

等级由低到高：${['free', 'trial', 'monthly', 'annual', 'lifetime'].map(key => LEVEL_TEXT[key]).join(' → ')}；更高等级包含较低等级能力。授予与有效期以小程序和插件内的权益界面为准。

## 功能门槛

| 功能 | 源码键 | 最低等级 |
| --- | --- | --- |
${featureRows.join('\n')}

## 免费可用

| 功能 | 源码键 | 等级 |
| --- | --- | --- |
${freeRows.join('\n')}

购买与恢复流程见 [会员与账号](/docs/sireader/features-and-access/)。
`

/* ============================ 快捷键与命令 ============================ */

const baseRows = Object.entries(hotkeyCommands).map(([key, item]) => `| ${t(key, item.text)} | \`${key}\` | 默认未分配 |`)
const pdfRows = (pdfCommands || []).map(([id, name]) => {
  const langKey = `pdf-${String(id).replace(/:/g, '-')}`
  return `| ${t(langKey, name)} | \`${id}\` |`
})

const shortcutsPage = `---
title: 快捷键与命令
description: 思阅注册到思源的全部命令，可在“设置 → 快捷键”中自行绑定。
appliesTo: ">=${pkg.version}"
generated: true
---

${header}

命令本身不带默认快捷键。到思源“设置 → 快捷键”搜索插件名或下表命令名后自行分配，且只在对应阅读器处于活动状态时生效。

## 阅读器命令

| 命令 | 标识 | 默认 |
| --- | --- | --- |
${baseRows.join('\n')}

## PDF 命令

| 命令 | 标识 |
| --- | --- |
${pdfRows.join('\n')}
`

/* ============================ 思阅更新日志 ============================ */

function changelogPage() {
  const source = read('CHANGELOG.md').replace(/\r/g, '')
  const parts = source.split(/^## /m)
  const head = parts.shift() || ''
  const sections = parts
    .map(part => `## ${part}`.trim())
    .filter(part => /^## v?\d+\.\d+\.\d+/.test(part))
  const latest = sections[0]?.match(/^## v?(\d+\.\d+\.\d+)/)?.[1] || pkg.version
  const kept = sections.slice(0, 8)
  const omitted = sections.length - kept.length
  const tail = omitted > 0
    ? `\n## 更早版本\n\n更早的 ${omitted} 个版本见 [GitHub Releases](https://github.com/mm-o/siyuan-sireader/releases)。\n`
    : ''
  const intro = '按版本倒序记录思阅的公开变化。安装步骤见 [安装思阅](/docs/getting-started/sireader-installation/)，升级注意事项见 [第一次阅读](/docs/sireader/usage/)。\n'
  return `---
title: 思阅更新日志
description: 思阅各版本的公开变化，随 CHANGELOG.md 自动生成。
appliesTo: ">=${latest}"
generated: true
---

${header}

${intro}
${kept.join('\n\n')}
${tail}`
}

/* ============================ 写盘 / 比对 ============================ */

const outputs = new Map([
  ['docs/site/sireader/settings-reference.mdx', settingsPage],
  ['docs/site/sireader/membership-matrix.mdx', membershipPage],
  ['docs/site/sireader/shortcuts.mdx', shortcutsPage],
  ['docs/site/changelog/sireader.mdx', changelogPage()],
])

let stale = 0
for (const [relative, content] of outputs) {
  const target = join(root, relative)
  let current = ''
  try { current = read(relative) } catch {}
  if (current === content) continue
  if (checkOnly) {
    stale++
    console.error(`✗ 需要重新生成：${relative}`)
    continue
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
  console.log(`✓ 生成 ${relative}`)
}

if (checkOnly) {
  if (stale) {
    console.error(`\n共 ${stale} 个生成页已过期，运行 pnpm docs:gen 后提交。`)
    process.exit(1)
  }
  console.log('✓ 生成页与源码一致')
} else {
  console.log(`\n完成：${outputs.size} 个生成页（${pkg.version}）`)
}
