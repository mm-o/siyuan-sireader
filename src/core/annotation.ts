/**
 * 标注管理系统 - 统一标注管理
 * 
 * 功能:
 * - 统一管理 PDF/EPUB/TXT 标注数据
 * - 高亮、笔记、书签的 CRUD 操作
 * - PDF 形状和墨迹的数据管理
 * - 统一渲染接口
 */

import { getDatabase, type Annotation, type AnnotationType } from './database';

// ========== 类型定义 ==========

export type HighlightColor = 'yellow' | 'red' | 'green' | 'blue' | 'purple' | 'orange' | 'pink';
export type HighlightStyle = 'highlight' | 'underline' | 'outline' | 'dotted' | 'dashed' | 'double' | 'squiggly';
export type ShapeType = 'rect' | 'circle' | 'triangle';

export interface AnnotationManagerConfig {
  book: string;
  format: 'pdf' | 'epub' | 'txt';
  view?: any;           // EPUB/TXT view
  pdfViewer?: any;      // PDF viewer
  reader?: any;         // EPUB reader
  onAnnotationClick?: (annotation: Annotation) => void;
}

// 颜色配置
export const COLORS = [
  { name: '黄色', color: 'yellow' as const, bg: '#ffeb3b' },
  { name: '红色', color: 'red' as const, bg: '#ef5350' },
  { name: '绿色', color: 'green' as const, bg: '#66bb6a' },
  { name: '蓝色', color: 'blue' as const, bg: '#42a5f5' },
  { name: '紫色', color: 'purple' as const, bg: '#ab47bc' },
  { name: '橙色', color: 'orange' as const, bg: '#ff9800' },
  { name: '粉色', color: 'pink' as const, bg: '#ec407a' }
];

// 样式配置
export const STYLES = [
  { type: 'highlight' as const, name: '高亮', text: 'A' },
  { type: 'underline' as const, name: '下划线', text: 'A' },
  { type: 'outline' as const, name: '边框', text: 'A' },
  { type: 'dotted' as const, name: '点线', text: 'A', pdfOnly: true },
  { type: 'dashed' as const, name: '虚线', text: 'A', pdfOnly: true },
  { type: 'double' as const, name: '双线', text: 'A', pdfOnly: true },
  { type: 'squiggly' as const, name: '波浪线', text: 'A', epubOnly: true }
];

// ========== 工具函数 ==========

export const getColorMap = () => Object.fromEntries(COLORS.map(c => [c.color, c.bg]));

export const getColorBg = (color?: HighlightColor): string => {
  return COLORS.find(c => c.color === color)?.bg || '#ffeb3b';
};

export const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};

export const formatAuthor = (a: any): string => 
  Array.isArray(a) 
    ? a.map(c => typeof c === 'string' ? c : c?.name).filter(Boolean).join(', ') 
    : typeof a === 'string' 
    ? a 
    : a?.name || '';

export const getChapterName = (params: { cfi?: string; page?: number; isPdf?: boolean; toc?: any[]; location?: any }): string => {
  const { cfi, page, isPdf, toc, location } = params;
  if (cfi && (location?.tocItem?.label || location?.tocItem?.title)) return location.tocItem.label || location.tocItem.title;
  if (isPdf && page && toc) {
    for (let i = toc.length - 1; i >= 0; i--) {
      const item = toc[i];
      const pageNum = item.pageNumber || item.page;
      if (pageNum && pageNum <= page) return item.fullPath || item.label || item.title;
    }
  }
  return '';
};

export const createTooltip = (config: { icon: string; iconColor: string; title: string; content: string; id?: string }) => {
  const { icon, iconColor, title, content, id } = config;
  const header = `<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-left:4px solid ${iconColor};background:linear-gradient(135deg,var(--b3-theme-surface) 0%,var(--b3-theme-background-light) 100%)"><svg style="width:16px;height:16px;color:${iconColor};flex-shrink:0;filter:drop-shadow(0 1px 2px ${iconColor}4d)"><use xlink:href="${icon}"/></svg><span style="font-size:13px;font-weight:600;color:var(--b3-theme-on-surface);text-shadow:0 1px 2px rgba(0,0,0,.05)">${title}</span>${id ? `<span style="font-size:10px;color:var(--b3-theme-on-surface-variant);margin-left:auto;opacity:0.6;font-weight:400">${id}</span>` : ''}</div>`;
  return header + content;
};

