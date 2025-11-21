<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { showMessage, Menu, openTab } from "siyuan";
    // @ts-ignore
    import Tabs from "./Tabs.svelte";
    import type { MediaItem } from '../core/types';
    import { Media, EXT } from '../core/player';
    import { OpenListManager } from '../core/openlist';
    import { WebDAVManager } from '../core/webdav';
    import { AliDriveManager } from '../core/alidrive';
    import { BaiduDriveManager } from '../core/baidudrive';
    import { Pan123Manager } from '../core/123pan';
    import { QuarkTVManager } from '../core/quarktv';
    import { S3Manager } from '../core/s3';
    import { BilibiliParser, isBilibiliAvailable } from '../core/bilibili';
    import { LicenseManager } from '../core/license';
    import { openPdf } from '../core/pdf';
    import { routeDocOp, loadDocViewState, saveDocViewState, getBoundDocId, refreshDocTag } from '../core/playlist/docPlaylist';
    import { routeLocalOp } from '../core/playlist/localPlaylist';
    import { routeDbOp, getAvId, db, mapField } from '../core/playlist/dataPlaylist';
    import * as API from '../api';
    export let className = '', hidden = false, i18n: any, activeTabId = 'playlist', currentItem: MediaItem | null = null, plugin: any;
    let root: HTMLElement;

    // ==================== 配置常量 ====================
    const VIEWS = ['detailed', 'compact', 'grid', 'grid-single'] as const;
    const ICONS = ['M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h10v2H7v-2z', 'M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z', 'M3 3h8v8H3V3zm0 10h8v8H3v-8zm10 0h8v8h-8v-8zm0-10h8v8h-8V3z'];

    // ==================== 核心工具 ====================
    const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const safe = (fn: Function) => async (...args: any[]) => { try { return await fn(...args); } catch (e: any) { showMessage(e?.message || "操作失败"); } };
    const cfg = async () => await plugin.loadData('config.json') || {};
    const dispatch = createEventDispatcher();

    // ==================== UI 设置应用（主题/密度/比例） ====================
    const setUI = (s: any = {}) => {
        (window as any).__smp_cfg = s; if (!root) return;
        const { playlistTheme = 'default', playlistDensity = 50, playlistAspect = 'auto', playlistScale = 100 } = s, theme = playlistTheme === 'neon' ? 'minimal' : playlistTheme;
        ['theme','density','aspect','scale'].forEach((k, i) => root.setAttribute(`data-pl-${k}`, String([theme, playlistDensity, playlistAspect, 1][i])));
        root.style.setProperty('--pl-density', String(playlistDensity));
        root.style.setProperty('--pl-scale', String(playlistScale));
    };
    const applyUI = async () => setUI(((await cfg())?.settings) || {});

    // ==================== 显示配置 ====================
    let displayElements = {};
    const loadDisplayConfig = async () => displayElements = (await cfg()).settings?.playlistDisplayElements || {};
    const show = (key: string) => displayElements[key] ?? true;

    // ==================== 统一状态 ====================
    let state = {
        source: 'local' as 'database' | 'document' | 'local',
        tab: '目录', view: 'detailed' as typeof VIEWS[number], sortMode: 'n' as 'n'|'t'|'s', sortDesc: false,
        tags: ['目录', '默认'], items: [] as MediaItem[], input: '', dbId: '', enabled: false,
        folder: { type: '', path: '', connected: false, basePath: '' },
        edit: '', add: '', exp: new Set<string>(), parts: {} as any, sel: null as MediaItem|null, refs: {} as any,
        drag: { item: -1, tag: '', target: '' }, search: '', searching: false, partsList: false
    };

    // ==================== 视图状态保存 ====================
    const saveView = async () => { if (await saveDocViewState({ cfg, plugin, getTab: () => state.tab, getTags: () => state.tags, setTags: () => {}, getItems: () => [], setItems: () => {}, applySort: (x) => x, getState: () => state })) return; (async c => (c.settings.playlistView = { mode: state.view, tab: state.tab, expanded: [...state.exp] }, await plugin.saveData('config.json', c, 2)))(await cfg()); };
    const loadView = async () => { if (await loadDocViewState({ cfg, plugin, getTab: () => state.tab, getTags: () => state.tags, setTags: () => {}, getItems: () => [], setItems: () => {}, applySort: (x) => x, getState: () => state })) return; const v = (await cfg()).settings?.playlistView; if (v) { state.tab = v.tab || '目录'; state.exp = new Set(v.expanded || []); state.view = v?.mode || 'detailed'; } };



    // ==================== 数据操作 ====================
    const dataOp = async (action: string, params: any = {}) => {
        const deps = { cfg, plugin, getTab: () => state.tab, getTags: () => state.tags, setTags: (t: string[]) => state.tags = t, getItems: () => state.items, setItems: (i: any[]) => state.items = i, applySort, applyTC, toast: showMessage, getState: () => state, connect };
        if (await routeDocOp(deps, action, params)) return;
        if (state.source === 'local' && await routeLocalOp(deps, action, params)) return;
        if (state.source === 'database' && state.enabled && state.dbId) {
            await routeDbOp(deps, state.dbId, action, params);
            if (['load', 'add', 'del', 'move', 'ensure', 'deleteTag', 'renameTag', 'reorder'].includes(action) && action !== 'load') await dataOp('load');
        }
    };

    // ==================== 核心业务 ====================
    const init = async () => {
        const c = await cfg(), acc = (c.settings?.playlistdbAccounts || []).find((a: any) => a.active);
        state.source = acc?.source || 'local';
        if (state.source === 'database') { state.enabled = !!acc; state.dbId = acc?.dbId || acc?.id || ''; }
        else { state.enabled = false; state.dbId = ''; }
        await loadView(); await loadDisplayConfig();
        if (state.source === 'database' && state.enabled && state.dbId) await dataOp('init');
        await load(); await applyUI();
    };

    const load = () => dataOp('load');
    const add = async (url: string, playlist = '默认', checkDup = true, config?: any) => {
        const result = await Media.getMediaInfo(url, config || await cfg());
        if (!result.success || !result.mediaItem) throw new Error(result.error || '无法解析媒体链接');
        await dataOp('add', { media: result.mediaItem, playlist, checkDup });
        window.dispatchEvent(new CustomEvent('refreshPlaylist'));
    };
    const del = (title?: string, tagName?: string) => dataOp('del', { title, tagName });
    const move = (title: string, newPlaylist: string) => dataOp('move', { title, newPlaylist });
    const deleteTag = (tagName: string) => dataOp('deleteTag', { tagName });
    const renameTag = (oldName: string, newName: string) => dataOp('renameTag', { oldName, newName });

    // ==================== 文件浏览 ====================
    const browse = safe(async (type: string, path = '', basePath = '') => {
        state.items=[],state.folder={type,path:path||'',connected:!0,basePath:type==='siyuan'?'':basePath||path||''};const mgr:any={openlist:OpenListManager,webdav:WebDAVManager,alidrive:AliDriveManager,baidudrive:BaiduDriveManager,pan123:Pan123Manager,quarktv:QuarkTVManager,s3:S3Manager}[type];if(mgr){state.items=applySort(await mgr.createMediaItemsFromDirectory(path||'/'));return}if(!window.navigator.userAgent.includes('Electron')||typeof window.require!=='function')throw new Error('此功能仅在桌面版可用');
        try{const fs=window.require('fs').promises,pl=window.require('path'),fp=type==='siyuan'?pl.join(window.siyuan.config.system.workspaceDir,'data',path):path;const items=(await Promise.all((await fs.readdir(fp)).map(async(f:string)=>{try{const p=pl.join(fp,f),s=await fs.stat(p),r=type==='siyuan'?pl.relative(pl.join(window.siyuan.config.system.workspaceDir,'data'),p).replace(/\\/g,'/'):p;if(s.isDirectory())return{id:`${type}-folder-${id()}`,title:f,type:'folder',url:'#',source:type,sourcePath:r,is_dir:!0,thumbnail:'/plugins/siyuan-media-player/assets/images/folder.svg'};const isM=EXT.MEDIA.some(e=>f.toLowerCase().endsWith(e)),isP=f.toLowerCase().endsWith('.pdf');
        if(!isM&&!isP)return null;const isA=isM&&EXT.AUDIO.some(e=>f.toLowerCase().endsWith(e));return{id:`${type}-${id()}`,title:f,url:type==='siyuan'?r:`file://${p.replace(/\\/g,'/')}`,originalUrl:type==='siyuan'?r:void 0,type:isP?'pdf':isA?'audio':'video',source:type,sourcePath:p,thumbnail:isP?'/plugins/siyuan-media-player/assets/images/pdf.svg':isA?'/plugins/siyuan-media-player/assets/images/audio.png':'/plugins/siyuan-media-player/assets/images/video.png'}}catch{return null}}))).filter(Boolean);
        state.items=applySort(items as any[]);if(applyTC(state.items))state.items=[...state.items];idle(()=>{for(let i=0;i<Math.min(6,state.items.length);i++)gm(state.items[i])})}
        catch(e:any){showMessage(`扫描文件夹失败: ${e.message||e}`)}
    });
    // ==================== UI控制 ====================
    $: breadcrumbParts = state.folder.type === 'siyuan' ? (state.folder.path ? state.folder.path.split('/').filter(p => p) : []) : (state.folder.basePath ? state.folder.path.substring(state.folder.basePath.length).replace(/\\/g, '/').split('/').filter(p => p) : []);
    $: items = state.items;
    $: playing = (item: MediaItem) => currentItem?.id === item.id || currentItem?.id?.startsWith(`${item.id}-p`);
    const applySort = (arr: any[]) => { if (!state.sortMode || state.sortMode === 'n') return [...arr]; const asc = state.sortMode === 't' ? [...arr].sort((a,b)=>String(a?.type||'').localeCompare(String(b?.type||''))||String(a?.title||'').localeCompare(String(b?.title||''))) : state.sortMode === 's' ? [...arr].sort((a,b)=>String(a?.source||'').localeCompare(String(b?.source||''))||String(a?.title||'').localeCompare(String(b?.title||''))) : [...arr]; return state.sortDesc ? asc.reverse() : asc; };
    const nextSort = () => { const M=['n','t','s']; state.sortMode = M[(M.indexOf(state.sortMode)+1)%3] as any; saveView(); state.items = applySort(state.items); };
    const toggleSortOrder = () => { state.sortDesc = !state.sortDesc; saveView(); state.items = applySort(state.items); };

    $: selected = (item: MediaItem) => state.sel?.id === item.id;
    $: isGrid = state.view.includes('grid');
    $: isCompact = state.view === 'compact';

    // ==================== 极致优化：缓存+懒加载+虚拟滚动 ====================
    const idle=(cb:()=>void)=>setTimeout(cb as any,100);
    const tc:Map<string,any>=(window as any).__tc||(((window as any).__tc)=new Map()),pending=new Set<string>();
    const gk=(it:any)=>it?.sourcePath?.replace(/\\/g,'/')||it?.originalUrl||it?.url||'',LT=['folder','siyuan','local','本地','思源'];
    const upd=(id:string,d:any)=>{const i=state.items.findIndex(x=>x.id===id);if(i>=0){Object.assign(state.items[i],d);state.items=[...state.items];}};
    const gm=async(it:any)=>{if(!it||it.is_dir||!['video','audio'].includes(it.type)||!LT.includes(state.folder.type||it.source))return;const k=gk(it);if(!k||pending.has(k)||(it.type==='video'&&it.duration&&!/\/video\.png$/i.test(it.thumbnail))||(it.type==='audio'&&it.artist&&it.coverDataUrl))return;if(tc.has(k))return upd(it.id,tc.get(k));pending.add(k);const r=await Media.getMediaInfo(it.originalUrl||it.url,await cfg()).catch(()=>null);pending.delete(k);if(r?.success&&r.mediaItem){const m=r.mediaItem,c:any={thumbnail:m.thumbnail,duration:m.duration};if(it.type==='audio')Object.assign(c,{artist:m.artist,album:m.album,lyrics:m.lyrics,coverDataUrl:m.coverDataUrl,year:m.year,genre:m.genre});tc.set(k,c);upd(it.id,c);}};
    const applyTC=(list:any[])=>{let ok=false;list.forEach((it,i)=>{const c=tc.get(gk(it));if(c){list[i]={...it,...c};ok=true;}});return ok;};
    const lazy=(n:HTMLElement,it:any)=>{const o=new IntersectionObserver(([e],ob)=>{if(e.isIntersecting){gm(it);ob.unobserve(n);}},{root:n.closest('.panel-content'),rootMargin:'500px'});o.observe(n);return{destroy:()=>o.disconnect()};};
    const srcs = { 'bilibili': 'B站', 'local': '本地', 'standard': '普通', 'openlist': 'OpenList', 'webdav': 'WebDAV', 'alidrive': '阿里云盘', 'baidudrive': '百度网盘', 'pan123': '123云盘', 'quarktv': '夸克TV', 's3': 'S3存储', 'directory': '标签', 'siyuan': '思源' };
    const tags = (item: MediaItem) => `<svg class="media-badge-icon"><use xlink:href="#icon${item.type === 'audio' ? 'Record' : item.type === 'folder' ? 'Folder' : item.type === 'pdf' ? 'File' : 'Video'}" /></svg><span class="media-badge-text">${item.source === 'directory' ? '标签' : item.source === 'siyuan' ? '思源' : (srcs[item.source] || item.source)}</span>`;
    const map = (m: any, k: string) => m[k] || k;
    const tabs = { '目录': i18n?.playList?.tabs?.directory, '默认': i18n?.playList?.tabs?.default };
    const nextView = () => { state.view = VIEWS[(VIEWS.indexOf(state.view) + 1) % 4]; saveView(); };
    const copyAllLinks = async () => { if (!state.items.length) return showMessage('当前标签下没有媒体项目'); const getUrl = (item: MediaItem) => item.bvid ? `https://www.bilibili.com/video/${item.bvid}${item.originalUrl?.match(/[?&]p=(\d+)/)?.[1] && item.originalUrl.match(/[?&]p=(\d+)/)[1] !== '1' ? `?p=${item.originalUrl.match(/[?&]p=(\d+)/)[1]}` : ''}` : (item.originalUrl || item.url), links = state.items.filter(i => !i.is_dir).flatMap(i => { const parts = state.parts[i.id]; if (parts?.length > 1) { const isSeason = i.url?.includes('#s:'); return parts.map(p => `- [${isSeason ? p.part || `第${p.page}集` : `${i.title} - P${p.page}${p.part ? ': ' + p.part : ''}`}](${p.isCourse ? `https://www.bilibili.com/cheese/play/ep${p.epid}` : `https://www.bilibili.com/video/${isSeason ? p.cid : i.bvid}${isSeason ? '' : `?p=${p.page}`}`})`); } return `- [${i.title || '未命名'}](${getUrl(i)})`; }).join('\n'); await navigator.clipboard.writeText(links); showMessage(`已复制 ${links.split('\n').length} 个媒体链接`); };
    const setTab = async (tag: string) => { if (tag === state.tab) return; Object.assign(state, { tab: tag, searching: false, search: '', folder: { type: '', path: '', connected: false, basePath: '' } }); let desc = ''; if (state.enabled && state.dbId && tag !== '目录' && tag !== '搜索') { const a = await getAvId(state.dbId), km = Object.fromEntries((await db.getKeys(a)).map(k => [k.name, k])), o = mapField('playlist', km)?.options?.find(x => x.name === tag); const fullDesc = o?.desc || ''; const parts = fullDesc.split('|'); let seg = ''; if (parts.length >= 2 && parts[parts.length - 1].match(/^[dcgpNnTtSs]+$/)) { seg = parts[parts.length - 1]; desc = parts.slice(0, -1).join('|'); } else { desc = fullDesc; } const v = seg.match(/[dcg]/)?.[0]; state.view = v === 'c' ? 'compact' : v === 'g' ? 'grid' : 'detailed'; const sm = seg.match(/[NnTtSs]/)?.[0] || 'n'; state.sortDesc = sm === sm.toUpperCase(); state.sortMode = (sm.toLowerCase() as any) === 't' ? 't' : (sm.toLowerCase() === 's' ? 's' : 'n'); } (window as any).siyuanMediaPlayerActiveTagDesc = desc; if (desc.startsWith('sql:')) { const sql = desc.substring(4); try { const { data } = await api('/api/query/sql', { stmt: sql }); if (!data?.length) { state.items = []; return showMessage('查询结果为空'); } const items = await Promise.all(data.map(async row => { const attrs = row.id ? await (async () => { const { data: d } = await api('/api/query/sql', { stmt: `SELECT name, value FROM attributes WHERE block_id = '${row.id}'` }); return d?.reduce((a, { name, value }) => ({ ...a, [name.replace(/-/g, '_')]: value }), {}) || {}; })() : {}; const c = row.content || '', m = c.match(/https?:\/\/[^\s\)]+/), url = attrs.custom_url || attrs.custom_mediaurl || (m ? m[0] : ''), title = (c ? c.replace(/https?:\/\/[^\s\)]+/g, '').trim().slice(0, 100) : '') || '未知', t = attrs.custom_thumbnail || attrs.custom_screenshot, thumb = t ? (t.startsWith('/') ? t : `/${t}`) : ''; return { id: row.id || `sql-${id()}`, title, url, thumbnail: thumb, type: row.type === 'audio' ? 'audio' : 'video', source: 'sql', artist: attrs.custom_artist, duration: attrs.custom_duration, timestamp: attrs.custom_timestamp, loop: attrs.custom_loop, screenshot: attrs.custom_screenshot }; })); state.items = applySort(items); } catch (e: any) { showMessage(`SQL错误: ${e.message || '查询失败'}`); state.items = []; } } else if (desc.startsWith('siyuan:')) { await browse('siyuan', desc.substring(7)); } else if (desc.match(/^(openlist|webdav|alidrive|baidudrive|pan123|quarktv|s3):\/\/([^|]+)\|(.+)$/)) { const m = desc.match(/^(openlist|webdav|alidrive|baidudrive|pan123|quarktv|s3):\/\/([^|]+)\|(.+)$/); await connect(m[1], tag, m[3], desc); } else if (desc.startsWith('local:')) { await browse('folder', desc.substring(6), desc.substring(6)); } else { await load(); } saveView(); };

    // 导出方法供外部调用
    export { setTab, browse };
    const searchAll = async () => { if (!state.search.trim()) return state.items = []; const query = state.search.toLowerCase(), oldTab = state.tab, allItems = []; for (const tag of state.tags.filter(t => !['目录', '搜索'].includes(t))) state.tab = tag, await dataOp('load'), allItems.push(...state.items); state.tab = oldTab, state.items = allItems.filter(item => [item.title, item.artist, item.url].some(f => f?.toLowerCase().includes(query))); };
    const querySQL = async (sql: string, tagName = 'SQL查询') => { try { const { data } = await api('/api/query/sql', { stmt: sql }); if (!data?.length) return showMessage('查询结果为空'); const items = await Promise.all(data.map(async row => { const attrs = row.id ? await (async () => { const { data: d } = await api('/api/query/sql', { stmt: `SELECT name, value FROM attributes WHERE block_id = '${row.id}'` }); return d?.reduce((a, { name, value }) => ({ ...a, [name.replace(/-/g, '_')]: value }), {}) || {}; })() : {}; const c = row.content || '', m = c.match(/https?:\/\/[^\s\)]+/), url = attrs.custom_url || attrs.custom_mediaurl || (m ? m[0] : ''), title = (c ? c.replace(/https?:\/\/[^\s\)]+/g, '').trim().slice(0, 100) : '') || '未知', t = attrs.custom_thumbnail || attrs.custom_screenshot, thumb = t ? (t.startsWith('/') ? t : `/${t}`) : ''; return { id: row.id || `sql-${id()}`, title, url, thumbnail: thumb, type: row.type === 'audio' ? 'audio' : 'video', source: 'sql', artist: attrs.custom_artist, duration: attrs.custom_duration, timestamp: attrs.custom_timestamp, loop: attrs.custom_loop, screenshot: attrs.custom_screenshot }; })); await dataOp('ensure', { tagName, description: `sql:${sql}`, pinned: true }); if (!state.tags.includes(tagName)) state.tags = [...state.tags, tagName]; setTab(tagName); showMessage(`查询到 ${items.length} 项`); } catch (e: any) { showMessage(`SQL错误: ${e.message || '查询失败'}`); } };
    const connect = async (type: string, tag: string, path = '', description = '') => { const mgr: any = {webdav:WebDAVManager,openlist:OpenListManager,alidrive:AliDriveManager,baidudrive:BaiduDriveManager,pan123:Pan123Manager,quarktv:QuarkTVManager,s3:S3Manager}[type];
        if(mgr){const s=(await cfg())?.settings||{},A=s[`${type}Accounts`]||[],h=(description.split('://')[1]||'').split('|')[0].toLowerCase(),acc=A.find(a=>(type==='openlist'||type==='webdav'||type==='pan123'||type==='s3')?((a.name||a.server||'').toLowerCase()===h||(a.server||a.endpoint||'').toLowerCase().includes(h)):h?[a.name,a.uname,a.user_name,a.user_id,a.uk,a.device_id,a.bucket].some(x=>String(x||'').toLowerCase()===h):[a.name,a.uname,a.user_name,a.user_id,a.uk,a.device_id,a.bucket].some(x=>String(x||'').toLowerCase()===tag.toLowerCase()))||A[0];if(!acc||!(await mgr.checkConnection(acc)).connected)return showMessage(`请配置或检查${{openlist:'OpenList',webdav:'WebDAV',alidrive:'阿里云盘',baidudrive:'百度网盘',pan123:'123云盘',quarktv:'夸克TV',s3:'S3存储'}[type]}账户`);mgr.setConfig(acc);}
        return (Object.assign(state,{folder:{connected:true,type,path:''},tab:tag}),!state.tags.includes(tag)&&await(dataOp('ensure',{tagName:tag,description})),await browse(type,path));};

    // ==================== 媒体交互 ====================
    const click = safe(async (item: MediaItem) => {
        state.sel = item;
        if (item.source === 'directory') return setTab(item.title);
        if (item.is_dir) return play(item);
        if (item.type === 'pdf') return openPdf(item);
        const bvid = item.bvid || item.url?.match(/BV[a-zA-Z0-9]+/)?.[0], s = item.url?.match(/#s:(\d+):(c?\d+)/);
        if ((bvid || s) && !state.parts[item.id] && isBilibiliAvailable()) state.parts[item.id] = s ? ((await getSeason(s[1], s[2])).items || []).map((v, i) => ({ page: i + 1, cid: v.cid || v.bvid, bvid: v.bvid, part: v.title || `第${i + 1}集`, aid: v.aid, epid: v.epid, isCourse: v.isCourse })) : await BilibiliParser.getVideoParts({ bvid }) || [];
        if (state.parts[item.id]?.length > 1) { state.exp = new Set(state.exp.has(item.id) ? [...state.exp].filter(id => id !== item.id) : [...state.exp, item.id]); saveView(); }
    });

    const play = safe(async (item: MediaItem, startTime?: number, endTime?: number) => {
        if (item.source === 'directory' && item.targetTabId) { state.tab = item.targetTabId; return load(); }
        if (item.is_dir) return browse(item.source === 'openlist' ? 'openlist' : item.source === 'webdav' ? 'webdav' : item.source === 'alidrive' ? 'alidrive' : item.source === 'baidudrive' ? 'baidudrive' : item.source === 'pan123' ? 'pan123' : item.source === 'quarktv' ? 'quarktv' : item.source === 's3' ? 's3' : item.source === 'siyuan' ? 'siyuan' : 'folder', item.sourcePath || '', item.source === 'siyuan' ? '' : state.folder.basePath);
        if (item.type === 'pdf') return openPdf(item);
        currentItem = item;
        dispatch('play', { ...item, startTime, endTime });
    });

    // ==================== 拖拽操作 ====================
    const dragStart = (type, i) => (state.drag = type === 'item' ? { item: i, tag: '', target: '' } : { item: -1, tag: i, target: '' });
    const dragEnter = (e, type, i) => (e.preventDefault(), type === 'item' && state.drag.item !== i && state.drag.item > -1 && ([state.items[state.drag.item], state.items[i]] = [state.items[i], state.items[state.drag.item]], state.drag.item = i), type === 'tag' && state.drag.item > -1 && (state.drag.target = i), type === 'tag' && state.drag.tag && state.drag.tag !== i && state.tags.splice(state.tags.indexOf(i), 0, state.tags.splice(state.tags.indexOf(state.drag.tag), 1)[0]));
    const dragLeave = (e: Event) => (e.currentTarget as HTMLElement)?.classList.remove('dragover__left','dragover__right');
    const dragEnd = async () => {
        if (state.drag.item > -1 && state.drag.target) await move(state.items[state.drag.item].title, state.drag.target);
        else if (state.drag.item > -1) await dataOp('reorder', { type: 'items', draggedItem: state.items[state.drag.item] });
        else if (state.drag.tag) await dataOp('reorder', { type: 'tags' });
        state.drag = { item: -1, tag: '', target: '' };
    };

    // ==================== 菜单操作 ====================
    const openExternal = (item: MediaItem) => item.type === 'pdf' ? openPdf(item) : window.require?.('electron').shell[(item.source === 'local' || ((item.originalUrl || item.url) || '').startsWith('file://')) ? 'showItemInFolder' : 'openExternal'](((item.originalUrl || item.url) || '').replace('file://', ''));
    const openDoc = async (blockId: string) => { try { const { data } = await api('/api/block/getBlockInfo', { id: blockId }); if (data?.rootID) openTab({ app: plugin.app, doc: { id: data.rootID }, position: 'right' }); else showMessage('无法获取文档信息'); } catch (e) { showMessage('打开文档失败'); } };
    const togglePin = async t => { if (state.source === 'document' || state.source === 'local') { const c = await cfg(); const docId = await getBoundDocId(c); if (!docId) return; const { readTagsWithState } = await import('../core/playlist/docPlaylist'); const tagsWithState = await readTagsWithState(docId); const tagInfo = tagsWithState.find(ts => ts.name === t); if (!tagInfo) return; const isPinned = tagInfo.pinned || false; const itemInDir = state.items.find(i => i.title === t); const desc = itemInDir ? getFolderDesc(itemInDir) : (tagInfo.description || ''); await dataOp('ensure', { tagName: t, description: desc, pinned: !isPinned }); if (isPinned && state.tab === t) state.tab = '目录'; await dataOp('load'); showMessage(isPinned ? `已取消钉住 "${t}"` : `已钉住 "${t}"，点击标签实时加载`); } else if (state.enabled && state.dbId) { const a = await getAvId(state.dbId), k = mapField('playlist', Object.fromEntries((await db.getKeys(a)).map(k => [k.name, k]))), o = k?.options?.find(o => o.name === t); o && await (async (p = (o.desc || '').split('|'), s = p[p.length-1]?.match(/^[dcgpNnTtSs]+$/) ? p[p.length-1] : 'dnp', d = p[p.length-1]?.match(/^[dcgpNnTtSs]+$/) ? p.slice(0,-1).join('|') : (o.desc || '')) => db.transaction([{ action: "updateAttrViewColOption", id: k.id, avID: a, data: { newColor: o.color || "1", oldName: t, newName: t, newDesc: d + '|' + (s.match(/[dcg]/)?.[0] || 'd') + (s.match(/[NnTtSs]/)?.[0] || 'n') + (s.includes('p') ? '' : 'p') } }]) && await dataOp('load'))(); } };
    const getFolderDesc = (f: any) => { const [p,s,t] = [f.source, f.sourcePath||'/', f.title]; if (p === 'siyuan') return `siyuan:${s}`; if (p === 'local' || p === 'folder') return `local:${s}`; const m = {openlist:OpenListManager,webdav:WebDAVManager,alidrive:AliDriveManager,baidudrive:BaiduDriveManager,pan123:Pan123Manager,quarktv:QuarkTVManager,s3:S3Manager}[p]; if (!m) return ''; const c = m.getConfig?.() || {}; return `${p}://${c.name||c.uname||c.user_name||c.uk||c.device_id||c.bucket||t}|${s}`; };
    const importCloudFolder = async (f: any) => { const oldTab = state.tab, oldItems = [...state.items]; await dataOp('ensure',{tagName:f.title,description:'',pinned:true}); const m = {openlist:OpenListManager,webdav:WebDAVManager,alidrive:AliDriveManager,baidudrive:BaiduDriveManager,pan123:Pan123Manager,quarktv:QuarkTVManager,s3:S3Manager}[f.source]; let urls: string[] = []; if (m) { const items = (await m.createMediaItemsFromDirectory(f.sourcePath||'/').catch(()=>[])).filter((i:any)=>i&&!i.is_dir&&(i.url||i.originalUrl)); urls = items.map((i:any)=>i.originalUrl||i.url); } else { if (!window.require) return showMessage('此功能仅在桌面版可用'); const fs=window.require('fs').promises,pl=window.require('path'),t=(f.source==='local'||f.source==='folder')?'folder':f.source,fp=t==='siyuan'?pl.join(window.siyuan.config.system.workspaceDir,'data',f.sourcePath||''):f.sourcePath||''; try { const files = await fs.readdir(fp); for (const fn of files) { try { const p=pl.join(fp,fn),s=await fs.stat(p); if(s.isFile()&&(EXT.MEDIA.some(e=>fn.toLowerCase().endsWith(e))||fn.toLowerCase().endsWith('.pdf'))) { urls.push(t==='siyuan'?pl.relative(pl.join(window.siyuan.config.system.workspaceDir,'data'),p).replace(/\\/g,'/'):`file://${p.replace(/\\/g,'/')}`); } } catch{} } } catch(e:any) { showMessage(`扫描失败: ${e.message}`); return; } } if(!urls.length) return showMessage('未找到可导入的媒体文件'); let ok=0; for(let i=0;i<urls.length;i+=5) { const batch = await Promise.allSettled(urls.slice(i,i+5).map(u=>add(u,f.title,false))); ok += batch.filter(r=>r.status==='fulfilled').length; if(i+5<urls.length) showMessage(`已导入 ${ok}/${urls.length} 项`); } state.tab = oldTab; state.items = oldItems; await dataOp('load'); setTab(f.title); showMessage(`导入完成：${ok}/${urls.length} 项到 "${f.title}"`); };
    const pinCloudFolder = async (f: any) => { await dataOp('ensure',{tagName:f.title,description:getFolderDesc(f),pinned:true}); await dataOp('load'); showMessage(`已钉住 "${f.title}"，点击标签实时加载`); };
    const addToPlaylist = async (item: any, playlist: string) => { await add(item.originalUrl || item.url, playlist, false); showMessage(`已添加到"${playlist}"`); };
    const menus = {
		media: (i: any) => i.is_dir ? (i.source==='directory' ? [["iconPin",(i.pinned?"取消钉住":"钉住"),()=>togglePin(i.title)],...(i.title==='默认'||i.title==='目录'?[]:[["iconEdit","重命名",()=>{const v=window.prompt('重命名标签',i.title);if(v&&v.trim()&&v.trim()!==i.title) renameTag(i.title,v.trim());}], ["iconTrashcan","删除",()=>delTag(i.title)]]),["iconRefresh","刷新",()=>refreshTag(i.title)],["iconClear","清空",()=>del(undefined,i.title)]] : [["iconPin","钉住(实时加载)",()=>pinCloudFolder(i)],["iconDownload","导入(固定内容)",()=>importCloudFolder(i)]]) : [["iconPlay","播放",()=>play(i)],["iconLink","外部打开",()=>openExternal(i)],...(i.source==='sql'&&i.id&&!/^sql-/.test(i.id)?[["iconFile","打开所在文档",()=>openDoc(i.id)]]:[]),...(state.tags.filter(t=>t!==state.tab&&t!=='目录').length?[["iconAdd","添加到",state.tags.filter(t=>t!==state.tab&&t!=='目录').map(t=>[t,()=>addToPlaylist(i,t)])]]:[]),...(i.source==='openlist'||i.source==='webdav'||i.source==='alidrive'?[]:[["iconTrashcan","删除",()=>del(i.title)]])],
        tab: async (tag: any) => { const o = state.enabled && state.dbId ? await (async () => { const a = await getAvId(state.dbId), km = Object.fromEntries((await db.getKeys(a)).map(k => [k.name, k])); return mapField('playlist', km)?.options?.find(x => x.name === tag); })() : null; const desc = o?.desc?.split('|').find(p => !p.match(/^[dcgpNnTtSs]+$/)) || ''; const isSqlTag = desc.startsWith('sql:'); return [...(tag==='目录'?[]:[["iconUnpin",'取消钉住',()=>togglePin(tag)]]),...(tag==='默认'||tag==='目录'?[]:[["iconEdit","重命名",()=>{state.edit=tag;setTimeout(()=>state.refs.edit?.focus(),0);}],["iconRefresh","刷新",()=>refreshTag(tag)],["iconTrashcan","删除",()=>delTag(tag)]]),["iconClear","清空",()=>del(undefined,tag)],...(isSqlTag?[["iconSQL","重新执行SQL",()=>{state.add='sql';setTimeout(()=>{if(state.refs.new){state.refs.new.value=desc.substring(4);state.refs.new.focus();}},0);}]]:[])]; },
        add: async (_, e: MouseEvent) => {
            const license = await LicenseManager.load(plugin).catch(() => null), isPro = license?.isValid;
            const config = await cfg();
            const getAccounts = (type) => {
                const accounts = config.settings?.[`${type}Accounts`] || [];
                return accounts.length ? accounts.map(acc => [
                type === 'bilibili' ? (acc.uname || acc.mid) : (type === 'quarktv' ? (acc.uname || acc.name || acc.device_id || 'QuarkTV') : (type === 'pan123' ? (acc.user_name || acc.name || '123云盘') : (acc.name || (() => { try { return new URL(acc.server).hostname.replace('www.',''); } catch { return 'Cloud'; } })()))),
                async () => {
                    const mgr={webdav:WebDAVManager,openlist:OpenListManager,pan123:Pan123Manager,quarktv:QuarkTVManager,s3:S3Manager}[type]; if(mgr&&(await mgr.checkConnection(acc)).connected) { mgr.setConfig(acc); const host=(()=>{ try{ return type==='pan123' ? (acc.name||'pan123') : (type==='quarktv' ? (acc.name||acc.uname||acc.device_id||'QuarkTV') : (type==='s3' ? (acc.name||acc.bucket||'S3') : new URL(acc.server||acc.endpoint).hostname.replace('www.',''))); } catch { return type==='quarktv' ? (acc.name||acc.uname||acc.device_id||'QuarkTV') : (type==='s3' ? (acc.name||acc.bucket||'S3') : (acc.server||acc.endpoint||'Cloud')); } })(); const label=acc.name||host; await connect(type,label,'/',`${type}://${host}|/`); } else showMessage(`${acc.server || acc.endpoint || acc.client_id || acc.device_id || acc.bucket} 连接失败`);
                }
                ]) : [['未配置账号', () => showMessage(`请先配置${type}账号`)]];
            };
            const getBiliAccounts = async () => {
                if (!isBilibiliAvailable()) return [];
                const accounts = config.settings?.bilibiliAccounts || [];
                if (!accounts.length) return [['未配置账号', () => showMessage('请先配置B站账号')]];
                const cfg = (acc) => ({ ...config, settings: { ...config.settings, bilibiliLogin: acc } });
                return (await Promise.all(accounts.map(async acc => {
                    const folders = await BilibiliParser.getUserFavoriteFolders(cfg(acc)).catch(() => []);
                    return folders?.length ? [acc.uname || acc.mid, folders.map(f => [`${f.title} (${f.media_count})`, async () => {
                        const { items } = await BilibiliParser.getFavoritesList(f.id.toString(), cfg(acc));
                        await dataOp('ensure', { tagName: f.title, description: f.id.toString() });
                        const count = await batchAdd(items || [], f.title, undefined, cfg(acc));
                        showMessage(count ? `已添加收藏夹"${f.title}"：${count}/${items?.length}个视频` : `收藏夹"${f.title}"为空`);
                    }])] : null;
                }))).filter(Boolean);
            };

                            return [
                                ["iconAdd", "添加新标签页", () => { state.add = 'tag'; setTimeout(() => state.refs.new?.focus(), 50); }],
                                ["iconSQL", "SQL查询", () => { state.add = 'sql'; setTimeout(() => state.refs.new?.focus(), 0); }],
                                ["iconFolder", "添加本地文件夹", () => addFolder()],
                                ["iconImage", "添加思源空间", () => connect('siyuan', '思源空间', '', 'siyuan:')],
                                ["iconCloud", "浏览OpenList云盘", isPro ? getAccounts('openlist') : () => showMessage("此功能需要Pro版本")],
                                ["iconCloud", "浏览WebDAV云盘", isPro ? getAccounts('webdav') : () => showMessage("此功能需要Pro版本")],
                                ["iconCloud", "浏览123云盘(开发者授权)", isPro ? getAccounts('pan123') : () => showMessage("此功能需要Pro版本")],
                                ["iconCloud", "浏览阿里云盘", isPro ? (() => { const a=config.settings?.alidriveAccounts||[]; return a.length ? a.map(acc=>[acc.name||acc.uname||acc.user_name||'AliDrive',async()=>{AliDriveManager.setConfig(acc); const label=acc.name||acc.uname||acc.user_name||acc.user_id||'AliDrive'; await connect('alidrive',label,'/',`alidrive://${label}|/`);}]) : [['未配置账号',()=>showMessage('请先配置阿里云盘账号')]]; })() : () => showMessage("此功能需要Pro版本")],
                                ["iconCloud", "浏览百度网盘", isPro ? (() => { const a=config.settings?.baidudriveAccounts||[]; return a.length ? a.map(acc=>[acc.name||acc.uname||acc.user_name||'BaiduNetdisk',async()=>{BaiduDriveManager.setConfig(acc); const label=acc.name||acc.uname||acc.user_name||acc.uk||'BaiduNetdisk'; await connect('baidudrive',label,'/',`baidudrive://${label}|/`);}]) : [['未配置账号',()=>showMessage('请先配置百度网盘账号')]]; })() : () => showMessage("此功能需要Pro版本")],
                                ["iconCloud", "浏览夸克TV", isPro ? getAccounts('quarktv') : () => showMessage("此功能需要Pro版本")],
                                ["iconCloud", "浏览S3存储", isPro ? (() => { const a=config.settings?.s3Accounts||[]; return a.length ? a.map(acc=>[acc.name||acc.bucket||'S3',async()=>{S3Manager.setConfig(acc); const label=acc.name||acc.bucket||'S3'; await connect('s3',label,'/',`s3://${label}|/`);}]) : [['未配置账号',()=>showMessage('请先配置S3存储账号')]]; })() : () => showMessage("此功能需要Pro版本")],
                ...(isBilibiliAvailable() ? [
                    ["iconHeart", "添加B站收藏夹", isPro ? await getBiliAccounts() : () => showMessage("此功能需要Pro版本")]
                ] : [])
            ];
        }
    };
    const menu = async (e: MouseEvent, type: keyof typeof menus, target?: any) => {
        const m = new Menu(`${type}Menu`);
        const menuFunc = menus[type];
        const items = typeof menuFunc === 'function' ? await menuFunc(target, e) : menuFunc;
        for (const [icon, label, action] of items) {
            if (Array.isArray(action)) {
                m.addItem({ icon, label, submenu: action.map(([l, a]) => Array.isArray(a) ? { label: l, submenu: a.map(([l2, a2]) => ({ label: l2, click: a2 })) } : { label: l, click: a }) });
            } else {
                m.addItem({ icon, label, click: action });
            }
        }
        m.open({ x: e.clientX, y: e.clientY });
    };

    const batchAdd = async (items: any[], tagName: string, urlFn = (item: any) => item.url || `https://www.bilibili.com/video/${item.bvid}`, config?: any) => {
        const cfg_ = config || await cfg(), [source, dbId] = [state.source, state.dbId];
        const mediaList = items.map(item => ({ url: urlFn(item), title: item.title }));
        const result = await dataOp('batchAdd', { mediaList, playlist: tagName, config: cfg_, onProgress: (c, t, s) => { if (c % 20 === 0 || c === t) showMessage(`已添加 ${s}/${t} 项`); } });
        if (result) return result.success;
        const deps = { cfg: async () => cfg_, plugin, getTab: () => tagName, getTags: () => state.tags, setTags: (t: string[]) => state.tags = t, getItems: () => state.items, setItems: (i: any[]) => state.items = i, applySort, applyTC, toast: showMessage, getState: () => state, connect };
        const addOne = async (media: any) => source === 'document' ? routeDocOp(deps, 'add', { media, playlist: tagName, checkDup: false }) : source === 'local' ? routeLocalOp(deps, 'add', { media, playlist: tagName, checkDup: false }) : source === 'database' && dbId ? routeDbOp(deps, dbId, 'add', { media, playlist: tagName, checkDup: false }) : null;
        let [count, failed] = [0, 0], BATCH = 10;
        for (let i = 0; i < items.length; i += BATCH) {
            const batch = items.slice(i, i + BATCH);
            const results = await Promise.allSettled(batch.map(async item => { const r = await Media.getMediaInfo(urlFn(item), cfg_); if (r.success && r.mediaItem && await addOne(r.mediaItem) !== null) return true; throw new Error(); }));
            results.forEach(r => r.status === 'fulfilled' ? count++ : failed++);
            if (i % 20 === 0 || i + BATCH >= items.length) showMessage(`已添加 ${count}/${items.length} 项${failed ? ` (失败${failed})` : ''}`);
        }
        await load();
        return count;
    };

    const addFolder = async () => { if (!window.navigator.userAgent.includes('Electron') || typeof window.require !== 'function') return showMessage('此功能仅在桌面版可用'); const { filePaths } = await window.require('@electron/remote').dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] }); if (filePaths?.[0]) { const [p, n] = [filePaths[0], filePaths[0].split(/[\\/]/).pop()]; await dataOp('ensure', { tagName: n, description: `local:${p}`, pinned: true }); setTab(n); } };

    const getSeason = async (aid, sid) => {
        const s = (await cfg()).settings;
        const acc = s?.bilibiliAccounts?.find(a => a.mid.toString() === aid) || s?.bilibiliAccounts?.[0] || s?.bilibiliLogin;
        return acc ? await BilibiliParser.getSeasonArchives(aid, sid, { settings: { bilibiliLogin: acc } }) : { items: [] };
    };

    const addSeasonSmart = async (url: string, info: any) => {
        const result = await Media.getMediaInfo(url, await cfg());
        const typeLabel = info.isCourse ? '课程' : '合集';
        const typeName = info.isCourse ? '未命名课程' : '未命名合集';
        result.success && result.mediaItem && (Object.assign(result.mediaItem, {url: `${url.split('?')[0].split('#')[0]}#s:${info.artistId}:${info.seasonId}`, title: `${info.seasonTitle || typeName}（${typeLabel}）`}), await dataOp('add', { media: result.mediaItem, playlist: state.tab }));
        state.input = '';
        showMessage(`已添加${typeLabel}视频，点击展开查看完整列表`);
    };

    // ==================== 其他功能 ====================
    const refreshTag = async (tagName: string) => {
        // 文档/本地模式
        if (state.source === 'document' || state.source === 'local') {
            const docId = await getBoundDocId(await cfg());
            if (!docId) return showMessage('未绑定文档');
            const result = await refreshDocTag(docId, tagName, { browse, getItems: () => state.items, cfg });
            if (result.error) return showMessage(result.error);
            
            const curUrls = new Set(result.currentItems.map(i => i.originalUrl || i.url));
            const newUrls = new Set(result.newUrls);
            const toDel = result.currentItems.filter(i => !newUrls.has(i.originalUrl || i.url));
            const toAdd = result.newUrls.filter(u => !curUrls.has(u));
            
            for (const item of toDel) await dataOp('del', { title: item.title });
            let added = 0;
            for (const url of toAdd) try { await add(url, tagName, false); added++; } catch {}
            return showMessage(`已刷新"${tagName}"：删除${toDel.length}项，新增${added}项`);
        }
        
        // 数据库模式（保持原逻辑）
        if (state.source !== 'database' || !state.enabled || !state.dbId) return showMessage('刷新功能仅支持数据库/文档/本地模式', 0);
        const avId = await getAvId(state.dbId), keys = await db.getKeys(avId), keyMap = Object.fromEntries(keys.map(k => [k.name, k]));
        const option = mapField('playlist', keyMap)?.options?.find(opt => opt.name === tagName);
        if (!option?.desc) return showMessage('该标签无刷新信息');
        const [currentData, playlistKey, urlKey] = [await db.render(avId), mapField('playlist', keyMap), mapField('url', keyMap)];
        const currentItems = currentData.view?.rows?.filter(row => row.cells?.find(c => c.value?.keyID === playlistKey?.id)?.value?.mSelect?.some?.(tag => tag.content === tagName)).map(row => ({ id: row.id, url: row.cells?.find(c => c.value?.keyID === urlKey?.id)?.value?.url?.content || '' })) || [];
        const fullDesc = option.desc || ''; const parts = fullDesc.split('|'); const desc = parts.length >= 2 && parts[parts.length - 1].match(/^[dcgpNnTtSs]+$/) ? parts.slice(0, -1).join('|') : fullDesc;
        if (!desc) return showMessage('该标签无刷新信息');
        let newItems = [], targetConfig = null, siyuanItemMap = null as any;
        if (desc.match(/^\d+$/)) { if (!isBilibiliAvailable()) return; for (const acc of (await cfg()).settings?.bilibiliAccounts || []) try { const cfg = { settings: { bilibiliLogin: acc } }; if ((await BilibiliParser.getUserFavoriteFolders(cfg)).some(f => f.id.toString() === desc)) { targetConfig = cfg; newItems = ((await BilibiliParser.getFavoritesList(desc, cfg)).items || []).map(item => `https://www.bilibili.com/video/${item.bvid}`); break; } } catch {}; if (!targetConfig) return showMessage('未找到拥有该收藏夹的B站账号'); }
        else if (desc.startsWith('siyuan:')) { await browse('siyuan', desc.substring(7)); const files = state.items.filter(item => !item.is_dir); siyuanItemMap = Object.fromEntries(files.map(item => [item.originalUrl || item.url, item])); newItems = files.map(item => item.originalUrl || item.url); }
        else if (desc.match(/^(openlist|webdav|alidrive|baidudrive|pan123|quarktv|s3):\/\/([^|]+)\|(.+)$/)) { const m = desc.match(/^(openlist|webdav|alidrive|baidudrive|pan123|quarktv|s3):\/\/([^|]+)\|(.+)$/); const [t, label, p] = [m[1], m[2], m[3]]; const s = (await cfg())?.settings || {}; const A = s[`${t}Accounts`] || []; const acc = A.find(a => (t === 'openlist' || t === 'webdav' || t === 's3') ? ((a.name || a.server || a.endpoint || a.bucket || '').toLowerCase() === label.toLowerCase()) : [a.name, a.uname, a.user_name, a.user_id, a.uk, a.device_id, a.bucket].some(x => String(x || '').toLowerCase() === label.toLowerCase())) || A[0]; if (!acc) return showMessage(`未找到对应账号`); const mgr: any = { openlist: OpenListManager, webdav: WebDAVManager, alidrive: AliDriveManager, baidudrive: BaiduDriveManager, pan123: Pan123Manager, quarktv: QuarkTVManager, s3: S3Manager }[t]; if (mgr) { mgr.setConfig(acc); newItems = (await mgr.createMediaItemsFromDirectory(p)).filter((i: any) => !i.is_dir).map((i: any) => i.originalUrl || i.url); } }
        else if (desc.startsWith('local:')) { if (!window.navigator.userAgent.includes('Electron')) return showMessage('此功能仅在桌面版可用'); await browse('folder', desc.substring(6)); newItems = state.items.filter(item => !item.is_dir).map(item => item.url); }
        else if (desc.startsWith('s:')) { if (!isBilibiliAvailable()) return; const [, mid, seasonId] = desc.split(':'), { items } = await getSeason(mid, seasonId); if (seasonId.startsWith('c')) { const baseInfo = await Media.getMediaInfo(`https://www.bilibili.com/cheese/play/ss${seasonId.substring(1)}`, await cfg()); for (const item of items || []) if (baseInfo.success && baseInfo.mediaItem) await dataOp('add', { media: { ...baseInfo.mediaItem, title: item.title, aid: item.aid, cid: item.cid, epid: item.epid, bvid: item.bvid, isCourse: true }, playlist: tagName, checkDup: false }); return showMessage(`已刷新课程"${tagName}"`); } newItems = (items || []).map(item => `https://www.bilibili.com/video/${item.bvid}`); }
        else return showMessage(i18n.playList?.error?.refreshTypeFailed || '无法识别的刷新类型');
        const [currentUrls, newUrls] = [new Set(currentItems.map(item => item.url)), new Set(newItems)];
        const [toDelete, toAdd] = [currentItems.filter(item => !newUrls.has(item.url)), newItems.filter(url => !currentUrls.has(url))];
        if (toDelete.length) await db.removeRows(avId, toDelete.map(item => item.id));
        let addCount = 0;
        for (const url of toAdd) try { if (siyuanItemMap && siyuanItemMap[url]) await dataOp('add', { media: siyuanItemMap[url], playlist: tagName, checkDup: false }); else await add(url, tagName, false, targetConfig); addCount++; } catch {}
        showMessage(i18n.playList?.message?.refreshTag?.replace('${name}', tagName).replace('${deleteCount}', toDelete.length).replace('${addCount}', addCount) || `已刷新"${tagName}"：删除${toDelete.length}项，新增${addCount}项`);
    };

    const delTag = async (tagName: string) => tagName === '默认' ? showMessage('不能删除系统标签') : (await deleteTag(tagName), state.tab === tagName && (state.tab = '默认'));

    const input = async (e: Event, type: 'tag' | 'add' | 'search', old?: string) => { if (e instanceof KeyboardEvent && e.key !== 'Enter') return; const value = ((e.target as HTMLInputElement).value || '').trim(); if (type === 'search') { value ? searchAll() : state.items = []; return; } if (!value) return (type === 'tag' ? state.edit = '' : state.add = ''); if (type === 'tag') { await renameTag(old!, value); state.edit = ''; } else if (state.add === 'sql') { state.add = ''; await querySQL(value); } else if (state.add === 'tag') { state.add = ''; await dataOp('ensure', { tagName: value }); } };

    const nav=async(d:-1|1,f=false)=>{ if(!state.items.length||!currentItem) return false; const c=await cfg(),cur=currentItem,bv=cur.bvid||cur.url?.match(/BV[a-zA-Z0-9]+/)?.[0];
        if((bv||cur.isCourse)&&isBilibiliAvailable()){ const base=(cur.id||'').split('-p')[0],P=state.parts||{},sp=P[base]||Object.values(P).find((a:any)=>a?.some((x:any)=>String(x.bvid)===String(cur.bvid)||String(x.cid)===String(cur.cid)||String(x.epid)===String(cur.epid))),p=parseInt(cur.id?.match(/-p(\d+)/)?.[1]||(sp?sp.findIndex((x:any)=>String(x.bvid)===String(cur.bvid)||String(x.cid)===String(cur.cid)||String(x.epid)===String(cur.epid))+1:'1'),10),pick=(arr:any[])=>d>0?(arr.find((x:any)=>x.page===p+1)||c.settings.loop&&arr[0]):(arr.find((x:any)=>x.page===p-1)||c.settings.loop&&arr[arr.length-1]); if(sp?.length>1){ const t=pick(sp);
        if(t){const B=String(t.cid||'').startsWith('BV'),isCrs=t.isCourse;Object.assign(cur,{id:`${base}-p${t.page}`,title:t.part||`第${t.page}集`,url:isCrs?`https://www.bilibili.com/cheese/play/ep${t.epid}`:B?`https://www.bilibili.com/video/${t.cid}`:`https://www.bilibili.com/video/${bv}?p=${t.page}`,bvid:t.bvid||(B?String(t.cid):bv),cid:String(t.cid),aid:t.aid,epid:t.epid,isCourse:isCrs});await play(cur);return true;} } if(!cur.isCourse){ const pa=await BilibiliParser.getVideoParts({bvid:bv}),t=pick(pa); if(t) return (Object.assign(cur,{id:`${base}-p${t.page}`,title:`${cur.title.split(' - P')[0]}${t.page>1?` - P${t.page}${t.part?': '+t.part:''}`:''}`,bvid:bv,cid:String(t.cid)}),await play(cur),true); } } const i=state.items.findIndex(x=>x.id===cur.id||x.url===cur.url); if(i<0||(!f&&!c?.settings?.loopPlaylist)) return false; await play(state.items[(i+d+state.items.length)%state.items.length]); return true; };
    export const playPrev = safe((force = false) => nav(-1, force));
    export const playNext = safe((force = false) => nav(1, force));

    // ==================== 生命周期 ====================
    onMount(() => { applyUI(); const h = (e: any) => setUI(e?.detail?.settings || {}); window.addEventListener('configUpdated', h); return () => window.removeEventListener('configUpdated', h); });

    const handleAdd = async () => {
        const input = state.input.trim();
        if (input) {
            const urls = input.split(/[\s\n,]+/).filter(u => u).map(u => u.match(/^BV[a-zA-Z0-9]+$/) ? `https://www.bilibili.com/video/${u}` : u);
            if (urls.length > 1) return (showMessage(`开始批量添加 ${urls.length} 项...`), await batchAdd(urls.map(url => ({ url })), state.tab), state.input = '');
            const url = urls[0];
            if (url.includes('bilibili.com') && isBilibiliAvailable()) {
                const config = await cfg();
                if (!config?.settings?.bilibiliLogin?.mid && !config?.settings?.bilibiliAccounts?.length) return showMessage('请先登录B站账号');
                const info = await BilibiliParser.getVideoInfo(url, config);
                if ((info as any)?.seasonId) return await addSeasonSmart(url, info);
            }
            try { await add(url, state.tab); state.input = ''; } catch {}
        } else {
            const isDesktop = window.navigator.userAgent.includes('Electron') && typeof window.require === 'function';
            const addFiles = async items => items.length > 1 ? await batchAdd(items, state.tab) : items.length && await add(items[0].url, state.tab);
            isDesktop ? (async () => { const { filePaths } = await window.require('@electron/remote').dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: "媒体文件", extensions: EXT.MEDIA.map(ext => ext.slice(1)) }] }); await addFiles(filePaths?.map(p => ({ url: `file://${p.replace(/\\/g, '/')}` })) || []); })() : Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: EXT.MEDIA.join(','), onchange: async e => await addFiles(Array.from((e.target as HTMLInputElement).files || []).map(f => ({ url: URL.createObjectURL(f), title: f.name }))) }).click();
        }
    };

    // ==================== 生命周期 ====================
    onMount(() => { safe(init)(); const handleDataUpdate = () => load(); const handleConfigUpdate = (ev: CustomEvent) => { if (ev.detail?.settings?.playlistdbAccounts) { state.items = []; state.tags = ['目录', '默认']; state.tab = '目录'; state.folder = { type: '', path: '', connected: false, basePath: '' }; safe(init)(); } if (ev.detail?.settings?.playlistDisplayElements) loadDisplayConfig(); }; const handleBaiduConfigUpdate = async (ev: CustomEvent) => { const c = await cfg(); const idx = (c.settings?.baidudriveAccounts || []).findIndex(a => a.uk === ev.detail?.uk); if (idx >= 0) { c.settings.baidudriveAccounts[idx] = { ...c.settings.baidudriveAccounts[idx], ...ev.detail }; await plugin.saveData('config.json', c, 2); } }; window.addEventListener('playlist-data-updated', handleDataUpdate); window.addEventListener('configUpdated', handleConfigUpdate); window.addEventListener('baidudriveConfigUpdate', handleBaiduConfigUpdate); return () => { window.removeEventListener('playlist-data-updated', handleDataUpdate); window.removeEventListener('configUpdated', handleConfigUpdate); window.removeEventListener('baidudriveConfigUpdate', handleBaiduConfigUpdate); }; });

    export { play };
