// 思源阅读器 - 书源配置扩展
// ==SiReaderBookSources==
// @name         SiReader 书源数据
// @version      2.0.0
// @description  思源笔记电子书阅读增强插件书源存储
// @updateTime   2024-12-01
// @count        20
// ==/SiReaderBookSources==

window.siyuanBookSources = {
  sources: [
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
          "author": "author",
          "bookList": ".bookList li\n<js>\nresult.toArray().map(o=>{\n    var detail = String(o.select('a:eq(0)').attr('href')).replace(/^\\//, 'http://www.tadu.com/');\n    java.log(detail)\n    return {\n       name: String(o.select('.bookNm').text()).replace(/\\（.*\\）/,''),\n       author:o.select('.authorNm').text(),\n       tags:  String(o.select('span:eq(2)').text()).replace(' • ',','),\n       num: String(o.select('span:eq(6)').text()).replace(/\\s+/g,''),\n\n       intro: String(o.select('.bookIntro').text()).trim(),     \n       cover:o.select('img').attr('data-src').includes('webPic')?'http://suo.im/6mlA9F':o.select('img').attr('data-src'),\n       catalogUrl:o.select('.look_readBtn').attr('href')\n    }\n});\n</js>",
          "bookUrl": "catalogUrl",
          "coverUrl": "cover",
          "intro": "intro",
          "kind": "tags",
          "name": "name",
          "wordCount": "num"
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
        "bookSourceName": "行轻小说",
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
        "bookSourceName": "🌐 轻小说网",
        "bookSourceType": 0,
        "bookSourceUrl": "http://www.sfacg.com",
        "customOrder": 1229,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "lastUpdateTime": 1743586134455,
        "loginUrl": "https://passport.sfacg.com/Login.aspx",
        "respondTime": 514,
        "ruleBookInfo": {
          "tocUrl": "text.点击阅读@href"
        },
        "ruleContent": {
          "content": "class.article-content font16@html"
        },
        "ruleExplore": {},
        "ruleSearch": {
          "author": "tag.br@text##.综合信息：|\\/.*",
          "bookList": "tag.ul",
          "bookUrl": "tag.a@href",
          "coverUrl": "tag.img@src",
          "name": "tag.a.0@text"
        },
        "ruleToc": {
          "chapterList": "class.catalog-list@tag.li",
          "chapterName": "tag.a@text",
          "chapterUrl": "tag.a@href"
        },
        "searchUrl": "http://s.sfacg.com/?Key={{key}}&S=1&SS=0",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "文徒小说",
        "bookSourceType": 0,
        "bookSourceUrl": "http://www.bookfedex.com#",
        "bookUrlPattern": "",
        "concurrentRate": "",
        "customOrder": 632,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "exploreUrl": "",
        "header": "",
        "lastUpdateTime": 1721278398755,
        "loginCheckJs": "",
        "loginUi": "",
        "loginUrl": "",
        "respondTime": 522,
        "ruleBookInfo": {
          "author": "class.title@class.author@text",
          "coverUrl": ".fl.detailgame@.pic.fl@tag.img.0@src",
          "intro": "class.brief_text@text",
          "kind": "class.tags@tag.a.1:0@text&&div.brief.fl@div.4@span@text",
          "lastChapter": ".fl.detailgame@.brief.fl@a.6@text",
          "name": "class.title@class.name@text",
          "wordCount": ".fl.detailgame@.brief.fl@.hits@span.0@text##\\s"
        },
        "ruleContent": {
          "content": "class.read-content@tag.p.!-1@html"
        },
        "ruleExplore": {},
        "ruleSearch": {
          "author": "class.bookinfo@tag.a.0@text",
          "bookList": "class.search-result-list",
          "bookUrl": "class.bkinfo@href",
          "coverUrl": "class.imgbox@tag.img@src",
          "intro": ".fl.se-result-infos@p.0@text",
          "kind": "class.bookinfo@tag.a.1@text&&span.gx_wj@text",
          "name": "class.tit@text"
        },
        "ruleToc": {
          "chapterList": "class.cate-list@tag.a",
          "chapterName": "class.chapter_name@text",
          "chapterUrl": "href"
        },
        "searchUrl": "sou.html?keywords={{key}}",
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
        "bookSourceComment": "                    \"error:Timed out waiting for 180000 ms\n                                        \"error:failed to connect to book.sfacg.com/121.4.133.202 (port 80) from /192.168.0.100 (port 47218) after 15000ms\n                    \"error:Timed out waiting for 180000 ms\n\"\"\"",
        "bookSourceGroup": "",
        "bookSourceName": "日轻小说2",
        "bookSourceType": 0,
        "bookSourceUrl": "book.sfacg.com",
        "bookUrlPattern": "",
        "customOrder": 613,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "lastUpdateTime": 1700201558820,
        "loginUrl": "http://passport.sfacg.com/Login.aspx",
        "respondTime": 542,
        "ruleBookInfo": {
          "kind": "class.tag-list@class.text@text",
          "tocUrl": "text.点击阅读@href"
        },
        "ruleContent": {
          "content": "class.article-content font16@text"
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
        "bookSourceName": "文徒小说",
        "bookSourceType": 0,
        "bookSourceUrl": "http://www.bookfedex.com/",
        "bookUrlPattern": "",
        "concurrentRate": "",
        "customOrder": 225,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "exploreUrl": "",
        "header": "",
        "lastUpdateTime": 1721278498314,
        "loginCheckJs": "",
        "loginUi": "",
        "loginUrl": "",
        "respondTime": 546,
        "ruleBookInfo": {
          "author": "class.title@class.author@text",
          "coverUrl": ".fl.detailgame@.pic.fl@tag.img.0@src",
          "intro": "class.brief_text@text",
          "kind": "class.tags@tag.a.1:0@text&&div.brief.fl@div.4@span@text",
          "lastChapter": ".fl.detailgame@.brief.fl@a.6@text",
          "name": "class.title@class.name@text",
          "wordCount": ".fl.detailgame@.brief.fl@.hits@span.0@text##\\s"
        },
        "ruleContent": {
          "content": "class.read-content@tag.p.!-1@html"
        },
        "ruleExplore": {},
        "ruleSearch": {
          "author": "class.bookinfo@tag.a.0@text",
          "bookList": "class.search-result-list",
          "bookUrl": "class.bkinfo@href",
          "coverUrl": "class.imgbox@tag.img@src",
          "intro": ".fl.se-result-infos@p.0@text",
          "kind": "class.bookinfo@tag.a.1@text&&span.gx_wj@text",
          "name": "class.tit@text"
        },
        "ruleToc": {
          "chapterList": "class.cate-list@tag.a",
          "chapterName": "class.chapter_name@text",
          "chapterUrl": "href"
        },
        "searchUrl": "sou.html?keywords={{key}}",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "文徒小说🎃",
        "bookSourceType": 0,
        "bookSourceUrl": "http://www.bookfedex.com#🎃",
        "bookUrlPattern": "",
        "concurrentRate": "",
        "customOrder": 340,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "exploreUrl": "",
        "header": "",
        "lastUpdateTime": 1692440682473,
        "loginCheckJs": "",
        "loginUi": "",
        "loginUrl": "",
        "respondTime": 551,
        "ruleBookInfo": {
          "author": "class.title@class.author@text",
          "coverUrl": ".fl.detailgame@.pic.fl@tag.img.0@src",
          "intro": "class.brief_text@text",
          "kind": "class.tags@tag.a.1:0@text&&div.brief.fl@div.4@span@text",
          "lastChapter": ".fl.detailgame@.brief.fl@a.6@text",
          "name": "class.title@class.name@text",
          "wordCount": ".fl.detailgame@.brief.fl@.hits@span.0@text##\\s"
        },
        "ruleContent": {
          "content": "class.read-content@tag.p.!-1@html"
        },
        "ruleExplore": {},
        "ruleSearch": {
          "author": "class.bookinfo@tag.a.0@text",
          "bookList": "class.search-result-list",
          "bookUrl": "class.bkinfo@href",
          "coverUrl": "class.imgbox@tag.img@src",
          "intro": ".fl.se-result-infos@p.0@text",
          "kind": "class.bookinfo@tag.a.1@text&&span.gx_wj@text",
          "name": "class.tit@text"
        },
        "ruleToc": {
          "chapterList": "class.cate-list@tag.a",
          "chapterName": "class.chapter_name@text",
          "chapterUrl": "href"
        },
        "searchUrl": "sou.html?keywords={{key}}",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "文徒小说",
        "bookSourceType": 0,
        "bookSourceUrl": "http://www.bookfedex.com",
        "bookUrlPattern": "",
        "concurrentRate": "",
        "customOrder": 230,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "exploreUrl": "",
        "header": "",
        "lastUpdateTime": 1721278398755,
        "loginCheckJs": "",
        "loginUi": "",
        "loginUrl": "",
        "respondTime": 554,
        "ruleBookInfo": {
          "author": "class.title@class.author@text",
          "coverUrl": ".fl.detailgame@.pic.fl@tag.img.0@src",
          "intro": "class.brief_text@text",
          "kind": "class.tags@tag.a.1:0@text&&div.brief.fl@div.4@span@text",
          "lastChapter": ".fl.detailgame@.brief.fl@a.6@text",
          "name": "class.title@class.name@text",
          "wordCount": ".fl.detailgame@.brief.fl@.hits@span.0@text##\\s"
        },
        "ruleContent": {
          "content": "class.read-content@tag.p.!-1@html"
        },
        "ruleExplore": {},
        "ruleSearch": {
          "author": "class.bookinfo@tag.a.0@text",
          "bookList": "class.search-result-list",
          "bookUrl": "class.bkinfo@href",
          "coverUrl": "class.imgbox@tag.img@src",
          "intro": ".fl.se-result-infos@p.0@text",
          "kind": "class.bookinfo@tag.a.1@text&&span.gx_wj@text",
          "name": "class.tit@text"
        },
        "ruleToc": {
          "chapterList": "class.cate-list@tag.a",
          "chapterName": "class.chapter_name@text",
          "chapterUrl": "href"
        },
        "searchUrl": "sou.html?keywords={{key}}",
        "weight": 0
      },
      {
        "bookSourceComment": "/*\n\t12.04 by:遇知  制作\n*/",
        "bookSourceGroup": "",
        "bookSourceName": "闲看小说",
        "bookSourceType": 0,
        "bookSourceUrl": "http://nav.jijia-co.com##",
        "customOrder": 1064,
        "enabled": true,
        "enabledCookieJar": true,
        "enabledExplore": true,
        "exploreUrl": "@js:\nsort=[];\nburl=source.getKey().match(/([^#]*)/)[1];\npush=(title,url,type1,type2)=>sort.push({\n\t\ttitle: title,\n\t\turl: url,\n\t\tstyle: {\n\t\t\t\tlayout_flexGrow: type1,\n\t\t\t\tlayout_flexBasisPercent: type2\n\t\t\t}\n\t});\n\tpush(\"精选\", `/api/novel/book/v2/plate/book.do?like=0&plateId=302&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`, 1, 0.25);\n\t\n\tfunction bd(i) {\t\t\n\t\t\turl= burl+`/api/novel/book/v2/top.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\n\t[[\"男频\",bd(1)],[\"女频\",bd(2)]].map([title,category]=>{\n\tpush(title+\"❤榜单\", null, 1, 1);\n category.map(($)=>{\t   \t\n\t    title=$.topName;\n     \tid=$.topId;\n\t      \turl= `/api/novel/book/v2/top/book.do?topId=${id}&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\tpush(title, url, 1, 0.25);\n        });\n  });\n  \n\t\n\tfunction fl(i) {\t\t\t\t\t\n\t\t\turl= burl+`/api/novel/book/v2/class.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\t\n\t\n\t[[\"男频\",fl(1)],[\"女频\",fl(2)]].map([title,category]=>{\n\tpush(title+\"❤分类\", null, 1, 1);\n\t\n category.map(($)=>{\t   \t\n\t    title=$.className;\n     \tparentClassId=$.classId;\n     \tfl_url=burl+ `/api/novel/book/v2/childClass.do?classId=${parentClassId}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     \tD=JSON.parse(java.ajax(fl_url)).data;\n     \tpush(\"🍁\"+title+\"🍁\", null, 1, 1);\n   D.map(($,index)=>{\t   \t\n\t    title=$.className;\n     \tclassId=$.classId;\n\t      \turl= `/api/novel/book/v2/class/book.do?parentClassId=${parentClassId}&classId=${classId}&status=all&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\t      \tif(D.length > 3&&D.length!=4){\n\t\tif(index+1 <= D.length - D.length%3)\n\t\t\t {\tpush(title, url, 1, 0.25);}\n\t\t\t\telse{ push(title, url, 0, 0.29);}\n\t\t\t\t}\n\t\t\t\telse if(D.length == 4){ push(title, url, 1, 0.4);}\n\t\t\t\telse{ push(title, url, 1, 0.25);}\n        });  \n     });\n  });\n\t\n\t\nJSON.stringify(sort);",
        "header": "@js:\nJSON.stringify({\t\t\n\t\"Keep-Alive\":\"300\",\n\t\"Connection\":\"Keep-Alive\",\n\t\"Cache-Control\":\"no-cache\",\n\t\"Host\":\"nav.jijia-co.com\",\n  \"User-Agent\":\"okhttp/4.9.3\"\n})",
        "lastUpdateTime": 1721269399139,
        "loginUrl": "",
        "respondTime": 584,
        "ruleBookInfo": {
          "author": "$.author",
          "canReName": "",
          "coverUrl": "$.cover",
          "init": "$.data",
          "intro": "$.bookDesc##(^|[。！？]+[”」）】]?)##$1<br>",
          "kind": "",
          "name": "$.bookName",
          "tocUrl": "http://nav.jijia-co.com/api/novel/book/chapterlist.do?bookId={{java.put('bookId',java.getString('$.bookId'));}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "wordCount": "$.words"
        },
        "ruleContent": {
          "content": "<js>\ndata = java.getString('$.data.content');\ncontent = eval(`\"${data}\"`);\n</js>"
        },
        "ruleExplore": {
          "bookList": ""
        },
        "ruleSearch": {
          "author": "$.author",
          "bookList": "$.data||$.data.books[*]",
          "bookUrl": "http://nav.jijia-co.com/api/novel/book/detail.do?bookId={{$.bookId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "checkKeyWord": "",
          "coverUrl": "$.cover",
          "intro": "$.bookDesc",
          "kind": "{{$.className}}\n{{r=java.getString('$.status');\nif(r!=\"\") r=='1'?'完结':'连载';}}",
          "name": "$.bookName",
          "wordCount": "$.words"
        },
        "ruleToc": {
          "chapterList": "$.data",
          "chapterName": "$.chapterName",
          "chapterUrl": "http://nav.jijia-co.com/api/novel/book/chapter.do?bookId={{java.get('bookId');}}&chapterId={{$.chapterId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "isVolume": ""
        },
        "searchUrl": "http://nav.jijia-co.com/api/novel/book/search/result.do?like=0&page={{page-1}}&size=10&keywords={{key}}&type=&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
        "variableComment": "",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "绾书文学网🎃",
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
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "SF轻小说🎃",
        "bookSourceType": 0,
        "bookSourceUrl": "http://s.sfacg.com#🎃",
        "bookUrlPattern": "",
        "customOrder": 1670,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "lastUpdateTime": 0,
        "loginUrl": "http://passport.sfacg.com/Login.aspx",
        "respondTime": 606,
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
        "bookSourceName": "闲看小说",
        "bookSourceType": 0,
        "bookSourceUrl": "http://nav.jijia-co.com#",
        "customOrder": 2554,
        "enabled": true,
        "enabledCookieJar": true,
        "enabledExplore": true,
        "exploreUrl": "@js:\nsort=[];\nburl=source.getKey().match(/([^#]*)/)[1];\npush=(title,url,type1,type2)=>sort.push({\n\t\ttitle: title,\n\t\turl: url,\n\t\tstyle: {\n\t\t\t\tlayout_flexGrow: type1,\n\t\t\t\tlayout_flexBasisPercent: type2\n\t\t\t}\n\t});\n\tpush(\"精选\", `/api/novel/book/v2/plate/book.do?like=0&plateId=302&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`, 1, 0.25);\n\t\n\tfunction bd(i) {\t\t\n\t\t\turl= burl+`/api/novel/book/v2/top.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\n\t[[\"男频\",bd(1)],[\"女频\",bd(2)]].map([title,category]=>{\n\tpush(title+\"❤榜单\", null, 1, 1);\n category.map(($)=>{\t   \t\n\t    title=$.topName;\n     \tid=$.topId;\n\t      \turl= `/api/novel/book/v2/top/book.do?topId=${id}&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\tpush(title, url, 1, 0.25);\n        });\n  });\n  \n\t\n\tfunction fl(i) {\t\t\t\t\t\n\t\t\turl= burl+`/api/novel/book/v2/class.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\t\n\t\n\t[[\"男频\",fl(1)],[\"女频\",fl(2)]].map([title,category]=>{\n\tpush(title+\"❤分类\", null, 1, 1);\n\t\n category.map(($)=>{\t   \t\n\t    title=$.className;\n     \tparentClassId=$.classId;\n     \tfl_url=burl+ `/api/novel/book/v2/childClass.do?classId=${parentClassId}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     \tD=JSON.parse(java.ajax(fl_url)).data;\n     \tpush(\"🍁\"+title+\"🍁\", null, 1, 1);\n   D.map(($,index)=>{\t   \t\n\t    title=$.className;\n     \tclassId=$.classId;\n\t      \turl= `/api/novel/book/v2/class/book.do?parentClassId=${parentClassId}&classId=${classId}&status=all&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\t      \tif(D.length > 3&&D.length!=4){\n\t\tif(index+1 <= D.length - D.length%3)\n\t\t\t {\tpush(title, url, 1, 0.25);}\n\t\t\t\telse{ push(title, url, 0, 0.29);}\n\t\t\t\t}\n\t\t\t\telse if(D.length == 4){ push(title, url, 1, 0.4);}\n\t\t\t\telse{ push(title, url, 1, 0.25);}\n        });  \n     });\n  });\n\t\n\t\nJSON.stringify(sort);",
        "header": "@js:\nJSON.stringify({\t\t\n\t\"Keep-Alive\":\"300\",\n\t\"Connection\":\"Keep-Alive\",\n\t\"Cache-Control\":\"no-cache\",\n\t\"Host\":\"nav.jijia-co.com\",\n  \"User-Agent\":\"okhttp/4.9.3\"\n})",
        "lastUpdateTime": 1721271399863,
        "loginUrl": "",
        "respondTime": 608,
        "ruleBookInfo": {
          "author": "$.author",
          "canReName": "",
          "coverUrl": "$.cover",
          "init": "$.data",
          "intro": "$.bookDesc##(^|[。！？]+[”」）】]?)##$1<br>",
          "kind": "",
          "name": "$.bookName",
          "tocUrl": "http://nav.jijia-co.com/api/novel/book/chapterlist.do?bookId={{java.put('bookId',java.getString('$.bookId'));}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "wordCount": "$.words"
        },
        "ruleContent": {
          "content": "<js>\ndata = java.getString('$.data.content');\ncontent = eval(`\"${data}\"`);\n</js>"
        },
        "ruleExplore": {
          "bookList": ""
        },
        "ruleSearch": {
          "author": "$.author",
          "bookList": "$.data||$.data.books[*]",
          "bookUrl": "http://nav.jijia-co.com/api/novel/book/detail.do?bookId={{$.bookId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "checkKeyWord": "",
          "coverUrl": "$.cover",
          "intro": "$.bookDesc",
          "kind": "{{$.className}}\n{{r=java.getString('$.status');\nif(r!=\"\") r=='1'?'完结':'连载';}}",
          "name": "$.bookName",
          "wordCount": "$.words"
        },
        "ruleToc": {
          "chapterList": "$.data",
          "chapterName": "$.chapterName",
          "chapterUrl": "http://nav.jijia-co.com/api/novel/book/chapter.do?bookId={{java.get('bookId');}}&chapterId={{$.chapterId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "isVolume": ""
        },
        "searchUrl": "http://nav.jijia-co.com/api/novel/book/search/result.do?like=0&page={{page-1}}&size=10&keywords={{key}}&type=&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
        "variableComment": "",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "饭角",
        "bookSourceType": 1,
        "bookSourceUrl": "https://api.fanjiao.co/",
        "bookUrlPattern": "",
        "customOrder": 468,
        "enabled": true,
        "enabledCookieJar": true,
        "enabledExplore": true,
        "lastUpdateTime": 1732637611284,
        "respondTime": 611,
        "ruleBookInfo": {
          "author": "",
          "name": "book.name"
        },
        "ruleContent": {},
        "ruleExplore": {},
        "ruleSearch": {
          "author": "",
          "bookList": "$.data.list[*]",
          "bookUrl": "<js>\nbody = \"album_id={{$.album_id}}\";\nurl = \"https://api.fanjiao.co/walkman/api/album/audio?\"+body;\nsign = java.md5Encode(body+\"879f30c4b1641142c6192acc23cfb733\")\nheaders = \n\t{\"headers\":{\"signature\":String(sign)}}\nurl+\",\"+JSON.stringify(headers)\n</js>",
          "checkKeyWord": "",
          "coverUrl": "$.cover",
          "intro": "$.description",
          "lastChapter": "",
          "name": "$.name"
        },
        "ruleToc": {
          "chapterList": "$..audios_list[*]",
          "chapterName": "$.name",
          "chapterUrl": "$.src"
        },
        "searchUrl": "<js>\nbody = \"keyword=\"+key+\"&page=\"+page+\"&size=20&type=2\";\nurl = \"https://api.fanjiao.co/walkman/api/search/keyword?\"+body;\nsign = java.md5Encode(body+\"879f30c4b1641142c6192acc23cfb733\")\nheaders = \n\t{\"headers\":{\"signature\":String(sign)}}\nurl+\",\"+JSON.stringify(headers)\n</js>",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "闲看小说",
        "bookSourceType": 0,
        "bookSourceUrl": "http://nav.jijia-co.com",
        "customOrder": 2471,
        "enabled": true,
        "enabledCookieJar": true,
        "enabledExplore": true,
        "exploreUrl": "@js:\nsort=[];\nburl=source.getKey().match(/([^#]*)/)[1];\npush=(title,url,type1,type2)=>sort.push({\n\t\ttitle: title,\n\t\turl: url,\n\t\tstyle: {\n\t\t\t\tlayout_flexGrow: type1,\n\t\t\t\tlayout_flexBasisPercent: type2\n\t\t\t}\n\t});\n\tpush(\"精选\", `/api/novel/book/v2/plate/book.do?like=0&plateId=302&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`, 1, 0.25);\n\t\n\tfunction bd(i) {\t\t\n\t\t\turl= burl+`/api/novel/book/v2/top.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\n\t[[\"男频\",bd(1)],[\"女频\",bd(2)]].map([title,category]=>{\n\tpush(title+\"❤榜单\", null, 1, 1);\n category.map(($)=>{\t   \t\n\t    title=$.topName;\n     \tid=$.topId;\n\t      \turl= `/api/novel/book/v2/top/book.do?topId=${id}&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\tpush(title, url, 1, 0.25);\n        });\n  });\n  \n\t\n\tfunction fl(i) {\t\t\t\t\t\n\t\t\turl= burl+`/api/novel/book/v2/class.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\t\n\t\n\t[[\"男频\",fl(1)],[\"女频\",fl(2)]].map([title,category]=>{\n\tpush(title+\"❤分类\", null, 1, 1);\n\t\n category.map(($)=>{\t   \t\n\t    title=$.className;\n     \tparentClassId=$.classId;\n     \tfl_url=burl+ `/api/novel/book/v2/childClass.do?classId=${parentClassId}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     \tD=JSON.parse(java.ajax(fl_url)).data;\n     \tpush(\"🍁\"+title+\"🍁\", null, 1, 1);\n   D.map(($,index)=>{\t   \t\n\t    title=$.className;\n     \tclassId=$.classId;\n\t      \turl= `/api/novel/book/v2/class/book.do?parentClassId=${parentClassId}&classId=${classId}&status=all&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\t      \tif(D.length > 3&&D.length!=4){\n\t\tif(index+1 <= D.length - D.length%3)\n\t\t\t {\tpush(title, url, 1, 0.25);}\n\t\t\t\telse{ push(title, url, 0, 0.29);}\n\t\t\t\t}\n\t\t\t\telse if(D.length == 4){ push(title, url, 1, 0.4);}\n\t\t\t\telse{ push(title, url, 1, 0.25);}\n        });  \n     });\n  });\n\t\n\t\nJSON.stringify(sort);",
        "header": "@js:\nJSON.stringify({\t\t\n\t\"Keep-Alive\":\"300\",\n\t\"Connection\":\"Keep-Alive\",\n\t\"Cache-Control\":\"no-cache\",\n\t\"Host\":\"nav.jijia-co.com\",\n  \"User-Agent\":\"okhttp/4.9.3\"\n})",
        "lastUpdateTime": 1732998427148,
        "loginUrl": "",
        "respondTime": 626,
        "ruleBookInfo": {
          "author": "$.author",
          "canReName": "",
          "coverUrl": "$.cover",
          "init": "$.data",
          "intro": "$.bookDesc##(^|[。！？]+[”」）】]?)##$1<br>",
          "kind": "",
          "name": "$.bookName",
          "tocUrl": "http://nav.jijia-co.com/api/novel/book/chapterlist.do?bookId={{java.put('bookId',java.getString('$.bookId'));}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "wordCount": "$.words"
        },
        "ruleContent": {
          "content": "<js>\ndata = java.getString('$.data.content');\ncontent = eval(`\"${data}\"`);\n</js>"
        },
        "ruleExplore": {
          "bookList": ""
        },
        "ruleSearch": {
          "author": "$.author",
          "bookList": "$.data||$.data.books[*]",
          "bookUrl": "http://nav.jijia-co.com/api/novel/book/detail.do?bookId={{$.bookId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "checkKeyWord": "",
          "coverUrl": "$.cover",
          "intro": "$.bookDesc",
          "kind": "{{$.className}}\n{{r=java.getString('$.status');\nif(r!=\"\") r=='1'?'完结':'连载';}}",
          "name": "$.bookName",
          "wordCount": "$.words"
        },
        "ruleToc": {
          "chapterList": "$.data",
          "chapterName": "$.chapterName",
          "chapterUrl": "http://nav.jijia-co.com/api/novel/book/chapter.do?bookId={{java.get('bookId');}}&chapterId={{$.chapterId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "isVolume": ""
        },
        "searchUrl": "http://nav.jijia-co.com/api/novel/book/search/result.do?like=0&page={{page-1}}&size=10&keywords={{key}}&type=&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
        "variableComment": "",
        "weight": 0
      },
      {
        "bookSourceComment": "正版小说网站，VIP章节要登录购买",
        "bookSourceGroup": "",
        "bookSourceName": "飞卢小说",
        "bookSourceType": 0,
        "bookSourceUrl": "https://wap.faloo.com#111",
        "customOrder": 1523,
        "enabled": true,
        "enabledCookieJar": true,
        "enabledExplore": true,
        "exploreUrl": "",
        "lastUpdateTime": 1730110895212,
        "loginUrl": "https://u.faloo.com/regist/login.aspx?backUrl=https://wap.faloo.com/",
        "respondTime": 628,
        "ruleBookInfo": {
          "author": ".color999@tag.a.0@text",
          "coverUrl": "class.cover_box@tag.img@src",
          "init": "",
          "intro": "id.novel_intro@tag.p@text",
          "kind": ".color999@tag.a.1@text&&class.tagList clearfix@tag.a.0@text&&class.tagList clearfix@tag.a.1@text&&class.tagList clearfix@tag.a.2@text",
          "lastChapter": ".newNode@text",
          "name": ".name@text",
          "tocUrl": "class.display_flex_between@tag.a.1@href",
          "wordCount": "class.textHide.3@textNodes##\\d+万人"
        },
        "ruleContent": {
          "content": ".nodeContent@p@html",
          "imageStyle": "FULL",
          "replaceRegex": "##本书来自.*|本书由飞卢.*|用飞卢.*"
        },
        "ruleExplore": {},
        "ruleSearch": {
          "author": "class.nl_r1_author@tag.a.0@text",
          "bookList": "class.novelList@li",
          "bookUrl": "class.bl_r1_tit@tag.a@href",
          "coverUrl": "class.nl_r1@tag.a@tag.img@src",
          "intro": "class.bl_r1_into@tag.a@text",
          "kind": "class.nl_r1_author@tag.a.1@text&&class.nl_tags fr@tag.a.0@text&&class.nl_tags fr@tag.a.1@text",
          "name": "class.bl_r1_tit@tag.a@text",
          "wordCount": "class.nl_r2 clearfix@tag.i@text"
        },
        "ruleToc": {
          "chapterList": ".v_nodeList li",
          "chapterName": "i@html&&a@text##[\\(（【].*?[求更谢乐发订合补].*?[】）\\)]\n<js>result.replace(/\\<i class\\=\\\"icon_close\\\"\\>\\<\\/i\\>/,'✿·')</js>",
          "chapterUrl": "a@href"
        },
        "searchUrl": "https://wap.faloo.com/search_1_{{page}}.html?k={{key}},{\n  \"charset\": \"GB2312\"\n}",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "闲看网络",
        "bookSourceType": 0,
        "bookSourceUrl": "http://nav.jijia-co.com#🎃",
        "customOrder": 2551,
        "enabled": true,
        "enabledCookieJar": true,
        "enabledExplore": true,
        "exploreUrl": "@js:\nsort=[];\nburl=source.getKey().match(/([^#]*)/)[1];\npush=(title,url,type1,type2)=>sort.push({\n\t\ttitle: title,\n\t\turl: url,\n\t\tstyle: {\n\t\t\t\tlayout_flexGrow: type1,\n\t\t\t\tlayout_flexBasisPercent: type2\n\t\t\t}\n\t});\n\tpush(\"精选\", `/api/novel/book/v2/plate/book.do?like=0&plateId=302&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`, 1, 0.25);\n\t\n\tfunction bd(i) {\t\t\n\t\t\turl= burl+`/api/novel/book/v2/top.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\n\t[[\"男频\",bd(1)],[\"女频\",bd(2)]].map([title,category]=>{\n\tpush(title+\"❤榜单\", null, 1, 1);\n category.map(($)=>{\t   \t\n\t    title=$.topName;\n     \tid=$.topId;\n\t      \turl= `/api/novel/book/v2/top/book.do?topId=${id}&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\tpush(title, url, 1, 0.25);\n        });\n  });\n  \n\t\n\tfunction fl(i) {\t\t\t\t\t\n\t\t\turl= burl+`/api/novel/book/v2/class.do?channelId=${i}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     result=java.ajax(url);\n     return  JSON.parse(result).data; \t\t\n\t\t}\n\t\t\n\t\n\t[[\"男频\",fl(1)],[\"女频\",fl(2)]].map([title,category]=>{\n\tpush(title+\"❤分类\", null, 1, 1);\n\t\n category.map(($)=>{\t   \t\n\t    title=$.className;\n     \tparentClassId=$.classId;\n     \tfl_url=burl+ `/api/novel/book/v2/childClass.do?classId=${parentClassId}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n     \tD=JSON.parse(java.ajax(fl_url)).data;\n     \tpush(\"🍁\"+title+\"🍁\", null, 1, 1);\n   D.map(($,index)=>{\t   \t\n\t    title=$.className;\n     \tclassId=$.classId;\n\t      \turl= `/api/novel/book/v2/class/book.do?parentClassId=${parentClassId}&classId=${classId}&status=all&page={{page-1}}&size=10&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel`;\n\t      \tif(D.length > 3&&D.length!=4){\n\t\tif(index+1 <= D.length - D.length%3)\n\t\t\t {\tpush(title, url, 1, 0.25);}\n\t\t\t\telse{ push(title, url, 0, 0.29);}\n\t\t\t\t}\n\t\t\t\telse if(D.length == 4){ push(title, url, 1, 0.4);}\n\t\t\t\telse{ push(title, url, 1, 0.25);}\n        });  \n     });\n  });\n\t\n\t\nJSON.stringify(sort);",
        "header": "@js:\nJSON.stringify({\t\t\n\t\"Keep-Alive\":\"300\",\n\t\"Connection\":\"Keep-Alive\",\n\t\"Cache-Control\":\"no-cache\",\n\t\"Host\":\"nav.jijia-co.com\",\n  \"User-Agent\":\"okhttp/4.9.3\"\n})",
        "lastUpdateTime": 1721270563985,
        "loginUrl": "",
        "respondTime": 634,
        "ruleBookInfo": {
          "author": "$.author",
          "canReName": "",
          "coverUrl": "$.cover",
          "init": "$.data",
          "intro": "$.bookDesc##(^|[。！？]+[”」）】]?)##$1<br>",
          "kind": "",
          "name": "$.bookName",
          "tocUrl": "http://nav.jijia-co.com/api/novel/book/chapterlist.do?bookId={{java.put('bookId',java.getString('$.bookId'));}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "wordCount": "$.words"
        },
        "ruleContent": {
          "content": "<js>\ndata = java.getString('$.data.content');\ncontent = eval(`\"${data}\"`);\n</js>"
        },
        "ruleExplore": {
          "bookList": ""
        },
        "ruleSearch": {
          "author": "$.author",
          "bookList": "$.data||$.data.books[*]",
          "bookUrl": "http://nav.jijia-co.com/api/novel/book/detail.do?bookId={{$.bookId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "checkKeyWord": "",
          "coverUrl": "$.cover",
          "intro": "$.bookDesc",
          "kind": "{{$.className}}\n{{r=java.getString('$.status');\nif(r!=\"\") r=='1'?'完结':'连载';}}",
          "name": "$.bookName",
          "wordCount": "$.words"
        },
        "ruleToc": {
          "chapterList": "$.data",
          "chapterName": "$.chapterName",
          "chapterUrl": "http://nav.jijia-co.com/api/novel/book/chapter.do?bookId={{java.get('bookId');}}&chapterId={{$.chapterId}}&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
          "isVolume": ""
        },
        "searchUrl": "http://nav.jijia-co.com/api/novel/book/search/result.do?like=0&page={{page-1}}&size=10&keywords={{key}}&type=&t={{Date.now()}}&pkg=com.smart.app.jiudianjiu.xin.leisureNovel",
        "variableComment": "",
        "weight": 0
      },
      {
        "bookSourceComment": "",
        "bookSourceGroup": "",
        "bookSourceName": "🎈 SF轻小说",
        "bookSourceType": 0,
        "bookSourceUrl": "book.sfacg.com已整理",
        "bookUrlPattern": "已校验",
        "customOrder": 1577,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "lastUpdateTime": 1602905885191,
        "loginUrl": "http://passport.sfacg.com/Login.aspx",
        "respondTime": 641,
        "ruleBookInfo": {
          "kind": "class.tag-list@class.text@text",
          "tocUrl": "text.点击阅读@href"
        },
        "ruleContent": {
          "content": "class.article-content font16@text"
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
        "bookSourceComment": "playdata.action_control.name+\"\"+findsenceurlbyid(playdata.action_control.sence_background_id,$)\n\"+playdata.action_control.character.name+\"】：\"\nplaydata.action_control.extra.name\nif(playdata.cmd_type==\"character\"&&playdata.action_type==\"state\"){\n \treturn findemojiurlbyid(playdata.action_control.character.character_id,playdata.action_control.character.emoji_type_id,$.data.preload_resource.character_data)\n \t}",
        "bookSourceGroup": "",
        "bookSourceName": "青梨",
        "bookSourceType": 0,
        "bookSourceUrl": "https://qingly.ink",
        "bookUrlPattern": "",
        "concurrentRate": "",
        "coverDecodeJs": "",
        "customOrder": 1620,
        "enabled": true,
        "enabledCookieJar": false,
        "enabledExplore": true,
        "exploreScreen": "",
        "exploreUrl": "",
        "header": "",
        "lastUpdateTime": 1708225115669,
        "loginCheckJs": "",
        "loginUi": "[{name: \"token\", type: \"text\"}]",
        "loginUrl": "@js:\nfunction login(){\n\ttoken=source.getLoginInfoMap()\n\t.get(\"token\");\n\tsource.putLoginHeader(token)\n\t}",
        "respondTime": 652,
        "ruleBookInfo": {
          "author": "",
          "canReName": "",
          "coverUrl": "",
          "init": "",
          "intro": "",
          "kind": "",
          "lastChapter": "",
          "name": "",
          "tocUrl": "https://api.qingly.ink/api/article/chapter/list?article_id={{$.data.article_detail.article_id}}",
          "wordCount": ""
        },
        "ruleContent": {
          "content": "<js>\nfunction findemojiurlbyid(characterid,emojiid,$){\n\tlet len=Object.keys($).length\n\tfor(let i=0;i<len;i++)\n\t\tif($[i].character_id==characterid){\n\t\t\t\treturn \"<img src=\\\"\"+$[i].base_url+\"\\\"/>\"\n\t\t\t\t}\n\t}\nfunction findsenceurlbyid(id,$){\n\tlet len=Object.keys($.data.preload_resource.sence_data).length\n\tlet $1=$.data.preload_resource.sence_data\n\tfor(let i=0;i<len;i++)\n\t\tif($1[i].sence_background_id==id)\n\treturn \"<img src=\\\"\"+$1[i].url+\"\\\"/>\"\n\t}\nfunction getcontent(playdata,$){\n\t\n\tif(playdata.cmd_type==\"sence\"){\n\t\treturn \"\"\n\t\t}\n\t\tif(playdata.cmd_type==\"content\"){\tif(playdata.action_control.content_type==\"narrator\"){\n\t\t\t\treturn playdata.action_control.content} if(playdata.action_control.content_type==\"character\"){\n\t\t\t\treturn playdata.action_control.content} if(playdata.action_control.content_type==\"extra\"){\n\t\t\t\treturn playdata.action_control.content}\n }else return \"\"\n}\n\tlet $=JSON.parse(result)\n\tvar str=\"\"\n\tlet i=0\n\tlet j=Object.keys($.data.play_data).length\n\tj=+j\nfor(;i<j;i++){\nstr+=getcontent($.data.play_data[i],$)+\"\\n\"\n}\nstr\n</js>",
          "imageStyle": "",
          "nextContentUrl": "",
          "replaceRegex": "",
          "sourceRegex": "",
          "webJs": ""
        },
        "ruleExplore": {
          "author": "",
          "bookList": "",
          "bookUrl": "",
          "coverUrl": "",
          "intro": "",
          "kind": "",
          "lastChapter": "",
          "name": ""
        },
        "ruleSearch": {
          "author": "$.article_detail.author.user_name",
          "bookList": "$.data",
          "bookUrl": "https://api.qingly.ink/api/article/detail?article_id={{$.article_detail.article_id}}",
          "coverUrl": "$.article_detail.cover.url",
          "intro": "$.article_detail.intro",
          "kind": ".tag_name",
          "lastChapter": "",
          "name": "$.article_detail.title",
          "wordCount": "$.article_detail.word_count"
        },
        "ruleToc": {
          "chapterList": "$.data",
          "chapterName": "$.name",
          "chapterUrl": "https://api.qingly.ink/api/article/chapter/getstreamplaydiff?article_id={{book.tocUrl.match(/\\d+/)[0]}}&chapter_id={{$.chapter_id}}",
          "formatJs": "title.replace(/^(\\d+)\\s/ ,\"第$1章 \")",
          "isVip": "",
          "isVolume": "",
          "nextTocUrl": "",
          "updateTime": ""
        },
        "searchUrl": "https://api.qingly.ink/api/search/article?grid_type=timeline&sub_types%5Bset_state%5D=0&sub_types%5Btag%5D=0&query={{key}}&limit=12&page={{page}}&sub_types%5Bword_count%5D=0",
        "variableComment": "",
        "weight": 0
      }
  ],
  loaded: true,
  version: '2.0.0'
};
