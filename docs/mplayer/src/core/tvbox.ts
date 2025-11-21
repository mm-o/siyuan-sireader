export type TVBoxRuleSource = {
  name: string;
  url: string;
  kind?: string; // e.g. 'wex' | 'site' | 'inline'
  enabled?: boolean;
  updated?: number;
  sites?: any[]; // inline sites
};

export type TVBoxSite = {
  key: string;
  name: string;
  api?: string;
  type?: number;
  searchable?: number;
  ext?: string;
  sourceFrom?: string; // wex | fantaiying
};

export type TVBoxItem = {
  id: string;
  title: string;
  pic?: string;
  vod_id?: string;
  vod_name?: string;
  vod_pic?: string;
  category?: string;
  site?: TVBoxSite;
  // extra meta fields commonly returned by macCMS-like APIs
  remarks?: string; // vod_remarks / note
  year?: string | number; // vod_year
  area?: string; // vod_area
  type_name?: string; // type_name
};

export type TVBoxParser = { name: string; url: string; type?: number };

const timeoutFetch=async(u:string,ms=12000)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(u,{signal:c.signal} as any);}finally{clearTimeout(t)}};

const tryJson=async(res:Response)=>{const t=await res.text();try{return JSON.parse(t)}catch{return{__raw:t,contentType:res.headers.get('content-type')||''}}};

async function fetchTextSmart(u:string,ms=12000):Promise<{text:string,contentType:string}>{ const r=await timeoutFetch(u,ms), ct=r.headers.get('content-type')||''; try{ if(/json|utf-8|utf8/i.test(ct)) return { text: await r.text(), contentType: ct }; }catch{} const b=await r.arrayBuffer(), ds=['utf-8','gb18030','gbk'] as const; for(const e of ds){ try{ const t=new TextDecoder(e as any,{fatal:false}).decode(b); if(t&&t.replace(/\s+/g,'').length) return { text:t, contentType: ct }; }catch{} } return { text:'', contentType: ct }; }

function decodeBase64(s:string){ try{ return typeof atob==='function'? atob(s) : Buffer.from(s,'base64').toString('utf-8'); }catch{ return ''; } }

// 判断响应是否像 JSON（根据 Content-Type 与文本首字符）
const looksLikeJson = (ct: string, text: string) => /json/i.test(ct) || text.trim().startsWith('{') || text.trim().startsWith('[');

// 通用：依次请求候选 URL，返回首个有效结果
async function requestFirstMatch<T>(urls: string[], parse: (text: string, ct: string) => T | null, ms=12000): Promise<T|null> {
  for (const u of urls) try { const r=await timeoutFetch(u,ms), ct=r.headers.get('content-type')||'', t=await r.text(), v=parse(t,ct); if (Array.isArray(v)?(v as any[]).length>0:!!v) return v; } catch {} return null;
}

// 从 docs/tvbox-sources.js 读取配置（与 B 站扩展类似的外部脚本）
function getConfiguredSources(): TVBoxRuleSource[] {
  const d = (window as any)?.tvboxSources?.sources;
  return Array.isArray(d) ? d.map((s: any) => ({ name: s.name || '源', url: s.url || '', kind: s.kind || 'site', enabled: s.enabled !== false, sites: s.sites || [] })) : [];
}
export function getHomeSiteKey(): string {
  const k = (window as any)?.tvboxSources?.homeSiteKey;
  return typeof k === 'string' ? k : '';
}

// 兼容旧接口：返回外部脚本配置
export async function ensureDefaultRules(_: any) { return getConfiguredSources(); }
export async function getRules(_: any): Promise<TVBoxRuleSource[]> { return getConfiguredSources(); }

function safeJsonParse<T=any>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { return null; }
}

const uniqueByName = (sites: TVBoxSite[]) => [...new Map(sites.filter(s=>s.name).map(s=>[s.name, s] as [string, TVBoxSite])).values()];