export const showTooltip = (tooltip: HTMLElement, x: number, y: number) => {
  Object.assign(tooltip.style, { opacity: '0', transform: 'translateY(-8px)', display: 'block', left: x + 'px', top: y + 'px' });
  requestAnimationFrame(() => {
    const { width: w, height: h } = tooltip.getBoundingClientRect();
    Object.assign(tooltip.style, { 
      left: Math.max(10, Math.min(window.innerWidth - w - 10, x)) + 'px', 
      top: Math.max(10, Math.min(window.innerHeight - h - 10, y)) + 'px', 
      opacity: '1', 
      transform: 'translateY(0)' 
    });
  });
};

export const hideTooltip = (tooltip: HTMLElement, delay = 200) => {
  tooltip.style.opacity = '0';
  tooltip.style.transform = 'translateY(-8px)';
  setTimeout(() => tooltip.style.display = 'none', delay);
};

// ========== 标注渲染�?==========

/**
 * 标注渲染�?- 统一渲染接口
 */
class AnnotationRenderer {
  private format: 'pdf' | 'epub' | 'txt';
  private view?: any;
  
  constructor(config: { format: 'pdf' | 'epub' | 'txt'; view?: any; pdfViewer?: any }) {
    this.format = config.format;
    this.view = config.view;
  }
  
  async renderHighlight(annotation: Annotation): Promise<void> {
    if (this.format === 'pdf') {
      // PDF 渲染逻辑�?AnnotationManager.renderPdf 中处�?
      return;
    } else if (this.format === 'epub' && this.view?.addAnnotation && annotation.cfi) {
      await this.view.addAnnotation({
        value: annotation.cfi,
        color: annotation.color,
        note: annotation.note
      }).catch(() => {});
    } else if (this.format === 'txt') {
      // TXT 渲染逻辑�?AnnotationManager.renderTxt 中处�?
      return;
    }
  }
  
  async renderNote(annotation: Annotation): Promise<void> {
    await this.renderHighlight(annotation);
  }
  
  renderShape(_annotation: Annotation): void {
    if (this.format !== 'pdf') {
      console.warn('[AnnotationRenderer] Shape annotations are only supported for PDF');
      return;
    }
  }
  
  renderInk(_annotation: Annotation): void {
    if (this.format !== 'pdf') {
      console.warn('[AnnotationRenderer] Ink annotations are only supported for PDF');
      return;
    }
  }
  
  async updateAnnotation(annotation: Annotation): Promise<void> {
    if (this.format === 'pdf') {
      this.removeAnnotation(annotation.id);
      await this.renderHighlight(annotation);
    } else if (this.format === 'epub' && this.view && annotation.cfi) {
      await this.view.deleteAnnotation?.({ value: annotation.cfi }).catch(() => {});
      await this.view.addAnnotation?.({
        value: annotation.cfi,
        color: annotation.color,
        note: annotation.note
      }).catch(() => {});
    } else if (this.format === 'txt') {
      this.removeAnnotation(annotation.id);
      await this.renderHighlight(annotation);
    }
  }
  
  removeAnnotation(id: string): void {
    if (this.format === 'pdf') {
      document.querySelectorAll(`[data-id="${id}"]`).forEach(el => el.remove());
      document.querySelectorAll(`[data-mark-id="${id}"]`).forEach(el => el.remove());
    } else if (this.format === 'epub' && this.view?.renderer) {
      this.view.renderer.getContents?.()?.forEach(({ doc }: any) => {
        doc?.querySelectorAll(`[data-mark-id="${id}"]`).forEach((el: Element) => el.remove());
      });
    } else if (this.format === 'txt' && this.view?.renderer) {
      this.view.renderer.getContents?.()?.forEach(({ doc }: any) => {
        doc?.querySelectorAll(`[data-mark-id="${id}"]`).forEach((el: HTMLElement) => {
          while (el.firstChild) {
            el.parentNode?.insertBefore(el.firstChild, el);
          }
          el.remove();
        });
      });
    }
  }
}

