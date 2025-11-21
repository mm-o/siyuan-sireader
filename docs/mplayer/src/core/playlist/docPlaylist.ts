/**
 * 文档模式播放列表
 * 存储：子块+自定义属性 custom-playlist-tags（格式："标签|状态|描述"，状态=视图+排序+钉住）
 * 功能：load/add/del/move/ensure/deleteTag/renameTag/reorder（完全对齐数据库模式）
 */
import * as API from '../../api';
import { linkPlain, imageToLocalAsset } from '../document';
import { Media } from '../player';
import type { MediaItem } from '../types';

// 获取绑定文档ID
export const getBoundDocId = async (config: any): Promise<string> => {
  const acc = (config.settings?.playlistdbAccounts || []).find((a: any) => a.active);
  const source = acc?.source || config?.settings?.playlistSource;
  if (source !== 'document') return '';
  const bound = acc?.boundDoc || config?.settings?.playlistBoundDoc || {};
  let id: string = bound?.id || '';
  if (!/^\d{14}-[a-z0-9]{7}$/i.test(id || '')) {
    const nb = bound?.notebook, p = bound?.path;
    if (nb && p) {
      try {
        const ids = await API.getIDsByHPath(nb, `/${p}`);
        id = ids?.[0] || '';
      } catch {}
    }
  }
  return id;
};

// 标签列表操作（格式："标签|状态|描述"）
const parseTag = (t: string) => { const [name, state = 'dn', desc = ''] = t.split('|'); return { name, view: state[0] || 'd', sortMode: (state[1] || 'n').toLowerCase(), sortDesc: state[1] === state[1]?.toUpperCase(), pinned: state.includes('p'), description: desc }; };
const getTags = async (docId: string) => { try { return JSON.parse((await API.sql(`SELECT value FROM attributes WHERE block_id='${docId}' AND name='custom-playlist-tags'`).catch(() => []))?.[0]?.value || '[]'); } catch { return []; } };
const saveTags = async (docId: string, tags: string[]) => await API.setBlockAttrs(docId, { 'custom-playlist-tags': JSON.stringify(tags) }).catch(() => {});

export const readTagsWithState = async (docId: string): Promise<any[]> => (await getTags(docId)).map(parseTag);
const ensureTagInList = async (docId: string, tagName: string, desc = '', pinned = true) => {
  const tags = await getTags(docId), idx = tags.findIndex((t: string) => t.split('|')[0] === tagName);
  if (idx === -1) tags.push(`${tagName}|dn${pinned ? 'p' : ''}${desc ? '|' + desc : ''}`);
  else if (desc || pinned !== undefined) { const [name, state, oldDesc] = tags[idx].split('|'); tags[idx] = `${name}|${(state?.replace(/p/g, '') || 'dn')}${pinned ? 'p' : ''}${(desc || oldDesc) ? '|' + (desc || oldDesc) : ''}`; }
  if (idx === -1 || desc || pinned !== undefined) await saveTags(docId, tags);
};
const updateTagState = async (docId: string, tagName: string, state: any) => {
  const tags = await getTags(docId), idx = tags.findIndex((t: string) => t.split('|')[0] === tagName);
  if (idx < 0) return;
  const [name, , desc] = tags[idx].split('|'), v = state.view?.[0] || 'd', s = (state.sortMode || 'n')[0], sc = state.sortDesc ? s.toUpperCase() : s;
  tags[idx] = `${name}|${v}${sc}${state.pinned || tags[idx].includes('p') ? 'p' : ''}${desc ? '|' + desc : ''}`;
  await saveTags(docId, tags);
};

// 加载标签列表
export const loadDocTags = async (docId: string): Promise<string[]> => {
  const tags = await readTagsWithState(docId);
  if (!tags.length) { await saveTags(docId, ['默认|dn']); return ['默认']; }
  return tags.filter(t => t.name === '默认' || t.pinned).map(t => t.name);
};

