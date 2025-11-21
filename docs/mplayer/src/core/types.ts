/**
 * 基础类型定义
 */
export type MediaType = 'video' | 'audio' | 'bilibili';
export type SettingType = 'slider' | 'checkbox' | 'select' | 'textarea' | 'images' | 'custom' | 'account' | 'button';

/**
 * B站登录信息（合并后）
 */
export interface BilibiliLogin {
    // 登录凭证
    sessdata: string;
    refresh_token: string;
    timestamp: number;
    // 用户信息
    mid: number;
    uname: string;
    face: string;
    level_info: {
        current_level: number;
        current_exp: number;
        next_exp: string | number;
    };
    money: number;
    vipStatus: number;
    wbi_img?: {
        img_url: string;
        sub_url: string;
    };
}

/**
 * 通用B站API响应
 */
export interface BiliApiResponse<T = any> {
    code: number;
    message: string;
    data: T;
}

/**
 * 媒体相关基础字段
 */
interface MediaBase {
    id: string;           // 唯一标识符
    title: string;        // 媒体标题
    url: string;          // 媒体URL
    type: MediaType;
    artist?: string;      // 作者/UP主名称
    artistIcon?: string;  // 作者/UP主头像
    artistId?: string;    // 作者/UP主ID
    duration?: string;    // 媒体时长，格式化后的时间字符串
    thumbnail?: string;   // 媒体缩略图
}

/**
 * B站视频特有属性
 */
interface BilibiliProps {
    bvid?: string;        // B站bv号
    headers?: Record<string, string>;
}

/**
 * 播放控制属性
 */
interface PlayControlProps {
    startTime?: number;
    endTime?: number;
    isLoop?: boolean;
    loopCount?: number;
}

/**
 * 媒体项（合并多个相关接口）
 */
export interface MediaItem {
    id: string;            // 媒体ID
    title: string;         // 标题
    type?: string;         // 类型：'video', 'audio', 'bilibili', 'folder'等
    url: string;           // 媒体URL
    originalUrl?: string;  // 原始URL(用于时间戳链接，WebDAV等)
    bvid?: string;         // B站BV号
    cid?: string;          // B站CID
    aid?: string;          // B站AV号
    epid?: string;         // B站EP号(课程/番剧)
    isCourse?: boolean;    // 是否为B站课程
    seasonId?: string;     // B站合集/课程ID
    seasonTitle?: string;  // B站合集/课程标题
    page?: number;         // B站视频分P页码
    pages?: Array<{cid: string; page: number; part: string; page_data?: any}>;  // B站视频分P列表
    thumbnail?: string;    // 缩略图
    artist?: string;       // 艺术家/UP主名
    artistIcon?: string;   // 艺术家/UP主头像
    artistId?: string;     // 艺术家/UP主ID
    duration?: string;     // 时长(格式化后的字符串)
    startTime?: number;    // 开始时间(秒)
    endTime?: number;      // 结束时间(秒)
    isLoop?: boolean;      // 是否循环播放
    loopCount?: number;    // 循环次数
    source?: string;       // 来源, 如 'openlist'
    sourcePath?: string;   // 来源路径
    size?: number;         // 文件大小(字节)
    is_dir?: boolean;      // 是否为文件夹
    action?: string;       // 动作类型, 如 'navigateToTab'
    targetTabId?: string;  // 目标标签ID, 用于导航
    
    // 音频专属字段
    album?: string;        // 专辑名
    year?: number;         // 发行年份
    genre?: string[];      // 流派
    lyrics?: string;       // 歌词内容
    coverDataUrl?: string; // 临时封面base64（用于即时显示）
}

/**
 * 媒体信息接口（简化版本的MediaItem）
 */
export interface MediaInfo extends MediaBase, BilibiliProps {}

/**
 * 配置文件类型定义
 */
export interface Config {
    /** 插件设置 */
    settings: {
        /** 音量大小 (0-100) */
        volume: number;
        /** 播放速度 (0.5-2.0) */
        speed: number;
        /** 是否开启热键 */
        hotkey: boolean;
        /** 是否循环播放 */
        loop: boolean;
        /** 循环次数 */
        loopCount?: number;
        /** 循环后暂停 */
        pauseAfterLoop?: boolean;
        /** 循环播放列表 */
        loopPlaylist?: boolean;
        /** 单项循环 */
        loopSingle?: boolean;
        /** 插入方式：光标处/追加/前置/剪贴板 */
        insertMode: string;
        /** 媒体笔记创建方式：光标/笔记本/文档/日记 */
        mediaNotesMode?: string;
        /** 是否显示字幕 */
        showSubtitles: boolean;
        /** 是否启用弹幕 */
        enableDanmaku: boolean;
        /** 弹幕速度 (1-10) */
        danmakuSpeed?: number;
        /** 弹幕透明度 (0-100) */
        danmakuOpacity?: number;
        /** 弹幕字体大小 */
        danmakuFontSize?: number;
        /** 弹幕显示区域 (百分比) */
        danmakuArea?: number;
        /** 播放器类型 */
        playerType: string;
        /** 播放器打开方式 */
        openMode?: string;
        /** 外部播放器路径 */
        playerPath: string;
        /** PotPlayer 路径（优先使用） */
        potplayerPath?: string;
        /** VLC 路径（优先使用） */
        vlcPath?: string;
        /** 链接格式模板 */
        linkFormat: string;
        /** 截图包含时间戳 */
        screenshotWithTimestamp?: boolean;
        /** 是否启用数据库功能 */
        enableDatabase?: boolean;
        /** 播放列表数据库 */
        playlistDb?: { id: string; avId?: string };
        /** 播放列表视图状态 */
        playlistView?: { mode: string; tab: string; expanded: string[] };
        /** 播放列表显示元素配置 */
        playlistDisplayElements?: Record<string, boolean>;
            /** OpenList配置 */
    openlistConfig?: {
            server: string;    // 服务器地址
            username: string;  // 用户名
            password: string;  // 密码
            token?: string;    // 认证令牌
            connected?: boolean; // 连接状态
        };
        /** WebDAV配置 */
        webdavConfig?: {
            server: string;    // 服务器地址
            username: string;  // 用户名
            password: string;  // 密码
            connected?: boolean; // 连接状态
        };
        /** 目标笔记本 */
        targetNotebook?: { id: string; name: string };
        /** 媒体笔记模板 */
        mediaNotesTemplate?: string;
        // UI临时状态(不持久化)
        qrcode?: { data: string; key: string };
        bilibili?: { login: boolean; userInfo: any };
        openlist?: { enabled: boolean; showPanel: boolean };
        webdav?: { enabled: boolean };
        // Pro许可证(极限精简版 - 只保存必要信息)
        pro?: {
            enabled: boolean;
            license?: {
                code: string;     // 激活码
                userId: string;   // 用户ID
                userName: string; // 用户昵称
            };
        };
    };
    /** B站登录信息 */
    bilibiliLogin?: BilibiliLogin;
}

