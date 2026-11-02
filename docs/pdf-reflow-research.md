# PDF 重排原生接入与验证（2026-11-01）

## API 核查结论

项目固定 @embedpdf/snippet@2.15.1。本地 PdfEngine 类型和实现没有 reflow 或接收 HTML/段落的接口。文档管理 API 支持 openDocumentBuffer、closeDocument 和 setActiveDocument，输入是 PDF 字节。此前用 HTML 替换视口只保留了工具栏外观，无法获得同一文字层、滚动布局和标注坐标，已删除。

当前链路：原 PDF → MuPDF 提取/思源 OCR → Scribe.js 段落与页眉页脚分析 → MuPDF HTML 原生排版/DocumentWriter → 真实 PDF ArrayBuffer → 同一 EmbedPDF 实例的 document-manager。所有阅读和编辑功能继续走 EmbedPDF 原生插件。

生成直接复用切换前已提交的原书快照，保留原缓冲用于失败回退，仅传输副本给 Worker。主线程逐页生成，不再维护旧阅读覆盖层所需的页面缓存、并发去重或强制 OCR 接口；Worker 仅保留相邻两页的分析上下文。共享类型与纯坐标映射集中于 core/pdfReflow.ts，源页号统一来自 pageMap。主线程生成、OCR、文档切换与标注同步合并到 services/pdfReflow.ts，Worker 通信为其内部实现；PDF 生成、Scribe 适配和 Worker 执行继续独立。生产模块由 9 个收拢为 5 个。

## 上游代码

- MuPDF npm 1.28.1：StructuredText 提取；HTML Document.layout 排版分页；DocumentWriter 生成带字体和文字层的 PDF。
- Scribe.js：固定提交 43c00dc3ccd5612d094317432cdbf94094149ca0，直接收录 analyzeLayout.js、ocrObjects.js、miscUtils.js。仅增加 ts-nocheck 注释，算法未修改，SHA-256 记录于 UPSTREAM.json 并通过测试核对。
- 已删除自写版面阈值算法、PdfReflowReader、pdfReflowView、Teleport 覆盖层、DOM 选区及手工高亮桥接。项目只做数据适配、任务调度和文档交接。

## 数据与功能边界

- 完成全书生成后再载入原生阅读器，确保连续滚动、原生页码、搜索和标注面对同一完整文档。
- 生成文件按内容哈希保存于 /public/siyuan-sireader/reflow/，不覆盖原书，不新增另一套阅读器。
- 原书与重排稿的页码和坐标不同，分别保存标注，但重排标注会同步为原书映射副本。禁止直接将重排坐标存入原书记录；文字标注通过生成时保留的原文字形/OCR 词框映射，缺失或无法核验的坐标降级为原书页批注。修改、删除沿用同一副本 ID；旧标注首次进入时补映，缓存中的旧副本在载入原书时从存储刷新。原书其他标注不变，源记录和重排记录保留。回链对应各自文档，阅读进度按 pageMap 回映原书。
- 切换前等待原生提交和持久化队列，等待新文档原生标注初始化后导入对应记录；失败时重新打开上一 PDF。
- 首次扫描书籍需要完成所有页 OCR。生成时的宽高和字号决定固定 PDF 版式，之后的缩放、手绘、批注均由 EmbedPDF 处理。插图、表格、公式、表单、签名及原版式不保证保留。

## 验证

- MuPDF 生成多页中英文 PDF，核对源页映射、文本保留、HTML 转义及页眉过滤。
- 同版本 EmbedPDF/PDFium 实测打开生成 PDF、提取中文、获取选区字形、渲染页面、创建原生高亮、保存并重新打开读回批注。
- 真实 Edge 浏览器运行当前 EmbedPdfReader.vue（仅思源存储/宿主服务使用替身，EmbedPDF/UI/Worker 均为实际实现）：工具栏点击重排、滚轮到第 2 页、原生下一页到第 3 页、原生选区与高亮、回原书及再进入恢复高亮均通过；记录读取/写入键确认隔离。修复了同一 documentId 重载时旧视口需卸载、缩放 gate 需由 Zoom API 重新初始化的白屏问题。
- 实际 Worker 完成 OCR 纯文本输入到 PDF 输出的往返；原生文档 API 测试加载失败恢复、保持 documentId、等待标注初始化和订阅清理。
- 用户《奥本海默传》样本共 11 页；2026-10-30 对原图与内嵌文字层进行核对，图像清晰但旧 OCR 层大量错字/乱码。全部页面经实际打包 Worker 判定为扫描页，需思源重新 OCR。2026-11-01 本机 127.0.0.1:6806 仍不可连接，因此没有宣称该书 OCR 错字已修复，也没有完成真实思源界面的端到端验收。
- 打包后可运行 node scripts/check-pdf-reflow.mjs <本地PDF路径>；添加 --output <输出路径> 可验证原生文字 PDF 的完整 Worker 转换。扫描页输出会明确要求在思源中运行 OCR，不会输出乱码替代稿。
- 浏览器回归可运行 node scripts/check-pdf-reflow-browser.mjs（需本机 Playwright；BROWSER_EXECUTABLE 指定已安装浏览器，PLAYWRIGHT_MODULE 可指定模块入口）。测试服务只模拟思源宿主存储，实际挂载项目阅读器组件与固定版本 EmbedPDF。

## 来源

[EmbedPDF 文档管理 API](https://www.embedpdf.com/docs/vue/viewer/plugins/plugin-document-manager)、[MuPDF Document.layout](https://mupdf.readthedocs.io/en/latest/reference/javascript/types/Document.html)、[Scribe.js 固定源代码](https://github.com/scribeocr/scribe.js/tree/43c00dc3ccd5612d094317432cdbf94094149ca0)、[思源 OCR 实现](https://github.com/siyuan-note/siyuan/blob/master/kernel/model/ocr.go)。

MuPDF AGPL-3.0-or-later、Scribe AGPL-3.0-only 许可和源码来源随包保留。原创代码保留 MIT 授权，组合发行包含 AGPL 义务，见 [第三方说明](../THIRD_PARTY_NOTICES.md)。

## v2.5.10 标注回映验证

- 原生文字/OCR 框保存为生成字符的来源映射；规范化文本逐字一致才启用几何映射，不做模糊文本匹配。
- 重复文字、多页重排、下划线、颜色与批注保留、无坐标页批注、稳定副本 ID 及删除同步通过单元测试。
- 真实浏览器验证重排新增高亮后原书显示相同类型，修改批注后原书更新，删除后缓存不复活；重建阅读器后旧重排标注自动补映。宿主存储仍为测试替身，真实思源 OCR 识别质量未新增验收结论。
