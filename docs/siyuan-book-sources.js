// 思源阅读器 - 书源配置扩展
// ==SiReaderBookSources==
// @name         SiReader 书源数据
// @version      2.0.0
// @description  思源笔记电子书阅读增强插件书源存储
// @updateTime   2024-12-01
// @count        20
// ==/SiReaderBookSources==

window.siyuanBookSources = {
  sources:[
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
  }

],
  loaded: true,
  version: '2.0.0'
};
