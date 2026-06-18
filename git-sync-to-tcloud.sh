#!/usr/bin/env bash
set -euo pipefail

################################
# 配置区
################################
REMOTE_HOST="${REMOTE_HOST:-}"
SSH_BIN="${SSH_BIN:-ssh}"
SCP_BIN="${SCP_BIN:-scp}"

LOCAL_REPO_NAME="$(basename "$(git rev-parse --show-toplevel)")"


SYNC_ID_FILE="last_sync_id"
SYNC_WAIT_MAX_SECS="${SYNC_WAIT_MAX_SECS:-180}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
REMOTE_LOG="${REMOTE_LOG:-/var/log/git-bundle-sync.log}"

################################
# 工具函数
################################
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  echo "❌ ERROR: $*" >&2
  exit 1
}

update_sync_id() {
  local commit_id="$1"
  local reason="$2"
  local tmp_file="${SYNC_ID_FILE}.tmp"

  printf '%s\n' "${commit_id}" > "${tmp_file}"
  mv "${tmp_file}" "${SYNC_ID_FILE}"
  log "🎉 last_sync_id 已更新：${commit_id}（${reason}）"
}

################################
# Step 0: 前置校验
################################
log "🔍 校验当前目录是否为 git 仓库"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "当前目录不是 git 仓库"

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
[[ -n "${ORIGIN_URL}" ]] \
  || fail "请先配置 origin，例如 git remote add origin ${REMOTE_HOST:-tcloud}:/root/cnb_repo/git/${LOCAL_REPO_NAME}.git"

if [[ "${ORIGIN_URL}" =~ ^([^:]+):(.+\.git)$ ]]; then
  ORIGIN_HOST="${BASH_REMATCH[1]}"
  REMOTE_REPO_PATH="${BASH_REMATCH[2]}"
else
  fail "origin 必须是 SSH 路径，例如 tcloud:/root/cnb_repo/git/${LOCAL_REPO_NAME}.git"
fi

REMOTE_HOST="${REMOTE_HOST:-${ORIGIN_HOST:-tcloud}}"
REPO_NAME="$(basename "${REMOTE_REPO_PATH%.git}")"
BUNDLE_NAME="${REPO_NAME}.delta.bundle"
REMOTE_BUNDLE_REMOTE_PATH="${REMOTE_BUNDLE_REMOTE_PATH:-/tmp/${BUNDLE_NAME}}"
REMOTE_BUNDLE_PATH="${REMOTE_HOST}:${REMOTE_BUNDLE_REMOTE_PATH}"

################################
# Step 1: 确定同步基线（权威来源：origin）
################################
log "📍 确定同步基线（origin/main）"

git fetch origin >/dev/null 2>&1 || true

BASE_COMMIT="$(git rev-parse origin/main 2>/dev/null || true)"
LOCAL_HEAD="$(git rev-parse HEAD)"

if [[ -z "${BASE_COMMIT}" ]]; then
  fail "无法获取 origin/main，请确认远端存在"
fi

log "📍 同步前 origin/main = ${BASE_COMMIT}"
log "📍 本地 HEAD = ${LOCAL_HEAD}"

if [[ "${BASE_COMMIT}" == "${LOCAL_HEAD}" ]]; then
  update_sync_id "${LOCAL_HEAD}" "origin/main 已是最新"
  log "ℹ️ 没有新提交，无需同步"
  exit 0
fi

################################
# Step 2: SSH 预热（无人值守关键）
################################
log "🔐 SSH 预热（known_hosts / 风控放行）"

"${SSH_BIN}" -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=10 \
    "${REMOTE_HOST}" "true" \
    || fail "SSH 预热失败，无法连接 ${REMOTE_HOST}"

log "✅ SSH 预热完成"

################################
# Step 3: 创建增量 bundle
################################
log "📦 创建增量 bundle"

rm -f "${BUNDLE_NAME}"

git bundle create "${BUNDLE_NAME}" main "^${BASE_COMMIT}" \
  || fail "git bundle 创建失败"

[[ -s "${BUNDLE_NAME}" ]] \
  || fail "bundle 文件为空（无新提交或异常）"

log "✅ bundle 创建成功"

################################
# Step 4: 上传 bundle（scp）
################################
log "🚀 上传 bundle 到云主机"

"${SCP_BIN}" -O \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    "${BUNDLE_NAME}" "${REMOTE_BUNDLE_PATH}" \
  || fail "scp 上传失败"

