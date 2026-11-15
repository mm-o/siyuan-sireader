# 思阅文档源

本目录是思阅用户文档的**唯一来源**，由文档站（`docs.745201.xyz`）在构建时聚合发布。

## 目录

| 路径 | 作用 |
| --- | --- |
| `sireader/*.mdx` | 思阅产品文档，`meta.json` 决定导航顺序与分组 |
| `getting-started/sireader-installation.mdx` | 安装页，聚合进文档站的“安装与开始使用”分区 |
| `changelog/sireader.mdx` | 更新日志，**自动生成** |
| `shared-slugs.json` | 允许链接过去的公共页清单（由文档站提供） |
| `sireader/settings-reference.mdx` | 设置参考，**自动生成** |
| `sireader/membership-matrix.mdx` | 会员权益对照，**自动生成** |
| `sireader/shortcuts.mdx` | 快捷键与命令，**自动生成** |

## 命令

```powershell
pnpm docs:gen          # 重新生成 4 个自动页
pnpm docs:check        # 门禁：结构、链接、域名、版本、生成页新鲜度
pnpm docs:check:strict # 生成页过期视为失败（发版前用）
```

## 写作约定

1. 单篇正文 3–6 KB，二级标题不超过 12 个；超出就拆页。小程序阅读页没有页内目录。
2. 每篇 frontmatter 必须有 `title`、`description`（≤60 字）、`appliesTo`（如 `">=2.7.0"`）。
3. 站内链接写成 `/docs/<slug>/` 绝对路径，不要用相对路径或锚点（小程序不认 `#anchor`）。
4. 每篇最多 1 节“边界与限制”，其余写成步骤；不要用“以实际界面为准”代替核对。
5. 用户页不写会员 API 域名、内部实现细节；这类内容放维护者文档。
6. 截图必须用 `https://docs.745201.xyz/...` 绝对地址，每篇不超过 4 张。
7. 自动生成的页面不要手改；要改就改来源文件再跑 `pnpm docs:gen`。

## slug 规则

- 只允许小写字母、数字与连字符，建议两级（`sireader/xxx`）。
- **slug 一旦发布不要改**：改标题可以，改 slug 会让旧链接失效。必须改时同时更新 `doc-aliases.json` 与 `_redirects`。
- 现有 slug 与线上地址保持一致：`overview`、`usage`、`bookshelf`、`annotations`、`tools`、`online`、`faq`、`features-and-access`、`integration`。

## 发布

发版后由文档站侧执行聚合构建并部署；思阅仓库只负责产出内容与通过门禁。每次发版必须让 `pnpm docs:check:strict` 通过。
