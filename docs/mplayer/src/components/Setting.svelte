<script lang="ts">
    import { onMount } from "svelte";
    import { showMessage, getFrontend, Menu } from "siyuan";
    import type { ISettingItem, SettingType } from "../core/types";
    import Tabs from './Tabs.svelte';
    import { notebook, doc } from "../core/document";
    import { QRCodeManager, isBilibiliAvailable } from "../core/bilibili";
    import { AliDriveManager } from "../core/alidrive";
    import { LicenseManager, type LicenseInfo } from "../core/license";
    import { WebDAVManager } from "../core/webdav";
    import { OpenListManager } from "../core/openlist";
    import { BaiduDriveManager } from "../core/baidudrive";
    export let group: string;
    import { Pan123Manager } from "../core/123pan";
    import { QuarkTVManager } from "../core/quarktv";
    import { S3Manager } from "../core/s3";
    export let config: any;
    export let i18n: any;
    export let activeTabId = 'settings';
    export let plugin: any;

    // 工具函数
    const msg = { success: (m) => showMessage(m, 2000, 'info'), error: (m) => showMessage(m, 3000, 'error') };
    const getConfig = async () => await plugin.loadData('config.json') || {};
    const saveAppState = async () => { const cfg = await getConfig(); cfg.settings = appState.config; (window as any).__siyuanMediaPlayerIgnoreCert = appState.config.ignoreCertificateErrors; await plugin.saveData('config.json', cfg, 2); window.dispatchEvent(new CustomEvent('configUpdated', { detail: cfg })); };
    const processDbId = async (id: string) => { if (!id || !/^\d{14}-[a-z0-9]{7}$/.test(id)) return { id, avId: '' }; const avId = (await fetch('/api/query/sql', { method: 'POST', body: JSON.stringify({ stmt: `SELECT markdown FROM blocks WHERE type='av' AND id='${id}'` }) }).then(r => r.json()).catch(() => ({ data: [] }))).data?.[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1]; return { id, avId: avId || id }; };
    const initDb = async (id: string) => { try { const { avId } = await processDbId(id); const result = await fetch('/api/av/getAttributeView', { method: 'POST', body: JSON.stringify({ id: avId }) }).then(r => r.json()).catch(() => ({ code: -1 })); return result.code === 0; } catch { return false; } };

    // 统一状态管理
    let appState = {
        config: {
            allowMultipleInstances: false, openMode: "default", playerType: "built-in", playerPath: "PotPlayerMini64.exe", potplayerPath: "PotPlayerMini64.exe", vlcPath: "vlc.exe", mpvPath: "mpv.exe",
            volume: 70, speed: 100, customSpeed: 300, showSubtitles: false, subtitleFontSize: 24, subtitleStyle: 'default', enableDanmaku: false, danmakuSpeed: 5, danmakuOpacity: 90, danmakuFontSize: 25, danmakuArea: 75,
            loopCount: 3, pauseAfterLoop: false, loopPlaylist: false, loopSingle: false, skipOpening: 0, skipEnding: 0,
            insertMode: "updateBlock", screenshotWithTimestamp: false, ignoreCertificateErrors: false,
            screenshotFormat: "png", screenshotQuality: 92, showMobileFloatButton: true,
            mediaNotesMode: "current",
            notebook: { id: '', name: '' }, parentDoc: { id: '', name: '', path: '' },
            playlistSource: 'document',
            playlistBoundDoc: { id: '', name: '', path: '', notebook: '' },
            // playlistView: { mode: 'detailed', tab: '目录', expanded: [] },
            playlistDisplayElements: {},
            playlistTheme: 'default', playlistDensity: 50, playlistAspect: 'auto', playlistScale: 100,
            mediaViewSize: '',
            defaultThumbFolder: '', defaultThumbVideo: '', defaultThumbAudio: '', defaultThumbPdf: '',
            aiAccounts: [],
            linkFormat: "- [😄标题 艺术家 字幕 时间](链接)",
            mediaNotesTemplate: "# 📽️ 标题的媒体笔记\n- 📅 日 期：日期\n- ⏱️ 时 长：时长\n- 🎨 艺 术 家：艺术家\n- 🔖 类 型：类型\n-  链 接：[链接](链接)\n- ![封面](封面)\n- 📝 笔记内容：",
            webdavAccounts: [], openlistAccounts: [], pan123Accounts: [], bilibiliAccounts: [], alidriveAccounts: [], baidudriveAccounts: [], quarktvAccounts: [], s3Accounts: [], playlistdbAccounts: []
        },
        ui: { activeTab: 'account', editingAccount: null, editingData: {}, licenseCode: '', expandedGroups: {} },
        runtime: { notebooks: [], notebookOptions: [], playlistDocOptions: [], currentLicense: null, qrCodeManager: null, qrcode: { data: '', key: '', message: '' }, aliQrStop: null, baiduQrStop: null, quarkQrStop: null }
    };

    // 响应式计算