// ========== 标注管理�?==========

/**
 * 标注管理�?- 数据管理 + 渲染
 */
export class AnnotationManager {
  private book: string;
  private format: 'pdf' | 'epub' | 'txt';
  private annotations: Annotation[] = [];
  private annotationsMap = new Map<string, Annotation>();
  private initialized = false;
  private renderer: AnnotationRenderer;
  private view?: any;
  private pdfViewer?: any;
  private reader?: any;
  private saveTimer: any;
  private autoSaveTimer: any;
  
  constructor(config: AnnotationManagerConfig) {
    this.book = config.book;
    this.format = config.format;
    this.view = config.view;
    this.pdfViewer = config.pdfViewer;
    this.reader = config.reader;
    this.renderer = new AnnotationRenderer({
      format: config.format,
      view: config.view,
      pdfViewer: config.pdfViewer
    });
    this.startAutoSave();
  }
  
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      this.updateProgress();
    }, 30000);
  }
  
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const db = await getDatabase();
      const annotations = await db.getAnnotations(this.book);
      this.annotations = annotations;
      this.annotationsMap.clear();
      
      for (const ann of annotations) {
        this.annotationsMap.set(ann.id, ann);
      }
      
      this.initialized = true;
      
    } catch (error) {
      console.error('[AnnotationManager] Failed to load annotations:', error);
      throw error;
    }
  }
  
  // ==================== 通用标注方法 ====================
  
  async addHighlight(
    location: string,
    text: string,
    color: HighlightColor = 'yellow',
    style: HighlightStyle = 'highlight',
    options?: {
      page?: number;
      rects?: any[];
      cfi?: string;
      section?: number;
    }
  ): Promise<Annotation> {
    const annotation: Annotation = {
      id: `highlight-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      book: this.book,
      type: 'highlight',
      location,
      text: text.substring(0, 200),
      color: getColorBg(color),
      created: Date.now(),
      updated: Date.now(),
      page: options?.page,
      rects: options?.rects,
      cfi: options?.cfi,
      style
    };
    
    const db = await getDatabase();
    await db.addAnnotation(annotation);
    
    this.annotations.push(annotation);
    this.annotationsMap.set(annotation.id, annotation);
    
    await this.renderer.renderHighlight(annotation);
    window.dispatchEvent(new Event('sireader:marks-updated'));
    
    return annotation;
  }
  
  async addNote(
    location: string,
    note: string,
    text: string,
    color: HighlightColor = 'blue',
    style: HighlightStyle = 'outline',
    options?: {
      page?: number;
      rects?: any[];
      cfi?: string;
      section?: number;
    }
  ): Promise<Annotation> {
    const annotation: Annotation = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      book: this.book,
      type: 'note',
      location,
      text: text.substring(0, 200),
      note,
      color: getColorBg(color),
      created: Date.now(),
      updated: Date.now(),
      page: options?.page,
      rects: options?.rects,
      cfi: options?.cfi,
      style
    };
    
    const db = await getDatabase();
    await db.addAnnotation(annotation);
    
    this.annotations.push(annotation);
    this.annotationsMap.set(annotation.id, annotation);
    
    await this.renderer.renderNote(annotation);
    window.dispatchEvent(new Event('sireader:marks-updated'));
    
    return annotation;
  }
  
  async addBookmark(
    location: string,
    title: string,
    options?: {
      page?: number;
      cfi?: string;
      section?: number;
      progress?: number;
    }
  ): Promise<Annotation> {
    const existing = this.annotations.find(
      a => a.type === 'bookmark' && a.location === location
    );
    
    if (existing) {
      throw new Error('书签已存在');
    }
    
    const annotation: Annotation = {
      id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      book: this.book,
      type: 'bookmark',
      location,
      text: title,
      color: '#2196f3',
      created: Date.now(),
      updated: Date.now(),
      page: options?.page,
      cfi: options?.cfi
    };
    
    const db = await getDatabase();
    await db.addAnnotation(annotation);
    
    this.annotations.push(annotation);
    this.annotationsMap.set(annotation.id, annotation);
    
    window.dispatchEvent(new Event('sireader:marks-updated'));
    
    return annotation;
  }
  
  // ==================== PDF 特有方法 ====================
  
  async addShape(
    page: number,
    shapeType: ShapeType,
    rect: any,
    color: string = '#ff0000',
    filled: boolean = false
  ): Promise<Annotation> {
    if (this.format !== 'pdf') {
      throw new Error('Shape annotations are only supported for PDF');
    }
    
    const annotation: Annotation = {
      id: `shape-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      book: this.book,
      type: 'shape',
      location: `page-${page}`,
      color,
      created: Date.now(),
      updated: Date.now(),
      page,
      rect,
      rects: [rect],
      shapeType,
      filled
    };
    
    const db = await getDatabase();
    await db.addAnnotation(annotation);
    
    this.annotations.push(annotation);
    this.annotationsMap.set(annotation.id, annotation);
    
    this.renderer.renderShape(annotation);
    window.dispatchEvent(new Event('sireader:marks-updated'));
    
    return annotation;
  }
  
  async addInk(
    page: number,
    paths: any[],
    color: string = '#000000'
  ): Promise<Annotation> {
    if (this.format !== 'pdf') {
      throw new Error('Ink annotations are only supported for PDF');
    }
    
    const annotation: Annotation = {
      id: `ink-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      book: this.book,
      type: 'ink',
      location: `page-${page}`,
      color,
      created: Date.now(),
      updated: Date.now(),
      page,
      paths
    };
    
    const db = await getDatabase();
    await db.addAnnotation(annotation);
    
    this.annotations.push(annotation);
    this.annotationsMap.set(annotation.id, annotation);
    
    this.renderer.renderInk(annotation);
    window.dispatchEvent(new Event('sireader:marks-updated'));
    
    return annotation;
  }
  
  // ==================== CRUD 方法 ====================
  
  async update(id: string, updates: Partial<Annotation>): Promise<boolean> {
    const annotation = this.annotationsMap.get(id);
    if (!annotation) {
      console.warn('[AnnotationManager] Annotation not found:', id);
      return false;
    }
    
    Object.assign(annotation, updates, { updated: Date.now() });
    
    const db = await getDatabase();
    await db.addAnnotation(annotation);
    
    await this.renderer.updateAnnotation(annotation);
    window.dispatchEvent(new Event('sireader:marks-updated'));
    
    return true;
  }
  
  async delete(id: string): Promise<boolean> {
    const annotation = this.annotationsMap.get(id);
    if (!annotation) {
      console.warn('[AnnotationManager] Annotation not found:', id);
      return false;
    }
    
    const db = await getDatabase();
    await db.deleteAnnotation(id);
    
    const index = this.annotations.findIndex(a => a.id === id);
    if (index >= 0) {
      this.annotations.splice(index, 1);
    }
    this.annotationsMap.delete(id);
    
    this.renderer.removeAnnotation(id);
    window.dispatchEvent(new Event('sireader:marks-updated'));
    
    return true;
  }
  
  getAll(): Annotation[] {
    return [...this.annotations];
  }
  
  getByType(type: AnnotationType): Annotation[] {
    return this.annotations.filter(a => a.type === type);
  }
  
  getAnnotations(color?: HighlightColor): Annotation[] {
    const annotations = this.annotations.filter(
      a => a.type === 'highlight' || a.type === 'note'
    );
    
    if (color) {
      const colorBg = getColorBg(color);
      return annotations.filter(a => a.color === colorBg);
    }
    
    return annotations;
  }
  
  getBookmarks(): Annotation[] {
    return this.annotations
      .filter(a => a.type === 'bookmark')
      .sort((a, b) => a.created - b.created);
  }
  
  getNotes(): Annotation[] {
    return this.annotations.filter(a => a.type === 'note');
  }
  
  getInkAnnotations(): any[] {
    return (this as any).inkManager?.toJSON?.() || [];
  }
  
  getShapeAnnotations(): any[] {
    return (this as any).shapeManager?.toJSON?.() || [];
  }
  
  hasBookmark(location?: string): boolean {
    if (!location) {
      const l = this.view?.lastLocation;
      const useLoc = this.format === 'pdf' ? (this.pdfViewer?.getCurrentPage() || 1) : l?.cfi || l?.section;
      return this.annotations.some(
        a => a.type === 'bookmark' && (a.cfi === useLoc || a.page === useLoc || a.section === useLoc)
      );
    }
    return this.annotations.some(a => a.type === 'bookmark' && a.location === location);
  }
  
  async toggleBookmark(location?: string, title?: string): Promise<boolean> {
    if (!location || !title) {
      const l = this.view?.lastLocation;
      const useLoc = this.format === 'pdf' ? (this.pdfViewer?.getCurrentPage() || 1) : l?.cfi || l?.section;
      const existing = this.annotations.find(
        a => a.type === 'bookmark' && (a.cfi === useLoc || a.page === useLoc || a.section === useLoc)
      );
      
      if (existing) {
        await this.delete(existing.id);
        return false;
      }
      
      const autoTitle = title || l?.tocItem?.label || `�?{(useLoc || 0) + 1}章`;
      const options: any = { progress: Math.round((l?.fraction || 0) * 100) };
      
      if (this.format === 'pdf') options.page = useLoc as number;
      else if (typeof useLoc === 'string') options.cfi = useLoc;
      else options.section = useLoc as number;
      
      await this.addBookmark(
        typeof useLoc === 'string' ? useLoc : `${this.format}-${useLoc}`,
        autoTitle,
        options
      );
      return true;
    }
    
    const existing = this.annotations.find(a => a.type === 'bookmark' && a.location === location);
    if (existing) {
      await this.delete(existing.id);
      return false;
    }
    await this.addBookmark(location, title);
    return true;
  }
  
  async goTo(annotation: Annotation): Promise<void> {
    const detail = {
      cfi: annotation.cfi,
      page: annotation.page,
      section: annotation.section,
      id: annotation.id
    };
    
    window.dispatchEvent(new CustomEvent('sireader:goto', { detail }));
  }
  
  // ==================== 进度管理 ====================
  
  async restoreProgress(bookInfo?: any): Promise<void> {
    if (!bookInfo) return;
    const cfi = bookInfo.pos?.cfi || bookInfo.epubCfi, chapter = bookInfo.chapter ?? bookInfo.durChapterIndex, page = bookInfo.pos?.page ?? bookInfo.durChapterIndex;
    if (this.format === 'pdf' && this.pdfViewer) {
      const p = cfi?.startsWith('#page-') ? parseInt(cfi.replace('#page-', '')) : page;
      if (p && p >= 1 && p <= this.pdfViewer.getPageCount()) this.pdfViewer.goToPage(p);
    } else if (this.reader && (cfi || chapter !== undefined)) await this.reader.goTo(cfi ?? chapter);
    else if (this.view?.goTo && chapter !== undefined) await this.view.goTo(chapter);
  }
  
  updateProgress(): void {
    const loc = this.format === 'pdf' ? { page: this.pdfViewer?.getCurrentPage() || 1, total: this.pdfViewer?.getPageCount() || 1 } : this.reader?.getView().lastLocation ?? this.view?.getLocation?.() ?? this.view?.lastLocation;
    if (!loc) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      if (!this.initialized) return;
      try {
        const [db, { bookshelfManager }] = await Promise.all([getDatabase(), import('./bookshelf')]);
        await Promise.all(this.annotations.filter(a => ['highlight','note','bookmark'].includes(a.type)).map(a => db.addAnnotation(a)));
        const progress = this.format === 'pdf' ? Math.round(((loc.page || 1) / (loc.total || 1)) * 100) : Math.round((loc.fraction ?? 0) * 100);
        const chapter = this.format === 'pdf' ? loc.page || 1 : loc.section?.current ?? loc.section ?? 0;
        const cfi = this.format === 'pdf' ? `#page-${loc.page || 1}` : loc.cfi;
        await bookshelfManager.updateProgress(this.book, progress, chapter, cfi);
        window.dispatchEvent(new Event('sireader:marks-updated'));
      } catch {}
    }, 300);
  }
  
  // ==================== 渲染方法 ====================
  
  renderPdf(page: number): void {
    if (this.format !== 'pdf' || !this.pdfViewer) return;
    
    const layer = document.querySelector(`[data-page="${page}"] .pdf-annotation-layer`) as HTMLElement;
    if (!layer) return;
    
    // 清理旧的渲染
    layer.querySelectorAll('[data-note-marker],.pdf-highlight').forEach(el => el.remove());
    this.annotations.filter(m => m.page === page).forEach(m => {
      document.querySelectorAll(`[data-note-tooltip][data-mark-id="${m.id}"]`).forEach(el => el.remove());
    });
    
    const pdfPage = this.pdfViewer.getPages().get(page);
    if (!pdfPage) return;
    
    const viewport = pdfPage.getViewport({ scale: this.pdfViewer.getScale(), rotation: this.pdfViewer.getRotation() });
    
    this.annotations.filter(m => m.page === page && (m.type === 'highlight' || m.type === 'note')).forEach(m => {
      const bg = m.color || '#ffeb3b';
      const style = m.style || 'highlight';
      
      m.rects?.forEach((r, idx) => {
        // Handle both old format (w/h) and new format (width/height)
        const rectWidth = (r as any).w || (r as any).width || 0;
        const rectHeight = (r as any).h || (r as any).height || 0;
        
        const bounds = viewport.convertToViewportRectangle([r.x, r.y, r.x + rectWidth, r.y + rectHeight]);
        const vw = Math.abs(bounds[0] - bounds[2]);
        const vh = Math.abs(bounds[1] - bounds[3]);
        if (vw <= 0 || vh <= 0) return;
        
        const vx = Math.min(bounds[0], bounds[2]);
        const vy = Math.min(bounds[1], bounds[3]);
        
        const div = document.createElement('div');
        const base = `position:absolute;left:${vx}px;top:${vy}px;width:${vw}px;height:${vh}px;pointer-events:auto;cursor:pointer`;
        div.className = `pdf-highlight pdf-${style}`;
        div.dataset.id = m.id;
        
        const w = style === 'double' ? '4px' : '2px';
        div.style.cssText = style === 'highlight' 
          ? `${base};background:${bg};opacity:0.3`
          : style === 'underline'
          ? `${base};border-bottom:2px solid ${bg};opacity:0.8`
          : style === 'outline'
          ? `${base};border:2px solid ${bg};opacity:0.8`
          : `${base};border-bottom:${w} ${style} ${bg};opacity:0.8`;
        
        div.onclick = () => window.dispatchEvent(new CustomEvent('sireader:annotation-click', { detail: m }));
        layer.appendChild(div);
        
        // 添加笔记标记
        if (m.note && idx === m.rects!.length - 1) {
          this.createNoteMarker(m, { x: vx, y: vy, w: vw, h: vh }, layer);
        }
      });
    });
  }
  
  private createNoteMarker(m: Annotation, r: any, layer: HTMLElement): void {
    if (layer.querySelector(`[data-note-marker][data-mark-id="${m.id}"]`)) return;
    
    const marker = document.createElement('span');
    marker.setAttribute('data-note-marker', 'true');
    marker.setAttribute('data-mark-id', m.id);
    marker.textContent = m.type === 'note' ? '📒' : '🌐';
    marker.style.cssText = `position:absolute;left:${r.x + r.w + 3}px;top:${r.y - 5}px;font-size:14px;cursor:pointer;user-select:none;opacity:0.85;transition:opacity .2s;pointer-events:auto;z-index:12`;
    
    marker.onclick = () => window.dispatchEvent(new CustomEvent('sireader:annotation-click', { detail: m }));
    layer.appendChild(marker);
  }
  
  renderTxt(doc: Document, section: number, markId?: string): void {
    if (this.format !== 'txt' || !doc?.body) return;
    
    try {
      const marksToRender = markId 
        ? this.annotations.filter(m => m.id === markId && m.section === section)
        : this.annotations.filter(m => m.section === section && m.type !== 'bookmark' && !doc.querySelector(`[data-mark-id="${m.id}"]`));
      
      marksToRender.forEach(m => {
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
          acceptNode: n => n.parentElement?.hasAttribute('data-txt-mark') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        
        for (let node: Node | null; node = walker.nextNode();) {
          const idx = (node.textContent || '').indexOf(m.text || '');
          if (idx > -1 && node.textContent!.length > 10) {
            const range = doc.createRange();
            const span = doc.createElement('span');
            const color = m.color || '#ffeb3b';
            const s = m.style || 'highlight';
            
            range.setStart(node, idx);
            range.setEnd(node, idx + (m.text?.length || 0));
            
            span.setAttribute('data-txt-mark', '');
            span.setAttribute('data-mark-id', m.id);
            
            Object.assign(span.style, 
              s === 'highlight' ? { backgroundColor: color } :
              s === 'underline' ? { borderBottom: `2px solid ${color}`, paddingBottom: '2px' } :
              s === 'outline' ? { border: `2px solid ${color}`, padding: '0 2px', borderRadius: '2px' } :
              { textDecoration: 'underline wavy', textDecorationColor: color },
              { cursor: 'pointer' }
            );
            
            span.onclick = e => {
              e.stopPropagation();
              const r = span.getBoundingClientRect();
              const ir = (doc.defaultView?.frameElement as HTMLIFrameElement)?.getBoundingClientRect();
              window.dispatchEvent(new CustomEvent('txt-annotation-click', {
                detail: { mark: m, x: (ir?.left || 0) + r.left + r.width / 2, y: (ir?.top || 0) + r.top + r.height }
              }));
            };
            
            range.surroundContents(span);
            break;
          }
        }
      });
    } catch (e) {
      console.error('[AnnotationManager] renderTxt:', e);
    }
  }
  
  bindTxtDocEvents(doc: Document, section: number): void {
    if (!doc?.body || (doc as any).__txtEventsBound) return;
    
    try {
      doc.addEventListener('mouseup', e => 
        window.dispatchEvent(new CustomEvent('txt-selection', { detail: { doc, event: e } }))
      );
      
      this.renderTxt(doc, section);
      (doc as any).__txtEventsBound = true;
    } catch (e) {
      console.error('[AnnotationManager] bindTxtDocEvents:', e);
    }
  }
  
  async destroy(): Promise<void> {
    clearTimeout(this.saveTimer);
    clearInterval(this.autoSaveTimer);
    if (!this.initialized) { this.annotations = []; this.annotationsMap.clear(); return; }
    try {
      const [db, { bookshelfManager }] = await Promise.all([getDatabase(), import('./bookshelf')]);
      await Promise.all(this.annotations.filter(a => ['highlight','note','bookmark'].includes(a.type)).map(a => db.addAnnotation(a)));
      const loc = this.format === 'pdf' ? { page: this.pdfViewer?.getCurrentPage() || 1, total: this.pdfViewer?.getPageCount() || 1 } : this.reader?.getView().lastLocation ?? this.view?.lastLocation;
      if (loc) {
        const progress = this.format === 'pdf' ? Math.round(((loc.page || 1) / (loc.total || 1)) * 100) : Math.round((loc.fraction ?? 0) * 100);
        const chapter = this.format === 'pdf' ? loc.page || 1 : loc.section?.current ?? loc.section ?? 0;
        const cfi = this.format === 'pdf' ? `#page-${loc.page || 1}` : loc.cfi;
        await bookshelfManager.updateProgress(this.book, progress, chapter, cfi);
      }
    } catch {}
    this.annotations = [];
    this.annotationsMap.clear();
    this.initialized = false;
  }
}

// ========== 导出 ==========

export { AnnotationRenderer };
export type { Annotation, AnnotationType };

export const createAnnotationManager = (config: AnnotationManagerConfig): AnnotationManager => {
  return new AnnotationManager(config);
};

