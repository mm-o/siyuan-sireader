import { MediaItem, PlayerType } from "./types";
import { BilibiliParser } from "./bilibili";
import { OpenListManager } from './openlist';
import { imageToLocalAsset } from './document';
import { SubtitleManager } from './subtitle';
import * as mm from 'music-metadata-browser';
import { showMessage } from 'siyuan';

// ===== 常量定义 =====
const AUDIO_EXTS = ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg'];
const VIDEO_EXTS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v', '.mkv', '.avi', '.flv', '.wmv'];
const PDF_EXTS = ['.pdf'];
const MEDIA_EXTS = [...AUDIO_EXTS, ...VIDEO_EXTS];
const BILIBILI_REGEX = /bilibili\.com\/video\/|bilibili\.com\/cheese\/play\/|\/BV[a-zA-Z0-9]+/;
const BV_REGEX = /BV[a-zA-Z0-9]+/;
const TIME_REGEX = /[?&]t=([^&]+)/;

// ===== 工具函数 =====
export const EXT = { AUDIO: AUDIO_EXTS, VIDEO: VIDEO_EXTS, PDF: PDF_EXTS, MEDIA: MEDIA_EXTS };
export const detectMediaType = (url: string) => AUDIO_EXTS.some(ext => url.toLowerCase().split('?')[0].endsWith(ext)) ? 'audio' : 'video';
export const isMedia = (url: string) => MEDIA_EXTS.some(ext => url.toLowerCase().split('?')[0].endsWith(ext));
export const isPdf = (url: string) => PDF_EXTS.some(ext => url.toLowerCase().split('?')[0].endsWith(ext));
export const isBilibili = (url: string) => BILIBILI_REGEX.test(url);
export const isAlidrive = (url: string) => url.startsWith('alipan://file/');
export const isBaidudrive = (url: string) => url.startsWith('bdpan://file/') || url.startsWith('bdpan://path/');
export const isPan123 = (url: string) => url.startsWith('pan123://file/');
export const isQuarktv = (url: string) => url.startsWith('quarktv://file/');
export const isS3 = (url: string) => url.startsWith('s3://file');
export const isTvbox = (url: string) => url.startsWith('tvbox://video/');
export const isRecognizedMediaLink = (url?: string | null) => !!url && (
    isBilibili(url) || isMedia(url) || isAlidrive(url) || isBaidudrive(url) || isPan123(url) || isQuarktv(url) || isS3(url) || isTvbox(url));
const error = (msg: string, ctx = '') => { console.error(`[Player] ${ctx}:`, msg); showMessage(msg); return msg; };

