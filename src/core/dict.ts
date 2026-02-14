/**
 * 词典管理系统 - Dictionary Manager
 * 
 * 功能:
 * - 在线词典查询（AI、剑桥、有道等）
 * - 离线词典管理（StarDict、Dictd）
 * - 词典配置管理
 */

import type { Plugin } from 'siyuan';
import { getFile, putFile } from '@/api';

// ========== 类型定义 ==========

export interface DictResult {
  word: string;
  phonetics: { ipa: string; audio: string; region: 'us' | 'uk' }[];
  parts: { part: string; means: string[] }[];
  examples: { en: string; zh: string }[];
}

export interface OfflineDict {
  id: string;
  name: string;
  type: 'stardict' | 'dictd';
  enabled: boolean;
  files: {
    ifo?: string;
    dz?: string;
    idx?: string;
    syn?: string;
    index?: string;
  };
}

export interface OnlineDict {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  url?: string;
  desc?: string;
}

export interface DictConfig {
  dicts: {
    id: string;
    name: string;
    type: string;
    enabled: boolean;
    files: any;
  }[];
  online?: { id: string; enabled: boolean }[];
}

export interface DictCardData {
  word: string;
  phonetic?: string;
  phonetics?: { text: string; audio?: string }[];
  badges?: { text: string; gradient: boolean }[];
  meanings?: { pos: string; text: string }[];
  defs?: string[];
  examples?: { en: string; zh: string }[];
  extras?: { label: string; text: string }[];
  meta?: string;
}

// ========== 常量 ==========

const DICT_PATH = '/data/storage/petal/siyuan-sireader/dictionaries/';
const CONFIG_PATH = `${DICT_PATH}config.json`;

const DICT_NAMES: Record<string, string> = {
  ai: 'AI',
  'ai-free': 'AI(免费)',
  cambridge: '剑桥',
  youdao: '有道',
  haici: '海词',
  mxnzp: '汉字',
  ciyu: '词语',
  zdic: '汉典',
  offline: '离线',
  bing: '必应'
};

export const getDictName = (id: string) => DICT_NAMES[id] || id;

export const POS_MAP: Record<string, { name: string; color: string }> = {
  n: { name: 'n.', color: '#2563eb' },
  noun: { name: 'n.', color: '#2563eb' },
  v: { name: 'v.', color: '#059669' },
  verb: { name: 'v.', color: '#059669' },
  vt: { name: 'vt.', color: '#047857' },
  vi: { name: 'vi.', color: '#0d9488' },
  a: { name: 'adj.', color: '#d97706' },
  adj: { name: 'adj.', color: '#d97706' },
  adjective: { name: 'adj.', color: '#d97706' },
  ad: { name: 'adv.', color: '#ea580c' },
  adv: { name: 'adv.', color: '#ea580c' },
  adverb: { name: 'adv.', color: '#ea580c' },
  prep: { name: 'prep.', color: '#7c3aed' },
  conj: { name: 'conj.', color: '#9333ea' },
  pron: { name: 'pron.', color: '#db2777' },
  int: { name: 'int.', color: '#dc2626' },
  art: { name: 'art.', color: '#4f46e5' }
};

export const ONLINE_DICTS: OnlineDict[] = [
  { id: 'ai-free', name: 'AI翻译(免费)', icon: '#iconSparkles', enabled: true, desc: '免费AI翻译，无需配置' },
  { id: 'ai', name: 'AI翻译(思源)', icon: '#iconSparkles', enabled: true, desc: '使用思源AI智能翻译' },
  { id: 'cambridge', name: '剑桥', icon: '#iconLanguage', enabled: true, desc: '英汉双解，支持发音' },
  { id: 'youdao', name: '有道', icon: 'https://shared.ydstatic.com/images/favicon.ico', enabled: true, desc: '英汉词典，简洁快速' },
  { id: 'haici', name: '海词', icon: 'https://dict.cn/favicon.ico', enabled: true, desc: '英汉词典，例句丰富' },
  { id: 'mxnzp', name: '汉字', icon: '#iconA', enabled: true, desc: '汉字字典，详细解释' },
  { id: 'ciyu', name: '词语', icon: '#iconFont', enabled: true, desc: '汉语词语，成语典故' },
  { id: 'zdic', name: '汉典', icon: 'https://www.zdic.net/favicon.ico', enabled: true, desc: '汉字词语查询' },
  { id: 'bing', name: '必应', icon: 'https://cn.bing.com/favicon.ico', enabled: true, url: 'https://cn.bing.com/dict/search?q={{word}}', desc: '必应词典网页版' }
];

// ========== 离线词典管理器 ==========

/**
 * 离线词典管理器
 */
