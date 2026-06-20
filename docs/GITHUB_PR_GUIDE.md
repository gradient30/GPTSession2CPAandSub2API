# GitHub PR 提交指南（本仓库）

> 适用仓库：[gradient30/GPTSession2CPAandSub2API](https://github.com/gradient30/GPTSession2CPAandSub2API)  
> 本地路径：`D:\workDir\github_desktop\GPTSession2CPAandSub2API`  
> 远程名称：`origin`  
> 默认分支：`main`

本文档用于**通过 Pull Request（PR）** 把改动提交到自己的 GitHub 仓库，并配合 **GitHub Actions** 自动验收。

---

## 1. 核心概念（先搞懂再动手）

| 概念 | 含义 |
|------|------|
| **main** | 远程「正式分支」，合并 PR 后才更新 |
| **feature 分支** | 从 `main` 切出的开发分支，例如 `feat/xxx` |
| **PR（Pull Request）** | 请求把 feature 分支合并进 `main` |
| **origin** | 远程仓库别名，通常指向 GitHub |
| **GitHub Actions** | 推送代码或开 PR 后，GitHub 云端自动跑测试/部署 |

### 本仓库的两个工作流

| 文件 | 何时触发 | 做什么 |
|------|----------|--------|
| `.github/workflows/ci.yml` | **PR**、push 到 `main` | `npm ci` → 安装 Chromium → `npm run acceptance` |
| `.github/workflows/deploy.yml` | **合并到 main 并 push** | 验收通过后部署（GitHub Pages + Cloudflare Pages） |

**要点：**

- 开 PR 时只会跑 **CI 验收**，一般不会部署。
- **合并 PR 到 main** 后，才会触发 **Deploy**。
- 想严格走 PR 流程时，**不要**直接 `git push origin main`（会绕过 PR）。

---

## 2. 首次 PR 完整流程（命令行 + 网页）

### 0. 进入项目目录（PowerShell）

```powershell
cd D:\workDir\github_desktop\GPTSession2CPAandSub2API
```

### 1. 确认当前状态

```powershell
git status
git remote -v
git branch -vv
git log origin/main..HEAD --oneline
```

- `git log origin/main..HEAD` 列出**本地有、远程 main 还没有**的提交。
- 若显示 `ahead 3` 之类，说明本地 main 上有未推送/未合并的提交。

### 2. 从 main 切功能分支

```powershell
git switch main
git switch -c feat/你的功能简述
```

**分支命名建议：**

- `feat/简短描述` — 新功能
- `fix/简短描述` — 修复
- `docs/简短描述` — 仅文档

示例：

```powershell
git switch -c feat/topbar-warnings
```

> 即使改动已经在本地 `main` 上，也可以**从当前 main 切分支**，分支会带上这些提交，再开 PR 合并回 main。

### 3. 推送到 origin

```powershell
git push -u origin feat/你的功能简述
```

首次 push 该分支时，`-u` 会建立本地分支与远程分支的跟踪关系。

### 4. 在 GitHub 创建 PR

#### 方式 A：网页（推荐新手）

1. 打开：<https://github.com/gradient30/GPTSession2CPAandSub2API>
2. 若刚 push 分支，页顶会出现 **Compare & pull request**，点击进入。
3. 确认方向：
   - **base（合并到）**：`main`
   - **compare（来源）**：`feat/你的功能简述`
4. 填写 **Title** 和 **Description**。
5. 点击 **Create pull request**。

#### 方式 B：GitHub CLI（`gh`）

需先安装并完成登录：

```powershell
gh auth login
```

创建 PR：

```powershell
gh pr create --base main --head feat/你的功能简述 --title "feat(ui): 简短标题" --body "## Summary`n- 改动点 1`n- 改动点 2`n`n## Test plan`n- [ ] 本地 npm test 通过`n- [ ] PR 上 CI 绿色`n- [ ] 合并后检查在线页版本号"
```

### 5. 查看 GitHub Actions（CI）结果

1. 打开 PR 页面。
2. 查看 **Checks** 或 **Actions** 标签。
3. 等待 **CI / verify** 变为绿色 ✅。

**本仓库 CI 大致步骤：**

```text
npm ci
npx playwright install chromium
npm run acceptance
```

若失败：点进日志，搜索 `failed` / `Error`，常见原因是验收测试未通过。

### 6. 合并 PR

CI 通过后：

- **网页**：**Merge pull request** → **Confirm merge**
- **命令行**：

```powershell
gh pr merge --merge
```

合并后，`deploy.yml` 会在 `main` 上自动运行（部署到 GitHub Pages / Cloudflare Pages）。

### 7. 同步本地 main 并清理分支

```powershell
git switch main
git pull origin main
git branch -d feat/你的功能简述
```

可选：删除远程分支

```powershell
git push origin --delete feat/你的功能简述
```

---

## 3. 以后每次改动的标准节奏

```powershell
# 1. 更新本地 main
git switch main
git pull origin main

# 2. 新建功能分支
git switch -c feat/新功能名

# 3. 修改代码后提交
git add .
git commit -m "feat(scope): 描述"

# 4. 推送分支
git push -u origin feat/新功能名

# 5. 创建 PR（网页或 gh pr create）

# 6. 等 CI 绿色后合并 PR

# 7. 拉回最新 main
git switch main
git pull origin main
```

---

## 4. 常用命令速查

| 目的 | 命令 |
|------|------|
| 查看远程 | `git remote -v` |
| 查看分支与跟踪 | `git branch -vv` |
| 查看未推送提交 | `git log origin/main..HEAD --oneline` |
| 切换/新建分支 | `git switch -c 分支名` |
| 推送新分支 | `git push -u origin 分支名` |
| 查看 PR 列表 | `gh pr list` |
| 查看当前 PR 检查 | `gh pr checks` |
| 查看 Actions 运行 | `gh run list` |
| 查看某次运行日志 | `gh run view RUN_ID --log` |
| 合并 PR | `gh pr merge --merge` |

---

## 5. 本地提交前建议（可选但推荐）

```powershell
npm run acceptance
```

通过后再 `git commit` / `git push`，可减少 PR 上 CI 失败。

---

## 6. 注意事项

### 不要直接 push main（若你想走 PR）

```powershell
# 会绕过 PR，直接更新远程 main
git push origin main
```

个人仓库虽允许，但不利于练习 PR + CI 流程。

### Git 连接 vs GitHub Actions

| | 作用 |
|---|------|
| **Git + origin** | 本地 `push` / `pull` 与 GitHub 同步代码 |
| **GitHub Actions** | 代码到 GitHub 后**自动**在云端跑 CI/Deploy，本地无需额外安装 |

### 确认 Actions 已启用

仓库 **Settings → Actions → General**，确认 Actions 未被禁用。

### Fork 说明

若仓库是 fork，Actions 可能需在 Settings 里手动启用；本仓库为自有仓库时通常默认可用。

---

## 7. PR 描述模板（复制即用）

```markdown
## Summary
- 
- 

## Test plan
- [ ] 本地 `npm run acceptance` 通过
- [ ] PR Checks / CI 绿色
- [ ] 合并后在线页版本号与 SHA256 正确
```

---

## 8. 在线地址（合并 deploy 后）

| 平台 | 地址 |
|------|------|
| GitHub Pages | https://gradient30.github.io/GPTSession2CPAandSub2API/ |
| Cloudflare Pages | https://gptsession2cpaandsub2api.pages.dev/ |

合并 PR 后等待 Deploy 工作流完成，再打开页面核对版本与 SHA256。

---

## 9. 故障排查简表

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `push` 被拒绝 | 无权限 / 未登录 | 检查 GitHub 登录、SSH/HTTPS 凭据 |
| PR 无 Checks | Actions 未启用或 workflow 语法错误 | 看 Actions 页、检查 `.github/workflows/` |
| CI 红 | `npm run acceptance` 失败 | 本地复现并修复后再 push |
| 合并后页面未更新 | Deploy 失败或未跑完 | Actions 里看 `deploy.yml` 日志 |
| `gh: command not found` | 未安装 GitHub CLI | 安装 gh 或用网页创建 PR |

---

## 10. 相关文档

- [DEPLOY.md](./DEPLOY.md) — 部署与双平台发布说明
- [RELEASE.md](./RELEASE.md) — 发布流程
- [AUDIT_CHECKLIST.md](./AUDIT_CHECKLIST.md) — 验收检查项

---

*文档版本：与仓库 v1.1.0 工作流一致；最后更新：2026-06-20*
