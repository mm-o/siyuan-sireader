<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import Artplayer from 'artplayer';
    import * as dashjs from 'dashjs';
    import Hls from 'hls.js';
    import type { PlayOptions, MediaItem } from '../core/types';
    import { SubtitleManager } from '../core/subtitle';
    import { DanmakuManager } from '../core/danmaku';
    import { Media } from '../core/player';
    import { HWDecode } from '../core/hwdecode';

    // ===== 属性和状态 =====
    export let config: any = {};
    export let i18n: any = {};
    export let currentItem: MediaItem = null;
    export let api: any = {};
    export let playPrev: (force?: boolean) => Promise<void> = async () => {};
    export let playNext: (force?: boolean) => Promise<void> = async () => {};

    // 内部状态
        let art:any=null,playerContainer:HTMLDivElement,currentChapter:{start:number;end:number;}|null=null,loopCount=0,currentSubtitle='',currentSubtitle2='',subtitleVisible=false,subtitleTimer:any,lyricLines:{text:string;active:boolean}[]=[],loopStartTime:number|null=null,cachedSubSel:any=null,bitrateMonitor:any,tvboxInfo:any=null,multiPanelTimer:any=null;
    // 音量增强（Web Audio）
    let A:any,G:any,V:HTMLVideoElement|null=null;
    function boost(p: any) {
        try { const v: HTMLVideoElement = p?.template?.$video || p?.video; if (!v) return;
            if (V !== v) { const C: any = (window as any).AudioContext || (window as any).webkitAudioContext; if (!C) return; (A ||= new C()); (G ||= A.createGain()).connect(A.destination); A.createMediaElementSource(v).connect(G); V = v; }
            const b = Math.min(600, Math.max(0, Number(config?.volume ?? DEFAULT_CONFIG.volume)));
            p.volume = Math.min(1, b / 100); if (G) G.gain.value = Math.max(1, b / 100); } catch {} }

    const DEFAULT_CONFIG={volume:70,speed:100,loopCount:3,subtitleFontSize:24,subtitleStyle:'default',skipOpening:0,skipEnding:0},getTime=()=>new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    let clockInterval=0;
    $: subtitleStyleMode=config.subtitleStyle||DEFAULT_CONFIG.subtitleStyle;
    $: subtitleStyle=`font-size:${config.subtitleFontSize||DEFAULT_CONFIG.subtitleFontSize}px;`;
    $: clockTime=getTime();
    $: subtitleStyleMode==='clock'?(clockInterval||=(setInterval(()=>clockTime=getTime(),1000),clockInterval)):(clockInterval&&(clearInterval(clockInterval),clockInterval=0));
    // 设置播放速度选项（精简常用档位）
    Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0];

    // ===== 核心功能：播放器 =====
    function initPlayer(url = '', options = {}): any {
        cleanup();

        const safeConfig = { ...DEFAULT_CONFIG, ...config };
        const isAudio = currentItem?.type === 'audio';
        let posterUrl = isAudio ? (currentItem?.coverDataUrl || currentItem?.thumbnail || '/plugins/siyuan-media-player/assets/images/audio.png') : '';
        if (posterUrl && posterUrl.startsWith('assets/')) posterUrl = `/${posterUrl}`;
        const player = new Artplayer({
            container: playerContainer,
            poster: posterUrl,
            url: '',
            volume: safeConfig.volume / 100,
            autoplay: true,
            muted: true,
            pip: false,
            autoSize: true,
            setting: true,
            flip: true,
            playbackRate: true,
            aspectRatio: true,
            subtitleOffset: true,
            fullscreen: false,
            fullscreenWeb: false,
            miniProgressBar: true,
            autoMini: true,
            mutex: !safeConfig.allowMultipleInstances,
            playsInline: true,
            autoOrientation: true,
            loop: false,
            theme: 'var(--b3-theme-primary)',
            lang: window.siyuan?.config?.lang?.toLowerCase() === 'en_us' ? 'en' : 'zh-cn',
            controls: (() => {
                // 块内模式：不显示自定义按钮
                if (safeConfig.inlineMode) return [];
                const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                if (isMobile) return [];  
                const allControls = [
                    { name: 'prev', position: 'left', index: 9, html: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M15.5 18l-6-6 6-6v12zM7 6h2v12H7z"/></svg>', tooltip: i18n.controlBar?.prev?.name || '上一个', click: () => triggerAction('prev') },
                    { name: 'next', position: 'left', index: 11, html: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8.5 6l6 6-6 6V6zM15 6h2v12h-2z"/></svg>', tooltip: i18n.controlBar?.next?.name || '下一个', click: () => triggerAction('next') },
                    { name: 'screenshot', position: 'right', index: 10, html: '<svg viewBox="0 0 1024 1024" width="22" height="22"><path fill="currentColor" d="M853.333333 170.666667a73.142857 73.142857 0 0 1 73.142857 73.142857v536.380952a73.142857 73.142857 0 0 1-73.142857 73.142857H170.666667a73.142857 73.142857 0 0 1-73.142857-73.142857V243.809524a73.142857 73.142857 0 0 1 73.142857-73.142857h682.666666z m0 73.142857H170.666667v536.380952h682.666666V243.809524z m-375.856762 168.057905l120.685715 120.685714 51.687619-51.712 172.422095 172.373333-51.712 51.736381-120.685714-120.685714-51.736381 51.736381-120.685715-120.685714-224.109714 224.109714-51.712-51.687619 275.846095-275.870476zM731.428571 292.571429a48.761905 48.761905 0 1 1 0 97.523809 48.761905 48.761905 0 0 1 0-97.523809z"/></svg>', tooltip: i18n.controlBar?.screenshot?.name || '截图', click: () => triggerAction('screenshot') },
                    { name: 'timestamp', position: 'right', index: 11, html: '<svg viewBox="0 0 1024 1024" width="22" height="22"><path fill="currentColor" d="M511.292952 121.904762c80.408381 0 155.087238 24.405333 217.136762 66.218667l-49.737143 49.785904a318.756571 318.756571 0 0 0-167.399619-47.152762C334.189714 190.756571 190.610286 334.57981 190.610286 512s143.60381 321.243429 320.682666 321.243429c177.103238 0 320.682667-143.823238 320.682667-321.243429 0-49.127619-11.02019-95.695238-30.72-137.337905l51.102476-51.078095A388.87619 388.87619 0 0 1 900.681143 512c0 215.454476-174.32381 390.095238-389.36381 390.095238C296.228571 902.095238 121.904762 727.454476 121.904762 512S296.228571 121.904762 511.292952 121.904762z m0 137.679238c42.179048 0 81.968762 10.386286 116.906667 28.769524l-51.955809 51.931428a182.54019 182.54019 0 0 0-64.950858-11.849142c-101.180952 0-183.247238 82.16381-183.247238 183.56419 0 101.376 82.041905 183.588571 183.247238 183.588571s183.247238-82.212571 183.247238-183.588571a185.295238 185.295238 0 0 0-2.194285-28.42819l56.344381-56.32c9.435429 26.477714 14.57981 55.003429 14.579809 84.74819 0 139.410286-112.810667 252.416-251.977143 252.416-139.142095 0-251.952762-113.005714-251.952762-252.416s112.810667-252.416 251.952762-252.416zM853.577143 143.433143L902.095238 192.146286 566.613333 527.676952l-51.102476 2.681905 2.535619-51.297524 335.481905-335.62819z"/></svg>', tooltip: i18n.controlBar?.timestamp?.name || '时间戳', click: () => triggerAction('timestamp') },
                    { name: 'loopSegment', position: 'right', index: 12, html: '<svg viewBox="0 0 1024 1024" width="22" height="22"><path fill="currentColor" d="M1020.562286 846.555429q0 43.885714-43.885715 43.885714h-50.029714v85.284571q0 18.212571-12.873143 31.085715t-31.012571 12.873142q-43.885714 0-43.885714-43.885714v-85.357714H140.726857q-43.885714 0-43.885714-43.885714V215.04H45.348571q-43.885714 0-43.885714-43.885715t43.885714-43.885715h51.565715V48.493714q0-43.885714 43.885714-43.885714t43.885714 43.885714V127.268571h698.148572q18.139429 0 31.012571 12.873143 12.8 12.873143 12.8 31.012572v631.588571h50.102857q43.885714 0 43.885715 43.812572z m-181.686857-43.885715V215.04H184.612571v587.702857h654.262858z"/><path fill="currentColor" d="M608.256 321.609143q-41.106286-17.773714-86.308571-17.773714-45.129143 0-86.162286 17.627428-35.401143 15.213714-63.341714 41.618286v-9.947429q0-14.043429-10.020572-23.990857-9.874286-9.801143-23.771428-9.801143t-23.844572 10.020572q-10.020571 9.947429-10.020571 23.771428V470.308571q0 14.116571 10.020571 24.064 9.947429 9.801143 23.844572 9.801143h117.174857q14.043429 0 23.990857-10.020571 9.801143-9.947429 9.801143-23.844572 0-13.824-10.020572-23.844571-9.947429-9.947429-23.771428-9.947429h-43.885715q19.602286-25.746286 48.859429-40.228571 33.645714-16.603429 71.460571-13.750857 50.980571 3.876571 87.478858 40.521143 36.571429 36.571429 40.082285 87.478857 4.242286 60.416-37.010285 104.448-40.96 43.885714-100.937143 43.885714-43.739429 0-79.36-25.161143-34.742857-24.576-49.883429-64.365714-4.388571-11.702857-14.409143-18.797714-10.093714-7.094857-22.308571-7.094857-20.187429 0-32.182857 16.530285-11.922286 16.676571-4.973715 35.401143 24.137143 65.097143 81.334858 104.155429 58.733714 40.155429 130.413714 37.156571 84.260571-33.364571 144.457143-63.561143 60.196571-60.050286 63.634285-144.091428 1.828571-45.494857-14.482285-87.332572-15.725714-40.374857-45.933715-71.68-30.208-31.232-69.924571-48.420571z"/></svg>', tooltip: i18n.controlBar?.loopSegment?.name || '循环片段', click: () => triggerAction('loopSegment') },
                    { name: 'mediaNotes', position: 'right', index: 13, html: '<svg viewBox="0 0 1024 1024" width="22" height="22"><path fill="currentColor" d="M832 128a64 64 0 0 1 64 64v640a64 64 0 0 1-64 64H192a64 64 0 0 1-64-64V192a64 64 0 0 1 64-64h640z m0 64H192v640h640V192zM320 384h384a32 32 0 0 1 0 64H320a32 32 0 0 1 0-64z m0 192h384a32 32 0 0 1 0 64H320a32 32 0 0 1 0-64z"/></svg>', tooltip: i18n.controlBar?.mediaNotes?.name || '媒体笔记', click: () => triggerAction('mediaNotes') }
                ];
                return allControls;
            })(),
            settings: [
                { html: i18n.player?.settings?.subtitleControlTip || '字幕开关', switch: safeConfig.showSubtitles !== undefined ? safeConfig.showSubtitles : true, onSwitch: (item: any) => (player.notice.show = (subtitleVisible = config.showSubtitles = !item.switch) ? (i18n.player?.subtitle?.enabled || '已启用字幕') : (i18n.player?.subtitle?.disabled || '已禁用字幕'), subtitleVisible) },
                { name: 'subtitle', html: i18n.player?.settings?.subtitle || '字幕', selector: cachedSubSel||[
                    { html: i18n.player?.settings?.subtitleChoose || '从本地选择' },
                    { html: i18n.player?.settings?.subtitleCloudChoose || '从网盘浏览', url: 'cloud:browse' }
                ], onSelect: async (it: any) => {
                    if(it?.url==='cloud:browse'){const el=player.template.$player.querySelector('.art-layer-subtitleBrowser');if(el){el.style.display='block';(window as any).__subtitleBrowserFunc?.();}return it.html;}
                    const e=(it?.url||'').replace(/[?#].*/,'').split('.').pop()?.toLowerCase()||''; const L=await(it?.url?SubtitleManager.loadSubtitle(it.url,e):SubtitleManager.pickAndLoadSubtitle()); SubtitleManager.setSubtitles(L); window.dispatchEvent(new CustomEvent('subtitlesUpdated',{detail:{subtitles:L}})); subtitleVisible=!!L.length; if(subtitleVisible) config.showSubtitles=true; const t=i18n.player?.subtitle||{}; player.notice.show=subtitleVisible?(t.loaded||'已加载字幕 ${count} 条').replace('${count}',String(L.length)):(t.loadCanceled||'未选择字幕'); return it.html;
                } },
                { html: i18n.player?.settings?.pipMode || '画中画', switch: false, onSwitch: () => (player.pip = !player.pip) },
                { html: i18n.player?.settings?.fullscreenWeb || '网页全屏', switch: false, onSwitch: () => (player.fullscreenWeb = !player.fullscreenWeb) },
                { html: i18n.player?.settings?.fullscreen || '全屏', switch: false, onSwitch: () => (player.fullscreen = !player.fullscreen) },
            ],
            ...options
        });

        player.video.crossOrigin = 'anonymous';
        player.url = url;

        if (isAudio && currentItem?.lyrics) SubtitleManager.setSubtitles(SubtitleManager.parseLRC(currentItem.lyrics)), subtitleVisible = config.showSubtitles = true;
        setupPlayerEvents(player, safeConfig);
        // 字幕浏览层
        let M:any,path='',base='',F:any[]=[],L:HTMLElement,loading=false,hist:any[]=[];const B=async(p='')=>{try{loading=true;const s=currentItem?.source;const cname=hist.length?hist[hist.length-1].n:'/';const nav=hist.length?`<div data-back style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #fff3;color:#fff;font-size:14px">← ${cname}</div>`:`<div style="padding:8px 12px;border-bottom:1px solid #fff3;color:#fff;font-size:14px">/</div>`;L.innerHTML=`<div data-box style="position:absolute;right:10px;top:50px;width:300px;max-height:400px;background:#000c;border-radius:4px;overflow:hidden">${nav}<div style="padding:20px;text-align:center;color:#999;font-size:13px">加载中...</div></div>`;if(!s||!['alidrive','baidudrive','pan123','webdav','quarktv','openlist','s3'].includes(s))return player.notice.show='不支持';const c=(await api.getConfig()).settings?.[`${s}Accounts`]||[];if(!c.length)return player.notice.show='未配置';if(!M){if(s==='alidrive'){const{AliDriveManager:A}=await import('../core/alidrive');M=A;M.setConfig(c[0])}else if(s==='baidudrive'){const{BaiduDriveManager:B}=await import('../core/baidudrive');M=B;M.setConfig(c[0])}else if(s==='pan123'){const{Pan123Manager:P}=await import('../core/123pan');M=P;M.setConfig(c[0]);const r=await M.fetchAccessToken(c[0].client_id,c[0].client_secret).catch(()=>null);if(r){M.config={...M.config,access_token:r.accessToken,expires_at:Date.now()+7*24*60*60*1000}}}else if(s==='webdav'){const{WebDAVManager:W}=await import('../core/webdav');M=W;M.setConfig(c[0])}else if(s==='quarktv'){const{QuarkTVManager:Q}=await import('../core/quarktv');M=Q;M.setConfig(c[0])}else if(s==='openlist'){const{OpenListManager:O}=await import('../core/openlist');M=O;const ck=await M.checkConnection(c[0]);if(!ck.connected)throw new Error(ck.message)}else{const{S3Manager:S}=await import('../core/s3');M=S;M.setConfig(c[0])}}else{M.setConfig(c[0]);if(s==='pan123'){const r=await M.fetchAccessToken(M.config.client_id,M.config.client_secret).catch(()=>null);if(r){M.config={...M.config,access_token:r.accessToken,expires_at:Date.now()+7*24*60*60*1000}}}}base=base||((s==='alidrive'?'root':s==='baidudrive'?'/':s==='pan123'?'0':s==='webdav'?'/':s==='quarktv'?'0':s==='openlist'?'/':s==='s3'?'/':'/'));path=p||base;const R=s==='pan123'?await M.listFilesRaw(path).catch(e=>{console.error('[123pan]',e);throw e}):await M.getDirectoryContents(path).catch(e=>{console.error(`[${s}]`,e);throw e});F=R.map((f:any)=>{const isD=s==='alidrive'?f.type==='folder':s==='baidudrive'?f.isdir===1:s==='pan123'?f.type===1:s==='webdav'?f.is_dir:s==='quarktv'?f.isdir===1||f.isdir===true:s==='openlist'?f.is_dir:f.is_dir;const n=s==='quarktv'?f.filename||f.file_name||f.name:s==='pan123'?f.name||f.fileName||f.filename||'未命名':f.name||f.server_filename||f.filename;const id=s==='alidrive'?f.file_id:s==='baidudrive'?f.path:s==='pan123'?String(f.fileId||f.id):s==='webdav'?f.path:s==='quarktv'?f.fid||f.id:s==='openlist'?`${path==='/'?'':path}/${f.name}`:f.path||f.id;return{...f,n,id,isD}}).filter((f:any)=>f.isD||/\.(srt|vtt|ass)$/i.test(f.n));L.innerHTML=`<div data-box style="position:absolute;right:10px;top:50px;width:300px;max-height:400px;background:#000c;border-radius:4px;overflow:hidden">${nav}${F.length?F.map(f=>`<div data-${f.isD?'dir':'file'}="${f.id}" data-name="${f.n}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #fff1;color:#fff;font-size:13px" onmouseover="this.style.background='#fff2'" onmouseout="this.style.background=''">${f.isD?'📁':'📄'} ${f.n}</div>`).join(''):'<div style="padding:20px;text-align:center;color:#999;font-size:13px">无字幕文件</div>'}</div>`;loading=false;}catch(e){console.error(e);player.notice.show=String(e?.message||e||'浏览失败');loading=false;}};(window as any).__subtitleBrowserFunc=()=>{if(F.length===0&&!loading)B();};player.layers.add({name:'subtitleBrowser',html:'',style:{display:'none'},mounted:($el:HTMLElement)=>{L=$el;$el.addEventListener('click',async(e:any)=>{const t=e.target.closest('[data-box]')?e.target.closest('[data-back],[data-dir],[data-file]'):null;if(!t){L.style.display='none';return}if(t.dataset.back){hist.pop();await B(hist.length?hist[hist.length-1].id:base);}else if(t.dataset.dir){const fd=F.find((f:any)=>f.id===t.dataset.dir);if(!fd)return;hist.push({id:fd.id,n:fd.n});await B(fd.id);}else if(t.dataset.file){const f=F.find((x:any)=>x.id===t.dataset.file);if(!f)return;try{const s=currentItem?.source;let u='';if(s==='alidrive')u=(await M.getDownloadUrl(f.file_id).catch(()=>({url:''}))).url;else if(s==='baidudrive')u=await M.getDownloadLink(String(f.fs_id)).catch(()=>'');else if(s==='pan123')u=(await M.getDownloadInfo(f.fileId||f.id).catch(()=>({url:''}))).url;else if(s==='webdav')u=await M.getFileLink(f.path).catch(()=>'');else if(s==='quarktv')u=(await M.getDownloadUrl(f.fid||f.id).catch(()=>({url:''}))).url;else if(s==='openlist'){const i=await M.getFileDetail(f.id).catch(()=>null);if(i?.raw_url)u=i.raw_url;else if(i?.sign||i?.url){const d=i.sign?`${M.config?.server}/d${f.id}?sign=${i.sign}`:i.url;const pr=await fetch('/api/network/forwardProxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:d,method:'GET',timeout:15000,responseEncoding:'base64'})}).then(r=>r.json());if(pr?.code===0&&pr.data?.body){const b=new Uint8Array(atob(pr.data.body).split('').map((x:string)=>x.charCodeAt(0)));u=URL.createObjectURL(new Blob([b],{type:'text/plain'}))}}}else if(s==='s3')u=(await M.getDownloadUrl(f.path||f.id).catch(()=>({url:''}))).url||'';else u='';if(u){const S=await SubtitleManager.loadSubtitle(u,u.split('.').pop()?.toLowerCase()||'');SubtitleManager.setSubtitles(S);window.dispatchEvent(new CustomEvent('subtitlesUpdated',{detail:{subtitles:S}}));subtitleVisible=!!S.length;if(subtitleVisible)config.showSubtitles=true;player.notice.show=`已加载 ${S.length} 条`;L.style.display='none';}}catch(err){console.error(err);player.notice.show='加载失败';}}})}});
        return player;
    }

    // ===== HLS 播放支持 =====
    function playM3u8(video: HTMLVideoElement, url: string, art: any) {
        if (Hls.isSupported()) {
            if (art.hls) art.hls.destroy();
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            video.preload = 'auto';
            hls.loadSource(url);
            hls.attachMedia(video);
            art.hls = hls;
            art.on('destroy', () => hls.destroy());
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
        } else {
            art.notice.show = 'Unsupported playback format: m3u8';
        }
    }

    // ===== 播放器事件 =====
    function setupPlayerEvents(player: any, safeConfig: any) {
        // 循环播放 & 跳过片头片尾
        player.on('video:timeupdate', () => {
            const t=player.currentTime,d=player.duration;
            if (currentChapter?.end<=t) { const max=safeConfig.loopCount; if(max>0&&loopCount>=max)currentChapter=null,loopCount=0,player.notice.show=i18n.player?.loop?.endMessage||'循环播放结束',safeConfig.pauseAfterLoop&&player.pause(); else player.currentTime=currentChapter.start,player.notice.show=(i18n.player?.loop?.currentLoop||'循环播放: ${current}/${total}').replace('${current}',++loopCount).replace('${total}',max); return; }
            if(currentChapter)return;
            const skip=safeConfig.skipOpening; if(skip>0&&t<1&&d>skip)player.currentTime=skip,player.notice.show=`⏩ ${i18n.player?.skipOpening||'已跳过片头'} ${skip}s`;
            const skipEnd=safeConfig.skipEnding,remain=d-t; if(skipEnd>0&&!safeConfig.loopSingle&&remain<=skipEnd&&remain>0.5)player.currentTime=d-0.5;
        });

        // 初始化配置
        player.on('ready', async () => {
            player.volume = safeConfig.volume / 100;
            player.playbackRate = safeConfig.speed / 100;
            subtitleVisible = safeConfig.showSubtitles !== undefined ? safeConfig.showSubtitles : true;
            updateDanmakuConfig();
            startSubtitleTracking(player);
            // 硬解信息
            const [hw,gpu]=[await HWDecode.check(),HWDecode.getGPU()];
            const $p=player.template.$infoPanel;
            if($p){
                $p.insertAdjacentHTML('afterbegin',`<div class="art-info-item"><div class="art-info-title">硬件加速:</div><div class="art-info-content">${hw?'⚡启用':'禁用'}</div></div>`+(gpu?`<div class="art-info-item"><div class="art-info-title">GPU:</div><div class="art-info-content" style="word-break:break-all">${gpu}</div></div>`:'')+'<div class="art-info-item"><div class="art-info-title">视频码率:</div><div class="art-info-content" data-bitrate>计算中...</div></div>');
                const $b=$p.querySelector('[data-bitrate]');
                if(bitrateMonitor)clearInterval(bitrateMonitor);
                if($b)bitrateMonitor=HWDecode.monitorBitrate(player.video,$b as HTMLElement);
            }
            // PiP/系统媒体控件（上一曲/下一曲/循环等）
            (() => { try { const ms: any = (navigator as any).mediaSession; if (!ms) return; const MM: any = (window as any).MediaMetadata; if (MM) ms.metadata = new MM({ title: currentItem?.title || 'Media', artist: currentItem?.artist || '', album: '', artwork: currentItem?.thumbnail ? [{ src: currentItem.thumbnail, sizes: '512x512', type: 'image/png' }] : [] }); ms.setActionHandler?.('previoustrack', () => triggerAction('prev')); ms.setActionHandler?.('nexttrack', () => triggerAction('next')); ms.setActionHandler?.('play', () => player.play()); ms.setActionHandler?.('pause', () => player.pause()); ms.setActionHandler?.('seekto', (e: any) => { if (typeof e?.seekTime === 'number') player.currentTime = e.seekTime; }); ms.setActionHandler?.('seekbackward', () => { try { player.currentTime = Math.max(0, player.currentTime - 10); } catch {} }); ms.setActionHandler?.('seekforward', () => { try { player.currentTime += 10; } catch {} }); ms.setActionHandler?.('stop', () => { try { config.loopPlaylist = !config.loopPlaylist; player.notice.show = config.loopPlaylist ? '列表循环: 开' : '列表循环: 关'; } catch {} }); } catch {} })();

        // 显示就绪提示
            if (currentItem?.title) {
                player.notice.show = `${currentItem.title} ${i18n.player?.ready || "准备就绪"}`;
            }

            // 自动播放（静音绕过策略）
            player.muted = true;
            player.play().then(() => player.muted = false).catch(() => {});
        });

        // 错误处理
        player.on('error', (error: any) => {
            console.error("[Player] 播放错误", error);
            playerContainer?.dispatchEvent(new CustomEvent('mediaError', { detail: { error } }));
        });

        // 视频结束事件处理
        player.on('video:ended', () => {
            if (safeConfig.loopSingle) {
                setTimeout(() => player && !player.isDestroyed && (player.currentTime = 0, player.muted = true, player.play().then(() => player.muted = false).catch(() => {})), 200);
            } else if (config?.loopPlaylist) {
                window.dispatchEvent(new CustomEvent('mediaEnded', { detail: { loopPlaylist: true } }));
            }
        });

        // 播放状态变化事件
        ['play','pause'].forEach(e=>player.on(e,()=>window.dispatchEvent(new CustomEvent('siyuanMediaPlayerUpdate',{detail:{playing:e==='play'}}))));
        // 自定义快捷键（支持超100%音量，仅播放器获焦时生效）
        player.on('keydown', (e: KeyboardEvent) => {
            if (e.repeat || !player.isFocus || !/Arrow(Up|Down)/.test(e.code)) return;
            const v = Number(config.volume ?? 70), d = e.code === 'ArrowUp' ? 1 : -1;
            config.volume = Math.max(0, Math.min(600, v + d * (v < 100 ? 10 : 20))); boost(player); player.notice.show = `${config.volume}%`;
        });
    }

    // ===== 功能按钮操作 =====
    function triggerAction(action: 'screenshot' | 'timestamp' | 'mediaNotes' | 'loopSegment' | 'prev' | 'next') {
        // 播放列表导航（不需要播放器实例）
        if (action === 'prev') return playPrev(true);
        if (action === 'next') return playNext(true);
        // 其他操作需要播放器实例
        if (!art || art.isDestroyed) {
            console.warn('播放器未就绪:', action);
            return;
        }

        // 循环片段特殊处理
        if (action === 'loopSegment') {
            if (loopStartTime === null) {
                loopStartTime = art.currentTime;
                art.notice.show = i18n.controlBar?.loopSegment?.startHint || "已记录开始时间";
                return;
            }

            const endTime = art.currentTime;
            if (endTime <= loopStartTime) {
                art.notice.show = i18n.controlBar?.loopSegment?.errorHint || "结束时间必须大于开始时间";
                loopStartTime = null;
                return;
            }
        }

        // 发送事件并显示提示
        window.dispatchEvent(new CustomEvent('mediaPlayerAction', {
            detail: { action, ...(action === 'loopSegment' && { loopStartTime }) }
        }));

        art.notice.show = i18n.controlBar?.[action]?.desc || i18n.controlBar?.[action]?.name || action;
        if (action === 'loopSegment') loopStartTime = null;
    }

    // ===== 媒体处理 =====
    // DASH播放器自定义类型处理 - 统一管理
    function playMpd(video: HTMLVideoElement, url: string, art: any) {
        if (!dashjs.supportsMediaSource()) return art.notice.show = '当前环境不支持DASH播放';

        try {
            art.dash?.destroy();
            art.dash = dashjs.MediaPlayer().create();
            art.dash.initialize(video, url, false);
            art.on('destroy', () => (art.dash?.destroy(), art.dash = null));
        } catch (error) {
            console.error("[DASH] 初始化失败:", error);
            art.notice.show = 'DASH播放器初始化失败';
        }
    }

    // 字幕处理
    function startSubtitleTracking(player: any): void {
        if (subtitleTimer) clearInterval(subtitleTimer);

        subtitleTimer=setInterval(()=>{if(!player)return;const s=SubtitleManager.getSubtitles();if(!s.length||subtitleStyleMode==='default'&&!subtitleVisible){currentSubtitle=currentSubtitle2='';lyricLines=[];return;}const t=player.currentTime,i=s.findIndex(c=>t>=c.startTime&&t<=c.endTime),c=i>=0?s[i]:null;currentSubtitle=c?.text||'';currentSubtitle2=c?.text2||'';if(subtitleStyleMode!=='default'&&i>=0){lyricLines=[];for(let j=i-2;j<=i+2;j++)if(j>=0&&j<s.length)lyricLines.push({text:s[j].text,active:j===i});}},200);
    }

    // 循环片段响应
    const handleLoopResponse = (e: any) => {
        if (!e.detail || art?.isDestroyed) return;
        loopStartTime = e.detail.loopStartTime;
        if (art) {
            art.notice.show = loopStartTime === null
                ? (i18n.controlBar?.loopSegment?.resetHint || "已重置")
                : (i18n.controlBar?.loopSegment?.startHint || "已记录开始时间");
        }
    };

    // ===== 播放控制 =====
    // 播放媒体
    async function play(url: string, options: PlayOptions = {}): Promise<void> {
        try {
            currentChapter = null;
            loopCount = 0;
            let tvboxMultiInfoRef:any=null; // 用于持续搜索回调
            let actualUrl = url;
            let actualOptions = { ...options };

            // 云盘和TVBox特殊处理（需要质量选项、搜索等额外信息）
            if (url.startsWith('alipan://') || options.source === 'alidrive') {
                const { AliDriveManager } = await import('../core/alidrive');
                const fileId = url.startsWith('alipan://file/') ? (url.split('/').pop() || '').split('?')[0]
                    : AliDriveManager.isAliPreviewOrDownloadUrl(url) ? AliDriveManager.parseFileIdFromUrl(url) || ''
                    : options.sourcePath?.includes('|') ? options.sourcePath.split('|').pop() || '' : '';
                if (fileId) {
                    const qualities = await AliDriveManager.getAllQualityUrls(fileId);
                    const defaultQuality = qualities.find(q => q.default) || qualities[0];
                    if (defaultQuality) {
                        actualUrl = defaultQuality.url;
                        actualOptions = { ...options, source: 'alidrive', quality: qualities, originalUrl: url } as any;
                    }
                }
            } else if (url.startsWith('bdpan://') || options.source === 'baidudrive') {
                const { BaiduDriveManager } = await import('../core/baidudrive');
                const { finalUrl, finalOptions } = await BaiduDriveManager.resolvePlayableInfo(url, options);
                actualUrl = finalUrl;
                actualOptions = finalOptions;
            } else if (url.startsWith('pan123://') || options.source === 'pan123') {
                const { Pan123Manager } = await import('../core/123pan');
                const { finalUrl, finalOptions } = await Pan123Manager.resolvePlayableInfo(url, options);
                actualUrl = finalUrl;
                actualOptions = finalOptions;
            } else if (url.startsWith('quarktv://') || options.source === 'quarktv') {
                const { QuarkTVManager } = await import('../core/quarktv');
                const { finalUrl, finalOptions } = await QuarkTVManager.resolvePlayableInfo(url, options);
                actualUrl = finalUrl;
                actualOptions = finalOptions;
            } else if (url.startsWith('tvbox://video/') || options.source === 'tvbox') {
                const { searchAndPlay } = await import('../core/tvbox');
                const title = options.tvboxTitle || (options as any).title;
                if (!title) throw new Error('TVBox 协议缺少片名');
                const ep = options.tvboxEpisode || 0;
                art?.notice?.show?.(`搜索: ${title}${ep>1?` 第${ep}集`:''}...`, 5000);
                tvboxInfo = await searchAndPlay(title, ep, (sources) => {
                    if (tvboxInfo) tvboxInfo.allSources = sources;
                    if (tvboxMultiInfoRef) tvboxMultiInfoRef.allSources = sources;
                });
                if (!tvboxInfo) throw new Error(`未找到《${title}》`);
                actualUrl = tvboxInfo.url;
                const playTitle = (tvboxInfo.item.title || title) + (ep>1?` - 第${String(ep).padStart(2,'0')}集`:'');
                actualOptions = { ...options, title: playTitle, thumbnail: tvboxInfo.item.pic, originalUrl: url.startsWith('tvbox://') ? url : (options as any).originalUrl };
                art?.notice?.show?.(`✓ ${tvboxInfo.item.site?.name} - ${playTitle}`, 3000);
            } else if (url.startsWith('webdav://path') || options.source === 'webdav') {
                const { WebDAVManager } = await import('../core/webdav');
                const path = url.startsWith('webdav://path') ? decodeURIComponent(url.substring('webdav://path'.length).split('?')[0]) : options.sourcePath || '';
                if (!path) throw new Error('WebDAV 路径不能为空');
                actualUrl = await WebDAVManager.getFileLink(path);
                actualOptions = { ...options, source: 'webdav', sourcePath: path, originalUrl: url };
            }

            // 更新当前项目和标题
            currentItem = {
                id: `player-${Date.now()}`,
                ...actualOptions,
                url: url // 保持原始协议用于时间戳
            } as MediaItem;
            window.dispatchEvent(new CustomEvent('siyuanMediaPlayerUpdate', {
                detail: { currentItem }
            }));

            // 后台加载字幕（B站/云盘/本地）
            (async(targetArt=art)=>{try{const{bvid,cid}=currentItem,{isBilibiliAvailable}=await import('../core/bilibili');
                if(bvid&&cid&&isBilibiliAvailable()){
                    const cfg=await api.getConfig(),biliCfg=cfg.settings?.bilibiliLogin?.wbi_img?cfg:(cfg.settings?.bilibiliAccounts?.find?.(a=>a.wbi_img)?{settings:{bilibiliLogin:cfg.settings.bilibiliAccounts.find(a=>a.wbi_img)}}:cfg),list=await SubtitleManager.loadBilibiliSubtitle(bvid,cid,biliCfg);
                    if(targetArt!==art||!list?.length)return;
                    SubtitleManager.setSubtitles(list);subtitleVisible=config.showSubtitles=true;window.dispatchEvent(new CustomEvent('subtitlesUpdated',{detail:{subtitles:list}}));
                }else if(['local','openlist','webdav','baidudrive','alidrive','pan123'].includes(currentItem.source)){
                    const subs=await SubtitleManager.findSupportFiles(currentItem.originalUrl||actualUrl,['.srt','.vtt','.ass'],false,currentItem);
                    if(!subs?.length||targetArt!==art)return;
                    const u=subs[0].url,e=u.replace(/[?#].*/,'').split('.').pop()?.toLowerCase()||'',list=await SubtitleManager.loadSubtitle(u,e);
                    if(targetArt!==art||!list.length)return;
                    SubtitleManager.setSubtitles(list);subtitleVisible=config.showSubtitles=true;window.dispatchEvent(new CustomEvent('subtitlesUpdated',{detail:{subtitles:list}}));
                    cachedSubSel=subs.map((s:any,i:number)=>({html:s.name,url:s.url,default:!i})).concat([{html:i18n.player?.settings?.subtitleChoose||'手动选择'},{html:(i18n.player?.settings?.subtitleCloudChoose||'从网盘选择'),url:'cloud:pick'}]as any);
                    art?.setting?.update({name:'subtitle',tooltip:subs[0].name,selector:cachedSubSel});
                }
            }catch{}})();

            // 播放配置
            const isBaiduStreaming = (actualOptions.source === 'baidudrive') && (/\/rest\/2\.0\/xpan\/file\?/.test(actualUrl) || /type=M3U8_/i.test(actualUrl));
            const isM3u8 = /\.m3u8(\?|$)/i.test(actualUrl) || isBaiduStreaming;
            const playerConfig: any = {
                ...(actualUrl.startsWith('blob:') && options.source === 'bilibili' && { type: 'mpd' }),
                ...(isM3u8 && { type: 'm3u8' }),
                ...(actualOptions.quality && { quality: actualOptions.quality }),
                customType: { mpd: playMpd, m3u8: playM3u8 }
            };

            // 弹幕（B站/本地）
            if (config?.enableDanmaku) {
                try {
                    const danmakuUrl = await loadDanmaku(actualUrl, currentItem);
                    if (danmakuUrl) playerConfig.plugins = [DanmakuManager.createDanmakuPlugin(danmakuUrl)];
                } catch {}
            }

            // 添加多源/多P面板（TVBox/B站等） - 需要在initPlayer之前创建，因为cleanup会清空tvboxInfo
            let multiInfo=tvboxInfo?{type:'tvbox',...tvboxInfo}:null;
            tvboxMultiInfoRef = multiInfo;  // 连接引用以便持续搜索回调更新

            // 初始化播放器（保持 PiP 状态）
            const keepPip = !!art?.pip;
            art = initPlayer(actualUrl, playerConfig);
            await new Promise(resolve => {
                art.on('ready', () => resolve(null));
                if (art.isReady) resolve(null);
            });
            if(!multiInfo&&currentItem?.bvid){let pages:any[]=currentItem.pages;if(!pages){const{BilibiliParser}=await import('../core/bilibili');const fullUrl=(currentItem.originalUrl||currentItem.url||'');const s=fullUrl.match(/#s:(\d+):(c?\d+)/);if(s){const c=await api.getConfig(),acc=c.settings?.bilibiliAccounts?.find((a:any)=>a.mid.toString()===s[1])||c.settings?.bilibiliAccounts?.[0]||c.settings?.bilibiliLogin;if(acc){const{items}=await BilibiliParser.getSeasonArchives(s[1],s[2],{settings:{bilibiliLogin:acc}});pages=(items||[]).map((v:any,i:number)=>({page:i+1,cid:v.cid||v.bvid,bvid:v.bvid,part:v.title||`第${i+1}集`,aid:v.aid,epid:v.epid,isCourse:v.isCourse}));}}else pages=await BilibiliParser.getVideoParts({bvid:currentItem.bvid})||[];}if(pages?.length>0){const fullUrl=(currentItem.originalUrl||currentItem.url||'');multiInfo={type:'bilibili',pages,currentPage:currentItem.page||1,isPlaylist:!!fullUrl.match(/#s:(\d+):(c?\d+)/)};}}
            // 块内模式：不添加multiInfo按钮
            if(!config.inlineMode)art.controls?.add?.({name:'multiInfo',position:'right',index:9,html:'<svg viewBox="0 0 1024 1024" width="22" height="22"><path fill="currentColor" d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"/><path fill="currentColor" d="M464 336a48 48 0 1096 0 48 48 0 10-96 0zm72 112h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V456c0-4.4-3.6-8-8-8z"/></svg>',tooltip:multiInfo?.type==='bilibili'?`${multiInfo.isPlaylist?'合集':'分P'}: ${multiInfo.pages?.length||0}`:multiInfo?.type==='tvbox'?'TVBox':i18n.controlBar?.info||'多源信息',click:()=>{const $p:any=art.template.$player.querySelector('[data-multi-panel]');if($p)$p.style.display=$p.style.display==='none'?'block':'none';}});
            const isTVBox = multiInfo?.type==='tvbox';
            const {item,detail,sourceIdx,episodeIdx}=multiInfo||{},title=isTVBox?(item?.title||(currentItem as any)?.tvboxTitle||''):currentItem?.title||'';
            let currentSource=item,currentSrcIdx=sourceIdx||0,currentEps=isTVBox?(detail?.sources?.[currentSrcIdx]?.episodes||[]):(multiInfo as any)?.pages||[],currentIdx=isTVBox?episodeIdx:((multiInfo as any)?.currentPage-1)||0;
            const renderPanel=()=>{if(!multiInfo)return`<div style="padding:20px;color:#999;text-align:center">暂无信息</div>`;const sources=isTVBox?(multiInfo?.allSources||[item]):null;const allSrcs=isTVBox?(detail?.sources||[]):[];const srcTags=sources?`<div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05)"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${sources.map((s:any)=>`<div data-source="${s.site?.name}" style="padding:6px 12px;border-radius:4px;cursor:pointer;color:${s.site?.name===currentSource?.site?.name?'var(--b3-theme-primary)':'#fff'};background:${s.site?.name===currentSource?.site?.name?'rgba(33,150,243,.15)':'rgba(255,255,255,.05)'};font-size:12px;transition:all .2s;opacity:${s.site?.name===currentSource?.site?.name?'1':'0.75'};border:1px solid ${s.site?.name===currentSource?.site?.name?'var(--b3-theme-primary)':'transparent'}" onmouseover="if('${s.site?.name}'!=='${currentSource?.site?.name||''}'){this.style.opacity='1';this.style.background='rgba(255,255,255,.1)';}" onmouseout="if('${s.site?.name}'!=='${currentSource?.site?.name||''}'){this.style.opacity='0.75';this.style.background='rgba(255,255,255,.05)';}">${s.site?.name||'未知'}</div>`).join('')}${sources.length<5?'<div style="width:16px;height:16px;border:2px solid #999;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>':''}</div></div>`:'';const formTags=isTVBox&&allSrcs.length>1?`<div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05)"><div style="display:flex;flex-wrap:wrap;gap:8px">${allSrcs.map((sr:any,i:number)=>`<div data-form="${i}" style="padding:6px 12px;border-radius:4px;cursor:pointer;color:${i===currentSrcIdx?'var(--b3-theme-primary)':'#fff'};background:${i===currentSrcIdx?'rgba(33,150,243,.15)':'rgba(255,255,255,.05)'};font-size:12px;transition:all .2s;opacity:${i===currentSrcIdx?'1':'0.75'};border:1px solid ${i===currentSrcIdx?'var(--b3-theme-primary)':'transparent'}" onmouseover="if(${i}!==${currentSrcIdx}){this.style.opacity='1';this.style.background='rgba(255,255,255,.1)';}" onmouseout="if(${i}!==${currentSrcIdx}){this.style.opacity='0.75';this.style.background='rgba(255,255,255,.05)';}">${sr.from||`源${i+1}`}</div>`).join('')}</div></div>`:'';return `<div data-detail-title style="padding:12px;border-bottom:1px solid rgba(255,255,255,.1);cursor:pointer;transition:background .2s" onmouseover="this.style.background='rgba(255,255,255,.05)'" onmouseout="this.style.background=''"><div style="color:#fff;font-size:14px;font-weight:600">${title}</div>${isTVBox?'<div style="color:#999;font-size:11px;margin-top:4px">点击查看详情</div>':''}</div>${isTVBox?srcTags:(multiInfo as any)?.type==='bilibili'?`<div style="padding:8px 12px;color:#999;font-size:12px;border-bottom:1px solid rgba(255,255,255,.05)">${(multiInfo as any).isPlaylist?'合集':'分P'}: ${currentEps.length}</div>`:''}${formTags}<div data-ep-list style="max-height:300px;overflow-y:auto">${currentEps.map((e:any,i:number)=>`<div data-ep="${i}" style="padding:10px 12px;cursor:pointer;color:${i===currentIdx?'var(--b3-theme-primary)':'#fff'};font-size:13px;border-bottom:1px solid rgba(255,255,255,.05);transition:all .2s" onmouseover="this.style.background='rgba(255,255,255,.1)'" onmouseout="this.style.background=''">${isTVBox?(e.name||`第${String(i+1).padStart(2,'0')}集`):(e.part||e.page_data?.part||`P${i+1}`)}</div>`).join('')}</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;};const updatePanel=()=>{const $p:any=art.template.$player.querySelector('[data-multi-panel]');if(!$p)return;const $list=$p.querySelector('[data-ep-list]');const scrollTop=$list?.scrollTop||0;$p.innerHTML=renderPanel();const $newList=$p.querySelector('[data-ep-list]');if($newList)$newList.scrollTop=scrollTop;};
            art.layers.add({name:'multiPanel',html:`<div data-multi-panel style="display:none;position:absolute;right:10px;bottom:60px;width:320px;max-height:400px;background:rgba(0,0,0,.9);border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.5)"></div>`,mounted:($el:HTMLElement)=>{updatePanel();$el.addEventListener('click',async(ev:any)=>{const t=ev.target.closest('[data-detail-title],[data-source],[data-form],[data-ep]'),$p:any=$el.querySelector('[data-multi-panel]');if(!t)return;if(t.dataset.detailTitle!==undefined&&isTVBox&&currentSource){api.openSidebarTab?.('tvbox');window.dispatchEvent(new CustomEvent('tvbox:showDetail',{detail:{item:{...currentSource,rawId:currentSource.id||currentSource.vod_id},existingDetail:detail}}));$p.style.display='none';return;}const sources=isTVBox?(multiInfo?.allSources||[item]):null;if(isTVBox&&t.dataset.source){const s=sources.find((src:any)=>src.site?.name===t.dataset.source);if(!s)return;art.notice.show='加载中...';const d=await(await import('../core/tvbox')).cmsDetailInfo(s.site,s.id||s.vod_id);if(!d?.sources?.length)return art.notice.show='无播放源';const si=Math.max(0,d.sources.findIndex((x:any)=>(x.episodes||[]).some((e:any)=>/\.m3u8/i.test(e.url))));currentSource=s;currentSrcIdx=si;currentEps=d.sources[si]?.episodes||[];currentIdx=Math.min(episodeIdx,currentEps.length-1);updatePanel();}else if(isTVBox&&t.dataset.form){const fi=parseInt(t.dataset.form);if(fi===currentSrcIdx)return;currentSrcIdx=fi;currentEps=detail?.sources?.[fi]?.episodes||[];currentIdx=0;updatePanel();}else if(t.dataset.ep){const idx=parseInt(t.dataset.ep);if(idx===currentIdx)return;if(isTVBox){if(!currentEps[idx]?.url)return;const epTitle=`${title} - ${currentEps[idx].name||`第${String(idx+1).padStart(2,'0')}集`}`;await play(currentEps[idx].url,{...currentItem,title:epTitle,thumbnail:currentSource?.pic,tvboxTitle:title,tvboxEpisode:idx+1,source:'tvbox'}as any);currentIdx=idx;updatePanel();}else{const p=currentEps[idx];if(!p)return;const{playMediaItem,Media}=await import('../core/player');const item={...currentItem,bvid:p.bvid||currentItem.bvid,cid:String(p.cid),aid:p.aid,epid:p.epid,page:p.page,title:p.part||`第${p.page}集`,isCourse:p.isCourse,pages:multiInfo.pages,originalUrl:currentItem.originalUrl};const url=item.isCourse?`https://www.bilibili.com/cheese/play/ep${item.epid}`:String(p.cid||'').startsWith('BV')?`https://www.bilibili.com/video/${p.cid}`:(multiInfo as any)?.isPlaylist?`https://www.bilibili.com/video/${p.bvid}`:`https://www.bilibili.com/video/${currentItem.bvid}?p=${p.page}`;const result=await Media.getMediaInfo(url,await api.getConfig());result.success&&result.mediaItem?await playMediaItem({...result.mediaItem,page:p.page,pages:multiInfo.pages,originalUrl:currentItem.originalUrl},undefined,undefined,api.getConfig,()=>{}):await playMediaItem({...item,url},undefined,undefined,api.getConfig,()=>{});}$p.style.display='none';}});if(isTVBox&&multiPanelTimer)clearInterval(multiPanelTimer);if(isTVBox){multiPanelTimer=setInterval(()=>{if((multiInfo?.allSources?.length||0)<20)updatePanel();else{clearInterval(multiPanelTimer);multiPanelTimer=null;}},500);setTimeout(()=>{if(multiPanelTimer){clearInterval(multiPanelTimer);multiPanelTimer=null;}},30000);}}});
            
            if (keepPip) {
                try {
                    art.pip = true;
                    art.muted = true;
                    art.play().then(() => art.muted = false).catch(() => {});
                } catch {}
            } else {
                // 关键修复：非PiP模式也需要确保播放启动
                try {
                    art.muted = true;
                    art.play().then(() => art.muted = false).catch(() => {});
                } catch {}
            }
            // 设置播放位置和循环
            if (options.startTime !== undefined) {
                if (options.endTime !== undefined) {
                    setPlayTime(options.startTime, options.endTime);
                } else {
                    art.currentTime = options.startTime;
                    art.notice.show = `${i18n.player?.jumpTo || "跳转至"} ${Media.fmt(options.startTime)}`;
                }
            }
        } catch (error) {
            console.error("[Player] 播放失败", error);
            if (art) art.notice.show = i18n.player?.error?.playRetry || "播放失败，请重试";
            playerContainer?.dispatchEvent(new CustomEvent('mediaError', {
                detail: { url, options, error }
            }));
        }
    }

    // 弹幕配置更新（即时生效）
    function updateDanmakuConfig(){try{const p=art?.plugins?.artplayerPluginDanmuku;if(!p)return;const spd=Number(config.danmakuSpeed??5),op=Number(config.danmakuOpacity??90)/100,fs=Number(config.danmakuFontSize??25),ar=Number(config.danmakuArea??75);p.config({speed:spd,opacity:op,fontSize:fs,margin:[10,`${100-ar}%`]});const $dm=art?.template?.$danmuku;if($dm)Array.from($dm.children).forEach(el=>{el.style.fontSize=`${fs}px`;el.style.opacity=String(op);});}catch{}}
    // 加载弹幕（B站/本地）
    async function loadDanmaku(url: string, item: MediaItem): Promise<string | null> {
        try {
            const {bvid,cid}=item;if(bvid&&cid){const{isBilibiliAvailable}=await import('../core/bilibili');if(isBilibiliAvailable()){const cfg=await api.getConfig(),biliCfg=cfg.settings?.bilibiliLogin?.wbi_img?cfg:(cfg.settings?.bilibiliAccounts?.find?.(a=>a.wbi_img)?{settings:{bilibiliLogin:cfg.settings.bilibiliAccounts.find(a=>a.wbi_img)}}:cfg),list=await DanmakuManager.getBiliDanmaku(cid,biliCfg);return list?.length?DanmakuManager.generateDanmakuUrl(list):null;}}
            const opts=await DanmakuManager.getDanmakuFileForMedia(url);if(!opts)return null;const list=await DanmakuManager.loadDanmaku(opts.url,opts.type);return list?.length?DanmakuManager.generateDanmakuUrl(list):null;
        } catch {return null;}
    }

    // 设置播放时间和循环
    function setPlayTime(start: number, end?: number): void {
        if (!art) return;
        try {
            loopCount = 0;
            currentChapter = end !== undefined ? { start, end } : null;
            art.currentTime = start;
            art.play();
            if (currentChapter) {
                const duration = end - start;
                art.notice.show = (i18n.player?.loop?.setMessage || '设置循环片段: ${start}s - ${end}s (${duration}s)')
                    .replace('${start}', start.toFixed(1))
                    .replace('${end}', end.toFixed(1))
                    .replace('${duration}', duration.toFixed(1));
            }
        } catch (error) {
            console.error('设置播放时间失败', error);
            art.notice.show = i18n.player?.error?.setTimeFailed || "设置时间失败";
        }
    }

    // ===== 资源管理 =====
    function cleanup(){if(subtitleTimer)clearInterval(subtitleTimer),subtitleTimer=null;if(clockInterval)clearInterval(clockInterval),clockInterval=0;if(bitrateMonitor)clearInterval(bitrateMonitor),bitrateMonitor=null;if(multiPanelTimer)clearInterval(multiPanelTimer),multiPanelTimer=null;tvboxInfo=null;if(art){try{art.pause();if(art.dash)art.dash.destroy();if(art.hls)art.hls.destroy();art.destroy(true);}catch(e){console.error('清理播放器资源失败:',e);}finally{art=null;}}window.removeEventListener('loopSegmentResponse',handleLoopResponse);window.removeEventListener('configUpdated',handleConfigUpdate);window.removeEventListener('playMediaItem',handlePlayMediaItem);SubtitleManager.setSubtitles([]);currentSubtitle='';loopStartTime=null;loopCount=0;currentChapter=null;}
    function updateConfig(c:any){config={...config,...c};if(art){art.volume=(config.volume||DEFAULT_CONFIG.volume)/100;art.playbackRate=(config.speed||DEFAULT_CONFIG.speed)/100;subtitleVisible=config.showSubtitles!==undefined?config.showSubtitles:true;if(config.allowMultipleInstances!==undefined)art.mutex=!config.allowMultipleInstances;updateDanmakuConfig();}}

    // ===== API 方法 =====
    const playerAPI={
        getCurrentTime:()=>art?.currentTime||0,
        seek:(o:number)=>art&&(art.currentTime+=o),
        seekTo:(t:number)=>art&&(art.currentTime=t),
        toggle:()=>art?.toggle(),
        pause:()=>art?.pause(),
        resume:()=>art?.play(),
        isPlaying:()=>art&&!art.paused,
        getScreenshotDataURL:(f='png',q=0.92)=>{const v=art?.video;if(!v)return Promise.resolve(null);try{const c=Object.assign(document.createElement('canvas'),{width:v.videoWidth||v.clientWidth,height:v.videoHeight||v.clientHeight});c.getContext('2d')?.drawImage(v,0,0,c.width,c.height);return Promise.resolve(c.toDataURL(`image/${f==='jpeg'?'jpeg':f==='webp'?'webp':'png'}`,q));}catch{return Promise.resolve(art?.getDataURL?.()||null);}},
        getCurrentMedia:()=>currentItem,
        setLoop:(l:boolean,t?:number)=>{if(art){art.loop=l;if(t!==undefined)config.loopCount=t;}},
        setPlayTime,setLoopSegment:setPlayTime,updateConfig,play,triggerAction
    };

    // ===== 初始化 =====
    const handleConfigUpdate=(e:any)=>updateConfig(e.detail?.settings||{}),handlePlayMediaItem=(e:any)=>{const item=e.detail;if(!config.inlineMode&&item?._inlinePlayerId)return;if(item?.url)play(item.url,item);},init=()=>{if(playerContainer)try{art=initPlayer();}catch(e){console.error('初始化播放器失败',e);}window.addEventListener('loopSegmentResponse',handleLoopResponse);window.addEventListener('configUpdated',handleConfigUpdate);window.addEventListener('playMediaItem',handlePlayMediaItem);Object.assign(api,playerAPI);};
    // 导出方法供全局快捷键调用
    let isCustomSpeed=false;
    const nextRate=(d:number)=>{const r=Artplayer.PLAYBACK_RATE,c=art.playbackRate;return d>0?(r.find(x=>x>c)||r[r.length-1]):([...r].reverse().find(x=>x<c)||r[0]);};
    export const increaseSpeed=()=>{if(!art)return;art.playbackRate=nextRate(1);art.notice.show=`${art.playbackRate}x`;};
    export const decreaseSpeed=()=>{if(!art)return;art.playbackRate=nextRate(-1);art.notice.show=`${art.playbackRate}x`;};
    export const toggleCustomSpeed=()=>{if(!art)return;isCustomSpeed=!isCustomSpeed;art.playbackRate=isCustomSpeed?(config.customSpeed||300)/100:(config.speed||100)/100;art.notice.show=isCustomSpeed?`🚀 ${art.playbackRate}x`:`${art.playbackRate}x`;};
    // 生命周期
    onMount(init);
    onDestroy(cleanup);
</script>

<div class="artplayer-app" bind:this={playerContainer}>
{#if currentSubtitle&&(subtitleStyleMode!=='default'||subtitleVisible)}{#if subtitleStyleMode==='clock'}<div class="subtitle-clock-mode"><div class="clock-time">{clockTime}</div><div class="clock-lyric">{currentSubtitle}</div></div>{:else if subtitleStyleMode==='song'}<div class="subtitle-clock-mode"><div class="clock-media">{#if currentItem?.coverDataUrl||currentItem?.thumbnail}<img class="clock-cover" src={currentItem.coverDataUrl||currentItem.thumbnail} alt="cover">{/if}<div class="clock-info">{#if currentItem?.title}<div class="clock-title">{currentItem.title}</div>{/if}{#if currentItem?.artist}<div class="clock-artist">{currentItem.artist}{currentItem?.album?` · ${currentItem.album}`:''}</div>{/if}</div></div>{#if lyricLines.length}<div class="clock-lyrics">{#each lyricLines as line}<div class="clock-lyric-line" class:active={line.active}>{line.text}</div>{/each}</div>{:else}<div class="clock-lyric">{currentSubtitle}</div>{/if}</div>{:else if subtitleStyleMode==='wave'}<div class="wave-subtitle">{#key currentSubtitle}<div class="wave-text" data-text={currentSubtitle.slice(0,3)}>{currentSubtitle}</div>{/key}</div>{:else}<div class="floating-subtitle" style={subtitleStyle}><span>{currentSubtitle}</span>{#if currentSubtitle2}<br><span>{currentSubtitle2}</span>{/if}</div>{/if}{/if}
</div>