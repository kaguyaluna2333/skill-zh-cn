#!/usr/bin/env bash
# core/agent-translate.sh — 本宿主 agent 翻译的 apply 入口。
#
# 用法：echo '{"<id>":"<中文译文>",...}' | agent-translate.sh [--host X]
#
# 译文由调用者（本宿主 agent，用自身 LLM）翻译好，从 stdin pipe 进来（{id: zh}）。
# 本脚本只做：hosts 探测 → scan 出队列 → translate --provider=stdin 合并译文 → apply 写回。
# 即「装在谁身上，让谁的 agent 翻」——不 spawn 任何外部 CLI、不调 API。

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST=""
while [ "$#" -gt 0 ]; do case "$1" in
    --host) HOST="$2"; shift 2 ;;
    *) shift ;;
esac; done

# hosts 探测本宿主（--host 为空时自动探测）
resolved=$(node -e '
    const h = require(process.argv[1]).resolve({ host: process.argv[2] || null });
    process.stdout.write(h.userRoot + "\t" + h.pluginRoot + "\t" + h.cacheDir);
' "$SCRIPT_DIR/lib/hosts" "$HOST" 2>/dev/null) || { echo "[agent-translate] hosts 探测失败" >&2; exit 0; }

USER_ROOT="${resolved%%$'\t'*}"
rest="${resolved#*$'\t'}"
PLUGIN_ROOT_HOST="${rest%%$'\t'*}"   # 宿主的 plugin 根（非 skill-zh-cn 自身）
CACHE_DIR="${rest#*$'\t'}"

mkdir -p "$CACHE_DIR"
QUEUE="$CACHE_DIR/.queue.json"
APPLY="$CACHE_DIR/.apply.json"
CACHE_FILE="$CACHE_DIR/translations.json"

# 1. scan 出待译队列（不调 LLM）
node "$SCRIPT_DIR/scan.js" --user-root "$USER_ROOT" --plugin-root "$PLUGIN_ROOT_HOST" --cache "$CACHE_FILE" --output "$QUEUE" 2>/dev/null || true

# 2. translate --provider=stdin：stdin = agent 译文 {id:zh}，透传给 node（scan 不读 stdin）
node "$SCRIPT_DIR/translate.js" --queue "$QUEUE" --cache "$CACHE_FILE" --output "$APPLY" --provider stdin || true

# 3. apply 写回（行级 patch + 备份 + 标记）
node "$SCRIPT_DIR/apply.js" --apply "$APPLY" --user-root "$USER_ROOT" --plugin-root "$PLUGIN_ROOT_HOST" || true

rm -f "$QUEUE" "$APPLY" 2>/dev/null || true
