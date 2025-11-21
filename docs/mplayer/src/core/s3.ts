import { isPdf } from './player';

export interface S3Config {
    bucket: string;
    endpoint?: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    name?: string;
    connected?: boolean;
    signUrlExpire?: number;
}

const PROXY = '/api/network/forwardProxy';
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const CACHE_EXPIRY = 5 * 60 * 1000;

// 媒体格式常量
const AUDIO = /\.(mp3|aac|m4a|flac|wav|ogg|opus|wma|ape)$/i;
const VIDEO = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|3gp|ts|m3u8)$/i;
const isMedia = (n: string) => AUDIO.test(n) || VIDEO.test(n) || isPdf(n);

export class S3Manager {
    private static config: S3Config | null = null;
    private static cache = new Map<string, { files: any[]; ts: number }>();

    // ==================== 配置管理 ====================
    static getConfig = () => this.config;
    static setConfig = (c: S3Config) => (this.config = c, this.cache.clear());
    static clearConnection = () => (this.config = null, this.cache.clear());

    static async checkConnection(c: S3Config) {
        try {
            this.setConfig(c);
            await this.list('/');
            this.config = { ...c, connected: true };
            return { connected: true, message: '连接成功' };
        } catch (e: any) {
            return { connected: false, message: `连接失败: ${e.message}` };
        }
    }

    static async initFromConfig(cfg: any) {
        for (const acc of cfg?.settings?.s3Accounts || []) {
            try { if ((await this.checkConnection(acc)).connected) return true; } catch {}
        }
        return false;
    }

