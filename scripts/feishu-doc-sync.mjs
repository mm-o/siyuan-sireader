import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SPACE_NAME = process.env.FEISHU_DOC_SPACE_NAME || '思阅文档'
const SPACE_DESCRIPTION = '思阅 SiReader 插件文档，由本地 Markdown 同步生成。'
const MANIFEST_PATH = 'docs/feishu-docs.json'
const TEMP_DIR = '.tmp/feishu-doc-sync'
const PRIVATE_AUTH_PATH = process.env.FEISHU_AUTH_FILE || 'private-sources/feishu-auth.local.json'

const DOCS = [
  { id: 'readme.zh_CN', title: '使用文档', source: 'README_zh_CN.md' },
  { id: 'readme.en_US', title: 'Documentation', source: 'README.md' },
  { id: 'changelog.zh_CN', title: '更新日志', source: 'CHANGELOG.md' },
  { id: 'changelog.en_US', title: 'Changelog', source: 'README.md', generated: 'englishChangelog' },
]

const README_LINKS = {
  readme: /(\[[^\]]*(?:使用文档|Documentation)[^\]]*\]\()https:\/\/my\.feishu\.cn\/wiki\/[^)]+(\))/u,
  changelog: /(\[[^\]]*(?:更新日志|Changelog)[^\]]*\]\()https:\/\/my\.feishu\.cn\/wiki\/[^)]+(\))/u,
}

export function buildCatalog() {
  return DOCS.map((entry) => ({ ...entry }))
}

export function contentHash(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex')
}

export function shouldUpdateDocument(record, nextHash) {
  return record?.contentHash !== nextHash
}

export function summarizePrivateAuth(auth) {
  return {
    hasUserAccessToken: Boolean(auth?.userAccessToken),
    hasRefreshToken: Boolean(auth?.refreshToken),
    expiresAt: auth?.expiresAt || '',
  }
}

export function replaceReadmeLinks(markdown, manifest) {
  const locale = /\bDocumentation\b|\bChangelog\b/.test(String(markdown || '')) ? 'en_US' : 'zh_CN'
  const readmeUrl = manifest?.docs?.[`readme.${locale}`]?.url
  const changelogUrl = manifest?.docs?.[`changelog.${locale}`]?.url
  let next = String(markdown || '')
  if (readmeUrl) next = next.replace(README_LINKS.readme, `$1${readmeUrl}$2`)
  if (changelogUrl) next = next.replace(README_LINKS.changelog, `$1${changelogUrl}$2`)
  return next
}

function renderEnglishChangelog(markdown) {
  const lines = String(markdown || '').split(/\r?\n/)
  const start = lines.findIndex((line) => /^##\s+Latest Updates\s*$/i.test(line.trim()))
  if (start < 0) return `# SiReader - Changelog\n\n${String(markdown || '').trim()}\n`
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()))
  const section = lines.slice(start + 1, end > start ? end : undefined).join('\n').trim()
  return `# SiReader - Changelog\n\n${section}\n`
}

function counterpartId(id) {
  if (id?.endsWith('.zh_CN')) return id.replace(/\.zh_CN$/, '.en_US')
  if (id?.endsWith('.en_US')) return id.replace(/\.en_US$/, '.zh_CN')
  return ''
}

function renderLanguageSwitch(entry, manifest) {
  const peerUrl = manifest?.docs?.[counterpartId(entry?.id)]?.url
  if (!peerUrl) return ''
  return entry.id.endsWith('.zh_CN')
    ? `> 中文 | [English](${peerUrl})\n\n`
    : `> [中文](${peerUrl}) | English\n\n`
}

export function renderDocumentMarkdown(entry, sourceMarkdown, manifest = {}) {
  const body = entry?.generated === 'englishChangelog'
    ? renderEnglishChangelog(sourceMarkdown)
    : String(sourceMarkdown || '')
  return `${renderLanguageSwitch(entry, manifest)}${body}`
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function parseFirstJson(text) {
  const source = String(text || '')
  const start = source.indexOf('{')
  if (start < 0) throw new Error(`No JSON object in CLI output: ${source}`)
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(source.slice(start, index + 1))
    }
  }
  throw new Error(`Unclosed JSON object in CLI output: ${source}`)
}

function larkCommand() {
  const cliJs = process.env.LARK_CLI_JS || 'D:/nodejs/node_modules/@larksuite/cli/scripts/run.js'
  if (fs.existsSync(cliJs)) return { command: process.execPath, prefix: [cliJs] }
  return { command: process.platform === 'win32' ? 'lark-cli.cmd' : 'lark-cli', prefix: [] }
}

function loadPrivateAuth(cwd) {
  const auth = readJson(path.join(cwd, PRIVATE_AUTH_PATH), null)
  return auth && typeof auth === 'object' ? auth : null
}

