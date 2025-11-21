/**
 * 数据库模式播放列表
 * 存储：思源属性视图（Database）
 * 功能：完整的CRUD操作，对齐文档模式架构
 */
// import * as API from '../../api'; // 未使用，已移除
import { imageToLocalAsset } from '../document';
import { Media } from '../player';

// 依赖接口
export interface DatabaseProviderDeps {
    cfg: () => Promise<any>;
    plugin: any;
    getTab: () => string;
    getTags: () => string[];
    setTags: (tags: string[]) => void;
    getItems: () => any[];
    setItems: (items: any[]) => void;
    applySort: (items: any[]) => any[];
    toast: (msg: string, duration?: number, type?: string) => void;
    getState?: () => any;
}

// 字段映射常量
const FIELDS = {
    title: '媒体标题',
    url: 'URL',
    duration: '时长',
    playlist: '所在标签',
    source: '来源',
    type: '类型',
    artist: '艺术家',
    thumbnail: '封面图',
    artistIcon: '艺术家头像',
    created: '创建时间'
};

const FIELD_DEFS = {
    source: { type: 'select', options: [['B站', '4'], ['本地', '6'], ['OpenList', '3'], ['WebDAV', '5'], ['阿里云盘', '7'], ['百度网盘', '8'], ['123云盘', '9'], ['夸克TV', '10'], ['S3存储', '12'], ['思源', '11']] },
    title: { type: 'text' },
    url: { type: 'url' },
    artist: { type: 'text' },
    artistIcon: { type: 'mAsset' },
    thumbnail: { type: 'mAsset' },
    playlist: { type: 'mSelect', options: [['默认', '1']] },
    duration: { type: 'text' },
    type: { type: 'select', options: [['视频', '4'], ['音频', '5']] },
    created: { type: 'date' }
};

// 工具函数
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const mapField = (key: string, keyMap: any) =>
    Object.values(keyMap).find((k: any) => k.desc === FIELDS[key] && k.type === FIELD_DEFS[key]?.type) ||
    Object.values(keyMap).find((k: any) => k.desc === FIELDS[key]) ||
    keyMap[FIELDS[key]] ||
    Object.values(keyMap).find((k: any) => k.name?.includes(FIELDS[key]) || FIELDS[key]?.includes(k.name));

const extractValue = (value: any, key: string) =>
    key === 'type' ? (value?.mSelect?.[0]?.content === '音频' ? 'audio' : 'video') :
        (value?.text?.content || value?.url?.content || value?.mSelect?.[0]?.content || value?.mAsset?.[0]?.content || value?.date?.content || '');

const createValue = (key: string, value: any, keyData?: any) => {
    const v = String(value), base = { keyID: keyData?.id, id: id(), blockID: '', type: keyData?.type || 'text' };
    const color = (name: string) => keyData?.options?.find(o => o.name === name)?.color || '1';
    const creators = {
        url: () => ({ ...base, type: 'url', url: { content: v } }),
        playlist: () => ({ ...base, type: 'mSelect', mSelect: Array.isArray(value) ? value.map(i => ({ content: String(i), color: color(String(i)) })) : [{ content: v, color: color(v) }] }),
        source: () => ({ ...base, type: 'select', mSelect: [{ content: v, color: color(v) }] }),
        type: () => ({ ...base, type: 'select', mSelect: [{ content: v, color: color(v) }] }),
        artistIcon: () => ({ ...base, type: 'mAsset', mAsset: [{ type: 'image', name: '', content: v }] }),
        thumbnail: () => ({ ...base, type: 'mAsset', mAsset: [{ type: 'image', name: '', content: v }] }),
        created: () => ({ ...base, type: 'date', date: { content: value, isNotEmpty: true, hasEndDate: false, isNotTime: false } })
    };
    return creators[key] || (() => ({ ...base, text: { content: v } }));
};

