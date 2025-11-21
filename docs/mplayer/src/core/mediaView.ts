import * as API from '../api';
import { showMessage } from 'siyuan';

let pluginInstance: any = null;
const inlinePlayers = new Map<string, any>();
let mediaBlockClickHandler: ((e: MouseEvent) => Promise<void>) | null = null;

// 菜单配置
const MENU_STYLES = [
  { icon: 'iconLink', key: 'default', label: '默认', value: '' },
  { icon: 'iconEmbed', key: 'border', label: '边框样式', value: 'border' },
  { icon: 'iconGallery', key: 'card', label: '卡片样式', value: 'card' },
  { icon: 'iconImage', key: 'thumb', label: '封面样式', value: 'thumb' },
  { icon: 'siyuan-media-player-icon', key: 'player', label: '播放样式', value: 'player' }
];
const MENU_SIZES = [
  { icon: 'iconContract', key: 'small', label: '小', value: 'small' },
  { icon: 'iconFullscreen', key: 'medium', label: '中', value: '' },
  { icon: 'iconExpand', key: 'large', label: '大', value: 'large' }
];

// 清理播放器实例
const cleanupPlayer = (blockId: string) => {
  const playerId = 'player-' + blockId;
  inlinePlayers.get(playerId)?.$destroy?.();
  inlinePlayers.delete(playerId);
};

// 视频/音频块点击监听
const initMediaBlockClick = (getConfigFn: () => Promise<any>, openTabFn: () => Promise<void>) => {
  mediaBlockClickHandler = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const mediaBlock = target.closest('div[data-type="NodeVideo"], div[data-type="NodeAudio"]');
    if (!mediaBlock || target.closest('.protyle-action__drag')) return;
    
    const mediaEl = mediaBlock.querySelector('video, audio') as HTMLVideoElement;
    if (!mediaEl) return;
    
    let mediaUrl = mediaEl.src || mediaEl.currentSrc || mediaEl.querySelector('source')?.src;
    if (!mediaUrl) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const blockType = mediaEl.tagName.toLowerCase() as 'video' | 'audio';
    const fileName = mediaUrl.replace(/^file:\/\/\/?/, '').split(/[/\\]/).pop() || (blockType === 'video' ? '视频' : '音频');
    
    const { playMediaItem } = await import('./player');
    await playMediaItem({ url: mediaUrl, title: fileName, type: blockType, originalUrl: mediaUrl }, undefined, undefined, getConfigFn, openTabFn);
  };
  
  window.addEventListener('click', mediaBlockClickHandler, true);
  return () => mediaBlockClickHandler && (window.removeEventListener('click', mediaBlockClickHandler, true), mediaBlockClickHandler = null);
};

