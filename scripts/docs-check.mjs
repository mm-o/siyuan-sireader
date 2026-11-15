#!/usr/bin/env node
/**
 * 文档门禁：在发版与 CI 中校验 docs/site 的可发布性。
 *
 * 检查项：
 *  1. 结构：slug 只能是 kebab-case ASCII；frontmatter 必须有 title / description / appliesTo
 *  2. 链接：站内 /docs/<slug>/ 必须存在于本地文档或共享页清单
 *  3. 域名：禁止出现已退役域名与会员 API 域名（用户文档不暴露服务端实现）
 *  4. 版本：package.json 版本必须是更新日志里最新的一个版本
 *  5. 生成页：与源码重新生成的结果一致（--strict 时才算失败）
 *  6. 完整度：报告待补充标记数量（不阻塞）
 *
 * 用法：node scripts/docs-check.mjs [--strict]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')
const siteDir = join(root, 'docs', 'site')

const errors = []
const warnings = []
const fail = (message) => errors.push(message)
const warn = (message) => warnings.push(message)

const read = relativePath => readFileSync(join(root, relativePath), 'utf8')

function walk(directory, extensions = ['.mdx']) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = join(directory, entry.name)
    return entry.isDirectory() ? walk(full, extensions) : extensions.includes(extname(entry.name)) ? [full] : []
  })
}

const files = walk(siteDir)
const slugs = new Map()
for (const file of files) {
  const slug = relative(siteDir, file).replace(/\.mdx$/, '').split('\\').join('/')
  slugs.set(slug, file)
  const segments = slug.split('/')
  if (!segments.every(segment => /^[a-z0-9][a-z0-9-]*$/.test(segment))) fail(`slug 非法（只允许小写字母、数字、连字符）：${slug}`)
  if (segments.length > 2) warn(`slug 层级偏深（建议两级）：${slug}`)
}

let shared = []
try { shared = JSON.parse(readFileSync(join(siteDir, 'shared-slugs.json'), 'utf8')).slugs || [] } catch {}
const known = new Set([...slugs.keys(), ...shared])

const BANNED = [
  'sireader.745201.xyz',
  'simedia-home.745201.xyz',
  'admin.745201.xyz',
  'my.feishu.cn',
  'vip.745201.xyz',
]

let todo = 0
const frontmatterOf = source => {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null
  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index > 0) fields[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return fields
}

for (const [slug, file] of slugs) {
  const source = readFileSync(file, 'utf8')
  const fields = frontmatterOf(source)
  if (!fields) { fail(`缺少 frontmatter：${slug}`); continue }
  for (const key of ['title', 'description', 'appliesTo']) {
    if (!fields[key]) fail(`frontmatter 缺少 ${key}：${slug}`)
  }
  if (fields.description && fields.description.length > 60) warn(`description 偏长（建议 ≤60 字，影响搜索摘要）：${slug}`)

  for (const banned of BANNED) {
    if (source.includes(banned)) fail(`出现禁止的域名 ${banned}：${slug}`)
  }

  for (const match of source.matchAll(/\]\(\/docs\/([a-z0-9\-/]+)\/?\)/g)) {
    const target = match[1].replace(/\/$/, '')
    if (!known.has(target)) fail(`站内链接指向不存在的文档：${slug} → /docs/${target}/`)
  }

  todo += (source.match(/待补充|TODO/g) || []).length
}

/* 源码里同样不允许退役域名（会员 API 基址属服务端接口，单独放行） */
const SOURCE_WHITELIST = new Set(['src/core/license.ts'])
for (const file of walk(join(root, 'src'), ['.ts', '.vue'])) {
  const rel = relative(root, file).split('\\').join('/')
  if (SOURCE_WHITELIST.has(rel)) continue
  const source = readFileSync(file, 'utf8')
  for (const banned of BANNED) if (source.includes(banned)) fail(`源码出现退役域名 ${banned}：${rel}`)
}

/* 版本一致性 */
const pkg = JSON.parse(read('package.json'))
const changelog = slugs.has('changelog/sireader') ? readFileSync(slugs.get('changelog/sireader'), 'utf8') : ''
const latest = changelog.match(/^## v?(\d+\.\d+\.\d+)/m)?.[1]
if (!latest) fail('更新日志没有可识别的版本标题（形如 ## 2.7.0）')
else if (latest !== pkg.version) fail(`更新日志最新版本 ${latest} 与 package.json ${pkg.version} 不一致，运行 pnpm docs:gen`)

/* 生成页新鲜度 */
try {
  execFileSync(process.execPath, [join(root, 'scripts', 'docs-gen.mjs'), '--check'], { stdio: 'pipe' })
} catch (error) {
  const detail = String(error.stdout || '') + String(error.stderr || '')
  const message = '生成页与源码不一致，运行 pnpm docs:gen'
  if (strict) fail(`${message}\n${detail.trim()}`)
  else warn(message)
}

/* 报告 */
console.log(`文档数：${slugs.size} 篇（共享页 ${shared.length} 篇）`)
console.log(`待补充标记：${todo} 处`)
if (warnings.length) {
  console.log(`\n提示 ${warnings.length} 条：`)
  for (const message of warnings) console.log(`  · ${message}`)
}
if (errors.length) {
  console.log(`\n错误 ${errors.length} 条：`)
  for (const message of errors) console.log(`  ✗ ${message}`)
  process.exit(1)
}
console.log('\n✓ 文档门禁通过')
