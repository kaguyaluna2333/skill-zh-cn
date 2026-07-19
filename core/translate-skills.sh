#!/usr/bin/env bash
# core/translate-skills.sh — Skill/插件命令说明汉化流水线入口。
# 被 session-start hook（adapters/claude-code）后台调用；也可手动
#   bash core/translate-skills.sh --host <name> | --user-root X --plugin-root Y | --root X
# 流程：scan（解析+对比缓存）→ translate（调 LLM）→ apply（写回 frontmatter）
# 设计：单步失败不中断（翻译失败绝不写坏源文件）。
#
# env 前缀 SKILL_I18N_*（独立于 claude-code-zh-cn 的 ZH_CN_SKILL_I18N_*，避免同装冲突）。
# 注：--host 自动探测在 T5（hosts.js）接入；本脚本先认 --user-root/--plugin-root/--root。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE_DIR="${SKILL_I18N_CACHE_DIR:-$HOME/.claude/.skill-i18n-cache}"
# SKILL_I18N_ROOT 作双根相同的快捷（CC 式单根）
USER_ROOT="${SKILL_I18N_USER_ROOT:-${SKILL_I18N_ROOT:-}}"
PLUGIN_ROOT="${SKILL_I18N_PLUGIN_ROOT:-${SKILL_I18N_ROOT:-}}"
DRY_RUN=0
PROVIDER="${SKILL_I18N_PROVIDER:-auto}"
HOST=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        --user-root|--scan-user-root) USER_ROOT="$2"; shift 2 ;;
        --plugin-root|--scan-plugin-root) PLUGIN_ROOT="$2"; shift 2 ;;
        --root|--scan-root) USER_ROOT="$2"; PLUGIN_ROOT="$2"; shift 2 ;;
        --host) HOST="$2"; shift 2 ;;
        --cache-dir) CACHE_DIR="$2"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        --provider) PROVIDER="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# --host：调 core/lib/hosts.js 解析该宿主的 userRoot/pluginRoot/cacheDir（覆盖 env 与 --root）
if [ -n "$HOST" ]; then
    resolved=$(node -e '
        const h = require(process.argv[1]).resolve({ host: process.argv[2] });
        process.stdout.write(h.userRoot + "\t" + h.pluginRoot + "\t" + h.cacheDir);
    ' "$SCRIPT_DIR/lib/hosts" "$HOST" 2>/dev/null) || true
    if [ -n "$resolved" ]; then
        USER_ROOT="${resolved%%$'\t'*}"
        rest="${resolved#*$'\t'}"
        PLUGIN_ROOT="${rest%%$'\t'*}"
        CACHE_DIR="${rest#*$'\t'*}"
    fi
fi

# 无 --host 且无显式根：hosts 自动探测（hook 场景靠 CLAUDE_PLUGIN_ROOT 反推 CC/zcode）
if [ -z "$HOST" ] && [ -z "$USER_ROOT" ] && [ -z "$PLUGIN_ROOT" ]; then
    resolved=$(node -e '
        const h = require(process.argv[1]).resolve({});
        process.stdout.write(h.userRoot + "\t" + h.pluginRoot + "\t" + h.cacheDir);
    ' "$SCRIPT_DIR/lib/hosts" 2>/dev/null) || true
    if [ -n "$resolved" ]; then
        USER_ROOT="${resolved%%$'\t'*}"
        rest="${resolved#*$'\t'}"
        PLUGIN_ROOT="${rest%%$'\t'*}"
        CACHE_DIR="${rest#*$'\t'*}"
    fi
fi

# 最终兜底：探测失败 → CC 式 ~/.claude
if [ -z "$USER_ROOT" ]; then USER_ROOT="$HOME/.claude"; fi
if [ -z "$PLUGIN_ROOT" ]; then PLUGIN_ROOT="$HOME/.claude"; fi

mkdir -p "$CACHE_DIR"
CACHE_FILE="$CACHE_DIR/translations.json"
QUEUE_FILE="$CACHE_DIR/.queue.$$.json"
APPLY_FILE="$CACHE_DIR/.apply.$$.json"

# 1. 扫描
node "$SCRIPT_DIR/scan.js" \
    --user-root "$USER_ROOT" \
    --plugin-root "$PLUGIN_ROOT" \
    --cache "$CACHE_FILE" \
    --output "$QUEUE_FILE" \
    --print ${SKILL_I18N_LIMIT:+--limit "$SKILL_I18N_LIMIT"} ${SKILL_I18N_INCLUDE_MARKETPLACES:+--include-marketplaces} || true

# dry-run：只看队列，不翻译不写回
if [ "$DRY_RUN" = "1" ]; then
    rm -f "$QUEUE_FILE" 2>/dev/null || true
    exit 0
fi

# 2. 翻译（读队列+缓存，写缓存，输出应用清单）
#    API key 经环境变量传递（SKILL_I18N_API_KEY），不经 argv，避免泄露到进程列表
export SKILL_I18N_API_KEY="${SKILL_I18N_API_KEY:-}"
node "$SCRIPT_DIR/translate.js" \
    --queue "$QUEUE_FILE" \
    --cache "$CACHE_FILE" \
    --output "$APPLY_FILE" \
    --provider "$PROVIDER" \
    ${SKILL_I18N_BASE_URL:+--base-url "$SKILL_I18N_BASE_URL"} \
    ${SKILL_I18N_MODEL:+--model "$SKILL_I18N_MODEL"} \
    || true

# 3. 写回（传双根做路径边界校验）
node "$SCRIPT_DIR/apply.js" \
    --apply "$APPLY_FILE" \
    --user-root "$USER_ROOT" \
    --plugin-root "$PLUGIN_ROOT" \
    || true

rm -f "$QUEUE_FILE" "$APPLY_FILE" 2>/dev/null || true
