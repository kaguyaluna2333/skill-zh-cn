---
description: 汉化本宿主的 skill/命令说明——用你自己的翻译能力，无需外部 API
---

# 汉化本宿主的 skill 说明

把**本宿主**（你当前所在的工具：CC / zcode / opencode / codex）的 skill / 命令英文 `description` 翻译成简体中文。

**由你（本宿主 agent）翻译**——这正是"装在谁身上就让谁翻译"。不调外部 API、不启动别的工具的 CLI。

## 步骤

### 1. 扫描待译项

```bash
bash "$PLUGIN_ROOT/core/translate-skills.sh" --dry-run
```

`$PLUGIN_ROOT` = skill-zh-cn 插件根（CC/zcode 装时是 `${CLAUDE_PLUGIN_ROOT}`；git clone 时是 clone 目录）。若不确定，先 `echo "$CLAUDE_PLUGIN_ROOT"`。

输出会列出 `[译] <英文描述>` 的待译项。

### 2. 取待译队列（id + en）

```bash
cat "$CACHE_DIR/.queue.json"
```

`$CACHE_DIR`（本宿主的缓存目录，由 hosts 探测）：

| 宿主 | cacheDir |
|---|---|
| CC | `~/.claude/.skill-i18n-cache` |
| zcode | `~/.zcode/.skill-i18n-cache` |
| opencode | `$OPENCODE_CONFIG_DIR/.skill-i18n-cache`（默认 `~/.config/opencode/.skill-i18n-cache`）|
| codex | `~/.codex/.skill-i18n-cache` |

读 `toTranslate` 数组，每项有 `id`（hash）和 `en`（英文原文）。

### 3. 翻译（你来做）

对每项的 `en` 翻译成简体中文。规则：

- **保持不变**：`${...}`、`$ARGUMENTS`、`$1`、`/foo` 这类 slash 命令名、`API`/`PR`/`git`/`npm`/`React`/`TypeScript` 等术语、文件路径、URL
- **简洁**（菜单显示用），保留原意和句式
- 已是中文或纯占位符的，译文 = 原文

### 4. 生成译文 JSON 写盘

构造 `{ "<id>": "<中文译文>" }`，写到 `$CACHE_DIR/.translate-out.json`。

### 5. 应用（写回 skill 文件）

```bash
cat "$CACHE_DIR/.translate-out.json" | bash "$PLUGIN_ROOT/core/agent-translate.sh"
```

它自动：探测本宿主 → scan 出队列 → 合并你的译文 → 行级 patch 写回（原文备份到 `description_en` + 加 `x-zh-cn-translated` 标记，正文不动）。

## 完成后

报告：翻译 N 条，跳过 M 条（占位符不一致/异常过长会跳过，不损坏源文件）。已翻译的项下次扫描会被标记跳过，不重复翻译。

还原英文：`bash "$PLUGIN_ROOT/core/restore.js" --all`（或 `--user-root X --plugin-root Y`）。
