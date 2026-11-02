/* eslint-disable node/prefer-global/process */
import { existsSync } from "node:fs"
import { copyFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import vue from "@vitejs/plugin-vue"
import fg from "fast-glob"
import minimist from "minimist"
import livereload from "rollup-plugin-livereload"
import {
  build as viteBuild,
  defineConfig,
  loadEnv,
} from "vite"
import { viteStaticCopy } from "vite-plugin-static-copy"
import zipPack from "vite-plugin-zip-pack"

const pluginInfo = require("./plugin.json")
const PRIVATE_SOURCES_ID = "@private-sources"

function buildKernelPlugin(outDir: string) {
  return {
    name: 'build-siyuan-kernel',
    async closeBundle() {
      await viteBuild({ configFile: false, build: { outDir, emptyOutDir: false, sourcemap: false, minify: false, lib: { entry: resolve(__dirname, 'src/kernel/index.js'), name: 'SiReaderKernel', formats: ['iife'], fileName: () => 'kernel.js' } } })
    },
  }
}
function buildPluginWorker(outDir: string, targetDir: string, entry: string) {
  return {
    name: `build-${entry}-worker`,
    async buildStart() {
      await viteBuild({
        configFile: false,
        resolve: { alias: { '@': resolve(__dirname, 'src') } },
        build: {
          outDir,
          emptyOutDir: false,
          sourcemap: false,
          minify: true,
          lib: { entry: resolve(__dirname, `src/services/${entry}.worker.ts`), name: 'SiReaderWorker', formats: ['iife'], fileName: () => `${entry}.worker.js` },
        },
      })
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
            src: [
              "./node_modules/@embedpdf/snippet/dist/embedpdf*.js",
              "./node_modules/@embedpdf/snippet/dist/worker-engine*.js",
              "./node_modules/@embedpdf/snippet/dist/direct-engine*.js",
              "./node_modules/@embedpdf/snippet/dist/browser*.js",
            ],
            dest: "./embedpdf/snippet/",
          },
          {
            src: "./node_modules/@embedpdf/snippet/dist/pdfium.wasm",
            dest: "./embedpdf/",
          },
          {
            src: "./node_modules/@embedpdf/default-stamps/zh-CN/*",
            dest: "./embedpdf/stamps/zh-CN/",
          },
          {
            src: "./node_modules/@embedpdf/default-stamps/en/*",
            dest: "./embedpdf/stamps/en/",
          },
          {
            src: "./node_modules/bzip2-wasm/bzip2-1.0.8/bzip2.wasm",
            dest: "./bzip2-wasm/",
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
