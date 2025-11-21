<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { PlayOptions, MediaItem } from '../core/types';
    
    export let config: any = {};
    export let i18n: any = {};
    export let currentItem: MediaItem = null;
    export let api: any = {};
export let playPrev: (force?: boolean) => Promise<void> = async () => {};
export let playNext: (force?: boolean) => Promise<void> = async () => {};

let el: HTMLElement, proc: any, sock: any, ipc = '', id = 0;
let loading = true, error = '', ct = 0, playing = false, s = {t: 0, d: 0, p: false, title: ''};

const upd = () => updateCtrl();
const cmd = (c: string, a: any[] = []) => new Promise<void>((ok, err) => {
    if (!sock?.writable) return err(new Error('IPC'));
    sock.write(JSON.stringify({command: [c, ...a], request_id: ++id}) + '\n', (e: any) => e ? err(e) : ok());
});

const SVG_PREV = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="m13.41 12l3.3-3.29a1 1 0 1 0-1.42-1.42l-4 4a1 1 0 0 0 0 1.42l4 4a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.42ZM8 7a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1"/></svg>';
const SVG_PLAY = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="m16 10.27l-5-2.89a2 2 0 0 0-3 1.73v5.78a2 2 0 0 0 1 1.73a2 2 0 0 0 2 0l5-2.89a2 2 0 0 0 0-3.46M15 12l-5 2.89V9.11zM12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8"/></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M10 7a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1m2-5a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8m2-13a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1"/></svg>';
const SVG_NEXT = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8.71 7.29a1 1 0 1 0-1.42 1.42l3.3 3.29l-3.3 3.29a1 1 0 0 0 0 1.42a1 1 0 0 0 1.42 0l4-4a1 1 0 0 0 0-1.42ZM16 7a1 1 0 0 0-1 1v8a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1"/></svg>';
const SVG_SHOT = '<svg viewBox="0 0 1024 1024" width="18" height="18"><path fill="currentColor" d="M853.333333 170.666667a73.142857 73.142857 0 0 1 73.142857 73.142857v536.380952a73.142857 73.142857 0 0 1-73.142857 73.142857H170.666667a73.142857 73.142857 0 0 1-73.142857-73.142857V243.809524a73.142857 73.142857 0 0 1 73.142857-73.142857h682.666666z m0 73.142857H170.666667v536.380952h682.666666V243.809524z m-375.856762 168.057905l120.685715 120.685714 51.687619-51.712 172.422095 172.373333-51.712 51.736381-120.685714-120.685714-51.736381 51.736381-120.685715-120.685714-224.109714 224.109714-51.712-51.687619 275.846095-275.870476zM731.428571 292.571429a48.761905 48.761905 0 1 1 0 97.523809 48.761905 48.761905 0 0 1 0-97.523809z"/></svg>';
const SVG_TIME = '<svg viewBox="0 0 1024 1024" width="18" height="18"><path fill="currentColor" d="M511.292952 121.904762c80.408381 0 155.087238 24.405333 217.136762 66.218667l-49.737143 49.785904a318.756571 318.756571 0 0 0-167.399619-47.152762C334.189714 190.756571 190.610286 334.57981 190.610286 512s143.60381 321.243429 320.682666 321.243429c177.103238 0 320.682667-143.823238 320.682667-321.243429 0-49.127619-11.02019-95.695238-30.72-137.337905l51.102476-51.078095A388.87619 388.87619 0 0 1 900.681143 512c0 215.454476-174.32381 390.095238-389.36381 390.095238C296.228571 902.095238 121.904762 727.454476 121.904762 512S296.228571 121.904762 511.292952 121.904762z m0 137.679238c42.179048 0 81.968762 10.386286 116.906667 28.769524l-51.955809 51.931428a182.54019 182.54019 0 0 0-64.950858-11.849142c-101.180952 0-183.247238 82.16381-183.247238 183.56419 0 101.376 82.041905 183.588571 183.247238 183.588571s183.247238-82.212571 183.247238-183.588571a185.295238 185.295238 0 0 0-2.194285-28.42819l56.344381-56.32c9.435429 26.477714 14.57981 55.003429 14.579809 84.74819 0 139.410286-112.810667 252.416-251.977143 252.416-139.142095 0-251.952762-113.005714-251.952762-252.416s112.810667-252.416 251.952762-252.416zM853.577143 143.433143L902.095238 192.146286 566.613333 527.676952l-51.102476 2.681905 2.535619-51.297524 335.481905-335.62819z"/></svg>';
const SVG_LOOP = '<svg viewBox="0 0 1024 1024" width="18" height="18"><path fill="currentColor" d="M1020.562286 846.555429q0 43.885714-43.885715 43.885714h-50.029714v85.284571q0 18.212571-12.873143 31.085715t-31.012571 12.873142q-43.885714 0-43.885714-43.885714v-85.357714H140.726857q-43.885714 0-43.885714-43.885714V215.04H45.348571q-43.885714 0-43.885714-43.885715t43.885714-43.885715h51.565715V48.493714q0-43.885714 43.885714-43.885714t43.885714 43.885714V127.268571h698.148572q18.139429 0 31.012571 12.873143 12.8 12.873143 12.8 31.012572v631.588571h50.102857q43.885714 0 43.885715 43.812572z m-181.686857-43.885715V215.04H184.612571v587.702857h654.262858z"/></svg>';
const SVG_NOTE = '<svg viewBox="0 0 1024 1024" width="18" height="18"><path fill="currentColor" d="M832 128a64 64 0 0 1 64 64v640a64 64 0 0 1-64 64H192a64 64 0 0 1-64-64V192a64 64 0 0 1 64-64h640z m0 64H192v640h640V192zM320 384h384a32 32 0 0 1 0 64H320a32 32 0 0 1 0-64z m0 192h384a32 32 0 0 1 0 64H320a32 32 0 0 1 0-64z"/></svg>';