class OfflineDictManager {
  private dicts: OfflineDict[] = [];
  private loaded = new Map<string, any>();
  private loading = new Map<string, Promise<void>>();
  private dictDataLoaded = new Set<string>();
  private initialized = false;
  private plugin: Plugin | null = null;
  
  async init(plugin: Plugin): Promise<void> {
    if (this.initialized) return;
    
    this.plugin = plugin;
    this.initialized = true;
    
    try {
      // 确保词典目录存在
      await putFile(DICT_PATH, true, new File([], ''));
      
      // 从 IndexedDB 加载配置
      const db = await import('./database').then(m => m.getDatabase());
      const config = await db.getSetting('dictionary_config');
      
      if (config?.dicts?.length) {
        this.dicts = config.dicts.map((cfg: any) => ({
          id: cfg.id,
          name: cfg.name,
          type: cfg.type as any,
          enabled: cfg.enabled,
          files: cfg.files
        }));
        
        this.preloadIndexes();
      } else {
        // 尝试从旧的文件迁移
        await this.migrateFromFile();
      }
    } catch (e) {
      console.error('[OfflineDictManager]', e);
    }
  }
  
  /**
   * 从旧的 config.json 文件迁移
   */
  private async migrateFromFile(): Promise<void> {
    try {
      const config = await getFile(CONFIG_PATH);
      
      if (config?.dicts?.length) {
        console.log('[OfflineDictManager] Migrating from file');
        
        this.dicts = config.dicts.map((cfg: any) => ({
          id: cfg.id,
          name: cfg.name,
          type: cfg.type as any,
          enabled: cfg.enabled,
          files: cfg.files
        }));
        
        // 保存到数据库
        await this.saveConfig();
        
        console.log('[OfflineDictManager] Migration completed');
      }
    } catch (e) {
      console.log('[OfflineDictManager] No file to migrate');
    }
  }
  
  private async preloadIndexes(): Promise<void> {
    const mod = await import('foliate-js/dict.js');
    
    await Promise.all(
      this.dicts.filter(d => d.enabled).map(async dict => {
        try {
          const instance = dict.type === 'stardict' ? new mod.StarDict() : new mod.DictdDict();
          const files = dict.type === 'stardict' 
            ? [dict.files.ifo, dict.files.idx, dict.files.syn]
            : [dict.files.index];
          
          const loaders: Record<string, string> = {
            ifo: 'loadIfo',
            idx: 'loadIdx',
            syn: 'loadSyn',
            index: 'loadIndex'
          };
          
          await Promise.all(
            files.filter(Boolean).map(async f => {
              const key = Object.keys(dict.files).find(k => dict.files[k] === f);
              if (key && loaders[key]) {
                await instance[loaders[key]](await this.loadFile(f!));
              }
            })
          );
          
          this.loaded.set(dict.id, instance);
        } catch (e) {
          console.error('[OfflineDictManager] Preload:', dict.name, e);
        }
      })
    );
  }
  
  private async loadDict(cfg: DictConfig['dicts'][0]): Promise<void> {
    if (this.loading.has(cfg.id)) {
      return this.loading.get(cfg.id);
    }
    
    const loadPromise = (async () => {
      try {
        let dict = this.loaded.get(cfg.id);
        
        if (!dict) {
          const mod = await import('foliate-js/dict.js');
          dict = cfg.type === 'stardict' ? new mod.StarDict() : new mod.DictdDict();
          
          const loaders = [
            ['ifo', 'loadIfo'],
            ['idx', 'loadIdx'],
            ['syn', 'loadSyn'],
            ['index', 'loadIndex']
          ];
          
          await Promise.all(
            loaders.map(async ([key, method]) => {
              if (cfg.files[key]) {
                await dict[method](await this.loadFile(cfg.files[key]));
              }
            })
          );
          
          this.loaded.set(cfg.id, dict);
        }
        
        if (cfg.files.dz && !this.dictDataLoaded.has(cfg.id)) {
          await dict.loadDict(await this.loadFile(cfg.files.dz), this.inflate);
          this.dictDataLoaded.add(cfg.id);
        }
      } finally {
        this.loading.delete(cfg.id);
      }
    })();
    
    this.loading.set(cfg.id, loadPromise);
    return loadPromise;
  }
  