$: accounts = [
  ...(appState.config.webdavAccounts || []).map(acc => ({ ...acc, type: 'webdav' })),
  ...(appState.config.openlistAccounts || []).map(acc => ({ ...acc, type: 'openlist' })),
  ...(appState.config.pan123Accounts || []).map(acc => ({ ...acc, type: 'pan123' })),
  ...(appState.config.aiAccounts || []).map(acc => ({ ...acc, type: 'ai' })),
  ...(appState.config.bilibiliAccounts || []).map(acc => ({ ...acc, type: 'bilibili' })),
  ...(appState.config.alidriveAccounts || []).map(acc => ({ ...acc, type: 'alidrive' })),
  ...(appState.config.baidudriveAccounts || []).map(acc => ({ ...acc, type: 'baidudrive' })),
  ...(appState.config.quarktvAccounts || []).map(acc => ({ ...acc, type: 'quarktv' })),
  ...(appState.config.s3Accounts || []).map(acc => ({ ...acc, type: 's3' })),
  ...(appState.config.playlistdbAccounts || []).map(acc => ({ ...acc, type: 'playlistdb' }))
];
    $: settingItems = createSettings(appState.config, accounts);

    // 配置定义
    const ACCOUNT_TYPES = {
        webdav: { name: 'WebDAV', fields: ['name', 'server', 'username', 'password'] },
        openlist: { name: 'OpenList/Alist', fields: ['name', 'server', 'prefix', 'username', 'password'] },
        pan123: { name: '123云盘', fields: ['client_id','client_secret','root_id'] },
        ai: { name: 'AI', fields: ['provider','base','apiKey','model','apiVersion','path'] },
        ...(isBilibiliAvailable() ? { bilibili: { name: 'B站', fields: [] } } : {}),
        alidrive: { name: '阿里云盘', fields: ['client_id','client_secret','scopes'] },
        baidudrive: { name: '百度网盘', fields: ['auth_code'] },
        quarktv: { name: '夸克网盘', fields: [] },
        s3: { name: 'S3存储', fields: ['name','bucket','endpoint','region','accessKeyId','secretAccessKey','forcePathStyle'] },
        playlistdb: { name: '播放列表', fields: ['name'] }
    };

    const g = (k, d) => ({ id: k, name: () => i18n.setting?.groups?.[k] || d });
    const ACCOUNT_TYPE_ICONS = {
        s3: `<svg viewBox="0 0 1024 1024"><path d="M133.333333 640h768v234.666667h-768z" fill="#FDC079"/><path d="M768 757.333333m-42.666667 0a42.666667 42.666667 0 1 0 85.333334 0 42.666667 42.666667 0 1 0-85.333334 0Z" fill="#1A1B1C"/><path d="M896 672H128c-18.133333 0-32-13.866667-32-32s13.866667-32 32-32h768c18.133333 0 32 13.866667 32 32s-13.866667 32-32 32z" fill="#1A1B1C"/><path d="M896 906.666667H128c-18.133333 0-32-13.866667-32-32V640c0-2.133333 0-5.333333 1.066667-7.466667l115.2-490.666666c3.2-14.933333 16-24.533333 30.933333-24.533334h537.6c14.933333 0 27.733333 10.666667 30.933333 24.533334l115.2 490.666666c1.066667 2.133333 1.066667 5.333333 1.066667 7.466667v234.666667c0 18.133333-13.866667 32-32 32z m-736-64h704V643.2L755.2 181.333333H268.8L160 643.2V842.666667z" fill="#1A1B1C"/><path d="M512 551.466667c-38.4 0-91.733333-34.133333-107.733333-44.8l35.2-53.333334c23.466667 16 59.733333 34.133333 72.533333 34.133334 26.666667 0 36.266667-3.2 49.066667-21.333334 4.266667-7.466667-2.133333-24.533333-9.6-28.8-8.533333-6.4-45.866667-21.333333-75.733334-30.933333h-1.066666c-25.6-9.6-43.733333-28.8-52.266667-52.266667-8.533333-23.466667-6.4-51.2 6.4-73.6 17.066667-29.866667 49.066667-46.933333 89.6-46.933333 56.533333 0 100.266667 35.2 104.533333 39.466667L581.333333 320s-30.933333-24.533333-64-24.533333c-9.6 0-26.666667 2.133333-33.066666 13.866666-4.266667 7.466667-4.266667 14.933333-2.133334 21.333334 2.133333 6.4 7.466667 11.733333 14.933334 14.933333 17.066667 6.4 72.533333 25.6 92.8 40.533333 32 23.466667 50.133333 77.866667 24.533333 116.266667-32 44.8-68.266667 49.066667-102.4 49.066667z" fill="#1A1B1C"/></svg>`,
        playlistdb: `<svg t="1760864403235" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6802"><path d="M0 0m204.8 0l614.4 0q204.8 0 204.8 204.8l0 614.4q0 204.8-204.8 204.8l-614.4 0q-204.8 0-204.8-204.8l0-614.4q0-204.8 204.8-204.8Z" fill="#2196F3" p-id="6803"></path><path d="M476.928 259.4048c-121.9328 0-220.928 30.8224-220.928 69.0432v55.1168c0 38.0416 98.7904 69.0432 220.928 69.0432 121.9328 0 220.928-30.8224 220.928-69.0432V328.448c-0.0256-38.2208-98.9952-69.0432-220.928-69.0432z m253.7216 254.3872h-176.0768c-18.688 0.256-33.664 15.616-33.3824 34.3296v153.856c0 19.2512 15.1552 34.3808 33.3824 34.3808h176.0768a33.8688 33.8688 0 0 0 33.408-34.3808v-153.856a33.8176 33.8176 0 0 0-33.3056-34.3296h-0.1024z m13.184 34.3296v17.2288H713.472V534.016h17.2288c7.0656 0 13.1328 6.0672 13.1328 14.1056z m-172.0832 94.1824H541.44v-34.4576h30.336v34.4576z m141.7216-34.4576h30.3616v34.432H713.472v-34.432z m-20.224-73.8304v182.1696h-101.2224V534.016h101.2224z m-138.6752 0h17.1776v31.3344H541.44v-17.2288c0-8.0384 6.0672-14.1056 13.1584-14.1056z m-13.1584 167.9616v-17.1776h30.336v31.3344h-17.1776c-7.0912 0.0512-13.1584-6.016-13.1584-14.1568z m189.2352 14.208h-17.2032V684.8h30.336v17.2032c0.0512 8.0896-6.016 14.1568-13.1328 14.1568z m-56.6272-91.1104l-58.752-42.496v85.0432l58.752-42.5472z m-169.2672-92.16c0-17.664 14.3872-32 32.0512-32h161.024v-75.9296c0 38.272-98.9696 69.0944-220.928 69.0944C354.9952 494.0544 256 463.2576 256 424.9856v82.7648c0 38.0416 98.7904 69.0944 220.928 69.0944 9.472 0 18.7136-0.256 27.8272-0.5888v-43.3408z m0.4096 84.7104a712.96 712.96 0 0 1-28.2368 0.6144c-121.9328 0-220.6976-30.8736-220.6976-69.12v82.8416c0 37.9648 98.7648 69.0688 220.928 69.0688 9.4976 0 18.816-0.256 28.0064-0.6144v-82.7904z" fill="#FFFFFF" p-id="6804"></path></svg>`,
        openlist: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'><defs><style>.cls-1{fill:#38bdf8}.cls-2{fill:#99f6e4}</style></defs><g><path class='cls-1' d='M244.57,776.75c-10.1,0-20.31-2.78-29.46-8.59-25.63-16.3-33.2-50.29-16.9-75.92l201.93-317.6c16.3-25.63,50.29-33.2,75.92-16.9,25.63,16.3,33.2,50.29,16.9,75.92l-201.93,317.6c-10.48,16.48-28.28,25.5-46.46,25.5Z'/></g><g><path class='cls-2' d='M509.93,907.83c-35.01,0-67.29-4.84-91.84-13.86-15.63-5.74-27.82-18.25-33.15-34.03s-3.23-33.12,5.72-47.16l174.43-273.77c16.32-25.62,50.32-33.15,75.94-16.83,25.62,16.32,33.15,50.32,16.83,75.94l-126.68,198.82c25.39-1.89,54.61-7.42,84.56-19.13,71.29-27.87,127.46-82.26,158.15-153.15,30.53-70.52,31.94-147.78,3.98-217.56-28.43-70.95-82.76-126.78-152.98-157.2-70.23-30.42-147.71-31.59-218.17-3.27-73.46,29.52-126.75,82.48-158.4,157.4-11.82,27.98-44.08,41.08-72.07,29.27-27.98-11.82-41.08-44.08-29.27-72.07,42.86-101.46,118.49-176.38,218.71-216.66,49.54-19.91,101.59-29.4,154.67-28.2,51.11,1.15,100.99,12.12,148.25,32.6,47.14,20.42,89.3,49.27,125.31,85.75,37.27,37.75,66.22,81.98,86.05,131.46,19.64,49.01,28.94,100.74,27.64,153.75-1.26,51.15-12.28,101.08-32.77,148.42-20.54,47.45-49.51,89.78-86.11,125.81-38.15,37.56-82.88,66.53-132.94,86.09-42.5,16.61-89.11,26.08-134.81,27.39-3.71.11-7.4.16-11.05.16Z'/></g></svg>`,
        webdav: `<svg viewBox="0 0 2047 1024"><path d="M1177.976137 55.446757a115.879194 115.879194 0 0 1 0-55.092375H885.403287a86.660609 86.660609 0 0 1 7.850594 55.092375c0 23.634712-252.877592 968.580886-252.877592 968.580886h197.591718l55.285874-204.557737h268.882853l47.379995 204.557737h268.85521c7.933523-0.138215-300.395802-945.112032-300.395802-968.580886z m-260.976972 614.143142l110.709964-322.86951 102.887014 322.86951zM1201.610849 0.160882h300.534016l165.99584 693.036085s181.779957-614.253714 189.602908-637.75021a121.131352 121.131352 0 0 0-23.662355-55.285875h213.514049a500.116025 500.116025 0 0 0-15.701188 55.285875c0 15.784117-253.071093 779.669051-253.071093 779.669051a390.871136 390.871136 0 0 0-23.745283 94.428275 248.786437 248.786437 0 0 0 31.540592 86.660609h-268.882853v-55.202946c0-15.867046-276.76109-882.113778-284.722256-905.74849A87.766326 87.766326 0 0 0 1201.610849 0.160882z"/><path d="M608.780412 0.105596H237.093475a145.540066 145.540066 0 0 1 0 62.970612C229.187595 94.8103 86.881752 732.643439 31.595878 961.057031A132.105598 132.105598 0 0 1 0 1023.861785h411.022837c260.921687 0 498.070447-330.637175 498.070448-685.074919S577.04632 0.105596 608.780412 0.105596z m-197.757575 874.152612h-118.505273l181.862886-724.244962h78.892944c23.772926 0 134.482891 7.822951 134.48289 220.39714s-158.089959 503.847821-276.733447 503.847822z"/></svg>`,
        bilibili: `<svg viewBox="0 0 1024 1024"><path d="M998.4 352.256c-3.072-136.192-121.856-162.304-121.856-162.304s-92.672-0.512-212.992-1.536l87.552-84.48s13.824-17.408-9.728-36.864c-23.552-19.456-25.088-10.752-33.28-5.632-7.168 5.12-112.128 108.032-130.56 126.464-47.616 0-97.28-0.512-145.408-0.512h16.896S323.584 63.488 315.392 57.856s-9.216-13.824-33.28 5.632c-23.552 19.456-9.728 36.864-9.728 36.864l89.6 87.04c-97.28 0-181.248 0.512-220.16 2.048C15.872 225.792 25.6 352.256 25.6 352.256s1.536 271.36 0 408.576c13.824 137.216 119.296 159.232 119.296 159.232s41.984 1.024 73.216 1.024c3.072 8.704 5.632 51.712 53.76 51.712 47.616 0 53.76-51.712 53.76-51.712s350.72-1.536 379.904-1.536c1.536 14.848 8.704 54.272 56.832 53.76 47.616-1.024 51.2-56.832 51.2-56.832s16.384-1.536 65.024 0c113.664-20.992 120.32-154.112 120.32-154.112s-2.048-273.92-0.512-410.112z m-97.792 434.176c0 21.504-16.896 38.912-37.888 38.912h-691.2c-20.992 0-37.888-17.408-37.888-38.912V328.192c0-21.504 16.896-38.912 37.888-38.912h691.2c20.992 0 37.888 17.408 37.888 38.912v458.24z" fill="#1296DB"/><path d="M409.088 418.816l-203.264 38.912 17.408 76.288 201.216-38.912zM518.656 621.056c-49.664 106.496-94.208 26.112-94.208 26.112l-33.28 21.504s65.536 89.6 128 21.504c73.728 68.096 130.048-22.016 130.048-22.016l-30.208-19.456c0-0.512-52.736 75.776-100.352-27.648zM619.008 495.104l201.728 38.912 16.896-76.288-202.752-38.912z" fill="#1296DB"/></svg>`,
        ai: `<svg viewBox="0 0 1024 1024"><path d="M966.392 448.741L851.745 249.689a27.039 27.039 0 0 0-23.431-13.544h-42.126l-78.386-135.769a27.04 27.04 0 0 0-23.417-13.52H454.539a27.039 27.039 0 0 0-23.4 13.49l-20.99 36.249-156.729 0.025a27.04 27.04 0 0 0-23.413 13.52L115.084 349.191a27.041 27.041 0 0 0 0 27.04l20.925 36.243-78.386 135.769a27.041 27.041 0 0 0 0 27.04l114.923 199.052a27.04 27.04 0 0 0 23.417 13.52h41.85l78.386 135.769a27.04 27.04 0 0 0 23.417 13.52h229.845a27.04 27.04 0 0 0 23.417-13.52l20.925-36.243h156.773a27.04 27.04 0 0 0 23.417-13.52l114.923-199.052a27.041 27.041 0 0 0 0-27.04l-20.925-36.243 78.386-135.769a27.04 27.04 0 0 0 0.015-27.016zM767.96 557.282l-219.424-0.026 82.291-142.529a4.517 4.517 0 0 0 0-4.507L462.345 118.403h219.439l84.889 147.035 0.003 0.004 84.888 147.032-83.604 144.808z m62.68-90.538h104.516l-78.388 135.767L804.51 512l26.13-45.256z m-208.921-54.27L540.73 552.748 517.204 512l27.429-47.509c0.031-0.054 0.042-0.115 0.07-0.17 0.125-0.24 0.228-0.49 0.31-0.753 0.028-0.091 0.062-0.179 0.084-0.271 0.082-0.341 0.139-0.693 0.139-1.059a4.46 4.46 0 0 0-0.139-1.059c-0.022-0.092-0.056-0.181-0.084-0.272a4.565 4.565 0 0 0-0.31-0.753c-0.029-0.055-0.039-0.116-0.07-0.17L429.711 260.932a4.509 4.509 0 0 0-3.904-2.254h-49.653l78.384-135.768 167.181 289.564zM365.744 258.678h-52.255l-52.259-90.514 156.787-0.024-52.273 90.538z m-62.664 0h-49.655a4.508 4.508 0 0 0-3.904 2.254l-82.29 142.528-23.526-40.748 109.719-190.038 49.656 86.004z m-131.946 156.05l84.891-147.036h54.856l0.009 0.001 0.009-0.001h112.307l109.718 190.039H368.347a4.508 4.508 0 0 0-3.904 2.254L195.961 751.802 86.244 561.763l84.89-147.035z m199.814 52.016h161.975l-23.527 40.749h-54.859c-0.037 0-0.073 0.014-0.11 0.015a4.484 4.484 0 0 0-2.044 0.548c-0.08 0.044-0.154 0.093-0.231 0.142a4.454 4.454 0 0 0-0.652 0.499c-0.068 0.063-0.139 0.122-0.203 0.189a4.439 4.439 0 0 0-0.662 0.86L335.712 708.799a4.515 4.515 0 0 0 0 4.506l24.828 43.003H203.769l167.179-289.564z m-5.205 298.578l26.129 45.257-52.258 90.511-78.384-135.768h104.513z m31.334 54.272l24.826 43.001a4.508 4.508 0 0 0 3.904 2.253h164.579l-23.524 40.749h-219.44l49.655-86.003z m31.331 36.241L344.82 711.052l109.719-190.038 82.288 142.528a4.508 4.508 0 0 0 3.904 2.253h336.963l-109.718 190.04H428.408z m114.923-199.053l-80.987-140.276h47.055l27.427 47.51c0.044 0.076 0.103 0.137 0.152 0.21 0.087 0.134 0.177 0.264 0.279 0.389 0.095 0.115 0.197 0.221 0.301 0.326 0.1 0.1 0.2 0.197 0.311 0.288 0.13 0.107 0.266 0.201 0.406 0.292 0.069 0.046 0.128 0.102 0.2 0.144 0.034 0.02 0.073 0.025 0.107 0.044 0.314 0.17 0.64 0.315 0.984 0.406 0.035 0.01 0.071 0.009 0.107 0.018 0.302 0.072 0.61 0.11 0.92 0.119 0.044 0.001 0.088 0.017 0.132 0.017 0.051 0 0.099-0.018 0.15-0.019 0.062 0.002 0.119 0.018 0.18 0.018l229.505 0.027a4.509 4.509 0 0 0 3.904-2.253l24.841-43.027 53.556 92.759 0.001 0.003 24.83 43.005H543.331z m292.512-199.051l24.828-43.003a4.517 4.517 0 0 0 0-4.507l-82.289-142.529h47.325l109.457 190.039h-99.321z" fill="#13227a"/></svg>`,
        baidudrive: `<svg viewBox="0 0 1024 1024"><path d="M0 0m184.32 0l655.36 0q184.32 0 184.32 184.32l0 655.36q0 184.32-184.32 184.32l-655.36 0q-184.32 0-184.32-184.32l0-655.36q0-184.32 184.32-184.32Z" fill="#FFFFFF"/><path d="M512 296.96a102.4 102.4 0 1 0 102.4 102.4 102.51264 102.51264 0 0 0-102.4-102.4m0-92.16a194.56 194.56 0 1 1-194.56 194.56 194.56 194.56 0 0 1 194.56-194.56z" fill="#61C3FA"/><path d="M822.36416 741.632a179.4048 179.4048 0 0 1-253.27616-8.83712 46.08 46.08 0 0 1 2.27328-65.1264 46.08 46.08 0 0 1 65.1264 2.27328 87.04 87.04 0 1 0 4.3008-123.02336 46.08 46.08 0 0 1-65.1264-2.27328 46.08 46.08 0 0 1 2.27328-65.1264 179.2 179.2 0 0 1 244.4288 262.11328zM317.44 522.24a92.16 92.16 0 1 0 92.16 92.16 92.2624 92.2624 0 0 0-92.16-92.16m0-92.16a184.32 184.32 0 1 1-184.32 184.32 184.32 184.32 0 0 1 184.32-184.32z" fill="#61C3FA"/><path d="M437.79072 753.96096l-65.83296-64.512 208.65024-213.01248 65.83296 64.512z" fill="#61C3FA"/><path d="M512 593.92a194.78528 194.78528 0 0 1-194.56-194.56 46.08 46.08 0 0 1 46.08-46.08 46.08 46.08 0 0 1 46.08 46.08 102.4 102.4 0 0 0 204.8 0 46.08 46.08 0 0 1 92.16 0 194.78528 194.78528 0 0 1-194.56 194.56z" fill="#EC5A70"/><path d="M378.88 942.08h133.12v81.92h-133.12a40.96 40.96 0 0 1-40.96-40.96 40.96 40.96 0 0 1 40.96-40.96z" fill="#EB566F"/><path d="M512 942.08h133.12a40.96 40.96 0 0 1 40.96 40.96 40.96 40.96 0 0 1-40.96 40.96h-133.12v-81.92z" fill="#448BF7"/></svg>`,
        alidrive: `<svg viewBox="0 0 1025 1024"><path d="M787.456 955.904H237.568c-93.184 0-168.96-75.776-168.96-168.96V293.72C11.48 134.84 139.32 5.6 296.48 5.6h431.04c157.16 0 285 129.24 285 288.12v549.888c0 93.184-75.776 168.96-168.96 168.96H296.48z" fill="#6D80FB"/><path d="M306.08 68.08h411.88c128.4 0 232.32 105.24 232.32 235.32v417.16c0 130.08-103.92 235.32-232.32 235.32H306.08c-128.4 0-232.32-105.24-232.32-235.32V303.4c-0.04-130.04 103.88-235.32 232.32-235.32z" fill="#597DFC"/><path d="M234.88 304.48H147.24v415.04h87.64V304.48z m129.28 304.84c0.44-21.6 3.8-35.72 10.36-42.36 4.84-6.64 12.48-11.12 22.4-13.68 9.72-2.56 10.12-2.36 30.64-2.56h23.24c42.68 0 52.6-6.4 73.92-19.24 14.36-8.76 23.24-23.32 31.48-41.92 8.24-18.4 12.24-39.8 12.24-63.76 0-19.48-3.4-37.64-9.92-54.32-6.56-16.92-16.04-30.16-28.32-40.2-20.48-17.76-37.6-26.76-109.4-26.76H283.48v74h118.92c23.04 0 39.48 3.2 49.84 9.4 13.52 8.76 20.28 22.48 20.28 41.08 0 17.12-7.4 29.96-22.16 38.52-9.52 5.36-17.96 8.12-40.56 8.12h-14.16c-27.88 0-34.64 1.92-47.72 5.56-13.08 3.64-25.12 10.92-36.32 21.84-23.64 24.4-35.28 59.88-34.44 106.32v110.16h280.48v-73.36H363.72v-36.8h0.44z m353.56 110.2c30.64 0 53.64-1.48 69.08-4.72 15.44-3.2 29.56-9 42.68-17.76 29.56-19.04 44.16-48.36 44.16-87.72 0-42.8-18.16-76.16-54.72-100.12 36.56-21.6 54.72-51.56 54.72-90.28 0-22.48-4.24-44.28-16.48-63.96-12.24-21.16-31.04-34.64-52.4-42.56-9.08-3.44-17.32-5.36-24.92-6.2-7.6-0.84-24.92-1.48-51.96-1.92h-117v74h101.8c14.36 0 24.52 0.44 30.4 1.48 5.92 1.08 11.2 3.2 15.64 6.64 12.24 8.36 18.36 21.6 18.36 39.8 0 16.68-4.64 28.88-14.16 36.8-7.8 6.64-24.52 10.04-50.28 10.04h-62.96v73.36h62.96c21.32 0 36.32 2.56 44.76 7.48 13.52 7.92 20.28 22.24 20.28 43 0 17.12-5.28 29.96-16.04 38.52-8.64 7.08-24.92 10.48-49.2 10.48h-101.8v73.36h107.08v0.28z" fill="#FFFFFF"/></svg>`,
        pan123: `<svg viewBox="0 0 1024 1024"><path d="M296.48 1018.44c-157.16 0-285-129.24-285-288.12V293.72C11.48 134.84 139.32 5.6 296.48 5.6h431.04c157.16 0 285 129.24 285 288.12v436.56c0 158.88-127.84 288.12-285 288.12H296.48z" fill="#FFFFFF"/><path d="M306.08 68.08h411.88c128.4 0 232.32 105.24 232.32 235.32v417.16c0 130.08-103.92 235.32-232.32 235.32H306.08c-128.4 0-232.32-105.24-232.32-235.32V303.4c-0.04-130.04 103.88-235.32 232.32-235.32z" fill="#597DFC"/><path d="M234.88 304.48H147.24v415.04h87.64V304.48z m129.28 304.84c0.44-21.6 3.8-35.72 10.36-42.36 4.84-6.64 12.48-11.12 22.4-13.68 9.72-2.56 10.12-2.36 30.64-2.56h23.24c42.68 0 52.6-6.4 73.92-19.24 14.36-8.76 23.24-23.32 31.48-41.92 8.24-18.4 12.24-39.8 12.24-63.76 0-19.48-3.4-37.64-9.92-54.32-6.56-16.92-16.04-30.16-28.32-40.2-20.48-17.76-37.6-26.76-109.4-26.76H283.48v74h118.92c23.04 0 39.48 3.2 49.84 9.4 13.52 8.76 20.28 22.48 20.28 41.08 0 17.12-7.4 29.96-22.16 38.52-9.52 5.36-17.96 8.12-40.56 8.12h-14.16c-27.88 0-34.64 1.92-47.72 5.56-13.08 3.64-25.12 10.92-36.32 21.84-23.64 24.4-35.28 59.88-34.44 106.32v110.16h280.48v-73.36H363.72v-36.8h0.44z m353.56 110.2c30.64 0 53.64-1.48 69.08-4.72 15.44-3.2 29.56-9 42.68-17.76 29.56-19.04 44.16-48.36 44.16-87.72 0-42.8-18.16-76.16-54.72-100.12 36.56-21.6 54.72-51.56 54.72-90.28 0-22.48-4.24-44.28-16.48-63.96-12.24-21.16-31.04-34.64-52.4-42.56-9.08-3.44-17.32-5.36-24.92-6.2-7.6-0.84-24.92-1.48-51.96-1.92h-117v74h101.8c14.36 0 24.52 0.44 30.4 1.48 5.92 1.08 11.2 3.2 15.64 6.64 12.24 8.36 18.36 21.6 18.36 39.8 0 16.68-4.64 28.88-14.16 36.8-7.8 6.64-24.52 10.04-50.28 10.04h-62.96v73.36h62.96c21.32 0 36.32 2.56 44.76 7.48 13.52 7.92 20.28 22.24 20.28 43 0 17.12-5.28 29.96-16.04 38.52-8.64 7.08-24.92 10.48-49.2 10.48h-101.8v73.36h107.08v0.28z" fill="#FFFFFF"/></svg>`,
        quarktv: `<svg t="1760924498108" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5718"><path d="M469.134884 976.133953c-110.258605-9.763721-215.516279-59.534884-290.768372-137.168372-75.490233-78.109767-113.830698-154.552558-132.167442-263.858604-4.762791-28.338605-5.477209-95.970233-1.190698-123.832558 10.24-68.822326 33.101395-134.072558 64.297675-184.32 88.349767-142.407442 236.710698-226.470698 399.598139-226.470698 69.536744 0 132.167442 12.621395 192.416744 39.054884 52.628837 23.099535 110.496744 64.297674 149.313489 106.448372 60.725581 65.964651 91.92186 122.165581 114.783255 206.943256 18.098605 66.917209 18.574884 160.982326 1.428838 227.423255-19.289302 73.585116-45.484651 126.213953-92.636279 184.55814-40.96 50.96186-84.063256 86.92093-140.740466 117.402791-59.534884 32.148837-114.545116 48.104186-184.08186 53.819534-34.053953 2.857674-47.151628 2.857674-80.253023 0z m84.063256-238.615813c11.668837-5.00093 20.71814-19.051163 20.718139-32.625117 0-23.337674 4.524651-49.771163 10.47814-61.44 12.145116-23.813953 28.338605-32.148837 77.395348-39.769302 19.051163-2.857674 38.578605-6.906047 43.341396-8.811163 13.573953-5.953488 24.766512-17.384186 32.148837-33.339535 6.667907-14.526512 6.906047-15.955349 6.906047-53.105116-0.23814-41.19814-1.666977-50.247442-15.955349-87.15907-21.194419-55.486512-76.91907-110.734884-132.167442-130.738604-11.430698-4.048372-33.577674-9.525581-49.294884-12.383256-26.195349-4.286512-31.196279-4.524651-53.819535-1.905117-44.770233 5.23907-72.394419 14.050233-103.352558 32.625117-19.527442 11.906977-20.956279 13.097674-44.532093 36.435349-34.530233 34.053953-52.390698 67.155349-63.345116 116.688372-19.051163 86.92093 15.47907 178.604651 87.873488 233.853023 30.243721 23.099535 74.537674 41.674419 106.686512 44.770232 27.624186 2.857674 66.67907 1.190698 76.91907-3.095813z" fill="#3A25DD" p-id="5719"></path></svg>`
    };

    const SETTING_CONFIGS = {
        player: [
            { key: "allowMultipleInstances", type: "checkbox", title: () => i18n.setting?.items?.allowMultipleInstances?.title || "允许多开",
              description: () => i18n.setting?.items?.allowMultipleInstances?.description || "允许同时打开多个播放器标签页，同时播放器间将不互斥" },
            { key: "openMode", type: "select", title: () => i18n.setting?.items?.openMode?.title || "打开方式",
              description: () => i18n.setting?.items?.openMode?.description || "选择播放器打开模式",
              displayCondition: () => !getFrontend().endsWith('mobile'),
              options: [
                { label: () => i18n.setting?.items?.openMode?.options?.default || "新标签", value: "default" },
                { label: () => i18n.setting?.items?.openMode?.options?.right || "右侧新标签", value: "right" },
                { label: () => i18n.setting?.items?.openMode?.options?.bottom || "底部新标签", value: "bottom" },
                { label: () => i18n.setting?.items?.openMode?.options?.window || "新窗口", value: "window" }
              ] },
            { key: "playerType", type: "select", title: () => i18n.setting?.items?.playerType?.title || "播放器选择",
              description: () => i18n.setting?.items?.playerType?.description || "选择用于播放媒体的播放器",
              onChange: (v) => (appState.config.playerType = v, appState.config.playerPath = v==='potplayer' ? (appState.config.potplayerPath||'') : v==='vlc' ? (appState.config.vlcPath||'') : v==='mpv' ? (appState.config.mpvPath||'') : ''),
              options: [
                { label: () => i18n.setting?.items?.playerType?.builtIn || "内置播放器", value: "built-in" },
                { label: () => i18n.setting?.items?.playerType?.mpv || "MPV", value: "mpv" },
                { label: () => i18n.setting?.items?.playerType?.potPlayer || "PotPlayer", value: "potplayer" },
                { label: () => i18n.setting?.items?.playerType?.vlc || "VLC", value: "vlc" },
                { label: () => i18n.setting?.items?.playerType?.browser || "浏览器", value: "browser" }
              ],group: g('playerSelect', '播放器选择') },
            { key: "potplayerPath", type: "textarea", rows: 1, title: () => (i18n.setting?.items?.potplayerPath?.title || "PotPlayer 路径"),
              description: () => (i18n.setting?.items?.potplayerPath?.description || "PotPlayer 可执行文件路径"),
              onChange: (v) => (appState.config.potplayerPath = v, appState.config.playerType==='potplayer' ? (appState.config.playerPath = v) : null),
              displayCondition: () => String(settingItems.find(i => i.key === 'playerType')?.value) === 'potplayer',group: g('playerSelect', '播放器选择') },
            { key: "vlcPath", type: "textarea", rows: 1, title: () => (i18n.setting?.items?.vlcPath?.title || "VLC 路径"),
              description: () => (i18n.setting?.items?.vlcPath?.description || "VLC 可执行文件路径"),
              onChange: (v) => (appState.config.vlcPath = v, appState.config.playerType==='vlc' ? (appState.config.playerPath = v) : null),
              displayCondition: () => String(settingItems.find(i => i.key === 'playerType')?.value) === 'vlc',group: g('playerSelect', '播放器选择') },
            { key: "mpvPath", type: "textarea", rows: 1, title: () => (i18n.setting?.items?.mpvPath?.title || "MPV 路径"),
              description: () => (i18n.setting?.items?.mpvPath?.description || "MPV 可执行文件路径"),
              onChange: (v) => (appState.config.mpvPath = v, appState.config.playerType==='mpv' ? (appState.config.playerPath = v) : null),
              displayCondition: () => String(settingItems.find(i => i.key === 'playerType')?.value) === 'mpv',group: g('playerSelect', '播放器选择') },
            { key: "volume", type: "slider", title: () => i18n.setting?.items?.volume?.title || "音量",
              description: () => i18n.setting?.items?.volume?.description || "默认音量大小（支持放大到 6.0x）",
              slider: { min: 0, max: 600, step: 1 } },
            { key: "speed", type: "slider", title: () => i18n.setting?.items?.speed?.title || "播放速度",
              description: () => i18n.setting?.items?.speed?.description || "默认播放速度",
              slider: { min: 50, max: 400, step: 25 } },
            { key: "customSpeed", type: "slider", title: () => i18n.setting?.items?.customSpeed?.title || "快捷切换速度",
              description: () => i18n.setting?.items?.customSpeed?.description || "快捷键一键切换到此速度",
              slider: { min: 50, max: 400, step: 25 } },
            { key: "showSubtitles", type: "checkbox", title: () => i18n.setting?.items?.showSubtitles?.title || "显示字幕",
              description: () => i18n.setting?.items?.showSubtitles?.description || "播放时显示字幕（如果有）",group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "subtitleFontSize", type: "slider", title: () => i18n.setting?.items?.subtitleFontSize?.title || "字幕大小",
              description: () => i18n.setting?.items?.subtitleFontSize?.description || "字幕文字大小",
              slider: { min: 12, max: 48, step: 1 },group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "subtitleStyle", type: "select", title: () => i18n.setting?.items?.subtitleStyle?.title || "字幕样式",
              description: () => i18n.setting?.items?.subtitleStyle?.description || "选择字幕显示样式",
              options: [
                {label:()=>i18n.setting?.items?.subtitleStyle?.options?.default||'默认',value:'default'},
                {label:()=>i18n.setting?.items?.subtitleStyle?.options?.clock||'专注时钟',value:'clock'},
                {label:()=>i18n.setting?.items?.subtitleStyle?.options?.song||'透明唱片',value:'song'},
                {label:()=>i18n.setting?.items?.subtitleStyle?.options?.wave||'动感波光',value:'wave'}
              ],group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "enableDanmaku", type: "checkbox", title: () => i18n.setting?.items?.enableDanmaku?.title || "启用弹幕",
              description: () => i18n.setting?.items?.enableDanmaku?.description || "播放时启用弹幕（如果有）",group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "danmakuSpeed", type: "slider", title: () => i18n.setting?.items?.danmakuSpeed?.title || "弹幕速度",
              description: () => i18n.setting?.items?.danmakuSpeed?.description || "弹幕移动速度 (1-10，值越小速度越快)",
              slider: { min: 1, max: 10, step: 1 },group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "danmakuOpacity", type: "slider", title: () => i18n.setting?.items?.danmakuOpacity?.title || "弹幕透明度",
              description: () => i18n.setting?.items?.danmakuOpacity?.description || "弹幕不透明度 (0-100)",
              slider: { min: 0, max: 100, step: 5 },group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "danmakuFontSize", type: "slider", title: () => i18n.setting?.items?.danmakuFontSize?.title || "弹幕字体大小",
              description: () => i18n.setting?.items?.danmakuFontSize?.description || "弹幕文字大小 (12-120)",
              slider: { min: 12, max: 120, step: 1 },group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "danmakuArea", type: "slider", title: () => i18n.setting?.items?.danmakuArea?.title || "弹幕显示区域",
              description: () => i18n.setting?.items?.danmakuArea?.description || "弹幕显示区域百分比 (0-100，100为全屏)",
              slider: { min: 0, max: 100, step: 5 },group: g('subtitleDanmaku', '字幕弹幕') },
            { key: "loopCount", type: "number", title: () => i18n.setting?.items?.loopCount?.title || "片段循环次数",
              description: () => i18n.setting?.items?.loopCount?.description || "片段循环播放次数",
              number: { min: 1 },group: g('loop', '循环设置') },
            { key: "pauseAfterLoop", type: "checkbox", title: () => i18n.setting?.items?.pauseAfterLoop?.title || "片段循环后暂停",
              description: () => i18n.setting?.items?.pauseAfterLoop?.description || "片段循环结束后暂停播放媒体",group: g('loop', '循环设置') },
            { key: "loopPlaylist", type: "checkbox", title: () => i18n.setting?.items?.loopPlaylist?.title || "列表循环",
              description: () => i18n.setting?.items?.loopPlaylist?.description || "自动播放下一个媒体",
              onChange: (v) => (appState.config.loopPlaylist = v, v && (appState.config.loopSingle = false)),group: g('loop', '循环设置') },
            { key: "loopSingle", type: "checkbox", title: () => i18n.setting?.items?.loopSingle?.title || "单项循环",
              description: () => i18n.setting?.items?.loopSingle?.description || "循环播放当前媒体",
              onChange: (v) => (appState.config.loopSingle = v, v && (appState.config.loopPlaylist = false)),group: g('loop', '循环设置') },
            { key: "skipOpening", type: "number", title: () => i18n.setting?.items?.skipOpening?.title || "跳过片头（秒）",
              description: () => i18n.setting?.items?.skipOpening?.description || "自动跳过视频开头的片头时长，0表示不跳过",
              number: { min: 0, max: 300 },group: g('skip', '片头片尾') },
            { key: "skipEnding", type: "number", title: () => i18n.setting?.items?.skipEnding?.title || "跳过片尾（秒）",
              description: () => i18n.setting?.items?.skipEnding?.description || "自动跳过视频结尾的片尾时长，0表示不跳过",
              number: { min: 0, max: 300 },group: g('skip', '片头片尾') }
        ],
        general: [
            { key: "ignoreCertificateErrors", type: "checkbox", title: () => i18n.setting?.items?.ignoreCertificateErrors?.title || "跳过证书验证",
              description: () => i18n.setting?.items?.ignoreCertificateErrors?.description || "允许连接使用自签名或私有证书的服务器（WebDAV、云盘等）" },
            { key: "mediaNotesMode", type: "select", title: () => "媒体笔记创建方式",
              description: () => "选择媒体笔记的创建位置",
              onChange: (v) => (appState.config.mediaNotesMode = v, v === 'document' ? (appState.config.notebook = { id: '', name: '' }) : (appState.config.parentDoc = { id: '', name: '', path: '' })),
              options: [
                { label: () => "插入打开文档", value: "current" },
                { label: () => "笔记本下创建", value: "notebook" },
                { label: () => "文档下创建", value: "document" },
                { label: () => "DailyNote", value: "dailynote" }
              ] },
            { key: "targetNotebook", type: "select", title: () => "目标笔记本",
              description: () => appState.config.notebook?.name || "选择目标笔记本",
              displayCondition: () => ['notebook', 'dailynote'].includes(appState.config.mediaNotesMode),
              onChange: (v) => appState.config.notebook = appState.runtime.notebooks.find(nb => nb.id === v) || { id: '', name: '' },
              options: () => appState.runtime.notebooks.map(nb => ({ label: nb.name, value: nb.id })) },
            { key: "targetDocumentSearch", type: "text", title: () => "搜索文档",
              description: () => appState.config.parentDoc?.name ? `已选择：${appState.config.parentDoc.name}` : "输入关键字搜索",
              displayCondition: () => appState.config.mediaNotesMode === 'document',
              onKeydown: async (e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  const r = await notebook.searchAndUpdate(e.target.value.trim(), appState.config, { getConfig, saveConfig: async (cfg) => { await plugin.saveData('config.json', cfg, 2); window.dispatchEvent(new CustomEvent('configUpdated', { detail: cfg })); } });
                  if (r.success && r.docs) {
                    appState.runtime.notebookOptions = r.docs.map(doc => ({ label: doc.hPath || '无标题', value: doc.path?.replace(/^\/|\.sy$/g, '') || '', path: doc.path?.replace(/^\/|\.sy$/g, '') || '', notebook: doc.box })).filter(doc => doc.value);
                    const firstDoc = appState.runtime.notebookOptions[0];
                    firstDoc && (appState.config.parentDoc = { id: firstDoc.value, name: firstDoc.label, path: firstDoc.path, notebook: firstDoc.notebook }, saveAppState());
                  }
                }
              } },
            { key: "targetDocument", type: "select", title: () => "选择文档",
              description: () => appState.config.parentDoc?.name || "从搜索结果中选择",
              displayCondition: () => appState.config.mediaNotesMode === 'document' && appState.runtime.notebookOptions.length > 0,
              onChange: (v) => (doc => doc && (appState.config.parentDoc = { id: doc.value, name: doc.label, path: doc.path, notebook: doc.notebook }, saveAppState()))(appState.runtime.notebookOptions.find(opt => opt.value === v)),
              options: () => appState.runtime.notebookOptions.map(opt => ({ label: opt.label, value: opt.value })) },
            { key: "insertMode", type: "select", title: () => i18n.setting?.items?.insertMode?.title || "插入方式",
              description: () => i18n.setting?.items?.insertMode?.description || "选择链接和笔记的插入方式",
              onChange: (v) => appState.config.insertMode = v,
              options: [
                { label: () => i18n.setting?.items?.insertMode?.insertBlock || "插入光标处", value: "insertBlock" },
                { label: () => i18n.setting?.items?.insertMode?.appendBlock || "追加到块末尾", value: "appendBlock" },
                { label: () => i18n.setting?.items?.insertMode?.prependBlock || "添加到块开头", value: "prependBlock" },
                { label: () => i18n.setting?.items?.insertMode?.updateBlock || "更新当前块", value: "updateBlock" },
                { label: () => i18n.setting?.items?.insertMode?.prependDoc || "插入到文档顶部", value: "prependDoc" },
                { label: () => i18n.setting?.items?.insertMode?.appendDoc || "插入到文档底部", value: "appendDoc" },
                { label: () => i18n.setting?.items?.insertMode?.clipboard || "复制到剪贴板", value: "clipboard" }
              ] },
            { key: "screenshotWithTimestamp", type: "checkbox", title: () => i18n.setting?.items?.screenshotWithTimestamp?.title || "截图包含时间戳",
              description: () => i18n.setting?.items?.screenshotWithTimestamp?.description || "启用后,截图功能也会添加时间戳链接",group: g('screenshot', '截图设置') },
            { key: "screenshotFormat", type: "select", title: () => i18n.setting?.items?.screenshotFormat?.title || "截图格式",
              description: () => i18n.setting?.items?.screenshotFormat?.description || "选择截图保存格式",
              options: [
                { label: () => "PNG (无损)", value: "png" },
                { label: () => "JPEG (小体积)", value: "jpeg" },
                { label: () => "WebP (推荐)", value: "webp" }
              ],group: g('screenshot', '截图设置') },
              { key: "screenshotQuality", type: "slider", title: () => i18n.setting?.items?.screenshotQuality?.title || "截图质量",
              description: () => i18n.setting?.items?.screenshotQuality?.description || "JPEG/WebP格式的压缩质量 (PNG格式忽略此设置)",
              displayCondition: () => ['jpeg', 'webp'].includes(appState.config.screenshotFormat),
              slider: { min: 60, max: 100, step: 1 },group: g('screenshot', '截图设置') },
            { key: "linkFormat", type: "textarea", rows: 1, title: () => i18n.setting?.items?.linkFormat?.title || "链接格式",
              description: () => i18n.setting?.items?.linkFormat?.description || "设置链接显示格式，可使用 时间 字幕 标题 艺术家 链接 截图，支持同时插入链接和截图",group: g('template', '链接模板') },
            { key: "mediaNotesTemplate", type: "textarea", rows: 9, title: () => i18n.setting?.items?.mediaNotesTemplate?.title || "媒体笔记模板",
              description: () => i18n.setting?.items?.mediaNotesTemplate?.description || "设置媒体笔记的模板格式，支持使用 时间 标题 艺术家 链接 时长 封面 类型 ID 日期 时间戳 等变量",group: g('template', '链接模板') },
            { key: "playlistDisplayElements", type: "custom", title: () => i18n.setting?.items?.playlistDisplayElements?.title || "播放列表显示元素", description: () => i18n.setting?.items?.playlistDisplayElements?.description || "选择显示的元素",group: g('ui', 'UI设置') },
            { key: "showMobileFloatButton", type: "checkbox", title: () => i18n.setting?.items?.showMobileFloatButton?.title || "显示移动端小电视按钮",
              description: () => i18n.setting?.items?.showMobileFloatButton?.description || "在移动端页面右下角显示悬浮按钮",
              group: g('ui', 'UI设置') },
            { key: "playlistTheme", type: "select", title: () => i18n.setting?.items?.playlistTheme?.title || "播放列表主题", description: () => i18n.setting?.items?.playlistTheme?.description || "外观风格",
              options: [
                { label: () => i18n.setting?.items?.playlistTheme?.options?.default || "默认", value: "default" },
                { label: () => i18n.setting?.items?.playlistTheme?.options?.soft || "柔和", value: "soft" },
                { label: () => i18n.setting?.items?.playlistTheme?.options?.flat || "扁平", value: "flat" },
                { label: () => i18n.setting?.items?.playlistTheme?.options?.glass || "毛玻璃", value: "glass" },
                { label: () => i18n.setting?.items?.playlistTheme?.options?.minimal || "极简", value: "minimal" }
              ], group: g('ui', 'UI设置') },
            { key: "playlistDensity", type: "slider", title: () => i18n.setting?.items?.playlistDensity?.title || "显示密度", description: () => i18n.setting?.items?.playlistDensity?.description || "列表间距（0-100，越大越疏松）",
              slider: { min: 0, max: 100, step: 1 }, group: g('ui', 'UI设置') },
            { key: "playlistScale", type: "slider", title: () => i18n.setting?.items?.playlistScale?.title || "整体大小", description: () => i18n.setting?.items?.playlistScale?.description || "字体与元素缩放（80%-130%）",
              slider: { min: 80, max: 130, step: 5 }, group: g('ui', 'UI设置') },
            { key: "mediaViewSize", type: "select", title: () => i18n.setting?.items?.mediaViewSize?.title || "媒体视图默认尺寸", description: () => i18n.setting?.items?.mediaViewSize?.description || "卡片/封面/播放样式的默认尺寸",
              options: [
                { label: () => i18n.setting?.items?.mediaViewSize?.options?.small || "小", value: "small" },
                { label: () => i18n.setting?.items?.mediaViewSize?.options?.medium || "中", value: "" },
                { label: () => i18n.setting?.items?.mediaViewSize?.options?.large || "大", value: "large" }
              ], group: g('ui', 'UI设置') },
            { key: "playlistAspect", type: "select", title: () => i18n.setting?.items?.playlistAspect?.title || "缩略图比例", description: () => i18n.setting?.items?.playlistAspect?.description || "封面宽高比",
              options: [
                { label: () => i18n.setting?.items?.playlistAspect?.options?.auto || "自动", value: "auto" },
                { label: () => i18n.setting?.items?.playlistAspect?.options?.["16/9"] || "16:9", value: "16/9" },
                { label: () => i18n.setting?.items?.playlistAspect?.options?.["1/1"] || "1:1", value: "1/1" },
                { label: () => i18n.setting?.items?.playlistAspect?.options?.["2/3"] || "2:3", value: "2/3" }
              ], group: g('ui', 'UI设置') },
            { key: "defaultThumbFolder", type: "text", title: () => i18n.setting?.items?.defaultThumbFolder?.title || "默认缩略图·文件夹", description: () => i18n.setting?.items?.defaultThumbFolder?.description || "图片URL或data:URI",group: g('ui', 'UI设置') },
            { key: "defaultThumbVideo", type: "text", title: () => i18n.setting?.items?.defaultThumbVideo?.title || "默认缩略图·视频", description: () => i18n.setting?.items?.defaultThumbVideo?.description || "图片URL或data:URI",group: g('ui', 'UI设置') },
            { key: "defaultThumbAudio", type: "text", title: () => i18n.setting?.items?.defaultThumbAudio?.title || "默认缩略图·音频", description: () => i18n.setting?.items?.defaultThumbAudio?.description || "图片URL或data:URI",group: g('ui', 'UI设置') },
            { key: "defaultThumbPdf", type: "text", title: () => i18n.setting?.items?.defaultThumbPdf?.title || "默认缩略图·PDF", description: () => i18n.setting?.items?.defaultThumbPdf?.description || "图片URL或data:URI",group: g('ui', 'UI设置') }
        ]
    };

    // 统一操作管理
    const updateAccount = (type, account, operation) => {
        const key = type + 'Accounts';
        appState.config[key] = appState.config[key] || [];
        if (operation === 'add') appState.config[key].push({ ...account, id: Date.now().toString() });
        else if (operation === 'edit') {
            const i = appState.config[key].findIndex(a => a.id === appState.ui.editingAccount);
            appState.config[key][i] = { ...appState.config[key][i], ...account };
        } else if (operation === 'delete') appState.config[key] = appState.config[key].filter(a => a.id !== account);
    };

    const accountManager = {
        save: async (type, data, isEdit) => {
            // 极简连接验证
            const managers = { webdav: WebDAVManager, openlist: OpenListManager, pan123: Pan123Manager, s3: S3Manager };
            const manager = managers[type];
            if (manager) {
                if (type === 's3' && data.forcePathStyle === undefined) data.forcePathStyle = false;
                const result = await manager.checkConnection(data);
                if (!result.connected) return msg.error(result.message);
                const enriched = (manager as any).getConfig?.() || {};
                data = { ...data, ...enriched };
            } else if (type === 'ai') {
                if (!data.base || !data.apiKey || !data.model) return msg.error('Base/API Key/Model 不能为空');
            } else if (type === 'alidrive') {
                const { connected, message } = await AliDriveManager.checkConnection(data);
                if (!connected) return msg.error(message);
            } else if (type === 'baidudrive') {
                const code = (appState.ui.editingData?.auth_code || '').trim();
                if (!code) return msg.error('请输入授权码');
                const { account } = await BaiduDriveManager.authorizeByCodeSimple(code);
                updateAccount('baidudrive', account, (appState.config.baidudriveAccounts || []).some(a => String(a.uk) === String(account.uk)) ? 'edit' : 'add');
                await saveAppState();
                appState.ui.editingAccount = null;
                appState.ui.editingData = {};
                return;
            } else if (type === 'playlistdb') {
                if (!data.name?.trim()) return msg.error('名称不能为空');
                const existingAcc = (appState.config.playlistdbAccounts || []).find(a => a.id === appState.ui.editingAccount);
                const src = (data.source || existingAcc?.source || appState.config.playlistSource || 'document');
                if (src === 'database') {
                    if (!data.dbId?.trim()) return msg.error('数据库ID不能为空');
                    const dbInfo = await processDbId(data.dbId.trim());
                    if (!dbInfo.avId) return msg.error('无效的数据库ID');
                    if (!(await initDb(data.dbId.trim()))) return msg.error('无法连接到数据库');
                    data = { ...data, ...dbInfo };}
                data = { ...data, source: src, active: isEdit ? data.active : !(appState.config.playlistdbAccounts || []).some(a => a.active) };
            } else if (!data.server) {
                return msg.error('服务器地址不能为空');
            }
            updateAccount(type, data, isEdit ? 'edit' : 'add');
            await saveAppState();
            msg.success(`${ACCOUNT_TYPES[type]?.name}保存成功`);
            appState.ui.editingAccount = null;
            appState.ui.editingData = {};
        },
        delete: async (type, id) => {
            type === 'pro' ? appState.runtime.currentLicense = null : (updateAccount(type, id, 'delete'), await saveAppState());
            msg.success(type === 'pro' ? 'Pro功能已关闭' : '账号已删除');
        },
        edit: (type, data) => {
            appState.ui.editingAccount = type === 'pro' ? 'pro' : data.id;
            if (type !== 'pro' && type !== 'bilibili') appState.ui.editingData = { ...data };
            if (type === 'playlistdb' && data.avId) appState.ui.editingData.avId = data.avId;
        },
        toggleActive: async (type, id) => {
            const key = type + 'Accounts';
            appState.config[key] = (appState.config[key] || []).map(a => ({ ...a, active: a.id === id }));
            await saveAppState();
            msg.success('已切换激活数据库');
        },
        loginBilibili: () => {
            appState.ui.editingAccount = 'bilibili_' + Date.now();
            (appState.runtime.qrCodeManager ||= new QRCodeManager(q => appState.runtime.qrcode = q, async d => {
                updateAccount('bilibili', { ...d, id: 'bili_' + d.mid }, appState.config.bilibiliAccounts?.find(a => a.mid === d.mid) ? 'edit' : 'add');
                await saveAppState(); appState.ui.editingAccount = null; appState.runtime.qrCodeManager?.stopPolling(); msg.success('B站登录成功');
            })).startLogin();
        },
        loginAliDrive: async () => {
            appState.ui.editingAccount = 'alidrive_' + Date.now();
            appState.runtime.qrcode = { data: '', key: '', message: '' };
            appState.runtime.aliQrStop = await AliDriveManager.startQrLogin(
                appState.ui.editingData?.client_id || '2479dd2081ca48c29c81afa32795483c',
                appState.ui.editingData?.client_secret || '65ead32c717647328d4af6158defee38',
                appState.ui.editingData?.scopes || 'user:base file:all:read',
                q => (appState.runtime.qrcode = q),
                async acc => { updateAccount('alidrive', acc, (appState.config.alidriveAccounts || []).some(a => a.user_id === acc.user_id) ? 'edit' : 'add'); await saveAppState(); appState.ui.editingAccount = null; msg.success('阿里云盘登录成功'); }
            );
        },
        loginQuarkTV: async () => {
            appState.ui.editingAccount = 'quarktv_' + Date.now();
            appState.runtime.qrcode = { data: '', key: '', message: '' };
            appState.runtime.quarkQrStop = await QuarkTVManager.startQrLogin(
                q => (appState.runtime.qrcode = q),
                async acc => { updateAccount('quarktv', acc, (appState.config.quarktvAccounts || []).some(a => a.device_id === acc.device_id) ? 'edit' : 'add'); await saveAppState(); appState.ui.editingAccount = null; msg.success('夸克TV登录成功'); }
            );},
         loginBaiduDrive: async () => {
            appState.ui.editingAccount = 'baidudrive';
            appState.ui.editingData = {};
        },
        startBaiduQrLogin: async () => {
            appState.ui.editingAccount = 'baidudrive_' + Date.now();
            appState.runtime.qrcode = { data: '', key: '', message: '' };
            appState.runtime.baiduQrStop = await BaiduDriveManager.startDeviceLoginSimple(
                q => (appState.runtime.qrcode = q),
                async acc => { updateAccount('baidudrive', acc, (appState.config.baidudriveAccounts || []).some(a => String(a.uk) === String(acc.uk)) ? 'edit' : 'add'); await saveAppState(); appState.ui.editingAccount = null; }
            );
        },
    };

    const activatePro = async (code = appState.ui.licenseCode) => {
        const r = await LicenseManager.activate(String(code || ''), plugin);
        appState.runtime.currentLicense = r.license || null;
        if (r.success && appState.ui.licenseCode) appState.ui.licenseCode = '';
        showMessage(r.message || r.error, r.success ? 2000 : (r.isHtml ? 0 : 3000), r.success ? 'info' : 'error');
        await saveAppState();
        appState.ui.editingAccount = null;
    };

    let readmeContent = '', toc = [];
    const readmeFile = window.siyuan?.config?.lang?.toLowerCase() === 'en_us' ? 'README.md' : 'README_zh_CN.md';
    fetch(`/plugins/siyuan-media-player/${readmeFile}`).then(r => r.text()).then(t => (toc = [...t.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m, i) => ({ title: m[1], id: `toc-${i}` })), readmeContent = t.replace(/<h2([^>]*)>([^<]+)<\/h2>/g, (m, attrs, title) => `<h2${attrs} id="toc-${toc.findIndex(t => t.title === title)}">${title}</h2>`)));

    // 工具函数
    const tabs = [
        { id: 'account', name: i18n.setting?.tabs?.account || '账号' },
        { id: 'player', name: i18n.setting?.tabs?.player || '播放器' },
        { id: 'general', name: i18n.setting?.tabs?.general || '通用' },
        { id: 'about', name: i18n.setting?.tabs?.about || '关于' } ];

    const renderDesc = (d) => d?.icon
        ? `${d.icon.startsWith('#') ? `<svg class="acc-icon"><use xlink:href="${d.icon}"></use></svg>` : `<img src="${d.icon}" class="acc-icon">`}<div class="acc-info"><b>${d.name}</b> <span class="acc-muted">${d.status}</span><br><small>${d.info1}</small><br><small class="acc-muted">${d.info2}</small></div>`
        : d;

    const getTypeInfo = (type) => ({ trial: { name: '体验会员', color: '#ff9800' }, annual: { name: '年付会员', color: '#4caf50' }, dragon: { name: '恶龙会员', color: '#9c27b0' } }[type] || { name: type, color: '#666' });

    const createAccountItems = (accounts) => [
        { key: "proLicense", type: "account", tab: "account",
          description: appState.runtime.currentLicense?.isValid
            ? { icon: appState.runtime.currentLicense.type === 'dragon' ? '#iconDragon' : '#iconVIP',
                name: appState.runtime.currentLicense.userName,
                status: getTypeInfo(appState.runtime.currentLicense.type).name,
                statusColor: getTypeInfo(appState.runtime.currentLicense.type).color,
                info1: `用户ID: ${appState.runtime.currentLicense.userId}`,
                info2: `期限: ${appState.runtime.currentLicense.expiresAt === 0 ? '永久有效' : new Date(appState.runtime.currentLicense.expiresAt).toLocaleDateString()}` }
            : { icon: '#iconVIP', name: '申请Pro会员', status: '', statusColor: '', info1: '享受完整功能体验', info2: '激活码或申请体验' },
          accountData: { type: 'pro', id: 'pro', isValid: !!appState.runtime.currentLicense?.isValid } },
        ...accounts.sort((a, b) => ({ playlistdb: 0, webdav: 1, openlist: 2, pan123: 3, bilibili: 4, alidrive: 5, baidudrive: 6, quarktv: 7, s3: 8, ai: 9 }[a.type] || 999) - ({ playlistdb: 0, webdav: 1, openlist: 2, pan123: 3, bilibili: 4, alidrive: 5, baidudrive: 6, quarktv: 7, s3: 8, ai: 9 }[b.type] || 999))
          .map(acc => ({
            key: `account_${acc.id}`, type: "account", tab: "account",
            description: {
              icon: acc.type === 'playlistdb' ? '#iconDatabase'
                   : acc.type === 'bilibili' ? (acc.face || '#iconBili')
                   : acc.type === 'ai' ? '#iconSparkles'
                   : acc.type === 's3' ? '#iconCloud'
                   : acc.type === 'webdav' ? '/plugins/siyuan-media-player/assets/images/webdav.svg'
                   : acc.type === 'openlist' ? '/plugins/siyuan-media-player/assets/images/openlist.svg'
                   : acc.type === 'alidrive' ? (acc.face || '/plugins/siyuan-media-player/assets/images/openlist.svg')
                   : acc.type === 'baidudrive' ? (acc.face || '/plugins/siyuan-media-player/assets/images/openlist.svg')
                   : acc.type === 'pan123' ? (acc.face || '/plugins/siyuan-media-player/assets/images/openlist.svg')
                   : acc.type === 'quarktv' ? (acc.face || '/plugins/siyuan-media-player/assets/images/openlist.svg')
                   : '/plugins/siyuan-media-player/assets/images/openlist.svg',
              name: acc.type === 'playlistdb' ? (acc.name || '未命名播放列表') : acc.type === 'ai' ? (acc.provider || 'AI') : acc.type === 's3' ? (acc.name || acc.bucket || 'S3') : (acc.type === 'openlist' || acc.type === 'webdav') ? (acc.name || (() => { try { return new URL(acc.server).hostname.replace('www.',''); } catch { return acc.username || ACCOUNT_TYPES[acc.type]?.name; } })()) : (acc.uname || acc.user_name || acc.uk || acc.username || ACCOUNT_TYPES[acc.type]?.name),
              status: acc.type === 'playlistdb' ? (acc.active ? '使用中' : '待激活') : acc.type === 'bilibili' ? `LV${acc.level_info?.current_level}` : '已连接',
              statusColor: acc.type === 'playlistdb' ? (acc.active ? '#4caf50' : '#999') : '#4caf50',
              info1: acc.type === 'playlistdb' ? (acc.source === 'document' ? `文档名: ${acc.boundDoc?.name || '未绑定'}` : `数据库ID: ${acc.dbId || acc.id || ''}`) : acc.type === 'bilibili' ? `UID ${acc.mid}` : (acc.type === 'ai' ? (acc.model || '') : (acc.type === 's3' ? `Bucket: ${acc.bucket || ''}` : (acc.type === 'quarktv' ? (()=>{const u=String(acc.user_id||'');return `UID ${u.length>6?u.slice(0,3)+'...'+u.slice(-3):u}`})() : ((acc.type === 'alidrive' || acc.type === 'pan123') ? (acc.user_name || '') : (acc.type === 'baidudrive' ? ((acc.uname === (acc.baidu_name || '')) ? `网盘账号: ${acc.netdisk_name || acc.uk || ''}` : `百度账号: ${acc.baidu_name || acc.uk || ''}`) : acc.server))))),
              info2: acc.type === 'playlistdb' ? (acc.source === 'document' ? `文档ID: ${acc.boundDoc?.id || ''}` : `属性视图ID: ${acc.avId || ''}`) : acc.type === 'bilibili' ? `硬币 ${acc.money}` : (acc.type === 'ai' ? (acc.base || '') : (acc.type === 's3' ? (acc.endpoint || '') : (acc.type === 'quarktv' ? (acc.expires_at ? `到期: ${new Date(acc.expires_at).toLocaleDateString()}` : '') : (((acc.type === 'alidrive' || acc.type === 'baidudrive' || acc.type === 'pan123')) ? ((acc.quotaTotal ?? 0) > 0 ? `${((acc.quotaUsed ?? 0)/1073741824).toFixed(1)}GB / ${(acc.quotaTotal/1073741824).toFixed(1)}GB` : '') : `用户: ${acc.username}`))))
            },
            accountData: acc
          }))
    ];

    const createSettings = (config, accounts) => [
        ...createAccountItems(accounts || []),
        ...Object.entries(SETTING_CONFIGS).flatMap(([tab, configs]) =>
          configs.map(cfg => ({
            ...cfg, tab,
            value: cfg.key === 'playlistDb' ? config[cfg.key]?.id || '' : config[cfg.key] || (cfg.key === 'linkFormat' ? "- [😄标题 艺术家 字幕 时间](链接)" : cfg.key === 'mediaNotesTemplate' ? "# 📽️ 标题的媒体笔记\n- 📅 日 期：日期\n- ⏱️ 时 长：时长\n- 🎨 艺 术 家：艺术家\n- 🔖 类 型：类型\n- 🔗 链 接：[链接](链接)\n- ![封面](封面)\n- 📝 笔记内容：" : ""),
            title: typeof cfg.title === 'function' ? cfg.title() : cfg.title,
            description: typeof cfg.description === 'function' ? cfg.description() : cfg.description,
            options: cfg.options ? (typeof cfg.options === 'function' ? cfg.options() : cfg.options.map(opt => ({ ...opt, label: typeof opt.label === 'function' ? opt.label() : opt.label }))) : undefined
          }))
        )
    ];

    // 初始化和处理函数
    const refreshSettings = async () => {
        try {
            appState.config = { ...appState.config, ...((await getConfig()).settings || {}) };
            (window as any).__siyuanMediaPlayerIgnoreCert = appState.config.ignoreCertificateErrors;
            if (!appState.runtime.currentLicense) {
                appState.runtime.currentLicense = await LicenseManager.load(plugin).catch(() => null);
                if (appState.runtime.currentLicense?.type === 'trial') {
                    const expireDate = new Date(appState.runtime.currentLicense.expiresAt).toLocaleDateString();
                    showMessage(`体验会员已激活（到期：${expireDate}）🎯 升级享受完整功能`, 4000, 'info');
                }
            }

            if (!appState.runtime.notebooks.length) {
                appState.runtime.notebooks = await notebook.getList?.().catch(() => []) || [];
                appState.runtime.notebookOptions = [...appState.runtime.notebooks.map(nb => ({ label: nb.name, value: nb.id })), ...(appState.config.parentDoc?.id ? [{ label: appState.config.parentDoc.name, value: appState.config.parentDoc.id, path: appState.config.parentDoc.path }] : [])];
            }
        } catch (e) { console.warn('Settings refresh failed:', e); }
    };

    const handleChange = async (e, item) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        item.onChange ? await item.onChange(v) : appState.config[item.key] = v;
        await saveAppState();
    };

    // 生命周期
    let initialized = false;
    $: if (appState.ui.activeTab && !initialized) { refreshSettings(); initialized = true; }
    onMount(() => { refreshSettings(); initialized = true; });

    // 全局函数
    (globalThis as any).copyUserInfo = async () => {
        const user = await LicenseManager.getSiYuanUserInfo();
        if (!user) return msg.error('请先登录思源账号');
        await navigator.clipboard.writeText(JSON.stringify({userId: user.userId, userName: user.userName}));
        msg.success('用户信息已复制');
    };