let ctrlEl: HTMLDivElement | null = null;

const updateCtrl = () => {
    if (!ctrlEl) return;
    const fill = ctrlEl.querySelector('.fill') as HTMLElement;
    const cur = ctrlEl.querySelector('.cur') as HTMLElement;
    const total = ctrlEl.querySelector('.total') as HTMLElement;
    const tog = ctrlEl.querySelector('.tog') as HTMLElement;
    if (fill) fill.style.width = ((s.t / s.d * 100) || 0) + '%';
    if (cur) cur.textContent = fmt(s.t || 0);
    if (total) total.textContent = fmt(s.d || 0);
    if (tog) tog.innerHTML = s.p ? SVG_PAUSE : SVG_PLAY;
};

const fmt = (n: number) => {
    const h = ~~(n / 3600), m = ~~(n % 3600 / 60), ss = ~~(n % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};

onMount(async () => {
    const path = config?.mpvPath || '';
    try {
        const {exec} = (window as any).require('child_process');
        const ok = await new Promise(r => exec(`"${path}" --version`, {timeout: 3000}, (e: any) => r(!e)));
        if (!ok) throw new Error('');
    } catch { error = 'MPV 未安装'; loading = false; return; }
    
    await new Promise(r => setTimeout(r, 500));
    if (!el) { error = '容器未找到'; loading = false; return; }
    
    try {
        const {spawn} = (window as any).require('child_process');
        const {join} = (window as any).require('path');
        const {tmpdir} = (window as any).require('os');
        
        ipc = process.platform === 'win32' ? `\\\\.\\pipe\\mpv-${Date.now()}` : join(tmpdir(), `mpv-${Date.now()}`);
        
        const r = el.getBoundingClientRect();
        const [x, y, w, h] = [Math.round(window.screenX + r.left), Math.round(window.screenY + r.top), Math.round(r.width), Math.round(r.height)];
        
        proc = spawn(path, ['--idle=yes', '--keep-open=yes', '--hwdec=auto', '--vo=gpu-next', '--gpu-api=d3d11', '--profile=gpu-hq', '--ontop', `--geometry=${w}x${h}+${x}+${y}`, '--title=MPV Player', `--input-ipc-server=${ipc}`], {stdio: ['ignore', 'ignore', 'ignore']});
        
        proc.on('exit', () => { playing = false; });
        
        await new Promise<void>((ok, err) => {
            const net = (window as any).require('net');
            let n = 0;
            const conn = () => {
                if (n++ >= 50) return err(new Error(''));
                sock = net.connect(ipc);
                sock.on('connect', () => {
                    sock.setEncoding('utf8');
                    sock.on('data', (d: string) => {
                        d.trim().split('\n').forEach(l => {
                            try {
                                const m = JSON.parse(l);
                                if (m.event === 'property-change') {
                                    if (m.name === 'time-pos') { s.t = m.data || 0; ct = s.t; upd(); }
                                    else if (m.name === 'duration') { s.d = m.data || 0; upd(); loading = false; }
                                    else if (m.name === 'pause') { s.p = !m.data; playing = s.p; upd(); window.dispatchEvent(new CustomEvent('siyuanMediaPlayerUpdate', {detail: {playing}})); }
                                } else if (m.event === 'end-file') {
                                    playing = false;
                                    if (config?.loopPlaylist) window.dispatchEvent(new CustomEvent('mediaEnded', {detail: {loopPlaylist: true}}));
                                }
                            } catch {}
                        });
                    });
                    ok();
                });
                sock.on('error', () => { sock?.destroy(); setTimeout(conn, 100); });
            };
            setTimeout(conn, 500);
        });
        
        cmd('observe_property', [1, 'time-pos']);
        cmd('observe_property', [2, 'duration']);
        cmd('observe_property', [3, 'pause']);
        
        
        setTimeout(() => {
            if (!el) return;
            ctrlEl = document.createElement('div');
            ctrlEl.className = 'mpv-ctrl';
            ctrlEl.innerHTML = `
                <div class="mpv-prog">
                    <div class="mpv-track"><div class="fill"></div></div>
                    <div class="mpv-time"><span class="cur">0:00</span><span class="total">0:00</span></div>
                </div>
                <div class="mpv-btns">
                    <button class="mpv-btn prev">${SVG_PREV}</button>
                    <button class="mpv-btn tog play">${s.p ? SVG_PAUSE : SVG_PLAY}</button>
                    <button class="mpv-btn next">${SVG_NEXT}</button>
                    <button class="mpv-btn shot">${SVG_SHOT}</button>
                    <button class="mpv-btn time">${SVG_TIME}</button>
                    <button class="mpv-btn loop">${SVG_LOOP}</button>
                    <button class="mpv-btn note">${SVG_NOTE}</button>
                </div>
            `;
            el.appendChild(ctrlEl);
            
            const toggle = ctrlEl.querySelector('.tog');
            const prev = ctrlEl.querySelector('.prev');
            const next = ctrlEl.querySelector('.next');
            const shot = ctrlEl.querySelector('.shot');
            const time = ctrlEl.querySelector('.time');
            const loop = ctrlEl.querySelector('.loop');
            const note = ctrlEl.querySelector('.note');
            const track = ctrlEl.querySelector('.mpv-track');
            
            if (toggle) toggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cmd('cycle', ['pause']).catch(() => {}); });
            if (prev) prev.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); playPrev && playPrev(); });
            if (next) next.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); playNext && playNext(); });
            if (shot) shot.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('mediaPlayerAction', {detail: {action: 'screenshot'}})); });
            if (time) time.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('mediaPlayerAction', {detail: {action: 'timestamp', currentTime: ct}})); });
            if (loop) loop.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('mediaPlayerAction', {detail: {action: 'loopSegment'}})); });
            if (note) note.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('mediaPlayerAction', {detail: {action: 'mediaNotes', currentTime: ct}})); });
            if (track) track.addEventListener('click', (e: any) => {
                e.preventDefault();
                e.stopPropagation();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const pos = (e.clientX - r.left) / r.width * s.d;
                cmd('seek', [pos, 'absolute']).catch(() => {});
            });
        }, 500);
        
        Object.assign(api, {
            getCurrentTime: () => ct,
            seekTo: async (t: number) => cmd('seek', [t, 'absolute']),
            seek: async (o: number) => cmd('seek', [o, 'relative']),
            toggle: async () => cmd('cycle', ['pause']),
            pause: async () => cmd('set_property', ['pause', true]),
            resume: async () => cmd('set_property', ['pause', false]),
            isPlaying: () => playing,
            getCurrentMedia: () => currentItem,
            play: async (url: string, opts: PlayOptions = {}) => await play(url, opts)
        });
        
        if (currentItem?.url) await play(currentItem.url, currentItem);
    } catch { error = 'MPV 初始化失败'; loading = false; }
});