// 初始化媒体块视图：菜单+事件+自动渲染
export const initMediaBlockMenu = (plugin: any) => {
  pluginInstance = plugin;
  const cleanupClick = initMediaBlockClick(plugin.getConfig, plugin.openTab);
  const menuListener = (e: CustomEvent<any>) => {
    const { menu, blockElements, protyle } = e.detail || {};
    if (!menu) return;
    
    const i18n = plugin.i18n?.mediaView || {};
    const block = blockElements?.[0];
    const isTitleMenu = block?.classList?.contains('protyle-title') || block?.querySelector('.protyle-title');
    
    // 批量转换菜单
    if (isTitleMenu || (protyle && !block?.getAttribute('custom-url'))) {
      const docId = (protyle?.element || document.querySelector('.protyle:not(.fn__none)'))?.querySelector('.protyle-title')?.dataset?.nodeId || protyle?.block?.rootID;
      return docId && menu.addItem({
        icon: 'siyuan-media-player-icon',
        label: i18n.batchTitle || '批量转换媒体样式',
        submenu: MENU_STYLES.map(s => ({ icon: s.icon, label: i18n[s.key] || s.label, click: () => batchSetView(docId, s.value) }))
      });
    }
    
    // 单个媒体块菜单
    const blockId = block?.dataset?.nodeId;
    if (!blockId || !block.getAttribute('custom-url')) return;
    
    const [view, size] = [block.getAttribute('custom-media-view') || '', block.getAttribute('custom-media-size') || ''];
    
    menu.addItem({
      icon: 'siyuan-media-player-icon',
      label: i18n.title || '媒体样式',
      submenu: MENU_STYLES.map(s => ({ icon: s.icon, label: i18n[s.key] || s.label, click: () => setView(blockId, s.value), current: view === s.value }))
    });
    
    view && view !== 'border' && menu.addItem({
      icon: 'iconFullscreen',
      label: i18n.size || '尺寸',
      submenu: MENU_SIZES.map(s => ({ icon: s.icon, label: i18n[s.key] || s.label, click: () => setSize(blockId, s.value), current: size === s.value }))
    });
  };
  const renderListener = () => setTimeout(renderAllMediaBlocks, 200);
  plugin.eventBus.on('click-blockicon', menuListener);
  plugin.eventBus.on('click-editortitleicon', menuListener);
  plugin.eventBus.on('loaded-protyle-static', renderListener);
  return () => {
    cleanupClick();
    plugin.eventBus.off('click-blockicon', menuListener);
    plugin.eventBus.off('click-editortitleicon', menuListener);
    plugin.eventBus.off('loaded-protyle-static', renderListener);
  };
};

const batchSetView = async (docId: string, view: string) => {
  const startTime = performance.now();
  
  try {
    const rows = await API.sql(`SELECT block_id FROM attributes WHERE name='custom-url' AND block_id IN (SELECT id FROM blocks WHERE root_id='${docId}')`);
    const blockIds = (rows || []).map((r: any) => r.block_id);
    if (!blockIds.length) return showMessage('当前文档未找到媒体块', 3000, 'info');
    
    // 清理所有overlay和播放器（批量100个/次）
    for (let i = 0; i < blockIds.length; i += 100) {
      document.querySelectorAll(blockIds.slice(i, i + 100).map(id => `[data-node-id="${id}"]`).join(',')).forEach(block => {
        block.querySelectorAll('.media-view-overlay, .media-player-container').forEach(el => el.remove());
        const blockId = block.getAttribute('data-node-id');
        blockId && (cleanupPlayer(blockId), block.removeAttribute('data-inline-player'));
      });
    }
    
    // 分批设置属性（每批10个，带容错）
    for (let i = 0; i < blockIds.length; i += 10) {
      await Promise.allSettled(blockIds.slice(i, i + 10).map(id => API.setBlockAttrs(id, { 'custom-media-view': view || '' })));
      const progress = Math.min(100, Math.round(((i + 10) / blockIds.length) * 100));
      progress < 100 && showMessage(`⏳ 转换中... ${progress}%`, 1000, 'info');
      await new Promise(resolve => setTimeout(resolve, 50)); // 批次间延迟
    }
    
    setTimeout(renderAllMediaBlocks, 100);
    showMessage(`✅ 已批量转换 ${blockIds.length} 个媒体块 (${((performance.now() - startTime) / 1000).toFixed(2)}秒)`, 3000, 'info');
  } catch (e) {
    console.error('批量转换失败:', e);
    showMessage('❌ 批量转换失败', 3000, 'error');
  }
};

const setSize = async (blockId: string, size: string) => API.setBlockAttrs(blockId, { 'custom-media-size': size || '' });