</script>

<div bind:this={root} class="panel {className}" class:hidden>
    <!-- 统一导航 -->
    <Tabs {activeTabId} {i18n}>
        <svelte:fragment slot="controls">
            <span class="panel-count">{state.items.length} 项</span>
            <button class="view-mode-btn b3-button b3-button--text" on:click={nextView} title={i18n?.playList?.viewMode?.[(state.view==='detailed'?'compact':state.view==='compact'?'grid':state.view==='grid'?'detailed':'grid')] || '视图'}><svg class="svg" viewBox="0 0 24 24" width="16" height="16"><path d={ICONS[VIEWS.indexOf(state.view) % 3]}/></svg></button>
            <button class="view-mode-btn b3-button b3-button--text" on:click={nextSort} title={(state.sortMode==='n' ? (i18n?.playList?.sortMode?.name || '名称') : state.sortMode==='t' ? (i18n?.playList?.sortMode?.type || '类型') : (i18n?.playList?.sortMode?.source || '来源'))}><svg class="svg"><use xlink:href="#iconSort"/></svg></button>
            <button class="view-mode-btn b3-button b3-button--text" on:click={toggleSortOrder} title={state.sortDesc ? (i18n?.playList?.sortMode?.desc || '倒序') : (i18n?.playList?.sortMode?.asc || '正序')}><svg class="svg"><use xlink:href="#iconScrollVert" /></svg></button>
            <button class="view-mode-btn b3-button b3-button--text" on:click={copyAllLinks} title="复制全部链接"><svg class="svg"><use xlink:href="#iconCopy" /></svg></button>
        </svelte:fragment>
    </Tabs>

    <!-- 标签 -->
    <div class="layout-tab-bar fn__flex">
        <!-- 搜索标签 -->
        {#if state.searching}
            <input bind:this={state.refs.search} type="text" class="tab-input b3-text-field" placeholder="搜索所有媒体..." bind:value={state.search} on:keydown={e => input(e, 'search')} on:blur={() => !state.search && (state.searching = false)}>
        {:else}
            <div class="item" on:click={() => (state.searching = true, state.tab = '搜索', setTimeout(() => state.refs.search?.focus(), 0))}><span class="item__text"><svg class="svg"><use xlink:href="#iconSearch" /></svg></span></div>
        {/if}

        {#each state.tags as tag (tag)}
            {#if state.edit === tag}
                <input bind:this={state.refs.edit} type="text" class="tab-input b3-text-field" value={tag} on:blur={e => input(e, 'tag', tag)} on:keydown={e => input(e, 'tag', tag)}>
            {:else}
                <div class="item"
                    class:item--focus={state.tab === tag && !state.searching}
                    draggable={tag !== '目录' && tag !== '默认'}
                    on:click={() => setTab(tag)}
                    on:contextmenu|preventDefault={async e => await menu(e, 'tab', tag)}
                    on:dragstart={() => dragStart('tag', tag)}
                    on:dragover|preventDefault
                    on:dragenter={e => dragEnter(e, 'tag', tag)}
                    on:dragleave={dragLeave}
                    on:dragend={dragEnd}
                ><span class="item__text">{map(tabs, tag)}</span></div>
            {/if}
        {/each}
        {#if state.add}
            {#if state.add === 'sql'}
                <textarea bind:this={state.refs.new} class="tab-input b3-text-field sql-textarea" placeholder="SELECT * FROM blocks WHERE content LIKE '%bilibili.com%' LIMIT 50" on:blur={e => input(e, 'add')} on:keydown={e => e.key === 'Enter' && e.ctrlKey && input(e, 'add')} rows="1" style="resize:vertical;min-height:32px;line-height:1.5;"></textarea>
            {:else}
                <input bind:this={state.refs.new} type="text" class="tab-input b3-text-field" placeholder={i18n.playList?.placeholder?.newTab || '新标签名'} on:blur={e => input(e, 'add')} on:keydown={e => input(e, 'add')}>
            {/if}
        {:else}
            <div class="item" on:click|preventDefault|stopPropagation={async e => await menu(e, 'add')}><span class="item__text"><svg class="svg"><use xlink:href="#iconAdd" /></svg></span></div>
        {/if}
    </div>

    <!-- 路径 -->
    {#if state.folder.type}
        <div class="openlist-path-nav">
            <button class="path-item b3-button b3-button--text" on:click={() => browse(state.folder.type, state.folder.type === 'siyuan' ? '' : state.folder.basePath, state.folder.basePath)}>根目录</button>
            {#each breadcrumbParts as part, i}
                <span class="path-sep">/</span>
                <button class="path-item b3-button b3-button--text" on:click={() => browse(state.folder.type, state.folder.type === 'siyuan' ? breadcrumbParts.slice(0, i + 1).join('/') : state.folder.basePath + (state.folder.basePath.endsWith('/') ? '' : '/') + breadcrumbParts.slice(0, i + 1).join('/'), state.folder.basePath)}>{part.split('|')[0]}</button>
            {/each}
        </div>
    {/if}

    <!-- 内容 -->
    <div class="panel-content" class:grid-view={isGrid}>
        {#if items.length}
                <div class="panel-items b3-list" class:compact-list={isCompact} class:grid-single={state.view==='grid-single'} class:av__gallery={isGrid} class:media-card-grid={isGrid}>{#each items as item,index(item.id)}<div class="panel-item b3-list-item media-card {playing(item)?'playing':''} {selected(item)?'selected':''} {isCompact?'compact':''} {isGrid?'grid':''} {item.is_dir?'folder':''} media-{item.type||'video'}" use:lazy={item} title={item.title} style="--thumb:url({Media.getThumbnail(item)})" draggable={!item.is_dir} on:click={()=>click(item)} on:dblclick={()=>play(item)} on:contextmenu|preventDefault={e=>menu(e,'media',item)} on:dragstart={()=>dragStart('item',index)} on:dragover|preventDefault on:dragenter={e=>dragEnter(e,'item',index)} on:dragleave={dragLeave} on:dragend={dragEnd}>{#if isCompact}<div class="item-content">{#if show('title')}<div class="item-title b3-list-item__text">{item.title}</div>{/if}{#if show('tags')}<div class="item-tags b3-list-item__meta">{@html tags(item)}</div>{/if}</div>{:else if isGrid}<div class="item-thumbnail media-card-thumbnail"><img src={Media.getThumbnail(item)} alt={item.title} loading="lazy"><div class="media-card-play-icon"></div><span class="badge" style="left:6px;right:auto">{srcs[item.source]||item.source} <svg class="media-badge-icon"><use xlink:href="#icon{item.type === 'audio' ? 'Record' : item.type === 'pdf' ? 'File' : 'Video'}" /></svg></span>{#if show('duration')&&item.duration}<span class="badge">{item.duration}</span>{/if}<div class="media-card-info">{#if show('title')}<div class="media-card-title">{item.title}</div>{/if}</div></div>{:else}<div class="item-content">{#if show('thumbnail')}<div class="item-thumbnail"><img src={Media.getThumbnail(item)} alt={item.title} loading="lazy"><span class="badge">{srcs[item.source]||item.source} <svg class="media-badge-icon"><use xlink:href="#icon{item.type === 'audio' ? 'Record' : item.type === 'pdf' ? 'File' : 'Video'}" /></svg></span>{#if show('duration')&&item.duration}<div class="duration">{item.duration}</div>{/if}</div>{/if}<div class="item-info">{#if show('title')}<div class="item-title">{item.title}</div>{/if}<div class="item-meta">{#if show('artist')&&item.artist}<div class="item-artist">{#if show('artistIcon')&&item.artistIcon}<img class="artist-icon" src={item.artistIcon} alt={item.artist} loading="lazy">{/if}<span>{item.artist}</span></div>{/if}</div>{#if show('url')&&item.url}<div class="item-url">{item.url}</div>{/if}</div><div class="b3-list-item__action"><button class="b3-button b3-button--text" on:click|stopPropagation={e=>menu(e,'media',item)} title="更多"><svg class="svg"><use xlink:href="#iconMore"/></svg></button></div></div>{/if}{#if state.exp?.has(item.id)&&state.parts?.[item.id]?.length>1}<div class="item-parts {state.partsList?'parts-list':''} {isGrid&&state.view==='grid'?'grid-parts':''} {state.view==='grid-single'?'single-parts':''}"><button class="parts-toggle b3-button b3-button--text" on:click|stopPropagation={()=>state.partsList=!state.partsList} title="切换分P显示模式">☰</button>{#each state.parts[item.id] as part}<button class="part-item b3-button b3-button--text {currentItem?.id===`${item.id}-p${part.page}`?'playing':''}" on:click|stopPropagation={async()=>{const s=item.url?.match(/#s:(\d+):(c?\d+)/);if(s){if(part.children?.length>1){part.expanded=!part.expanded;state.parts[item.id]=[...state.parts[item.id]];return}if(!part.children){const subs=await BilibiliParser.getVideoParts({bvid:part.cid}).catch(()=>[]);if(subs?.length>1){part.children=subs;part.expanded=true;state.parts[item.id]=[...state.parts[item.id]];return}}}const bvid=item.bvid||item.url?.match(/BV[a-zA-Z0-9]+/)?.[0];play(s?{...item,originalUrl:item.url,id:`${item.id}-p${part.page}`,title:part.part||`第${part.page}集`,url:part.isCourse?`https://www.bilibili.com/cheese/play/ep${part.epid}`:`https://www.bilibili.com/video/${part.cid}`,bvid:part.bvid||part.cid,cid:String(part.cid),aid:part.aid,epid:part.epid,isCourse:part.isCourse,page:part.page,pages:state.parts[item.id]}:{...item,id:`${item.id}-p${part.page}`,title:`${item.title.split(' - P')[0]} - P${part.page}${part.part?': '+part.part:''}`,url:`https://www.bilibili.com/video/${bvid}?p=${part.page}`,bvid,cid:String(part.cid),page:part.page,pages:state.parts[item.id]});}} title={part.part||`P${part.page}`}>{#if state.partsList}P{part.page}{part.part?`: ${part.part}`:''}{:else}{part.page}{/if}</button>{#if part.expanded&&part.children?.length>1}{#each part.children as sub}<button class="part-item b3-button b3-button--text {currentItem?.id===`${item.id}-p${part.page}-${sub.page}`?'playing':''}" on:click|stopPropagation={()=>{const parentBvid=part.cid;play({...item,id:`${item.id}-p${part.page}-${sub.page}`,title:`${(part.part||`第${part.page}集`).split(':')[0]} - P${sub.page}${sub.part?': '+sub.part:''}`,url:`https://www.bilibili.com/video/${parentBvid}?p=${sub.page}`,bvid:parentBvid,cid:String(sub.cid)});}} title={sub.part||`P${sub.page}`}>{#if state.partsList}P{sub.page}{sub.part?`: ${sub.part}`:''}{:else}{sub.page}{/if}</button>{/each}{/if}{/each}</div>{/if}</div>{/each}</div>
        {:else}
            <div class="panel-empty b3-list b3-list--empty">{
                state.source === 'local' ? '请在输入框添加媒体链接' :
                state.source === 'document' ? '请在文档中添加播放列表块' :
                !state.enabled || !state.dbId ? '请在设置中配置数据库' : '当前标签暂无媒体项目'
            }</div>
        {/if}
    </div>

    <!-- 输入 -->
    {#if !state.folder.type && state.tab !== '目录' && state.tab !== '搜索'}
    <div class="panel-footer">
        <input type="text" class="b3-text-field" placeholder="输入链接/BV号，支持批量添加（空格分隔）..." bind:value={state.input} on:keydown={e => e.key === 'Enter' && handleAdd()}>
        {#if state.input}<button class="b3-button b3-button--text" on:click={() => state.input = ''} title="清空"><svg class="svg"><use xlink:href="#iconClose" /></svg></button>{/if}
        <button class="b3-button b3-button--text" on:click={handleAdd} title="添加"><svg class="svg"><use xlink:href="#iconGraph" /></svg></button>
    </div>
    {/if}
</div>