/**
 * OpenList API交互模块
 */
import type { MediaItem } from './types';
import { EXT, isPdf } from './player';

// 接口定义
export interface OpenListConfig {
    server: string;
    username?: string;
    password?: string;
    name?: string;
    prefix?: string; // 路径前缀，用于反代等场景
    token?: string;
    connected?: boolean;
}

export interface OpenListFile {
    name: string;
    path: string;
    size: number;
    is_dir: boolean;
    modified: string;
    thumb: string;
    type: number;
    sign?: string;
    raw_url?: string;
    url?: string;
}

// 简洁的媒体检测
const stripQ = (s: string) => s.toLowerCase().split('?')[0];
const hasExt = (name: string, exts: string[]) => exts.some(ext => stripQ(name).endsWith(ext));
const media = {
    isAudioFile: (name: string) => hasExt(name, EXT.AUDIO),
    isMediaFile:  (name: string) => hasExt(name, EXT.MEDIA),
    isSupported:  (name: string) => hasExt(name, EXT.MEDIA)
};

/**
 * OpenList管理器
 */
export class OpenListManager {
    private static config: OpenListConfig | null = null;
    private static token: string | null = null;
    private static FILE_CACHE = new Map<string, {files: OpenListFile[], timestamp: number}>();
    private static CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存过期

    // 🔗 URL构建 - 智能处理斜杠与路径前缀
    private static url = (path: string, server = this.config?.server, prefix = this.config?.prefix) => {
        const s = server?.replace(/\/+$/, '');
        const p = prefix?.replace(/^\/|\/$/g, '') || '';
        const endpoint = path.replace(/^\/+/, '');
        return p ? `${s}/${p}/${endpoint}` : `${s}/${endpoint}`;
    };

    // 🧹 路径标准化（最小化处理，仅规范格式，不做前缀修剪）
    private static cleanPath(p: string): string {
        if (!p) return '/';
        try { p = decodeURIComponent(p); } catch {}
        return '/' + p.replace(/^\/+/, '').replace(/\/+/g, '/');
    }

	    // 直链生成（统一优先级：raw_url > sign > url）
	    private static directUrl(path: string, info?: { raw_url?: string; sign?: string; url?: string }): string | null {
	        const clean = this.cleanPath(path);
	        if (info?.raw_url) return info.raw_url;
	        if (info?.sign) return this.url(`d${clean}?sign=${info.sign}`);
	        if (info?.url) return info.url;
	        return null;
	    }


