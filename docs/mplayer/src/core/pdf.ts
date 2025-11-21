import type { MediaItem } from './types';
import { Dialog } from 'siyuan';

// 在思源中打开 PDF（优先右侧分栏 Tab）
export const openPdf = async (item: MediaItem): Promise<void> => {
  try {
    // 思源空间：使用原生右侧分栏打开
    if (item.source === 'siyuan' || (!item.url.includes('://') && !item.url.startsWith('file://'))) {
      const rel = item.originalUrl || item.url; // data/ 下的相对路径
      if (rel.startsWith('assets/')) {
        const app = (window as any).siyuan?.ws?.app || (window as any).app;
        if (app?.openAsset) { app.openAsset(rel, 1, 'right'); return; }
        window.dispatchEvent(new CustomEvent('open-asset', { detail: { assetPath: rel } }));
        return;
      }
      // 非 assets：用 Dialog + iframe 内嵌直链
      const fileUrl = `/api/file/getFile?path=data/${encodeURIComponent(rel)}`;
      new Dialog({ title: item.title || 'PDF', width: '80vw', height: '80vh', content: `<iframe src="${fileUrl}" style="width:100%;height:100%;border:0;"></iframe>` });
      return;
    }

    // WebDAV：Dialog + iframe 打开直链
    if (item.source === 'webdav' || (item.url || '').startsWith('webdav://path')) {
      try {
        const { WebDAVManager } = await import('./webdav');
        const raw = item.sourcePath || decodeURIComponent((item.url || '').substring('webdav://path'.length));
        const link = await WebDAVManager.getFileLink(raw);
        new Dialog({ title: item.title || 'PDF', width: '80vw', height: '80vh', content: `<iframe src="${link}" style="width:100%;height:100%;border:0;"></iframe>` });
        return;
      } catch {}
    }

    // AliyunDrive: Dialog + iframe 打开下载直链
    if (item.source === 'alidrive') {
      try {
        const { AliDriveManager } = await import('./alidrive');
        const fileId = (item.id || '').split('-').pop();
        if (fileId) {
          const { url } = await AliDriveManager.getDownloadUrl(fileId);
          new Dialog({ title: item.title || 'PDF', width: '80vw', height: '80vh', content: `<iframe src="${url}" style="width:100%;height:100%;border:0;"></iframe>` });
          return;
        }
      } catch {}
    }

    // BaiduDrive: Dialog + iframe 打开下载直链
    if (item.source === 'baidudrive') {
      try {
        const { BaiduDriveManager } = await import('./baidudrive');
        const fsid = (item.id || '').split('-').pop();
        if (fsid) {
          const link = await BaiduDriveManager.getDownloadLink(fsid);
          new Dialog({ title: item.title || 'PDF', width: '80vw', height: '80vh', content: `<iframe src="${link}" style="width:100%;height:100%;border:0;"></iframe>` });
          return;
        }
      } catch {}
    }

    // OpenList：Dialog + iframe 打开可访问直链
    if (item.source === 'openlist') {
      try {
        const { OpenListManager } = await import('./openlist');
        const path = (item as any).sourcePath || '';
        const link = path ? await OpenListManager.getFileLink(path) : (item.originalUrl || item.url);
        new Dialog({ title: item.title || 'PDF', width: '80vw', height: '80vh', content: `<iframe src="${link}" style="width:100%;height:100%;border:0;"></iframe>` });
        return;
      } catch {}
    }

    // 本地/其他：Dialog + iframe
    const url = item.originalUrl || item.url;
    new Dialog({ title: item.title || 'PDF', width: '80vw', height: '80vh', content: `<iframe src="${url}" style="width:100%;height:100%;border:0;"></iframe>` });
  } catch (e) {
    console.error('openPdf failed:', e);
  }
};

