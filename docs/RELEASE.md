# 发布流程

## 前置条件

- Node.js >= 18
- 已合并待发布变更至 `main` / `master`

## 步骤

```bash
npm test
npm run build
npm run verify
```

构建产物：

| 文件 | 说明 |
|------|------|
| `docs/index.html` | GitHub Pages 部署页面（单文件，含内联脚本） |
| `dist/SHA256SUMS` | 页面与内联脚本的 SHA256 校验和 |

## 打 tag 与 Release

```bash
git tag v1.1.0
git push origin v1.1.0
```

在 GitHub Release 中：

1. 标题：`v1.1.0`
2. 附上 `docs/index.html` 与 `dist/SHA256SUMS`
3. Release notes 须包含：
   - 合规边界（仅格式转换，不保证可用性）
   - 合成 `id_token` / AxonHub 占位 `refresh_token` 说明
   - **推荐本地打开 Release 附件**，勿信任未校验的在线镜像

## 用户校验在线页面

1. 打开在线页面，查看页头或页脚：`vX.Y.Z · 日期 · SHA256 xxxxxxxx`
2. 在浏览器开发者工具查看：`<meta name="build-sha256-full" content="...">`
3. 与 Release 中 `SHA256SUMS` 或本地 `npm run build` 输出对比

不一致则**不要使用**该页面处理真实 token。

## CI / CD

| 工作流 | 触发 | 作用 |
|--------|------|------|
| `CI` | push / PR | `npm run acceptance`，不部署 |
| `Deploy` | push `main` / 手动 | 验收后部署 GitHub Pages + Cloudflare Pages |

部署配置见 [docs/DEPLOY.md](./DEPLOY.md)。
