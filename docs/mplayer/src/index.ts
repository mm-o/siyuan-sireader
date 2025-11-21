import { Plugin, showMessage, openTab, Menu, getFrontend, Dialog } from "siyuan";
import "@/styles/components.scss";
import "@/styles/mediaView.css";
import * as api from "@/api";
import { initMediaBlockMenu } from "@/core/mediaView";
// @ts-ignore
import Player from "./components/Player.svelte";
// @ts-ignore
import MPVPlayer from "./components/MPVPlayer.svelte";
// @ts-ignore
import PlayList from "./components/PlayList.svelte";
// @ts-ignore
import Setting from "./components/Setting.svelte";
// @ts-ignore
import Assistant from "./components/Assistant.svelte";
// @ts-ignore
import Notes from "./components/Notes.svelte";
// @ts-ignore
import TVBox from "./components/TVBox.svelte";

import type { ComponentInstance } from './core/types';
import { MobileDialogManager } from './core/mobile';

export default class MediaPlayerPlugin extends Plugin {
    private components = new Map<string, ComponentInstance>();
    private events = new Map<string, EventListener>();
    private linkClickHandler: ((e: MouseEvent) => Promise<void>) | null = null;
    private tabInstance: any = null;
    public playerAPI: any;
    private isMobile = () => getFrontend().endsWith('mobile'); // 运行环境判断
    private mobileManager: MobileDialogManager | null = null;
    private mobileFloatButton: HTMLElement | null = null;
    private preClickHandler: ((e: MouseEvent) => void) | null = null;

    /** 保存数据，支持格式化JSON */
    async saveData(f: string, d: any, i?: number) { return super.saveData(f, i !== undefined ? JSON.stringify(d, null, i) : d); }

    /** 获取插件配置 */
    private async getConfig() { const d = await this.loadData('config.json'); return d && typeof d === 'object' && !Array.isArray(d) ? { settings: {}, ...d } : { settings: {} }; }

    /** 插件加载初始化 */
    async onload() {
        await this.initAPI();
        this.registerEvents();
        this.addSlashCommands();
        this.addUI();
    }

    /** 布局就绪后初始化 */
    async onLayoutReady() {
        // 移动端：创建全局悬浮按钮
        this.isMobile() && (await this.getConfig())?.settings?.showMobileFloatButton !== false && this.createMobileFloatButton();
        // 初始化媒体块视图（菜单+自动渲染+视频/音频块点击）
        initMediaBlockMenu({ ...this, getConfig: () => this.getConfig(), openTab: () => this.openTab() });
    }

    /** 插件卸载清理 */
    onunload() {
        this.events.forEach((h, e) => {
            (e === 'linkClick' ? document : window).removeEventListener(e === 'linkClick' ? 'click' : e, h, e === 'linkClick');
            this.eventBus.off(e as any, h);
        });
        if (this.linkClickHandler) window.removeEventListener('click', this.linkClickHandler, true);
        if (this.preClickHandler) window.removeEventListener('mousedown', this.preClickHandler, true);
        this.components.forEach(c => c?.$destroy?.());
        [this.components, this.events].forEach(m => m.clear());
        this.mobileManager?.destroy();
        this.mobileFloatButton?.remove();
        (window as any).siyuanMediaPlayer = null;
        api.refresh();
    }

