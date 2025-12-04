# Foliate-js 完整 API 文档

## 📚 核心组件

### foliate-view（自定义元素）

高级视图组件，统一管理书籍渲染。

#### 方法

```javascript
// 创建视图
const view = document.createElement('foliate-view')
document.body.append(view)

// 打开书籍（File/Blob/URL/Book对象）
await view.open(file)

// 导航
await view.goTo(index)           // 跳转到章节索引
await view.goTo(cfi)             // 跳转到CFI位置
await view.goTo({ index, anchor }) // 跳转到锚点
view.goLeft()                    // 上一页
view.goRight()                   // 下一页

// 销毁
view.destroy()
```

#### 属性

```javascript
view.renderer                    // 渲染器实例（Paginator）
view.location                    // 当前位置（只读）
view.book                        // 书籍对象（只读）
```

#### 事件

```javascript
// 位置变化
view.addEventListener('relocate', e => {
  console.log(e.detail)
  // {
  //   index: 0,              // 章节索引
  //   fraction: 0.5,         // 章节内进度 0-1
  //   range: Range,          // 当前可见区域
  //   cfi: 'epubcfi(...)'    // EPUB CFI
  // }
})

// 章节加载
view.addEventListener('load', e => {
  console.log(e.detail)
  // {
  //   doc: Document,         // 文档对象
  //   index: 0               // 章节索引
  // }
})

// 创建覆盖层（用于标注）
view.addEventListener('create-overlayer', e => {
  const { doc, index, attach } = e.detail
  attach(overlayerInstance)
})
```

---

## 📖 Renderer（渲染器）

### Paginator（翻页渲染器）

处理可重排内容的分页。

#### 配置属性（通过 setAttribute）

```javascript
const renderer = view.renderer

// 模式切换
renderer.setAttribute('flow', 'paginated')  // 翻页模式
renderer.setAttribute('flow', 'scrolled')   // 滚动模式

// 动画
renderer.setAttribute('animated', '')       // 启用翻页动画
renderer.removeAttribute('animated')        // 禁用动画

// 列数（双页布局）
renderer.setAttribute('max-column-count', '2')  // 双页
renderer.setAttribute('max-column-count', '1')  // 单页

// 间距
renderer.setAttribute('gap', '5%')          // 列间距（百分比）
renderer.setAttribute('margin', '40px')     // 页眉页脚高度（px）

// 尺寸
renderer.setAttribute('max-inline-size', '800px')  // 最大列宽（px）
renderer.setAttribute('max-block-size', '600px')   // 最大列高（px）
```

#### 只读属性

```javascript
renderer.location
// {
//   index: 0,       // 当前章节索引
//   fraction: 0.5   // 章节内进度 0-1
// }

renderer.heads       // 页眉元素数组（每列一个）
renderer.feet        // 页脚元素数组（每列一个）
```

#### 方法

```javascript
renderer.goTo({ index, anchor })  // 导航到位置
renderer.prev()                   // 上一页
renderer.next()                   // 下一页
```

---

## 📄 Book Interface

### 必需属性

```javascript
const book = {
  // 章节数组
  sections: [
    {
      load: async () => 'blob:http://...',  // 返回URL（必需）
      id: 'chapter-1',                      // 章节ID（可选）
      linear: 'yes',                        // 是否线性（可选）
      size: 1024,                           // 字节大小（可选）
      createDocument: async () => doc,      // 用于搜索（可选）
      cfi: '/6/4',                          // CFI基础（可选）
      unload: () => {}                      // 释放资源（可选）
    }
  ]
}
```

### 可选属性

```javascript
const book = {
  sections: [...],
  
  // 目录
  toc: [
    {
      label: '第一章',
      href: '#chapter-1',
      subitems: [...]  // 子目录
    }
  ],
  
  // 页面列表
  pageList: [...],  // 同TOC结构
  
  // 元数据
  metadata: {
    title: '书名',
    author: '作者',
    language: 'zh-CN'
  },
  
  // 渲染属性
  rendition: {
    layout: 'reflowable',  // 或 'pre-paginated'
    orientation: 'auto',
    spread: 'auto'
  },
  
  // 方向
  dir: 'ltr',  // 或 'rtl'
  
  // 方法
  resolveHref: (href) => ({ index, anchor }),
  resolveCFI: (cfi) => ({ index, anchor }),
  isExternal: (href) => boolean,
  splitTOCHref: async (href) => [id, fragment],
  getTOCFragment: (doc, id) => Node
}
```

---

## 🎨 CSS 定制

### Part 选择器

```css
/* 书籍内容滤镜 */
foliate-view::part(filter) {
  filter: invert(1) hue-rotate(180deg);  /* 夜间模式 */
}

/* 页眉样式 */
foliate-view::part(head) {
  padding-bottom: 4px;
  border-bottom: 1px solid graytext;
}

/* 页脚样式 */
foliate-view::part(foot) {
  text-align: center;
  color: gray;
}
```