async function extractSitesFromHtml(html: string): Promise<TVBoxSite[]> {
  const sites: TVBoxSite[] = [];

  // 预清洗（去除标签，保留文本与可能的 JSON/链接）
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  // 0) atob("base64")/decodeURIComponent 场景
  const atobMatches = html.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/i);
  if (atobMatches) {
    const d1 = decodeBase64(atobMatches[1]);
    if (d1) {
      // 可能还套了一层 escape/encodeURIComponent
      let payload = d1;
      try { payload = decodeURIComponent(payload); } catch {}
      try { const obj = safeJsonParse<any>(payload); if (obj) return uniqueByName(await extractSitesFromJsonObject(obj, 'fantaiying')); } catch {}
      // 若是再套一层 atob
      const m2 = payload.match(/atob\(["']([A-Za-z0-9+/=]+)["']\)/i);
      if (m2) {
        const d2 = decodeBase64(m2[1]);
        const obj2 = safeJsonParse<any>(d2);
        if (obj2) return uniqueByName(await extractSitesFromJsonObject(obj2, 'fantaiying'));
      }
    }
  }

  // 1) 行式：name$api
  const lines = clean.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.includes('$')) {
      const [name, api] = line.split('$');
      if (name && api && /^https?:/i.test(api)) {
        sites.push({ key: name, name, api, sourceFrom: 'fantaiying' });
      }
    }
  }

  // 2) 页面显式可复制接口（data-clipboard-text），仅限“饭太硬”字样，避免跟随第三方失效链接
  const clipUrls = [...html.matchAll(/data-clipboard-text="([^"]+)"/g)].map(m => m[1]);
  const fanOnly = clipUrls.filter(u => /饭太硬/.test(u));
  for (const u of fanOnly) {
    try {
      const r = await timeoutFetch(u, 10000);
      const t = await r.text();
      const obj = safeJsonParse<any>(t);
      if (obj) {
        const fromJson = await extractSitesFromJsonObject(obj, 'fantaiying');
        sites.push(...fromJson);
      }
    } catch {}
  }

  // 3) Base64块：尝试直接解出 JSON，不再递归抓取外链，避免噪声与失败告警
  const b64s = html.match(/[A-Za-z0-9+/=]{200,}/g) || [];
  for (const b of b64s.slice(0, 10)) {
    let s = decodeBase64(b);
    for (let i=0;i<2 && s && /^[A-Za-z0-9+/=]+$/.test(s.replace(/\s+/g,''));i++) s = decodeBase64(s);
    if (!s) continue;
    const obj = safeJsonParse<any>(s);
    if (obj) {
      const fromJson = await extractSitesFromJsonObject(obj, 'fantaiying');
      sites.push(...fromJson);
    }
  }

  return uniqueByName(sites);
}

async function extractSitesFromJsonObject(obj:any,sourceFrom:string):Promise<TVBoxSite[]>{ const arr=(obj?.sites||obj?.list||obj?.rules||[]) as any[]; return Array.isArray(arr)? arr.map((s:any,i:number)=>({ key:s.key||s.id||s.name||String(i), name:s.name||s.title||s.key||s.id||`源${i+1}`, api:s.api||s.base||s.endpoint||undefined, type: typeof s.type==='number'?s.type:(typeof s.type==='string'?parseInt(s.type):undefined), searchable: s.searchable??s.search??1, ext:s.ext, sourceFrom } as TVBoxSite)) : []; }