// ===== 媒体处理核心类 =====
export class Media {
    // URL解析 - 统一解析入口
    static parse(url: string) {
        if (!url) return { url: '', type: 'video', source: 'standard' };

        // 提取时间参数 - 兼容时分秒和秒数格式
        const timeMatch = url.match(TIME_REGEX);
        let startTime: number | undefined, endTime: number | undefined;
        if (timeMatch) {
            const timeStr = timeMatch[1];
            if (timeStr.includes('-')) {
                [startTime, endTime] = timeStr.split('-').map(Media.parseTime);
            } else {
                startTime = Media.parseTime(timeStr);
            }
        }

        const cleanUrl = url.replace(/[?&]t=[^&]+/, '').replace(/[?&]$/, '');
        const type = detectMediaType(url);

        // 来源判断
        if (isBilibili(url)) {
            // 课程URL检测
            const courseMatch = url.match(/\/cheese\/play\/(ss|ep)(\d+)/);
            if (courseMatch) {
                return { url: cleanUrl, type: 'bilibili', source: 'bilibili', isCourse: true, startTime, endTime };
            }
            
            const bv = url.match(BV_REGEX)?.[0];
            const page = url.match(/[?&]p=(\d+)/)?.[1];
            return { url: bv ? `https://www.bilibili.com/video/${bv}${page ? `?p=${page}` : ''}` : cleanUrl, type: 'bilibili', source: 'bilibili', bv, page, startTime, endTime };
        }

        // 阿里云盘协议检测
        if (url.startsWith('alipan://file/')) {
            const fileId = (url.split('/').pop() || '').split('?')[0];
            return { url: cleanUrl, type, source: 'alidrive', fileId, startTime, endTime };
        }
        // 百度网盘协议检测
        if (url.startsWith('bdpan://path/')) {
            const pathPart = url.substring('bdpan://path'.length);
            const path = decodeURIComponent(pathPart.split('?')[0]);
            return { url: cleanUrl, type, source: 'baidudrive', path, startTime, endTime };
        }
        // 123云盘伪协议检测
        if (url.startsWith('pan123://file/')) {
            const fileId = (url.split('/').pop() || '').split('?')[0];
            return { url: cleanUrl, type, source: 'pan123', fileId, startTime, endTime };
        }
        // 夸克TV伪协议检测
        if (url.startsWith('quarktv://file/')) {
            const fileId = (url.split('/').pop() || '').split('?')[0];
            return { url: cleanUrl, type, source: 'quarktv', fileId, startTime, endTime };
        }
        // S3伪协议检测
        if (url.startsWith('s3://file')) {
            const pathPart = url.substring('s3://file'.length);
            const path = decodeURIComponent(pathPart.split('?')[0]);
            return { url: cleanUrl, type, source: 's3', path, startTime, endTime };
        }
        // TVBox伪协议检测
        if (url.startsWith('tvbox://video/')) {
            const urlPart = url.substring('tvbox://video/'.length);
            let title = urlPart.split('?')[0];
            try { title = decodeURIComponent(title); } catch {}
            const ep = urlPart.includes('?') ? parseInt(new URLSearchParams(urlPart.split('?')[1]).get('ep') || '0') : 0;
            return { url: cleanUrl, type: 'video', source: 'tvbox', tvboxTitle: title, tvboxEpisode: ep || undefined, startTime, endTime };
        }

        // WebDAV协议检测
        if (url.startsWith('webdav://path')) {
            const pathPart = url.substring('webdav://path'.length);
            const path = decodeURIComponent(pathPart.split('?')[0]);
            return { url: cleanUrl, type, source: 'webdav', path, startTime, endTime };
        }

        // Blob URL检测 - 优先处理，避免被其他规则误判
        if (url.startsWith('blob:')) { return { url: cleanUrl, type, source: 'blob', startTime, endTime }; }
        // OpenList/AList检测（常见端口/路由，首启不依赖配置）
        try {
            const u = new URL(cleanUrl);
            const cfgHost = (() => { try { return new URL(OpenListManager.getConfig?.()?.server || '').host; } catch { return ''; } })();
            const isOpenList = url.includes('/#/') || /:52(44|45|46)$/.test(u.host) || (cfgHost && u.host === cfgHost);
            if (isOpenList) {
                const path = url.includes('/#/') ? `/${url.split('/#/')[1]?.split('?')[0] || ''}` : u.pathname;
                return { url: cleanUrl, type, source: 'openlist', path: decodeURIComponent(path), startTime, endTime };
            }
        } catch {}
        if (url.startsWith('file://')) return { url: cleanUrl, type, source: 'local', path: url.substring(7), startTime, endTime };
        if (!url.includes('://') && !url.startsWith('/') && window.siyuan?.config?.system?.workspaceDir) return { url: `file://${window.siyuan.config.system.workspaceDir}/data/${cleanUrl}`, type, source: 'local', path: `${window.siyuan.config.system.workspaceDir}/data/${cleanUrl}`, startTime, endTime };

        // WebDAV检测（明确路径特征）
        if (/(\/(webdav|dav|remote\.php\/(dav|webdav))\/|https?:\/\/.*?jianguoyun\.com\/dav\/)/i.test(url)) {
            return { url: cleanUrl, type, source: 'webdav', startTime, endTime };
        }

        return { url: cleanUrl, type, source: 'standard', startTime, endTime };
    }