function runLark(args, { cwd = process.cwd(), dryRun = false } = {}) {
  if (dryRun) {
    console.log(`[dry-run] lark-cli ${args.join(' ')}`)
    return { ok: true, data: {} }
  }
  const auth = loadPrivateAuth(cwd)
  const { command, prefix } = larkCommand()
  const result = spawnSync(command, [...prefix, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
      LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1',
      FEISHU_USER_ACCESS_TOKEN: auth?.userAccessToken || process.env.FEISHU_USER_ACCESS_TOKEN || '',
      FEISHU_REFRESH_TOKEN: auth?.refreshToken || process.env.FEISHU_REFRESH_TOKEN || '',
    },
  })
  if (result.status !== 0) {
    throw new Error([
      `lark-cli ${args.join(' ')} failed with exit ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'))
  }
  return parseFirstJson(result.stdout || result.stderr)
}

function collectItems(payload) {
  if (Array.isArray(payload?.data?.spaces)) return payload.data.spaces
  if (Array.isArray(payload?.spaces)) return payload.spaces
  return []
}

function ensureSpace(manifest, options) {
  manifest.space ||= { name: SPACE_NAME, description: SPACE_DESCRIPTION }
  if (manifest.space.id) return manifest.space.id

  const list = runLark(['wiki', '+space-list', '--as', 'user', '--format', 'json'], options)
  const existing = collectItems(list).find((space) => space.name === manifest.space.name)
  if (existing?.space_id) {
    manifest.space = { ...manifest.space, id: existing.space_id, name: existing.name }
    return manifest.space.id
  }

  const created = runLark([
    'wiki', '+space-create',
    '--as', 'user',
    '--name', manifest.space.name,
    '--description', manifest.space.description || SPACE_DESCRIPTION,
    '--format', 'json',
  ], options)
  const data = created.data || created
  manifest.space = { ...manifest.space, id: data.space_id || (options.dryRun ? 'dry_run_space' : ''), name: data.name || manifest.space.name }
  return manifest.space.id
}

function ensureDocument(entry, manifest, spaceId, options) {
  manifest.docs ||= {}
  if (manifest.docs[entry.id]?.documentId) return
  const created = runLark([
    'wiki', '+node-create',
    '--as', 'user',
    '--space-id', spaceId,
    '--title', entry.title,
    '--format', 'json',
  ], options)
  const data = created.data || created
  const fakeToken = options.dryRun ? `dry_run_${entry.id.replace(/[^a-z0-9]+/gi, '_')}` : ''
  manifest.docs[entry.id] = {
    title: entry.title,
    source: entry.source,
    nodeToken: data.node_token || fakeToken,
    documentId: data.obj_token || fakeToken,
    url: data.node_token || fakeToken ? `https://my.feishu.cn/wiki/${data.node_token || fakeToken}` : '',
  }
}

function writeTempMarkdown(cwd, id, markdown) {
  const dir = path.join(cwd, TEMP_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${id.replace(/[^a-z0-9._-]/gi, '-')}.md`)
  fs.writeFileSync(file, markdown, 'utf8')
  return path.relative(cwd, file).replace(/\\/g, '/')
}

function updateDocument(entry, markdown, manifest, options) {
  const documentId = manifest.docs?.[entry.id]?.documentId
  if (!documentId) throw new Error(`Missing documentId for ${entry.id}`)
  const temp = writeTempMarkdown(options.cwd, entry.id, markdown)
  runLark([
    'docs', '+update',
    '--as', 'user',
    '--doc', documentId,
    '--command', 'overwrite',
    '--doc-format', 'markdown',
    '--content', `@${temp}`,
    '--format', 'json',
  ], options)
}

function syncReadmeLinks(cwd, manifest) {
  for (const file of ['README_zh_CN.md', 'README.md']) {
    const target = path.join(cwd, file)
    const current = fs.readFileSync(target, 'utf8')
    const next = replaceReadmeLinks(current, manifest)
    if (next !== current) fs.writeFileSync(target, next, 'utf8')
  }
}

export async function syncFeishuDocs({ cwd = process.cwd(), dryRun = false } = {}) {
  const manifestFile = path.join(cwd, MANIFEST_PATH)
  const manifest = readJson(manifestFile, { version: 1, space: { name: SPACE_NAME, description: SPACE_DESCRIPTION }, docs: {} })
  const catalog = buildCatalog()
  const stats = { updated: 0, skipped: 0 }
  const privateAuth = summarizePrivateAuth(loadPrivateAuth(cwd))
  const spaceId = ensureSpace(manifest, { cwd, dryRun })

  for (const entry of catalog) ensureDocument(entry, manifest, spaceId, { cwd, dryRun })
  if (!dryRun) writeJson(manifestFile, manifest)

  for (const entry of catalog) {
    const markdown = renderDocumentMarkdown(entry, fs.readFileSync(path.join(cwd, entry.source), 'utf8'), manifest)
    const hash = contentHash(markdown)
    const record = manifest.docs[entry.id]
    if (shouldUpdateDocument(record, hash)) {
      updateDocument(entry, markdown, manifest, { cwd, dryRun })
      record.contentHash = hash
      stats.updated += 1
    } else {
      stats.skipped += 1
    }
  }

  if (!dryRun) {
    writeJson(manifestFile, manifest)
    syncReadmeLinks(cwd, manifest)
  }

  return { manifest, stats, privateAuth }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const result = await syncFeishuDocs({ dryRun })
  console.log(JSON.stringify({
    ok: true,
    space: result.manifest.space,
    docs: Object.keys(result.manifest.docs || {}).length,
    updated: result.stats.updated,
    skipped: result.stats.skipped,
    privateAuth: result.privateAuth,
    manifest: MANIFEST_PATH,
  }, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exit(1)
  })
}