    /** 初始化API和链接处理器 */
    private async initAPI() {
        const { createLinkClickHandler, playMediaItem, isRecognizedMediaLink } = await import('./core/player');
        const player = () => this.components.get('custom_tab') || Array.from(this.components.values()).find((c: any) => c?.getCurrentTime);

        this.playerAPI = {
            getCurrentTime: () => player()?.getCurrentTime?.() || 0,
            seekTo: (time: number) => player()?.seekTo?.(time),
            getCurrentMedia: () => player()?.getCurrentMedia?.() || null,
            play: (url: string, options: any) => player()?.play?.(url, options),
            toggle: () => player()?.toggle?.(),
            seek: (offset: number) => player()?.seek?.(offset),
            triggerAction: (action: string) => player()?.triggerAction?.(action),
            increaseSpeed: () => player()?.increaseSpeed?.(),
            decreaseSpeed: () => player()?.decreaseSpeed?.(),
            toggleCustomSpeed: () => player()?.toggleCustomSpeed?.(),
            getConfig: () => this.getConfig(),
            createTimestampLink: async (_withScreenshot: boolean, startTime: number, endTime?: number, subtitle?: string) => {
                const { link } = await import('./core/document');
                const currentItem = this.playerAPI.getCurrentMedia();
                return currentItem ? await link(currentItem, await this.getConfig(), startTime, endTime, subtitle) : '';
            },
            openSidebarTab: (tabId: string) => this.openSidebarTab(tabId)
        };

        this.linkClickHandler = createLinkClickHandler(this.playerAPI, () => this.getConfig(), () => this.openTab(), (item, startTime, endTime) => playMediaItem(item, startTime, endTime, () => this.getConfig(), () => this.openTab()));
        window.addEventListener('click', this.linkClickHandler, true); //防止网页视图打开
        const isMediaLink = (u?: string | null) => isRecognizedMediaLink(u || undefined);
        this.preClickHandler = (ev: MouseEvent) => {
            if (ev.button !== 0) return;
            const linkEl = (ev.target as HTMLElement)?.closest('[data-href],a[href],span[data-type="a"],span[data-type="url"]') as HTMLElement | null;
            if (!linkEl) return;
            const dh = linkEl.getAttribute('data-href'); const hh = linkEl.getAttribute('href');
            const url = [dh, hh].find(isMediaLink) || null;
            if (!url) return;
            const oh = hh, odh = dh;
            linkEl.setAttribute('data-media-url', url);
            if (oh !== null) linkEl.setAttribute('href', '');
            if (odh !== null) linkEl.setAttribute('data-href', '');
            setTimeout(() => {
                if (oh !== null) linkEl.setAttribute('href', oh); else linkEl.removeAttribute('href');
                if (odh !== null) linkEl.setAttribute('data-href', odh); else linkEl.removeAttribute('data-href');
                linkEl.removeAttribute('data-media-url');
            }, 300);
        };
        window.addEventListener('mousedown', this.preClickHandler, true);
        (window as any).siyuanMediaPlayer = this.playerAPI;
    }