</script>

<div class="panel common-panel" data-name={group}>
    <!-- 统一导航 -->
    <Tabs {activeTabId} {i18n}>
        <svelte:fragment slot="controls">
            <span class="panel-count">{tabs.find(tab => tab.id === appState.ui.activeTab)?.name || i18n.setting.description}</span>
        </svelte:fragment>
    </Tabs>

    <div class="layout-tab-bar fn__flex">
        {#each tabs as tab}
            <div class="item" class:item--focus={appState.ui.activeTab === tab.id} on:click={() => appState.ui.activeTab = tab.id}>
                <span class="item__text">{tab.name}</span>
            </div>
        {/each}
    </div>

    <div class="panel-content">
        {#each settingItems as item (item.key)}
            {#if item.tab === appState.ui.activeTab && (!item.displayCondition || item.displayCondition(appState.config))}
            <!-- 分组头部 -->
            {@const prev = settingItems[settingItems.indexOf(item) - 1]}
            {@const isAcct = appState.ui.activeTab === 'account' && item.type === 'account' && item.accountData?.type !== 'pro'}
            {@const isSetting = item.group?.id && item.tab !== 'account'}
            {#if isAcct && (!prev?.accountData || prev.accountData.type !== item.accountData.type)}
                {@const t = item.accountData.type}{@const exp = appState.ui.expandedGroups[t]}
                <div class="accordion-header" class:expanded={exp} on:click={() => appState.ui.expandedGroups[t] = !exp}><div class="accordion-icon">{@html ACCOUNT_TYPE_ICONS[t] || ''}</div><span>{ACCOUNT_TYPES[t]?.name}</span><svg class="accordion-arrow" class:expanded={exp} viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>
            {:else if isSetting && (!prev?.group?.id || prev.group.id !== item.group.id)}
                {@const exp = appState.ui.expandedGroups[item.group.id] ?? false}
                <div class="accordion-header" class:expanded={exp} on:click={() => appState.ui.expandedGroups[item.group.id] = !exp}><span>{item.group.name()}</span><svg class="accordion-arrow" class:expanded={exp} viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>
            {/if}

            {#if !(isAcct && !appState.ui.expandedGroups[item.accountData.type]) && !(isSetting && !(appState.ui.expandedGroups[item.group.id] ?? false))}
            <div class="setting-item setting-item-{item.type}" data-key={item.key}>
                <div class="setting-info">
                    {#if item.type !== 'account'}<div class="setting-title">{item.title}</div>{/if}
                    {#if item.description}<div class="setting-description {item.description?.icon ? 'acc-desc' : ''}">{@html renderDesc(item.description)}</div>{/if}
                    {#if item.type === 'slider'}<div class="slider-wrapper"><input class="b3-slider" type="range" min={item.slider?.min ?? 0} max={item.slider?.max ?? 100} step={item.slider?.step ?? 1} value={appState.config[item.key]} on:input={(e) => handleChange(e, item)}><span class="slider-value">{['speed', 'customSpeed'].includes(item.key) ? Number(appState.config[item.key]) / 100 + 'x' : item.key === 'screenshotQuality' ? appState.config[item.key] + '%' : appState.config[item.key]}</span></div>
                    {:else if item.type === 'text'}<input type="text" class="b3-text-field fn__block" value={String(item.value)} on:input={(e) => handleChange(e, item)} on:keydown={(e) => item.onKeydown && item.onKeydown(e)}>
                    {:else if item.type === 'textarea'}<textarea class="b3-text-field fn__block" rows={item.rows || 4} value={String(item.value)} on:input={(e) => handleChange(e, item)}></textarea>
                    {:else if item.type === 'custom' && item.key === 'playlistDisplayElements'}<div class="playlist-display-grid b3-list">{#each [['title',i18n.setting?.items?.playlistDisplayElements?.options?.title||'标题'],['thumbnail',i18n.setting?.items?.playlistDisplayElements?.options?.thumbnail||'缩略图'],['artist',i18n.setting?.items?.playlistDisplayElements?.options?.artist||'艺术家'],['artistIcon',i18n.setting?.items?.playlistDisplayElements?.options?.artistIcon||'头像'],['duration',i18n.setting?.items?.playlistDisplayElements?.options?.duration||'时长'],['url',i18n.setting?.items?.playlistDisplayElements?.options?.url||'链接'],['tags',i18n.setting?.items?.playlistDisplayElements?.options?.tags||'标签']] as [k,v]}<label class="b3-list-item"><input class="b3-switch" type="checkbox" checked={appState.config.playlistDisplayElements?.[k] ?? true} on:change={(e) => { appState.config.playlistDisplayElements = {...(appState.config.playlistDisplayElements || {}), [k]: e.target.checked}; saveAppState(); }}><span class="b3-list-item__text">{v}</span></label>{/each}</div>
                    {/if} </div>
                <div class="setting-control">
                    {#if item.type === 'checkbox'}<label class="checkbox-wrapper"><input class="b3-switch" type="checkbox" checked={Boolean(item.value)} on:change={(e) => handleChange(e, item)}><span class="checkbox-custom"></span></label>
                    {:else if item.type === 'select'}<select class="select-wrapper b3-select" value={item.value} on:change={(e) => handleChange(e, item)}>{#each item.options || [] as option}<option value={option.value} title={option.label}>{option.label.length > 30 ? option.label.slice(0, 30) + '...' : option.label}</option>{/each}</select>
                    {:else if item.type === 'number'}<input type="number" class="b3-text-field" min={item.number?.min ?? 1} value={item.value} on:input={(e) => handleChange(e, item)}>
                    {:else if item.type === 'button'}<button class="b3-button b3-button--outline {item.buttonStyle || ''}" on:click={() => item.onAction && item.onAction()}>{item.buttonText || '操作'}</button>
                    {:else if item.type === 'account'}<button class="b3-button b3-button--text" on:click|preventDefault|stopPropagation={(e) => { const m = new Menu(); const type = item.accountData.type; if (type === 'pro') { m.addItem({ icon: 'iconRefresh', label: '恢复激活', click: () => activatePro('') }); m.addItem({ icon: 'iconEdit', label: '输入激活码', click: () => accountManager.edit(type, item.accountData) }); } else { if (type === 'playlistdb' && !item.accountData.active) m.addItem({ icon: 'iconSelect', label: '切换激活', click: () => accountManager.toggleActive(type, item.accountData.id) }); m.addItem({ icon: 'iconEdit', label: type === 'bilibili' ? '重新登录' : '编辑', click: () => type === 'bilibili' ? accountManager.loginBilibili() : accountManager.edit(type, item.accountData) }); } if (type === 'pro' ? item.accountData.isValid : true) m.addItem({ icon: 'iconTrashcan', label: '删除', click: () => accountManager.delete(type, item.accountData.id) }); m.open({ x: e.clientX, y: e.clientY }); }}>⋯</button>
                    {/if} </div> </div>

            <!-- 账号编辑表单 -->
            {#if item.type === 'account' && (appState.ui.editingAccount === 'pro' || accounts.find(a => a.id === appState.ui.editingAccount)) && (appState.ui.editingAccount === item.accountData.id || appState.ui.editingAccount === item.accountData.type)}
                <div class="setting-item">
                    <div class="setting-info" on:keydown={(e) => { if (e.key === 'Enter') { const el = e.target; const p = (el?.placeholder || ''); const v = (el?.value || '').trim(); if (/回车搜索/.test(p) && v) { notebook.searchAndUpdate(v, {}, null).then(r => { if (r?.success && r.docs) { appState.runtime.playlistDocOptions = r.docs.map(doc => ({ label: doc.hPath || '无标题', value: doc.path?.replace(/^\/|\.sy$/g, '') || (doc.id || ''), path: doc.path?.replace(/^\/|\.sy$/g, '') || '', notebook: doc.box })).filter(d => d.value); } }); } } }}>
                    {#if appState.ui.editingAccount === 'pro'}<div class="setting-title">编辑Pro</div><input type="text" class="b3-text-field fn__block setting-spacer" bind:value={appState.ui.licenseCode} placeholder="请输入激活码"><div class="setting-actions"><button class="b3-button b3-button--text" on:click={() => activatePro()}>激活</button>{#if appState.runtime.currentLicense}<button class="b3-button b3-button--text" on:click={() => activatePro('')}>恢复激活</button>{:else}<button class="b3-button b3-button--cancel" on:click={() => activatePro('')}>申请体验</button>{/if}<button class="b3-button b3-button--cancel" on:click={() => appState.ui.editingAccount = null}>取消</button><button class="b3-button b3-button--text buy-highlight" on:click={() => window.open('https://pay.ldxp.cn/shop/J7MJJ8YR/zmfsuc', '_blank')}>购买</button></div>
                        {:else if appState.ui.editingAccount && (appState.ui.editingAccount.startsWith('bilibili') || appState.ui.editingAccount.startsWith('alidrive') || appState.ui.editingAccount.startsWith('baidudrive_') || appState.ui.editingAccount.startsWith('quarktv'))}{@const svc = appState.ui.editingAccount.startsWith('bilibili') ? 'B站' : (appState.ui.editingAccount.startsWith('alidrive') ? '阿里云盘' : (appState.ui.editingAccount.startsWith('baidudrive') ? '百度网盘' : '夸克TV'))}<div class="setting-title">{svc}登录</div><img class="qrcode-img" src={appState.runtime.qrcode.data} alt="登录二维码"><p>{appState.runtime.qrcode.message || '等待扫码'}</p><div class="setting-actions"><button class="b3-button b3-button--cancel" on:click={() => { appState.runtime.qrCodeManager?.stopPolling?.(); appState.runtime.aliQrStop?.stop?.(); appState.runtime.baiduQrStop?.stop?.(); appState.runtime.quarkQrStop?.stop?.(); appState.ui.editingAccount = null; }}>取消</button></div>
                        {:else}{@const acc = accounts.find(a => a.id === appState.ui.editingAccount)}{@const type = acc?.type || appState.ui.editingAccount}{@const src = type === 'playlistdb' ? (appState.ui.editingData?.source || acc?.source || appState.config.playlistSource || 'document') : null}<div class="setting-title">编辑{ACCOUNT_TYPES[type]?.name}</div>{#if type === 'playlistdb'}<select class="select-wrapper b3-select setting-spacer" value={src} on:change={(e) => { appState.ui.editingData = appState.ui.editingData || {}; appState.ui.editingData.source = e.target.value; }}><option value="document">文档</option><option value="database">数据库</option><option value="local">本地</option></select>{/if}{#each (type === 'playlistdb' && src === 'local' ? ['name'] : (type === 'playlistdb' ? ['name', 'dbId'] : (ACCOUNT_TYPES[type]?.fields || []))) as field}{#if field === 'forcePathStyle'}<label class="b3-list-item" style="margin-top:8px"><input class="b3-switch" type="checkbox" checked={appState.ui.editingData?.forcePathStyle ?? false} on:change={(e) => { appState.ui.editingData = appState.ui.editingData || {}; appState.ui.editingData.forcePathStyle = e.target.checked; }}><span class="b3-list-item__text">路径风格（MinIO/自建S3需勾选）</span></label>
                        {:else}<input type={(field === 'password' || field === 'apiKey' || field === 'client_secret' || field === 'secretAccessKey') ? 'password' : 'text'} class="b3-text-field fn__block" value={appState.ui.editingData?.[field] || ''} placeholder={field === 'name' ? '自定义名称' : field === 'dbId' ? (type === 'playlistdb' && src === 'document' ? '输入文档名称回车搜索' : '数据库ID（格式：14位数字-7位字符）') : field === 'server' ? '服务器地址' : field === 'prefix' ? '路径前缀（可选）' : field === 'username' ? '用户名' : field === 'base' ? 'API Base（例如 https://api.openai.com）' : field === 'apiKey' ? 'API Key' : field === 'model' ? '模型（例如 gpt-4o-mini）' : field === 'provider' ? '提供商（openai/azure/...）' : field === 'apiVersion' ? 'API 版本（仅 Azure）' : field === 'path' ? '接口路径（默认 /v1/chat/completions）' : field === 'client_id' ? 'Client ID' : field === 'client_secret' ? 'Client Secret' : field === 'root_id' ? '根文件夹ID（默认0）' : field === 'bucket' ? 'S3存储桶名称' : field === 'endpoint' ? '终端点URL (七牛云留空即可)' : field === 'region' ? '区域代码 (如 cn-south-1)' : field === 'accessKeyId' ? 'Access Key ID' : field === 'secretAccessKey' ? 'Secret Access Key' : '密码'} on:input={async(e) => { appState.ui.editingData = appState.ui.editingData || {}; appState.ui.editingData[field] = e.target.value; if(field==='dbId'&&type==='playlistdb'&&src==='database'){const v=e.target.value.trim();if(v&&/^\d{14}-[a-z0-9]{7}$/.test(v)){const r=await processDbId(v);appState.ui.editingData.avId=r.avId||'';appState.ui.editingData={...appState.ui.editingData};}else{appState.ui.editingData.avId='';}} }} on:keydown={async(e) => { if(field==='dbId'&&type==='playlistdb'&&src==='document'&&e.key==='Enter'&&e.target.value.trim()){const r=await notebook.searchAndUpdate(e.target.value.trim(),appState.config);if(r.success&&r.docs){appState.runtime.playlistDocOptions=r.docs.map(doc=>({label:doc.hPath||'无标题',value:doc.id||'',path:doc.path?.replace(/^\/|\.sy$/g,'')||'',notebook:doc.box})).filter(doc=>doc.value);const first=appState.runtime.playlistDocOptions[0];if(first){appState.ui.editingData=appState.ui.editingData||{};appState.ui.editingData.boundDoc={id:first.value,name:first.label,path:first.path,notebook:first.notebook};}}} }} style="margin-top:8px">
                        {#if field==='dbId'&&type==='playlistdb'&&src==='database'&&appState.ui.editingData?.avId}<small style="color:#4caf50;margin-top:4px;display:block">✓ 属性视图ID: {appState.ui.editingData.avId}</small>
                        {:else if field==='dbId'&&type==='playlistdb'&&src==='document'&&(appState.ui.editingData?.boundDoc?.name||acc?.boundDoc?.name)}<small style="color:#4caf50;margin-top:4px;display:block">✓ 绑定文档: {appState.ui.editingData?.boundDoc?.name||acc?.boundDoc?.name}</small> {/if}
                        {#if field==='dbId'&&type==='playlistdb'&&src==='document'&&appState.runtime.playlistDocOptions.length>0}<select class="select-wrapper b3-select" style="margin-top:4px" value={appState.ui.editingData?.boundDoc?.id||acc?.boundDoc?.id||''} on:change={(e)=>{const d=appState.runtime.playlistDocOptions.find(opt=>opt.value===e.target.value);if(d){appState.ui.editingData=appState.ui.editingData||{};appState.ui.editingData.boundDoc={id:d.value,name:d.label,path:d.path,notebook:d.notebook};}}}>{#each appState.runtime.playlistDocOptions as option}<option value={option.value} title={option.label}>{option.label.length>30?option.label.slice(0,30)+'...':option.label}</option>{/each}</select>{/if}{/if}{/each}<div>
                        <button class="b3-button b3-button--text" on:click={() => accountManager.save(type, appState.ui.editingData || {}, !!acc)}>保存</button>
                        <button class="b3-button b3-button--cancel" on:click={() => { appState.ui.editingAccount = null; appState.ui.editingData = {}; }}>取消</button>
                        </div> {/if} </div> </div> {/if} {/if} {/if} {/each}

        <!-- 添加账号表单 -->
        {#if appState.ui.activeTab === 'account' && appState.ui.editingAccount && !accounts.find(a => a.id === appState.ui.editingAccount) && appState.ui.editingAccount !== 'pro'}
            <div class="setting-item">
                <div class="setting-info" on:keydown={(e) => { if (e.key === 'Enter') { const el = e.target; const p = (el?.placeholder || ''); const v = (el?.value || '').trim(); if (/回车搜索/.test(p) && v) { notebook.searchAndUpdate(v, {}, null).then(r => { if (r?.success && r.docs) { appState.runtime.playlistDocOptions = r.docs.map(doc => ({ label: doc.hPath || '无标题', value: doc.path?.replace(/^\/|\.sy$/g, '') || (doc.id || ''), path: doc.path?.replace(/^\/|\.sy$/g, '') || '', notebook: doc.box })).filter(d => d.value); } }); } } }}>
                     {#if appState.ui.editingAccount && (appState.ui.editingAccount.startsWith('bilibili') || appState.ui.editingAccount.startsWith('alidrive') || appState.ui.editingAccount.startsWith('baidudrive_') || appState.ui.editingAccount.startsWith('quarktv'))}{@const svc = appState.ui.editingAccount.startsWith('bilibili') ? 'B站' : (appState.ui.editingAccount.startsWith('alidrive') ? '阿里云盘' : (appState.ui.editingAccount.startsWith('baidudrive') ? '百度网盘' : '夸克TV'))}<div class="setting-title">{svc}登录</div><img class="qrcode-img" src={appState.runtime.qrcode.data} alt="登录二维码"><p>{appState.runtime.qrcode.message || '等待扫码'}</p><div class="setting-actions"><button class="b3-button b3-button--cancel" on:click={() => { appState.runtime.qrCodeManager?.stopPolling?.(); appState.runtime.aliQrStop?.stop?.(); appState.runtime.baiduQrStop?.stop?.(); appState.runtime.quarkQrStop?.stop?.(); appState.ui.editingAccount = null; }}>取消</button></div>
                     {:else}{@const type = appState.ui.editingAccount}{@const src = type === 'playlistdb' ? (appState.ui.editingData?.source || 'document') : null}<div class="setting-title">添加{ACCOUNT_TYPES[type]?.name}</div>{#if type === 'playlistdb'}<select class="select-wrapper b3-select setting-spacer" value={src} on:change={(e) => { appState.ui.editingData = appState.ui.editingData || {}; appState.ui.editingData.source = e.target.value; }}><option value="document">文档</option><option value="database">数据库</option><option value="local">本地</option></select>{/if}{#each (type === 'playlistdb' && src === 'local' ? ['name'] : (type === 'playlistdb' ? ['name', 'dbId'] : (ACCOUNT_TYPES[type]?.fields || []))) as field}{#if field === 'forcePathStyle'}<label class="b3-list-item" style="margin-top:8px"><input class="b3-switch" type="checkbox" checked={appState.ui.editingData?.forcePathStyle ?? false} on:change={(e) => { appState.ui.editingData = appState.ui.editingData || {}; appState.ui.editingData.forcePathStyle = e.target.checked; }}><span class="b3-list-item__text">路径风格（MinIO/自建S3需勾选）</span></label>{:else}<input type={(field === 'password' || field === 'apiKey' || field === 'client_secret' || field === 'secretAccessKey') ? 'password' : 'text'} class="b3-text-field fn__block" value={appState.ui.editingData?.[field] || ''} placeholder={field === 'name' ? '自定义名称' : field === 'dbId' ? (type === 'playlistdb' && src === 'document' ? '输入文档名称回车搜索' : '数据库ID（格式：14位数字-7位字符）') : field === 'server' ? '服务器地址' : field === 'prefix' ? '路径前缀（可选）' : field === 'username' ? '用户名' : field === 'base' ? 'API Base（例如 https://api.openai.com）' : field === 'apiKey' ? 'API Key' : field === 'model' ? '模型（例如 gpt-4o-mini）' : field === 'provider' ? '提供商（openai/azure/...）' : field === 'apiVersion' ? 'API 版本（仅 Azure）' : field === 'path' ? '接口路径（默认 /v1/chat/completions）' : field === 'client_id' ? 'Client ID' : field === 'client_secret' ? 'Client Secret' : field === 'root_id' ? '根文件夹ID（默认0）' : field === 'bucket' ? 'S3存储桶名称' : field === 'endpoint' ? '终端点URL (七牛云留空)' : field === 'region' ? '区域代码 (如 cn-south-1)' : field === 'accessKeyId' ? 'Access Key ID' : field === 'secretAccessKey' ? 'Secret Access Key' : (field === 'auth_code' ? '授权码 Code' : '密码')} on:input={async(e) => { appState.ui.editingData = appState.ui.editingData || {}; appState.ui.editingData[field] = e.target.value; if(field==='dbId'&&type==='playlistdb'&&src==='database'){const v=e.target.value.trim();if(v&&/^\d{14}-[a-z0-9]{7}$/.test(v)){const r=await processDbId(v);appState.ui.editingData.avId=r.avId||'';appState.ui.editingData={...appState.ui.editingData};}else{appState.ui.editingData.avId='';}} }} on:keydown={async(e) => { if(field==='dbId'&&type==='playlistdb'&&src==='document'&&e.key==='Enter'&&e.target.value.trim()){const r=await notebook.searchAndUpdate(e.target.value.trim(),appState.config);if(r.success&&r.docs){appState.runtime.playlistDocOptions=r.docs.map(doc=>({label:doc.hPath||'无标题',value:doc.id||'',path:doc.path?.replace(/^\/|\.sy$/g,'')||'',notebook:doc.box})).filter(doc=>doc.value);const first=appState.runtime.playlistDocOptions[0];if(first){appState.ui.editingData=appState.ui.editingData||{};appState.ui.editingData.boundDoc={id:first.value,name:first.label,path:first.path,notebook:first.notebook};}}} }}>{#if field==='dbId'&&type==='playlistdb'&&src==='database'&&appState.ui.editingData?.avId}<small style="color:#4caf50;margin-top:4px;display:block">✓ 属性视图ID: {appState.ui.editingData.avId}</small>{/if}{#if field==='dbId'&&type==='playlistdb'&&src==='document'&&appState.runtime.playlistDocOptions.length>0}<select class="select-wrapper b3-select" style="margin-top:4px" value={appState.ui.editingData?.boundDoc?.id||''} on:change={(e)=>{const d=appState.runtime.playlistDocOptions.find(opt=>opt.value===e.target.value);if(d){appState.ui.editingData=appState.ui.editingData||{};appState.ui.editingData.boundDoc={id:d.value,name:d.label,path:d.path,notebook:d.notebook};}}}>{#each appState.runtime.playlistDocOptions as option}<option value={option.value} title={option.label}>{option.label.length>30?option.label.slice(0,30)+'...':option.label}</option>{/each}</select>{/if}{/if}{/each}<div>
                    <button class="b3-button b3-button--outline" on:click={() => (type==='baidudrive' ? window.open(BaiduDriveManager.getAuthorizeUrl(), '_blank') : null)} style="display:{type==='baidudrive' ? 'inline-block' : 'none'}">打开授权页</button>
                    <button class="b3-button b3-button--outline" on:click={() => (type==='baidudrive' ? accountManager.startBaiduQrLogin() : null)} style="display:{type==='baidudrive' ? 'inline-block' : 'none'}">扫码登录</button>
                    <button class="b3-button b3-button--text" on:click={() => accountManager.save(type, appState.ui.editingData || {}, false)}>{type==='baidudrive' ? '完成授权' : '保存'}</button>
                    <button class="b3-button b3-button--cancel" on:click={() => { appState.ui.editingAccount = null; appState.ui.editingData = {}; }}>取消</button>
                    </div> {/if} </div> </div> {/if}        

        <!-- 添加按钮 -->
        {#if appState.ui.activeTab === 'account'}
            <div class="setting-item">
                <div class="setting-info">
                    <div class="setting-title">添加账号</div>
                </div>
                <div class="setting-control">
                    <button class="b3-button b3-button--outline" on:click|preventDefault|stopPropagation={(e) => {
                        const m = new Menu();
                        m.addItem({ icon: 'iconDatabase', label: '播放列表', click: () => { appState.ui.editingAccount = 'playlistdb'; appState.ui.editingData = {}; }});
                        m.addItem({ icon: 'iconCloud', label: 'WebDAV', click: () => { appState.ui.editingAccount = 'webdav'; appState.ui.editingData = {}; }});
                        m.addItem({ icon: 'iconCloud', label: 'OpenList', click: () => { appState.ui.editingAccount = 'openlist'; appState.ui.editingData = {}; }});
                        m.addItem({ icon: 'iconCloud', label: '123云盘(开发者授权)', click: () => { appState.ui.editingAccount = 'pan123'; appState.ui.editingData = {}; }});
                        m.addItem({ icon: 'iconCloud', label: '阿里云盘', click: () => { accountManager.loginAliDrive(); }});
                        m.addItem({ icon: 'iconCloud', label: '百度网盘', click: () => { accountManager.loginBaiduDrive(); }});
                        m.addItem({ icon: 'iconCloud', label: '夸克TV', click: () => { accountManager.loginQuarkTV(); }});
                        m.addItem({ icon: 'iconCloud', label: 'S3存储', click: () => { appState.ui.editingAccount = 's3'; appState.ui.editingData = {}; }});
                        m.addItem({ icon: 'iconCloud', label: 'AI', click: () => { appState.ui.editingAccount = 'ai'; appState.ui.editingData = {}; }});
                        if (isBilibiliAvailable()) { m.addItem({ icon: 'iconCloud', label: 'B站', click: () => accountManager.loginBilibili() });}
                        m.open({ x: e.clientX, y: e.clientY });
                    }}>添加账号</button> </div> </div> {/if}

        <!-- 关于 -->
        {#if appState.ui.activeTab === 'about'}
            {#if toc.length}<div class="b3-list about-toc">{#each toc as item}<a href="#{item.id}" on:click|preventDefault={() => document.getElementById(item.id)?.scrollIntoView({behavior: 'smooth'})}>{item.title.replace(/[🚀⚠️🧧📖]/g, '').trim()}</a>{/each}</div>{/if}
            <div class="about-content">{@html readmeContent}</div> {/if} </div> </div>