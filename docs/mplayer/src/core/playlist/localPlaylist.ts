import { Media } from '../player';

// ==================== 本地播放列表管理（使用配置文件） ====================

/**
 * 加载本地播放列表配置
 * 使用独立的 playlist.json 文件
 */
export const loadLocalPlaylists = async (plugin: any): Promise<any[]> => {
  try {
    const data = await plugin.loadData('playlist.json') || { playlists: [] };
    return data.playlists || [];
  } catch {
    return [];
  }
};

/**
 * 保存本地播放列表配置
 */
export const saveLocalPlaylists = async (plugin: any, playlists: any[]): Promise<void> => {
  try {
    const data = { playlists };
    await plugin.saveData('playlist.json', data, 2);
  } catch (e) {
    console.error('保存播放列表失败:', e);
  }
};

/**
 * 根据标签ID获取播放列表
 */
const getPlaylistByTag = (playlists: any[], tagId: string) => {
  return playlists.find(p => p.id === tagId || p.name === tagId);
};

/**
 * 确保播放列表存在
 */
const ensurePlaylist = (playlists: any[], tagName: string): any[] => {
  if (!playlists.find(p => p.name === tagName || p.id === tagName)) {
    playlists.push({
      id: `playlist-${Date.now()}`,
      name: tagName,
      isFixed: false,
      items: []
    });
  }
  return playlists;
};

// ==================== Provider Dependencies ====================
export type LocalProviderDeps = {
  plugin: any;
  getTab: () => string;
  getTags?: () => string[];
  setTags: (tags: string[]) => void;
  getItems: () => any[];
  setItems: (items: any[]) => void;
  applySort: (items: any[]) => any[];
  applyTC?: (items: any[]) => boolean;
  toast?: (msg: string) => void;
  getState?: () => any;
  connect?: (type: string, tag: string, path: string, desc: string) => Promise<void>;
};