// 数据库API封装
const api = async (path: string, data: any = {}) => {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const t = await r.text();
    if (!t) return {};
    try { return JSON.parse(t); } catch { return {}; }
};
const getUpdateId = (avId: string) => avId.replace(/-[^-]+$/, '-2vkgxt0');
const timestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

export const getAvId = async (dbId: string): Promise<string> => {
    if (!dbId || !/^\d{14}-[a-z0-9]{7}$/.test(dbId)) throw new Error('无效的数据库ID');
    const avId = (await api('/api/query/sql', { stmt: `SELECT markdown FROM blocks WHERE type='av' AND id='${dbId}'` }).catch(() => ({ data: [] }))).data?.[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1];
    return avId || dbId;
};

const db = {
    getKeys: async (avId: string) => (await api('/api/av/getAttributeViewKeysByAvID', { avID: avId })).data || [],
    render: async (avId: string, viewId = '', page = 1, pageSize = 10000) => (await api('/api/av/renderAttributeView', { id: avId, viewID: viewId, query: '', page, pageSize })).data || {},
    addKey: async (avId: string, keyID: string, keyName: string, keyType: string, keyIcon = '', previousKeyID = '') => api('/api/av/addAttributeViewKey', { avID: avId, keyID, keyName, keyType, keyIcon, previousKeyID }),
    setKeyDesc: async (avId: string, keyID: string, desc: string) => db.transaction([{ action: 'setAttrViewColDesc', id: keyID, avID: avId, data: desc }]),
    addRow: async (avId: string, values: any[]) => api('/api/av/appendAttributeViewDetachedBlocksWithValues', { avID: avId, blocksValues: [values] }),
    removeRows: async (avId: string, rowIds: string[]) => api('/api/av/removeAttributeViewBlocks', { avID: avId, srcIDs: rowIds }),
    removeKey: async (avId: string, keyId: string) => api('/api/av/removeAttributeViewKey', { avID: avId, keyID: keyId }),
    transaction: async (operations: any[], undoOperations: any[] = []) => api('/api/transactions', {
        transactions: [{ doOperations: operations, undoOperations }],
        session: id(), app: 'qd1f', reqId: Date.now()
    }),
    deleteTagOption: async (avId: string, keyId: string, optionName: string, allOptions: any[]) => {
        if (!allOptions.some(opt => opt.name === optionName)) throw new Error('标签不存在');
        return db.transaction([
            { action: 'removeAttrViewColOption', id: keyId, avID: avId, data: optionName },
            { action: 'doUpdateUpdated', id: getUpdateId(avId), data: timestamp() }
        ], [{ action: 'updateAttrViewColOptions', id: keyId, avID: avId, data: allOptions }]);
    },
    renameTagOption: async (avId: string, keyId: string, oldName: string, newName: string, allOptions: any[]) => {
        const o = allOptions.find(opt => opt.name === oldName);
        if (!o) throw new Error('标签不存在');
        if (allOptions.some(opt => opt.name === newName && opt.name !== oldName)) throw new Error('标签已存在');
        const data = { oldName, newName, newColor: o.color || '1', newDesc: o.desc || '' };
        return db.transaction([
            { action: 'updateAttrViewColOption', id: keyId, avID: avId, data },
            { action: 'doUpdateUpdated', id: getUpdateId(avId), data: timestamp() }
        ], [{ action: 'updateAttrViewColOption', id: keyId, avID: avId, data: { ...data, oldName: newName, newName: oldName } }]);
    },
    sortItem: async (avId: string, rowId: string, previousRowId: string) => db.transaction([
        { action: 'sortAttrViewRow', avID: avId, blockID: getUpdateId(avId), id: rowId, previousID: previousRowId }
    ], [{ action: 'sortAttrViewRow', avID: avId, blockID: getUpdateId(avId), id: rowId, previousID: '' }]),
    sortTags: async (avId: string, keyId: string, sortedOptions: any[]) => db.transaction([
        { action: 'updateAttrViewColOptions', id: keyId, avID: avId, data: sortedOptions }
    ], [{ action: 'updateAttrViewColOptions', id: keyId, avID: avId, data: sortedOptions }])
};