// 加载标签下的媒体项（分批查询避免思源SQL结果64条限制）
export const loadDocItems = async (docId: string, tagName: string): Promise<any[]> => {
  const rows = await API.sql(`SELECT a.block_id,b.sort FROM attributes a JOIN blocks b ON a.block_id=b.id WHERE b.root_id='${docId}' AND a.name='custom-playlist' AND a.value LIKE '%"${tagName.replace(/"/g,'\\"')}%' ORDER BY b.sort`).catch(() => []);
  const blockIds = (rows || []).map((r: any) => r.block_id);
  if (!blockIds.length) return [];
  
  const byBlock: Record<string, Record<string,string>> = {};
  for (let i = 0; i < blockIds.length; i += 5) {
    const ids = blockIds.slice(i, i + 5).map(id => `'${id}'`).join(',');
    const attrsRows = await API.sql(`SELECT block_id,name,value FROM attributes WHERE block_id IN (${ids}) AND name IN ('custom-title','custom-url','custom-artist','custom-artisticon','custom-thumbnail','custom-duration','custom-source','custom-type','custom-playlist')`).catch(() => []);
    (attrsRows || []).forEach((r: any) => ((byBlock[r.block_id] ||= {})[r.name] = r.value));
  }
  
  return blockIds.map(bid => {
    const a = byBlock[bid] || {}, tags = (() => { try { return JSON.parse(a['custom-playlist'] || '[]'); } catch { return []; } })();
    return { id: bid, title: a['custom-title'] || '未知标题', url: a['custom-url'] || '', originalUrl: a['custom-url'] || '',
      type: a['custom-type'] || 'video', source: a['custom-source'] || 'standard',
      thumbnail: a['custom-thumbnail'] || Media.getThumbnail({ type: a['custom-type'] || 'video' }),
      artist: a['custom-artist'] || '', artistIcon: a['custom-artisticon'] || '', duration: a['custom-duration'] || '',
      _tags: Array.isArray(tags) && tags.length ? tags : ['默认'] };
  });
};

// 添加媒体项（去重+图片assets化）
export const addDocItem = async (docId: string, media: any, playlist: string, config: any): Promise<void> => {
  const url = media?.url || '';
  if (url) {
    const dup = await API.sql(`SELECT a.block_id FROM attributes a JOIN blocks b ON a.block_id=b.id WHERE b.root_id='${docId}' AND a.name='custom-url' AND a.value='${url.replace(/'/g, "''")}' `).catch(() => []);
    if (dup?.length) return;
  }
  let item = media as MediaItem;
  if (!item?.title || !item?.thumbnail || !item?.type) {
    const r = await Media.getMediaInfo(url, config);
    if (!r.success || !r.mediaItem) throw new Error(r.error || '无法解析媒体链接');
    item = r.mediaItem as any;
  }
  if (item.thumbnail) item.thumbnail = await imageToLocalAsset(item.thumbnail);
  if (item.artistIcon) item.artistIcon = await imageToLocalAsset(item.artistIcon);
  const content = await linkPlain(item, config);
  const before = await API.getChildBlocks(docId).then(list => new Set((list||[]).map(b=>b.id))).catch(()=>new Set<string>());
  await API.appendBlock('markdown', content, docId);
  const after = await API.getChildBlocks(docId).catch(()=>[] as any[]);
  const bid = (after || []).map(b=>b.id).find(id => !before.has(id)) || '';
  if (!bid) return;
  await API.setBlockAttrs(bid, {
    'custom-media': 'playlist-link', 'custom-title': item.title || Media.getTitle(item.url),
    'custom-url': item.originalUrl || item.url, 'custom-artist': item.artist || '',
    'custom-artisticon': item.artistIcon || '', 'custom-thumbnail': item.thumbnail || '',
    'custom-duration': item.duration || '', 'custom-source': item.source || 'standard',
    'custom-type': item.type || 'video', 'custom-playlist': JSON.stringify([playlist || '默认']),
    'custom-created': String(Date.now())
  });
  await ensureTagInList(docId, playlist || '默认');
};

