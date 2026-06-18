#!/usr/bin/env bash
set -euo pipefail

# 本地连接与目标仓库参数
REMOTE_HOST="${REMOTE_HOST:-tcloud}"
REMOTE_UPLOAD_DIR="${REMOTE_UPLOAD_DIR:-/tmp}"
LOCAL_REMOTE_NAME="${LOCAL_REMOTE_NAME:-origin}"
REMOTE_REPO_PATH="${REMOTE_REPO_PATH:-}"
REMOTE_TARGET_REMOTE="${REMOTE_TARGET_REMOTE:-upstream}"
REMOTE_LOG="${REMOTE_LOG:-/var/log/git-bundle-sync.log}"
REMOTE_APPLY_SCRIPT="${REMOTE_APPLY_SCRIPT:-/root/cnb_repo/git/apply-bundle.sh}"
REMOTE_WATCH_LOCK="${REMOTE_WATCH_LOCK:-/var/lock/git-bundle-watch.lock}"
SYNC_WAIT_MAX_SECS="${SYNC_WAIT_MAX_SECS:-180}"
SYNC_ID_FILE="${SYNC_ID_FILE:-last_sync_id}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

normalize_remote_host() {
  local host="$1"
  host="${host##*@}"
  echo "${host%%:*}"
}

extract_repo_path_from_remote_url() {
  local remote_url="$1"
  local expected_host="$2"
  local host_part=""
  local path_part=""

  if [[ "$remote_url" =~ ^ssh://([^/]+)/(.+)$ ]]; then
    host_part="${BASH_REMATCH[1]}"
    path_part="/${BASH_REMATCH[2]}"
  elif [[ "$remote_url" =~ ^([^:]+):(.+)$ ]]; then
    host_part="${BASH_REMATCH[1]}"
    path_part="${BASH_REMATCH[2]}"
  else
    return 1
  fi

  [[ "$(normalize_remote_host "$host_part")" == "$(normalize_remote_host "$expected_host")" ]] || return 1
  [[ "$path_part" == /* ]] || return 1
  [[ "$path_part" == *.git ]] || return 1

  printf '%s\n' "$path_part"
}

log "校验当前目录是否为 git 仓库"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "当前目录不是 git 仓库"

REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="${REPO_NAME:-$(basename "$REPO_ROOT")}"
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

[[ "$BRANCH" != "HEAD" ]] || fail "当前处于 detached HEAD，无法自动识别同步分支"
HEAD_COMMIT="$(git rev-parse "${BRANCH}^{commit}")"

if [[ -z "$REMOTE_REPO_PATH" ]]; then
  REMOTE_URL="$(git -C "${REPO_ROOT}" remote get-url "${LOCAL_REMOTE_NAME}" 2>/dev/null || true)"
  [[ -n "$REMOTE_URL" ]] || fail "无法读取本地远端 ${LOCAL_REMOTE_NAME}，请设置 REMOTE_REPO_PATH"
  REMOTE_REPO_PATH="$(extract_repo_path_from_remote_url "$REMOTE_URL" "$REMOTE_HOST" || true)"
  [[ -n "$REMOTE_REPO_PATH" ]] || fail "无法从 ${LOCAL_REMOTE_NAME}=${REMOTE_URL} 解析 ${REMOTE_HOST} 上的绝对裸仓库路径，请设置 REMOTE_REPO_PATH"
fi

BUNDLE_NAME="${REPO_NAME}.init.bundle"
BUNDLE_PATH="${REPO_ROOT}/${BUNDLE_NAME}"
REMOTE_BUNDLE_FILE="${REMOTE_UPLOAD_DIR%/}/${BUNDLE_NAME}"
REMOTE_BUNDLE_PATH="${REMOTE_HOST}:${REMOTE_BUNDLE_FILE}"
LOCAL_SYNC_ID_FILE="${REPO_ROOT}/${SYNC_ID_FILE}"
FAILED_BUNDLE_REMOTE_PATH="$(dirname "${REMOTE_BUNDLE_FILE}")/failed/${BUNDLE_NAME}"

log "SSH 预热并校验远端上传目录"
ssh -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=10 \
    "${REMOTE_HOST}" \
    "mkdir -p '${REMOTE_UPLOAD_DIR%/}' && test -d '${REMOTE_UPLOAD_DIR%/}'" \
    || fail "SSH 预热失败，无法连接 ${REMOTE_HOST} 或创建 ${REMOTE_UPLOAD_DIR}"

log "创建完整初始化 bundle: ${BUNDLE_NAME}"
rm -f "${BUNDLE_PATH}"
git -C "${REPO_ROOT}" bundle create "${BUNDLE_PATH}" "${BRANCH}" || fail "git bundle 创建失败"
[[ -s "${BUNDLE_PATH}" ]] || fail "bundle 文件为空"
git -C "${REPO_ROOT}" bundle verify "${BUNDLE_PATH}" >/dev/null 2>&1 || fail "bundle 校验失败"

log "上传 bundle 到 ${REMOTE_BUNDLE_PATH}"
scp -O \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    "${BUNDLE_PATH}" "${REMOTE_BUNDLE_PATH}" \
    || fail "scp 上传失败"

log "触发 ${REMOTE_HOST} 上的 apply-bundle.sh（与 watch-bundles watcher 同路径）"
set +e
ssh -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=10 \
    "${REMOTE_HOST}" \
    "flock '${REMOTE_WATCH_LOCK}' bash '${REMOTE_APPLY_SCRIPT}'"
remote_rc=$?
set -e

if (( remote_rc != 0 )); then
  log "⚠️ apply-bundle 返回 rc=${remote_rc}，将继续校验裸仓库与 ${REMOTE_TARGET_REMOTE}/main"
fi

read_upstream_main_on_remote() {
  ssh -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 \
      "${REMOTE_HOST}" \
      "git --git-dir '${REMOTE_REPO_PATH}' ls-remote '${REMOTE_TARGET_REMOTE}' 'refs/heads/${BRANCH}' 2>/dev/null | awk 'NR==1 {print \$1}'" \
      2>/dev/null || true
}

bundle_exists_on_remote() {
  ssh -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 \
      "${REMOTE_HOST}" \
      "test -f '${REMOTE_BUNDLE_FILE}'" >/dev/null 2>&1
}

failed_bundle_exists_on_remote() {
  ssh -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 \
      "${REMOTE_HOST}" \
      "test -f '${FAILED_BUNDLE_REMOTE_PATH}'" >/dev/null 2>&1
}

log "等待裸仓库 origin/${BRANCH} 与 ${REMOTE_TARGET_REMOTE}/${BRANCH} 对齐"
deadline=$(( $(date +%s) + SYNC_WAIT_MAX_SECS ))
last_status="等待 apply-bundle 完成"

while (( $(date +%s) < deadline )); do
  if failed_bundle_exists_on_remote; then
    fail "apply-bundle 已将 bundle 移入 failed，请检查 ${FAILED_BUNDLE_REMOTE_PATH} 与日志 ${REMOTE_LOG}"
  fi

  BARE_HEAD="$(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
    "${REMOTE_HOST}" "git --git-dir '${REMOTE_REPO_PATH}' rev-parse 'refs/heads/${BRANCH}' 2>/dev/null" 2>/dev/null || true)"
  UPSTREAM_HEAD="$(read_upstream_main_on_remote)"

  if [[ "${BARE_HEAD}" == "${HEAD_COMMIT}" && "${UPSTREAM_HEAD}" == "${HEAD_COMMIT}" ]]; then
    echo "${HEAD_COMMIT}" > "${LOCAL_SYNC_ID_FILE}"
    log "初始化同步完成，last_sync_id = ${HEAD_COMMIT}"
    exit 0
  fi

  if [[ "${BARE_HEAD}" == "${HEAD_COMMIT}" ]]; then
    if bundle_exists_on_remote; then
      last_status="裸仓库已更新，bundle 仍在处理中"
    else
      log "⚠️ PARTIAL: 裸仓库已更新为 ${HEAD_COMMIT}，但 ${REMOTE_TARGET_REMOTE}/${BRANCH} 为 ${UPSTREAM_HEAD:-<未确认>}"
      log "常见原因：GitHub 网络瞬时故障（Empty reply from server）"
      log "请在 ${REMOTE_HOST} 执行：git --git-dir ${REMOTE_REPO_PATH} push --force ${REMOTE_TARGET_REMOTE} ${BRANCH}"
      exit 2
    fi
  else
    last_status="等待裸仓库推进（当前=${BARE_HEAD:-?}，目标=${HEAD_COMMIT}）"
  fi

  sleep 2
done

fail "等待初始化同步超时（${SYNC_WAIT_MAX_SECS}s）。最后状态：${last_status}。请检查 ${REMOTE_HOST} 日志 ${REMOTE_LOG}"