// 辅助函数：通过添加临时行创建选项（hack但可靠）
const ensureFieldOptions = async (avId: string, keyID: string, options: string[][]) => {
    const before = (await db.render(avId)).view?.rows?.length || 0;
    for (const [name, color] of options) await db.addRow(avId, [{ keyID, id: id(), blockID: '', type: 'mSelect', mSelect: [{ content: name, color }] }]);
    const after = (await db.render(avId)).view?.rows || [];
    if (after.length > before) await db.removeRows(avId, after.slice(before).map(r => r.id));
};

// Provider创建
export const createDatabaseProvider = (deps: DatabaseProviderDeps, dbId: string) => {
    return {
        init: async () => {
            const avId = await getAvId(dbId), keys = await db.getKeys(avId);
            await Promise.all(keys.filter(k => k.type === 'select' && !Object.values(FIELDS).includes(k.name))
                .map(f => db.removeKey(avId, f.id).catch(() => {})));
            let prev = keys.find(k => k.type === 'block')?.id || '';
            for (const key of ['title', 'url', 'duration', 'playlist', 'source', 'type', 'artist', 'thumbnail', 'artistIcon', 'created']) {
                const name = FIELDS[key], def = FIELD_DEFS[key] || { type: 'text' }, exist = keys.find(k => k.desc === name && k.type === def.type);
                if (exist) { if (!exist.desc) await db.setKeyDesc(avId, exist.id, name); prev = exist.id; }
                else { const kid = id(); await db.addKey(avId, kid, name, def.type, '', prev); await db.setKeyDesc(avId, kid, name); if (def.options) await ensureFieldOptions(avId, kid, def.options); prev = kid; }
            }
        },

        load: async () => {
            const avId = await getAvId(dbId);
            const loadData = await db.render(avId), loadKeys = await db.getKeys(avId), loadKeyMap = Object.fromEntries(loadKeys.map(k => [k.name, k]));
            const loadPlaylistKey = mapField('playlist', loadKeyMap), allTags = [...(loadPlaylistKey?.options?.filter(opt => { const parts = (opt.desc || '').split('|'); const lastPart = parts[parts.length - 1]; return opt.name === '默认' || (lastPart && lastPart.match(/^[dcgpNnTtSs]+$/) ? lastPart.includes('p') : true); })?.map(opt => opt.name) || []), '默认'].filter((t, i, a) => a.indexOf(t) === i);
            deps.setTags(['目录', ...allTags.filter(t => t !== '目录')]);
            if (deps.getTab() === '目录') {
                deps.setItems(loadPlaylistKey?.options?.filter(opt => opt.name !== '目录').map(opt => { const parts = (opt.desc || '').split('|'); const lastPart = parts[parts.length - 1]; return { id: `dir-${opt.name}`, title: opt.name, type: 'folder', url: '#', source: 'directory', targetTabId: opt.name, is_dir: true, thumbnail: Media.getThumbnail({ type: 'folder' }), pinned: lastPart && lastPart.match(/^[dcgpNnTtSs]+$/) ? lastPart.includes('p') : false }; }) || []);
            } else {
                const rows = loadData.view?.rows || [], cards = loadData.view?.cards || [];
                const dataItems = rows.length ? rows : cards;
                deps.setItems(deps.applySort(
                    dataItems.filter(item => {
                        const values = item.cells || item.values || [];
                        return values.find(c => c.value?.keyID === loadPlaylistKey?.id)?.value?.mSelect?.some?.(tag => tag.content === deps.getTab());
                    }).map(item => {
                        const values = item.cells || item.values || [], result: any = { id: item.id };
                        Object.entries(FIELDS).forEach(([key]) => {
                            const field = mapField(key, loadKeyMap), cell = field ? values.find(c => c.value?.keyID === field.id) : null;
                            result[key] = cell ? extractValue(cell.value, key) : '';
                        });
                        result.title = result.title || '未知标题';
                        return result;
                    })
                ));
            }
        },

        add: async (params: any) => {
            const avId = await getAvId(dbId);
            const { media, playlist = '默认', checkDup = true } = params;
            const provider = createDatabaseProvider(deps, dbId);
            await provider.ensure({ tagName: playlist, pinned: true });
            if (checkDup && media.url) {
                const dbData = await db.render(avId), dupKeys = await db.getKeys(avId), dupKeyMap = Object.fromEntries(dupKeys.map(k => [k.name, k]));
                const urlKey = mapField('url', dupKeyMap);
                if (dbData.view?.rows?.find(row => row.cells?.find(c => c.value?.keyID === urlKey?.id)?.value?.url?.content === media.url)) {
                    deps.toast('媒体已存在');
                    return;
                }
            }
            if (media.thumbnail) media.thumbnail = await imageToLocalAsset(media.thumbnail);
            if (media.artistIcon) media.artistIcon = await imageToLocalAsset(media.artistIcon);
            const addKeys = await db.getKeys(avId), addKeyMap = Object.fromEntries(addKeys.map(k => [k.name, k])), values = [];
            addKeys.filter(k => k.desc === FIELDS.title).forEach(f => f.type === 'text' && media.title ? values.push({ keyID: f.id, id: id(), blockID: '', type: 'text', text: { content: media.title } }) : f.type === 'block' && values.push({ keyID: f.id, id: id(), blockID: '', type: 'block', block: { id: id(), content: '', created: Date.now(), updated: Date.now() }, isDetached: true }));
            if (!addKeys.some(k => k.desc === FIELDS.title && k.type === 'block')) { const pk = addKeys.find(k => k.type === 'block'); pk && values.push({ keyID: pk.id, id: id(), blockID: '', type: 'block', block: { id: id(), content: '', created: Date.now(), updated: Date.now() }, isDetached: true }); }
            Object.entries(FIELDS).forEach(([key]) => {
                if (key === 'title') return;
                const keyData = mapField(key, addKeyMap);
                if (!keyData) return;
                let v = media[key];
                if (key === 'source') v = media.source === 'openlist' ? 'OpenList' : media.source === 'webdav' ? 'WebDAV' : media.source === 'alidrive' ? '阿里云盘' : media.source === 'baidudrive' ? '百度网盘' : media.source === 'pan123' ? '123云盘' : media.source === 'quarktv' ? '夸克TV' : media.source === 's3' ? 'S3存储' : media.source === 'siyuan' ? '思源' : (media.url?.includes('bilibili.com') || media.bvid) ? 'B站' : (media.source === 'local' || media.url?.startsWith('file://')) ? '本地' : '普通';
                else if (key === 'playlist') v = [playlist];
                else if (key === 'type') v = media.type === 'audio' ? '音频' : '视频';
                else if (key === 'created') v = Date.now();
                if (v !== undefined && v !== null && v !== '') { const value = createValue(key, v, keyData)(); if (value) values.push(value); }
            });
            await db.addRow(avId, values);
        },

        del: async (params: any) => {
            const avId = await getAvId(dbId);
            const { title, tagName } = params, delData = await db.render(avId), delKeyMap = Object.fromEntries((await db.getKeys(avId)).map(k => [k.name, k]));
            let rowIds: string[] = [];
            if (tagName) {
                const playlistKey = mapField('playlist', delKeyMap);
                rowIds = delData.view?.rows?.filter(r => r.cells?.find(c => c.value?.keyID === playlistKey?.id)?.value?.mSelect?.some(tag => tag.content === tagName)).map(r => r.id) || [];
            } else if (title) {
                const titleField = mapField('title', delKeyMap);
                const row = delData.view?.rows?.find(r => {
                    const cell = r.cells?.find(c => c.value?.keyID === titleField?.id);
                    return cell?.value?.text?.content === title || cell?.value?.block?.content === title;
                });
                if (row) rowIds = [row.id];
            }
            if (rowIds.length > 0) { await db.removeRows(avId, rowIds); deps.toast(`删除了${rowIds.length}条记录`); }
        },

        move: async (params: any) => {
            const avId = await getAvId(dbId), { title: moveTitle, newPlaylist } = params, provider = createDatabaseProvider(deps, dbId);
            await provider.ensure({ tagName: newPlaylist, pinned: true });
            const data = await db.render(avId), keys = await db.getKeys(avId), keyMap = Object.fromEntries(keys.map(k => [k.name, k]));
            const row = data.view?.rows?.find(r => (r.cells?.find(c => c.value?.keyID === mapField('title', keyMap)?.id)?.value?.text?.content || r.cells?.find(c => c.value?.keyID === mapField('title', keyMap)?.id)?.value?.block?.content) === moveTitle);
            if (!row) return;
            const pk = mapField('playlist', keyMap), cell = row.cells?.find(c => c.value?.keyID === pk?.id);
            if (!pk || !cell) return;
            const playlists = [...(cell?.value?.mSelect?.map(t => t.content) || []).filter(t => t !== deps.getTab()), newPlaylist];
            await db.transaction([{ action: 'updateAttrViewCell', id: cell.value?.id || cell.id, avID: avId, keyID: pk.id, rowID: row.id, data: { mSelect: playlists.map(t => ({ content: t, color: pk?.options?.find(o => o.name === t)?.color || '1' })) } }]);
        },

        ensure: async (params: any) => {
            const avId = await getAvId(dbId), keys = await db.getKeys(avId), pk = mapField('playlist', Object.fromEntries(keys.map(k => [k.name, k])));
            if (pk && !pk.options?.some(opt => opt.name === params.tagName)) {
                const before = (await db.render(avId)).view?.rows?.length || 0;
                await db.addRow(avId, [createValue('playlist', [params.tagName], pk)()]);
                const after = (await db.render(avId)).view?.rows || [];
                if (after.length > before) await db.removeRows(avId, after.slice(before).map(r => r.id));
                const desc = (params.description ? params.description + '|' : '') + (params.tagName === deps.getTab() ? deps.getState?.().view?.[0] || 'd' : 'd') + 'n' + (params.pinned !== false ? 'p' : '');
                await db.transaction([
                    { action: 'updateAttrViewColOption', id: pk.id, avID: avId, data: { newColor: '1', oldName: params.tagName, newName: params.tagName, newDesc: desc } },
                    { action: 'doUpdateUpdated', id: getUpdateId(avId), data: timestamp() }
                ], [{ action: 'updateAttrViewColOption', id: pk.id, avID: avId, data: { newColor: '1', oldName: params.tagName, newName: params.tagName, newDesc: '' } }]);
            }
        },

        deleteTag: async (params: any) => {
            const avId = await getAvId(dbId);
            const { tagName: deleteTagName } = params;
            if (deleteTagName === '默认') { deps.toast('不能删除默认标签'); return; }
            const deleteKeys = await db.getKeys(avId), deleteKeyMap = Object.fromEntries(deleteKeys.map(k => [k.name, k]));
            const deletePlaylistKey = mapField('playlist', deleteKeyMap);
            if (!deletePlaylistKey) { deps.toast('未找到标签字段'); return; }
            const allOptions = deletePlaylistKey.options || [];
            if (!allOptions.some(opt => opt.name === deleteTagName)) { deps.toast('标签不存在'); return; }
            await db.deleteTagOption(avId, deletePlaylistKey.id, deleteTagName, allOptions);
            const deleteData = await db.render(avId);
            const rowsToDelete = deleteData.view?.rows?.filter(r => {
                const cell = r.cells?.find(c => c.value?.keyID === deletePlaylistKey.id);
                return cell?.value?.mSelect?.some(tag => tag.content === deleteTagName);
            }).map(r => r.id) || [];
            if (rowsToDelete.length > 0) await db.removeRows(avId, rowsToDelete);
            deps.toast(`已删除标签"${deleteTagName}"`);
        },

        renameTag: async (params: any) => {
            const avId = await getAvId(dbId);
            const { oldName, newName } = params;
            if (oldName === '默认') { deps.toast('不能重命名默认标签'); return; }
            if (!newName?.trim()) { deps.toast('新标签名不能为空'); return; }
            const renameKeys = await db.getKeys(avId), renameKeyMap = Object.fromEntries(renameKeys.map(k => [k.name, k]));
            const renamePlaylistKey = mapField('playlist', renameKeyMap);
            if (!renamePlaylistKey) { deps.toast('未找到标签字段'); return; }
            await db.renameTagOption(avId, renamePlaylistKey.id, oldName, newName, renamePlaylistKey.options || []);
            deps.toast(`已将标签"${oldName}"重命名为"${newName}"`);
        },

        reorder: async (params: any) => {
            const avId = await getAvId(dbId);
            const { type, draggedItem } = params;
            if (type === 'items' && draggedItem) {
                const reorderData = await db.render(avId), km = Object.fromEntries((await db.getKeys(avId)).map(k => [k.name, k]));
                const titleField = mapField('title', km);
                const currentRow = reorderData.view?.rows?.find(r => {
                    const cell = r.cells?.find(c => c.value?.keyID === titleField?.id);
                    return cell?.value?.text?.content === draggedItem.title || cell?.value?.block?.content === draggedItem.title;
                });
                if (!currentRow) return;
                const currentIndex = deps.getItems().findIndex(i => i.id === draggedItem.id);
                const previousItem = currentIndex > 0 ? deps.getItems()[currentIndex - 1] : null;
                let previousRowId = '';
                if (previousItem) {
                    const prevRow = reorderData.view?.rows?.find(r => {
                        const cell = r.cells?.find(c => c.value?.keyID === titleField?.id);
                        return cell?.value?.text?.content === previousItem.title || cell?.value?.block?.content === previousItem.title;
                    });
                    if (prevRow) previousRowId = prevRow.id;
                }
                await db.sortItem(avId, currentRow.id, previousRowId);
            } else if (type === 'tags') {
                const pk = mapField('playlist', Object.fromEntries((await db.getKeys(avId)).map(k => [k.name, k])));
                if (!pk?.options) return;
                const sys = ['默认', '目录'], sysOpts = sys.map(n => pk.options.find(o => o.name === n)).filter(Boolean);
                const userOpts = deps.getTags().filter(t => !sys.includes(t)).map(n => pk.options.find(o => o.name === n)).filter(Boolean);
                const sorted = [...sysOpts, ...userOpts, ...pk.options.filter(o => ![...sysOpts, ...userOpts].find(x => x.name === o.name))];
                await db.sortTags(avId, pk.id, sorted);
            }
        }
    };
};

// 导出工具函数（供外部使用）
export { db, mapField };

// Router
export const routeDbOp = async (deps: DatabaseProviderDeps, dbId: string, action: string, params: any): Promise<boolean | any> => {
    if (!dbId || !/^\d{14}-[a-z0-9]{7}$/.test(dbId)) return false;
    const p = createDatabaseProvider(deps, dbId);
    const ops: Record<string, () => Promise<any>> = {
        init: p.init,
        load: p.load,
        add: () => p.add(params),
        del: () => p.del(params),
        move: () => p.move(params),
        ensure: () => p.ensure(params),
        deleteTag: () => p.deleteTag(params),
        renameTag: () => p.renameTag(params),
        reorder: () => p.reorder(params)
    };
    return ops[action] ? await ops[action]() : false;
};

// 兼容旧名称
export const routeDatabaseDataOp = routeDbOp;