export async function fetchSitesFromSource(src: TVBoxRuleSource): Promise<TVBoxSite[]> {
  try {
    // 0) 内联站点（演示/自定义）
    if (src.kind === 'inline' || (src.url || '').startsWith('inline://')) {
      const arr = Array.isArray(src.sites) ? src.sites : [];
      return uniqueByName(arr.map((s: any, i: number) => ({
        key: s.key || s.id || s.name || String(i),
        name: s.name || s.title || s.key || s.id || `源${i+1}`,
        api: s.api || s.base || s.endpoint || undefined,
        type: typeof s.type === 'number' ? s.type : (typeof s.type === 'string' ? parseInt(s.type) : undefined),
        searchable: s.searchable ?? s.search ?? 1,
        ext: s.ext,
        sourceFrom: 'inline'
      } as TVBoxSite)));
    }

    const urlsToTry = [src.url];
    try {
      const u = new URL(src.url);
      if (u.protocol === 'http:') { u.protocol = 'https:'; urlsToTry.push(u.toString()); }
    } catch {}

    let sites: TVBoxSite[] = [];

    for (const u of urlsToTry) {
      // 1) 优先按 JSON 解析
      try {
        const data = await tryJson(await timeoutFetch(u));
        const arr = await extractSitesFromJsonObject(data, src.kind || 'site');
        if (arr.length) sites = arr;
      } catch {}

      if (sites.length) break;

      // 2) HTML/GBK/Base64 提取
      try {
        const { text } = await fetchTextSmart(u, 12000);
        if (text) {
          const ex = await extractSitesFromHtml(text);
          if (ex.length) sites = ex;
        }
      } catch {}

      if (sites.length) break;
    }

    return uniqueByName(sites);
  } catch {
    return [];
  }
}

export async function loadAllSites(plugin:any):Promise<TVBoxSite[]>{ const sources=await getRules(plugin); const all:TVBoxSite[]=[]; for(const s of sources){ if(s.enabled===false) continue; const sites=await fetchSitesFromSource(s); const picked=sites.filter(x=>x.api); all.push(...(picked.length?picked:sites)); } return uniqueByName(all); }

// 统一解析器：根据 Content-Type/首字符自动选择 JSON/XML 解析
function parseListAuto(text: string, ct: string): TVBoxItem[] {
  if (looksLikeJson(ct, text)) { try { return parseJsonList(JSON.parse(text)); } catch {} }
  return parseXmlList(text);
}
function parseCatsAuto(text: string, ct: string): { id: string, name: string }[] {
  if (looksLikeJson(ct, text)) { try { return parseJsonCategories(JSON.parse(text)); } catch {} }
  return parseXmlCategories(text);
}
function parsePlayAuto(text: string, ct: string): string {
  if (looksLikeJson(ct, text)) { try { return parsePlayFromJson(JSON.parse(text)) || ''; } catch {} }
  return parsePlayFromXml(text) || '';
}

// 解析 JSON 结果里的视频列表
function parseJsonList(obj:any):TVBoxItem[]{ const a=obj?.list||obj?.data?.list||obj?.data||[]; return Array.isArray(a)? a.map((v:any)=>({ id:String(v.vod_id??v.id??v.vid??v.ids??''), title:String(v.vod_name??v.name??v.title??''), pic:String(v.vod_pic??v.pic??v.cover??''), vod_id:v.vod_id, vod_name:v.vod_name, vod_pic:v.vod_pic, remarks:v.vod_remarks||v.remarks||v.note||v.vod_state||'', year:v.vod_year||v.year||'', area:v.vod_area||v.area||'', type_name:v.type_name||v.vod_tag||'' })).filter(x=>x.id&&x.title) : []; }

// 解析 XML：常见 macCMS 风格
function parseXmlList(xml: string): TVBoxItem[] {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const videos = [...doc.getElementsByTagName('video')];
    if (videos.length) {
      return videos.map(v => ({
        id: v.getElementsByTagName('id')[0]?.textContent || v.getAttribute('id') || '',
        title: v.getElementsByTagName('name')[0]?.textContent || '',
        pic: v.getElementsByTagName('pic')[0]?.textContent || v.getAttribute('pic') || ''
      })).filter(x => x.id && x.title);
    }
    // 兜底：若返回 <list><video>…</video></list> 之外格式
    const items = [...doc.getElementsByTagName('item')];
    return items.map(n => ({
      id: n.getElementsByTagName('id')[0]?.textContent || '',
      title: n.getElementsByTagName('name')[0]?.textContent || n.getElementsByTagName('title')[0]?.textContent || '',
      pic: n.getElementsByTagName('pic')[0]?.textContent || ''
    })).filter(x => x.id && x.title);
  } catch { return []; }
}

