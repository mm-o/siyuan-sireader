import { isPdf } from './player';

export interface AliDriveConfig {
	client_id: string;
	client_secret?: string;
	scopes?: string | string[];
	access_token?: string;
	refresh_token?: string;
	expires_at?: number;
	drive_id?: string;
	user?: { avatar?: string; name?: string; user_id?: string };
	connected?: boolean;
}

type QrStatus = { status: 'WaitLogin' | 'ScanSuccess' | 'LoginSuccess' | 'QRCodeExpired'; authCode?: string };

const API_BASE = 'https://openapi.alipan.com';
const PROXY = '/api/network/forwardProxy';

export class AliDriveManager {
	private static config: AliDriveConfig | null = null;
	private static FILE_CACHE = new Map<string, { files: any[]; timestamp: number }>();
	private static CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存

	private static async proxyRequest(url: string, method = 'GET', headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: string }> {
		const req = { url, method, timeout: 15000, headers: Object.entries(headers).map(([k, v]) => ({ [k]: v })), ...(body && { payload: body }) };
		const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }).then(r => r.json());
		if (res.code !== 0) throw new Error(`代理请求失败: ${res.msg}`);
		return { status: res.data.status, body: res.data.body };
	}

	private static parseJson<T = any>(text: string): T { try { return JSON.parse(text) as T; } catch { return {} as any; } }

	static parseFileIdFromUrl(raw: string): string | null {
		try {
			const u = new URL(raw);
			const f = u.searchParams.get('f');
			if (f && f.length >= 20) return f;
			const cbVar = u.searchParams.get('callback-var');
			if (cbVar) {
				try {
					const json = JSON.parse(decodeURIComponent(cbVar));
					const id = json?.['x:file_id'] || json?.['x:fileid'] || json?.file_id;
					if (id && String(id).length >= 20) return String(id);
				} catch {}
			}
			return null;
		} catch { return null; }
	}

	static isAliPreviewOrDownloadUrl(raw: string): boolean {
		try {
			const u = new URL(raw);
			return /aliyundrive|alipan|aliyundrive\.net|alipan\.com|aliyundrive\.com/i.test(u.hostname) || u.searchParams.has('x-oss-access-key-id') || u.searchParams.has('pds-params');
		} catch { return false; }
	}

	private static normalizeScopes(scopes?: string | string[]): string[] {
		return Array.isArray(scopes) ? scopes : String(scopes || '').split(/[\s,]+/).filter(Boolean);
	}

	private static updateToken(token: { access_token: string; refresh_token?: string; expires_in?: number }) {
		if (!this.config) this.config = {} as any;
		Object.assign(this.config, {
			access_token: token.access_token,
			...(token.refresh_token && { refresh_token: token.refresh_token }),
			...(token.expires_in && { expires_at: Date.now() + token.expires_in * 1000 })
		});
	}

	static getConfig = () => this.config;
	static setConfig = (config: AliDriveConfig) => this.config = config;
	static clearConnection = () => this.config = null;

	static async initFromConfig(config: any): Promise<boolean> {
		const accounts = config?.settings?.alidriveAccounts || [];
		for (const acc of accounts) {
			try { if ((await this.checkConnection(acc)).connected) return true; } catch {}
		}
		return false;
	}

	static async checkConnection(config: AliDriveConfig): Promise<{ connected: boolean; message: string; profile?: any }> {
		try {
			this.setConfig(config);
			await this.ensureToken();
			const profile = await this.getDriveInfo();
			this.config = { ...this.config!, connected: true, drive_id: profile?.default_drive_id || profile?.drive_id, user: { avatar: profile?.avatar, name: profile?.nick_name || profile?.user_name || '', user_id: profile?.user_id } };
			return { connected: true, message: '连接成功', profile };
		} catch (e) {
			return { connected: false, message: `连接失败: ${e instanceof Error ? e.message : String(e)}` };
		}
	}

	static async startQrLogin(client_id: string, client_secret: string, scopes: string | string[], onStatus: (q: { data: string; key: string; message?: string }) => void, onSuccess: (account: any) => Promise<void> | void): Promise<{ stop: () => void }> {
		let timer: number | null = null;
		const { body } = await this.proxyRequest(`${API_BASE}/oauth/authorize/qrcode`, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ client_id, client_secret, scopes: this.normalizeScopes(scopes) }));
		const qrResp = this.parseJson<{ qrCodeUrl: string; sid: string }>(body);
		if (!qrResp?.sid) throw new Error('获取二维码失败');

		const imgUrl = `${API_BASE}/oauth/qrcode/${qrResp.sid}`;
		onStatus({ data: imgUrl, key: qrResp.sid, message: '请使用阿里云盘App扫描二维码进行授权' });

		const fetchStatus = async (): Promise<QrStatus | null> => {
			try {
				const { body, status } = await this.proxyRequest(`${API_BASE}/oauth/qrcode/${qrResp.sid}/status`, 'GET', { 'Content-Type': 'application/json' });
				if (status !== 200) return null;
				const raw = this.parseJson<any>(body);
				return { status: (raw?.status || raw?.data?.status || '').trim(), authCode: raw?.authCode || raw?.auth_code || raw?.code } as QrStatus;
			} catch { return null; }
		};

		let elapsed = 0;
		timer = window.setInterval(async () => {
			try {
				elapsed += 3000;
				const res = await fetchStatus();
				if (res?.status === 'LoginSuccess' && res.authCode) {
					if (timer) { clearInterval(timer); timer = null; }
					try {
						const token = await this.exchangeTokenByCode(client_id, client_secret, res.authCode);
						this.updateToken(token);
						const [profile, space] = await Promise.all([this.getDriveInfo(), this.getSpaceInfo()]);
						const account = {
							id: 'ali_' + (profile?.user_id || Date.now()),
							client_id, client_secret, scopes,
							access_token: this.config?.access_token,
							refresh_token: this.config?.refresh_token,
							expires_at: this.config?.expires_at,
							drive_id: profile?.default_drive_id || profile?.drive_id,
							uname: profile?.nick_name || profile?.user_name || 'AliyunDrive',
							user_name: profile?.user_name,
							user_id: profile?.user_id,
							face: profile?.avatar,
							quotaUsed: space?.used_size,
							quotaTotal: space?.total_size
						};
						onStatus({ data: imgUrl, key: qrResp.sid, message: '授权成功' });
						await Promise.resolve(onSuccess(account));
					} catch (e) {
						onStatus({ data: imgUrl, key: qrResp.sid, message: `换取令牌失败：${e instanceof Error ? e.message : String(e)}` });
					}
				} else if (res?.status === 'ScanSuccess') {
					onStatus({ data: imgUrl, key: qrResp.sid, message: '已扫码，请确认授权' });
				} else if (res?.status === 'QRCodeExpired' || elapsed >= 180000) {
					if (timer) { clearInterval(timer); timer = null; }
					onStatus({ data: imgUrl, key: qrResp.sid, message: res?.status === 'QRCodeExpired' ? '二维码已过期' : '授权超时' });
				} else if (res?.status === 'WaitLogin') {
					onStatus({ data: imgUrl, key: qrResp.sid, message: '等待扫码' });
				}
			} catch {
				if (timer) { clearInterval(timer); timer = null; }
			}
		}, 3000);

		return { stop: () => { if (timer) { clearInterval(timer); timer = null; } } };
	}

	static async authorizeByCode(client_id: string, client_secret: string | undefined, code: string): Promise<any> {
		const token = await this.exchangeTokenByCode(client_id, client_secret, code);
		this.updateToken(token);
		const [profile, space] = await Promise.all([this.getDriveInfo(), this.getSpaceInfo()]);
		this.config = { ...(this.config || {}), client_id, client_secret, connected: true, drive_id: profile?.default_drive_id || profile?.drive_id, user: { avatar: profile?.avatar, name: profile?.nick_name || profile?.user_name || '', user_id: profile?.user_id }, quotaUsed: space?.used_size, quotaTotal: space?.total_size } as any;
		return { ...profile, ...space };
	}

	private static async exchangeTokenByCode(client_id: string, client_secret: string | undefined, code: string): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
		const payload: any = { grant_type: 'authorization_code', code, client_id };
		if (client_secret) payload.client_secret = client_secret;
		const { body } = await this.proxyRequest(`${API_BASE}/oauth/access_token`, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload));
		const token = this.parseJson<any>(body);
		if (token.code && token.message) throw new Error(token.message);
		return token;
	}

	private static async refreshToken(): Promise<void> {
		if (!this.config?.refresh_token || !this.config?.client_id) throw new Error('缺少刷新令牌或客户端信息');
		const payload: any = { grant_type: 'refresh_token', refresh_token: this.config.refresh_token, client_id: this.config.client_id };
		if (this.config.client_secret) payload.client_secret = this.config.client_secret;
		const { body } = await this.proxyRequest(`${API_BASE}/oauth/access_token`, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(payload));
		const token = this.parseJson<any>(body);
		if (token.code && token.message) throw new Error(token.message);
		this.updateToken(token);
	}

	private static async ensureToken(): Promise<void> {
		if (!this.config?.access_token || !this.config?.expires_at || Date.now() >= this.config.expires_at - 30000) await this.refreshToken();
	}

	static async getDriveInfo(): Promise<any> {
		if (!this.config?.access_token) throw new Error('未登录');
		const { body } = await this.proxyRequest(`${API_BASE}/adrive/v1.0/user/getDriveInfo`, 'POST', { 'Authorization': `Bearer ${this.config.access_token}` });
		return this.parseJson<any>(body);
	}

	static async getSpaceInfo(): Promise<{ used_size?: number; total_size?: number } | null> {
		if (!this.config?.access_token) return null;
		try {
			const { body, status } = await this.proxyRequest(`${API_BASE}/adrive/v1.0/user/getSpaceInfo`, 'POST', { 'Authorization': `Bearer ${this.config.access_token}` });
			if (status !== 200) return null;
			const data = this.parseJson<any>(body);
			const p = data?.personal_space_info || data?.data?.personal_space_info || data;
			return { used_size: p?.used_size ?? p?.usedSpace ?? p?.used, total_size: p?.total_size ?? p?.totalSpace ?? p?.total };
		} catch { return null; }
	}

	static async getDownloadUrl(file_id: string): Promise<{ url: string; expiration?: string }> {
		await this.ensureToken();
		const { body } = await this.proxyRequest(`${API_BASE}/adrive/v1.0/openFile/getDownloadUrl`, 'POST', { 'Authorization': `Bearer ${this.config?.access_token}`, 'Content-Type': 'application/json' }, JSON.stringify({ drive_id: this.config?.drive_id, file_id }));
		const data = this.parseJson<any>(body);
		if (!data?.url) throw new Error('获取直链失败');
		return { url: data.url, expiration: data.expiration };
	}

	static async getDirectPlayUrl(file_id: string): Promise<string> {
		const { url } = await this.getDownloadUrl(file_id);
		return url;
	}

	static async getFileLink(file_id: string): Promise<string> {
		const { url } = await this.getDownloadUrl(file_id);
		return url;
	}

	static async getDirectoryContents(parent_file_id = 'root'): Promise<any[]> {
		const cached = this.FILE_CACHE.get(parent_file_id);
		if (cached && Date.now() - cached.timestamp < this.CACHE_EXPIRY) return cached.files;

		await this.ensureToken();
		const { body } = await this.proxyRequest(`${API_BASE}/adrive/v1.0/openFile/list`, 'POST', { 'Authorization': `Bearer ${this.config?.access_token}`, 'Content-Type': 'application/json' }, JSON.stringify({ drive_id: this.config?.drive_id, parent_file_id, limit: 200 }));
		const data = this.parseJson<any>(body);
		const files = Array.isArray(data?.items) ? data.items : [];

		this.FILE_CACHE.set(parent_file_id, { files, timestamp: Date.now() });
		return files;
	}

	private static async getFileMeta(file_id: string): Promise<any> {
		await this.ensureToken();
		const { body, status } = await this.proxyRequest(`${API_BASE}/adrive/v1.0/openFile/get`, 'POST', { 'Authorization': `Bearer ${this.config?.access_token}`, 'Content-Type': 'application/json' }, JSON.stringify({ drive_id: this.config?.drive_id, file_id }));
		return status === 200 ? this.parseJson<any>(body) : null;
	}

	private static async getCoverForFile(it: any): Promise<string> {
		const isAudio = (it.mime_type || '').startsWith('audio') || /\.(mp3|aac|m4a|flac|wav|ogg)$/i.test(it.name);
		if (isAudio) return '/plugins/siyuan-media-player/assets/images/audio.png';
		const meta = await this.getFileMeta(it.file_id).catch(() => null);
		const url = meta?.thumbnail || meta?.video_preview?.cover_url || meta?.video_media_metadata?.thumbnail || meta?.image_media_metadata?.thumbnail || '';
		return url || '/plugins/siyuan-media-player/assets/images/video.png';
	}

	static async createMediaItemsFromDirectory(path = ''): Promise<any[]> {
		await this.ensureToken();
		const parentId = (path || '').split('/').filter(Boolean).pop()?.split('|')[1] || 'root';
		const items = await this.getDirectoryContents(parentId);
		const result: any[] = [];
		for (const it of items) {
			if (it.type === 'folder') {
				result.push({ id: `alidrive-folder-${it.file_id}`, title: it.name, type: 'folder', url: '#', source: 'alidrive', sourcePath: `${path || ''}/${it.name}|${it.file_id}`, is_dir: true, thumbnail: '/plugins/siyuan-media-player/assets/images/folder.svg' });
			} else if (it.type === 'file') {
				const name = it.name || '';
				const isPdfFile = isPdf(name);
				const pseudoUrl = `alipan://file/${it.file_id}`;

				if (isPdfFile) {
					result.push({ id: `alidrive-${it.file_id}`, title: name, url: pseudoUrl, originalUrl: pseudoUrl, type: 'pdf', source: 'alidrive', sourcePath: `${path || ''}/${name}|${it.file_id}`, thumbnail: '/plugins/siyuan-media-player/assets/images/pdf.svg' });
				} else {
					const isAudio = (it.mime_type || '').startsWith('audio') || /\.(mp3|aac|m4a|flac|wav|ogg)$/i.test(name);
					const cover = await this.getCoverForFile(it);
					result.push({ id: `alidrive-${it.file_id}`, title: name, url: pseudoUrl, originalUrl: pseudoUrl, type: isAudio ? 'audio' : 'video', source: 'alidrive', sourcePath: `${path || ''}/${name}|${it.file_id}`, thumbnail: cover });
				}
			}
		}
		return result;
	}

	private static createMediaBase(fileName: string, fileId: string, url: string) {
		return {
			title: fileName,
			url,
			originalUrl: url,
			type: /\.(mp3|aac|m4a|flac|wav|ogg)$/i.test(fileName) ? 'audio' : 'video',
			source: 'alidrive',
			sourcePath: fileId,
			thumbnail: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
		};
	}

	static async createMediaItemFromPath(path: string, timeParams: { startTime?: number; endTime?: number } = {}): Promise<any> {
		await this.ensureToken();
		const [name, fileId] = (path.split('/').filter(Boolean).pop() || '').split('|');
		const playUrl = await this.getDirectPlayUrl(fileId);
		return {
			id: `alidrive-${fileId}-${Date.now()}`,
			...this.createMediaBase(name || '未命名', fileId, playUrl),
			...timeParams,
			isLoop: timeParams.endTime !== undefined
		};
	}

	static async createMediaItemFromId(fileId: string, timeParams: { startTime?: number; endTime?: number } = {}): Promise<any> {
		await this.ensureToken();
		const meta = await this.getFileMeta(fileId).catch(() => null);
		const name = meta?.name || '未命名';
		const qualities = await this.getAllQualityUrls(fileId);

		if (qualities.length === 0) throw new Error('阿里云盘 HLS 播放链接获取失败');

		return {
			id: `alidrive-${fileId}-${Date.now()}`,
			title: name,
			url: `alipan://file/${fileId}`,
			originalUrl: `alipan://file/${fileId}`,
			type: /\.(mp3|aac|m4a|flac|wav|ogg)$/i.test(name) ? 'audio' : 'video',
			source: 'alidrive',
			sourcePath: fileId,
			thumbnail: await this.getCoverForFile({ name, file_id: fileId }),
			quality: qualities,
			...timeParams,
			isLoop: timeParams.endTime !== undefined
		};
	}

	static async getAllQualityUrls(file_id: string): Promise<Array<{ default: boolean; html: string; url: string }>> {
		await this.ensureToken();
		const qualityMap = { 'LD': { name: '普通清晰度 360P', priority: 1 }, 'SD': { name: '标清 480P', priority: 2 }, 'HD': { name: '高清 720P', priority: 3 }, 'FHD': { name: '全高清 1080P', priority: 4 }, 'QHD': { name: '超清 1440P', priority: 5 } };

		for (let tries = 0; tries < 12; tries++) {
			const tasks = await this.getPreviewTasks(file_id);
			if (tasks.length) {
				const availableQualities = tasks
					.filter(t => t.status === 'finished' && (t as any).url)
					.map(t => ({ template_id: t.template_id, url: (t as any).url as string, priority: qualityMap[t.template_id as keyof typeof qualityMap]?.priority || 0, name: qualityMap[t.template_id as keyof typeof qualityMap]?.name || t.template_id }))
					.sort((a, b) => b.priority - a.priority);

				if (availableQualities.length > 0) {
					return availableQualities.map((q, index) => ({ default: index === 0, html: q.name, url: q.url }));
				}

				if (tasks.some(x => x.status === 'running')) {
					await new Promise(r => setTimeout(r, 3000));
					continue;
				}
				break;
			}
			await new Promise(r => setTimeout(r, 2000));
		}
		return [];
	}

	static async getPreviewTasks(file_id: string): Promise<Array<{ template_id: string; status: string; url?: string }>> {
		await this.ensureToken();
		const body = JSON.stringify({ drive_id: this.config?.drive_id, file_id, category: 'live_transcoding', get_subtitle_info: false });
		const { body: resBody, status } = await this.proxyRequest(`${API_BASE}/adrive/v1.0/openFile/getVideoPreviewPlayInfo`, 'POST', { 'Authorization': `Bearer ${this.config?.access_token}`, 'Content-Type': 'application/json' }, body);
		if (status !== 200) return [];
		const data = this.parseJson<any>(resBody);
		return Array.isArray(data?.video_preview_play_info?.live_transcoding_task_list) ? data.video_preview_play_info.live_transcoding_task_list : [];
	}
}