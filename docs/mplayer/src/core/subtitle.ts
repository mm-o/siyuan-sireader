/**
 * 字幕处理工具类
 * 用于处理播放器的字幕功能
 */
import { getBiliAPI, getBiliHeaders } from './bilibili';
import { Media } from './player';
import { OpenListManager } from './openlist';

/**
 * 字幕配置对象
 */
export interface SubtitleOptions {
    url: string;         // 字幕URL
    type?: string;       // 字幕类型 (vtt, srt, ass)
    encoding?: string;   // 字幕编码
}

/**
 * 字幕条目
 */
export interface SubtitleCue {
    startTime: number;    // 开始时间（秒）
    endTime: number;      // 结束时间（秒）
    text: string;         // 主字幕文本
    text2?: string;        // 副字幕文本（可选）
}

/**
 * 字幕处理工具类
 */
export class SubtitleManager {
    private static cache = new Map<string, SubtitleCue[]>();
    private static current: SubtitleCue[] = [];

    /**
     * 获取当前加载的字幕
     */
    static getSubtitles = (): SubtitleCue[] => SubtitleManager.current;

    /**
     * 设置当前字幕
     */
    static setSubtitles = (subtitles: SubtitleCue[]): void => { SubtitleManager.current = subtitles; };

    /**
     * 获取B站视频字幕
     */
    static async loadBilibiliSubtitle(bvid: string, cid: string, config?: any): Promise<SubtitleCue[]> {
        const key = `bili_${bvid}_${cid}`;
        if (this.cache.has(key)) return this.cache.get(key) || [];

        const api = getBiliAPI();
        if (!api) return [];

        try {
            const headers = config ? getBiliHeaders(config, bvid) : {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': `https://www.bilibili.com/video/${bvid}/`
            };

            const result = await fetch('/api/network/forwardProxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: `${api.VIDEO_SUBTITLE}?bvid=${bvid}&cid=${cid}`,
                    method: 'GET',
                    timeout: 7000,
                    headers: Object.entries(headers).map(([k, v]) => ({ [k]: v }))
                })
            }).then(r => r.json());

            if (result.code !== 0) return this.save(key, []);

            const data = JSON.parse(result.data.body);
            if (data.code !== 0) return this.save(key, []);

            const list: any[] = data.data?.subtitle?.list || data.data?.subtitle?.subtitles || [];
            if (!list.length) return this.save(key, []);

            // 选择主/副语言：优先英文+中文组合（无英文则仅中文）
            const en = list.find((s: any) => String(s.lan || '').toLowerCase().startsWith('en'));
            const zh = list.find((s: any) => String(s.lan || '').toLowerCase().startsWith('zh')) || list.find((s: any) => s.lan === 'ai-zh');
            const primaryInfo = en || zh || list[0];
            const secInfo = primaryInfo === en && zh ? zh : (primaryInfo === zh && en ? en : null);
            const toUrl = (u: string) => u.startsWith('//') ? `https:${u}` : u;
            const map = (it: any): SubtitleCue => ({ startTime: it.from, endTime: it.to, text: it.content });

            try {
                const urls = [toUrl(primaryInfo.subtitle_url), ...(secInfo ? [toUrl(secInfo.subtitle_url)] : [])];
                const [p, s] = await Promise.all(urls.map(u => fetch(u).then(r => r.json()).catch(() => null)));
                const P: SubtitleCue[] = p?.body?.map(map) || [];
                const S: SubtitleCue[] = s?.body?.map(map) || [];
                return this.save(key, S.length ? this.mergeBilingual(P, S) : P);
            } catch {
                return this.save(key, []);
            }
        } catch {
            return [];
        }
    }

    /**
     * 加载并解析字幕文件（智能解码版）
     */
    static async loadSubtitle(url: string, type: string = 'srt'): Promise<SubtitleCue[]> {
        if (!url) return [];
        const C=this.cache.get(url); if (C) return C;
        let b:Blob|null=null;
        try{const r=await fetch(url); if(r.ok) b=await r.blob();}catch{}
        if(!b){try{const res=await fetch('/api/network/forwardProxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,method:'GET',timeout:15000,responseEncoding:'base64'})}).then(r=>r.json()); if(res?.code===0&&res.data?.body){const bytes=new Uint8Array(atob(res.data.body).split('').map((x:string)=>x.charCodeAt(0))); b=new Blob([bytes],{type:res.data.contentType||'text/plain'});}}catch{}}
        if(!b) return [];
        const t=await this.getTextFromBlob(b), K=['srt','vtt','ass'];
        let f=(type||'').toLowerCase();
        if(!K.includes(f)){
            try{const u=new URL(url), cd=u.searchParams.get('response-content-disposition')||u.searchParams.get('Response-Content-Disposition')||''; const m=decodeURIComponent(cd).match(/\.(srt|vtt|ass)(?=$|[^a-z])/i); if(m) f=m[1].toLowerCase(); else{const p=u.pathname.toLowerCase(); f=p.endsWith('.srt')?'srt':p.endsWith('.vtt')?'vtt':p.endsWith('.ass')?'ass':'';}}catch{}
        }
        if(!K.includes(f)){
            const h=t.slice(0,4096);
            f=/^WEBVTT/m.test(h)?'vtt':(/^\[Script Info]/m.test(h)||/\bDialogue:/m.test(t))?'ass':(/\d\d:\d\d:\d\d,\d{3}\s+-->\s+\d\d:\d\d:\d\d,\d{3}/.test(t)?'srt':(/\d\d:\d\d\.\d{3}\s+-->\s+\d\d:\d\d\.\d{3}/.test(t)?'vtt':'srt'));
        }
        const M:{[k:string]:(s:string)=>SubtitleCue[]}={srt:this.parseSRT,vtt:this.parseVTT,ass:this.parseASS};
        return this.save(url,(M[f]||this.parseSRT)(t));
    }

    /**
     * 解析字幕文本
     */
    private static parseSRT(content: string): SubtitleCue[] {
        const regex = /(\d+)\r?\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n\d+\r?\n|\r?\n\r?\n$|$)/g;
        return SubtitleManager.parseWithRegex(content, regex, ',');
    }

    private static parseVTT(content: string): SubtitleCue[] {
        const body = content.replace(/^WEBVTT.*?(\r?\n\r?\n|\r?\n)/i, '');
        const regex = /(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3}).*?\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n\s*\d{2}:\d{2}|\s*$)/g;
        return SubtitleManager.parseWithRegex(body, regex, '.');
    }

    private static getTextFromBlob(blob: Blob): Promise<string> {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    resolve(new TextDecoder('utf-8', { fatal: true }).decode(reader.result as ArrayBuffer));
                } catch (e) {
                    resolve(new TextDecoder('gbk').decode(reader.result as ArrayBuffer));
                }
            };
            reader.onerror = () => resolve('');
            reader.readAsArrayBuffer(blob);
        });
    }

    private static parseASS(content: string): SubtitleCue[] {
        const dialogues = content.split(/\r?\n/).filter(line => line.startsWith('Dialogue:'));
        return dialogues.map(line => {
            const parts = line.split(',');
            if (parts.length < 10) return null;
            const text = parts.slice(9).join(',').replace(/\{[^}]*\}|\N/g, ' ').trim();
            if (!text) return null;
            return {
                startTime: SubtitleManager.parseTime(parts[1], '.'),
                endTime: SubtitleManager.parseTime(parts[2], '.'),
                text
            };
        }).filter(Boolean) as SubtitleCue[];
    }

    /**
     * 使用正则表达式解析字幕
     */
    private static parseWithRegex(content: string, regex: RegExp, separator: string): SubtitleCue[] {
        try {
            const subtitles: SubtitleCue[] = [];
            let match: RegExpExecArray | null;

            while ((match = regex.exec(content)) !== null) {
                // SRT格式有4个捕获组，VTT格式有3个捕获组
                const startTime = match[match.length === 5 ? 2 : 1];
                const endTime = match[match.length === 5 ? 3 : 2];
                const text = match[match.length === 5 ? 4 : 3]?.trim();

                if (!text) continue;

                const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
                if (!lines.length) continue;

                subtitles.push({
                    startTime: SubtitleManager.parseTime(startTime, separator),
                    endTime: SubtitleManager.parseTime(endTime, separator),
                    text: lines[0],
                    ...(lines.length > 1 && { text2: lines.slice(1).join(' ') })
                });
            }

            return subtitles;
        } catch {
            return [];
        }
    }

    /**
     * 解析时间字符串为秒
     */
    private static parseTime(time: string, separator: string): number {
        try {
            if (separator === ':') { // ASS格式
                const [h, m, s] = time.split(':');
                return (Number(h) * 3600) + (Number(m) * 60) + Number(s);
            }

            // SRT/VTT格式
            const hasHours = time.split(':').length === 3;
            const [h, m, s] = hasHours ? time.split(':') : ['0', ...time.split(':')];
            const parts = (hasHours ? s : m).split(separator);
            const seconds = Number(parts[0]) + (parts[1] ? Number(parts[1]) / 1000 : 0);

            return (Number(h) * 3600) + (Number(hasHours ? m : h) * 60) + seconds;
        } catch {
            return 0;
        }
    }



    /**
     * 清除字幕缓存
     */
    static clearCache(): void {
        this.cache.clear();
        this.current = [];
    }

    static mergeBilingual(primary: SubtitleCue[], secondary: SubtitleCue[]): SubtitleCue[] {
        if (!primary?.length) return [];
        if (!secondary?.length) return primary;
        let j = 0;
        for (let i = 0; i < primary.length; i++) {
            const p = primary[i];
            while (j < secondary.length && secondary[j].endTime < p.startTime) j++;
            const s = secondary[j];
            if (s && s.startTime <= p.endTime) p.text2 = s.text;
        }
        return primary;
    }

    /**
     * 手动选择并加载本地字幕文件（.srt/.vtt）
     */
    static async pickAndLoadSubtitle(): Promise<SubtitleCue[]> {
        return new Promise(resolve => {
            try {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.srt,.vtt,.ass';
                input.multiple = true;
                input.onchange = async () => {
                    const files = Array.from(input.files || []);
                    if (!files.length) return resolve(this.save('manual:none', []));
                    const parseOne = async (f: File): Promise<SubtitleCue[]> => {
                        const ext = (f.name.split('.').pop() || 'srt').toLowerCase();
                        const text = await this.getTextFromBlob(f);
                        const parser = { srt: this.parseSRT, vtt: this.parseVTT, ass: this.parseASS }[ext] || this.parseSRT;
                        return parser.call(this, text);
                    };
                    try {
                        const list1 = await parseOne(files[0]);
                        const finalList = files.length >= 2 ? this.mergeBilingual(list1, await parseOne(files[1])) : list1;
                        const saved = this.save(`manual:${files.map(f => f.name).join('&')}`, finalList);
                        try { window.dispatchEvent(new CustomEvent('subtitlesUpdated', { detail: { subtitles: saved } })); } catch {}
                        resolve(saved);
                    } catch {
                        const empty: SubtitleCue[] = [];
                        try { window.dispatchEvent(new CustomEvent('subtitlesUpdated', { detail: { subtitles: empty } })); } catch {}
                        resolve(this.save(`manual:error`, empty));
                    }
                    input.remove();
                };
                input.click();
            } catch {
                resolve(this.save('manual:error', []));
            }
        });
    }

    private static save(key: string, subtitles: SubtitleCue[]): SubtitleCue[] {
        this.current = subtitles;
        this.cache.set(key, subtitles);
        return subtitles;
    }

    // 查找支持文件（极限精简最终版）
    private static async _getCloudFiles(parsed: any, item?: any): Promise<{provider:any, manager: any, dir: any, files: any[]}> {
        const PNS: any = {
            'alidrive': { getM:async()=>(await import('./alidrive')).AliDriveManager, p:async(M:any,i:any,p:any)=>{let d=''; const s=i?.sourcePath||''; if(s.includes('|')){const g=s.split('/').filter(Boolean);d=(g[g.length-2]||'').split('|').pop()||'';} if(!d&&p.fileId){try{const m=await(M as any).getFileMeta(p.fileId);d=m?.parent_file_id||'';}catch{}} return d;}, f:async(M:any,d:any)=>await M.getDirectoryContents(d).catch(()=>[]), n:(f:any)=>f.name, l:async(M:any,f:any)=>(await M.getDownloadUrl(f.file_id).catch(()=>({url:''}))).url, t:(f:any)=>f.type==='file' },
            'baidudrive': { getM:async()=>(await import('./baidudrive')).BaiduDriveManager, p:(_:any,i:any,p:any)=>{const t=p.path||i?.sourcePath||''; const l=t.lastIndexOf('/'); return l===-1?null:t.substring(0,l)||'/';}, f:async(M:any,d:any)=>await M.getDirectoryContents(d).catch(()=>[]), n:(f:any)=>f.server_filename, l:async(M:any,f:any)=>await M.getDownloadLink(String(f.fs_id)).catch(()=>''), t:(f:any)=>f.isdir!==1 },
            'pan123': { getM:async()=>(await import('./123pan')).Pan123Manager, p:(_:any,i:any,_p:any)=>{const s=i?.sourcePath||''; if(!s.includes('|'))return 0; const g=s.split('/').filter(Boolean); return Number((g[g.length-2]||'').split('|').pop()||0);}, f:async(M:any,d:any)=>await M.listFilesRaw(d).catch(()=>[]), n:(f:any)=>f.name||f.fileName, l:async(M:any,f:any)=>(await M.getDownloadInfo(f.fileId||f.id).catch(()=>({url:''}))).url, t:(f:any)=>f.type!==1&&(f.fileId||f.id) },
            'openlist': { getM:()=>Promise.resolve(OpenListManager), p:(_:any,_i:any,p:any)=>{const t=p.path||''; const l=t.lastIndexOf('/'); return l===-1?null:t.substring(0,l)||'/';}, f:async(M:any,d:any)=>await M.getDirectoryContents(d).catch(()=>[]), n:(f:any)=>f.name, l:async(M:any,f:any,d:any)=>await M.getFileLink(`${d}/${f.name}`).catch(()=>''), t:(f:any)=>!f.is_dir },
            'webdav': { getM:async()=>(await import('./webdav')).WebDAVManager, p:(_:any,_i:any,p:any)=>{const t=p.path||''; const l=t.lastIndexOf('/'); return l===-1?null:t.substring(0,l)||'/';}, f:async(M:any,d:any)=>await M.getDirectoryContents(d).catch(()=>[]), n:(f:any)=>f.name, l:async(M:any,f:any)=>await M.getFileLink(f.path).catch(()=>''), t:(f:any)=>!f.is_dir },
            'quarktv': { getM:async()=>(await import('./quarktv')).QuarkTVManager, p:async(_:any,i:any,_p:any)=>{const s=i?.sourcePath||''; if(!s||!s.includes('|'))return'0'; const g=s.split('/').filter(Boolean); return(g[g.length-2]||'').split('|').pop()||'0';}, f:async(M:any,d:any)=>await M.getDirectoryContents(d).catch(()=>[]), n:(f:any)=>f.filename||f.file_name||f.name, l:async(M:any,f:any)=>(await M.getDownloadUrl(f.fid||f.id).catch(()=>({url:''}))).url, t:(f:any)=>!(f.isdir===1||f.isdir===true)&&(f.fid||f.id) },
        };
        const H = PNS[parsed.source];
        if (!H) return {provider:null, manager:null, dir:null, files:[]};
        const M = await H.getM(), D = await H.p(M,item,parsed);
        if(D===null) return {provider:H, manager:M, dir:D, files:[]};
        const files = (await H.f(M, D)).filter(H.t);
        return {provider: H, manager: M, dir: D, files: files};
    }

    static async findSupportFiles(mediaUrl: string, exts: string[], findOne = false, item?: any): Promise<any> {
        try {
            if (mediaUrl.startsWith('file://')) {
                const p=decodeURIComponent(mediaUrl.substring(7)), i=p.lastIndexOf('.'), s=p.lastIndexOf('/');
                if (i===-1||s===-1||i<s) return findOne?null:[];
                const d=p.substring(0,s), b=p.substring(s+1,i);
                
                // Electron环境：使用fs检查文件存在
                if (window.navigator.userAgent.includes('Electron') && typeof window.require === 'function') {
                    const fs = window.require('fs');
                    const path = window.require('path');
                    const R: any[] = [];
                    for (const e of exts) {
                        const n = `${b}${e}`;
                        const filePath = path.join(d, n);
                        if (fs.existsSync(filePath)) {
                            const u = `file://${d}/${encodeURIComponent(n)}`;
                            R.push({ name: n, url: u });
                            if (findOne) return u;
                        }
                    }
                    return findOne ? null : R;
                }
                
                return findOne ? null : [];
            }
            const parsed = Media.parse(mediaUrl);
            let b = '';
            if (parsed.source==='alidrive'){const s=item?.sourcePath||''; if(s.includes('|')){const g=s.split('/').filter(Boolean),n=(g.pop()||'').split('|')[0]||'';const i=n.lastIndexOf('.');b=i===-1?n:n.substring(0,i);} if(!b&&parsed.fileId){try{const {AliDriveManager}=await import('./alidrive');const m=await(AliDriveManager as any).getFileMeta(parsed.fileId);if(m?.name){const i=m.name.lastIndexOf('.');b=i===-1?m.name:m.name.substring(0,i);}}catch{}}}
            else if (['baidudrive','openlist','webdav'].includes(parsed.source)){const p=parsed.path||item?.sourcePath||'',i=p.lastIndexOf('.'),s=p.lastIndexOf('/');if(i>s)b=p.substring(s+1,i);}
            else if (['pan123','quarktv'].includes(parsed.source)){const s=item?.sourcePath||'';if(s.includes('|')){const n=(s.split('/').filter(Boolean).pop()||'').split('|')[0]||'';const i=n.lastIndexOf('.');b=i===-1?n:n.substring(0,i);}}
            if(!b) return findOne ? null : [];
            const {provider:H, manager:M, dir:D, files} = await this._getCloudFiles(parsed, item);
            for (const ext of exts) {
                const f = files.find((x: any) => (H.n(x) || '').toLowerCase() === `${b}${ext}`.toLowerCase());
                if (f) { const u = await H.l(M,f,D); if(u) return findOne ? u : [{ name: H.n(f), url: u }]; }
            }
        } catch {}
        return findOne ? null : [];
    }

    static async listCloudSubtitleFiles(mediaUrl: string, item?: any): Promise<Array<{ name: string; url: string }>> {
        try {
            const parsed = Media.parse(mediaUrl);
            const {provider:H, manager:M, dir:D, files} = await this._getCloudFiles(parsed, item);
            if (!H) return [];
            const exts = ['.srt', '.vtt', '.ass'];
            const subs = files.filter((f:any) => exts.some(e => (H.n(f) || '').toLowerCase().endsWith(e)));
            return (await Promise.all(subs.map(async (f:any) => { const u = await H.l(M,f,D); return { name: H.n(f), url: u }; }))).filter((s:any) => s.url);
        } catch {}
        return [];
    }

    // ========== LRC 歌词处理 ==========
    
    /** 解析 LRC 为字幕格式 */
    static parseLRC(lrc: string): SubtitleCue[] {
        const lines = (lrc || '').split('\n').map(l => {
            const m = l.match(/\[(\d+):(\d+)(?:\.(\d+))?\](.*)/);
            return m ? { time: +m[1] * 60 + +m[2] + (+m[3] || 0) / 1000, text: m[4].trim() } : null;
        }).filter((x): x is { time: number; text: string } => x !== null && !!x.text).sort((a, b) => a.time - b.time);
        return lines.map((l, i) => ({ startTime: l.time, endTime: lines[i + 1]?.time || l.time + 99999, text: l.text }));
    }

    /** 加载本地同名 LRC 文件（Electron） */
    static async loadLocalLRC(audioPath: string): Promise<string | null> {
        try {
            if (!window.require) return null;
            const fs = window.require('fs');
            const lrcPath = audioPath.replace(/\.(mp3|flac|wav|m4a|aac|ogg)$/i, '.lrc');
            return fs.existsSync(lrcPath) ? fs.readFileSync(lrcPath, 'utf-8') : null;
        } catch { return null; }
    }
}