async function play(url: string, opts: PlayOptions = {}) {
    if (!sock) {
        let n = 0;
        while (!sock && n++ < 50) await new Promise(r => setTimeout(r, 100));
        if (!sock) { error = 'MPV 未初始化'; return; }
    }
        loading = true;
        error = '';
    try {
        currentItem = {id: `mpv-${Date.now()}`, ...opts, url} as MediaItem;
        s.title = currentItem.title || '播放中...';
        upd();
        await cmd('loadfile', [url]);
        await cmd('set_property', ['volume', config.volume || 70]);
        await cmd('set_property', ['speed', (config.speed || 100) / 100]);
        if (opts.startTime) await cmd('seek', [opts.startTime, 'absolute']);
        window.dispatchEvent(new CustomEvent('siyuanMediaPlayerUpdate', {detail: {currentItem}}));
    } catch { error = '播放失败'; loading = false; }
}

const handler = async (e: CustomEvent) => { if (e.detail?.url) await play(e.detail.url, e.detail); };
(window as any).__mpvHandler = handler;
window.addEventListener('playMediaItem', handler as any);

    onDestroy(async () => {
    const h = (window as any).__mpvHandler;
    if (h) { window.removeEventListener('playMediaItem', h); delete (window as any).__mpvHandler; }
    if (ctrlEl) { ctrlEl.remove(); ctrlEl = null; }
    sock?.destroy(); sock = null;
    if (proc) { proc.kill(); proc = null; }
});
</script>

