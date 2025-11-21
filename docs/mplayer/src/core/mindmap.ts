import { SubtitleManager } from './subtitle';
import { Media } from './player';
// @ts-ignore
import { Markmap } from 'markmap-view';
// @ts-ignore
import { Transformer } from 'markmap-lib';

// 构建思维导图 Prompt（基于字幕）
export function buildPromptFromSubtitles(cues: Array<{ startTime: number; endTime: number; text: string }>): string {
  const lines = (cues || [])
    .map(c => {
      const t = Media.fmt(Math.max(0, Math.floor(c.startTime || 0)));
      const txt = (c.text || '').trim();
      return txt ? `[${t}] ${txt}` : '';
    })
    .filter(Boolean);
  let raw = lines.join('\n');
  const maxChars = 12000;
  if (raw.length > maxChars) raw = raw.slice(0, maxChars);
  return [
    '你是一个优秀的中文知识整理助手。',
    '请基于以下带时间戳的字幕，生成一份“简洁且分层清晰”的思维导图（使用 Markdown 无序列表 - 开头，最多 3 级层级）。',
    '要求：',
    '1) 只保留核心要点、关键关系与步骤；',
    '2) 去除赘述、口头语与重复；',
    '3) 尽量抽象为 主题 -> 子主题 -> 要点 的结构；',
    '4) 不要添加与字幕无关的臆测；',
    '5) 【重要】每一行结尾追加时间标记：#t=mm:ss（超过 1 小时使用 #t=hh:mm:ss）。例如：- 要点文本 #t=01:25',
    '6) 选择最能代表该要点的起始时间（可近似）。',
    '7) 输出只包含 Markdown 列表（不要额外解释）。',
    '',
    '【带时间戳的字幕】',
    raw
  ].join('\n');
}

// 极简解析：从文本中提取秒数
export function extractSeconds(text: string): number {
  if (!text) return NaN;
  const pick =
    text.match(/#t[:=]([\d:.]+\.?\d*)/i)?.[1] ||
    text.match(/[?&]t=([^&]+)/i)?.[1] ||
    text.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/)?.[1] ||
    text.match(/\((\d{1,2}:\d{2}(?::\d{2})?)\)/)?.[1] ||
    text.match(/^(?:\s*[-*+]\s+)?(\d{1,2}:\d{2}(?::\d{2})?)\b/)?.[1] ||
    text.match(/(\b\d{1,2}:\d{2}(?::\d{2})?\b)/)?.[1] ||
    text.match(/\b(\d+(?:\.\d+)?)\b/)?.[1];
  if (!pick) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(pick)) return Number(pick);
  const [hms, frac] = pick.split('.');
  const parts = hms.split(':').map(Number);
  if (parts.some(isNaN)) return NaN;
  const sec = (parts.length === 3)
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : (parts.length === 2)
      ? parts[0] * 60 + parts[1]
      : parts[0];
  return sec + (frac ? Number(`0.${frac}`) : 0);
}

export function cleanMindmapText(text: string): string {
  if (!text) return text as any;
  let s = text.replace(/\[([^\]]+)\]\(\s*\)/g, '$1');
  s = s
    .replace(/\s*#t[:=][\d:.]+\.?\d*/ig, '')
    .replace(/\s*\bt=[\d:.]+\.?\d*/ig, '')
    .replace(/\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, '')
    .replace(/\s*\((\d{1,2}:\d{2}(?::\d{2})?)\)/g, '')
    .trim();
  for (let i = 0; i < 2; i++) {
    if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1).trim();
    else break;
  }
  return s;
}

// 将 Markdown 列表行的时间标记替换为指向媒体的链接
export function attachMediaLinks(md: string, baseUrl: string): string {
  if (!md?.trim()) return md;
  const base = (baseUrl || '').trim();
  if (!base) return md;
  return md.replace(/^(\s*[-*+]\s+)(.+)$/gm, (_m, pfx, body0) => {
    let body = body0.replace(/\]\(\)\]\(/g, '](');
    const linkMatch = body.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const text = linkMatch[1];
      const href = linkMatch[2];
      const timeInHref = href.match(/#t[:=]([\d:.]+\.?\d*)/i) || href.match(/[?&]t=([^&]+)/i);
      if (timeInHref?.[1]) {
        const sec = extractSeconds(timeInHref[1]);
        if (!isNaN(sec)) {
          const cleanText = cleanMindmapText(text);
          const newHref = Media.withTime(base, Math.max(0, sec));
          const replaced = body.replace(linkMatch[0], `[${cleanText}](${newHref})`);
          return `${pfx}${replaced}`;
        }
      }
      return `${pfx}${body}`;
    }
    const sec = extractSeconds(body);
    if (isNaN(sec)) return `${pfx}${body}`;
    const clean = cleanMindmapText(body);
    const link = Media.withTime(base, Math.max(0, sec));
    return `${pfx}[${clean}](${link})`;
  });
}

// B站总结兜底：转为带时间标记的 Markdown 列表
export function buildBiliMindmap(items: any[]): string {
  if (!items?.length) return '';
  const toTime = (sec: number) => Media.fmt(Math.max(0, Math.floor(sec || 0)));
  const lines: string[] = [];
  for (const it of items) {
    if (!it?.text) continue;
    const t = toTime(it.startTime || 0);
    lines.push(`- [${it.text}](#t=${t})`);
  }
  return lines.join('\n');
}