// ==================== Local Provider ====================
export const createLocalProvider = (deps: LocalProviderDeps) => {
  return {
    /**
     * 加载播放列表数据
     */
    load: async () => {
      const playlists = await loadLocalPlaylists(deps.plugin);
      const tab = deps.getTab();
      
      // 设置标签列表
      const tags = playlists.map(p => p.name || p.id);
      deps.setTags(['目录', ...tags]);
      
      // 根据当前标签加载数据
      if (tab === '目录') {
        // 目录视图：显示所有标签为文件夹
        const dirItems = playlists.map(p => ({
          id: `dir-${p.id || p.name}`,
          title: p.name || p.id,
          type: 'folder',
          url: '#',
          source: 'directory',
          targetTabId: p.id || p.name,
          is_dir: true,
          thumbnail: Media.getThumbnail({ type: 'folder' })
        }));
        deps.setItems(dirItems);
      } else {
        // 常规视图：显示该标签下的媒体项
        const playlist = getPlaylistByTag(playlists, tab);
        const items = deps.applySort(playlist?.items || []);
        deps.setItems(items);
        
        // 应用缓存的音频/视频元数据
        if (deps.applyTC?.(items)) {
          deps.setItems([...items]);
        }
        
        // 自动连接网盘
        const desc = playlist?.description || '';
        const cloudTypes = ['webdav:', 'openlist:', 'alidrive:', 'baidudrive:', 'pan123:', 'quarktv:', 's3:', 'siyuan:'];
        const cloudType = cloudTypes.find(t => desc.startsWith(t));
        if (cloudType && deps.connect && deps.getState) {
          const state = deps.getState();
          if (!state.folder?.connected) {
            const type = cloudType.slice(0, -1);
            const path = desc.split('|')[1] || '/';
            await deps.connect(type, tab, path, desc);
          }
        }
      }
    },

    /**
     * 添加媒体项到播放列表
     */
    add: async ({ media, playlist = '默认', checkDup = true }: any) => {
      let playlists = await loadLocalPlaylists(deps.plugin);
      playlists = ensurePlaylist(playlists, playlist);
      
      const targetPlaylist = getPlaylistByTag(playlists, playlist);
      if (!targetPlaylist) return;
      
      // 检查重复
      if (checkDup && media.url) {
        const exists = (targetPlaylist.items || []).some(item => 
          item.url === media.url || 
          (media.bvid && item.bvid === media.bvid)
        );
        if (exists) {
          deps.toast?.('媒体已存在');
          return;
        }
      }
      
      // 推断 source
      const source = media.source || (
        media.bvid || media.url?.includes('bilibili.com') ? 'bilibili' :
        media.url?.startsWith('file://') ? 'local' :
        'standard'
      );
      
      // 保存图片到assets
      const { imageToLocalAsset } = await import('../document');
      if (media.thumbnail) media.thumbnail = await imageToLocalAsset(media.thumbnail);
      if (media.artistIcon) media.artistIcon = await imageToLocalAsset(media.artistIcon);
      
      const newItem = {
        id: media.id || `local-${Date.now()}`,
        title: media.title,
        type: media.type,
        url: media.url,
        source,
        thumbnail: media.thumbnail,
        duration: media.duration,
        artist: media.artist,
        artistIcon: media.artistIcon,
        aid: media.aid,
        bvid: media.bvid,
        cid: media.cid,
        startTime: media.startTime,
        endTime: media.endTime,
        isLoop: media.isLoop,
        loopCount: media.loopCount,
        isPinned: media.isPinned || false,
        isFavorite: media.isFavorite || false
      };
      
      // 过滤 undefined 值
      Object.keys(newItem).forEach(key => {
        if (newItem[key] === undefined) delete newItem[key];
      });
      
      targetPlaylist.items = [...(targetPlaylist.items || []), newItem];
      await saveLocalPlaylists(deps.plugin, playlists);
    },

    /**
     * 删除媒体项或清空/删除标签
     */
    del: async ({ title, tagName }: any) => {
      const playlists = await loadLocalPlaylists(deps.plugin);
      const tab = deps.getTab();
      
      if (tagName && !title) {
        // 清空标签：保留标签但清空所有items
        const playlist = getPlaylistByTag(playlists, tagName);
        if (playlist) {
          playlist.items = [];
          await saveLocalPlaylists(deps.plugin, playlists);
        }
      } else if (title) {
        // 删除单个媒体项
        const playlist = getPlaylistByTag(playlists, tagName || tab);
        if (playlist) {
          playlist.items = (playlist.items || []).filter(item => item.title !== title);
          await saveLocalPlaylists(deps.plugin, playlists);
        }
      }
    },

    /**
     * 移动媒体项到其他播放列表
     */
    move: async ({ title, newPlaylist }: any) => {
      let playlists = await loadLocalPlaylists(deps.plugin);
      playlists = ensurePlaylist(playlists, newPlaylist);
      
      let movedItem: any = null;
      
      // 从所有播放列表中查找并移除该项
      playlists.forEach(p => {
        const item = (p.items || []).find(i => i.title === title);
        if (item) {
          movedItem = item;
          p.items = p.items.filter(i => i.title !== title);
        }
      });
      
      // 添加到目标播放列表
      if (movedItem) {
        const targetPlaylist = getPlaylistByTag(playlists, newPlaylist);
        if (targetPlaylist) {
          targetPlaylist.items = [...(targetPlaylist.items || []), movedItem];
          await saveLocalPlaylists(deps.plugin, playlists);
          deps.toast?.(`已移动到"${newPlaylist}"`);
        }
      }
    },

    /**
     * 确保播放列表存在
     */
    ensure: async ({ tagName, description, pinned }: any) => {
      let playlists = await loadLocalPlaylists(deps.plugin);
      let playlist = playlists.find(p => p.name === tagName || p.id === tagName);
      
      if (!playlist) {
        // 创建新播放列表
        playlist = {
          id: `playlist-${Date.now()}`,
          name: tagName,
          isFixed: false,
          items: []
        };
        
        // 添加可选字段
        if (description !== undefined) playlist.description = description;
        if (pinned !== undefined) playlist.pinned = pinned;
        
        playlists.push(playlist);
        await saveLocalPlaylists(deps.plugin, playlists);
      } else {
        // 更新现有播放列表的可选字段
        let updated = false;
        if (description !== undefined && playlist.description !== description) {
          playlist.description = description;
          updated = true;
        }
        if (pinned !== undefined && playlist.pinned !== pinned) {
          playlist.pinned = pinned;
          updated = true;
        }
        if (updated) {
          await saveLocalPlaylists(deps.plugin, playlists);
        }
      }
    },

    /**
     * 删除播放列表标签
     */
    deleteTag: async ({ tagName }: any) => {
      if (tagName === '默认') {
        return deps.toast?.('不能删除默认标签');
      }
      
      const playlists = await loadLocalPlaylists(deps.plugin);
      const filtered = playlists.filter(p => p.name !== tagName && p.id !== tagName);
      
      if (filtered.length < playlists.length) {
        await saveLocalPlaylists(deps.plugin, filtered);
        deps.toast?.(`已删除标签"${tagName}"`);
      }
    },

    /**
     * 重命名播放列表标签
     */
    renameTag: async ({ oldName, newName }: any) => {
      if (oldName === '默认') {
        return deps.toast?.('不能重命名默认标签');
      }
      
      if (!newName?.trim()) {
        return deps.toast?.('新标签名不能为空');
      }
      
      const playlists = await loadLocalPlaylists(deps.plugin);
      const playlist = playlists.find(p => p.name === oldName || p.id === oldName);
      
      if (playlist) {
        playlist.name = newName.trim();
        await saveLocalPlaylists(deps.plugin, playlists);
        deps.toast?.(`已将标签"${oldName}"重命名为"${newName}"`);
      }
    },

    /**
     * 重新排序
     */
    reorder: async ({ type }: any) => {
      const playlists = await loadLocalPlaylists(deps.plugin);
      
      if (type === 'items') {
        const tab = deps.getTab();
        const playlist = getPlaylistByTag(playlists, tab);
        if (playlist) {
          playlist.items = deps.getItems();
          await saveLocalPlaylists(deps.plugin, playlists);
        }
      } else if (type === 'tags') {
        const currentTags = deps.getTags?.() || [];
        const tagOrder = currentTags.filter(t => t !== '目录');
        const reordered = tagOrder.map(tagName => 
          playlists.find(p => p.name === tagName || p.id === tagName)
        ).filter(Boolean);
        const existingIds = new Set(reordered.map(p => p.id));
        playlists.forEach(p => {
          if (!existingIds.has(p.id)) reordered.push(p);
        });
        await saveLocalPlaylists(deps.plugin, reordered);
      }
    }
  } as const;
};

// ==================== Router ====================
export const routeLocalOp = async (
  deps: LocalProviderDeps,
  action: string,
  params: any
): Promise<boolean> => {
  const provider = createLocalProvider(deps);
  
  switch (action) {
    case 'load':
      await provider.load();
      return true;
    case 'add':
      await provider.add(params);
      await provider.load();
      return true;
    case 'del':
      await provider.del(params);
      await provider.load();
      return true;
    case 'move':
      await provider.move(params);
      await provider.load();
      return true;
    case 'ensure':
      await provider.ensure(params);
      await provider.load();
      return true;
    case 'deleteTag':
      await provider.deleteTag(params);
      await provider.load();
      return true;
    case 'renameTag':
      await provider.renameTag(params);
      await provider.load();
      return true;
    case 'reorder':
      await provider.reorder(params);
      await provider.load();
      return true;
    default:
      return false;
  }
};

// 兼容旧名称
export const routeLocalDataOp = routeLocalOp;
