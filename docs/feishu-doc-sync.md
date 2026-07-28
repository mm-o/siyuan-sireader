# 飞书文档同步

思阅文档以本仓库 Markdown 为源，飞书知识库为阅读入口。同步脚本只处理公开文档内容，不保存、输出或同步任何 user token、refresh token、app secret。

## 文件

- `scripts/feishu-doc-sync.mjs`：同步脚本，创建或复用知识库“思阅文档”，维护中英文四个 Wiki 节点。
- `docs/feishu-docs.json`：同步 manifest，保存知识库空间、Wiki 节点、文档 token、URL 和正文 hash。
- `private-sources/feishu-auth.local.json`：本机私有明文凭据文件。该路径位于私有仓库/忽略目录中，不能提交到公开仓库。

## 文档节点

同步范围固定为四个公开入口：

- `README_zh_CN.md` -> `使用文档`
- `README.md` -> `Documentation`
- `CHANGELOG.md` -> `更新日志`
- `README.md` 的 `Latest Updates` 章节 -> `Changelog`

英文更新日志从英文 README 自动抽取，避免维护第二份手写 changelog。

## 授权

首次使用仍需要完成飞书 user 授权：

```powershell
lark-cli auth login --domain docs --domain drive --domain wiki
```

如需保留本机明文 user token 供后续自动化使用，放在私有文件：

```json
{
  "userAccessToken": "user_access_token_here",
  "refreshToken": "refresh_token_here",
  "expiresAt": "2026-08-01T00:00:00.000Z"
}
```

脚本会读取该文件并只报告脱敏状态，例如 `hasUserAccessToken: true`。不要把真实 token 写入 README、CHANGELOG、`docs/` 或任何公开源码文件。

## 同步

```powershell
npm run docs:feishu
```

同步流程：

1. 创建或复用飞书知识库空间“思阅文档”。
2. 创建或复用中英文说明文档与更新日志四个 Wiki 节点。
3. 计算渲染后 Markdown 的 `contentHash`，内容未变化则跳过。
4. 对变化文档执行 `docs +update --command overwrite --doc-format markdown`。
5. 把 `README.md` 和 `README_zh_CN.md` 顶部飞书链接更新为对应语言的新 Wiki 节点链接。

发布前如需同步文档并打包：

```powershell
npm run release:with-docs
```

普通 `build` 不强制同步飞书，避免没有飞书授权的机器构建失败。

## 旧文档库

公开入口只保留知识库链接，不再指向旧文档库。旧文档库内容不作为同步源，也不会被脚本更新；如需删除旧云端文档，应先人工确认旧文档 URL/token 后再执行删除操作。