/**
 * 播放列表配置
 */
export interface PlaylistConfig {
    id: string;          // 列表ID
    name: string;        // 列表名称
    isFixed?: boolean;   // 是否为固定列表
    items: MediaItem[];  // 媒体项列表
    path?: string;       // 媒体源路径（本地文件夹/openlist/思源/B站收藏夹）
    sourceType?: string; // 源类型：folder/openlist/siyuan/bilibili
    openlistPath?: string;  // OpenList当前路径 (已废弃，使用path替代)
    openlistPathParts?: {name: string; path: string}[];  // OpenList路径各部分
}

/**
 * 播放选项，包含字幕配置
 */
export interface PlayOptions extends PlayControlProps, BilibiliProps, Partial<MediaItem> {
    type?: 'bilibili' | 'bilibili-dash' | string;
    title?: string;
    source?: string;        // 媒体源类型 (alidrive, bilibili, local, etc.)
    sourcePath?: string;    // 源路径 (用于阿里云盘等)
    cid?: string;          // B站视频CID
    page?: number;         // B站视频分P页码
    tvboxTitle?: string;   // TVBox 片名
    tvboxEpisode?: number; // TVBox 集数
    quality?: Array<{      // 清晰度选项 (用于 artplayer quality)
        default: boolean;
        html: string;
        url: string;
    }>;
    subtitle?: {
        url: string;
        type?: string;       // 字幕类型 (vtt, srt, ass)
        encoding?: string;   // 字幕编码
        escape?: boolean;    // 是否转义HTML标签
        style?: Record<string, string>;
    };
    dashData?: any;         // 传给dashjs插件的dash数据 (旧格式，即将移除)
    biliDash?: any;         // B站返回的dash数据结构
}

/**
 * 视频流数据
 */
export interface VideoStream {
    video: {
        url: string;
        size?: number;
    };
    headers?: Record<string, string>;
    mpdUrl?: string;
}

/**
 * 设置项
 */
export interface ISettingItem {
    key: string;
    value: number | boolean | string | Array<{url: string; caption?: string}>;
    type: SettingType;
    title: string;
    description?: string;
    slider?: {
        min: number;
        max: number;
        step: number;
    };
    options?: Array<{
        label: string;
        value: string;
    }>;
    rows?: number;          // textarea行数
    placeholder?: string;   // 输入框占位文本
    status?: any;           // 状态信息，用于自定义类型
    button?: {
        config: string;
        save: string;
        exit: string;
        state?: string;
        buttonText?: string;
        username?: string;
        userId?: string;
    };
    show?: {
        config: string[];
        exit: string[];
    };
    hide?: {
        save: string[];
    };
    tab?: string;
    displayCondition?: (state: any) => boolean;
    onAction?: () => Promise<void> | void;
    onChange?: (value: any) => Promise<void> | void;
    buttonText?: string;        // 按钮文本
    buttonStyle?: string;       // 按钮样式类名
    avatar?: string;
    name?: string;
    level?: string | number;
    uid?: string | number;
    nickname?: string;
    actionType?: string;
}

/**
 * 播放器类型枚举
 */
export enum PlayerType {
    BUILT_IN = 'built-in',
    MPV = 'mpv',
    POT_PLAYER = 'potplayer',
    VLC = 'vlc',
    BROWSER = 'browser'
}

/**
 * 链接格式相关类型
 */
export enum LinkFormatVariable {
    TIME = 'time',
    TITLE = 'title',
    ARTIST = 'artist',
    SUBTITLE = 'subtitle',
    CUSTOM = 'custom'
}

export interface LinkFormatVariableInfo {
    id: LinkFormatVariable;
    label: string;
    description: string;
    placeholder: string;
}

/**
 * B站视频AI总结响应接口
 */
export interface BiliVideoAiSummary {
    code: number;
    message: string;
    ttl: number;
    data: {
        code: number;
        model_result: {
            result_type: number;
            summary: string;
            outline?: {
                title: string;
                part_outline: {
                    timestamp: number;
                    content: string;
                }[];
                timestamp: number;
            }[];
        };
        stid: string;
        status: number;
        like_num: number;
        dislike_num: number;
    };
}

/**
 * 组件实例接口定义，用于统一生命周期管理
 */
export interface ComponentInstance {
    $destroy?: () => void;
    $set?: (props: any) => void;
    $on?: (event: string, callback: (event: CustomEvent<any>) => void) => void;
    addMedia?: (url: string, options?: any) => void;
    [key: string]: any;
}