// 批量添加媒体项（分批并发+容错）
export const batchAddDocItems = async (docId: string, mediaList: any[], playlist: string, config: any, onProgress?: (current: number, total: number, success: number, failed: number) => void): Promise<{ success: number; failed: number; errors: string[] }> => {
  let success = 0, failed = 0;
  const errors: string[] = [], BATCH = 10;
  for (let i = 0; i < mediaList.length; i += BATCH) {
    const batch = mediaList.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(item => addDocItem(docId, item, playlist, config)));
    results.forEach((r, idx) => r.status === 'fulfilled' ? success++ : (failed++, errors.push(batch[idx]?.title || batch[idx]?.url || `项目${i + idx + 1}：${(r as any).reason?.message}`)));
    onProgress?.(Math.min(i + BATCH, mediaList.length), mediaList.length, success, failed);
    if (i + BATCH < mediaList.length) await new Promise(resolve => setTimeout(resolve, 100));
  }
  return { success, failed, errors };
};

// 删除媒体项
const getBlockId = async (docId: string, attr: string, value: string) => (await API.sql(`SELECT a.block_id FROM attributes a JOIN blocks b ON a.block_id=b.id WHERE b.root_id='${docId}' AND a.name='${attr}' AND a.value='${value.replace(/'/g, "''")}' `).catch(() => []))?.[0]?.block_id;
export const delDocItem = async (docId: string, opts: { title?: string; tagName?: string }): Promise<void> => {
  if (opts.tagName && !opts.title) {
    const rows = await API.sql(`SELECT a.block_id,a.value FROM attributes a JOIN blocks b ON a.block_id=b.id WHERE b.root_id='${docId}' AND a.name='custom-playlist' AND a.value LIKE '%"${opts.tagName.replace(/"/g,'\\"')}%'`).catch(() => []);
    for (const r of rows || []) try { const arr = JSON.parse(r.value || '[]').filter((t: string) => t !== opts.tagName); await API.setBlockAttrs(r.block_id, { 'custom-playlist': JSON.stringify(arr.length ? arr : ['默认']) }); } catch {}
  } else if (opts.title) { const id = await getBlockId(docId, 'custom-title', opts.title); if (id) await API.deleteBlock(id).catch(() => {}); }
};

// 移动媒体项
export const moveDocItem = async (docId: string, title: string, newPlaylist: string): Promise<void> => {
  const id = await getBlockId(docId, 'custom-title', title);
  if (id) { await API.setBlockAttrs(id, { 'custom-playlist': JSON.stringify([newPlaylist]) }); await ensureTagInList(docId, newPlaylist); }
};

// 重命名标签
export const renameDocTag = async (docId: string, oldName: string, newName: string): Promise<void> => {
  const rows = await API.sql(`SELECT a.block_id,a.value FROM attributes a JOIN blocks b ON a.block_id=b.id WHERE b.root_id='${docId}' AND a.name='custom-playlist' AND a.value LIKE '%"${oldName.replace(/"/g,'\\"')}%'`).catch(() => []);
  for (const r of rows || []) try { const arr = JSON.parse(r.value || '[]'), idx = arr.indexOf(oldName); if (idx > -1) { arr[idx] = newName.trim(); await API.setBlockAttrs(r.block_id, { 'custom-playlist': JSON.stringify(arr) }); } } catch {}
  const tags = await getTags(docId), idx = tags.findIndex((t: string) => t.split('|')[0] === oldName);
  if (idx > -1) { const parts = tags[idx].split('|'); parts[0] = newName.trim(); await saveTags(docId, [...tags.slice(0, idx), parts.join('|'), ...tags.slice(idx + 1)]); }
};

// 删除标签
export const deleteDocTag = async (docId: string, tagName: string): Promise<void> => {
  const ids = (await API.sql(`SELECT a.block_id FROM attributes a JOIN blocks b ON a.block_id=b.id WHERE b.root_id='${docId}' AND a.name='custom-playlist' AND a.value LIKE '%"${tagName.replace(/"/g,'\\"')}%'`).catch(() => [])).map((r: any) => r.block_id);
  for (const id of ids) await API.deleteBlock(id).catch(() => {});
  await saveTags(docId, (await getTags(docId)).filter((t: string) => t.split('|')[0] !== tagName));
};