// 分类解析（macCMS 常见结构）
function parseJsonCategories(obj: any): { id: string, name: string }[] {
  const classes = obj?.class || obj?.types || obj?.data?.class || [];
  if (!Array.isArray(classes)) return [];
  return classes.map((c: any, i: number) => ({ id: String(c.type_id ?? c.tid ?? c.id ?? i+1), name: String(c.type_name ?? c.name ?? `分类${i+1}`) })).filter(c => c.id && c.name);
}
function parseXmlCategories(xml: string): { id: string, name: string }[] {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const tys = [...doc.getElementsByTagName('ty')];
    if (tys.length) return tys.map(t => ({ id: t.getAttribute('id') || '', name: t.textContent || '' })).filter(c => c.id && c.name);
    const types = [...doc.getElementsByTagName('type')];
    return types.map(t => ({ id: t.getAttribute('id') || '', name: t.getAttribute('name') || t.textContent || '' })).filter(c => c.id && c.name);
  } catch { return []; }
}

export async function cmsHome(site:TVBoxSite):Promise<{id:string,name:string}[]>{ if(!site.api) return []; const u=[`${site.api}?ac=list`,`${site.api}?ac=class`,`${site.api}`]; return (await requestFirstMatch(u,(t,ct)=>{ const c=parseCatsAuto(t,ct); return c.length?c:null; }))||[]; }

export async function cmsListByType(site: TVBoxSite, typeId: string, page = 1): Promise<TVBoxItem[]> {
  if (!site.api) return [];
  const candidates = [
    `${site.api}?ac=list&t=${encodeURIComponent(typeId)}&pg=${page}`,
    `${site.api}?ac=detail&t=${encodeURIComponent(typeId)}&pg=${page}`,
    `${site.api}?ac=videolist&t=${encodeURIComponent(typeId)}&pg=${page}`,
    `${site.api}?t=${encodeURIComponent(typeId)}&pg=${page}`,
  ];
  return await fetchListPreferCovers(site, candidates);
}

export async function cmsSearch(site: TVBoxSite, keyword: string): Promise<TVBoxItem[]> {
  if (!site.api) return [];
  const q = encodeURIComponent(keyword);
  const candidates = [ `${site.api}?wd=${q}`, `${site.api}?ac=detail&wd=${q}`, `${site.api}?ac=list&wd=${q}` ];
  return await fetchListPreferCovers(site, candidates);
}

// 优先返回带封面海报的列表；如无则回退第一份非空列表
async function fetchListPreferCovers(site: TVBoxSite, candidates: string[]): Promise<TVBoxItem[]> {
  let fallback: TVBoxItem[] | null = null;
  for (const url of candidates) {
    try {
      const r = await timeoutFetch(url, 12000);
      const ct = r.headers.get('content-type') || '';
      const text = await r.text();
      const arr = parseListAuto(text, ct).map(x => ({ ...x, site }));
      if (arr.length) {
        if (arr.some(i => i.pic)) return arr; // 有封面，立即返回
        if (!fallback) fallback = arr;        // 记录第一份无封面列表
      }
    } catch {}
  }
  return fallback || [];
}

// 无分类时的兜底：不带 t 参数拉取首页/最新
export async function cmsListAll(site: TVBoxSite, page = 1): Promise<TVBoxItem[]> {
  if (!site.api) return [];
  const candidates = [ `${site.api}?ac=detail&pg=${page}`, `${site.api}?ac=videolist&pg=${page}`, `${site.api}?pg=${page}` ];
  return await fetchListPreferCovers(site, candidates);
}

