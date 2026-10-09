/**
 * TXT转EPUB转换器 - 优化大文件处理
 */

import JSZip from 'jszip'

export interface Chapter { index: number; title: string; content: string }

// 编码检测 - 增强准确性
export const decodeTxtBuffer = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)

  // BOM检测
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return new TextDecoder('utf-8').decode(bytes.slice(3))
  if (bytes.length >= 2) {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.slice(2))
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.slice(2))
  }

  // 扩大检测样本到前 4KB
  const sample = bytes.subarray(0, Math.min(4096, bytes.length))

  // UTF-8 验证 - 更严格的检测
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(sample)
    // 检查是否包含常见中文字符
    if (/[\u4e00-\u9fa5]/.test(text)) {
      return new TextDecoder('utf-8').decode(bytes)
    }
    // 如果没有中文但解码成功，也认为是 UTF-8
    if (!text.includes('�')) {
      return new TextDecoder('utf-8').decode(bytes)
    }
  } catch {}

  // GBK 检测 - 检查是否包含 GBK 特征
  try {
    const gbkText = new TextDecoder('gbk').decode(sample)
    // 如果包含常见中文字符，优先使用 GBK
    if (/[\u4e00-\u9fa5]/.test(gbkText) && !gbkText.includes('�')) {
      return new TextDecoder('gbk').decode(bytes)
    }
  } catch {}

  // 默认 UTF-8
  return new TextDecoder('utf-8').decode(bytes)
}

// 章节分割 - 优化大文件处理
export const splitTxtChapters = (text: string): Chapter[] => {
  const regex = /^(第[零一二三四五六七八九十百千万\d]+[章节回集部]|Chapter\s+\d+|\d+\.|【[^】]+】)/m
  const lines = text.split('\n')
  const chapters: Chapter[] = []
  let title = '开始', content: string[] = [], idx = 0

  // 限制单章最大行数，避免内存溢出
  const MAX_LINES_PER_CHAPTER = 5000

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (regex.test(trimmed) && content.length > 0) {
      chapters.push({ index: idx++, title, content: content.join('\n') })
      title = trimmed
      content = []
    } else {
      content.push(trimmed)
      // 强制分章，避免单章过大
      if (content.length >= MAX_LINES_PER_CHAPTER) {
        chapters.push({ index: idx++, title: title || `第${idx + 1}部分`, content: content.join('\n') })
        title = `第${idx + 1}部分（续）`
        content = []
      }
    }
  }

  if (content.length) chapters.push({ index: idx, title, content: content.join('\n') })
  return chapters.length ? chapters : [{ index: 0, title: '全文', content: text }]
}

// XML转义
const XML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
const escapeXml = (text: string): string => text.replace(/[&<>"']/g, m => XML_ESCAPE[m])

// HTML转义
const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// UUID生成
const generateUUID = (): string => {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// 生成章节HTML
const toChapterHtml = (title: string, content: string): string => {
  const escaped = escapeHtml(content)
  const paragraphs = escaped.split(/\n+/).filter(Boolean).map(p => `    <p>${p}</p>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <style>body{max-width:800px;margin:0 auto;padding:2em;font-size:18px;line-height:1.8}h1{text-align:center;margin-bottom:2em}p{text-indent:2em;margin:1em 0}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
${paragraphs}
</body>
</html>`
}

// 生成EPUB文件
export const generateEpubFile = async (
  content: ArrayBuffer | string,
  title = '未命名',
  author = '未知作者'
): Promise<File> => {
  // 解码
  const text = content instanceof ArrayBuffer ? decodeTxtBuffer(content) : content
  if (!text.trim()) throw new Error('文件内容为空')

  // 分割章节
  const chapters = splitTxtChapters(text)
  if (!chapters.length) throw new Error('无法识别章节')

  // 创建ZIP
  const zip = new JSZip()
  const uuid = generateUUID()
  const timestamp = new Date().toISOString().split('.')[0] + 'Z'

  // mimetype (无压缩)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.file('META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  // 生成manifest和spine
  const manifest = chapters.map((_, i) =>
    `    <item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')
  const spine = chapters.map((_, i) => `    <itemref idref="ch${i}"/>`).join('\n')

  // OEBPS/content.opf
  zip.file('OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>zh</dc:language>
    <dc:identifier id="uid">urn:uuid:${uuid}</dc:identifier>
    <meta property="dcterms:modified">${timestamp}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>`)

  // OEBPS/toc.ncx
  const navPoints = chapters.map((ch, i) =>
    `    <navPoint id="np${i}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="ch${i}.xhtml"/>
    </navPoint>`).join('\n')

  zip.file('OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uuid}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`)

  // OEBPS/nav.xhtml
  const navList = chapters.map((ch, i) =>
    `      <li><a href="ch${i}.xhtml">${escapeXml(ch.title)}</a></li>`).join('\n')

  zip.file('OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>目录</title></head>
<body>
  <nav epub:type="toc">
    <h1>目录</h1>
    <ol>
${navList}
    </ol>
  </nav>
</body>
</html>`)

  // 章节内容 - 批量添加
  chapters.forEach((ch, i) => zip.file(`OEBPS/ch${i}.xhtml`, toChapterHtml(ch.title, ch.content)))

  // 生成ZIP - 降低压缩级别提升速度
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 3 }
  })

  return new File([blob], `${title}.epub`, { type: 'application/epub+zip' })
}

// 转换TXT文件为EPUB
export const convertTxtFile = async (file: File): Promise<File> => {
  const name = file.name.replace(/\.txt$/i, '')
  return generateEpubFile(await file.arrayBuffer(), name, '未知作者')
}