// 调用思源 AI（依序尝试多个端点）
export async function callSiYuanAI(message: string): Promise<string> {
  const payload = { msg: message } as any;
  const endpoints = ['/api/ai/chatGPT', '/api/ai/chat', '/api/chatGPT'];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      const text = (data && (data.data || data.Data || data.result)) || '';
      if (typeof text === 'string' && text.trim()) return text;
    } catch (e) { /* try next */ }
  }
  throw new Error('调用思源 AI 失败');
}

// OpenAI-compatible chat API caller
export async function callCustomAI(account: {
  base: string; apiKey: string; model: string;
  provider?: string; org?: string; apiVersion?: string; timeoutMs?: number;
  headers?: Record<string,string>; path?: string;
}, message: string): Promise<string> {
  const base = String(account?.base || '').replace(/\/$/, '');
  if (!base || !account?.apiKey || !account?.model) throw new Error('AI account config is incomplete');
  const provider = String(account.provider || 'openai').toLowerCase();
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), account.timeoutMs || 30000);
  try {
    let url = '';
    let headers: Record<string,string> = { 'Content-Type': 'application/json', ...(account.headers || {}) };
    let body: any = { messages: [{ role: 'user', content: message }], temperature: 0.2, stream: false };

    if (provider === 'azure') {
      const apiVersion = account.apiVersion || '2024-06-01';
      url = `${base}/openai/deployments/${encodeURIComponent(account.model)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
      headers['api-key'] = account.apiKey;
    } else {
      const path = account.path || '/v1/chat/completions';
      url = `${base}${path}`;
      headers['Authorization'] = `Bearer ${account.apiKey}`;
      if (account.org) headers['OpenAI-Organization'] = account.org;
      body.model = account.model;
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
    if (typeof text === 'string' && text.trim()) return text;
    throw new Error('AI response empty');
  } finally { clearTimeout(to); }
}

// 标题 + Markdown 正规化（用于 Markmap）
export function buildMarkmapMarkdown(md: string, title?: string): string {
  const t = (title && String(title).trim()) || '思维导图';
  if (!md?.trim()) return `# ${t}`;
  const body = (md.replace(/```[\s\S]*?```/g, (m) => m.replace(/^```[a-zA-Z0-9_-]*\n?|```$/g, '')) || '').trim();
  const lines = body.split(/\r?\n/).map(s => s.replace(/[\u200B-\u200D\uFEFF]/g, '')).filter(Boolean);
  const hasBullet = lines.some(l => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(l));
  const normalized = (hasBullet ? lines : lines.map(l => `- ${l}`)).join('\n');
  return `# ${t}\n\n${normalized}`;
}

// ===== Markmap 渲染与自适应 =====
export function renderMarkmap(container: HTMLDivElement, md: string, title?: string): { instance: any } {
  if (!container) throw new Error('container is missing');
  if (!md?.trim()) throw new Error('empty mindmap content');
  container.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.width = '100%';
  svg.style.height = '100%';
  container.style.width = '100%';
  container.style.height = '100%';
  container.appendChild(svg);
  const transformer = new Transformer();
  const { root } = transformer.transform(buildMarkmapMarkdown(md, title));
  const instance = Markmap.create(svg, undefined, root);
  try {
    instance?.fit?.();
    requestAnimationFrame(() => { try { instance?.fit?.(); } catch {} });
  } catch {}
  return { instance };
}

export function setupMarkmapAutoFit(container: HTMLDivElement, instance: any): ResizeObserver | null {
  try {
    const ro = new ResizeObserver(() => { try { instance?.fit?.(); } catch {} });
    if (container) ro.observe(container);
    return ro;
  } catch {
    return null;
  }
}

export function addWindowResizeFit(instance: any): () => void {
  const handler = () => { try { instance?.fit?.(); } catch {} };
  window.addEventListener('resize', handler);
  return handler;
}

export function cleanupMarkmap(container?: HTMLDivElement | null, ro?: ResizeObserver | null, winHandler?: () => void): void {
  try { ro?.disconnect(); } catch {}
  if (winHandler) try { window.removeEventListener('resize', winHandler); } catch {}
  if (container) try { container.innerHTML = ''; } catch {}
}

export type MarkmapToggleResult = {
  enabled: boolean;
  instance?: any;
  resizeObserver?: ResizeObserver | null;
  winHandler?: () => void;
};

export function toggleMarkmap(params: {
  enabled: boolean;
  container: HTMLDivElement | null | undefined;
  md: string;
  title?: string;
  existing?: { instance?: any; resizeObserver?: ResizeObserver | null; winHandler?: () => void };
}): MarkmapToggleResult {
  const { enabled, container, md, title, existing } = params;
  if (!enabled) {
    if (!container || !md?.trim()) return { enabled: false };
    try {
      const { instance } = renderMarkmap(container, md, title);
      const ro = setupMarkmapAutoFit(container, instance);
      const wh = addWindowResizeFit(instance);
      return { enabled: true, instance, resizeObserver: ro, winHandler: wh };
    } catch {
      return { enabled: false };
    }
  } else {
    cleanupMarkmap(container || undefined, existing?.resizeObserver || null, existing?.winHandler);
    return { enabled: false };
  }
}