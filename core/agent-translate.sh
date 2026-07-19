#!/usr/bin/env bash
# core/agent-translate.sh — 本宿主 agent 翻译入口（推荐路径）。
#
# 用法：
#   agent-translate.sh --dry-run                      只 scan，打印待译 [{id,en}]，不翻译不写盘
#   echo '{"<id>":"<zh>",...}' | agent-translate.sh [--host X]   应用 agent 译文（写回 skill 文件）
#
# 译文由本宿主 agent（自身 LLM）翻译后从 stdin pipe 进来。本脚本：hosts 探测 → scan → 合并 → apply。
# 不 spawn 任何外部 CLI、不调 API——「装在谁身上让谁的 agent 翻」，零外部依赖。
# 注意：不要用 translate-skills.sh 翻译（它走 spawn/API，会启动外部 CLI 子进程，慢且依赖其他工具）。

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST=""
DRY_RUN=0
while [ "$#" -gt 0 ]; do case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) shift ;;
esac; done

resolved=$(node -e '
    const h = require(process.argv[1]).resolve({ host: process.argv[2] || null });
    process.stdout.write(h.userRoot + "\t" + h.pluginRoot + "\t" + h.cacheDir);
' "$SCRIPT_DIR/lib/hosts" "$HOST" 2>/dev/null) || { echo "[agent-translate] hosts 探测失败" >&2; exit 0; }

USER_ROOT="${resolved%%$'\t'*}"
rest="${resolved#*$'\t'}"
PLUGIN_ROOT_HOST="${rest%%$'\t'*}"
CACHE_DIR="${rest#*$'\t'}"

mkdir -p "$CACHE_DIR"
QUEUE="$CACHE_DIR/.queue.json"
CACHE_FILE="$CACHE_DIR/translations.json"

# scan 出待译队列（不调 LLM）
node "$SCRIPT_DIR/scan.js" --user-root "$USER_ROOT" --plugin-root "$PLUGIN_ROOT_HOST" --cache "$CACHE_FILE" --output "$QUEUE" 2>/dev/null || true

if [ "$DRY_RUN" = "1" ]; then
    # 打印待译 id+en，供 agent 翻译
    node -e '
        const q = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        process.stdout.write(JSON.stringify(q.toTranslate.map(t => ({ id: t.id, en: t.en })), null, 2));
    ' "$QUEUE" 2>/dev/null
    exit 0
fi

# apply 模式：stdin = agent 译文 {id:zh}
APPLY="$CACHE_DIR/.apply.json"
node "$SCRIPT_DIR/translate.js" --queue "$QUEUE" --cache "$CACHE_FILE" --output "$APPLY" --provider stdin || true
node "$SCRIPT_DIR/apply.js" --apply "$APPLY" --user-root "$USER_ROOT" --plugin-root "$PLUGIN_ROOT_HOST" || true
rm -f "$QUEUE" "$APPLY" 2>/dev/null || true