// 解析播放地址（detail）
function parsePlayFromJson(obj: any): string | '' {
  const item = (obj?.list?.[0]) || (obj?.data?.[0]) || obj?.data || obj?.list;
  if (!item) return '';
  const urls = item.vod_play_url || item.play_url || '';
  if (typeof urls === 'string' && urls) {
    const lines = urls.split('#').map(l=>{ const seg=l.split('$'); return (seg.length>1?seg[1]:seg[0]).trim(); }).filter(u=>/^https?:\/\//i.test(u));
    const m3u8 = lines.find(u=>/\.m3u8(\?|$)/i.test(u));
    if (m3u8) return m3u8; if (lines[0]) return lines[0];
  }
  // 有些结构是数组
  if (Array.isArray(urls)) {
    const arr = urls.filter((u:any)=>typeof u==='string' && /^https?:\/\//i.test(u));
    const m3u8 = arr.find(u=>/\.m3u8(\?|$)/i.test(u));
    if (m3u8) return m3u8; if (arr[0]) return arr[0];
  }
  // 兜底：扫描对象任意字段里的 http
  const text = JSON.stringify(item);
  const m = text.match(/https?:\/\/[^\s"'\\]+/);
  return m ? m[0].replace(/\\\\/g, '\\') : '';
}

function parsePlayFromXml(xml:string):string|''{ try{ const d=new DOMParser().parseFromString(xml,'text/xml'); const urls=[...d.getElementsByTagName('dd')].flatMap(dd=>(dd.textContent||'').split('#').map(l=>{const[s,u]=l.split('$');return (u||s||'').trim();})).filter(u=>/^https?:\/\//i.test(u)); const m=urls.find(u=>/\.m3u8(\?|$)/i.test(u)); return (m||urls[0]||''); }catch{} return ''; }

export async function cmsDetail(site: TVBoxSite, id: string): Promise<string> {
  if (!site.api) return '';
  const candidates = [
    `${site.api}?ac=detail&ids=${encodeURIComponent(id)}`,
    `${site.api}?ac=videolist&ids=${encodeURIComponent(id)}`,
    `${site.api}?ids=${encodeURIComponent(id)}`,
  ];
  const url = await requestFirstMatch<string>(candidates, (text, ct) => {
    const u = parsePlayAuto(text, ct);
    return u ? u : null;
  });
  return url || '';
}

// ========== 详情解析（扩展） ==========
function parseDetailFromJson(obj:any){ const i=(obj?.list?.[0])||(obj?.data?.[0])||obj?.data||obj?.list; if(!i) return {} as any; const from=String(i.vod_play_from||i.play_from||'').split('$$$').filter(Boolean), segs=String(i.vod_play_url||i.play_url||'').split('$$$').filter(Boolean); const sources=from.map((f:string,idx:number)=>{ const eps=(segs[idx]||'').split('#').map(l=>{const[n,u]=l.split('$'),url=(u||n||'').trim();return{ name:n||'播放', url }}).filter(e=>/^https?:\/\//i.test(e.url)); return { from:f, episodes:eps }; }).filter(s=>s.episodes.length); const arr=(s:string)=>(s||'').split(/[,\/\s]+/).filter(Boolean).map(n=>({name:n})); return { title:i.vod_name||i.title||'', pic:i.vod_pic||i.pic||'', remarks:i.vod_remarks||i.remarks||'', url:parsePlayFromJson({list:[i]}), sources, year:i.vod_year, area:i.vod_area, directors:arr(i.vod_director), casts:arr(i.vod_actor), content:i.vod_content, genres:(i.vod_class||i.type_name||'').split(/[,\/\s]+/).filter(Boolean), score:i.vod_score||i.vod_douban_score||i.score, pubdate:i.vod_pubdate||i.vod_release_date||i.pubdate, duration:i.vod_duration||i.duration||i.vod_length||i.vod_len, lang:i.vod_lang||i.lang } as any; }
function parseDetailFromXml(xml:string){ try{ const d=new DOMParser().parseFromString(xml,'text/xml'), vod=d.getElementsByTagName('video')[0]||d.getElementsByTagName('vod')[0]; if(!vod) return {} as any; const t=(k:string)=>vod.getElementsByTagName(k)[0]?.textContent||''; const sources=[...d.getElementsByTagName('dd')].map(dd=>{ const flag=dd.getAttribute('flag')||'default'; const eps=(dd.textContent||'').split('#').map(l=>{const[n,u]=l.split('$'),url=(u||n||'').trim(); return { name:n||'播放', url };}).filter(e=>/^https?:\/\//i.test(e.url)); return { from:flag, episodes:eps }; }).filter(s=>s.episodes.length); const arr=(s:string)=>(s||'').split(/[,\/\s]+/).filter(Boolean).map(n=>({name:n})); return { title:t('name'), pic:t('pic'), remarks:t('note'), url:parsePlayFromXml(xml), sources, year:t('year'), area:t('area'), directors:arr(t('director')), casts:arr(t('actor')), content:t('des'), genres:(t('class')||'').split(/[,\/\s]+/).filter(Boolean), score:t('score')||t('douban_score'), pubdate:t('pubdate')||t('last'), duration:t('duration')||t('len')||t('length'), lang:t('lang') } as any; }catch{ return {} as any; } }
export async function cmsDetailInfo(site: TVBoxSite, id: string): Promise<any> {
  if (!site?.api) return {};
  const candidates = [
    `${site.api}?ac=detail&ids=${encodeURIComponent(id)}`,
    `${site.api}?ac=videolist&ids=${encodeURIComponent(id)}`,
    `${site.api}?ids=${encodeURIComponent(id)}`,
  ];
  const info = await requestFirstMatch<any>(candidates, (text, ct) => {
    try {
      const v = looksLikeJson(ct, text) ? parseDetailFromJson(JSON.parse(text)) : parseDetailFromXml(text);
      return (v && (v.sources?.length || v.url)) ? v : null;
    } catch { return null; }
  });
  return { ...(info || {}), site };
}

// ========== TVBox 协议支持 ==========
export async function searchAndPlay(title: string, episode?: number, onSourceFound?: (items: TVBoxItem[]) => void): Promise<{ url: string; item: TVBoxItem; detail: any; sourceIdx: number; episodeIdx: number; allSources?: TVBoxItem[] } | null> {
  try {
    const sites = await loadAllSites(null), homeKey = getHomeSiteKey(), validSites = sites.filter(s => /^https?:/i.test(s.api || ''));
    const homeSite = homeKey ? validSites.find(s => s.name?.includes(homeKey) || s.key === homeKey) : null;
    const allSources: TVBoxItem[] = [];
    
    // 优先源先搜索
    if (homeSite) try {
      const items = await cmsSearch(homeSite, title) || [];
      if (items.length) { allSources.push(...items); onSourceFound?.(allSources.slice()); }
    } catch {}
    
    // 后台并发搜索其他源
    const batch = (homeSite ? validSites.filter(s => s !== homeSite) : validSites).slice(0, 11);
    Promise.allSettled(batch.map(async s => {
      try {
        const items = await cmsSearch(s, title);
        if (items?.length) { allSources.push(...items); onSourceFound?.(allSources.slice()); }
      } catch {}
    }));
    
    // 等待首个结果
    await new Promise(r => setTimeout(r, allSources.length ? 0 : 2000));
    if (!allSources.length) return null;
    
    const bestMatch = allSources.find(it => it.title === title || it.vod_name === title) || allSources[0];
    const detail = await cmsDetailInfo(bestMatch.site, bestMatch.id || bestMatch.vod_id);
    if (!detail?.sources?.length) return null;
    
    const sourceIdx = Math.max(0, detail.sources.findIndex((s: any) => (s.episodes || []).some((e: any) => /\.m3u8/i.test(e.url))));
    const episodes = detail.sources[sourceIdx]?.episodes || [];
    const ep = episode && episode > 0 && episode <= episodes.length ? episode - 1 : 0;
    const url = episodes[ep]?.url;
    return url ? { url, item: bestMatch, detail, sourceIdx, episodeIdx: ep, allSources } : null;
  } catch { return null; }
}

export const generateTvboxProtocol = (title: string, episode?: number) => `tvbox://video/${title}${episode && episode > 1 ? `?ep=${episode}` : ''}`;