    // 🌐 代理请求 - 极简封装
    private static async request<T>(url: string, body?: any, auth?: string): Promise<T> {
        const res = await fetch('/api/network/forwardProxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, method: 'POST', timeout: 10000,
                headers: [{ 'Content-Type': 'application/json' }, ...(auth ? [{ Authorization: auth }] : [])],
                ...(body && { payload: JSON.stringify(body) })
            })
        }).then(r => r.json());

        if (res.code !== 0) throw new Error(`请求失败: ${res.msg}`);
        return JSON.parse(res.data.body);
    }

    // ✅ 连接验证
    static async checkConnection(config: OpenListConfig): Promise<{connected: boolean, message: string}> {
        try {
            const hasCreds = !!(config.username?.trim() && config.password?.trim());
            if (hasCreds) {
                const data = await this.request<any>(this.url('api/auth/login', config.server, config.prefix),
                    { username: config.username, password: config.password });

                if (data.code === 200) {
                    if (!this.config || this.config.server !== config.server || this.config.username !== config.username) {
                        this.FILE_CACHE.clear();
                        this.token = null;
                    }
                    this.token = data.data.token;
                    this.config = { ...config, token: this.token, connected: true };
                    return { connected: true, message: "连接成功" };
                }
                return { connected: false, message: data.message || "认证失败" };
            } else {
                // 匿名访问：尝试列出根目录
                const data = await this.request<any>(this.url('api/fs/list', config.server, config.prefix),
                    { path: '/', password: '', page: 1, per_page: 1, refresh: false });

                if (data.code === 200) {
                    if (!this.config || this.config.server !== config.server) {
                        this.FILE_CACHE.clear();
                        this.token = null;
                    }
                    this.config = { ...config, token: undefined, connected: true };
                    return { connected: true, message: "连接成功(匿名)" };
                }
                return { connected: false, message: data.message || "连接失败" };
            }
        } catch (error) {
            return { connected: false, message: `连接失败: ${error instanceof Error ? error.message : String(error)}` };
        }
    }

    // 🔄 自动重连
    private static async ensureAuth(): Promise<boolean> {
        if (!this.config) return false;
        const needsAuth = !!(this.config.username?.trim() && this.config.password?.trim());
        if (!needsAuth) return true;
        if (!!this.token?.trim()) return true;
        return (await this.checkConnection(this.config)).connected;
    }

    // 📡 API调用
    private static async api<T>(endpoint: string, body: any): Promise<T> {
        if (!this.config || !await this.ensureAuth()) throw new Error("OpenList未连接");
        const data = await this.request<any>(this.url(endpoint), body, this.token || undefined);
        if (data.code === 200) return data.data;
        if (data.code === 401 && this.config?.username && this.config?.password && await this.ensureAuth()) return this.api(endpoint, body);
        console.error('[OpenList]', `API调用失败 - 端点: ${endpoint}, 错误: ${data.message || '未知错误'}, 请求体: ${JSON.stringify(body)}`);
        throw new Error(data.message || "API调用失败");
    }

    /**
     * 获取文件详情
     */
    static async getFileDetail(path: string): Promise<any> {
        if (!path || path === '/') throw new Error("无效的文件路径");

        const cleanedPath = this.cleanPath(path);
        return this.api<any>('/api/fs/get', {path: cleanedPath, password: ''});
    }

    /**
     * 获取文件下载链接
     */
    static async getFileLink(path: string): Promise<string> {
        const info = await this.getFileDetail(path);
        const url = this.directUrl(path, info);
        if (url) return url;
        throw new Error('无法获取文件播放链接');
    }

    // 获取目录内容
    static async getDirectoryContents(path: string = '/'): Promise<OpenListFile[]> {
        const cleanPath = this.cleanPath(path);
        const cacheKey = `${this.config?.server || ''}|${this.config?.username || ''}|${cleanPath}`;

        const cached = this.FILE_CACHE.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_EXPIRY)) return cached.files;

        try {
            const data = await this.api<{content: OpenListFile[]}>('/api/fs/list',
                {path: cleanPath, password: '', page: 1, per_page: 1000, refresh: false});

            const files = data.content || [];
            this.FILE_CACHE.set(cacheKey, {files, timestamp: Date.now()});
            return files;
        } catch (error) {
            if (cached) return cached.files;
            throw error;
        }
    }

    /**
     * 从URL解析OpenList路径
     */
    static parsePathFromUrl(url: string): string | null {
        if (!url || (!media.isMediaFile(url) && !isPdf(url))) return null;
        try {
            // 单页应用路由风格：http://host/#/path/to/file
            if (url.includes('/#/')) {
                const seg = url.split('/#/')[1]?.split('?')[0] || '';
                return seg ? `/${decodeURIComponent(seg).replace(/^\/+/, '')}` : null;
            }
            // 标准路径：http(s)://host/path/to/file
            const { pathname } = new URL(url);
            return pathname ? decodeURIComponent(pathname) : null;
        } catch {
            return null;
        }
    }

    // 创建媒体项
    static async createMediaItemFromPath(path: string, timeParams: { startTime?: number, endTime?: number } = {}): Promise<MediaItem> {
        if (!this.config) throw new Error("未连接到OpenList服务器");

        const fileName = path.split('/').pop() || '未知文件';
        const isAudio = media.isAudioFile(fileName);

        return {
            id: `openlist-direct-${Date.now()}`,
            title: fileName, url: await this.getFileLink(path), originalUrl: this.url(path),
            type: isAudio ? 'audio' : 'video', source: 'openlist', sourcePath: path,
            startTime: timeParams.startTime, endTime: timeParams.endTime, isLoop: timeParams.endTime !== undefined,
            thumbnail: `/plugins/siyuan-media-player/assets/images/${isAudio ? 'audio' : 'video'}.png`
        };
    }

    /**
     * 处理OpenList媒体链接 - 从链接直接播放媒体
     */
    static async handleOpenListMediaLink(url: string, timeParams: { startTime?: number, endTime?: number } = {}): Promise<{success: boolean; mediaItem?: MediaItem; error?: string}> {
        if (!this.config) return {success: false, error: "未连接到OpenList服务器"};

        const openlistPath = this.parsePathFromUrl(url);
        if (!openlistPath) return {success: false, error: "无法从链接解析OpenList路径"};

        try {
            const mediaItem = await this.createMediaItemFromPath(openlistPath, timeParams);
            return {success: true, mediaItem};
        } catch (error) {
            return {success: false, error: error instanceof Error ? error.message : String(error)};
        }
    }

    /**
     * 创建目录内的媒体项列表 - 用于播放列表展示
     */
    static async createMediaItemsFromDirectory(path: string): Promise<MediaItem[]> {
        const files = await this.getDirectoryContents(path);

        return files.map(file => {
            if (file.is_dir) {
                // 文件夹项
                return {
                    id: `openlist-folder-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
                    title: file.name,
                    type: 'folder',
                    url: '#',
                    source: 'openlist',
                    sourcePath: `${path === '/' ? '' : path}/${file.name}`,
                    is_dir: true,
                    thumbnail: '/plugins/siyuan-media-player/assets/images/folder.svg'
                } as MediaItem;
            } else if (media.isMediaFile(file.name) || isPdf(file.name)) {
                // 媒体/PDF 文件项
                const filePath = `${path === '/' ? '' : path}/${file.name}`;
                const playUrl = this.directUrl(filePath, file) || this.url(filePath);
                const isAudio = media.isAudioFile(file.name);
                const isPdfFile = isPdf(file.name);
                return {
                    id: `openlist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    title: file.name,
                    url: playUrl,
                    originalUrl: this.url(filePath),
                    thumbnail: file.thumb || (isPdfFile ? '/plugins/siyuan-media-player/assets/images/pdf.svg' : (isAudio ? '/plugins/siyuan-media-player/assets/images/audio.png' : '/plugins/siyuan-media-player/assets/images/video.png')),
                    type: isPdfFile ? 'pdf' : (isAudio ? 'audio' : 'video'),
                    source: 'openlist',
                    sourcePath: filePath
                } as MediaItem;
            }
            return null;
        }).filter(Boolean) as MediaItem[];
    }

    /**
     * 获取OpenList中同名文件的直接链接 (用于查找字幕/弹幕等辅助文件)
     */
    static async getSupportFileLink(mediaPath: string, extensions: string[]): Promise<string | null> {
        if (!this.config?.server) return null;

        try {
            const lastSlash = mediaPath.lastIndexOf('/');
            const lastDot = mediaPath.lastIndexOf('.');
            if (lastDot === -1 || lastSlash === -1) return null;

            const dirPath = mediaPath.substring(0, lastSlash);
            const fileBase = mediaPath.substring(lastSlash + 1, lastDot);

            // 从缓存或API获取目录文件
            const files = await this.getDirectoryContents(dirPath).catch(() => []);

            // 查找匹配文件
            for (const ext of extensions) {
                const targetName = `${fileBase}${ext}`;
                const file = files.find(f => f.name.toLowerCase() === targetName.toLowerCase());
                if (!file) continue;

                // 获取直接链接
                const maybe = this.directUrl(`${dirPath}/${file.name}`, file);
                if (maybe) return maybe;
                return this.getFileLink(`${dirPath}/${file.name}`).catch(() => null);
            }
        } catch {}

        return null;
    }

    /**
     * 获取媒体流数据 - 与B站视频处理保持一致的格式
     */
    static async getVideoStream(path: string): Promise<import('./types').VideoStream> {
        return { video: { url: await this.getFileLink(path) } };
    }

    // 公共工具方法
    static getConfig = () => this.config;
    static setConfig = (config: OpenListConfig) => {
        if (this.config?.server !== config.server || this.config?.username !== config.username) {
            this.token = null;
            this.FILE_CACHE.clear();
        }
        this.config = config;
    };
    static clearConnection = () => {
        this.config = null;
        this.token = null;
        this.FILE_CACHE.clear();
    };

    // 从配置初始化 - 支持多账号
    static async initFromConfig(config: any): Promise<boolean> {
        const accounts = config?.settings?.openlistAccounts || [];
        if (!accounts.length) return false;
        for (const acc of accounts) {
            try {
                if ((await this.checkConnection(acc)).connected) return true;
            } catch {}
        }
        return false;
    }
}