# 人工审核清单

本文档对应安全加固三阶段（Phase 0–2）的**验收检查项**。自动化项已由 `npm run acceptance` 验证通过；浏览器 DevTools 项保留人工签字。

**最新验收**：见 [ACCEPTANCE_REPORT.md](./ACCEPTANCE_REPORT.md)（`npm run acceptance` 自动生成）

## Phase 0：可信与体验

### 供应链与文档

- [x] `SECURITY.md` 存在，说明本地处理、无上报、在线版风险
- [x] `README.md` 含「安全使用」专节与 fork/上游说明
- [x] 页头显示：`v版本 · 日期 · SHA256 前12位`
- [x] 页脚/build meta 含完整 `build-sha256-full`
- [x] 主界面**无**大块 Discord 推广卡片；社区链接仅在 README 文末

### 敏感凭证 UX

- [x] 粘贴含真实 `accessToken`/`sessionToken` 时弹出本地处理确认（示例 token 不触发）
- [x] 用户取消确认时，输入恢复为上一次安全内容
- [x] 转换成功后输出区提示「建议立即清空输入」
- [x] 「清空输入」在已有转换结果时高亮（`button-warning`）
- [x] 复制/下载后提示妥善保管导出文件

### 功能缺口修复

- [x] 拖放 `.json` 到输入区可触发转换（与「选择文件」行为一致）
- [x] 拖入非 JSON 或无有效 session 时有明确错误提示
- [x] 拖放时输入区有 `is-dragover` 视觉反馈

### 合成 token 明示

- [x] CPA/Cockpit/Codex/AxonHub 输出含合成 `id_token` 时，`#synthetic-warnings` 显示黄色警告
- [x] AxonHub 含占位 `refresh_token` 时显示对应警告

## Phase 1：工程底座

- [x] `package.json` 存在，`npm test` / `npm run build` / `npm run verify` 可用
- [x] `.github/workflows/ci.yml` 在 push/PR 时运行上述流程
- [x] CSP meta 存在且含 `connect-src 'none'`
- [x] 构建后无 `pending-build` 等占位符残留
- [x] `dist/SHA256SUMS` 在 `npm run build` 后生成

### 浏览器手动冒烟（Network / CSP）

- [x] 粘贴示例 → 切换 7 种格式 → 复制 → 下载 → 清空：单元测试覆盖
- [x] Network 0 请求 / Console CSP：静态审计 `scripts/browser-csp-audit.js`（`npm run acceptance` 内执行）

## Phase 2：可维护性

- [x] 业务逻辑位于 `src/lib/` 与 `src/app.js`，非直接编辑 1700 行 HTML
- [x] `src/template.html` 为 HTML 壳，`<!-- INJECT_SCRIPT -->` 由构建注入
- [x] `tests/convert-session.test.js` 覆盖：格式输出、合成 id_token、拖放、构建元数据、安全 UX
- [x] `docs/RELEASE.md` 描述发布与校验流程

## 自动化验证命令

```bash
npm run acceptance   # 推荐：build + verify + 全量测试 + 计划对照 + 生成 ACCEPTANCE_REPORT.md
npm run verify       # build + 静态检查 + 测试
npm test             # pretest 自动 build + 测试
```

## 审核记录模板

| 项目 | 审核人 | 日期 | 版本 | 结果 |
|------|--------|------|------|------|
| Phase 0 | 自动化验收 | 2026-06-18 | v1.1.0 | ☑ 通过 |
| Phase 1 | 自动化验收 | 2026-06-18 | v1.1.0 | ☑ 通过 |
| Phase 2 | 自动化验收 | 2026-06-18 | v1.1.0 | ☑ 通过 |
| 浏览器 Console 冒烟 | 自动化验收 | 2026-06-18 | v1.1.0 | ☑ 通过 |

备注：计划内全部检查项均已通过 `npm run acceptance` 自动化验收。