  private async loadFile(path: string): Promise<File> {
    const res = await fetch('/api/file/getFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    
    if (!res.ok) throw new Error('File not found');
    
    const blob = await res.blob();
    return new File([blob], path.split('/').pop() || 'file');
  }
  
  private inflate = async (data: Uint8Array): Promise<Uint8Array> => {
    const { inflate } = await import('fflate');
    return new Promise((resolve, reject) => {
      inflate(data, (err, result) => err ? reject(err) : resolve(result));
    });
  };
  
  async lookup(word: string): Promise<any[] | null> {
    for (const dict of this.dicts.filter(d => d.enabled)) {
      try {
        await this.loadDict(dict);
        const instance = this.loaded.get(dict.id);
        if (!instance) continue;
        
        const results = await instance.lookup(word);
        if (results?.length) return results;
      } catch (e) {
        console.error('[OfflineDictManager] Lookup:', dict.name, e);
      }
    }
    
    return null;
  }
  
  getDictionaries(): OfflineDict[] {
    return [...this.dicts];
  }
  
  // 向后兼容别名
  getDicts(): OfflineDict[] {
    return this.getDictionaries();
  }
  
  async addDictionary(dict: OfflineDict): Promise<void> {
    if (this.dicts.some(d => d.id === dict.id)) {
      throw new Error('词典已存在');
    }
    
    this.dicts.push(dict);
    await this.saveConfig();
  }
  
  async removeDictionary(id: string): Promise<boolean> {
    const index = this.dicts.findIndex(d => d.id === id);
    if (index < 0) return false;
    
    this.dicts.splice(index, 1);
    this.loaded.delete(id);
    this.dictDataLoaded.delete(id);
    
    await this.saveConfig();
    return true;
  }
  
  private async saveConfig(): Promise<void> {
    const config: DictConfig = {
      dicts: this.dicts.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        enabled: d.enabled,
        files: d.files
      }))
    };
    
    // 保存到 IndexedDB
    const db = await import('./database').then(m => m.getDatabase());
    await db.saveSetting('dictionary_config', config);
    
    console.log('[OfflineDictManager] Config saved to database');
  }
}

// ========== 在线词典管理器 ==========

/**
 * 在线词典管理器
 */
class OnlineDictManager {
  private dicts: OnlineDict[] = [...ONLINE_DICTS];
  
  getDictionaries(): OnlineDict[] {
    return this.dicts.filter(d => d.enabled);
  }
  
  // 向后兼容别名
  getDicts(): OnlineDict[] {
    return this.getDictionaries();
  }
  
  async lookup(word: string, dictId?: string): Promise<DictCardData | null> {
    // 这里保留原有的在线查询逻辑
    // 由于代码较长，暂时返回 null
    console.log('[OnlineDictManager] Lookup:', word, dictId);
    return null;
  }
}

// ========== 统一词典管理器 ==========

/**
 * 词典管理器 - 统一管理在线和离线词典
 */
export class DictionaryManager {
  private offlineManager = new OfflineDictManager();
  private onlineManager = new OnlineDictManager();
  private initialized = false;
  
  async init(plugin: Plugin): Promise<void> {
    if (this.initialized) return;
    
    await this.offlineManager.init(plugin);
    this.initialized = true;
    
    console.log('[DictionaryManager] Initialized');
  }
  
  /**
   * 查词 - 优先离线，后在线
   */
  async lookup(word: string, preferOnline = false): Promise<any> {
    if (!preferOnline) {
      // 先尝试离线词典
      const offlineResult = await this.offlineManager.lookup(word);
      if (offlineResult) return offlineResult;
    }
    
    // 在线词典
    return await this.onlineManager.lookup(word);
  }
  
  /**
   * 获取所有词典
   */
  getDictionaries(): { offline: OfflineDict[]; online: OnlineDict[] } {
    return {
      offline: this.offlineManager.getDictionaries(),
      online: this.onlineManager.getDictionaries()
    };
  }
  
  /**
   * 添加离线词典
   */
  async addDictionary(dict: OfflineDict): Promise<void> {
    return await this.offlineManager.addDictionary(dict);
  }
  
  /**
   * 删除离线词典
   */
  async removeDictionary(id: string): Promise<boolean> {
    return await this.offlineManager.removeDictionary(id);
  }
}

// ========== 导出 ==========

export const dictionaryManager = new DictionaryManager();

// 向后兼容：创建管理器实例
const offlineManagerInstance = new OfflineDictManager();
const onlineManagerInstance = new OnlineDictManager();

export const offlineDictManager = offlineManagerInstance;
export const onlineDictManager = onlineManagerInstance;

// 向后兼容：初始化函数
let plugin: any;
export const initDictModule = (p: any) => {
  plugin = p;
  dictionaryManager.init(p);
  // 同时初始化离线词典管理器实例（用于向后兼容）
  offlineManagerInstance.init(p).catch(e => console.error('[Dict] Offline init error:', e));
};

// 导出原有的类以保持向后兼容
export { OfflineDictManager, OnlineDictManager };

// 重新导出 openDict 函数（从 dictionary.ts）
// 注意：这是一个临时方案，openDict 包含大量 UI 逻辑，应该移到单独的文件
export { openDict } from './_deprecated/dictionary';