const setView = async (blockId: string, view: string) => {
  const block = document.querySelector(`[data-node-id="${blockId}"]`);
  if (!block) return;
  
  block.querySelectorAll('.media-view-overlay, .media-player-container').forEach(el => el.remove());
  cleanupPlayer(blockId);
  block.removeAttribute('data-inline-player');
  await API.setBlockAttrs(blockId, { 'custom-media-view': view || '' });
  
  if (view && view !== 'border' && !block.getAttribute('custom-media-size')) {
    const defaultSize = (await pluginInstance?.getConfig?.())?.settings?.mediaViewSize;
    defaultSize && await API.setBlockAttrs(blockId, { 'custom-media-size': defaultSize });
  }
  view && view !== 'border' && renderOverlay(block, await API.getBlockAttrs(blockId));
};

const renderOverlay = (block: Element, attrs: any) => {
  const { 'custom-media-view': view, 'custom-thumbnail': thumb, 'custom-artist': artist, 'custom-duration': duration, 'custom-title': customTitle } = attrs;
  const link = block.querySelector('span[data-type="a"], a[href], [data-href], span[data-type="url"]') as HTMLElement;
  const title = customTitle || link?.textContent?.trim() || '未知';
  const overlay = Object.assign(document.createElement('div'), { className: 'media-view-overlay' });
  const meta = (content?: string) => content ? `<div class="media-meta">${content}</div>` : '';
  
  overlay.innerHTML = {
    card: `${thumb ? `<img src="${thumb}" class="media-thumb" />` : ''}<div class="media-details"><div class="media-title">${title}</div>${meta(artist)}${meta(duration)}</div>`,
    thumb: `<div class="media-poster" style="background-image:url(${thumb})"><div class="media-overlay"><div class="media-title">${title}</div></div>${duration ? `<span class="media-badge">${duration}</span>` : ''}</div>`,
    player: `<div class="media-player-container" id="player-${block.getAttribute('data-node-id')}"><div class="media-player-poster" style="background-image:url(${thumb})"><div class="media-player-play"></div><div class="media-player-info"><div class="media-title">${title}</div>${meta(artist)}</div></div></div>`
  }[view as 'card' | 'thumb' | 'player'] || '';
  
  overlay.onclick = view === 'player' ? (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const playerId = 'player-' + block.getAttribute('data-node-id');
    block.setAttribute('data-inline-player', playerId);
    overlay.onclick = null;
    (overlay.querySelector('.media-player-poster') as HTMLElement)!.style.opacity = '0.6';
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  } : () => link?.click();
  
  block.insertBefore(overlay, block.firstChild);
};

export const initInlinePlayer = async (containerId: string, mediaItem: any, getConfig: () => Promise<any>, i18n: any) => {
  cleanupPlayer(containerId.replace('player-', ''));
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  const { default: Player } = await import('../components/Player.svelte');
  const player = new Player({
    target: container,
    props: { config: { ...(await getConfig()).settings, inlineMode: true }, i18n, api: { getConfig }, playPrev: undefined, playNext: undefined }
  });
  
  inlinePlayers.set(containerId, player);
  setTimeout(async () => (await import('./player')).playMediaItem({ ...mediaItem, _inlinePlayerId: containerId }, mediaItem.startTime, mediaItem.endTime, getConfig, undefined), 150);
  return player;
};

export const renderAllMediaBlocks = async () => {
  const blocks = document.querySelectorAll('[custom-media-view]:not([custom-media-view=""])[custom-url]');
  for (const block of blocks) {
    const view = block.getAttribute('custom-media-view');
    if (view === 'border' || block.querySelector('.media-view-overlay')) continue;
    const blockId = block.getAttribute('data-node-id');
    blockId && await API.getBlockAttrs(blockId).then(attrs => renderOverlay(block, attrs)).catch(() => {});
  }
};

