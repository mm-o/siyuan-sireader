export interface Pan123Config {
  // 开发者授权模式所需
  client_id: string;
  client_secret: string;
  // 可选：根目录/默认目录（0 表示根）
  root_id?: string | number;
  // 运行时令牌与状态
  access_token?: string;
  expires_at?: number; // 毫秒时间戳
  connected?: boolean;
  // 展示信息（可选）
  name?: string;
}

const API_BASE = 'https://open-api.123pan.com';
const PROXY = '/api/network/forwardProxy';

// 仅用于媒体类型判断
import { EXT } from './player';

export class Pan123Manager {
  private static config: Pan123Config | null = null;

  // 代理请求（统一走思源转发，避免 CORS）
  private static async proxyRequest(
    url: string,
    method = 'POST',
    headers: Record<string, string> = {},
    body?: any
  ): Promise<{ status: number; body: string }> {
    const req = {
      url,
      method,
      timeout: 15000,
      headers: Object.entries(headers).map(([k, v]) => ({ [k]: v })),
      ...(body !== undefined ? { payload: typeof body === 'string' ? body : JSON.stringify(body) } : {})
    };
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    }).then(r => r.json());
    if (res.code !== 0) throw new Error(`代理请求失败: ${res.msg}`);
    return { status: res.data.status, body: res.data.body };
  }

  private static parseJson<T = any>(text: string): T {
    try { return JSON.parse(text) as T; } catch { return {} as any; }
  }

  private static parseExpiredAt(expiredAt?: string): number | undefined {
    if (!expiredAt) return undefined;
    const t = Date.parse(expiredAt);
    return Number.isFinite(t) ? t : undefined;
  }

  private static updateToken(accessToken: string, expiredAt?: string) {
    if (!this.config) this.config = {} as any;
    this.config.access_token = accessToken;
    const ts = this.parseExpiredAt(expiredAt);
    if (ts) this.config.expires_at = ts;
  }

  static getConfig() { return this.config; }
  static setConfig(cfg: Pan123Config) { this.config = cfg; }
  static clearConnection() { this.config = null; }

  // 从配置初始化 - 支持多账号
  static async initFromConfig(config: any): Promise<boolean> {
    const accounts = config?.settings?.pan123Accounts || [];
    if (!accounts.length) return false;
    for (const acc of accounts) {
      try { if ((await this.checkConnection(acc)).connected) return true; } catch {}
    }
    return false;
  }

  // 开发者授权模式：用 client_id + client_secret 换取应用级 access_token
  static async fetchAccessToken(client_id?: string, client_secret?: string): Promise<{ accessToken: string; expiredAt?: string }> {
    const cid = client_id || this.config?.client_id || '';
    const csec = client_secret || this.config?.client_secret || '';
    if (!cid || !csec) throw new Error('缺少 client_id 或 client_secret');

    const { status, body } = await this.proxyRequest(
      `${API_BASE}/api/v1/access_token`,
      'POST',
      { 'Content-Type': 'application/json', 'Platform': 'open_platform' },
      { clientID: cid, clientSecret: csec }
    );
    if (status !== 200) throw new Error('获取 access_token 失败');
    const data = this.parseJson<any>(body);
    // 兼容不同返回结构（优先 code === 0 的结构）
    if (typeof data?.code !== 'undefined' && data.code !== 0) {
      throw new Error(data?.message || '获取 access_token 失败');
    }
    const token = data?.data?.accessToken || data?.accessToken || '';
    const expiredAt = data?.data?.expiredAt || data?.expiredAt;
    if (!token) throw new Error('返回中未包含 accessToken');
    this.updateToken(token, expiredAt);
    return { accessToken: token, expiredAt };
  }

  private static isTokenExpiringSoon(): boolean {
    if (!this.config?.expires_at) return false;
    return Date.now() >= (this.config.expires_at - 60_000); // 提前 60s 刷新
    }

  private static async ensureToken(): Promise<void> {
    if (!this.config?.access_token || this.isTokenExpiringSoon()) {
      await this.fetchAccessToken();
    }
  }

  // 连通性校验：验证令牌并拉取用户信息
  static async checkConnection(config: Pan123Config): Promise<{ connected: boolean; message: string; profile?: any }> {
    try {
      this.setConfig(config);
      const r = await this.fetchAccessToken(config.client_id, config.client_secret);
      this.config = { ...config, access_token: r.accessToken, expires_at: this.parseExpiredAt(r.expiredAt), connected: true };
      const profile = await this.getUserInfo().catch(() => null);
      // 映射到通用字段，便于设置面板展示
      if (profile) {
        (this.config as any).uname = profile.nickname;
        (this.config as any).user_name = profile.nickname;
        (this.config as any).user_id = String(profile.uid);
        (this.config as any).face = profile.headImage;
        (this.config as any).quotaUsed = Number(profile.spaceUsed || 0);
        (this.config as any).quotaTotal = Number(profile.spacePermanent || 0) + Number(profile.spaceTemp || 0);
      }
      return { connected: true, message: '连接成功', profile };
    } catch (e: any) {
      return { connected: false, message: `连接失败: ${e?.message || e}` };
    }
  }

  // ============ 只读能力（目录/文件/播放） ============
  // 说明：部分文件接口可能要求 OAuth 用户授权，如果遇到 401/权限错误，请与业务确认。

  static async listFilesRaw(parentId: string | number = 0): Promise<any[]> {
    await this.ensureToken();
    // 规范化 parentId：'/' 或空值均视为 0
    let pid = parentId as any;
    if (pid === '/' || pid === '' || pid === undefined || pid === null) pid = this.config?.root_id ?? 0;
    pid = Number(pid) || 0;
    const url = `${API_BASE}/api/v2/file/list?parentFileId=${encodeURIComponent(pid)}&limit=100`;
    const { body, status } = await this.proxyRequest(url, 'GET', { 'Platform': 'open_platform', 'Authorization': `Bearer ${this.config?.access_token}` });
    if (status !== 200) throw new Error('列目录失败');
    const data = this.parseJson(body);
    if (typeof data?.code !== 'undefined' && data.code !== 0) throw new Error(data?.message || '列目录失败');
    const list = data?.data?.fileList || [];
    return Array.isArray(list) ? list.filter((x:any)=> (x?.trashed ?? 0) === 0) : [];
  }

  // 获取用户信息
  static async getUserInfo(): Promise<any> {
    await this.ensureToken();
    const { body, status } = await this.proxyRequest(
      `${API_BASE}/api/v1/user/info`,
      'GET',
      { 'Platform': 'open_platform', 'Authorization': `Bearer ${this.config?.access_token}` }
    );
    if (status !== 200) throw new Error('获取用户信息失败');
    const data = this.parseJson(body);
    if (typeof data?.code !== 'undefined' && data.code !== 0) throw new Error(data?.message || '获取用户信息失败');
    return data?.data || data;
  }

  // 原文件直链（标准下载信息）：GET /api/v1/file/download_info?fileId=xxx
  static async getDownloadInfo(fileId: string | number): Promise<{ url: string }> {
    await this.ensureToken();
    const url = `${API_BASE}/api/v1/file/download_info?fileId=${encodeURIComponent(String(fileId))}`;
    const { body, status } = await this.proxyRequest(
      url,
      'GET',
      { 'Platform': 'open_platform', 'Authorization': `Bearer ${this.config?.access_token}` }
    );
    if (status !== 200) throw new Error('获取下载信息失败');
    const data = this.parseJson<any>(body);
    if (typeof data?.code !== 'undefined' && data.code !== 0) throw new Error(data?.message || '获取下载信息失败');
    const dl = data?.data?.downloadUrl || '';
    if (!dl) throw new Error('未获取到下载链接');
    return { url: dl };
  }

  // 按分辨率请求转码m3u8或ts的下载地址
  static async getTranscodeDownloadUrl(params: { fileId: string | number; resolution: string; type?: 1 | 2; tsName?: string }): Promise<{ downloadUrl: string; isFull: boolean }> {
    await this.ensureToken();
    const { fileId, resolution, type = 1, tsName } = params;
    const { body, status } = await this.proxyRequest(
      `${API_BASE}/api/v1/transcode/m3u8_ts/download`,
      'POST',
      { 'Content-Type': 'application/json', 'Platform': 'open_platform', 'Authorization': `${this.config?.access_token}` },
      { fileId: Number(fileId), resolution, type, ...(tsName ? { tsName } : {}) }
    );
    if (status !== 200) throw new Error('获取转码下载地址失败');
    const data = this.parseJson<any>(body);
    if (typeof data?.code !== 'undefined' && data.code !== 0) {
      // 将服务端错误原样抛出，便于前端提示，例如："转码空间不存在 fileId:xxx 的文件"
      throw new Error(String(data?.message || '获取转码下载地址失败'));
    }
    const downloadUrl = data?.data?.downloadUrl || '';
    const isFull = Boolean(data?.data?.isFull);
    return { downloadUrl, isFull };
  }
  // 原文件直链下载地址（非转码）
  static async getOriginalFileDownloadUrl(fileId: string | number): Promise<{ downloadUrl: string; isFull: boolean }> {
    await this.ensureToken();
    const { body, status } = await this.proxyRequest(
      `${API_BASE}/api/v1/transcode/file/download`,
      'POST',
      { 'Content-Type': 'application/json', 'Platform': 'open_platform', 'Authorization': `${this.config?.access_token}` },
      { fileId: Number(fileId) }
    );
    if (status !== 200) throw new Error('获取原文件下载地址失败');
    const data = this.parseJson<any>(body);
    if (typeof data?.code !== 'undefined' && data.code !== 0) throw new Error(data?.message || '获取原文件下载地址失败');
    const downloadUrl = data?.data?.downloadUrl || '';
    const isFull = Boolean(data?.data?.isFull);
    return { downloadUrl, isFull };
  }

  // 构造视频缩略图 URL（稳定：追加 trade_key、type，并提供 w/h 保持比例）
  static async getThumbnailUrl(fileId: string | number, w = 256): Promise<string | null> {
    try {
      const { url } = await this.getDownloadInfo(fileId);
      const u = new URL(url);
      u.searchParams.set('trade_key', '123pan-thumbnail');
      u.searchParams.set('type', 'video');
      u.searchParams.set('w', String(w));
      u.searchParams.set('h', '-1');
      return u.toString();
    } catch { return null; }
  }


  // 探测可用清晰度，返回 ArtPlayer 兼容的 quality 列表
  static async getAllQualityUrls(fileId: string | number): Promise<Array<{ default: boolean; html: string; url: string }>> {
    await this.ensureToken();
    const resolutions = ['4K', '2K', '1080P', '720P', '480P', '360P'];
    const results: Array<{ html: string; url: string }> = [];
    let lastErr = '';
    for (const r of resolutions) {
      try {
        const { downloadUrl, isFull } = await this.getTranscodeDownloadUrl({ fileId, resolution: r, type: 1 });
        if (isFull) throw new Error('转码空间容量已满，请购买或清理后重试');
        if (downloadUrl) results.push({ html: r, url: downloadUrl });
      } catch (e: any) {
        lastErr = String(e?.message || e || '');
        // 某分辨率不可用，继续尝试更低分辨率
      }
    }
    if (!results.length) throw new Error(lastErr || '未获取到可播放的清晰度（可能未转码或无权限）');
    return results.map((it, idx) => ({ default: idx === 0, html: it.html, url: it.url }));
  }

  // 获取默认播放链接：优先 download_info（直链），其次转码 m3u8，最后 transcode/file/download
  static async getFileLink(fileId: string | number): Promise<string> {
    // 1) 直链优先
    try {
      const { url } = await this.getDownloadInfo(fileId);
      if (url) { console.debug('[Pan123] Using direct download url'); return url; }
    } catch (e) { console.debug('[Pan123] direct download failed:', e); }

    // 2) 转码 m3u8（带清晰度）
    try {
      const qs = await this.getAllQualityUrls(fileId);
      if (qs && qs[0]?.url) { console.debug('[Pan123] Using m3u8 url with quality:', qs.map(q=>q.html).join(',')); return qs[0].url; }
    } catch (e) { console.debug('[Pan123] m3u8 not available:', e); }

    // 3) transcode/file/download 兜底
    try {
      const { downloadUrl } = await this.getOriginalFileDownloadUrl(fileId);
      if (downloadUrl) { console.debug('[Pan123] Using transcode/file/download url'); return downloadUrl; }
    } catch (e) { console.debug('[Pan123] transcode/file/download failed:', e); }

    throw new Error('未获取到可播放的链接');
  }

  static async createMediaItemsFromDirectory(path: string | number = 0): Promise<any[]> {
    const parentId = (typeof path === 'string' && path) ? (path.split('/').filter(Boolean).pop()?.split('|')[1] || path) : (path || this.config?.root_id || 0);
    const list = await this.listFilesRaw(parentId);
    const result: any[] = [];

    for (const it of list) {
      const name = it.name || it.fileName || it.filename || '未命名';
      const isDir = it.type === 1 || Boolean(it.isDir || it.isdir || it.dir || it.is_folder || it.category === 'folder' || it.type === 'folder' || it.mimeType === 'inode/directory' || it.fileType === 1);
      const id = Number(it.fileId);
      if (!Number.isFinite(id)) continue; // 仅接受官方 fileId
      const newPath = `${path === 0 ? '' : path}/${name}|${id}`;

      if (isDir) {
        result.push({ id: `pan123-folder-${id}`, title: name, type: 'folder', url: '#', source: 'pan123', sourcePath: newPath, is_dir: true, thumbnail: '/plugins/siyuan-media-player/assets/images/folder.svg' });
      } else {
        const lower = name.toLowerCase();
        const isAudio = EXT.AUDIO.some(ext => lower.endsWith(ext));
        const isMedia = isAudio || EXT.VIDEO.some(ext => lower.endsWith(ext));
        if (!isMedia) continue;
        const pseudoUrl = `pan123://file/${id}`;
        let thumbnail = (it as any).thumbnail || (it as any).cover || '';
        if (!thumbnail && !isAudio) {
          try { thumbnail = await Pan123Manager.getThumbnailUrl(id) || ''; } catch {}
        }
        if (!thumbnail) thumbnail = isAudio ? '/plugins/siyuan-media-player/assets/images/audio.png' : '/plugins/siyuan-media-player/assets/images/video.png';
        result.push({ id: `pan123-${id}`, title: name, url: pseudoUrl, originalUrl: pseudoUrl, type: isAudio ? 'audio' : 'video', source: 'pan123', sourcePath: newPath, thumbnail });
      }
    }

    return result;
  }

  static async createMediaItemFromPath(path: string, timeParams: { startTime?: number; endTime?: number } = {}): Promise<any> {
    const [nameWithMaybe, fileIdMaybe] = (path.split('/').filter(Boolean).pop() || '').split('|');
    const name = nameWithMaybe || '未命名';
    const fileId = fileIdMaybe || nameWithMaybe; // 兼容直接传id
    let playUrl = '';
    let qualities: Array<{ default: boolean; html: string; url: string }> = [];
    try {
      qualities = await this.getAllQualityUrls(fileId);
      playUrl = qualities[0]?.url || '';
    } catch {}
    if (!playUrl) {
      const { downloadUrl } = await this.getOriginalFileDownloadUrl(fileId);
      playUrl = downloadUrl;
    }
    if (!playUrl) throw new Error('123网盘未获取到可播放的链接');
    const isAudio = EXT.AUDIO.some(ext => name.toLowerCase().endsWith(ext));
    return { id: `pan123-${fileId}-${Date.now()}`, title: name, url: playUrl, originalUrl: `pan123://file/${fileId}`, type: isAudio ? 'audio' : 'video', source: 'pan123', sourcePath: path, quality: qualities, thumbnail: isAudio ? '/plugins/siyuan-media-player/assets/images/audio.png' : '/plugins/siyuan-media-player/assets/images/video.png', ...timeParams, isLoop: timeParams.endTime !== undefined };
  }

  // 统一用于 Player.svelte 的解析：优先直链，其次 m3u8，最后 transcode/file 兜底
  static async resolvePlayableInfo(url: string, options: any): Promise<{ finalUrl: string; finalOptions: any; }> {
    // 仅依赖 fileId，极简
    let fileId = '';
    if (url.startsWith('pan123://file/')) {
      fileId = (url.split('/').pop() || '').split('?')[0];
    } else if ((options.originalUrl || '').startsWith('pan123://file/')) {
      fileId = (options.originalUrl.split('/').pop() || '').split('?')[0];
    } else if (typeof options.sourcePath === 'string' && options.sourcePath.includes('|')) {
      fileId = options.sourcePath.split('|').pop() || '';
    }
    if (!fileId) throw new Error('找不到文件ID');

    let finalUrl = '';
    let qualities: Array<{ default: boolean; html: string; url: string }> = [];

    // 1) 直链优先
    try {
      const r = await this.getDownloadInfo(fileId);
      if (r?.url) { finalUrl = r.url; console.debug('[Pan123][resolve] Using direct download url'); }
    } catch (e) { console.debug('[Pan123][resolve] direct download failed:', e); }

    // 2) m3u8（有清晰度）
    if (!finalUrl) {
      try {
        qualities = await this.getAllQualityUrls(fileId);
        if (qualities[0]?.url) { finalUrl = qualities[0].url; console.debug('[Pan123][resolve] Using m3u8 url with quality:', qualities.map(q=>q.html).join(',')); }
      } catch (e) { console.debug('[Pan123][resolve] m3u8 not available:', e); }
    }

    // 3) transcode/file/download 兜底
    if (!finalUrl) {
      try {
        const r2 = await this.getOriginalFileDownloadUrl(fileId);
        if (r2?.downloadUrl) { finalUrl = r2.downloadUrl; console.debug('[Pan123][resolve] Using transcode/file/download url'); }
      } catch (e) { console.debug('[Pan123][resolve] transcode/file/download failed:', e); }
    }

    if (!finalUrl) throw new Error('未获取到可播放的链接');

    return {
      finalUrl,
      finalOptions: { ...options, source: 'pan123', quality: qualities, originalUrl: `pan123://file/${fileId}` }
    };
  }
}