log "✅ bundle 上传成功"

resolve_remote_path_test_cmd() {
  local remote_path="$1"
  cat <<EOF
TARGET_PATH='${remote_path}'
if [ "\${TARGET_PATH#/}" = "\${TARGET_PATH}" ]; then
  TARGET_PATH="\$HOME/\$TARGET_PATH"
fi
test -f "\$TARGET_PATH"
EOF
}

FAILED_BUNDLE_REMOTE_PATH="$(dirname "${REMOTE_BUNDLE_REMOTE_PATH}")/failed/${BUNDLE_NAME}"

################################
# Step 5: 等待 watcher 完成并校验裸仓库 + upstream
################################
log "📥 等待 watcher 应用 bundle，并校验 origin/main 与 ${UPSTREAM_REMOTE}/main"

read_upstream_main_on_remote() {
  "${SSH_BIN}" -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 \
      "${REMOTE_HOST}" \
      "git --git-dir '${REMOTE_REPO_PATH}' ls-remote '${UPSTREAM_REMOTE}' 'refs/heads/main' 2>/dev/null | awk 'NR==1 {print \$1}'" \
      2>/dev/null || true
}

bundle_exists_on_remote() {
  "${SSH_BIN}" -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 \
      "${REMOTE_HOST}" \
      "$(resolve_remote_path_test_cmd "${REMOTE_BUNDLE_REMOTE_PATH}")" >/dev/null 2>&1
}

failed_bundle_exists_on_remote() {
  "${SSH_BIN}" -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 \
      "${REMOTE_HOST}" \
      "$(resolve_remote_path_test_cmd "${FAILED_BUNDLE_REMOTE_PATH}")" >/dev/null 2>&1
}

deadline=$(( $(date +%s) + SYNC_WAIT_MAX_SECS ))
last_status="等待 watcher 处理 bundle"
poll=0

while (( $(date +%s) < deadline )); do
  if failed_bundle_exists_on_remote; then
    fail "watcher 已将 bundle 移入 failed 目录，请检查远端 ${FAILED_BUNDLE_REMOTE_PATH} 与日志 ${REMOTE_LOG}"
  fi

  CURRENT_ORIGIN_HEAD="$(git ls-remote origin refs/heads/main 2>/dev/null | awk 'NR==1 {print $1}')"
  UPSTREAM_HEAD="$(read_upstream_main_on_remote)"

  if [[ "${CURRENT_ORIGIN_HEAD}" == "${LOCAL_HEAD}" && "${UPSTREAM_HEAD}" == "${LOCAL_HEAD}" ]]; then
    update_sync_id "${LOCAL_HEAD}" "裸仓库与 ${UPSTREAM_REMOTE}/main 均已同步"
    log "✅ 全链路同步完成：origin/main 与 ${UPSTREAM_REMOTE}/main = ${LOCAL_HEAD}"
    exit 0
  fi

  if [[ "${CURRENT_ORIGIN_HEAD}" == "${LOCAL_HEAD}" ]]; then
    if bundle_exists_on_remote; then
      last_status="裸仓库已更新，bundle 仍在队列中等待 watcher 推送到 ${UPSTREAM_REMOTE}"
    else
      log "⚠️ PARTIAL: 裸仓库 origin/main 已更新为 ${LOCAL_HEAD}，但 ${UPSTREAM_REMOTE}/main 为 ${UPSTREAM_HEAD:-<未确认>}"
      log "常见原因：GitHub 网络瞬时故障（Empty reply from server）"
      log "请在 ${REMOTE_HOST} 执行：git --git-dir ${REMOTE_REPO_PATH} push --force ${UPSTREAM_REMOTE} main"
      exit 2
    fi
  elif bundle_exists_on_remote; then
    last_status="bundle 等待 watcher 处理（origin/main=${CURRENT_ORIGIN_HEAD:-?}）"
  else
    last_status="bundle 已移走，等待 origin/main 推进（当前=${CURRENT_ORIGIN_HEAD:-?}）"
  fi

  poll=$(( poll + 1 ))
  if (( poll % 5 == 0 )); then
    log "⏳ ${last_status}"
  fi

  sleep 2
done

fail "等待同步超时（${SYNC_WAIT_MAX_SECS}s）。最后状态：${last_status}。请检查 ${REMOTE_HOST} 日志 ${REMOTE_LOG}"