    /** 注册事件监听器和快捷键 */
    private registerEvents() {
        // 兼容 eventBus.emit 和 window.dispatchEvent
        const getData = (e: CustomEvent) => e.detail?.detail || e.detail;
        
        const handlers = {
            'siyuanMediaPlayerUpdate': (e: CustomEvent<any>) => {
                const { currentItem } = e.detail;
                if (this.tabInstance?.parent?.updateTitle && currentItem?.title) {
                    try { this.tabInstance.parent.updateTitle(currentItem.title); } catch {}
                }
                const assistant = this.components.get('assistant');
                if (assistant?.$set) assistant.$set({ currentMedia: currentItem });
            },
            'updatePlayerConfig': (e: CustomEvent) => {
                this.playerAPI?.updateConfig?.(e.detail);
            },
            'playMediaItem': async (e: CustomEvent) => {
                // 块内播放：不打开Tab
                if (e.detail?._inlinePlayerId) return;
                if (!document.querySelector('.media-player-tab, #media-player-mobile-dialog')) {
                    try {
                        await this.openTab();
                        await new Promise(r => setTimeout(r, 800));
                    } catch (err) {
                        console.warn('[MediaPlayer] 自动打开失败:', err);
                        showMessage('请先打开媒体播放器', 3000, 'info');
                        return;
                    }
                }
                const { play } = await import('./core/player');
                await play(getData(e), this.playerAPI, await this.getConfig(), (item) =>
                    window.dispatchEvent(new CustomEvent('siyuanMediaPlayerUpdate', { detail: { currentItem: item } })));
            },
            'mediaPlayerTabChange': async (e: CustomEvent) => {
                const tabId = e.detail?.tabId;
                if (tabId) {
                    const container = document.querySelector('.media-player-sidebar-content');
                    if (container) await this.showTabContent(tabId, container as HTMLElement);
                }
            },
            'mediaPlayerAction': async (e: CustomEvent) => {
                const { action, loopStartTime } = getData(e);
                const currentItem = this.playerAPI?.getCurrentMedia?.();
                const config = await this.getConfig();
                try {
                    if (action === 'prev' || action === 'next') {
                        const ok = await this.components.get('playlist')?.[action==='prev'?'playPrev':'playNext']?.(true);
                        if (!ok) showMessage(this.i18n?.playList?.errors?.playNextFailed || '无法切换');
                        return;
                    }
                    if (!currentItem) return;
                    const { player, mediaNotes } = await import('./core/document');
                    switch (action) {
                        case 'screenshot': await player.screenshot(this.playerAPI, currentItem, config, this.i18n); break;
                        case 'timestamp': await player.timestamp(this.playerAPI, currentItem, config, this.i18n); break;
                        case 'loopSegment': if (loopStartTime !== undefined) await player.loop(this.playerAPI, currentItem, config, this.i18n, loopStartTime); break;
                        case 'mediaNotes': await mediaNotes.create(currentItem, config, this.playerAPI, this.i18n, this); break;
                    }
                } catch (error) {
                    console.error(`执行${action}失败:`, error);
                    showMessage(`操作失败: ${error.message || error}`);
                }
            },
            'mediaEnded': () => this.components.get('playlist')?.playNext?.(),
            'mediaPlayerControl': (e: CustomEvent) => ((d:any = getData(e)) => d?.method && this.playerAPI?.[d.method] && this.playerAPI[d.method](...(Array.isArray(d.args) ? d.args : d.args !== undefined ? [d.args] : [])))(),
            // 右侧分栏打开思源资产（PDF 等）
            'open-asset': (e: CustomEvent<{ assetPath: string }>) => e.detail?.assetPath && openTab({ app: (this as any).app, asset: { path: e.detail.assetPath.replace(/^\/+/, '') }, position: 'right' }),
            // 设置变更：动态控制移动端悬浮按钮
            'configUpdated': (e: CustomEvent<any>) => this.isMobile() && (e?.detail?.settings?.showMobileFloatButton !== false
                ? (this.mobileFloatButton || this.createMobileFloatButton())
                : (this.mobileFloatButton && (this.mobileFloatButton.remove(), this.mobileFloatButton = null)))
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            const listener = (handler as any).bind(this) as EventListener;
            this.events.set(event, listener);
            window.addEventListener(event, listener as any);
            this.eventBus.on(event as any, listener);
        });

