<script lang="ts">
    import { SubtitleManager } from '../core/subtitle';
    import { DanmakuManager } from '../core/danmaku';
    import { Media } from '../core/player';
    import { BilibiliParser, isBilibiliAvailable } from '../core/bilibili';
    import { onDestroy, onMount, tick } from 'svelte';
    import { showMessage } from 'siyuan';
    import { LicenseManager } from '../core/license';
    // @ts-ignore
    import Tabs from './Tabs.svelte';
    // 静态导入 Markmap（与 Artplayer 类似的打包方式）
    // @ts-ignore
    // Markmap 相关由 core/mindmap 内部管理，无需在组件直接导入第三方库
    import { 
        buildPromptFromSubtitles as buildMindmapPromptFromSubtitles,
        attachMediaLinks,
        buildBiliMindmap,
        callSiYuanAI,
        buildMarkmapMarkdown as buildMarkmapMarkdownCore,
        renderMarkmap as renderMarkmapCore,
        setupMarkmapAutoFit as setupMarkmapAutoFitCore,
        cleanupMarkmap as cleanupMarkmapCore,
        extractSeconds
    } from '../core/mindmap';

    // 组件属性
    export let className = '', hidden = false, i18n: any = {}, currentMedia: any = null, player: any = null;
    export let insertContentCallback, createTimestampLinkCallback;
    export let activeTabId = 'assistant';
    export let plugin: any;
    
    // 内部追踪当前媒体（防止prop被覆盖）
    let _currentMedia: any = null, _player: any = null;
    
    // 配置管理
    const getConfig = async () => {
        const data = await plugin.loadData('config.json');
        return (data && typeof data === 'object' && !Array.isArray(data)) ? { settings: {}, bilibiliLogin: undefined, ...data } : { settings: {}, bilibiliLogin: undefined };
    };

    // 获取B站配置 - 支持多账号
    const getBiliConfig = async (bvid?: string) => {
        const config = await getConfig();
        if (!bvid || !isBilibiliAvailable() || config.settings?.bilibiliLogin?.wbi_img) return config;
        for (const acc of config.settings?.bilibiliAccounts || []) if (acc.wbi_img) try { await BilibiliParser.getVideoParts({ bvid }); return { settings: { bilibiliLogin: acc } }; } catch {}
        return config;
    };

    // 组件状态
    const TAB_KEYS = ['subtitles','danmakus','summary','mindmap'] as const;
    type TabKey = typeof TAB_KEYS[number];
    let activeTab: TabKey = 'subtitles';
    let viewMode = 'list'; // 'list' | 'paragraph'
    let subtitles = [], summaryItems = [], danmakus = [], currentSubtitleIndex = -1;
    let isLoadingAll = false;
    let mindmapText = '';
    let isGeneratingMindmap = false;
    let mmContainer: HTMLDivElement;
    let mmRendering = false;
    let mmError = '';
    let mmResizeObserver: ResizeObserver | null = null;
    let mmLinkHandler: ((e: Event) => void) | null = null;
    let timer = null;
    let autoScrollEnabled = true;
    let listElement;
    let isPro = false;
    // 可选：字幕项右键/更多菜单（复用播放器菜单风格）
    
    // 响应式数据
    $: items = activeTab === 'subtitles' ? subtitles : (activeTab === 'danmakus' ? danmakus : (activeTab === 'summary' ? summaryItems : []));
    $: hasItems = activeTab === 'mindmap' ? !!mindmapText : items.length > 0;
    $: tabLabels = ({
        subtitles: i18n?.assistant?.tabs?.subtitles || '字幕',
        danmakus: i18n?.assistant?.tabs?.danmakus || '弹幕',
        summary: i18n?.assistant?.tabs?.summary || 'AI总结',
        mindmap: i18n?.assistant?.tabs?.mindmap || '思维导图'
    });
    $: exportTitle = _currentMedia?.title ? `## ${_currentMedia.title} ${tabLabels[activeTab] || ''}\n\n` : '';
    $: loadingText = activeTab === 'summary'
        ? (i18n?.assistant?.summary?.loading || '正在加载AI总结...')
        : (activeTab === 'danmakus'
            ? (i18n?.assistant?.danmakus?.loading || '正在加载弹幕...')
            : (i18n?.assistant?.subtitles?.loading || '正在加载字幕...'));
    $: exportBtnText = i18n?.assistant?.exportAll || "全部导出";
    $: resumeBtnText = i18n?.assistant?.resumeScroll || "恢复滚动";
    $: isLoading = isLoadingAll;
    $: emptyText = activeTab === 'subtitles' 
        ? (i18n?.assistant?.subtitles?.noItems || "当前视频没有可用的字幕")
        : (activeTab === 'danmakus'
            ? (i18n?.assistant?.danmakus?.noItems || "当前视频没有可用的弹幕")
            : (i18n?.assistant?.summary?.noItems || "当前暂无总结，可点击下方按钮生成"));
    $: mediaBaseUrl = (_currentMedia?.originalUrl || _currentMedia?.url || '').trim();
    const normalizeFileUrl = (u: string): string => {
        if (!u) return u as any;
        if (/^[a-zA-Z]:[\\\/]/.test(u)) return `file:///${u.replace(/\\/g,'/')}`;
        return u.startsWith('file://') && !u.startsWith('file:///') ? u.replace('file://','file:///') : u;
    };
    function getHeaderCountText(tabKey: TabKey, has: boolean, count: number, mm: string): string {
        return tabKey === 'mindmap'
            ? `${mm ? (i18n?.assistant?.itemReady || '已生成') : (i18n?.assistant?.noItems || '无')}${tabLabels.mindmap}`
            : `${has ? `${count}${i18n?.assistant?.itemCount || '条'}` : (i18n?.assistant?.noItems || '无')}${tabLabels[tabKey]}`;
    }
    
    // 初始化时从prop读取
    $: if (currentMedia && !_currentMedia) _currentMedia = currentMedia, _player = player;
    
    // 媒体变化监听 - 极简版（监听id变化，包含分P）
    $: mediaKey = _currentMedia?.id || _currentMedia?.url || '';
    $: if (mediaKey) stopTracking(), isPro && _player ? (loadContent(), startTracking()) : clearContent();
    $: if (!mediaKey) clearContent();

    // 清理内容状态
    const clearContent = () => (subtitles = [], summaryItems = [], danmakus = [], mindmapText = '', currentSubtitleIndex = -1, autoScrollEnabled = true, isLoadingAll = false, isGeneratingMindmap = false);



    // 生命周期
    onMount(() => {
        (async () => { try { const lic = await LicenseManager.load(plugin); isPro = !!(lic && lic.isValid); } catch {} })();
        const handleTabActivate = (e: any) => {
            if (e.detail?.tabId) activeTabId = e.detail.tabId;
        };
        const handleSubtitlesUpdated = (e: any) => {
            try {
                subtitles = Array.isArray(e?.detail?.subtitles) ? e.detail.subtitles : [];
                currentSubtitleIndex = -1;
                autoScrollEnabled = true;
            } catch {}
        };
        const handleMediaUpdate = (e: any) => e.detail?.currentItem?.url && (_currentMedia = e.detail.currentItem, _player = e.detail.player || _player);
        window.addEventListener('mediaPlayerTabActivate', handleTabActivate);
        window.addEventListener('subtitlesUpdated', handleSubtitlesUpdated as any);
        window.addEventListener('siyuanMediaPlayerUpdate', handleMediaUpdate as any);
        // 窗口自适应由核心模块在开关时管理，此处不主动注册
        return () => {
            window.removeEventListener('mediaPlayerTabActivate', handleTabActivate);
            window.removeEventListener('subtitlesUpdated', handleSubtitlesUpdated as any);
            window.removeEventListener('siyuanMediaPlayerUpdate', handleMediaUpdate as any);
            stopTracking();
            try { mmResizeObserver?.disconnect(); } catch {}
            mmResizeObserver = null;
        };
    });
    
    // 极简字幕追踪
    function startTracking() {
        if (timer) clearInterval(timer);
        timer = setInterval(() => {
            if (!_player || !items.length || !listElement) return;
            
            // 查找当前项目索引
            const time = _player.getCurrentTime();
            const prev = currentSubtitleIndex;
            currentSubtitleIndex = activeTab === 'subtitles'
                ? items.findIndex((i, idx, arr) => time >= i.startTime && (time < i.endTime || idx === arr.length - 1))
                : items.reduce((b, i, idx) => (i.startTime <= time && (b === -1 || i.startTime > items[b].startTime) ? idx : b), -1);
            
            // 项目变化时更新滚动
            if (currentSubtitleIndex !== -1 && currentSubtitleIndex !== prev) {
                updateScroll();
            }
        }, 500);
    }

    // 统一滚动逻辑
    const updateScroll = (force = false) => (currentSubtitleIndex === -1 || !listElement || (!force && !autoScrollEnabled)) ? void 0 : listElement.querySelector(viewMode === 'paragraph' ? `[data-index="${currentSubtitleIndex}"]` : `.subtitle-item:nth-child(${currentSubtitleIndex + 1})`)?.scrollIntoView({behavior:'smooth', block:'center'});

    // 视图切换
    const toggleViewMode = () => (viewMode = viewMode === 'list' ? 'paragraph' : 'list', autoScrollEnabled = true, updateScroll(true));
    const handleClick = (_e, startTime) => !window.getSelection().toString() && jumpToTime(startTime);
    const disableAutoScroll = () => autoScrollEnabled = false;
    const resumeAutoScroll = () => (autoScrollEnabled = true, updateScroll(true));
    const stopTracking = () => timer && (clearInterval(timer), timer = null);
    
    // 加载内容 - 极简版
    async function loadContent() {
        if (!_currentMedia?.url) return;
        const existingSubs=SubtitleManager.getSubtitles();
        clearContent();
        if(!existingSubs||existingSubs.length===0)SubtitleManager.setSubtitles([]);
        isLoadingAll = true;
        try {
            const { bvid, cid, url } = _currentMedia, biliConfig = await getBiliConfig(bvid);

            // 并行加载所有内容
            const [subtitleResult, danmakuResult, summaryResult] = await Promise.allSettled([
                // 字幕
                existingSubs&&existingSubs.length>0?Promise.resolve(existingSubs):bvid && cid && isBilibiliAvailable()
                    ? SubtitleManager.loadBilibiliSubtitle(bvid, cid, biliConfig)
                    : (url ? SubtitleManager.findSupportFiles(url, ['.srt','.vtt','.ass']).then(list => list[0]?.url ? SubtitleManager.loadSubtitle(list[0].url) : []) : []),

                // 弹幕
                bvid && cid && isBilibiliAvailable()
                    ? DanmakuManager.getBiliDanmaku(cid, biliConfig)
                    : url ? DanmakuManager.getDanmakuFileForMedia(url).then(opt => opt ? DanmakuManager.loadDanmaku(opt.url, opt.type) : []) : [],

                // 总结
                bvid && cid && isBilibiliAvailable()
                    ? BilibiliParser.getVideoAiSummary(bvid, cid, _currentMedia.artistId || biliConfig.settings?.bilibiliLogin?.mid, biliConfig)
                        .then(result => result?.code === 0 && result?.data?.code === 0 && result.data.model_result
                            ? [{ startTime: 0, text: result.data.model_result.summary, type: 'summary' },
                               ...(result.data.model_result.outline?.flatMap(section => [
                                   { startTime: section.timestamp, text: section.title, type: 'chapter' },
                                   ...section.part_outline.map(point => ({ startTime: point.timestamp, text: point.content }))
                               ]) || [])]
                            : [])
                    : []
            ]);

            subtitles = subtitleResult.status === 'fulfilled' ? (subtitleResult.value || []) : [];
            danmakus = danmakuResult.status === 'fulfilled' ? (danmakuResult.value || []) : [];
            summaryItems = summaryResult.status === 'fulfilled' ? (summaryResult.value || []) : [];
        } catch {} finally { isLoadingAll = false; }
    }

    
    // 工具函数
    const getTimeDisplay = item => activeTab === 'summary' ? (item.type ? (i18n?.assistant?.summary?.[item.type] || (item.type === 'summary' ? '总结' : '章节')) : (!item.startTime || item.startTime === 0 ? '' : Media.fmt(item.startTime))) : Media.fmt(item.startTime);
        
    const jumpToTime = time => _player?.seekTo(time);
    const stripCodeFences = (s: string): string => String(s || '').replace(/^\s*```[a-zA-Z-]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    
    // 将思维导图 Markdown 转为总结列表（扁平化）
    function updateSummaryFromMindmap(md: string) {
        const lines = String(md || '').split(/\r?\n/);
        const result: Array<{ startTime: number; text: string }> = [];
        for (const raw of lines) {
            const m = raw.match(/^\s*[\-\*\+]\s+(.+)/); // 列表项
            if (!m) continue;
            let content = m[1].trim();
            let text = content;
            let sec = NaN;
            const link = content.match(/\[([^\]]+)\]\(([^)]+)\)/);
            if (link) {
                text = link[1].trim();
                const href = link[2].trim();
                sec = extractSeconds(href);
            } else {
                const t = content.match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)$/);
                if (t) {
                    const h = t[3] ? Number(t[1]) : 0;
                    const mm = t[3] ? Number(t[2]) : Number(t[1]);
                    const ss = t[3] ? Number(t[3]) : Number(t[2]);
                    sec = (h * 3600) + (mm * 60) + ss;
                    text = (t[4] || '').trim() || text;
                }
            }
            result.push({ startTime: isNaN(sec) ? 0 : sec, text });
        }
        if (result.length) summaryItems = result;
    }
    
    const buildExportLine = async (item: any): Promise<string> => { const text = item.type ? `【${getTimeDisplay(item)}】${item.text}` : item.text, fallback = `- [${getTimeDisplay(item)}] ${text}`; try { return (await createTimestampLinkCallback(false, item.startTime, undefined, text)) || fallback; } catch { return fallback; } };
    const insert = async (content: string) => { try { await insertContentCallback(content); showMessage(i18n?.assistant?.exportSuccess || '导出成功'); } catch (e) { showMessage(i18n?.assistant?.exportFailed || '导出失败'); } };

    const exportItem = async (item) => insert(await buildExportLine(item));
    const exportAll = async () => !items.length ? showMessage(i18n?.assistant?.noExportItems || '没有可导出的内容') : insert(exportTitle + (await Promise.all(items.map(buildExportLine))).join('\n'));
    
    // Tab切换时重置状态
    $: if (activeTab) {
        currentSubtitleIndex = -1;
        autoScrollEnabled = true;
    }
    
    // 组件销毁时清理
    onDestroy(stopTracking);

    // 思维导图相关逻辑已抽离到 ../core/mindmap 模块

    // 思维导图：生成
    async function generateMindmap() {
        if (isGeneratingMindmap) return;
        try {
            if (!subtitles?.length) {
                return showMessage(i18n?.assistant?.mindmap?.noSubtitle || '当前视频未加载到可用字幕，请稍后重试');
            }
            isGeneratingMindmap = true;
            const prompt = buildMindmapPromptFromSubtitles(subtitles);
            const cfg = await getConfig();
            const aiAcc = (cfg.settings?.aiAccounts || []).find((a: any) => a?.base && a?.apiKey && a?.model) || null;
            const result = aiAcc
                ? await (await import('../core/mindmap')).callCustomAI(aiAcc, prompt)
                : await callSiYuanAI(prompt);
            const rawMd = String(result || '').trim();
            // 先把 AI 结果规范为包含时间 token，再根据当前媒体 URL 构造完整链接
            const withTokens = stripCodeFences(rawMd); // 允许 AI 输出含 t= 或 [mm:ss] 等
            const linkBase = /^(file:\/\/|[A-Za-z]:[\\\/])/.test(mediaBaseUrl) ? '#' : normalizeFileUrl(mediaBaseUrl);
            let linked = attachMediaLinks(withTokens, linkBase);
            // 若仍无链接且已加载B站总结，尝试用总结构建兜底
            if (!/\]\(https?:\/\//.test(linked) && summaryItems?.length) {
                const fallback = buildBiliMindmap(summaryItems);
                if (fallback) linked = attachMediaLinks(fallback, linkBase);
            }
            mindmapText = linked;
            if (!mindmapText) {
                showMessage(activeTab === 'summary' 
                    ? (i18n?.assistant?.summary?.emptyResult || 'AI未返回有效的总结')
                    : (i18n?.assistant?.mindmap?.emptyResult || 'AI未返回有效的思维导图'));
            } else {
                showMessage(activeTab === 'summary'
                    ? (i18n?.assistant?.summary?.success || '总结生成完成')
                    : (i18n?.assistant?.mindmap?.success || '思维导图生成完成'));
                // 同步到"视频总结"列表显示
                updateSummaryFromMindmap(mindmapText);
                await tick();
                renderMarkmapMindmap();
            }
        } catch (e) {
            showMessage(i18n?.assistant?.summary?.failed || i18n?.assistant?.mindmap?.failed || '生成失败，请稍后重试');
        } finally {
            isGeneratingMindmap = false;
        }
    }

    // 思维导图：导出
    const exportMindmap = async () => !mindmapText?.trim() ? showMessage(i18n?.assistant?.mindmap?.noContent || '暂无可导出的思维导图') : insert((exportTitle || '') + mindmapText);

    // ===== 面板直渲染（Markmap） =====
    // 构建 Markmap Markdown 使用模块方法

    const cleanupMarkmap = () => (mmContainer && mmLinkHandler && mmContainer.removeEventListener('click', mmLinkHandler as any, true), mmLinkHandler = null, cleanupMarkmapCore(mmContainer, mmResizeObserver, null), mmResizeObserver = null);

    function renderMarkmapMindmap(): void {
        try {
            if (!mindmapText?.trim() || !mmContainer) return;
            mmRendering = true; mmError = '';
            const { instance } = renderMarkmapCore(mmContainer, buildMarkmapMarkdownCore(mindmapText, _currentMedia?.title), _currentMedia?.title);
            mmResizeObserver?.disconnect();
            mmResizeObserver = setupMarkmapAutoFitCore(mmContainer, instance);
            if (mmContainer && mmLinkHandler) mmContainer.removeEventListener('click', mmLinkHandler as any, true);
            mmLinkHandler = (ev: Event) => {
                const a = (ev.target as Element)?.closest?.('a' as any) as Element | null;
                const href = a && (a.getAttribute('href') || a.getAttribute('xlink:href'));
                if (!href) return;
                ev.preventDefault(); ev.stopPropagation();
                const sec = extractSeconds(href);
                if (href.startsWith('#')) { if (!isNaN(sec)) _player?.seekTo?.(sec); return; }
                _player?.play?.(href, isNaN(sec) ? undefined : { startTime: sec });
            };
            if (mmContainer) mmContainer.addEventListener('click', mmLinkHandler as any, true);
        } catch (e) {
            mmError = String(e || 'render failed');
        } finally {
            mmRendering = false;
        }
    }

    // ===== 面板直渲染（Markmap） =====
    $: if (activeTab === 'mindmap' && mindmapText && mmContainer) renderMarkmapMindmap();
    $: if (activeTab !== 'mindmap') cleanupMarkmap();
</script>

<div class="panel assistant {className}" class:hidden={hidden}>
    <!-- 统一导航 -->
    <Tabs {activeTabId} {i18n}>
        <svelte:fragment slot="controls">
            <span class="panel-count">{getHeaderCountText(activeTab, hasItems, items.length, mindmapText)}</span>
            {#if hasItems && activeTab !== 'mindmap'}
                <button class="view-mode-btn b3-button b3-button--text" on:click={toggleViewMode}>
                    <svg class="icon svg"><use xlink:href={viewMode === 'list' ? '#iconMenu' : '#iconBoth'}></use></svg>
                </button>
            {/if}
        </svelte:fragment>
    </Tabs>
    
    <div class="layout-tab-bar fn__flex">
        {#each TAB_KEYS as key}
            <div class="item" class:item--focus={activeTab === key} on:click={() => activeTab = key}>
                <span class="item__text">{tabLabels[key]}</span>
            </div>
        {/each}
    </div>
    
    <div class="panel-content">
        {#key activeTab}
        {#if !isPro}
            <div class="panel-empty b3-list b3-list--empty">{i18n?.assistant?.proOnly || '此功能为 Pro 会员专享，请在设置中激活 Pro 后使用。'}</div>
        {:else if isLoading || (activeTab === 'summary' && isGeneratingMindmap)}
            <div class="panel-empty b3-list b3-list--empty loading">{isGeneratingMindmap ? (i18n?.assistant?.summary?.generating || "正在生成总结...") : loadingText}</div>
        {:else if activeTab === 'mindmap'}
            <div class="subtitle-list mindmap-host">
                {#if isGeneratingMindmap}
                    <div class="panel-empty b3-list b3-list--empty loading">{i18n?.assistant?.mindmap?.generating || "正在生成思维导图..."}</div>
                {:else if mindmapText}
                    <div bind:this={mmContainer} class="mindmap-stage"></div>
                    {#if mmRendering}
                        <div class="panel-empty b3-list b3-list--empty loading">{i18n?.assistant?.mindmap?.rendering || '正在渲染 Mind map...'}</div>
                    {/if}
                    {#if mmError}
                    <div class="panel-empty b3-list b3-list--empty error">{mmError}</div>
                    {/if}
                {:else}
                    <div class="panel-empty b3-list b3-list--empty">{i18n?.assistant?.mindmap?.empty || "尚未生成思维导图"}</div>
                {/if}
            </div>
        {:else if hasItems}
            <div class="subtitle-list b3-list b3-list--background" bind:this={listElement} on:scroll|capture={disableAutoScroll} on:wheel={disableAutoScroll} on:touchmove={disableAutoScroll}>
                {#if viewMode === 'paragraph'}
                    <div class="subtitle-paragraph">
                        {#each items as item, index}
                            <span class="subtitle-segment" class:current={index === currentSubtitleIndex}
                                  data-index={index} on:click={(e) => handleClick(e, item.startTime || 0)}>
                                {item.text}
                            </span>{#if index < items.length - 1}，{/if}
                        {/each}
                    </div>
                {:else}
                    {#each items as item, index}
                        <div class="subtitle-item b3-list-item" class:current={index === currentSubtitleIndex}
                             on:click={(e) => handleClick(e, item.startTime || 0)}>
                            <span class="subtitle-time">{getTimeDisplay(item) || ''}</span>
                            <div class="subtitle-text">
                                <div>{item.text}</div>
                                {#if item.text2}<div class="subline">{item.text2}</div>{/if}
                            </div>
                            <button class="action-btn" on:click|stopPropagation={() => exportItem(item)} title={i18n?.assistant?.export || '导出'}>
                                <svg class="icon"><use xlink:href="#iconCopy"></use></svg>
                            </button>
                        </div>
                    {/each}
                {/if}
            </div>
        {:else}
            <div class="panel-empty b3-list b3-list--empty">{emptyText}</div>
        {/if}
        {/key}
    </div>

    {#if activeTab === 'mindmap' || activeTab === 'summary' || hasItems}
        <div class="panel-footer">
            {#if (activeTab === 'mindmap' || activeTab === 'summary') && !mindmapText && !isGeneratingMindmap}
                <button class="b3-button b3-button--text" on:click={generateMindmap} title={activeTab === 'summary' ? (i18n?.assistant?.summary?.generate || "生成总结") : (i18n?.assistant?.mindmap?.generate || "生成思维导图")}>
                    <svg class="icon svg"><use xlink:href="#iconPlay"></use></svg>
                </button>
            {/if}
            {#if (activeTab === 'mindmap' || activeTab === 'summary') && mindmapText}
                <button class="b3-button b3-button--text" on:click={exportMindmap} title={i18n?.assistant?.mindmap?.export || "导出到文档"}>
                    <svg class="icon svg"><use xlink:href="#iconDownload"></use></svg>
                </button>
            {/if}
            {#if activeTab !== 'mindmap' && activeTab !== 'summary' && items.length}
                <button class="b3-button b3-button--text" on:click={exportAll} title={exportBtnText}>
                    <svg class="icon svg"><use xlink:href="#iconDownload"></use></svg>
                </button>
            {/if}
            {#if activeTab !== 'mindmap' && !autoScrollEnabled}
                <button class="b3-button b3-button--text" on:click={resumeAutoScroll} title={resumeBtnText}>
                    <svg class="icon svg"><use xlink:href="#iconPlay"></use></svg>
                </button>
            {/if}
        </div>
    {/if}
</div>