    // 获取播放URL - 统一播放URL获取
    static async getPlayUrl(parsed: any, config?: any, item?: any): Promise<string> {
        if (parsed.source === 'bilibili' && (parsed.bv || parsed.isCourse || item?.isCourse)) {
            const info = item?.cid ? item : await BilibiliParser.getVideoInfo(parsed.url, config) as any;
            if (info?.cid) return await BilibiliParser.getProcessedVideoStream(info.bvid || parsed.bv, info.cid, 0, config, info.aid, info.isCourse, info.epid);
        }
        // AliDrive 使用伪协议或签名直链，统一在播放阶段解析
        try {
            const { AliDriveManager } = await import('./alidrive');
            if (parsed.url.startsWith('alipan://')) return parsed.url;
            if (AliDriveManager.isAliPreviewOrDownloadUrl(parsed.url)) {
                const fid = AliDriveManager.parseFileIdFromUrl(parsed.url);
                if (fid) return `alipan://file/${fid}`;
            }
       } catch {}

        if (parsed.source === 'webdav' && parsed.path) {
            const { WebDAVManager } = await import('./webdav');
            return await WebDAVManager.getFileLink(parsed.path);
        }

        return await this.handleCloud(parsed, config, 'url') || parsed.url;
    }

    // 超级统一云盘处理 - 自动回退（OpenList → WebDAV）
    static async handleCloud(parsed: any, config?: any, type = 'url', url?: string, timeParams?: any, item?: any, getConfig?: () => Promise<any>): Promise<any> {
        const managers = {
            openlist: () => import('./openlist').then(m => m.OpenListManager),
            webdav: () => import('./webdav').then(m => m.WebDAVManager),
            alidrive: () => import('./alidrive').then(m => m.AliDriveManager),
            baidudrive: () => import('./baidudrive').then(m => m.BaiduDriveManager),
            pan123: () => import('./123pan').then(m => m.Pan123Manager),
            quarktv: () => import('./quarktv').then(m => m.QuarkTVManager),
            s3: () => import('./s3').then(m => m.S3Manager)
        } as const;
        const tryOrder = parsed?.source === 'openlist' ? ['openlist', 'webdav'] : [parsed?.source || item?.source];
        for (const src of tryOrder) {
            const m: any = await managers[src as keyof typeof managers]?.();
            if (!m) continue;
            try {
                const cfg = config || (getConfig ? await getConfig() : null);
                if (!m.getConfig?.()?.connected && cfg) await (async () => { const A = cfg?.settings?.[`${src}Accounts`] || []; for (const a of A) { try { if ((await m.checkConnection(a)).connected) { m.setConfig(a); break; } } catch {} } })();
                const r = type === 'url' ? (
                    src === 'openlist' ? m.getFileLink(parsed.path.replace(/^\/p\//, '/')) :
                    src === 'webdav' ? m.getFileLink(new URL(parsed.url).pathname) :
                    src === 'alidrive' ? m.getFileLink(parsed.fileId || parsed.file_id || parsed.path || '') :
                    src === 'baidudrive' ? m.getFileLink(parsed.path || '') :
                    src === 'pan123' ? m.getFileLink(parsed.fileId || parsed.path || '') :
                    src === 'quarktv' ? m.getFileLink(parsed.fileId || parsed.path || '') :
                    src === 's3' ? m.getFileLink(parsed.path || '') : null
                ) : type === 'media' ? (
                    src === 'openlist' && parsed.path ? m.handleOpenListMediaLink(url, timeParams) :
                    src === 'webdav' ? m.handleWebDAVMediaLink(url, timeParams) : null
                ) : (item?.sourcePath && !item.is_dir ? m.createMediaItemFromPath(item.sourcePath, { startTime: item.startTime, endTime: item.endTime }) : null);
                if (r !== null && r !== undefined) return r;
            } catch {}
        }
        return null;
    }


    // 获取媒体信息 - 统一媒体信息获取
    static async getMediaInfo(url: string, config?: any): Promise<{ success: boolean; mediaItem?: MediaItem; error?: string }> {
        try {
            const parsed = this.parse(url);
            const timeParams = { startTime: parsed.startTime, endTime: parsed.endTime };
            const cloudResult = await this.handleCloud(parsed, config, 'media', url, timeParams);
            if (cloudResult?.success) return cloudResult;

            // 基础信息构建
            let info: any = { ...parsed, title: this.getTitle(url) };

            // B站信息获取
            if (parsed.source === 'bilibili' && (parsed.bv || parsed.isCourse)) {
                const biliInfo = await BilibiliParser.getVideoInfo(url, config);
                if (biliInfo) { info = { ...info, ...biliInfo }; info.originalUrl = url; }
            }

            // 本地及（安全可控）源生成缩略图和时长（避免云盘直链/自定义协议导致报错或卡死）
            if (parsed.type === 'video' && ['local', 'webdav', 'openlist'].includes(parsed.source)) {
                try {
                    // 关键改动：先获取可播放链接
                    const playUrl = await this.getPlayUrl(parsed, config);
                    if (playUrl) {
                        Object.assign(info, await this.generateThumbnail(playUrl));
                    }
                } catch (e) {
                    console.warn(`[Player] Thumbnail generation failed for ${parsed.source} URL: ${url}`, e);
                }
            }

            // 音频元数据解析（本地和思源空间）
            if (parsed.type === 'audio' && ['local', 'siyuan'].includes(parsed.source)) {
                try {
                    if (window.navigator.userAgent.includes('Electron') && url.startsWith('file://')) {
                        const fp = parsed.url.replace('file://', '').replace(/\//g, '\\');
                        const fs = window.require('fs');
                        const meta = await mm.parseBlob(new Blob([fs.readFileSync(fp)]));
                        const lrc = await SubtitleManager.loadLocalLRC(fp);
                        Object.assign(info, {
                            title: meta.common.title || info.title,
                            artist: meta.common.artist || meta.common.artists?.join(', ') || info.artist,
                            album: meta.common.album,
                            year: meta.common.year,
                            genre: meta.common.genre,
                            duration: meta.format.duration ? this.fmt(meta.format.duration) : info.duration,
                            lyrics: lrc || meta.common.lyrics?.[0]
                        });
                        if (meta.common.picture?.length) {
                            const pic = meta.common.picture[0];
                            const cover = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
                            const asset = await imageToLocalAsset(cover);
                            if (asset) { info.thumbnail = asset; info.coverDataUrl = asset; }
                        }
                    }
                } catch (e) { console.warn('音频元数据解析失败:', e); }
            }

            return { success: true, mediaItem: this.create({ ...info, ...parsed }) };
        } catch (e) {
            return { success: false, error: error(String(e), 'getMediaInfo') };
        }
    }

    // 创建媒体项
    static create(data: any): MediaItem {
        // 音频缩略图优先级：coverDataUrl > thumbnail > 默认图标
        const audioThumbnail = data.type === 'audio' 
            ? (data.coverDataUrl || data.thumbnail || this.getThumbnail(data))
            : (data.thumbnail || this.getThumbnail(data));
            
        return {
            ...data,  // 保留所有原始属性（包括 tvboxTitle 等）
            id: data.id || `media-${Date.now()}`,
            title: data.title || this.getTitle(data.url),
            url: data.url,
            originalUrl: data.originalUrl || data.url,
            type: data.type || 'video',
            thumbnail: audioThumbnail,
            duration: data.duration || '',
            artist: data.artist || '',
            artistIcon: data.artistIcon || '',
            bvid: data.bv || data.bvid,
            source: data.source || (data.url?.startsWith('bdpan://') ? 'baidudrive' : 'standard'),
        };
    }

    // 工具方法
    static getTitle(url: string): string {
        try {
            const filename = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
            const lastDot = filename.lastIndexOf('.');
            return lastDot > 0 ? filename.slice(0, lastDot) : filename || '未知';
        } catch {
            const filename = url.split(/[/\\]/).pop() || '';
            const lastDot = filename.lastIndexOf('.');
            return lastDot > 0 ? filename.slice(0, lastDot) : filename || '未知';
        }
    }

    static fmt = (seconds: number): string => isNaN(seconds) || seconds < 0 ? '0:00' : ((h, m, s) => h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`)(Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), Math.floor(seconds % 60));
    static parseTime = (timeStr: string): number => { const parts = timeStr.split(':').map(Number); return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : Number(timeStr) || 0; };
    static withTime = (url: string, start: number, end?: number): string => `${url}${url.includes('?') ? '&' : '?'}t=${end ? `${Media.fmt(start)}-${Media.fmt(end)}` : Media.fmt(start)}`;
    static getThumbnail = (item: any): string => {
        const typeKey = (item?.is_dir || item?.type === 'folder') ? 'folder' : (item?.type === 'audio' ? 'audio' : (item?.type === 'pdf' ? 'pdf' : 'video')) as 'folder'|'audio'|'pdf'|'video';
        const defaults: Record<typeof typeKey, string> = {
            folder: '/plugins/siyuan-media-player/assets/images/folder.svg',
            video: '/plugins/siyuan-media-player/assets/images/video.png',
            audio: '/plugins/siyuan-media-player/assets/images/audio.png',
            pdf: '/plugins/siyuan-media-player/assets/images/video.png'
        } as any;
        const cfg = (window as any).__smp_cfg || {};
        const override = typeKey === 'folder' ? cfg.defaultThumbFolder : typeKey === 'audio' ? cfg.defaultThumbAudio : typeKey === 'pdf' ? cfg.defaultThumbPdf : cfg.defaultThumbVideo;
        const cur = item?.thumbnail;
        if (cur) return cur === defaults[typeKey] ? (override || cur) : cur;
        return override || defaults[typeKey];
    };

    // 生成缩略图和获取时长
    private static generateThumbnail(url: string): Promise<{thumbnail: string, duration: string}> {
        return new Promise(resolve => {
            const video = document.createElement('video');
            video.style.display = 'none';
            video.src = url;
            document.body.appendChild(video);
            video.onloadedmetadata = () => video.currentTime = Math.min(5, video.duration / 2);
            video.onseeked = async () => {
                const canvas = document.createElement('canvas');
                [canvas.width, canvas.height] = [video.videoWidth, video.videoHeight];
                canvas.getContext('2d')?.drawImage(video, 0, 0);
                document.body.removeChild(video);
                resolve({
                    thumbnail: canvas.toDataURL('image/jpeg', 0.7),
                    duration: this.fmt(video.duration)
                });
            };
            video.load();
        });
    }
}

// ===== 播放器操作 =====
// 外部播放器
export async function openPlayer(url: string, type: PlayerType, path?: string): Promise<string | void> {
    try {
        const parsed = Media.parse(url);
        const playUrl = parsed.startTime ? Media.withTime(parsed.url, parsed.startTime) : parsed.url;

        if (type === PlayerType.BROWSER) {
            window.navigator.userAgent.includes('Electron') && typeof require === 'function' ? require('electron').shell.openExternal(playUrl) : window.open(playUrl, '_blank');
            return;
        }

        if (!path) return "请配置播放器路径";

        const cleanPath = path.replace(/^["']|["']$/g, '');
        const timeParam = parsed.startTime ? ` /seek=${Media.fmt(parsed.startTime)}` : '';
        const fileUrl = parsed.url.startsWith('file://') ? parsed.url.substring(7).replace(/\//g, '\\') : parsed.url;
        const command = `"${cleanPath}" "${fileUrl}"${timeParam}`;

        if (window.navigator.userAgent.includes('Electron') && typeof require === 'function') {
            require('child_process').exec(command);
        } else {
            await fetch('/api/system/execCommand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
        }
    } catch (e) {
        return error(String(e), 'openPlayer');
    }
}

// 播放媒体 - 统一播放入口
export async function play(options: any, player: any, config: any, setItem: (item: any) => void): Promise<void> {
    if (!options?.url) { error('无效播放选项', 'play'); return; }

    try {
        const item = Media.create(options);
        setItem(item);

        const isEmbeddedPlayer = config.settings.playerType === PlayerType.BUILT_IN || config.settings.playerType === PlayerType.MPV;
        if (!isEmbeddedPlayer) {
            const originalUrl = options.originalUrl || options.url;
            const playUrl = options.startTime ? Media.withTime(originalUrl, options.startTime, options.endTime) : originalUrl;
            const err = await openPlayer(playUrl, config.settings.playerType, config.settings.playerPath);
            if (err) showMessage(err);
        } else {
            // B站视频流是 blob: URL，无需解析，直接播放
            if (options.url.startsWith('blob:')) {
                await player.play(options.url, item);
                return;
            }
            const parsed = Media.parse(options.url);
            const playUrl = await Media.getPlayUrl(parsed, config, item);
            if (!playUrl) throw new Error('无法获取播放URL');
            // 保留 item 的所有元数据，只补充必要的播放参数
            const finalOptions = { ...item, source: item.source || parsed.source, startTime: options.startTime, endTime: options.endTime };
            await player.play(playUrl, finalOptions);
        }
    } catch (e) {
        error(String(e), 'play');
    }
}

// 独立播放函数 - 处理复杂媒体类型（从PlayList组件逻辑抽离）
export async function playMediaItem(item: any, startTime?: number, endTime?: number, getConfig?: () => Promise<any>, openTab?: () => void): Promise<void> {
    try {
        // 处理普通媒体
        const opts = { ...item, startTime, endTime };

        // B站视频处理
        const bvid = item.bvid || item.url?.match(/BV[a-zA-Z0-9]+/)?.[0];
        if ((item.source === 'B站' || item.type === 'bilibili' || bvid || item.isCourse) && (bvid || item.isCourse) && getConfig) {
            const { isBilibiliAvailable, BilibiliParser } = await import('./bilibili');
            if (!isBilibiliAvailable()) throw new Error('B站扩展未启用');
            const config = await getConfig();
            const playConfig = item.isCourse ? config : (config.settings?.bilibiliLogin?.mid ? config : (await Promise.all((config.settings?.bilibiliAccounts || []).map(async (acc: any) => { try { await BilibiliParser.getVideoParts({ bvid }); return { settings: { bilibiliLogin: acc } }; } catch { return null; } }))).find(Boolean));
            if (!playConfig) throw new Error('需要登录B站才能播放视频');
            const cid = item.cid || (!item.isCourse && bvid ? (await BilibiliParser.getVideoParts({ bvid }))?.[0]?.cid : null);
            if (cid) Object.assign(opts, { url: await BilibiliParser.getProcessedVideoStream(bvid, cid, 0, playConfig, (item as any).aid, (item as any).isCourse, (item as any).epid), originalUrl: opts.originalUrl || (item.isCourse ? `https://www.bilibili.com/cheese/play/ep${item.epid}` : `https://www.bilibili.com/video/${bvid}${opts.url?.match(/[?&]p=(\d+)/)?.[1] ? `?p=${opts.url.match(/[?&]p=(\d+)/)?.[1]}` : ''}`), type: 'video', bvid, cid });
        }

        // 事件分发：允许多开时自动打开新tab
        if (getConfig && openTab) { 
            const cfg = await getConfig(), hasTab = !!document.querySelector('.media-player-tab, #media-player-mobile-dialog'), embedded = cfg.settings?.playerType?.match(/built-in|mpv/);
            embedded && (!hasTab || cfg.settings?.allowMultipleInstances) ? (openTab(), setTimeout(() => window.dispatchEvent(new CustomEvent('playMediaItem', { detail: opts })), 300)) : window.dispatchEvent(new CustomEvent('playMediaItem', { detail: opts }));
        } else window.dispatchEvent(new CustomEvent('playMediaItem', { detail: opts }));
    } catch (e) {
        const errorMsg = String(e), errorMap = { 'WBI密钥': 'B站登录信息已过期，请重新登录', '需要登录B站': '需要登录B站才能播放视频', 'B站扩展未启用': 'B站扩展未启用，无法播放B站视频' }, key = Object.keys(errorMap).find(k => errorMsg.includes(k));
        error(errorMsg, 'playMediaItem');
        showMessage(key ? errorMap[key] : `播放失败: ${errorMsg}`, 0);
        throw e;
    }
}

// ===== 全局API =====
// 注册全局播放器
export function registerGlobalPlayer(currentItem: any, player: any): void {
    if (typeof window === 'undefined') return;
    try {
        (window as any).siyuanMediaPlayer = {
            player, currentItem,
            seekTo: (time: number) => typeof player.seekTo === 'function' ? (player.seekTo(time), true) : false,
            setLoopSegment: (start: number, end: number) => typeof player.setPlayTime === 'function' ? (player.setPlayTime(start, end), true) : false,
            getCurrentMedia: () => currentItem,
            getCurrentTime: () => player.getCurrentTime?.() || 0
        };
    } catch (e) {
        error(String(e), 'registerGlobalPlayer');
    }
}

// 创建链接点击处理器 - 统一链接处理
export function createLinkClickHandler(playerAPI: any, getConfig: () => Promise<any>, openTab: () => void, playlistPlay?: any): (e: MouseEvent) => Promise<void> {
    return async (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // 获取链接URL（优先 data-href，再回退 href；加粗/斜体等格式可能导致 href 变为内部链接）
        const linkEl = target.matches('span[data-type="a"]') ? target : target.closest('a[href], [data-href], span[data-type="a"], span[data-type="url"]');
        const url = (linkEl?.getAttribute('data-media-url') || linkEl?.getAttribute('data-href') || linkEl?.getAttribute('href')) as string | null;
        if (!isRecognizedMediaLink(url)) return;
        e.preventDefault();
        e.stopPropagation();
        //e.stopImmediatePropagation(); // 阻止其他插件（如网页视图插件）拦截媒体链接

        try {
            const config = await getConfig();
            const type = e.ctrlKey ? PlayerType.BROWSER : config.settings.playerType;

            // 外部播放器
            if (type === PlayerType.POT_PLAYER || type === PlayerType.VLC || type === PlayerType.BROWSER) {
                const err = await openPlayer(url, type, config.settings.playerPath);
                if (err) showMessage(err);
                return;
            }

            // 内置播放器处理
            const hasTab = !!document.querySelector('.media-player-tab, #media-player-mobile-dialog');
            const currentItem = playerAPI.getCurrentMedia?.();
            const parsed = Media.parse(url);

            // 丝滑跳转判断
            if (hasTab && currentItem && parsed.startTime !== undefined && ((currentItem.bvid && parsed.bv) ? (currentItem.bvid === parsed.bv && (currentItem.originalUrl?.match(/[?&]p=(\d+)/)?.[1] || '1') === (parsed.page || '1')) : (currentItem.originalUrl || currentItem.url || '').split('?')[0] === parsed.url.split('?')[0])) {
                parsed.endTime !== undefined ? playerAPI.setPlayTime?.(parsed.startTime, parsed.endTime) : playerAPI.seekTo?.(parsed.startTime);
                console.log(`🎯 丝滑跳转: ${Media.fmt(parsed.startTime)}${parsed.endTime ? `-${Media.fmt(parsed.endTime)}` : ''}`);
                return;
            }

            // 获取媒体信息
            const processResult = await Media.getMediaInfo(url, config);
            const mediaItem = processResult.success && processResult.mediaItem ?
                { ...processResult.mediaItem, startTime: parsed.startTime, endTime: parsed.endTime } :
                Media.create({ title: Media.getTitle(url), type: detectMediaType(url), url, startTime: parsed.startTime, endTime: parsed.endTime });

            // 块内播放：从链接元素向上查找块
            const block = linkEl?.closest('[data-node-id][data-inline-player]');
            const inlinePlayerId = block?.getAttribute('data-inline-player');
            if (inlinePlayerId && processResult.success && mediaItem.url) {
                const { initInlinePlayer } = await import('./mediaView');
                const pluginI18n = (window as any).siyuan?.languages?.['siyuan-media-player'] || {};
                await initInlinePlayer(inlinePlayerId, mediaItem, getConfig, pluginI18n);
                block?.removeAttribute('data-inline-player');
                return;
            }

            // Tab播放：允许多开模式由playMediaItem统一处理tab打开，单实例模式在这里确保有tab
            const allowMultiple = config.settings?.allowMultipleInstances;
            if (!hasTab && !allowMultiple) { openTab(); await new Promise(resolve => setTimeout(resolve, 800)); }
            if (playlistPlay) await playlistPlay(mediaItem, mediaItem.startTime, mediaItem.endTime);
        } catch (e) {
            error(String(e), 'linkClick');
        }
    };
}