    // ==================== 加密工具 ====================
    private static async sha256(msg: string) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private static async hmac(key: Uint8Array, msg: string, raw: true): Promise<Uint8Array>;
    private static async hmac(key: Uint8Array, msg: string, raw?: false): Promise<string>;
    private static async hmac(key: Uint8Array, msg: string, raw = false): Promise<Uint8Array | string> {
        const keyBuf = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
        const k = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
        return raw ? new Uint8Array(sig) : Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    private static async signKey(secret: string, date: string, region: string): Promise<Uint8Array> {
        let k = await this.hmac(new TextEncoder().encode('AWS4' + secret), date, true);
        k = await this.hmac(k, region, true);
        k = await this.hmac(k, 's3', true);
        return await this.hmac(k, 'aws4_request', true);
    }

    // ==================== AWS 签名 V4 ====================
    private static async sign(method: string, uri: string, query: string, host: string, secret: string, region: string) {
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const time = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
        
        const headers = `host:${host}\nx-amz-content-sha256:${EMPTY_HASH}\nx-amz-date:${time}\n`;
        const signed = 'host;x-amz-content-sha256;x-amz-date';
        const canonical = `${method}\n${uri}\n${query}\n${headers}\n${signed}\n${EMPTY_HASH}`;
        const scope = `${date}/${region}/s3/aws4_request`;
        const toSign = `AWS4-HMAC-SHA256\n${time}\n${scope}\n${await this.sha256(canonical)}`;
        const sig = await this.hmac(await this.signKey(secret, date, region), toSign);
        
        return {
            auth: `AWS4-HMAC-SHA256 Credential=${this.config!.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${sig}`,
            hash: EMPTY_HASH,
            date: time
        };
    }

    // ==================== 核心 API ====================
    private static async req(url: string, headers: Record<string, string> = {}) {
        const opts: any = { url, method: 'GET', timeout: 15000, headers: Object.entries(headers).map(([k, v]) => ({ [k]: v })) };
        if ((window as any).__siyuanMediaPlayerIgnoreCert) opts.ignoreCertificateErrors = true;
        const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) }).then(r => r.json());
        if (res.code !== 0) throw new Error(`请求失败: ${res.msg}`);
        return { status: res.data.status, body: res.data.body };
    }

    // 列出目录
    static async list(path = '/') {
        if (!this.config) throw new Error('S3未配置');
        
        const cached = this.cache.get(path);
        if (cached && Date.now() - cached.ts < CACHE_EXPIRY) return cached.files;

        const { bucket, secretAccessKey, region } = this.config;
        const prefix = path === '/' ? '' : path.replace(/^\//, '').replace(/\/$/, '') + '/';
        const host = `${bucket}.s3.${region}.qiniucs.com`;
        
        const params: [string, string][] = [['delimiter', '/'], ['list-type', '2']];
        if (prefix) params.push(['prefix', prefix]);
        params.sort((a, b) => a[0].localeCompare(b[0]));
        
        const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        const { auth, hash, date } = await this.sign('GET', '/', query, host, secretAccessKey, region);
        
        const { body } = await this.req(`https://${host}/?${query}`, {
            'Authorization': auth,
            'x-amz-content-sha256': hash,
            'x-amz-date': date
        });
        
        const doc = new DOMParser().parseFromString(body, 'text/xml');
        const files: any[] = [];

        // 文件夹
        doc.querySelectorAll('CommonPrefixes Prefix').forEach(n => {
            const p = n.textContent || '';
            const name = p.replace(prefix, '').replace(/\/$/, '');
            if (name) files.push({ name, path: `/${p}`, is_dir: true });
        });

        // 文件
        doc.querySelectorAll('Contents').forEach(n => {
            const key = n.querySelector('Key')?.textContent || '';
            if (key && !key.endsWith('/') && key !== prefix) {
                const name = key.replace(prefix, '');
                const size = parseInt(n.querySelector('Size')?.textContent || '0');
                const modified = n.querySelector('LastModified')?.textContent || '';
                files.push({ name, path: `/${key}`, is_dir: false, size, modified });
            }
        });

        this.cache.set(path, { files, ts: Date.now() });
        return files;
    }

    // 获取文件下载链接（预签名URL）
    static async getFileLink(path: string) {
        if (!this.config) throw new Error('S3未配置');
        
        const { bucket, accessKeyId, secretAccessKey, region } = this.config;
        const key = path.replace(/^\//, '');
        const exp = (this.config.signUrlExpire || 4) * 3600;
        const host = `${bucket}.s3.${region}.qiniucs.com`;
        
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const time = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
        
        // URI编码（保留斜杠）
        const encodedKey = key.split('/').map(encodeURIComponent).join('/');
        
        const params: [string, string][] = [
            ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
            ['X-Amz-Credential', `${accessKeyId}/${date}/${region}/s3/aws4_request`],
            ['X-Amz-Date', time],
            ['X-Amz-Expires', exp.toString()],
            ['X-Amz-SignedHeaders', 'host']
        ];
        
        const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        const canonical = `GET\n/${encodedKey}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
        const scope = `${date}/${region}/s3/aws4_request`;
        const toSign = `AWS4-HMAC-SHA256\n${time}\n${scope}\n${await this.sha256(canonical)}`;
        const sig = await this.hmac(await this.signKey(secretAccessKey, date, region), toSign);
        
        return `https://${host}/${encodedKey}?${query}&X-Amz-Signature=${sig}`;
    }

    // ==================== 媒体项创建 ====================
    static async createMediaItemsFromDirectory(path = '/') {
        const files = await this.list(path);
        const result: any[] = [];

        for (const f of files) {
            if (f.is_dir) {
                result.push({
                    id: `s3-folder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    title: f.name,
                    type: 'folder',
                    url: '#',
                    source: 's3',
                    sourcePath: f.path,
                    is_dir: true,
                    thumbnail: '/plugins/siyuan-media-player/assets/images/folder.svg'
                });
            } else if (isMedia(f.name)) {
                const isAudio = AUDIO.test(f.name);
                const isPdfFile = isPdf(f.name);
                const url = `s3://file${f.path}`;

                result.push({
                    id: `s3-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    title: f.name,
                    url,
                    originalUrl: url,
                    type: isPdfFile ? 'pdf' : (isAudio ? 'audio' : 'video'),
                    source: 's3',
                    sourcePath: f.path,
                    thumbnail: isPdfFile ? '/plugins/siyuan-media-player/assets/images/pdf.svg' : 
                               (isAudio ? '/plugins/siyuan-media-player/assets/images/audio.png' : 
                               '/plugins/siyuan-media-player/assets/images/video.png')
                });
            }
        }

        return result;
    }

    static async createMediaItemFromPath(path: string, timeParams: { startTime?: number; endTime?: number } = {}) {
        const name = path.split('/').pop() || '未命名';
        const url = await this.getFileLink(path);
        const isAudio = AUDIO.test(name);

        return {
            id: `s3-${Date.now()}`,
            title: name,
            url,
            originalUrl: `s3://file${path}`,
            type: isAudio ? 'audio' : 'video',
            source: 's3',
            sourcePath: path,
            thumbnail: isAudio ? '/plugins/siyuan-media-player/assets/images/audio.png' : 
                                '/plugins/siyuan-media-player/assets/images/video.png',
            ...timeParams,
            isLoop: timeParams.endTime !== undefined
        };
    }
}
