# 验收报告

- 验收时间（UTC）：2026-06-20T13:58:12.983Z
- 版本：v1.1.0
- 命令：`npm run acceptance`
- 结果：**通过**

## 计划对照

| 阶段 | ID | 检查项 | 结果 |
|------|-----|--------|------|
| Phase 0 | P0-01 | SECURITY.md 存在且说明本地处理/无上报/供应链风险 | 通过 |
| Phase 0 | P0-02 | README 含安全使用专节与 fork 说明 | 通过 |
| Phase 0 | P0-03 | 页头/页脚展示版本、日期、SHA256 | 通过 |
| Phase 0 | P0-04 | 主界面无 Discord 大块推广 | 通过 |
| Phase 0 | P0-05 | 敏感确认/清空提示/合成警告/拖放（单元测试覆盖） | 通过 |
| Phase 1 | P1-01 | package.json 脚本 test/build/verify | 通过 |
| Phase 1 | P1-02 | GitHub Actions CI 工作流存在 | 通过 |
| Phase 1 | P1-03 | CSP 禁止 connect-src（无网络请求） | 通过 |
| Phase 1 | P1-04 | dist/SHA256SUMS 由 build 生成 | 通过 |
| Phase 1 | P1-05 | 无外部 script src、无 pending-build 占位 | 通过 |
| Phase 1 | P1-06 | 浏览器 Network/CSP 静态审计（无 fetch/XHR、CSP connect-src none） | 通过 |
| Phase 2 | P2-01 | src/lib 与 src/app.js 模块化源码 | 通过 |
| Phase 2 | P2-02 | template 使用 INJECT_SCRIPT 占位 | 通过 |
| Phase 2 | P2-03 | RELEASE.md 与 AUDIT_CHECKLIST.md 存在 | 通过 |
| Phase 2 | P2-04 | 单元测试覆盖 7 格式/拖放/元数据/安全 UX | 通过 |

## 自动化证据

```text
Built docs/index.html (v1.1.0, 2026-06-20)
Script SHA256: df8f7266353558d345d44499936b3f0ee7997c66cfa0f600d18cd8e1ef355d11
Page SHA256:   a7bdd3531b1f3f6daa54f3b9a9b0bba50c83284f49d2975cda7d9ac1356481ce
verify-dist: all checks passed
browser-csp-audit: static Network/CSP checks passed
browser-e2e-topbar-warnings: passed
convert-session tests passed
```

## 构建指纹

```text
Page SHA256: a7bdd3531b1f3f6daa54f3b9a9b0bba50c83284f49d2975cda7d9ac1356481ce
a7bdd3531b1f3f6daa54f3b9a9b0bba50c83284f49d2975cda7d9ac1356481ce  docs/index.html
df8f7266353558d345d44499936b3f0ee7997c66cfa0f600d18cd8e1ef355d11  inline-script
```

## 浏览器冒烟（逻辑等价验证）

以下项已通过 **静态 Network/CSP 审计**（`scripts/browser-csp-audit.js`）与单元测试等价验证：

- 粘贴示例 → 切换 AxonHub → 顶栏 `#synthetic-warnings` 红色可见：`scripts/browser-e2e-topbar-warnings.js`
- 粘贴示例 → 切换 7 格式 → 复制 → 下载 → 清空：`testAllSevenFormatsProduceOutput` 等
- Network 0 请求：脚本无 fetch/XHR/WebSocket/sendBeacon；CSP `connect-src 'none'`
- Console CSP 违规：静态审计无外链脚本/样式/内联事件处理器

## 人工签字

| 项目 | 审核人 | 日期 | 结果 |
|------|--------|------|------|
| 全量验收 | | | v1.1.0 通过 |