---

## 🔧 辅助模块

### Overlayer（覆盖层）

用于标注、高亮等。

```javascript
import { Overlayer } from 'foliate-js/overlayer.js'

const overlayer = new Overlayer()
overlayer.element  // SVG元素
overlayer.redraw() // 重绘
overlayer.hitTest(event) // 命中测试
```

### Progress（进度）

计算阅读进度。

```javascript
import { Progress } from 'foliate-js/progress.js'

const progress = new Progress(book)
await progress.getProgress(location)
```

### Search（搜索）

全文搜索。

```javascript
import { search } from 'foliate-js/search.js'

const results = await search(sections, 'keyword', {
  matchCase: false,
  matchWholeWords: false,
  matchDiacritics: false
})
```

---

## 📦 在线书籍适配（TXT示例）

```javascript
// 1. 构建sections
const sections = chapters.map((ch, idx) => ({
  load: async () => {
    const content = await fetchChapterContent(ch.url)
    const html = toHTML(ch.title, content)
    const blob = new Blob([html], { type: 'text/html' })
    return URL.createObjectURL(blob)
  },
  id: `chapter-${idx}`,
  linear: 'yes'
}))

// 2. 构建book对象
const book = {
  sections,
  toc: chapters.map((ch, i) => ({ 
    label: ch.title, 
    href: `#chapter-${i}` 
  }))
}

// 3. 打开书籍
await view.open(book)

// 4. 配置样式
view.renderer.setAttribute('flow', 'paginated')
view.renderer.setAttribute('max-column-count', '2')
view.renderer.setAttribute('animated', '')
```

---

## ⚡ 最佳实践

### 惰性加载

```javascript
// ✅ 推荐：按需加载章节内容
const sections = chapters.map(ch => ({
  load: async () => {
    const content = await loadContent(ch.url)  // 只在需要时调用
    return createBlobURL(content)
  }
}))

// ❌ 避免：一次性加载所有内容
const allContent = await Promise.all(chapters.map(loadContent))
```

### 内存管理

```javascript
// 实现unload释放资源
const sections = chapters.map(ch => {
  let blobURL = null
  return {
    load: async () => {
      if (blobURL) return blobURL
      const content = await loadContent(ch.url)
      blobURL = URL.createObjectURL(new Blob([content]))
      return blobURL
    },
    unload: () => {
      if (blobURL) {
        URL.revokeObjectURL(blobURL)
        blobURL = null
      }
    }
  }
})
```

### 响应式配置

```javascript
// 监听窗口resize
window.addEventListener('resize', () => {
  // Paginator会自动处理，无需手动操作
})

// 监听设置变化
window.addEventListener('settingsChanged', (e) => {
  const { columnMode, animated } = e.detail
  view.renderer.setAttribute('max-column-count', columnMode === 'double' ? '2' : '1')
  animated ? renderer.setAttribute('animated', '') : renderer.removeAttribute('animated')
})
```

---

## 🎯 完整示例

```javascript
import 'foliate-js/view.js'

// 创建视图
const view = document.createElement('foliate-view')
view.style.cssText = 'width:100%;height:100%'
view.setAttribute('persist', 'false')  // 禁用持久化
container.appendChild(view)

// 构建书籍
const book = {
  sections: chapters.map((ch, idx) => ({
    load: async () => {
      const content = await fetch(ch.url).then(r => r.text())
      const html = `<!DOCTYPE html><html><body><h1>${ch.title}</h1><p>${content}</p></body></html>`
      return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    },
    id: `chapter-${idx}`,
    linear: 'yes'
  })),
  toc: chapters.map((ch, i) => ({ label: ch.title, href: `#chapter-${i}` }))
}

// 打开书籍
await view.open(book)

// 配置
const renderer = view.renderer
renderer.setAttribute('flow', 'paginated')
renderer.setAttribute('max-column-count', '2')
renderer.setAttribute('animated', '')
renderer.setAttribute('gap', '5%')
renderer.setAttribute('max-inline-size', '800px')

// 监听位置变化
view.addEventListener('relocate', e => {
  const { index, fraction } = e.detail
  console.log(`Chapter ${index}, Progress ${(fraction * 100).toFixed(1)}%`)
})

// 导航
await view.goTo(0)      // 跳转到第一章
view.goRight()          // 下一页
view.goLeft()           // 上一页
```

---

## 📌 注意事项

1. **必须使用setAttribute** - Paginator没有JS属性API
2. **animated只在paginated模式生效** - scrolled模式下无动画
3. **URL需要手动释放** - 使用`URL.revokeObjectURL()`避免内存泄漏
4. **fraction范围是0-1** - 表示章节内进度
5. **location是只读的** - 通过relocate事件获取最新位置

---

**极限精简，完全重用foliate-js，简洁高效，优雅完美！** 🚀✨
