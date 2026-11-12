/* eslint-disable node/prefer-global/process */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { copyFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import vue from "@vitejs/plugin-vue"
import fg from "fast-glob"
import minimist from "minimist"
import livereload from "rollup-plugin-livereload"
import {
  build as viteBuild,
  defineConfig,
  loadEnv,
  transformWithEsbuild,
} from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import zipPack from "vite-plugin-zip-pack"

const pluginInfo = require("./plugin.json")
const PRIVATE_SOURCES_ID = "@private-sources"

function buildKernelPlugin(outDir: string) {
  return {
    name: 'build-siyuan-kernel',
    async closeBundle() {
      const startedAt = Date.now()
      await viteBuild({ configFile: false, logLevel: 'warn', build: { outDir, emptyOutDir: false, sourcemap: false, minify: false, reportCompressedSize: false, lib: { entry: resolve(__dirname, 'src/kernel/index.js'), name: 'SiReaderKernel', formats: ['iife'], fileName: () => 'kernel.js' } } })
      console.log(`[build] kernel.js  ${Date.now() - startedAt}ms`)
    },
  }
}
// EmbedPDF 运行时只依赖 node_modules 里的两个 dist 入口，内容不变时跳过重建（SIREREADER_FORCE_EMBEDPDF=1 可强制）。
const EMBEDPDF_STAMP = resolve(__dirname, 'node_modules/.cache/siyuan-sireader/embedpdf-stamp.json')
const EMBEDPDF_CACHE = resolve(__dirname, 'node_modules/.cache/siyuan-sireader/embedpdf')
const embedpdfSignature = (outDir: string) => {
  // 用内容哈希而不是 mtime：pnpm 每次调用都可能刷新 node_modules 里的文件时间
  const parts = ['@embedpdf/engine/dist/index.js', '@embedpdf/viewer/dist/index.js'].map((file) => {
    const path = resolve(__dirname, 'node_modules', file)
    if (!existsSync(path)) return `${file}:missing`
    return `${file}:${createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 12)}`
  })
  return JSON.stringify({ target: resolve(outDir, 'embedpdf'), parts })
}
function buildPdfRuntime(outDir: string) {
  return {
    name: 'build-pdf-runtime',
    async closeBundle() {
      const target = resolve(outDir, 'embedpdf')
      const signature = embedpdfSignature(outDir)
      const stampMatches = existsSync(EMBEDPDF_STAMP) && readFileSync(EMBEDPDF_STAMP, 'utf8') === signature
      const cacheReady = stampMatches && existsSync(resolve(EMBEDPDF_CACHE, 'engine.js'))
      // 主构建会 emptyOutDir 清空 dist，所以缓存放 node_modules/.cache，命中后复制回去
      if (cacheReady && process.env.SIREREADER_FORCE_EMBEDPDF !== '1') {
        const startedAt = Date.now()
        rmSync(target, { recursive: true, force: true })
        cpSync(EMBEDPDF_CACHE, target, { recursive: true, force: true })
        console.log(`[build] embedpdf runtime  ${Date.now() - startedAt}ms（缓存命中，未重新打包）`)
        return
      }
      // 依赖变了就整目录重建，避免旧 hash 资源残留在包里
      rmSync(target, { recursive: true, force: true })
      const startedAt = Date.now()
      await viteBuild({
        configFile: false,
        base: './',
        logLevel: 'warn',
        build: {
          outDir: target,
          emptyOutDir: false,
          assetsInlineLimit: 0,
          reportCompressedSize: false,
          // EmbedPDF ships its PDFium worker fallback as one JavaScript string.
          chunkSizeWarningLimit: 1700,
          rollupOptions: {
            input: {
              viewer: resolve(__dirname, 'node_modules/@embedpdf/viewer/dist/index.js'),
              engine: resolve(__dirname, 'node_modules/@embedpdf/engine/dist/index.js'),
            },
            preserveEntrySignatures: 'strict',
            output: { entryFileNames: '[name].js' },
          },
        },
      })
      console.log(`[build] embedpdf runtime  ${Date.now() - startedAt}ms（含 wasm 与 worker 资源）`)
      rmSync(EMBEDPDF_CACHE, { recursive: true, force: true })
      cpSync(target, EMBEDPDF_CACHE, { recursive: true, force: true })
      mkdirSync(dirname(EMBEDPDF_STAMP), { recursive: true })
      writeFileSync(EMBEDPDF_STAMP, signature)
    },
  }
}
function buildPluginWorker(outDir: string, targetDir: string, entry: string) {
  return {
    name: `build-${entry}-worker`,
    async buildStart() {
      const startedAt = Date.now()
      await viteBuild({
        configFile: false,
        logLevel: 'warn',
        resolve: { alias: { '@': resolve(__dirname, 'src') } },
        // Scribe's Node branches are unreachable in this browser worker.
        plugins: entry === 'pdfReflow' ? [{
          name: 'scribe-browser-worker',
          enforce: 'pre',
          transform(code, id) {
            if (!id.endsWith('/src/vendor/scribe-layout/js/utils/miscUtils.js')) return
            return transformWithEsbuild(code, id, {
              loader: 'js',
              define: { process: 'undefined' },
              minifySyntax: true,
            })
          },
        }] : [],
        build: {
          outDir,
          emptyOutDir: false,
          sourcemap: false,
          minify: true,
          reportCompressedSize: false,
          lib: { entry: resolve(__dirname, `src/services/${entry}.worker.ts`), name: 'SiReaderWorker', formats: ['iife'], fileName: () => `${entry}.worker.js` },
        },
      })
      console.log(`[build] ${entry}.worker.js  ${Date.now() - startedAt}ms`)
    },
    async writeBundle() {
      const workerPath = resolve(outDir, `${entry}.worker.js`)
      await mkdir(targetDir, { recursive: true })
      await copyFile(workerPath, resolve(targetDir, `${entry}.worker.js`))
    },
  }
}
const VIRTUAL_PRIVATE_SOURCES_ID = "\0@private-sources"
const FOLIATE_PDF_STUB_ID = "\0foliate-pdf-stub"
const FOLIATE_CUSTOM_ELEMENTS = {
  view: ["foliate-view", "View"],
  "fixed-layout": ["foliate-fxl", "FixedLayout"],
  paginator: ["foliate-paginator", "Paginator"],
} as const
const PUBLIC_PRIVATE_SOURCES_STUB = `
export const registerPrivateSources = () => {}
export const createPrivateSearchAccess = () => ({
  isSourceVisible: source => !source?.private,
  handleManagePanelClick: () => {},
})
export const callWereadAgentDirect = async () => { throw new Error('微信读书私密模块未安装') }
export const createWereadOnlineBookInfo = () => { throw new Error('微信读书私密模块未安装') }
export const getWereadReadUrl = bookId => bookId ? 'https://weread.qq.com/web/reader/' + encodeURIComponent(bookId) : ''
export const testWereadAgentKey = async () => { throw new Error('微信读书私密模块未安装') }
`

export const guardFoliateCustomElements = (code: string, id: string) => {
  const matched = id.replace(/\\/g, "/").match(/\/foliate-js\/(view|fixed-layout|paginator)\.js(?:\?.*)?$/)
  if (!matched) return code
  const [tag, constructor] = FOLIATE_CUSTOM_ELEMENTS[matched[1] as keyof typeof FOLIATE_CUSTOM_ELEMENTS]
  const original = `customElements.define('${tag}', ${constructor})`
  if (!code.includes(original)) throw new Error(`Expected Foliate custom-element registration in ${id}: ${original}`)
  return code.replace(original, `if (!customElements.get('${tag}')) ${original}`)
}

export default defineConfig(({
  mode,
}) => {

  const env = loadEnv(mode, process.cwd())
  const {
    VITE_SIYUAN_WORKSPACE_PATH,
  } = env

  const siyuanWorkspacePath = VITE_SIYUAN_WORKSPACE_PATH
  let devDistDir = './dev'
  if (siyuanWorkspacePath) {
    devDistDir = `${siyuanWorkspacePath}/data/plugins/${pluginInfo.name}`
  }

  const args = minimist(process.argv.slice(2))
  const isWatch = args.watch || args.w || false
  const useLiveReload = isWatch && env.VITE_ENABLE_LIVERELOAD === 'true'
  const distDir = isWatch ? devDistDir : "./dist"
  // 打 zip 是整个构建里最慢的一步（45MB→~16MB），日常迭代用 build:fast 跳过
  const skipZip = !isWatch && (mode === 'fast' || process.env.SIREREADER_NO_ZIP === '1')
  const privateSources = resolve(__dirname, "private-sources/src/privateSources.ts")

  return {
    // Plugins are served from /plugins/<name>; worker URLs must stay relative to this plugin.
    base: './',
    test: {
      include: ['tests/**/*.test.ts'],
      exclude: ['node_modules/**', 'dist/**', 'dev/**', 'docs/**'],
    },

    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
        ...(process.env.VITEST ? { siyuan: resolve(__dirname, "tests/stubs/siyuan.ts") } : {}),
      },
    },

    plugins: [
      {
        name: "private-sources",
        enforce: "pre",
        transform(code, id) {
          if (id.replace(/\\/g, "/").endsWith("/src/libs/sherpa-onnx/sherpa-onnx-wasm.js")) {
            return code.replace(
              "function run(){if(runDependencies>0)",
              "function run(){if(wasmExports instanceof Promise){wasmExports.then(()=>run());return}if(runDependencies>0)",
            )
          }
          const matched = id.replace(/\\/g, "/").match(/\/foliate-js\/(view|fixed-layout|paginator)\.js(?:\?.*)?$/)
          if (!matched) return null
          const next = guardFoliateCustomElements(code, id)
          return next === code ? null : { code: next, map: null }
        },
        resolveId(id, importer) {
          if (/[\\/]foliate-js[\\/]pdf\.js$/.test(id) || id === "foliate-js/pdf.js" || (id === "./pdf.js" && /[\\/]foliate-js[\\/]view\.js$/.test(importer || ""))) return FOLIATE_PDF_STUB_ID
          if (id !== PRIVATE_SOURCES_ID) return null
          return existsSync(privateSources) ? privateSources : VIRTUAL_PRIVATE_SOURCES_ID
        },
        load(id) {
          if (id === FOLIATE_PDF_STUB_ID) return "export const makePDF = async () => { throw new Error('PDF is handled by EmbedPDF') }"
          if (id !== VIRTUAL_PRIVATE_SOURCES_ID) return null
          return PUBLIC_PRIVATE_SOURCES_STUB
        },
      },
      vue(),
      viteStaticCopy({
        targets: [
          { src: ['./node_modules/mupdf/dist/mupdf.js', './node_modules/mupdf/dist/mupdf-wasm.js', './node_modules/mupdf/dist/mupdf-wasm.wasm'], dest: './mupdf/' },
          { src: './node_modules/mupdf/LICENSE', dest: './mupdf/' },
          { src: ['./THIRD_PARTY_NOTICES.md', './LICENSE'], dest: './' },
          { src: './src/vendor/scribe-layout', dest: './sources/' },
          { src: './src/core/*Reflow*.ts', dest: './sources/reflow/core/' },
          { src: './src/services/pdfReflow*.ts', dest: './sources/reflow/services/' },
          { src: ['./src/components/EmbedPdfReader.vue', './src/components/Reader.vue', './vite.config.ts', './package.json', './plugin.json'], dest: './sources/integration/' },
          {
            src: "./README*.md",
            dest: "./",
          },
          {
            src: "./icon.png",
            dest: "./",
          },
          {
            src: "./preview.png",
            dest: "./",
          },
          {
            src: "./plugin.json",
            dest: "./",
          },
          {
            src: "./src/i18n/*.json",
            dest: "./i18n/",
          },
          {
            src: "./node_modules/bzip2-wasm/bzip2-1.0.8/bzip2.wasm",
            dest: "./bzip2-wasm/",
          },
          {
            src: "./node_modules/sql.js/dist/sql-wasm-inline.js",
            dest: "./legacy/",
          },
          {
            src: "./src/libs/sherpa-onnx/sherpa-onnx.wasm",
            dest: "./sherpa-onnx/",
          },
        ],
      }),
    ],

    // https://github.com/vitejs/vite/issues/1930
    // https://vitejs.dev/guide/env-and-mode.html#env-files
    // https://github.com/vitejs/vite/discussions/3058#discussioncomment-2115319
    // 在这里自定义变量
    define: {
      "process.env.DEV_MODE": `"${isWatch}"`,
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },

    build: {
      // 输出路径
      outDir: distDir,
      emptyOutDir: !isWatch,

      // 构建后是否生成 source map 文件
      sourcemap: false,

      // 设置为 false 可以禁用最小化混淆
      // 或是用来指定是应用哪种混淆器
      // boolean | 'terser' | 'esbuild'
      // 不压缩，用于调试
      minify: !isWatch,

      lib: {
        // Could also be a dictionary or array of multiple entry points
        entry: resolve(__dirname, "src/index.ts"),
        // the proper extensions will be added
        fileName: "index",
        formats: ["cjs"],
      },
      rollupOptions: {
        plugins: [
          buildKernelPlugin(distDir),
          buildPdfRuntime(distDir),
          buildPluginWorker(resolve(__dirname, 'node_modules/.cache/siyuan-sireader'), resolve(__dirname, distDir), 'offlineTTS'),
          buildPluginWorker(resolve(__dirname, 'node_modules/.cache/siyuan-sireader'), resolve(__dirname, distDir), 'pdfReflow'),
          ...(isWatch
            ? [
                ...(useLiveReload ? [livereload(devDistDir)] : []),
                {
                  // 监听静态资源文件
                  name: "watch-external",
                  async buildStart() {
                    const files = await fg([
                      "src/i18n/*.json",
                      "./README*.md",

                      "./plugin.json",
                    ])
                    for (const file of files) {
                      this.addWatchFile(file)
                    }
                  },
                },
              ]
            : skipZip
              ? [{
                  name: 'skip-zip-pack',
                  closeBundle() {
                    console.log('[build] 已跳过 package.zip（build:fast / SIREREADER_NO_ZIP=1）')
                  },
                }]
              : [
                  zipPack({
                    inDir: "./dist",
                    outDir: "./",
                    outFileName: "package.zip",
                  }),
                ]),
        ],

        // make sure to externalize deps that shouldn't be bundled
        // into your library
        external: ["siyuan", "process", /^\/stage\//, "fs", "path", "crypto"],

        output: {
          entryFileNames: "[name].js",
          inlineDynamicImports: true, // 内联所有动态导入，强制单文件
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === "style.css") {
              return "index.css"
            }
            return assetInfo.name
          },
        },
      },
    },
  }
})