export const addMediaToBlock = async (blockId: string, url: string, config: any) => {
  try {
    const { Media } = await import('./player'), { imageToLocalAsset, linkPlain } = await import('./document'), result = await Media.getMediaInfo(url, config);
    if (!result.success || !result.mediaItem) return;
    const item = result.mediaItem, thumbnail = item.thumbnail ? await imageToLocalAsset(item.thumbnail) : '';
    await API.updateBlock('markdown', await linkPlain(item, config), blockId);
    await API.setBlockAttrs(blockId, { 'custom-media': 'playlist-link', 'custom-url': item.originalUrl || item.url, 'custom-title': item.title || Media.getTitle(item.url), 'custom-thumbnail': thumbnail, 'custom-artist': item.artist || '', 'custom-duration': item.duration || '', 'custom-source': item.source || 'standard', 'custom-type': item.type || 'video' });
    const view = config?.settings?.mediaViewStyle;
    view && view !== '' && (await API.setBlockAttrs(blockId, { 'custom-media-view': view }), setTimeout(renderAllMediaBlocks, 200));
  } catch {}
};

export const showMediaInput = async (blockId: string, rect: DOMRect, getConfig: () => Promise<any>) => {
  const cfg = await getConfig();
  let selectedStyle = cfg?.settings?.mediaViewStyle || '';
  const styles = [['', '默认'], ['border', '边框'], ['card', '卡片'], ['thumb', '封面'], ['player', '播放']];
  const box = Object.assign(document.createElement('div'), { innerHTML: `<input class="b3-text-field" placeholder="粘贴链接或BV号，选择样式后回车添加" style="width:360px;margin:0 0 8px"/><div style="display:flex;background:var(--b3-theme-surface);border-radius:6px;padding:2px;gap:2px">${styles.map(([v, l]) => `<button data-style="${v}" title="${MENU_STYLES.find(s => s.value === v)?.label || l}" style="flex:1;height:28px;padding:4px 8px;border:none;border-radius:4px;font-size:12px;cursor:pointer;transition:all 0.15s;background:${v === selectedStyle ? 'var(--b3-theme-background)' : 'transparent'};color:${v === selectedStyle ? 'var(--b3-theme-on-background)' : 'var(--b3-theme-on-surface)'};font-weight:${v === selectedStyle ? '500' : '400'};box-shadow:${v === selectedStyle ? 'var(--b3-point-shadow)' : 'none'}">${l}</button>`).join('')}</div>` });
  box.style.cssText = `position:fixed;z-index:9999;top:${rect.bottom + 4}px;left:${rect.left}px;box-shadow:var(--b3-dialog-shadow);background:var(--b3-theme-background);border-radius:var(--b3-border-radius);padding:12px`;
  document.body.appendChild(box);
  const input = box.querySelector('input') as HTMLInputElement;
  box.querySelectorAll('button').forEach(btn => { btn.addEventListener('mouseenter', () => { if (btn.dataset.style !== selectedStyle) btn.style.background = 'var(--b3-theme-background-light)'; }); btn.addEventListener('mouseleave', () => { if (btn.dataset.style !== selectedStyle) btn.style.background = 'transparent'; }); btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); selectedStyle = btn.dataset.style || ''; box.querySelectorAll('button').forEach(b => { const isSelected = (b.dataset.style || '') === selectedStyle; b.style.background = isSelected ? 'var(--b3-theme-background)' : 'transparent'; b.style.color = isSelected ? 'var(--b3-theme-on-background)' : 'var(--b3-theme-on-surface)'; b.style.fontWeight = isSelected ? '500' : '400'; b.style.boxShadow = isSelected ? 'var(--b3-point-shadow)' : 'none'; }); }); });
  input.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { const urls = input.value.trim().split(/[\s\n,]+/).filter(u => u).map(u => u.match(/^BV[a-zA-Z0-9]+$/) ? `https://www.bilibili.com/video/${u}` : u); urls.length && (box.remove(), await Promise.all(urls.map(url => addMediaToBlock(blockId, url, { ...cfg, settings: { ...cfg.settings, mediaViewStyle: selectedStyle } })))); } else if (e.key === 'Escape') box.remove(); });
  input.addEventListener('blur', () => setTimeout(() => box.remove(), 300));
  setTimeout(() => input.focus(), 10);
};