<div class="mpv" bind:this={el}>
    {#if loading}<div class="msg"><div class="spin"></div></div>{/if}
    {#if error}<div class="msg"><div class="icon">⚠️</div><div class="text">{error}</div></div>{/if}
</div>

<style>
.mpv{width:100%;height:100%;background:#000;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center}
.msg{display:flex;flex-direction:column;align-items:center;gap:16px;color:#fff}
.spin{width:40px;height:40px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
.icon{font-size:48px}
.text{font-size:16px;font-weight:500}
:global(.mpv-ctrl){position:absolute;bottom:0;left:0;right:0;height:80px;background:rgba(0,0,0,.85);padding:8px 12px;display:flex;flex-direction:column;justify-content:center;z-index:999}
:global(.mpv-prog){margin-bottom:8px}
:global(.mpv-track){height:4px;background:rgba(255,255,255,.2);border-radius:2px;position:relative;cursor:pointer;transition:height .15s}
:global(.mpv-track:hover){height:6px}
:global(.mpv-track .fill){position:absolute;left:0;top:0;height:100%;background:#4CAF50;border-radius:2px;transition:width .1s;box-shadow:0 0 4px rgba(76,175,80,.6)}
:global(.mpv-time){display:flex;justify-content:space-between;margin-top:4px;color:rgba(255,255,255,.85);font-size:11px}
:global(.mpv-btns){display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:nowrap}
:global(.mpv-btn){width:36px;height:36px;border:none;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;flex-shrink:0;color:#333}
:global(.mpv-btn:hover){transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.3);background:#fff}
:global(.mpv-btn:active){transform:translateY(0);box-shadow:0 1px 3px rgba(0,0,0,.2)}
:global(.mpv-btn.play){background:#4CAF50;color:#fff;width:40px;height:40px}
:global(.mpv-btn.play:hover){background:#66BB6A}
</style>