        this.addHotkeys();
    }

    /** 注册斜杠命令 */
    private addSlashCommands() {
        this.protyleSlash = [{
            filter: ['媒体播放器', 'sm', 'media', 'player', 'mt'],
            html: '<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#siyuan-media-player-icon"></use></svg><span class="b3-list-item__text">添加媒体到当前块</span></div>',
            id: 'add-media-block',
            callback: async (protyle: any) => {
                const { doc } = await import('./core/document'), { showMediaInput } = await import('./core/mediaView'), blockId = await doc.getBlockID(this.i18n).catch(() => null), rect = getSelection()?.getRangeAt(0)?.getBoundingClientRect() || protyle?.element?.getBoundingClientRect();
                blockId && rect && showMediaInput(blockId, rect, () => this.getConfig());
            }
        }];
    }

    /** 添加侧边栏和顶栏UI */
    private addUI() {
        const iconId = 'siyuan-media-player-icon';
        this.addIcons(`
            <symbol id="${iconId}" viewBox="0 0 1024 1024">
                <path d="M753.265 105.112c12.57 12.546 12.696 32.81 0.377 45.512l-0.377 0.383-73.131 72.992L816 224c70.692 0 128 57.308 128 128v448c0 70.692-57.308 128-128 128H208c-70.692 0-128-57.308-128-128V352c0-70.692 57.308-128 128-128l136.078-0.001-73.13-72.992c-12.698-12.674-12.698-33.222 0-45.895 12.697-12.674 33.284-12.674 45.982 0l119.113 118.887h152.126l119.114-118.887c12.697-12.674 33.284-12.674 45.982 0zM457 440c-28.079 0-51 22.938-51 51v170c0 9.107 2.556 18.277 7 26 15.025 24.487 46.501 32.241 71 18l138-84c7.244-4.512 13.094-10.313 17-17 15.213-24.307 7.75-55.875-16-71l-139-85c-7.994-5.355-17.305-8-27-8z"/>
            </symbol>
            <symbol id="iconDragon" viewBox="0 0 1024 1024">
                <path d="M680.59136 95.08864c7.168 8.68352 44.52352 61.8496 70.67648 91.87328 1.18784-17.87904 2.43712-34.95936 11.65312-50.176-2.41664 33.50528 25.92768 73.728 36.72064 86.85568 17.46944 23.51104 45.91616 23.20384 41.5744-6.47168 23.8592 19.10784 25.64096 51.87584 2.47808 64.55296 25.92768 28.3648 24.24832 31.49824 37.94944 35.55328 8.41728 2.21184 12.82048 0 16.6912-2.84672 2.23232-1.65888 2.72384-6.84032-3.2768-10.73152-29.81888-19.29216-14.336-59.1872-12.94336-59.392 0 0.98304-4.46464 32.11264 12.12416 42.16832 38.912 22.99904 41.30816 41.5744 37.13024 73.97376-1.536 10.24-15.95392 29.45024-34.816 37.60128a59.74016 59.74016 0 0 0 4.44416-18.80064c-5.18144 7.76192-24.39168 17.59232-38.68672 17.46944a86.016 86.016 0 0 0 15.52384-17.46944c-3.35872-0.96256-6.59456 1.04448-8.76544 3.80928-2.41664 3.13344-14.58176 15.44192-37.13024 9.50272 8.45824-3.9936 9.85088-7.39328 11.59168-12.288 1.10592-3.1744 0.47104-4.34176-2.84672-4.97664-43.49952-7.18848-52.65408-41.14432-94.208-62.81216a122.55232 122.55232 0 0 0-14.336-5.38624c-1.90464-0.69632-3.13344 0-3.42016 2.048-1.3312 8.94976-5.61152 31.51872 16.6912 40.38656 14.00832 7.20896 50.09408 11.89888 64.43008 49.152-25.74336-16.15872-30.72-14.70464-41.5744-14.49984 16.384 11.50976 23.51104 19.98848 28.95872 30.72 5.87776 13.02528 14.04928 14.336 22.79424 15.60576 16.6912 4.32128 22.528-11.07968 23.22432-11.8784 9.87136 28.81536-3.3792 45.6704-22.528 51.97824a138.26048 138.26048 0 0 1-41.53344 6.00064c-42.78272 2.41664-44.27776-44.05248-92.75392-35.38944 6.51264-5.8368 23.7568-21.77024 47.616-5.16096-3.01056-5.87776-3.29728-13.33248-28.24192-19.27168 27.62752-8.66304 45.24032 4.38272 56.4224 9.03168 0.24576-0.2048-1.39264-26.05056-72.6016-43.008-16.896-3.31776-106.63936-19.27168-105.00096-83.41504 14.336 28.83584 52.40832 35.55328 69.632 14.58176 2.048-2.53952 1.6384-3.8912-1.4336-5.89824-69.34528-48.66048-292.31104 14.78656-231.95648 99.84-6.73792-0.57344-91.19744 4.77184-98.18112-89.92768-7.76192 68.32128 44.6464 99.38944 62.09536 107.78624 28.44672 20.48 361.34912 43.64288 453.36576 86.7328 27.29984 10.5472 31.744 33.09568 31.76448 56.13568 0.16384 189.68576-157.16352 301.54752-294.62528 384.2048a3.82976 3.82976 0 0 1-3.7888 0c-104.71424-72.62208-299.47904-152.24832-289.01376-405.83168C325.632 719.19616 551.66976 813.056 563.44576 815.8208c20.70528-8.192 109.34272-44.3392 66.19136-112.35328 17.53088 6.8608 30.0032 18.92352 40.57088 33.54624 10.24-26.39872 8.8064-50.56512-12.53376-71.35232 40.61184 5.75488 75.18208 22.528 103.09632 53.6576-65.536-145.408-316.3136-76.0832-396.36992-135.168-78.58176-58.51136-81.7152-137.216-132.64896-184.5248 14.336 2.2528 28.2624 4.97664 40.77568 12.92288-7.70048-24.576-23.3472-41.96352-53.6576-64.9216 12.67712-7.12704 27.91424-9.68704 42.82368-9.66656-14.56128-10.56768-36.18816-27.70944-47.104-46.73536 15.9744 6.51264 41.8816 1.16736 49.90976-3.93216 41.79968-35.79904 82.47296-69.07904 126.976-92.16 79.52384-41.1648 164.00384-32.17408 170.0864-47.47264 0.57344-0.6144 0.32768-12.8-0.96256-17.69472-1.18784-8.02816-20.48-17.85856-37.92896-26.8288 23.12192 1.26976 83.10784 1.35168 132.11648 47.26784 11.42784-37.39648-34.44736-91.32032-69.34528-96.256 21.504-0.02048 72.43776 9.05216 95.15008 40.93952z m86.54848 162.07872c7.24992 22.65088 13.2096 34.816 23.61344 39.38304 9.8304 4.096 21.1968 1.24928 25.92768-7.24992 1.04448-1.88416 0.57344-2.72384-1.65888-3.60448a65.86368 65.86368 0 0 1-13.2096-6.59456c-8.99072-5.75488-18.20672-17.1008-34.67264-21.93408z"/>
                <path d="M270.92992 650.5472c-5.24288-20.48-7.61856-56.05376-5.87776-70.30784 7.33184-133.632-90.5216-135.82336-123.57632-171.52-49.152-55.05024-47.104-113.60256-36.7616-154.5216-36.2496 50.91328-18.432 156.3648-8.64256 170.68032a8.704 8.704 0 0 0 6.90176 5.30432c9.216 4.58752 38.912 23.36768 58.40896 53.1456-27.70944-1.00352-49.39776-12.53376-66.88768-32.768 1.16736 7.4752 25.2928 47.80032 35.71712 60.60032 2.9696 4.096 4.54656 6.144 12.86144 8.192 63.1808 22.44608 127.85664 131.19488 127.85664 131.19488z"/>
            </symbol>

        `);

        this.addDock({
            type: "SiyuanMediaSidebar",
            config: { position: "RightTop", size: { width: 400, height: 480 }, icon: iconId, title: this.i18n.sidebar?.title || "媒体播放器" },
            data: { plugin: this },
            init() {
                const plugin = this.data.plugin as MediaPlayerPlugin;
                this.element.classList.add('media-player-sidebar');
                const contentEl = document.createElement('div');
                contentEl.className = 'media-player-sidebar-content';
                this.element.appendChild(contentEl);
                plugin.showTabContent('playlist', contentEl);
            },
            resize() {},
            destroy() {
                const plugin = this.data.plugin as MediaPlayerPlugin;
                plugin.components.forEach(c => c?.$destroy?.());
                plugin.components.clear();
            }
        });

        this.addTopBar({
            icon: `<svg viewBox="0 0 1024 1024"><path fill="#8b5cf6" d="M753.265 105.112c12.57 12.546 12.696 32.81 0.377 45.512l-0.377 0.383-73.131 72.992L816 224c70.692 0 128 57.308 128 128v448c0 70.692-57.308 128-128 128H208c-70.692 0-128-57.308-128-128V352c0-70.692 57.308-128 128-128l136.078-0.001-73.13-72.992c-12.698-12.674-12.698-33.222 0-45.895 12.697-12.674 33.284-12.674 45.982 0l119.113 118.887h152.126l119.114-118.887c12.697-12.674 33.284-12.674 45.982 0zM457 440c-28.079 0-51 22.938-51 51v170c0 9.107 2.556 18.277 7 26 15.025 24.487 46.501 32.241 71 18l138-84c7.244-4.512 13.094-10.313 17-17 15.213-24.307 7.75-55.875-16-71l-139-85c-7.994-5.355-17.305-8-27-8z"/></svg>`,
            title: this.i18n.name || '媒体播放器',
            position: 'right',
            callback: (e: MouseEvent) => {
                const menu = new Menu();
                menu.addItem({ icon: 'iconSettings', label: this.i18n.settings?.title || '设置', click: () => this.openSettings() });
                menu.open({ x: e.clientX, y: e.clientY });
            }
        });
    }

    /** 打开设置面板 */
    private openSettings() { this.openSidebarTab('settings'); }

    /** 打开侧边栏标签页 */
    private openSidebarTab(tabId: string) {
        document.querySelector('.dock__item[aria-label*="媒体播放器"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        setTimeout(() => this.showTabContent(tabId, document.querySelector('.media-player-sidebar-content') as HTMLElement), 100);
    }

    /** 显示标签页内容，创建组件实例 */
    private async showTabContent(tabId: string, container: HTMLElement) {
        const components = { playlist: PlayList, tvbox: TVBox, assistant: Assistant, notes: Notes, settings: Setting };

        container.querySelectorAll('[data-tab-id]').forEach(el => el.classList.toggle('fn__none', el.getAttribute('data-tab-id') !== tabId));

        if (this.components.has(tabId)) {
            window.dispatchEvent(new CustomEvent('mediaPlayerTabActivate', { detail: { tabId } }));
            return;
        }

        const el = document.createElement('div');
        el.setAttribute('data-tab-id', tabId);
        container.appendChild(el);

        const component = components[tabId];
        if (!component) return;

        const baseProps = { config: await this.getConfig(), i18n: this.i18n, activeTabId: tabId, api: this.playerAPI, plugin: this };
        const specificProps = {
            playlist: { currentItem: this.playerAPI?.getCurrentMedia?.() },
            settings: { group: 'media-player' },
            assistant: {
                player: this.playerAPI,
                currentMedia: this.playerAPI?.getCurrentMedia?.(),
                insertContentCallback: async (content: any) => {
                    const { doc } = await import('./core/document');
                    doc.insert(content, await this.getConfig(), this.i18n);
                },
                createTimestampLinkCallback: this.playerAPI.createTimestampLink
            },
            notes: {}
        };

        const instance = new component({ target: el, props: { ...baseProps, ...specificProps[tabId] } });
        this.components.set(tabId, instance);

        const handlePlayEvent = async (event: CustomEvent<any>) => {
            const { playMediaItem, Media } = await import('./core/player');
            const item = event.detail;
            const isBili = item.source === 'B站' || item.type === 'bilibili' || item.bvid || item.url?.includes('bilibili.com') || item.isCourse;
            if (isBili) {
                const result = await Media.getMediaInfo(item.originalUrl || item.url, await this.getConfig());
                if (result.success && result.mediaItem)
                    return playMediaItem({ ...result.mediaItem, startTime: item.startTime, endTime: item.endTime }, item.startTime, item.endTime, () => this.getConfig(), () => this.openTab());
            }
            await playMediaItem(item, item.startTime, item.endTime, () => this.getConfig(), () => this.openTab());
        };

        const eventHandlers = {
            playlist: () => instance.$on?.('play', handlePlayEvent),
            tvbox: () => instance.$on?.('play', handlePlayEvent),
            settings: () => instance.$on?.('changed', (event: CustomEvent<any>) => window.dispatchEvent(new CustomEvent('updatePlayerConfig', { detail: event.detail.settings })))
        };
        eventHandlers[tabId]?.();

        window.dispatchEvent(new CustomEvent('mediaPlayerTabActivate', { detail: { tabId } }));
    }

    /** 移动端：创建全局悬浮按钮 */
    private createMobileFloatButton() {
        this.mobileFloatButton?.remove();
        this.mobileFloatButton = Object.assign(document.createElement('button'), {
            id: 'mobile-player-float-btn',
            innerHTML: '<svg viewBox="0 0 1024 1024" width="16" height="16"><path fill="currentColor" d="M753.265 105.112c12.57 12.546 12.696 32.81 0.377 45.512l-0.377 0.383-73.131 72.992L816 224c70.692 0 128 57.308 128 128v448c0 70.692-57.308 128-128 128H208c-70.692 0-128-57.308-128-128V352c0-70.692 57.308-128 128-128l136.078-0.001-73.13-72.992c-12.698-12.674-12.698-33.222 0-45.895 12.697-12.674 33.284-12.674 45.982 0l119.113 118.887h152.126l119.114-118.887c12.697-12.674 33.284-12.674 45.982 0zM457 440c-28.079 0-51 22.938-51 51v170c0 9.107 2.556 18.277 7 26 15.025 24.487 46.501 32.241 71 18l138-84c7.244-4.512 13.094-10.313 17-17 15.213-24.307 7.75-55.875-16-71l-139-85c-7.994-5.355-17.305-8-27-8z"/></svg>',
            onclick: async () => { try { if (!this.mobileManager?.isShowing()) await this.openTab(); this.mobileManager?.showNavbar(); } catch(e){} }
        });
        this.mobileFloatButton.style.cssText = 'position:fixed!important;bottom:16px!important;right:16px!important;width:44px!important;height:44px!important;background:var(--b3-theme-primary)!important;color:var(--b3-theme-on-primary)!important;border:none!important;border-radius:50%!important;box-shadow:0 2px 8px rgba(0,0,0,.15)!important;z-index:9997!important;cursor:pointer!important;display:flex!important;align-items:center!important;justify-content:center!important;transition:all .3s!important;';
        document.body.appendChild(this.mobileFloatButton);
    }

    /** 打开播放器标签页 */
    private async openTab() {
        const config = await this.getConfig();
        const plugin = this;

        // 移动端：MobileDialogManager
        if (this.isMobile()) {
            if (this.mobileManager?.isShowing()) return;
            this.mobileManager = new MobileDialogManager(this, this.i18n, this.playerAPI, () => this.getConfig());
            await this.mobileManager.show();
            return;
        }

        const openMode = config?.settings?.openMode || 'default';
        const tabType = config?.settings?.allowMultipleInstances ? `custom_tab_${Date.now()}` : "custom_tab";
        this.addTab({
            type: tabType,
            init() {
                const container = document.createElement("div");
                container.className = "media-player-container";

                const playerArea = document.createElement("div");
                playerArea.className = "player-area";

                const mediaPlayerTab = document.createElement("div");
                mediaPlayerTab.className = "media-player-tab";
                mediaPlayerTab.appendChild(document.createElement("div")).className = "content-area";
                mediaPlayerTab.querySelector('.content-area').appendChild(playerArea);
                container.appendChild(mediaPlayerTab);

                plugin.tabInstance = this;
                const getActiveComp = () => { const tvbox = plugin.components.get('tvbox'), playlist = plugin.components.get('playlist'); return (tvbox?.hasDetail?.() ? tvbox : null) || playlist; };
                const PlayerComponent = config.settings?.playerType === 'mpv' ? MPVPlayer : Player;
                plugin.components.set(tabType, new PlayerComponent({
                    target: playerArea,
                    props: { config: config.settings, i18n: plugin.i18n, currentItem: plugin.playerAPI?.getCurrentMedia?.(), api: plugin.playerAPI, playPrev: () => getActiveComp()?.playPrev?.(true), playNext: () => getActiveComp()?.playNext?.(true) }
                }));

                window.dispatchEvent(new CustomEvent('siyuanMediaPlayerUpdate', {
                    detail: { player: plugin.playerAPI, currentItem: plugin.playerAPI?.getCurrentMedia?.() }
                }));

                this.element.appendChild(container);
            },
            destroy() {
                const player = plugin.components.get(tabType);
                if (player?.$destroy) {
                    try { player.$destroy(); } catch (e) {}
                    plugin.components.delete(tabType);
                }
                if (tabType === 'custom_tab') plugin.tabInstance = null;
            }
        });

        const tabOptions: any = {
            app: this.app,
            custom: { icon: "siyuan-media-player-icon", title: this.i18n.name, id: this.name + tabType }
        };

        // 移动端适配：移动端不支持position参数
        if (!this.isMobile()) {
            if (openMode === 'right') tabOptions.position = 'right';
            else if (openMode === 'bottom') tabOptions.position = 'bottom';
        }
        // 画中画模式：正常打开标签页，播放器会自动启用画中画

        openTab(tabOptions);
    }

    /** 添加快捷键命令 */
    private addHotkeys() {
        const commands = {
            togglePlay: { text: this.i18n.hotkeys?.togglePlay, hotkey: '', callback: () => this.playerAPI.toggle() },
            seekForward: { text: this.i18n.hotkeys?.seekForward, hotkey: '', callback: () => this.playerAPI.seek(10) },
            seekBackward: { text: this.i18n.hotkeys?.seekBackward, hotkey: '', callback: () => this.playerAPI.seek(-10) },
            prevTrack: { text: this.i18n.hotkeys?.prevTrack, hotkey: '', callback: () => this.playerAPI.triggerAction('prev') },
            nextTrack: { text: this.i18n.hotkeys?.nextTrack, hotkey: '', callback: () => this.playerAPI.triggerAction('next') },
            increaseSpeed: { text: this.i18n.hotkeys?.increaseSpeed, hotkey: '', callback: () => this.playerAPI.increaseSpeed() },
            decreaseSpeed: { text: this.i18n.hotkeys?.decreaseSpeed, hotkey: '', callback: () => this.playerAPI.decreaseSpeed() },
            toggleCustomSpeed: { text: this.i18n.hotkeys?.toggleCustomSpeed, hotkey: '', callback: () => this.playerAPI.toggleCustomSpeed() },
            screenshot: { text: this.i18n.hotkeys?.screenshot, hotkey: '', callback: () => this.playerAPI.triggerAction('screenshot') },
            timestamp: { text: this.i18n.hotkeys?.timestamp, hotkey: '', callback: () => this.playerAPI.triggerAction('timestamp') },
            loopSegment: { text: this.i18n.hotkeys?.loopSegment, hotkey: '', callback: () => this.playerAPI.triggerAction('loopSegment') },
            mediaNotes: { text: this.i18n.hotkeys?.mediaNotes, hotkey: '', callback: () => this.playerAPI.triggerAction('mediaNotes') },
            openSidebar: { text: this.i18n.hotkeys?.openSidebar, hotkey: '', callback: () => document.querySelector('.dock__item[aria-label*="媒体播放器"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })) },};
        Object.entries(commands).forEach(([key, { text, hotkey, callback }]) => this.addCommand({ langKey: key, langText: text || key, hotkey, callback: () => (key !== 'openSidebar' && !this.playerAPI?.getCurrentMedia?.()) ? (showMessage(this.i18n.openPlayer), this.openTab()) : callback() }));
        
        // 输入链接播放
        this.addCommand({ langKey: 'playFromURL', langText: '输入链接播放', hotkey: '', callback: () => {
            const d = new Dialog({ title: '🎬 播放媒体', content: `<div class="b3-dialog__content"><input class="b3-text-field fn__block" placeholder="输入媒体链接"></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel">取消</button><button class="b3-button b3-button--text">确定</button></div>`, width: '520px' });
            const i = d.element.querySelector('input') as HTMLInputElement, p = () => { const u = i.value.trim(); if (u) { this.eventBus.emit('playMediaItem' as any, { detail: { url: u, title: u.split('/').pop() || '播放' } }); d.destroy(); } };
            i.addEventListener('keydown', e => e.key === 'Enter' && p()); d.element.querySelectorAll('button')[1].addEventListener('click', p); setTimeout(() => i.focus(), 100);
        }});
    }

    /** 调试日志输出 */
    static outlog(..._args: any[]) {
        // 可根据需要启用调试输出
        // console.log(..._args);
    }
}