// 媒体项排序（块移动）
export const reorderDocItems = async (docId: string, curId: string, prevId: string) => 
  await API.moveBlock(curId, prevId || null, docId);

// 刷新文档标签（完整逻辑）
export const refreshDocTag = async (docId: string, tagName: string, helpers: { 
  browse: (type: string, path: string) => Promise<void>; 
  getItems: () => any[];
  cfg: () => Promise<any>;
}): Promise<{ desc: string; currentItems: any[]; newUrls: string[]; error?: string }> => {
  const tags = await readTagsWithState(docId);
  const tagInfo = tags.find(t => t.name === tagName);
  const desc = tagInfo?.description || '';
  const currentItems = await loadDocItems(docId, tagName);
  
  if (!desc) return { desc: '', currentItems, newUrls: [], error: '该标签无刷新信息' };
  
  let newUrls: string[] = [];
  
  // 思源空间
  if (desc.startsWith('siyuan:')) {
    await helpers.browse('siyuan', desc.substring(7));
    newUrls = helpers.getItems().filter(i => !i.is_dir).map(i => i.originalUrl || i.url);
  }
  // 本地文件夹
  else if (desc.startsWith('local:')) {
    await helpers.browse('folder', desc.substring(6));
    newUrls = helpers.getItems().filter(i => !i.is_dir).map(i => i.url);
  }
  
  return { desc, currentItems, newUrls };
};

// Provider
export type DocProviderDeps = {
  cfg: () => Promise<any>; plugin: any; getTab: () => string; getTags?: () => string[];
  setTags: (tags: string[]) => void; setItems: (items: any[]) => void; getItems: () => any[];
  applySort: (items: any[]) => any[]; toast?: (msg: string) => void;
  getState?: () => any; connect?: (type: string, tag: string, path: string, desc: string) => Promise<void>;
};

export const createDocProvider = (deps: DocProviderDeps, docId: string, config: any) => {
  return {
    load: async () => {
      if (!docId) { deps.setItems([]); deps.setTags(['目录', '默认']); return; }
      const pinnedTags = await loadDocTags(docId);
      deps.setTags(['目录', ...pinnedTags.filter(t => t !== '目录')]);
      if (deps.getTab() === '目录') {
        const tagsWithState = await readTagsWithState(docId);
        const allTagNames = tagsWithState.map(t => t.name);
        deps.setItems(allTagNames.map(t => { const info = tagsWithState.find(ts => ts.name === t); return { id: `dir-${t}`, title: t, type: 'folder', url: '#', source: 'directory', targetTabId: t, is_dir: true, thumbnail: Media.getThumbnail({ type: 'folder' }), pinned: info?.pinned || false }; }));
      } else {
        const tab = deps.getTab();
        const tags = await readTagsWithState(docId);
        const tagInfo = tags.find(t => t.name === tab);
        const desc = tagInfo?.description || '';
        // 文件夹/云盘类型：直接browse
        if (desc && deps.connect && deps.getState) {
          const state = deps.getState();
          if (desc.startsWith('local:')) {
            if (state.folder?.type !== 'folder' || !state.folder?.connected) 
              return await deps.connect('folder', tab, desc.substring(6), desc);
          } else if (desc.startsWith('siyuan:')) {
            if (state.folder?.type !== 'siyuan' || !state.folder?.connected)
              return await deps.connect('siyuan', tab, desc.substring(7), desc);
          } else if (desc.match(/^(webdav|openlist|alidrive|baidudrive|pan123|quarktv|s3):/)) {
            const type = desc.match(/^(webdav|openlist|alidrive|baidudrive|pan123|quarktv|s3):/)[1];
            if (state.folder?.type !== type || !state.folder?.connected)
              return await deps.connect(type, tab, desc.split('|')[1] || '/', desc);
          }
        }
        // 普通标签：加载数据库媒体项
        const items = await loadDocItems(docId, tab);
        deps.setItems(deps.applySort(items));
      }
    },
    add: async ({ media, playlist = '默认' }: any) => {
      if (!docId) return;
      await addDocItem(docId, media, playlist, config);
    },
    batchAdd: async ({ mediaList, playlist = '默认', onProgress }: any) => {
      if (!docId) return { success: 0, failed: 0, errors: [] };
      return await batchAddDocItems(docId, mediaList, playlist, config, onProgress);
    },
    del: async ({ title, tagName }: any) => { if (docId) await delDocItem(docId, { title, tagName }); },
    move: async ({ title, newPlaylist }: any) => {
      if (!docId) return;
      await moveDocItem(docId, title, newPlaylist); deps.toast?.(`已移动到"${newPlaylist}"`);
    },
    ensure: async ({ tagName, description, pinned }: any) => {
      if (!tagName || !docId) return;
      await ensureTagInList(docId, tagName, description || '', pinned !== false);
    },
    deleteTag: async ({ tagName }: any) => {
      if (tagName === '默认') return deps.toast?.('不能删除默认标签');
      if (!docId) return;
      await deleteDocTag(docId, tagName); deps.toast?.(`已删除标签"${tagName}"`);
    },
    renameTag: async ({ oldName, newName }: any) => {
      if (oldName === '默认') return deps.toast?.('不能重命名默认标签');
      if (!newName?.trim()) return deps.toast?.('新标签名不能为空');
      if (!docId) return;
      await renameDocTag(docId, oldName, newName); deps.toast?.(`已将标签"${oldName}"重命名为"${newName}"`);
    },
    reorder: async ({ type, draggedItem }: any) => {
      if (!docId) return;
      if (type === 'items' && draggedItem) {
        const items = deps.getItems(), idx = items.findIndex((i: any) => i.title === draggedItem.title);
        if (idx >= 0 && items[idx]?.id) {
          const curId = items[idx].id;
          const prevId = idx > 0 ? items[idx - 1].id : '';
          await reorderDocItems(docId, curId, prevId);
        }
      } else if (type === 'tags') {
        const tagStates = await getTags(docId), currentTags = (deps.getTags?.() || []).filter(t => t !== '目录');
        await saveTags(docId, currentTags.map(name => tagStates.find((t: string) => t.split('|')[0] === name) || `${name}|dn`));
      }
    }
  } as const;
};

