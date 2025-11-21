import { isPdf } from './player';

export interface BaiduDriveConfig {
  client_id: string; // Baidu AppKey
  client_secret?: string; // Baidu SecretKey
  scopes?: string | string[]; // usually: "basic,netdisk"
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { avatar?: string; name?: string; uk?: string };
  connected?: boolean;
}

const OAUTH_BASE = 'https://openapi.baidu.com';
const PAN_BASE = 'https://pan.baidu.com';
const PROXY = '/api/network/forwardProxy';

// 应用凭证配置
// 思源笔记媒体播放器插件 - 百度开放平台已审核通过
// AppID: 120284540
// 应用名称: 思源笔记媒体播放器插件
const BAIDU_APP_KEY = 'mwskgOMdOFfyzYnD73LkzOd7vFbQX6oc';
const BAIDU_APP_SECRET = 'h8jBxz1s4DxzmK6yKiMcSWDaKdfbSTVW';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BAIDU_SIGN_KEY = '8fxQXB@0*3V~1XoYw-=KUc-F3Esy0KGh'; // 用于签名验证（预留，如需签名请求时启用）
const BAIDU_SCOPE = 'basic,netdisk';
const BAIDU_REDIRECT_URI = 'oob';


export class BaiduDriveManager {
  private static config: BaiduDriveConfig | null = null;

