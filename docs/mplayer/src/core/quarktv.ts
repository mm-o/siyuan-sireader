import { isPdf } from './player';

// Quark TV (open-api-drive.quark.cn) integration via QR login
// Read-only: list and get playable links (streaming or download)
// All requests go through forwardProxy to avoid CORS/mixed content

const fmt = (seconds: number): string => {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m}:${s.toString().padStart(2,'0')}`;
};

export interface QuarkTVConfig {
  access_token?: string;
  refresh_token?: string;
  device_id?: string;
  expires_at?: number;
  videoLinkMethod?: 'download' | 'streaming';
  user?: { name?: string; avatar?: string };
  quotaUsed?: number;
  quotaTotal?: number;
  connected?: boolean;
}

const API_BASE = 'https://open-api-drive.quark.cn';
const CODE_API = 'http://api.extscreen.com/quarkdrive'; // token exchange helper service (as used by OpenList)
const PROXY = '/api/network/forwardProxy';

// Constants from OpenList quark_uc_tv meta
const CLIENT_ID = 'd3194e61504e493eb6222857bccfed94';
const SIGN_KEY = 'kw2dvtd7p4t3pjl2d9ed9yc8yej8kw2d';
const APP_VER = '1.8.2.2';
const CHANNEL = 'GENERAL';

function hex32(input: string): string {
  // Produce a 32-hex string deterministically (non-crypto) from input
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i); h1 = (h1 * 16777619) >>> 0;
    h2 ^= (input.charCodeAt(i) + i); h2 = (h2 * 2246822519) >>> 0;
  }
  const to8 = (n: number) => n.toString(16).padStart(8, '0');
  return (to8(h1) + to8(h2) + to8((h1 ^ h2) >>> 0) + to8(((h1 << 5) ^ (h2 >>> 3)) >>> 0)).slice(0, 32);
}

function md5Hex(input: string): string {
  // Not real MD5, but 32-hex placeholder sufficient for req_id/device_id format
  return hex32(input);
}

async function sha256Hex(input: string): Promise<string> {
  try {
    // @ts-ignore
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return hex32(input);
  }
}

export class QuarkTVManager {
  private static config: QuarkTVConfig | null = null;

  static getConfig = () => this.config;
  static setConfig = (config: QuarkTVConfig) => (this.config = config);
  static clearConnection = () => (this.config = null);

  private static async proxyRequest(url: string, method = 'GET', headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: string; headers?: Record<string,string> }> {
    const req = { url, method, timeout: 15000, headers: Object.entries(headers).map(([k, v]) => ({ [k]: v })), ...(body && { payload: body }) };
    const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }).then(r => r.json());
    if (res.code !== 0) throw new Error(`代理请求失败: ${res.msg}`);
    return { status: res.data.status, body: res.data.body, headers: res.data.headers };
  }

  private static async sign(method: string, pathname: string): Promise<{ tm: string; token: string; req_id: string; device_id: string }> {
    const tm = String(Date.now()); // ms
    const device_id = this.config?.device_id || md5Hex(tm);
    if (!this.config?.device_id) this.config = { ...(this.config || {}), device_id };
    const token = await sha256Hex(`${method}&${pathname}&${tm}&${SIGN_KEY}`);
    const req_id = md5Hex(device_id + tm);
    return { tm, token, req_id, device_id };
  }

  static async getUserInfo(): Promise<any> {
    try { return await this.request('/user', 'GET', { method: 'user_info' }); } catch { return null; }
  }

  static async startQrLogin(onStatus: (q: { data: string; key: string; message?: string }) => void, onSuccess: (account: any) => Promise<void> | void): Promise<{ stop: () => void }>{
    let stopped = false;
    const pathname = '/oauth/authorize';
    const { tm, token, req_id } = await this.sign('GET', pathname);

    const url = new URL(API_BASE + pathname);
    url.searchParams.set('auth_type', 'code');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('scope', 'netdisk');
    url.searchParams.set('qrcode', '1');
    url.searchParams.set('qr_width', '460');
    url.searchParams.set('qr_height', '460');
    url.searchParams.set('req_id', req_id);
    url.searchParams.set('access_token', '');
    url.searchParams.set('app_ver', APP_VER);
    url.searchParams.set('device_id', this.config?.device_id || '');
    url.searchParams.set('device_brand', 'Xiaomi');
    url.searchParams.set('platform', 'tv');
    url.searchParams.set('device_name', 'M2004J7AC');
    url.searchParams.set('device_model', 'M2004J7AC');
    url.searchParams.set('build_device', 'M2004J7AC');
    url.searchParams.set('build_product', 'M2004J7AC');
    url.searchParams.set('device_gpu', 'Adreno (TM) 550');
    url.searchParams.set('activity_rect', '{}');
    url.searchParams.set('channel', CHANNEL);

    const headers = { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0 (Linux; U; Android 13; zh-cn) AppleWebKit/533.1 (KHTML, like Gecko) Mobile Safari/533.1', 'x-pan-tm': tm, 'x-pan-token': token, 'x-pan-client-id': CLIENT_ID };
    const { status, body } = await this.proxyRequest(url.toString(), 'GET', headers);
    if (status !== 200) throw new Error(`获取二维码失败(${status}): ${(body||'').slice(0,200)}`);
    let resp: any = {};
    try { resp = JSON.parse(body); } catch {}
    const qrData = resp?.qr_data || '';
    const queryToken = resp?.query_token || '';
    if (!qrData || !queryToken) throw new Error(`二维码数据无效: ${(body||'').slice(0,200)}`);

    const dataUrl = qrData.startsWith('data:') ? qrData : `data:image/jpeg;base64,${qrData}`;
    onStatus({ data: dataUrl, key: queryToken, message: '请使用夸克App扫码确认' });

    const poll = async () => {
      if (stopped) return;
      try {
        const codePath = '/oauth/code';
        const s2 = await this.sign('GET', codePath);
        const url2 = new URL(API_BASE + codePath);
        url2.searchParams.set('client_id', CLIENT_ID);
        url2.searchParams.set('scope', 'netdisk');
        url2.searchParams.set('query_token', queryToken);
        url2.searchParams.set('req_id', s2.req_id);
        url2.searchParams.set('app_ver', APP_VER);
        url2.searchParams.set('device_id', this.config?.device_id || '');
        url2.searchParams.set('platform', 'tv');
        url2.searchParams.set('channel', CHANNEL);
        const { status: st2, body: b2 } = await this.proxyRequest(url2.toString(), 'GET', { 'Accept': 'application/json, text/plain, */*', 'User-Agent': headers['User-Agent'], 'x-pan-tm': s2.tm, 'x-pan-token': s2.token, 'x-pan-client-id': CLIENT_ID });
        let j: any = {}; try { j = JSON.parse(b2); } catch {}
        const code = j?.code || '';
        if (st2 === 200 && code) {
          // exchange tokens via codeApi
          const exchUrl = CODE_API + '/token';
          const payload = { req_id: s2.req_id, app_ver: APP_VER, device_id: this.config?.device_id || '', device_brand: 'Xiaomi', platform: 'tv', device_name: 'M2004J7AC', device_model: 'M2004J7AC', build_device: 'M2004J7AC', build_product: 'M2004J7AC', device_gpu: 'Adreno (TM) 550', activity_rect: '{}', channel: CHANNEL, code };
          const { body: tb, status: ts } = await this.proxyRequest(exchUrl, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload));
          let tj: any = {}; try { tj = JSON.parse(tb); } catch {}
          if (ts === 200 && (tj?.code === 200) && tj?.data?.refresh_token) {
            this.config = { ...(this.config || {}), refresh_token: tj.data.refresh_token, access_token: tj.data.access_token, connected: true };
            // fetch user info to enrich account
            let uinfo: any = null;
            try { uinfo = await this.getUserInfo(); } catch {}
            const d = uinfo?.data || uinfo || {};
            const uname = d.user_name || d.nickname || d.nick || d.name || 'QuarkTV';
            const avatar = d.avatar_url || d.user_avatar || d.avatar || d.face || '';
            const avatarFixed = String(avatar||'').replace(/^http:/,'https:');
            const used = d.used_size ?? d.usedSpace ?? d.used ?? d.space_used;
            const total = d.total_size ?? d.totalSpace ?? d.total ?? d.space_total;
            this.config = { ...this.config, user: { name: uname, avatar: avatarFixed }, quotaUsed: used, quotaTotal: total } as any;
            onStatus({ data: dataUrl, key: queryToken, message: '登录成功' });
            const account = {
              id: 'quarktv_' + Date.now(), type: 'quarktv',
              device_id: this.config.device_id,
              refresh_token: this.config.refresh_token, access_token: this.config.access_token,
              videoLinkMethod: 'streaming',
              uname,
              face: avatar,
              user_id: d.user_id || d.uid || '',
              expires_at: Date.now() + Number(tj?.data?.expires_in || 0) * 1000,
              quotaUsed: used, quotaTotal: total
            };
            await Promise.resolve(onSuccess(account));
            return;
          }
        }
      } catch {}
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 2000);
    return { stop: () => { stopped = true; } };
  }

  private static async refreshToken(): Promise<void> {
    if (!this.config?.refresh_token) throw new Error('未登录');
    const pathname = '/token';
    const { req_id } = await this.sign('POST', pathname);
    const payload = { req_id, app_ver: APP_VER, device_id: this.config?.device_id || '', device_brand: 'Xiaomi', platform: 'tv', device_name: 'M2004J7AC', device_model: 'M2004J7AC', build_device: 'M2004J7AC', build_product: 'M2004J7AC', device_gpu: 'Adreno (TM) 550', activity_rect: '{}', channel: CHANNEL, refresh_token: this.config.refresh_token } as any;
    const { body, status } = await this.proxyRequest(CODE_API + pathname, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload));
    if (status !== 200) throw new Error('刷新失败');
    const j = (()=>{ try { return JSON.parse(body); } catch { return {}; } })();
    if (j?.code !== 200 || !j?.data?.access_token) throw new Error('刷新失败');
    this.config = { ...(this.config || {}), access_token: j.data.access_token, refresh_token: j.data.refresh_token || this.config?.refresh_token, expires_at: Date.now() + Number(j?.data?.expires_in || 0) * 1000, connected: true };
  }

  private static async ensureToken(): Promise<void> {
    if (!this.config?.access_token) { await this.refreshToken(); return; }
    const exp = Number((this.config as any)?.expires_at || 0);
    if (exp && Date.now() >= exp - 60_000) await this.refreshToken();
  }

  static async initFromConfig(cfg: any): Promise<boolean> {
    try {
      const A = cfg?.settings?.quarktvAccounts || [];
      for (const acc of A) {
        try { if ((await this.checkConnection(acc)).connected) return true; } catch {}
      }
      return false;
    } catch { return false; }
  }

  private static async request(pathname: string, method: 'GET' | 'POST', query: Record<string,string> = {}, body?: any): Promise<any> {
    await this.ensureToken();
    if (!this.config?.access_token) throw new Error('未登录');
    const s = await this.sign(method, pathname);
    const url = new URL(API_BASE + pathname);
    url.searchParams.set('req_id', s.req_id);
    url.searchParams.set('access_token', this.config.access_token || '');
    url.searchParams.set('app_ver', APP_VER);
    url.searchParams.set('device_id', this.config.device_id || '');
    url.searchParams.set('device_brand', 'Xiaomi');
    url.searchParams.set('platform', 'tv');
    url.searchParams.set('device_name', 'M2004J7AC');
    url.searchParams.set('device_model', 'M2004J7AC');
    url.searchParams.set('build_device', 'M2004J7AC');
    url.searchParams.set('build_product', 'M2004J7AC');
    url.searchParams.set('device_gpu', 'Adreno (TM) 550');
    url.searchParams.set('activity_rect', '{}');
    url.searchParams.set('channel', CHANNEL);
    Object.entries(query).forEach(([k,v]) => url.searchParams.set(k, v));

    const headers: Record<string,string> = { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0 (Linux; U; Android 13; zh-cn) AppleWebKit/533.1 (KHTML, like Gecko) Mobile Safari/533.1', 'x-pan-tm': s.tm, 'x-pan-token': s.token, 'x-pan-client-id': CLIENT_ID };
    const { body: respBody, status } = await this.proxyRequest(url.toString(), method, headers, body ? JSON.stringify(body) : undefined);
    if (status !== 200) throw new Error('请求失败');
    try { return JSON.parse(respBody); } catch { return {}; }
  }

  static async checkConnection(config: QuarkTVConfig): Promise<{ connected: boolean; message: string; profile?: any }>{
    try {
      this.setConfig(config);
      const info = await this.request('/user', 'GET', { method: 'user_info' });
      const d = info?.data || {};
      const uname = d.user_name || d.nickname || d.nick || d.name || 'QuarkTV';
      const avatar = d.avatar_url || d.user_avatar || d.avatar || '';
      const used = d.used_size ?? d.usedSpace ?? d.used ?? d.space_used;
      const total = d.total_size ?? d.totalSpace ?? d.total ?? d.space_total;
      this.config = { ...this.config!, connected: true, user: { name: uname, avatar }, quotaUsed: used, quotaTotal: total } as any;
      return { connected: true, message: '连接成功', profile: d };
    } catch (e: any) {
      return { connected: false, message: `连接失败: ${e?.message || e}` };
    }
  }

  static async getDirectoryContents(parent_fid = '0'): Promise<any[]> {
    const data = await this.request('/file', 'GET', { method: 'list', parent_fid, order_by: '3', desc: '1', list_all: '0', page_size: '100', page_index: '0' });
    const files = Array.isArray(data?.data?.files) ? data.data.files : Array.isArray(data?.data?.list) ? data.data.list : [];
    return files;
  }

  static async createMediaItemsFromDirectory(path = ''): Promise<any[]> {
    const parentId = (path || '').split('/').filter(Boolean).pop()?.split('|')[1] || '0';
    const items = await this.getDirectoryContents(parentId);
    const result: any[] = [];
    for (const it of items) {
      const name = it.filename || it.file_name || it.name || '';
      const fid = it.fid || it.id;
      const isDir = (it.isdir === 1 || it.isdir === true) || (!('isdir' in it) && !it.file) || (it.category === 0 && !/\.[a-z0-9]+$/i.test(name));
      if (isDir) {
        result.push({ id: `quarktv-folder-${fid}`, title: name, type: 'folder', url: '#', source: 'quarktv', sourcePath: `${path || ''}/${name}|${fid}`, is_dir: true, thumbnail: '/plugins/siyuan-media-player/assets/images/folder.svg' });
      } else {
        const isAudio = /\.(mp3|aac|m4a|flac|wav|ogg)$/i.test(name);
        const isPdfFile = isPdf(name);
        const pseudoUrl = `quarktv://file/${fid}`;
        const thumb = it.big_thumbnail_url || it.thumbnail_url || '';
        const duration = typeof it.duration === 'number' ? fmt(it.duration) : '';
        if (isPdfFile) {
          result.push({ id: `quarktv-${fid}`, title: name, url: pseudoUrl, originalUrl: pseudoUrl, type: 'pdf', source: 'quarktv', sourcePath: `${path || ''}/${name}|${fid}`, thumbnail: '/plugins/siyuan-media-player/assets/images/pdf.svg', duration: '' });
        } else {
          result.push({ id: `quarktv-${fid}`, title: name, url: pseudoUrl, originalUrl: pseudoUrl, type: isAudio ? 'audio' : 'video', source: 'quarktv', sourcePath: `${path || ''}/${name}|${fid}`, thumbnail: (thumb || (isAudio ? '/plugins/siyuan-media-player/assets/images/audio.png' : '/plugins/siyuan-media-player/assets/images/video.png')), duration });
        }
      }
    }
    return result;
  }

  static async getStreamingUrl(fid: string): Promise<{ url: string; qualities?: Array<{ default: boolean; html: string; url: string }> }> {
    const data = await this.request('/file', 'GET', { method: 'streaming', group_by: 'source', fid, resolution: 'low,normal,high,super,2k,4k', support: 'dolby_vision' });
    const list: any[] = data?.data?.video_info || data?.data?.videoList || [];
    const qs = list.filter(x => x?.url).map((v: any, i: number) => ({ default: i === 0, html: v?.resolution || v?.resoultion || 'auto', url: v.url }));
    const first = qs[0]?.url || '';
    return { url: first, qualities: qs };
  }

  static async getDownloadUrl(fid: string): Promise<{ url: string; fileName?: string }> {
    const data = await this.request('/file', 'GET', { method: 'download', group_by: 'source', fid });
    return { url: data?.data?.download_url || data?.data?.downloadURL || '', fileName: data?.data?.file_name || data?.data?.filename };
  }

  static async createMediaItemFromPath(path: string, timeParams: { startTime?: number; endTime?: number } = {}): Promise<any> {
    const [name, fid] = (path.split('/').filter(Boolean).pop() || '').split('|');
    const prefer = (this.config?.videoLinkMethod || 'streaming');
    const res = prefer === 'download' ? { url: await this.getDownloadUrl(fid), qualities: undefined } : await this.getStreamingUrl(fid);
    return {
      id: `quarktv-${fid}-${Date.now()}`,
      title: name || '未命名',
      url: `quarktv://file/${fid}`,
      originalUrl: `quarktv://file/${fid}`,
      type: /\.(mp3|aac|m4a|flac|wav|ogg)$/i.test(name) ? 'audio' : 'video',
      source: 'quarktv',
      sourcePath: fid,
      thumbnail: '/plugins/siyuan-media-player/assets/images/video.png',
      ...(res.qualities ? { quality: res.qualities } : {}),
      ...timeParams,
      isLoop: timeParams.endTime !== undefined
    };
  }

  static getFileLink(fileId: string): Promise<string> { return Promise.resolve(`quarktv://file/${fileId}`); }

  static async resolvePlayableInfo(url: string, options: any): Promise<{ finalUrl: string; finalOptions: any }>{
    const fid = url.startsWith('quarktv://file/') ? (url.split('/').pop() || '').split('?')[0] : (options?.sourcePath?.includes('|') ? options.sourcePath.split('|').pop() : options?.fileId || options?.fid || '');
    if (!fid) return { finalUrl: url, finalOptions: options };
    const prefer = (this.config?.videoLinkMethod || 'streaming');
    if (prefer === 'download') {
      const dl = await this.getDownloadUrl(fid);
      return { finalUrl: dl.url || url, finalOptions: { ...options, source: 'quarktv', originalUrl: url, ...(dl.fileName ? { title: dl.fileName } : {}) } };
    }
    const st = await this.getStreamingUrl(fid);
    let inferredTitle: string | undefined;
    try { const meta = await this.getDownloadUrl(fid); if (meta.fileName) inferredTitle = meta.fileName; } catch {}
    const finalOptions = { ...options, source: 'quarktv', originalUrl: url, ...(st.qualities ? { quality: st.qualities } : {}), ...(inferredTitle ? { title: inferredTitle } : {}) };
    return { finalUrl: st.url || url, finalOptions };
  }
}

