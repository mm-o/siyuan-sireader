// 思源阅读器 - 书源配置扩展
// ==SiReaderBookSources==
// @name         SiReader 书源数据
// @version      3.0.0
// @description  思源笔记电子书阅读增强插件书源存储
// @updateTime   2025-12-27
// ==/SiReaderBookSources==

window.siyuanBookSources = {
  sources:[
  {
    "bookSourceComment": "                    \"error:List is empty.\n                                        \"error:List is empty.\n                                        \"error:List is empty.\n                    error:List is empty.\n\"\"\"",
    "bookSourceGroup": "",
    "bookSourceName": "追书·女生💯",
    "bookSourceType": 0,
    "bookSourceUrl": "http://www.zhuishushenqi.com/nvsheng",
    "bookUrlPattern": "",
    "customOrder": 356,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "exploreUrl": "",
    "lastUpdateTime": 1723224949000,
    "loginUrl": "",
    "respondTime": 426,
    "ruleBookInfo": {
      "coverUrl": "class.book-info@img@src",
      "intro": "class.content intro@textNodes",
      "lastChapter": "class.chapter-list clearfix@tag.li.0@a@text"
    },
    "ruleContent": {
      "content": "class.inner-text@p@html"
    },
    "ruleExplore": {},
    "ruleSearch": {
      "author": "class.author@tag.span.0@text",
      "bookList": "class.book",
      "bookUrl": "a@href",
      "coverUrl": "img@src",
      "kind": "class.author@tag.span.2@text&&class.popularity@text##\\|.*",
      "lastChapter": "class.popularity@text##.*\\|",
      "name": "class.name@text"
    },
    "ruleToc": {
      "chapterList": "id.J_chapterList@li@a",
      "chapterName": "text",
      "chapterUrl": "href"
    },
    "searchUrl": "https://www.zhuishushenqi.com/search?val={{key}}",
    "weight": 0
  },
  {
    "bookSourceComment": "",
    "bookSourceGroup": "",
    "bookSourceName": "塔读文学🎃",
    "bookSourceType": 0,
    "bookSourceUrl": "http://www.tadu.com#🎃",
    "bookUrlPattern": "",
    "customOrder": 101,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "exploreUrl": "",
    "header": "",
    "lastUpdateTime": 1633694405258,
    "loginUrl": "http://www.tadu.com/",
    "respondTime": 480,
    "ruleBookInfo": {
      "author": "class.bookNm@tag.span.0@text##\\s.*",
      "coverUrl": "class.bookImg@data-src",
      "intro": "tag.p.0@html",
      "kind": "class.sortList@tag.a.0@text&&class.newUpdate@tag.span.0@text##更新时间.",
      "lastChapter": "class.newUpdate@tag.a.0@text",
      "name": "class.bookNm@tag.a.0@text",
      "wordCount": "class.datum@tag.span.0@text"
    },
    "ruleContent": {
      "content": "id.bookPartResourceUrl@value\n<js>\nvar J = java.ajax(result);\nresult = String(J).replace(/callback\\(\\{content:\\'(.*)\\'\\}\\)/g, '$1')\n</js>\n",
      "imageStyle": "0"
    },
    "ruleExplore": {
      "author": "tag.a.3@text",
      "bookList": "class.bookList bookBgList@tag.li",
      "bookUrl": "tag.a.1@href",
      "coverUrl": "tag.img@data-src",
      "intro": "class.bookIntro@text",
      "kind": "tag.a.4@text&&tag.a.6@text",
      "lastChapter": "tag.a.5@text##最新更新.",
      "name": "tag.a.1@text",
      "wordCount": "class.condition@tag.span.1@text"
    },
    "ruleSearch": {
      "author": ".authorNm@text",
      "bookList": ".bookList.bookBgList@li",
      "bookUrl": ".bookNm@href",
      "coverUrl": "img@data-src",
      "intro": ".bookIntro@text",
      "kind": ".condition@span@text",
      "lastChapter": ".condition@a@text",
      "name": ".bookNm@text",
      "wordCount": ".condition@span.1@text"
    },
    "ruleToc": {
      "chapterList": "class.lf lfT hidden@tag.a",
      "chapterName": "text",
      "chapterUrl": "href",
      "isVip": "tag.i@text"
    },
    "searchUrl": "/search?&pageSize=10&pageNum={{page}}&query={{key}}",
    "weight": 0
  },
    {
    "bookSourceComment": "",
    "bookSourceGroup": "",
    "bookSourceName": "行轻小说",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "http://s.sfacg.com",
    "bookUrlPattern": "",
    "customOrder": 1725,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "lastUpdateTime": 1731433297450,
    "loginUrl": "http://passport.sfacg.com/Login.aspx",
    "respondTime": 511,
    "ruleBookInfo": {
      "kind": "class.tag-list@class.text@text",
      "tocUrl": "text.点击阅读@href"
    },
    "ruleContent": {
      "content": "class.article-content font16@html"
    },
    "ruleExplore": {},
    "ruleSearch": {
      "author": "tag.li.1@text##.+综合信息：\\s*([^\\/]+).*##$1",
      "bookList": "tag.form@tag.table.-2@tag.ul",
      "bookUrl": "tag.a@href",
      "coverUrl": "tag.img@src",
      "intro": "tag.li.1@text##.+\\d+:\\d+\\s*(.+).*##$1",
      "lastChapter": "tag.li.1@text##.+\\/(\\d+\\/\\d+\\/\\d+).*##$1",
      "name": "tag.a@text"
    },
    "ruleToc": {
      "chapterList": "class.catalog-list@tag.ul@tag.li@tag.a",
      "chapterName": "text",
      "chapterUrl": "href"
    },
    "searchUrl": "http://s.sfacg.com/?Key={{key}}&S=1&SS=0",
    "weight": 0
  },
    {
    "bookSourceComment": "",
    "bookSourceGroup": "",
    "bookSourceName": "📚 追书神器",
    "bookSourceType": 0,
    "bookSourceUrl": "http://www.zhuishushenqi.com/chuban",
    "bookUrlPattern": "",
    "customOrder": 1397,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": true,
    "exploreUrl": "",
    "lastUpdateTime": 1738414438798,
    "respondTime": 524,
    "ruleBookInfo": {
      "coverUrl": "class.book-info@img@src",
      "init": "",
      "intro": "class.content intro@textNodes",
      "lastChapter": "class.chapter-list clearfix@tag.li.0@a@text"
    },
    "ruleContent": {
      "content": "class.inner-text@p@html"
    },
    "ruleExplore": {
      "bookList": ""
    },
    "ruleSearch": {
      "author": "class.author@tag.span.0@text",
      "bookList": "class.book",
      "bookUrl": "a@href",
      "coverUrl": "img@src",
      "kind": "class.author@tag.span.2@text&&class.popularity@text##\\|.*",
      "lastChapter": "class.popularity@text##.*\\|",
      "name": "class.name@text"
    },
    "ruleToc": {
      "chapterList": "id.J_chapterList@li@a",
      "chapterName": "text",
      "chapterUrl": "href"
    },
    "searchUrl": "https://www.zhuishushenqi.com/search?val={{key}}",
    "weight": 0
  },
  {
    "bookSourceComment": "",
    "bookSourceGroup": "",
    "bookSourceName": "绾书文学网🎃",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "http://app.wanshu.com:80#🎃",
    "bookUrlPattern": "",
    "customOrder": 1676,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "lastUpdateTime": 1693015068654,
    "loginUrl": "{\n  \"url\": \"\"\n}",
    "respondTime": 601,
    "ruleBookInfo": {
      "intro": "description"
    },
    "ruleContent": {
      "content": "@JSon:$..content@js:result.replace(/\\<|\\/|\\p|\\>/g,\"\\n\")"
    },
    "ruleExplore": {},
    "ruleSearch": {
      "author": "author",
      "bookList": "@JSon:$.data",
      "bookUrl": "https://api.wanshu.com/novel/chapterList?novel_id={$.novel_id}",
      "coverUrl": "cover",
      "kind": "category_name",
      "lastChapter": "latest_chapter",
      "name": "name"
    },
    "ruleToc": {
      "chapterList": "@JSon:$.data",
      "chapterName": "name",
      "chapterUrl": "https://api.wanshu.com/novel/chapterInfo?novel_chapter_id={$.id}"
    },
    "searchUrl": "https://api.wanshu.com/novel/search?page={{page}}&pageSize=20&kw={{key}}",
    "weight": 0
  },
  {
    "bookSourceComment": "书籍来源于：https://www.69shuba.com\n\n正常情况本书源无需代理，无需过验证，可直接使用，部分地区用户可能无法访问，需要开代理\n\n欢迎使用晴天融合书源，融合书源支持番茄小说，七猫小说，喜马拉雅听书，懒人听书，番茄短剧，河马短剧，69书吧等几十中来源，地址：http://vip.gyks.cf",
    "bookSourceGroup": "起点",
    "bookSourceName": "69书吧[晴天接口]",
    "bookSourceType": 0,
    "bookSourceUrl": "https://69shuba.gyks.cf",
    "customOrder": -1,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": true,
    "exploreUrl": "<js>\nconst data = [\n    \"玄幻魔法\",\n    \"修真武侠\",\n    \"言情小说\",\n    \"历史军事\",\n    \"游戏竞技\",\n    \"科幻空间\",\n    \"悬疑惊悚\",\n    \"同人小说\",\n    \"都市小说\",\n    \"官场职场\",\n    \"穿越时空\",\n    \"青春校园\"\n];\n\nlet categorys = [];\nconst status = [\"连载\", \"全本\"];\n\nfor (let i of status) {\n    categorys.push({\n        title: i,\n        url: `/ranking?status=${i}&page={{page}}`,\n        style: {\n            layout_flexGrow: 1,\n            layout_flexBasisPercent: 1\n        }\n    });\n    \n    for (let j of data) {\n        categorys.push({\n            title: j,\n            url: `/ranking?category=${j}&status=${i}&page={{page}}`,\n            style: {\n                layout_flexGrow: 1,\n                layout_flexBasisPercent: 0.25\n            }\n        });\n    }\n}\n\ncategorys.push({\n    title: \"最新\",\n    url: \"/ranking?new=1&page={{page}}\",\n    style: {\n        layout_flexGrow: 1,\n        layout_flexBasisPercent: 1\n    }\n});\n\nfor (let j of data) {\n    categorys.push({\n        title: j,\n        url: `/ranking?category=${j}&new=1&page={{page}}`,\n        style: {\n            layout_flexGrow: 1,\n            layout_flexBasisPercent: 0.25\n        }\n    });\n}\n\ncategorys.push({\n    title: \"字数\",\n    url: \"/ranking?wordNumber=1&page={{page}}\",\n    style: {\n        layout_flexGrow: 1,\n        layout_flexBasisPercent: 1\n    }\n});\n\nfor (let j of data) {\n    categorys.push({\n        title: j,\n        url: `/ranking?category=${j}&wordNumber=1&page={{page}}`,\n        style: {\n            layout_flexGrow: 1,\n            layout_flexBasisPercent: 0.25\n        }\n    });\n}\n\nJSON.stringify(categorys);\n</js>",
    "lastUpdateTime": 1761281645781,
    "loginUrl": "http://vip.gyks.cf",
    "respondTime": 180000,
    "ruleBookInfo": {
      "author": "author",
      "coverUrl": "thumb_url",
      "init": "data",
      "intro": "abstract",
      "kind": "{{$.category}},{{$.status}},{{$.last_chapter_update_time}}",
      "lastChapter": "last_chapter_title",
      "name": "book_name",
      "tocUrl": "$.bookid\n<js>\njava.put('bookid',result);\n\"/catalog?bookid=\"+result;\n</js>",
      "wordCount": "word_number"
    },
    "ruleContent": {
      "content": "$.data\n<js>\nfunction cleanChapterText(text) {\n  const lines = text.split('\\n');\n  const filteredLines = lines.filter(line => {\n    return !(line.includes('第') && line.includes('章')) && \n           !line.includes('作者：') &&\n           !/^\\d{4}-\\d{2}-\\d{2}/.test(line.trim());\n  });\n  return filteredLines.join('\\n');\n}\n\ncleanChapterText(result);\n</js>"
    },
    "ruleExplore": {
      "author": "author",
      "bookList": "data",
      "bookUrl": "/detail?bookid={{$.bookid}}",
      "coverUrl": "thumb_url",
      "intro": "abstract",
      "kind": "{{$.category}},{{$.status}}",
      "lastChapter": "last_chapter_title",
      "name": "book_name",
      "wordCount": "word_number"
    },
    "ruleSearch": {
      "author": "author",
      "bookList": "data",
      "bookUrl": "/detail?bookid={{$.bookid}}",
      "checkKeyWord": "罪狱岛",
      "coverUrl": "thumb_url",
      "intro": "abstract",
      "kind": "{{$.category}},{{$.status}}",
      "lastChapter": "last_chapter_title",
      "name": "book_name",
      "wordCount": "word_number"
    },
    "ruleToc": {
      "chapterList": "data",
      "chapterName": "title",
      "chapterUrl": "$.itemid\n<js>\nlet bookid = java.get('bookid');\n`/content?bookid=${bookid}&itemid=${result}`;\n</js>"
    },
    "searchUrl": "/search?key={{key}}&page={{page}}",
    "weight": 0
  },
  {
    "bookSourceComment": "",
    "bookSourceGroup": "⭐️ API",
    "bookSourceName": "⭐ 猫眼看书",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "http://api.lemiyigou.com",
    "customOrder": 298,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": false,
    "exploreUrl": "[\n{\"title\": \"男频榜单\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"必读榜\",\"url\": \"/module/rank?type=1&channel=1&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"潜力榜\",\"url\": \"/module/rank?type=5&channel=1&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"完本榜\",\"url\": \"/module/rank?type=2&channel=1&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"更新榜\",\"url\": \"/module/rank?type=3&channel=1&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"搜索榜\",\"url\": \"/module/rank?type=4&channel=1&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"评论榜\",\"url\": \"/module/rank?type=6&channel=1&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"男频全部\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"玄幻\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=lejRej\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"武侠\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=nel5aK\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"都市\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=mbk5ez\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"仙侠\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=vbmOeY\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"军事\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=penRe7\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"历史\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=xbojag\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"游戏\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=mep2bM\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"科幻\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=zbq2dp\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"轻小说\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=YerEdO\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"男频完结\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"玄幻\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=lejRej&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"武侠\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=nel5aK&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"都市\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=mbk5ez&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"仙侠\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=vbmOeY&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"军事\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=penRe7&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"历史\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=xbojag&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"游戏\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=mep2bM&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"科幻\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=zbq2dp&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"轻小说\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=YerEdO&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"男频连载\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"玄幻\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=lejRej&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"武侠\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=nel5aK&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"都市\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=mbk5ez&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"仙侠\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=vbmOeY&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"军事\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=penRe7&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"历史\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=xbojag&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"游戏\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=mep2bM&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"科幻\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=zbq2dp&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"轻小说\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=YerEdO&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"女频榜单\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"必读榜\",\"url\": \"/module/rank?type=1&channel=2&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"潜力榜\",\"url\": \"/module/rank?type=5&channel=2&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"完本榜\",\"url\": \"/module/rank?type=2&channel=2&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"更新榜\",\"url\": \"/module/rank?type=3&channel=2&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"搜索榜\",\"url\": \"/module/rank?type=4&channel=2&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"评论榜\",\"url\": \"/module/rank?type=6&channel=2&page={{page}}\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"女频全部\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"现代言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=9avmeG\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"古代言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=DdwRb1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"幻想言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=7ax9by\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"青春校园\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=Pdy7aQ\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"唯美纯爱\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=kazYeJ\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"同人衍生\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=9aAOdv\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"女频完结\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"现代言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=9avmeG&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"古代言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=DdwRb1&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"幻想言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=7ax9by&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"青春校园\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=Pdy7aQ&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"唯美纯爱\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=kazYeJ&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"同人衍生\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=9aAOdv&isComplete=1\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"女频连载\",\"url\": \"\",\n\"style\": {\"layout_flexGrow\": 0,\n\"layout_flexBasisPercent\": 1\n}},\n{\"title\": \"现代言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=9avmeG&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"古代言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=DdwRb1&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"幻想言情\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=7ax9by&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"青春校园\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=Pdy7aQ&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"唯美纯爱\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=kazYeJ&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}},\n{\"title\": \"同人衍生\",\"url\": \"/novel?sort=1&page={{page}}&categoryId=9aAOdv&isComplete=0\",\n\"style\": {\"layout_flexGrow\": 1,\n\"layout_flexBasisPercent\": 0.29\n}}\n]",
    "header": "{\n'User-Agent': 'okhttp/4.9.2','client-device': '2d37f6b5b6b2605373092c3dc65a3b39','client-brand': 'Redmi','client-version': '2.3.0','client-name': 'app.maoyankanshu.novel','client-source': 'android','Authorization': 'bearereyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwOlwvXC9hcGkuanhndHp4Yy5jb21cL2F1dGhcL3RoaXJkIiwiaWF0IjoxNjgzODkxNjUyLCJleHAiOjE3NzcyMDM2NTIsIm5iZiI6MTY4Mzg5MTY1MiwianRpIjoiR2JxWmI4bGZkbTVLYzBIViIsInN1YiI6Njg3ODYyLCJwcnYiOiJhMWNiMDM3MTgwMjk2YzZhMTkzOGVmMzBiNDM3OTQ2NzJkZDAxNmM1In0.mMxaC2SVyZKyjC6rdUqFVv5d9w_X36o0AdKD7szvE_Q'\n}",
    "lastUpdateTime": 1735197594560,
    "respondTime": 30331,
    "ruleBookInfo": {
      "author": "$.authorName",
      "coverUrl": "$..cover",
      "init": "$.data",
      "intro": "$..summary##(^|[。！？]+[”」）】]?)##$1<br>",
      "kind": "{{$.lastChapter.decTime}},{{$.averageScore}}分,{{$.className}},{{$..tagName}}",
      "lastChapter": "$.lastChapter.chapterName##正文卷.|正文.|VIP卷.|默认卷.|卷_|VIP章节.|免费章节.|章节目录.|最新章节.|[\\(（【].*?[求更票谢乐发订合补加架字修Kk].*?[】）\\)]",
      "name": "$.novelName",
      "tocUrl": "/novel/{{$.novelId}}/chapters?readNum=1",
      "wordCount": "$.wordNum"
    },
    "ruleContent": {
      "content": "$.content",
      "replaceRegex": "##一秒记住.*精彩阅读。|7017k"
    },
    "ruleExplore": {
      "author": "",
      "bookList": "",
      "bookUrl": "",
      "coverUrl": "",
      "intro": "",
      "kind": "",
      "name": "",
      "wordCount": ""
    },
    "ruleSearch": {
      "author": "$.authorName",
      "bookList": "$.data[*]",
      "bookUrl": "/novel/{{$.novelId}}?isSearch=1",
      "checkKeyWord": "道观",
      "coverUrl": "$.cover",
      "intro": "$.summary",
      "kind": "{{$..className}},{{$.averageScore}}分",
      "lastChapter": "",
      "name": "$.novelName",
      "wordCount": "$.wordNum"
    },
    "ruleToc": {
      "chapterList": "$.data.list[*]",
      "chapterName": "$.chapterName##正文卷.|正文.|VIP卷.|默认卷.|卷_|VIP章节.|免费章节.|章节目录.|最新章节.|[\\(（【].*?[求更票谢乐发订合补加架字修Kk].*?[】）\\)]",
      "chapterUrl": "$.path@js:java.aesBase64DecodeToString(result,\"f041c49714d39908\",\"AES/CBC/PKCS5Padding\",\"0123456789abcdef\")",
      "updateTime": "{{$.updatedAt}} 字数：{{$.wordNum}}"
    },
    "searchUrl": "{{cookie.removeCookie(source.getKey())}}\n/search?page={{page}}&keyword={{key}}",
    "weight": 0
  },
  {
    "bookSourceComment": "                    \"error:正文内容为空\n                                        \"error:正文内容为空\n                                        \"error:正文内容为空\n                    \"error:正文内容为空\n\"\"\"\"",
    "bookSourceGroup": "",
    "bookSourceName": "🔖去读书",
    "bookSourceType": 0,
    "bookSourceUrl": "http://m.qudushu.com",
    "customOrder": 2095,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": true,
    "exploreUrl": "玄幻魔法::http://m.qudushu.com/sort/1/{{page}}.html&&武侠修真::http://m.qudushu.com/sort/2/{{page}}.html&&都市言情::http://m.qudushu.com/sort/3/{{page}}.html&&历史军事::http://m.qudushu.com/sort/4/{{page}}.html&&侦探推理::http://m.qudushu.com/sort/5/{{page}}.html&&网游动漫::http://m.qudushu.com/sort/6/{{page}}.html&&科幻小说::http://m.qudushu.com/sort/7/{{page}}.html&&恐怖灵异::http://m.qudushu.com/sort/8/{{page}}.html&&言情小说::http://m.qudushu.com/sort/9/{{page}}.html&&其他类型::http://m.qudushu.com/sort/10/{{page}}.html&&经        部::http://m.qudushu.com/sort/11/{{page}}.html&&史        书::http://m.qudushu.com/sort/12/{{page}}.html&&集        部::http://m.qudushu.com/sort/14/{{page}}.html&&子        部::http://m.qudushu.com/sort/13/{{page}}.html&&四库之外::http://m.qudushu.com/sort/15/{{page}}.html&&古典书籍::http://m.qudushu.com/sort/16/{{page}}.html&&诗        歌::http://m.qudushu.com/sort/17/{{page}}.html&&宋         词::http://m.qudushu.com/sort/18/{{page}}.html",
    "lastUpdateTime": 1721730949378,
    "respondTime": 20202,
    "ruleBookInfo": {},
    "ruleContent": {
      "content": ".novelcontent@html##（本章未完，请点击下一页继续阅读）|(下|上)一章|返回目录|加入书签|(第|)[两一二三四五六七八九十百千万(楔子)\\d]+.*?\\(第\\d+/\\d+页\\)",
      "nextContentUrl": "text.下一章@href"
    },
    "ruleExplore": {
      "author": ".author@text",
      "bookList": "@css:div.article",
      "bookUrl": "tag.a.1@href@js:result.replace('book','html')\n+'asc-1/'",
      "coverUrl": "img@src",
      "intro": ".simple@textNodes",
      "name": "h6@text"
    },
    "ruleSearch": {
      "author": "tag.a.1@text",
      "bookList": "@css:p.sone",
      "bookUrl": "tag.a.0@href",
      "coverUrl": "tag.a.0@href@js:var id = result.match(/html\\/(\\d+)\\//)[1];\nxid=Math.floor(id/1000);\n'http://www.qudushu.com/files/article/image/'+xid+'/'+id+'/'+id+'s.jpg'",
      "intro": "",
      "name": "tag.a.0@text"
    },
    "ruleToc": {
      "chapterList": "class.list_xm.1@ul@li@a",
      "chapterName": "text",
      "chapterUrl": "href",
      "nextTocUrl": "@js:var regex = /value=\"(\\/html\\/\\d+\\/asc-\\d+\\/)\" /g;\nvar match;\nvar list = [];\nwhile ((match = regex.exec(result)) != null) {\nlist.push(match[1])};\nlist",
      "updateTime": ""
    },
    "searchUrl": "http://m.qudushu.com/modules/article/search.php?q={{key}}",
    "weight": 94
  },
  {
    "bookSourceName": "小说精华阁",
    "bookSourceType": 0,
    "bookSourceUrl": "https://www.babahome.net",
    "customOrder": 0,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": true,
    "lastUpdateTime": 1761125780940,
    "respondTime": 4891,
    "ruleBookInfo": {
      "author": "class.small@span.0@text",
      "coverUrl": "id.fmimg@img@src",
      "intro": "id.intro@p@text",
      "kind": "class.small@span.1@text##分类：",
      "lastChapter": "class.small@span.5@a@text",
      "name": "id.info@h1@text",
      "wordCount": "class.small@span.3@text##字数："
    },
    "ruleContent": {
      "content": "id.nr_content@html##精华书阁 www.babahome.net，最快更新|(本章未完，请点击下一页继续阅读)|免费阅读.https://www.babahome.net|紧急通知：精华书阁启用新地址-www.babahome.net，请重新收藏书签！",
      "nextContentUrl": "text.下一页@href"
    },
    "ruleSearch": {
      "author": ".p3@text",
      "bookList": "class.list_ul@tag.li",
      "bookUrl": ".p1@a.0@href",
      "checkKeyWord": "系统",
      "coverUrl": "",
      "intro": "",
      "lastChapter": ".p2@a.0@text",
      "name": ".p1@a.0@text",
      "wordCount": ".p4@text"
    },
    "ruleToc": {
      "chapterList": "id.list@dl.1@dd",
      "chapterName": "a.0@text",
      "chapterUrl": "a.0@href"
    },
    "searchUrl": "/search.html?ie=utf-8&word={{key}}",
    "weight": 0
  },
  {
    "bookSourceComment": "",
    "bookSourceGroup": "",
    "bookSourceName": "耽美小说网",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "https://www.blxsw.cc",
    "bookUrlPattern": "http://m.blxsw.foreverx.cn/\\w+/\\d+.html",
    "customOrder": 3,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "exploreUrl": "现代都市::/xiandaidushi/<,index_{{page}}.html>\n古代架空::/gudaijiakong/<,index_{{page}}.html>\n穿越重生::/chuanyuechongsheng/<,index_{{page}}.html>\n玄幻灵异::/xuanhuanlingyi/<,index_{{page}}.html>\n推理悬疑::/tuilixuanyi/<,index_{{page}}.html>\n网游竞技::/wangyoujingji/<,index_{{page}}.html>\nＢＬ同人::/BLtongren/<,index_{{page}}.html>\nＧＬ百合::/GLbaihe/<,index_{{page}}.html>\n本站推荐::/bztuijian/<,index_{{page}}.html>\n热门排行::/bzremen/<,index_{{page}}.html>\n周排行榜::/bzremenweek/<,index_{{page}}.html>\n月排行榜::/bzremenmonth/<,index_{{page}}.html>",
    "header": "{\"User-Agent\": \"Mozilla/5.0 (Linux; Android 9) Mobile Safari/537.36\"}",
    "lastUpdateTime": 1760195431987,
    "respondTime": 2301,
    "ruleBookInfo": {
      "author": "//table[@class=\"title_info\"]/tbody/tr[2]/td[@class=\"info_text\"]/text()@js:result.split('作者：')[1]",
      "kind": "//table[@class=\"title_info\"]/tbody/tr[2]/td[@class=\"info_text\"]/text()@js:\na=String(result)\na.match(/状态：(\\S+)/)[1];",
      "name": "h1@text"
    },
    "ruleContent": {
      "content": "#text>p@textNodes"
    },
    "ruleExplore": {
      "author": "li a span.list-author-1@text:regex('作者：(.*?)')",
      "bookList": "ul > li",
      "bookUrl": "a@href",
      "kind": "span.list-class-name-1@text",
      "name": "a@title"
    },
    "ruleSearch": {
      "author": "h2.r span:nth-of-type(2)@text",
      "bookList": "h2.r",
      "bookUrl": "a.l@href",
      "checkKeyWord": "我的",
      "intro": "tr:nth-of-type(1) td@text",
      "kind": "td a.fl@text",
      "name": "a.l@text"
    },
    "ruleToc": {
      "chapterList": "select option",
      "chapterName": "@text",
      "chapterUrl": "@value"
    },
    "searchUrl": "<js>\nurl=source.bookSourceUrl+\"/e/search/index.php\";\nbody=`show=title&keyboard=${key}&Submit22=%E6%90%9C%E7%B4%A2`\nres=java.post(url,body,{}).headers();\nurl=source.bookSourceUrl+\"/e/search/\"+res.location\n</js>",
    "weight": 0
  },
  {
    "bookSourceComment": "//2025年-9月17日 有正常单品作为，AI提示词：做半成品修复！这里感谢deep，元宝，豆包互相叠",
    "bookSourceGroup": "",
    "bookSourceName": "鬼吹灯",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "http://www.gdbzkz.org/",
    "customOrder": 4,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "lastUpdateTime": 1760007782190,
    "respondTime": 1518,
    "ruleBookInfo": {
      "author": "class.small@tag.span.0@text##作 者：",
      "coverUrl": "class.cover@img@src",
      "intro": "class.intro@textNodes##作者.*|无弹窗.*",
      "kind": "[property=og:novel:update_time]@content&&\n[property=og:novel:category]@content&&\n[property=og:novel:status]@content ",
      "lastChapter": "class.small@tag.span.5@a@text##百度搜索.*",
      "name": "class.info@h2@text##\\（.*|\\(.*|免费阅读|全文.*阅读|最新章节|笔趣阁|小说",
      "wordCount": "class.info@class.small@tag.span.3@text##字数："
    },
    "ruleContent": {
      "content": "id.content@html##http.*html|天才一秒记住.*org|请记住本书首发域.*org"
    },
    "ruleExplore": {
      "author": "class.s4@text",
      "bookList": "class.l@li",
      "bookUrl": "class.s2@a@href",
      "kind": "class.s5@text",
      "lastChapter": "class.s3@a@text",
      "name": "class.s2@a@text##\\（.*|\\(.*|免费阅读|全文.*阅读|最新章节|笔趣阁|小说"
    },
    "ruleSearch": {
      "author": "class.author@text##作者：",
      "bookList": "class.bookbox@class.p10",
      "bookUrl": "class.bookname@tag.a@href",
      "coverUrl": "class.bookimg@img@src",
      "intro": "class.bookinfo@p@text",
      "kind": "class.cat@text##分类：",
      "lastChapter": "class.update@tag.a@text##百度搜索.*",
      "name": "class.bookname@tag.a@text##\\（.*|\\(.*|免费阅读|全文.*阅读|最新章节|笔趣阁|小说"
    },
    "ruleToc": {
      "chapterList": "class.listmain@dd!0:1:2:3:4:5:6:7:8:9:10:11",
      "chapterName": "tag.a@text",
      "chapterUrl": "tag.a@href"
    },
    "searchUrl": "http://www.gdbzkz.org/s.php?ie=utf-8&q={{key}}",
    "weight": 0
  },
  {
    "bookSourceComment": "其他源的小说内容错误，然后自己手写",
    "bookSourceGroup": "ryw",
    "bookSourceName": "ryw笔趣阁78",
    "bookSourceType": 0,
    "bookSourceUrl": "https://www.biquge78.cc",
    "customOrder": 5,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": true,
    "exploreUrl": "",
    "lastUpdateTime": 1759304196420,
    "respondTime": 1743,
    "ruleBookInfo": {
      "author": "p.booktag@a@text",
      "coverUrl": "[property=\"og:image\"]@content",
      "intro": "p.bookintro@text",
      "kind": "ol.breadcrumb@li.1@text",
      "lastChapter": "a.bookchapter@text",
      "name": "h1.booktitle@text",
      "tocUrl": "div.list-chapterAll@dd@a@href",
      "wordCount": "p.booktag@span.0@text"
    },
    "ruleContent": {
      "content": "class.readcontent@tag.p@html",
      "nextContentUrl": "id.linkNext@href"
    },
    "ruleSearch": {
      "author": "div.author.0@text##作者：",
      "bookList": "div.bookbox",
      "bookUrl": "a.del_but@href",
      "checkKeyWord": "借剑",
      "intro": "div.update@text",
      "lastChapter": "div.cat@text",
      "name": "h4.bookname@text"
    },
    "ruleToc": {
      "chapterList": "#list-chapterAll@dd",
      "chapterName": "tag.a@text",
      "chapterUrl": "tag.a@href",
      "preUpdateJs": ""
    },
    "searchUrl": "{{cookie.removeCookie(source.getKey())}}/search/,{\n\"method\": \"POST\",\n  \"body\": \"searchkey={{key}}\"\n}",
    "weight": 0
  },
  {
    "bookSourceName": "18笔趣阁",（有问题，目录正确，无内容）
    "bookSourceType": 0,
    "bookSourceUrl": "https://www.bqgns.com",
    "customOrder": 10,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": false,
    "lastUpdateTime": 1763201330387,
    "respondTime": 6903,
    "ruleBookInfo": {
      "author": "//p[@class='author']/text()",
      "name": "//div[@class='detail_rt']/h1/text()"
    },
    "ruleContent": {
      "content": "//div[@class='text']/text()"
    },
    "ruleSearch": {
      "author": "$.author",
      "bookList": "$.data.list",
      "bookUrl": "/book/{{$.id}}",
      "checkKeyWord": "成功",
      "coverUrl": "$.imgUrl",
      "intro": "",
      "name": "$.title"
    },
    "ruleToc": {
      "chapterList": "div.v-sheet div a",
      "chapterName": "a@text",
      "chapterUrl": "a@href",
      "nextTocUrl": "//div[@class='seo_page']/a[text()='下一页']/@href"
    },
    "searchUrl": "/api/query/search?keyword={{key}}&size=50",
    "weight": 0
  },
  {
    "bookSourceComment": "源作者:qaz1749，该书源无发现功能，网站目前暂时不需要梯子，也没有机器人验证和登录要求",
    "bookSourceGroup": "网文",
    "bookSourceName": "新笔趣阁",
    "bookSourceType": 0,
    "bookSourceUrl": "https://www.biquges123.com",
    "bookUrlPattern": "https://www.biquges123.com\\d+",
    "customOrder": 16,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": true,
    "lastUpdateTime": 1759264712653,
    "respondTime": 6950,
    "ruleBookInfo": {
      "author": "class.info_ct@tag.div.2@text",
      "coverUrl": "class.info_lt@tag.img@src",
      "init": "tag.main",
      "intro": "class.des@tag.span@text",
      "kind": "class.bread@tag.a.1@text",
      "lastChapter": "class.ud@tag.a@text",
      "name": "class.info_title@text"
    },
    "ruleContent": {
      "content": "class.article@html",
      "nextContentUrl": "class.text_btn@tag.a.2@href",
      "title": "class.text@tag.h1@text"
    },
    "ruleSearch": {
      "author": ".author@text",
      "bookList": "class.hot_4@tag.li",
      "bookUrl": "class.hot_4_item@tag.a@href",
      "coverUrl": "class.cover@tag.img@src",
      "intro": "class.hot_des@text",
      "name": ".hot_name@text"
    },
    "ruleToc": {
      "chapterList": "class.list@tag.li",
      "chapterName": "tag.a@title",
      "chapterUrl": "tag.a@href"
    },
    "searchUrl": "/search?keyword={{key}}&page={{page}}",
    "weight": 0
  },
  {
    "bookSourceGroup": "星辰",
    "bookSourceName": "冷冷文学",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "https://www7.lenglengbb.com/",
    "customOrder": 17,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "exploreUrl": "全部::/category/0/\n原创小说::/category/168326864887877/\n‎同‍‌‌人‍衍生::/category/168326864900166/\n‌P‍‍‌O‍‌1‌‎8‎‍::/category/168325583147077/\n都市::/category/4497418743879/\n玄幻::/category/4497418813510/\n现代言情::/category/123687453134919/\n古代言情::/category/123687453102149/\n科幻::/category/4497418604613/\n古言::/category/4497419206726/\n现言::/category/4497418784838/\n幻想言情::/category/123687453163590/\n历史::/category/4497418846278/\n悬疑::/category/4497418977350/\n游戏::/category/4497418752070/\n奇幻::/category/4497418838087/\n‎同‍‌‌人‍::/category/123687453151304/\n青春::/category/4497419108424/\n武侠::/category/4497418797126/\n仙侠::/category/4497418756166/\n轻小说::/category/4497418735686/\n幻情::/category/4497418879046/\n竞技::/category/123695583178826/\n军事::/category/4497419591752/\n现实::/category/4497419587654/\n体育::/category/4497418895432/\n纯爱::/category/10322166141000/\n短篇::/category/4497419214918/\n其他::/category/123687454683208/\n其它分类::/category/4497426522184/",
    "header": "{\n  \"User-Agent\": \"Mozilla/5.0 (Linux; Android 8.1.0; JKM-AL00b Build/HUAWEIJKM-AL00b; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.126 MQQBrowser/6.2 TBS/044807 Mobile Safari/537.36\"\n}",
    "lastUpdateTime": 1761113251452,
    "loginCheckJs": "if (result.body().includes(\"Just a moment\")) {\n\tjava.startBrowserAwait(result.url(), \"验证\")\n\t} else result",
    "respondTime": 12436,
    "ruleBookInfo": {
      "author": "[property=\"og:novel:author\"]@content",
      "coverUrl": "[property=\"og:image\"]@content",
      "intro": "[property=\"og:description\"]@content",
      "kind": "[property=\"og:novel:status\"]@content",
      "lastChapter": "[property=\"og:novel:latest_chapter_name\"]@content",
      "name": ".BGsectionOne-top@.title@text",
      "tocUrl": "text.查看全部章节@href"
    },
    "ruleContent": {
      "content": "@js:\nfunction d(a, b) {\n            b = java.md5Encode(b);\n            var d = b.substring(0, 16);\n            var e = b.substring(16);\n            return  java.createSymmetricCrypto(\"AES/CBC/PKCS7Padding\" ,e,d).decryptStr(a)\n            \n            //java.aesBase64DecodeToString(a,e,\"AES/CBC/PKCS5Padding\",d)\n            };\n           \ndecryptFunc = d;\n\neval(result.match(/((?:decryptFunc|d)\\(\"[\\s\\S]+?\"\\))\\)?;?/)[1])"
    },
    "ruleExplore": {
      "author": "a.2@text",
      "bookList": ".CGsectionTwo-right-content-unit",
      "bookUrl": "a@href",
      "intro": "p.-2@text##标签.*",
      "lastChapter": "p.-1@text",
      "name": "a.0@text"
    },
    "ruleSearch": {
      "author": "span.2@a@text",
      "bookList": ".SHsectionThree-middle@p",
      "bookUrl": "span.1@a@href",
      "name": "span.1@a@text"
    },
    "ruleToc": {
      "chapterList": "class.BCsectionTwo-top-chapter@li\n<js>\nlist = result.toArray();\ns = /originalOrder = .*?;/.test(src)?eval(src.match(/originalOrder = (.*?);/)[1]):result;\nl = [];\nif(/<li.*?\"\\d+\" .*?-[^\"]+=\"\\d+\">/.test(result)){\n\tnum = String(result).match(/<li.*?\"\\d+\" (.*?-[^\"]+)=\"\\d+\">/)[1];\n\tl = list.sort((a,b)=>a.attr(num)-b.attr(num));\n\t}else{\nfor(i in list){ l[s[i]] = list[i]};\n}\nl.join(\"\")\n</js>\ntag.a",
      "chapterName": "<js>\ntry{\nresult = String(result);\n!/\\.html/.test(result)?result.match(/class=\"g\".*?=\"[a-zA-Z\\d\\+=\\/]{30,}?\".*?=\"(.*?)\"/)[1]:java.getString(\"@@data-real||text\");\n}catch(e){\n\tresult = result.match(/class=\"g\".*?=\"(.*?)\".*?=\"[a-zA-Z\\d\\+=\\/]{30,}?\"/)[1]\n\t}\n</js>",
      "chapterUrl": "@href\n<js>\ntry{\nlet re = /class=\"g\" .*?=\"([a-zA-Z\\d\\+=\\/]{30,})\"/;\nresult = /\\.html/.test(result)?result:java.base64Decode(String(src).match(re)[1])\n}catch(e){}\n</js>",
      "nextTocUrl": "text.下一页@href"
    },
    "searchUrl": "/search/{{key}}/{{page}}",
    "weight": 0
  },
  {
    "bookSourceGroup": "✦优",
    "bookSourceName": "森林ᵐᵘ -",
    "bookSourceType": 0,
    "bookSourceUrl": "http://23.224.242.55/",
    "customOrder": 18,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": false,
    "lastUpdateTime": 1762004233601,
    "respondTime": 2757,
    "ruleBookInfo": {
      "author": "[property=\"og:novel:author\"]@content",
      "coverUrl": "[property=\"og:image\"]@content",
      "intro": "[property=\"og:novel:update_time\"]@content&&\n[property=\"og:description\"]@content@js:'更新时间：'+result",
      "kind": "[property~=category|status|tags]@content",
      "lastChapter": "[property~=las?test_chapter_name]@content",
      "name": "[property=\"og:novel:book_name\"]@content"
    },
    "ruleContent": {
      "content": "#content@html",
      "nextContentUrl": "text.下一@a[href*=\"_\"]@href",
      "replaceRegex": "##（本章未完，请点击下一页继续阅读）|.* \\(第\\d/\\d页\\)"
    },
    "ruleSearch": {
      "author": ".s4@text",
      "bookList": ".txt-list@li:not(:first-child)",
      "bookUrl": "a.0@href",
      "coverUrl": "a.0@href\n@js:\nvar match = result.match(/(\\d+)(?=[^\\d]*$)/);\nvar id = match ? match[1] : '';\nvar iid = parseInt(id / 1000);\n'/files/article/image/' + iid + '/' + id + '/' + id + 's.jpg';",
      "kind": ".s1@text##[\\[\\]]",
      "lastChapter": ".s3@text",
      "name": "a.0@text"
    },
    "ruleToc": {
      "chapterList": ".section-box a",
      "chapterName": "text",
      "chapterUrl": "href",
      "nextTocUrl": "option@value"
    },
    "searchUrl": "/ar.php?keyWord={{key}}",
    "weight": 0
  },
  {
    "bookSourceName": "云轩阁小说网",
    "bookSourceType": 0,
    "bookSourceUrl": "http://www.yunxuange.cc/",
    "customOrder": 19,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": true,
    "exploreUrl": "[\n{\"title\":\"🔖分类🔖\",\"url\":\"\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":1}},{\"title\":\"玄幻\",\"url\":\"/list1/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"武侠\",\"url\":\"/list2/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"都市\",\"url\":\"/list3/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"历史\",\"url\":\"/list4/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"网游\",\"url\":\"/list5/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"科幻\",\"url\":\"/list6/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"言情\",\"url\":\"/list7/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"其他\",\"url\":\"/list8/{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"🔖排行🔖\",\"url\":\"\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":1}},{\"title\":\"🔖周榜🔖\",\"url\":\"/top/week_0_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":1}},{\"title\":\"玄幻\",\"url\":\"/top/week_1_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"武侠\",\"url\":\"/top/week_2_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"都市\",\"url\":\"/top/week_3_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"历史\",\"url\":\"/top/week_4_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"网游\",\"url\":\"/top/week_5_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"科幻\",\"url\":\"/top/week_6_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"言情\",\"url\":\"/top/week_7_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"其他\",\"url\":\"/top/week_8_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"🔖月榜🔖\",\"url\":\"/top/month_0_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":1}},{\"title\":\"玄幻\",\"url\":\"/top/month_1_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"武侠\",\"url\":\"/top/month_2_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"都市\",\"url\":\"/top/month_3_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"历史\",\"url\":\"/top/month_4_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"网游\",\"url\":\"/top/month_5_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"科幻\",\"url\":\"/top/month_6_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"言情\",\"url\":\"/top/month_7_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"其他\",\"url\":\"/top/minth_8_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"🔖总榜🔖\",\"url\":\"/top/all_0_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":1}},{\"title\":\"玄幻\",\"url\":\"/top/all_1_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"武侠\",\"url\":\"/top/all_2_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"都市\",\"url\":\"/top/all_3_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"历史\",\"url\":\"/top/all_4_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"网游\",\"url\":\"/top/all_5_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"科幻\",\"url\":\"/top/all_6_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"言情\",\"url\":\"/top/all_7_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"其他\",\"url\":\"/top/all_8_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"🔖完本🔖\",\"url\":\"/full/0_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":1}},{\"title\":\"玄幻\",\"url\":\"/full/1_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"武侠\",\"url\":\"/full/2_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"都市\",\"url\":\"/full/3_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"历史\",\"url\":\"/full/4_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"网游\",\"url\":\"/full/5_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"科幻\",\"url\":\"/full/6_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"言情\",\"url\":\"/full/7_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}},{\"title\":\"其他\",\"url\":\"/full/8_{{page}}.html\",\"style\":{\"layout_flexGrow\":1,\"layout_flexBasisPercent\":0.25}}\n]",
    "lastUpdateTime": 1764781065340,
    "respondTime": 20009,
    "ruleBookInfo": {
      "author": ".row@.options@li.0@text",
      "coverUrl": ".row@img@src",
      "intro": ".intro@text##简介：",
      "kind": ".title@a.1@text",
      "lastChapter": ".book_info@.options@li.4@a@text",
      "name": ".row@h1@text"
    },
    "ruleContent": {
      "content": ".font_max@text",
      "nextContentUrl": ".nav-bottom@.col-3.3@a@href",
      "replaceRegex": "##第\\([1-3]+/3\\)页",
      "title": ".single@h1@text"
    },
    "ruleExplore": {
      "author": ".book_other.0@span@text",
      "bookList": ".box@.col-12",
      "bookUrl": "dd@h3@a@href",
      "coverUrl": "dt@a@img@src",
      "lastChapter": ".book_other.3@a@text",
      "name": "dd@h3@text"
    },
    "ruleSearch": {
      "author": "dd@.book_other.0@span@text",
      "bookList": "section@.container@.row@.col-12",
      "bookUrl": "h3@a@href",
      "coverUrl": "dt@img@src",
      "lastChapter": "dd@.book_other.3@a@text",
      "name": "h3@text"
    },
    "ruleToc": {
      "chapterList": ".book_list2@li",
      "chapterName": "li@text",
      "chapterUrl": "li@a@href",
      "nextTocUrl": ".page-link.0@text##.*\\/(\\d+)$##$1\n@js:\nres = JSON.parse(result)\nlist = [];\nfor (var i = 2; i <= res; i++) {\n\tlist.push(baseUrl.replace(/$/,\"index_\" + i + \".html\")); \n}\nlist;"
    },
    "searchUrl": "/search.php?q={{key}}",
    "weight": 0
  },
  {
    "bookSourceComment": "// Error: 下载链接为空\n\n这是小说下载源",
    "bookSourceName": "奇书网",（有问题，直接无结果）
    "bookSourceType": 3,
    "bookSourceUrl": "https://m.qishu99.cc/",
    "customOrder": 20,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "exploreUrl": "[\n  {\n  \t  \"title\":\"🔖书库🔖\",\n    \"url\":\"/all/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":1\n    }\n  },\n  {\n  \t  \"title\":\"男生小说\",\n    \"url\":\"/nansheng/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"女生言情\",\n    \"url\":\"/yanqing/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"耽美同人\",\n    \"url\":\"/tongren/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"都市小说\",\n    \"url\":\"/dushi/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"玄幻奇幻\",\n    \"url\":\"/xuanhuan/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"武侠修真\",\n    \"url\":\"/xiuzhen/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"网游竞技\",\n    \"url\":\"/wangyou/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"历史军事\",\n    \"url\":\"/lishi/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"科幻灵异\",\n    \"url\":\"/kehuan/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"其他小说\",\n    \"url\":\"/qita/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":0.25\n    }\n  },\n  {\n  \t  \"title\":\"🔖排行🔖\",\n    \"url\":\"/hot/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":1\n    }\n  },\n  {\n  \t  \"title\":\"🔖推荐🔖\",\n    \"url\":\"/recommendall/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":1\n    }\n  },\n  {\n  \t  \"title\":\"🔖最新🔖\",\n    \"url\":\"/new/index_{{page}}.html\",\n    \"style\":\n    {\n    \t  \"layout_flexGrow\":1,\n       \"layout_flexBasisPersent\":1\n    }\n  }\n]",
    "lastUpdateTime": 1764908000121,
    "respondTime": 182528,
    "ruleBookInfo": {
      "author": ".bookcover@.mt10@text##作者：",
      "coverUrl": ".bookcover@img@src",
      "downloadUrls": ".bookbutton@a@href",
      "intro": ".bookintro@.con@text",
      "kind": ".bookcover@.gray.0@text##分类：",
      "lastChapter": ".bookcover@.gray.3@text##更新：",
      "name": ".bookcover@.title@text"
    },
    "ruleExplore": {
      "author": ".author@text",
      "bookList": ".imgtextlist@li",
      "bookUrl": "a@href",
      "coverUrl": "img@src",
      "intro": ".intro@text",
      "name": ".title@text"
    },
    "ruleSearch": {
      "author": ".author.0@a@text",
      "bookList": ".imgtextlist@li",
      "bookUrl": "a@href",
      "coverUrl": "Img@src",
      "intro": ".intro@text",
      "lastChapter": ".author.1@text##更新：",
      "name": ".title@text"
    },
    "searchUrl": "/e/search/index.php,{\n\t\"method\":\"post\",\n\t\"body\":\"show=title,softsay,softwriter&keyboard={{key}}&tbname=download&tempid=1&Submit22=搜索\"\n\t}",
    "weight": 0
  },
  {
    "bookSourceName": "83中文S",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "https://www.83zws.com",
    "bookUrlPattern": "https?://www.83zws.com/book/\\d+/\\d+/",
    "customOrder": 23,
    "enabled": true,
    "enabledCookieJar": true,
    "enabledExplore": false,
    "exploreUrl": "玄幻::/sort/1_{{page}}/\n武侠::/sort/2_{{page}}/\n都市::/sort/3_{{page}}/\n历史::/sort/4_{{page}}/\n科幻::/sort/5_{{page}}/\n游戏::/sort/6_{{page}}/\n女生::/sort/9_{{page}}/\n其他::/sort/10_{{page}}/",
    "header": "{\"User-Agent\": \"Mozilla/5.0 (Linux; Android 9) Mobile Safari/537.36\"}",
    "lastUpdateTime": 1762256244201,
    "respondTime": 2080,
    "ruleBookInfo": {
      "author": "id.info@tag.p.0@tag.a.0@text",
      "coverUrl": "id.fmimg@tag.img@data-original",
      "intro": "id.intro@textNodes",
      "kind": "class.con_top@tag.a.1@text",
      "lastChapter": "id.info@tag.p.2@tag.a.0@text",
      "name": "id.info@tag.h1@text"
    },
    "ruleContent": {
      "content": "id.booktxt@tag.p@textNodes##本章未完，点击下一页继续阅读。|83中文网最新网址www.*com",
      "nextContentUrl": "text.下一页@href"
    },
    "ruleExplore": {
      "author": "class.s5.0@text",
      "bookList": "class.r.0@tag.li",
      "bookUrl": "class.s2.0@tag.a.0@href",
      "kind": "class.s1.0@text",
      "name": "class.s2.0@text"
    },
    "ruleSearch": {
      "author": "class.btm@tag.a.0@text",
      "bookList": "class.item",
      "bookUrl": "tag.dl@tag.dt.0@tag.a.0@href",
      "coverUrl": "class.image@tag.a.0@tag.img@data-original",
      "intro": "tag.dl@tag.dd.0@textNodes",
      "name": "tag.dl@tag.dt.0@tag.a.0@text",
      "wordCount": "class.btm@tag.em.0@text"
    },
    "ruleToc": {
      "chapterList": "id.list@tag.dl@tag.a!0:1:2:3:4:5:6:7",
      "chapterName": "tag.dd@text",
      "chapterUrl": "href"
    },
    "searchUrl": "https://www.83zws.com/soso/",
    "weight": 0
  },
  {
    "bookSourceName": "30读书",（有问题）
    "bookSourceType": 0,
    "bookSourceUrl": "https://www.30dushu.com/",
    "customOrder": 24,
    "enabled": true,
    "enabledCookieJar": false,
    "enabledExplore": true,
    "exploreUrl": "全部::https://www.30dushu.com/cate/0-{{page}}.html&&玄幻魔法::https://www.30dushu.com/cate/1-{{page}}.html&&武侠修真::https://www.30dushu.com/cate/2-{{page}}.html&&都市言情::https://www.30dushu.com/cate/3-{{page}}.html&&历史军事::https://www.30dushu.com/cate/4-{{page}}.html&&游戏竞技::https://www.30dushu.com/cate/5-{{page}}.html&&科幻灵异::https://www.30dushu.com/cate/6-{{page}}.html&&纯爱同人::https://www.30dushu.com/cate/7-{{page}}.html&&女生言情::https://www.30dushu.com/cate/8-{{page}}.html&&二次元::https://www.30dushu.com/cate/9-{{page}}.html&&其他::https://www.30dushu.com/cate/10-{{page}}.html",
    "lastUpdateTime": 1764079579539,
    "respondTime": 9155,
    "ruleBookInfo": {
      "author": "text.👤@text",
      "coverUrl": "img@src",
      "intro": ".detail-book-intro.0@text",
      "kind": "text.📚@text",
      "lastChapter": ".detail-chapter-item.1@text",
      "name": "h1@text",
      "tocUrl": ".detail-book-actions>a.1@href",
      "wordCount": "text.📖@text"
    },
    "ruleContent": {
      "content": "p@text",
      "title": "h1@text"
    },
    "ruleExplore": {
      "author": "p@text",
      "bookList": ".book-card",
      "bookUrl": "a.0@href",
      "coverUrl": "img@src",
      "name": "h3@text"
    },
    "ruleSearch": {
      "author": "text.👤@text",
      "bookList": ".modern-search-item",
      "bookUrl": "a.0@href",
      "coverUrl": "img@src",
      "intro": ".modern-book-desc@text",
      "kind": "text.📚@text",
      "name": ".modern-book-title@text",
      "wordCount": "text.📖@text"
    },
    "ruleToc": {
      "chapterList": ".modern-chapter-item",
      "chapterName": "a@text",
      "chapterUrl": "a@href",
      "nextTocUrl": "text.下一页@href"
    },
    "searchUrl": "/search/?searchkey={{key}}",
    "weight": 0
  }
],
  loaded: true,
  version: '2.0.0'
};