  private static async proxyRequest(
    url: string,
    method = 'GET',
    headers: Record<string, string> = {},
    body?: string,
    responseEncoding?: 'base64' | 'utf8'
  ): Promise<{ status: number; body: string; contentType?: string }> {
    const req: any = {
      url,
      method,
      timeout: 30000, // 延长超时以支持大文件下载
      headers: Object.entries(headers).map(([k, v]) => ({ [k]: v })),
      ...(body && { payload: body })
    };
    if (responseEncoding) {
        req.responseEncoding = responseEncoding;
    }
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    }).then(r => r.json());
    if (res.code !== 0) throw new Error(`代理请求失败: ${res.msg}`);
    return { status: res.data.status, body: res.data.body, contentType: res.data.contentType };
  }

  private static parseJson<T = any>(text: string): T {
    try { return JSON.parse(text) as T; } catch { return {} as any; }
  }

  // scopes 固定为 basic,netdisk（设置中已简化，无需外部传入）


  private static updateToken(token: { access_token: string; refresh_token?: string; expires_in?: number }) {
    if (!this.config) this.config = {} as any;
    Object.assign(this.config, {
      access_token: token.access_token,
      ...(token.refresh_token && { refresh_token: token.refresh_token }),
      ...(token.expires_in && { expires_at: Date.now() + token.expires_in * 1000 })
    });
  }

  // Token 自动刷新
  private static async refreshToken(): Promise<boolean> {
    if (!this.config?.refresh_token) return false;
    try {
      const qs = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.config.refresh_token,
        client_id: BAIDU_APP_KEY,
        client_secret: BAIDU_APP_SECRET
      });
      const { body, status } = await this.proxyRequest(
        `${OAUTH_BASE}/oauth/2.0/token?${qs.toString()}`,
        'GET',
        { 'User-Agent': 'pan.baidu.com' }
      );
      if (status !== 200) return false;
      const token = this.parseJson<any>(body);
      if (token.error || !token.access_token) return false;
      this.updateToken(token);
      // 触发配置更新事件，让外部保存
      this.notifyConfigUpdate();
      return true;
    } catch (e) {
      console.error('[BaiduDrive] Token refresh failed:', e);
      return false;
    }
  }

  // 通知配置更新（供外部保存）
  private static notifyConfigUpdate() {
    if (this.config && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('baidudriveConfigUpdate', { detail: this.config }));
    }
  }

  // 带自动重试的请求封装
  private static async requestWithRetry<T>(fn: () => Promise<T>, retried = false): Promise<T> {
    try {
      return await fn();
    } catch (e: any) {
      // Token过期且未重试过，则刷新后重试一次
      if (!retried && e.message === 'TOKEN_EXPIRED') {
        const refreshed = await this.refreshToken();
        if (refreshed) return this.requestWithRetry(fn, true);
      }
      throw e;
    }
  }

  static getConfig = () => this.config;
  static setConfig = (config: BaiduDriveConfig) => this.config = config;
  static clearConnection = () => this.config = null;

  static async initFromConfig(config: any): Promise<boolean> {
    for (const acc of config?.settings?.baidudriveAccounts || []) {
      try { if ((await this.checkConnection(acc)).connected) return true; } catch {}
    }
    return false;
  }

  static async checkConnection(config: BaiduDriveConfig): Promise<{ connected: boolean; message: string; profile?: any }> {
    try {
      this.setConfig(config);
      if (!config.access_token) throw new Error('缺少令牌');
      const [profile, space] = await Promise.all([this.getUserInfo().catch(() => null), this.getSpaceInfo()]);
      // 使用与createAccount一致的扁平结构
      this.config = { 
        ...config, 
        connected: true,
        uname: profile?.baidu_name || profile?.netdisk_name || 'BaiduNetdisk',
        user_name: profile?.netdisk_name,
        baidu_name: profile?.baidu_name,
        netdisk_name: profile?.netdisk_name,
        uk: String(profile?.uk || ''),
        face: profile?.avatar_url || profile?.avatar,
        quotaUsed: space?.used,
        quotaTotal: space?.total
      } as any;
      return { connected: true, message: '连接成功', profile };
    } catch (e: any) {
      return { connected: false, message: `连接失败: ${e.message}` };
    }
  }

  // 统一账号对象构造
  private static createAccount(profile: any, space: any, base: { client_id: string; client_secret?: string; scopes: string }) {
    return {
      id: 'baidu_' + String(profile?.uk || Date.now()),
      client_id: base.client_id,
      client_secret: base.client_secret,
      scopes: base.scopes,
      access_token: this.config?.access_token,
      refresh_token: this.config?.refresh_token,
      expires_at: this.config?.expires_at,
      uname: profile?.baidu_name || profile?.netdisk_name || 'BaiduNetdisk',
      user_name: profile?.netdisk_name,
      baidu_name: profile?.baidu_name,
      netdisk_name: profile?.netdisk_name,
      uk: String(profile?.uk || ''),
      face: profile?.avatar_url || profile?.avatar,
      quotaUsed: space?.used,
      quotaTotal: space?.total
    };
  }

  // 设备码（扫码）登录：显示二维码/链接，轮询换取 token
  // 极简设备码登录（无参数）
  static async startDeviceLoginSimple(
    onStatus: (q: { data: string; key: string; message?: string }) => void,
    onSuccess: (account: any) => Promise<void> | void
  ): Promise<{ stop: () => void }> {
    return this.startDeviceLogin(BAIDU_APP_KEY, BAIDU_APP_SECRET, BAIDU_SCOPE, onStatus, onSuccess);
  }

  static async startDeviceLogin(
    client_id: string,
    client_secret: string | undefined,
    scopes: string | string[],
    onStatus: (q: { data: string; key: string; message?: string }) => void,
    onSuccess: (account: any) => Promise<void> | void
  ): Promise<{ stop: () => void }> {
    const scope = Array.isArray(scopes) ? scopes.join(',') : String(scopes || BAIDU_SCOPE);

    // 1) 请求 device_code（HTTPS GET 即可）
    const url = `${OAUTH_BASE}/oauth/2.0/device/code?response_type=device_code&client_id=${encodeURIComponent(client_id)}&scope=${encodeURIComponent(scope)}`;
    const { body: codeBody, status: codeStatus } = await this.proxyRequest(url, 'GET', { 'Accept': 'application/json' });
    if (codeStatus !== 200) throw new Error('获取设备码失败');
    const codeResp = this.parseJson<any>(codeBody);

    const device_code: string = codeResp.device_code;
    const user_code: string = codeResp.user_code;

    if (!device_code || !user_code) throw new Error('设备码响应不完整');

    const qrImg = codeResp.qrcode_url || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://openapi.baidu.com/device?display=mobile&code=${user_code}`)}`;
    onStatus({ data: qrImg, key: device_code, message: '请使用百度App扫描二维码' });

    // 2) 轮询 token
    let timer: number | null = null;
    const interval = Math.max(3000, (Number(codeResp.interval || 5)) * 1000);

    const poll = async () => {
      try {
        const token = await this.exchangeDeviceToken(client_id, client_secret, device_code);
        if (token?.access_token) {
          timer && clearInterval(timer);
          this.updateToken(token);
          const [profile, space] = await Promise.all([this.getUserInfo().catch(() => null), this.getSpaceInfo()]);
          onStatus({ data: qrImg, key: device_code, message: '授权成功' });
          await onSuccess(this.createAccount(profile, space, { client_id, client_secret, scopes: scope }));
        }
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (/authorization_pending|slow_down/i.test(msg)) {
          onStatus({ data: qrImg, key: device_code, message: '等待确认' });
        } else if (/expired|invalid_grant|access_denied/i.test(msg)) {
          timer && clearInterval(timer);
          onStatus({ data: qrImg, key: device_code, message: '二维码已过期或被拒绝' });
        }
      }
    };

    timer = window.setInterval(poll, interval);
    return { stop: () => timer && clearInterval(timer) };
  }

  // 极简授权码模式：提供统一URL与一键完成
  static getAuthorizeUrl(): string {
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: BAIDU_APP_KEY,
      redirect_uri: BAIDU_REDIRECT_URI,
      scope: BAIDU_SCOPE,
      qrcode: '1', qrcodeW: '220', qrcodeH: '220'
    });
    return `${OAUTH_BASE}/oauth/2.0/authorize?${qs.toString()}`;
  }

  static async authorizeByCodeSimple(code: string): Promise<{ account: any }> {
    if (!code || !code.trim()) throw new Error('请粘贴授权码 Code');
    const token = await this.exchangeTokenByCode(BAIDU_APP_KEY, BAIDU_APP_SECRET, code.trim(), BAIDU_REDIRECT_URI);
    this.updateToken(token);
    this.config = { ...(this.config || {}), client_id: BAIDU_APP_KEY, client_secret: BAIDU_APP_SECRET, scopes: BAIDU_SCOPE } as any;
    const [profile, space] = await Promise.all([this.getUserInfo().catch(() => null), this.getSpaceInfo()]);
    return { account: this.createAccount(profile, space, { client_id: BAIDU_APP_KEY, client_secret: BAIDU_APP_SECRET, scopes: BAIDU_SCOPE }) };
  }

  private static async exchangeTokenByCode(
    client_id: string,
    client_secret: string | undefined,
    code: string,
    redirect_uri: string
  ): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
    const qs = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id,
      redirect_uri,
      ...(client_secret ? { client_secret } : {}) as any
    });
    const { body, status } = await this.proxyRequest(
      `${OAUTH_BASE}/oauth/2.0/token?${qs.toString()}`,
      'GET',
      { 'User-Agent': 'pan.baidu.com' }
    );
    if (status !== 200) throw new Error('换取令牌失败');
    const token = this.parseJson<any>(body);
    if (token.error_description || token.error) throw new Error(token.error_description || token.error);
    return token;
  }

  private static async exchangeDeviceToken(
    client_id: string,
    client_secret: string | undefined,
    device_code: string
  ): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
    // 兼容不同文档的命名（按顺序尝试）
    const candidates: Array<[string, Record<string, string>]> = [
      ['device_token', { grant_type: 'device_token', code: device_code }],
      ['device_code', { grant_type: 'device_code', code: device_code }],
      ['urn:ietf:params:oauth:grant-type:device_code', { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code }]
    ];

    let lastErr: any = null;
    for (const [, base] of candidates) {
      const qs = new URLSearchParams({ client_id, ...(client_secret ? { client_secret } : {}), ...base });
      const url = `${OAUTH_BASE}/oauth/2.0/token?${qs.toString()}`;
      const { body, status } = await this.proxyRequest(
        url,
        'GET',
        { 'User-Agent': 'pan.baidu.com' }
      );
      const data = this.parseJson<any>(body);
      if (status === 200 && data.access_token) return data;
      lastErr = new Error(data.error_description || data.error || `status=${status}`);
      // authorization_pending / slow_down 时由上层处理为继续轮询
      if (data.error === 'authorization_pending' || data.error === 'slow_down') throw lastErr;
    }
    throw lastErr || new Error('设备码令牌获取失败');
  }

  static async getUserInfo(): Promise<any> {
    if (!this.config?.access_token) throw new Error('百度网盘未登录，请先添加账号');
    return this.requestWithRetry(async () => {
      const url = `${PAN_BASE}/rest/2.0/xpan/nas?method=uinfo&vip_version=v2&access_token=${encodeURIComponent(this.config.access_token!)}`;
      const { body, status } = await this.proxyRequest(url, 'GET', { 'User-Agent': 'pan.baidu.com' });
      const data = this.parseJson<any>(body);
      // 检查错误码：111=access_token过期，-6=身份验证失败
      if (data.errno && [111, -6].includes(data.errno)) throw new Error('TOKEN_EXPIRED');
      if (status !== 200) throw new Error(`获取用户信息失败 (HTTP ${status})`);
      return data;
    });
  }

  static async getSpaceInfo(): Promise<{ used?: number; total?: number } | null> {
    if (!this.config?.access_token) return null;
    try {
      const url = `${PAN_BASE}/api/quota?checkfree=1&checkexpire=1&access_token=${encodeURIComponent(this.config.access_token!)}`;
      const { body, status } = await this.proxyRequest(url, 'GET', { 'User-Agent': 'pan.baidu.com' });
      if (status !== 200) return null;
      const data = this.parseJson<any>(body);
      return { used: data?.used, total: data?.total };
    } catch { return null; }
  }

  // ============ 最小文件/目录/媒体能力 ============

  private static isAudio(name: string): boolean { return /\.(mp3|aac|m4a|flac|wav|ogg)$/i.test(name); }

  static async getDirectoryContents(dir = '/'): Promise<any[]> {
    if (!this.config?.access_token) throw new Error('百度网盘未登录，请先添加账号');
    return this.requestWithRetry(async () => {
      const url = `${PAN_BASE}/rest/2.0/xpan/file?method=list&web=1&order=time&desc=1&start=0&limit=200&dir=${encodeURIComponent(dir)}&access_token=${encodeURIComponent(this.config.access_token!)}`;
      const { body, status } = await this.proxyRequest(url, 'GET', { 'User-Agent': 'pan.baidu.com' });
      const data = this.parseJson<any>(body);
      if (data.errno && [111, -6].includes(data.errno)) throw new Error('TOKEN_EXPIRED');
      if (status !== 200) return [];
      return Array.isArray(data?.list) ? data.list : [];
    });
  }

  private static async _getStreamingUrl(quality: string, path: string): Promise<string | null> {
    return this.requestWithRetry(async () => {
      const baseUrl = `${PAN_BASE}/rest/2.0/xpan/file?method=streaming&type=${quality}&path=${encodeURIComponent(path)}&access_token=${encodeURIComponent(this.config!.access_token!)}`;
      const headers = { 'User-Agent': 'pan.baidu.com', 'Referer': 'https://pan.baidu.com/' };
      const firstResp = await this.proxyRequest(`${baseUrl}&nom3u8=1`, 'GET', headers).catch(() => null);
      const adInfo = firstResp ? this.parseJson<any>(firstResp.body) : null;
      if (adInfo?.errno && [111, -6].includes(adInfo.errno)) throw new Error('TOKEN_EXPIRED');
      if (adInfo && (adInfo.adToken || adInfo.errno === 133 || adInfo.errno === 0)) {
        const wait = Math.max(0, Number(adInfo.ltime || 0)) * 1000;
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        return adInfo.adToken ? `${baseUrl}&adToken=${encodeURIComponent(adInfo.adToken)}` : baseUrl;
      }
      return null;
    });
  }

  static async getDirectPlayUrl(path: string): Promise<string> {
    if (!this.config?.access_token) throw new Error('百度网盘未登录，请先添加账号');
    const realPath = path;
    if (!realPath || !realPath.startsWith('/')) throw new Error('文件路径无效');

    const qualities = this.isAudio(realPath) ? ['M3U8_HLS_MP3_128'] : ['M3U8_AUTO_1080', 'M3U8_AUTO_720', 'M3U8_AUTO_480'];
    for (const q of qualities) {
      const url = await this._getStreamingUrl(q, realPath);
      if (url) return url;
    }
    throw new Error('百度网盘视频暂不可用（可能需要会员权限或文件已失效）');
  }

  static async getAllQualityUrls(path: string): Promise<Array<{ default: boolean; html: string; url: string }>> {
    if (!this.config?.access_token) throw new Error('百度网盘未登录，请先添加账号');
    const realPath = path;
    if (!realPath || !realPath.startsWith('/')) return [];

    const qualityTypes = this.isAudio(realPath) ? ['M3U8_HLS_MP3_128'] : ['M3U8_AUTO_1080', 'M3U8_AUTO_720', 'M3U8_AUTO_480'];
    const qualityNames = { 'M3U8_AUTO_1080': '1080P', 'M3U8_AUTO_720': '720P', 'M3U8_AUTO_480': '480P', 'M3U8_HLS_MP3_128': '音频' } as Record<string, string>;

    const results = await Promise.all(
      qualityTypes.map(q => this._getStreamingUrl(q, realPath))
    );

    const available = results
      .map((url, i) => (url ? { html: qualityNames[qualityTypes[i]] || qualityTypes[i], url } : null))
      .filter(Boolean) as Array<{ html: string; url: string }>;

    return available.map((item, idx) => ({ default: idx === 0, html: item.html, url: item.url }));
  }


  static async createMediaItemsFromDirectory(path = ''): Promise<any[]> {
    const dir = (path || '') || '/';
    const items = await this.getDirectoryContents(dir);
    const result: any[] = [];
    for (const it of items) {
      if (it.isdir === 1) {
        result.push({ id: `baidudrive-folder-${it.path}`, title: it.server_filename, type: 'folder', url: '#', source: 'baidudrive', sourcePath: it.path, is_dir: true, thumbnail: '/plugins/siyuan-media-player/assets/images/folder.svg' });
      } else {
        const name = it.server_filename || '';
        const isAudio = this.isAudio(name);
        const isPdfFile = isPdf(name);
        const pathUrl = `bdpan://path${it.path}`; // 原始路径伪协议
        const cover = it?.thumbs?.url2 || it?.thumbs?.url1 || '';
        result.push({ id: `baidudrive-${it.fs_id}`, title: name, url: pathUrl, originalUrl: pathUrl, type: isPdfFile ? 'pdf' : (isAudio ? 'audio' : 'video'), source: 'baidudrive', sourcePath: it.path, thumbnail: isPdfFile ? '/plugins/siyuan-media-player/assets/images/pdf.svg' : (cover || (isAudio ? '/plugins/siyuan-media-player/assets/images/audio.png' : '/plugins/siyuan-media-player/assets/images/video.png')) });
      }
    }
    return result;
  }

  static async resolvePlayableInfo(url: string, options: any): Promise<{ finalUrl: string; finalOptions: any; }> {
    // 仅依赖 path，极简
    let path = '';
    const urlToParse = url.startsWith('bdpan://') ? url : options.originalUrl || '';
    if (urlToParse.startsWith('bdpan://path/')) {
        const pathPart = urlToParse.substring('bdpan://path'.length);
        try { path = decodeURIComponent(pathPart.split('?')[0]); } catch { path = pathPart.split('?')[0]; }
    } else if (typeof options.sourcePath === 'string') {
        path = options.sourcePath;
    }

    if (!path || !path.startsWith('/')) throw new Error('找不到文件路径');

    let qualities = await this.getAllQualityUrls(path);
    let finalUrl = qualities[0]?.url || '';
    if (!finalUrl) finalUrl = await this.getDirectPlayUrl(path).catch(() => '');
    if (!finalUrl) throw new Error('百度网盘视频暂不可用（未获取到可播放链接）');

    if (!qualities.length) qualities = await this.getAllQualityUrls(path).catch(() => []);

    return {
      finalUrl,
      finalOptions: { ...options, source: 'baidudrive', quality: qualities, originalUrl: `bdpan://path${path}`, sourcePath: path }
    };
  }

  // 供统一入口解析：仅支持 path
  static async getFileLink(path: string): Promise<string> {
    if (!this.config?.access_token) throw new Error('百度网盘未登录，请先添加账号');
    const qs = await this.getAllQualityUrls(path);
    if (qs[0]?.url) return qs[0].url;
    return await this.getDirectPlayUrl(path);
  }

  private static _createBlobUrl(base64: string, type = 'application/pdf'): string {
    const bytes = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
    return URL.createObjectURL(new Blob([bytes], { type }));
  }

  static async getDownloadLink(fsid: string): Promise<string> {
    if (!this.config?.access_token) throw new Error('百度网盘未登录，请先添加账号');
    const metaUrl = `${PAN_BASE}/rest/2.0/xpan/multimedia?method=filemetas&fsids=[${fsid}]&dlink=1&access_token=${encodeURIComponent(this.config.access_token!)}`;
    const { body: metaBody } = await this.proxyRequest(metaUrl, 'GET', { 'User-Agent': 'pan.baidu.com' });
    const dlink = this.parseJson<any>(metaBody)?.list?.[0]?.dlink;
    if (!dlink) throw new Error('无法获取文件下载链接（文件可能已失效或需要会员权限）');

    const downloadUrl = `${dlink}&access_token=${encodeURIComponent(this.config.access_token!)}`;
    const { body: fileBody, contentType } = await this.proxyRequest(downloadUrl, 'GET', { 'User-Agent': 'pan.baidu.com' }, undefined, 'base64');
    return this._createBlobUrl(fileBody, contentType || 'application/pdf');
  }

  static async createMediaItemFromPath(path: string, timeParams: { startTime?: number; endTime?: number } = {}): Promise<any> {
    const p = path;
    let playUrl = '';
    if (p) {
      const qs = await this.getAllQualityUrls(p);
      playUrl = (qs.find(q => q.default) || qs[0])?.url || '';
    }
    if (!playUrl && p) playUrl = await this.getDirectPlayUrl(p);
    return {
      id: `baidudrive-${Date.now()}`,
      title: ((p.split('/').pop() || '未命名')),
      url: playUrl,
      originalUrl: p ? `bdpan://path${p}` : playUrl,
      type: this.isAudio(p) ? 'audio' : 'video',
      source: 'baidudrive',
      sourcePath: path,
      thumbnail: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      ...timeParams,
      isLoop: timeParams.endTime !== undefined
    };
  }
}

