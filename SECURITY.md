# Security Policy

## 设计原则

本工具是**纯前端、本地运行**的 JSON 格式转换器：

- 所有解析与转换在浏览器内完成
- **不向任何服务器上传** session、token 或转换结果
- **不写入** `localStorage` / `IndexedDB` 持久化 token（仅使用 `sessionStorage` 记录「本会话是否跳过敏感粘贴确认」，不含凭证）
- 无外部 JavaScript、无 `fetch` / `XMLHttpRequest` / `WebSocket`
- 页面包含 CSP：`connect-src 'none'`，从策略层面禁止网络连接

## 推荐用法

处理**真实** ChatGPT session 或 OAuth JSON 时：

1. **优先本地打开** `docs/index.html`（或 Release 附件），不要依赖不可信的在线镜像
2. 若使用 GitHub Pages 在线版，请核对页面内 **版本号、构建日期、内联脚本 SHA256** 与仓库 Release / `dist/SHA256SUMS` 一致
3. 转换完成后**立即清空输入**并关闭标签页
4. 不要将 session JSON 发送给他人、粘贴到不可信网页或公共聊天频道
5. 复制/下载的导出文件含敏感凭证，请按密钥文件保管

## 在线版供应链风险

GitHub Pages 等托管方式下，用户信任的是「托管方提供的 HTML 与开源仓库一致」。若 Pages 部署被篡改或账号被盗，理论上可植入上报逻辑。

**缓解措施（本仓库已实现）：**

- 构建时写入 `meta[name=build-version|build-date|build-sha256]`
- `npm run verify` 校验产物完整性并跑回归测试
- Release 可附 `docs/index.html` 与 `dist/SHA256SUMS` 供离线校验

## 合成 token 说明

当输入缺少真实 `id_token` 时，工具会构造带 `cpa_synthetic: true` 的占位 JWT，以便部分下游工具解析。这是**格式兼容**手段，不是后门；若下游校验 JWT 签名，可能失败。

AxonHub 输出在缺少 `refresh_token` 时会写入 `__missing_refresh_token__` 占位值；access token 过期后无法自动刷新。

## 合规与服务条款

本工具仅做**已有 JSON 的格式转换**，不保证转换结果能被 OpenAI 或目标工具接受。OpenAI 已限制通过 Web session 绕过 Codex OAuth 手机绑定等方式；用户须自行遵守相关服务条款与当地法律。

## 漏洞报告

如发现安全问题，请通过 GitHub Issues 联系维护者，**勿在公开 issue 中粘贴真实 token**。
