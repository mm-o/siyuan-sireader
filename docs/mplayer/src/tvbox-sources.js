// 思源媒体播放器 - TVBox 源配置
// 为思源媒体播放器插件提供 TVBox 源与默认站点配置
// 作者：mm-o
// 版本：2.0.0

(function(){
  'use strict';
  if (window.tvboxSources) return;
  window.tvboxSources = {
    // 首页默认站点（建议设置为带海报的 CMS）
    homeSiteKey: '非凡资源',

    // 源列表
    sources: [
      // 直连 CMS（确保有封面海报）— 放前面以便默认站点优先生效
      { name: '直连CMS', url: 'inline://manual', kind: 'inline', sites: [
        // 官方常用
        { key: 'ffzy', name: '非凡资源', api: 'http://cj.ffzyapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'lzi', name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod/', type: 1, searchable: 1 },

        // HTTPS 优先
        { key: 'haiwaikan', name: '海外看', api: 'https://haiwaikan.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: '360zy', name: '360资源', api: 'https://360zy.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'heimuer', name: '黑木耳', api: 'https://www.heimuer.tv/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'yyff', name: '业余', api: 'https://yyff.540734621.xyz/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'hw8', name: '华为吧', api: 'https://hw8.live/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'xiaohuangren', name: '小黄人', api: 'https://iqyi.xiaohuangrentv.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'niuniu', name: '牛牛', api: 'https://api.niuniuzy.me/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'yaya', name: '丫丫', api: 'https://cj.yayazy.net/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'uku', name: 'U酷资源', api: 'https://api.ukuapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'haohua', name: '豪华资源', api: 'https://hhzyapi.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'jisu', name: '极速资源', api: 'https://jszyapi.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: '49zy', name: '四九资源', api: 'https://49zyw.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'suoni', name: '索尼资源', api: 'https://suoniapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'ikun', name: 'ikun资源', api: 'https://ikunzyapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'baofeng', name: '暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'hongniu', name: '红牛资源', api: 'https://www.hongniuzy2.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'feisu', name: '飞速资源', api: 'https://www.feisuzyapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'kuaikan', name: '快看资源', api: 'https://www.kuaikan-api.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'xiongzhang', name: '熊掌资源', api: 'https://xzcjz.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'kuaiche', name: '快车资源', api: 'https://caiji.kczyapi.com/api.php/provide/vod/from/kcm3u8/', type: 1, searchable: 1 },
        { key: 'yinghua', name: '樱花资源', api: 'https://m3u8.apiyhzy.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'wolong', name: '卧龙资源', api: 'https://collect.wolongzyw.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'tianyi', name: '天翼资源', api: 'https://www.911ysw.top/tianyi.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'huya', name: '虎牙资源', api: 'https://www.huyaapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'baidu', name: '百度资源', api: 'https://api.apibdzy.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'piaoling', name: '飘零资源', api: 'https://p2100.net/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'wujin', name: '无尽资源', api: 'https://api.wujinapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'subo', name: '速博资源', api: 'https://subocaiji.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'modu', name: '魔都资源', api: 'https://caiji.moduapi.cc/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'qihu', name: '奇虎资源', api: 'https://caiji.qhzyapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'xinlang', name: '新浪资源', api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'kuaiyun', name: '快云资源', api: 'https://www.kuaiyunzy.com/api.php/provide/vod/', type: 1, searchable: 1 },

        // 以下为 HTTP（可能受浏览器混合内容限制，仅在允许 HTTP 的环境可用）
        { key: '39kan', name: '39影视', api: 'http://39kan.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'lehoo', name: '乐活影视', api: 'http://lehootv.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'tangrenjie', name: '唐人街', api: 'http://tangrenjie.tv/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'guangsu', name: '光速资源', api: 'http://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8', type: 1, searchable: 1 },
        { key: 'ykapi', name: '影库资源网', api: 'http://api.ykapi.net/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'apitt', name: '探探资源', api: 'http://apittzy.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'jinying', name: '金鹰资源', api: 'http://jyzyapi.com/provide/vod/from/jinyingm3u8', type: 1, searchable: 1 },
        { key: 'aosika', name: '奥斯卡资源', api: 'http://aosikazy.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'laoya', name: '老鸭资源', api: 'http://api.apilyzy.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'beidouxing', name: '北斗星资源', api: 'http://m3u8.bdxzyapi.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'kuaibo', name: '快播资源', api: 'http://www.kuaibozy.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'lovedan', name: '艾旦影视', api: 'http://lovedan.net/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'piaohua', name: '飘花电影', api: 'http://www.zzrhgg.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'wangmin', name: '网民电影', api: 'http://prinevillesda.org/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'siwa', name: '丝袜资源', api: 'http://siwazyw.cc/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'tiankong', name: '天空资源', api: 'http://m3u8.tiankongapi.com/api.php/provide/vod/from/tkm3u8', type: 1, searchable: 1 },
        { key: 'tiantang', name: '天堂资源', api: 'http://vipmv.cc/api.php/provide/vod', type: 1, searchable: 1 },
        { key: '1080zyku', name: '优质资源库', api: 'http://api.1080zyku.com/inc/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'senlin', name: '森林资源', api: 'http://slapibf.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'kudian1', name: '酷点资源(kuapi)', api: 'http://api.kuapi.cc/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'kudian2', name: '酷点资源(kudian10)', api: 'http://kudian10.com/api.php/provide/vod', type: 1, searchable: 1 },
        { key: 'cttv_ys9', name: '刺桐', api: 'http://ys9.cttv.vip/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'cttv_gw', name: '官网', api: 'http://gwcms.cttv.vip/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'zuidazy', name: '最大资源', api: 'http://zuidazy.me/api.php/provide/vod/', type: 1, searchable: 1 },
        { key: 'sdzy', name: '闪电资源', api: 'http://sdzyapi.com/api.php/provide/vod/', type: 1, searchable: 1 },
      ]},

      // 聚合源（可选）
      { name: 'WEX', url: 'https://9280.kstore.space/wex.json' },
      { name: '饭太硬', url: 'http://www.饭太硬.com/tv/', kind: 'site' }
    ],

    loaded: true,
    version: '2.0.0'
  };
})();