// 视图状态管理
const getDocId = async (cfg: any) => { const acc = (cfg.settings?.playlistdbAccounts || []).find((a: any) => a.active); return (acc?.source || cfg.settings?.playlistSource) === 'document' ? await getBoundDocId(cfg) : ''; };
export const loadDocViewState = async (deps: DocProviderDeps): Promise<boolean> => {
  const docId = await getDocId(await deps.cfg()); if (!docId) return false;
  const vs = (await readTagsWithState(docId)).find(t => t.name === deps.getTab());
  if (vs?.view && deps.getState) { const s = deps.getState(); Object.assign(s, { view: { d: 'detailed', c: 'compact', g: 'grid' }[vs.view] || 'detailed', sortMode: vs.sortMode, sortDesc: vs.sortDesc, exp: vs.exp }); return true; }
  return false;
};
export const saveDocViewState = async (deps: DocProviderDeps): Promise<boolean> => {
  const docId = await getDocId(await deps.cfg()); if (!docId || !deps.getState) return false;
  await updateTagState(docId, deps.getTab(), deps.getState()); return true;
};

// Router (不自动reload，由PlayList.svelte统一处理)
export const routeDocOp = async (deps: DocProviderDeps, action: string, params: any): Promise<boolean | any> => {
  const c = await deps.cfg(), docId = await getDocId(c); if (!docId) return false;
  const p = createDocProvider(deps, docId, c);
  const ops: Record<string, () => Promise<any>> = { load: p.load, add: () => p.add(params), batchAdd: () => p.batchAdd(params), del: () => p.del(params), move: () => p.move(params), ensure: () => p.ensure(params), deleteTag: () => p.deleteTag(params), renameTag: () => p.renameTag(params), reorder: () => p.reorder(params) };
  return ops[action] ? await ops[action]() : false;
};

// 兼容旧名称
export const routeDocDataOp = routeDocOp;
