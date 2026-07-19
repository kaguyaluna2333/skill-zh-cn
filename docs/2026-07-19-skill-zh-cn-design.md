# skill-zh-cn 通用插件设计

- **日期**：2026-07-19
- **状态**：设计已确认，待实现计划
- **作者**：kaguya + Claude（brainstorming）

## 背景与动机

此前在 `claude-code-zh-cn` 插件里实现了一条「skill / 插件命令说明汉化」管道（`plugin/skill-i18n/`），把 `/` 命令列表、`/skill` 列表、`/plugin` 管理界面里显示的功能描述翻译成简体中文。该管道与 claude-code-zh-cn 的核心（cli.js patch）相互独立，本身与宿主无关。

现在要把这个能力**抽成独立插件**，专门用于汉化 **zcode**（Claude Code 的国产化 fork）下的 skill 说明，同时让它也能在 CC 上用——一份代码，两边受益。

## 现状分析

### claude-code-zh-cn 的 skill-i18n 机制（移植来源）

三阶段纯 node 流水线，零外部依赖：

- `translate-skills.sh`：编排 `scan.js` → `translate.js` → `apply.js`
- `scan.js`：调用 `lib/collect.js` 递归收集，解析 frontmatter/JSON，与缓存对比，输出待翻译队列
- `translate.js`：调 LLM（claude CLI / openai / anthropic），读队列写缓存，输出应用清单
- `apply.js`：行级 patch 写回（只改 description 行 + 追加备份/标记），写前 `verifyRewriteSafe`
- `lib/collect.js`：递归找 `SKILL.md` 与 `commands/` 目录，**已是通用递归设计**，仅假设所有来源在同一 `root` 下
- `restore.js`：一键还原
- 6 个测试覆盖（metadata / providers / frontmatter / cache / cjk / collect）

可逆性：md→`description_en`、JSON→`_description_en`、标记 `x-zh-cn-translated`/`_zh_cn_translated`，缓存按英文原文 hash（`~/.claude/.skill-i18n-cache/translations.json`）。

### zcode 兼容性

zcode 是 Claude Code 的国产化 fork，**完全兼容 CC 的 plugin + hook 生态**：

- `~/.zcode/cli/plugins/` 有标准的 `installed_plugins.json` / `known_marketplaces.json` / `cache` / `data`
- zcode 已直接跑 hindsight、ponytail、superpowers 等 CC 插件
- SessionStart / UserPromptSubmit hook 格式与 CC 逐字一致
- 用 `CLAUDE_CONFIG_DIR="$HOME/.zcode/cli"` 复用 CC 生态

→ 给 zcode 写插件和给 CC 写插件是同一套机制。

### 目录布局差异（通用化的唯一实质难点）

| 内容 | CC 位置 | zcode 位置 |
|---|---|---|
| user skill | `~/.claude/skills` | `~/.zcode/skills` |
| user command | `~/.claude/commands` | `~/.zcode/commands` |
| agent | `~/.claude/agents` | `~/.zcode/agents` |
| plugin cache | `~/.claude/plugins/cache` | `~/.zcode/cli/plugins/cache` |
| marketplaces | `~/.claude/plugins/marketplaces` | `~/.zcode/cli/plugins/marketplaces` |

CC 是**单根**（一切在 `~/.claude`）；zcode 是**双根**（user 内容在 `~/.zcode`、plugin 在 `~/.zcode/cli`）。

### zcode skill 汉化现状（2026-07-19 实测）

- skill 目录总数：137
- 已汉化（含 `x-zh-cn-translated` 标记）：45（其中 `addy-*` 等是 skill-i18n 产物）
- 未汉化：92
- 另有 `baidu-search`、`obsidian-cli` 等为原生中文 description（无标记，CJK 比例检测会自动跳过）

## 目标 / 非目标

**目标**：

1. 独立插件 `skill-zh-cn`，CC 和 zcode 都能 `/plugin install`
2. 自动探测宿主，汉化各自宿主下的 skill / command / 插件元数据 description
3. 复用 claude-code-zh-cn skill-i18n 的成熟代码与可靠性设计

**非目标（YAGNI）**：

- CLI 界面 patch（claude-code-zh-cn 核心范畴，与 skill 无关）
- 新增 slash command（手动 `bash translate-skills.sh` 已够用）
- 中文之外的语言

## 架构

```
skill-zh-cn/
├─ .claude-plugin/
│  └─ plugin.json                # 插件清单（name, version, description）
├─ hooks/
│  └─ hooks.json                 # 注册 SessionStart hook
├─ session-start                 # 入口（移植自 claude-code-zh-cn，去掉 cli-patch 相关）
├─ skill-i18n/                   # 移植自 claude-code-zh-cn/plugin/skill-i18n/
│  ├─ translate-skills.sh        # scan→translate→apply 编排（微调：传双根）
│  ├─ scan.js                    # --root → --user-root + --plugin-root（保留 --root 兼容）
│  ├─ translate.js               # 原样复用
│  ├─ apply.js                   # 原样复用
│  ├─ restore.js                 # 原样复用
│  └─ lib/
│     ├─ collect.js              # 【唯一实质改动】单根 → 双根
│     ├─ roots.js                # 【新增】宿主自动探测，产出 {userRoot, pluginRoot}
│     ├─ cache.js                # 原样复用
│     ├─ frontmatter.js          # 原样复用
│     ├─ metadata.js             # 原样复用
│     └─ cjk.js                  # 原样复用
├─ tests/
│  └─ skill-i18n-collect.test.js # 移植 + 扩展双根用例
├─ marketplace.json              # 发布到 marketplace 用
└─ README.md
```

## 宿主自动探测（核心机制，新增 `lib/roots.js`）

插件装在哪边，就汉化哪边——天然分离，无需探测宿主"品牌"。

hook 触发时环境有 `CLAUDE_PLUGIN_ROOT`（CC 指向 `~/.claude/plugins/cache/...`，zcode 指向 `~/.zcode/cli/plugins/cache/...`）。按优先级推导两棵树：

```
1. env 显式覆盖：SKILL_I18N_USER_ROOT / SKILL_I18N_PLUGIN_ROOT
2. 从 CLAUDE_PLUGIN_ROOT 推导：
   pluginRoot = 该路径里 "plugins/cache" 的祖先目录
     CC:     ~/.claude          （plugins 直接在下）
     zcode:  ~/.zcode/cli       （plugins 直接在下）
   userRoot  = <pluginRoot>/skills 存在 → pluginRoot（CC）
             否则                → dirname(pluginRoot)（zcode：~/.zcode/cli → ~/.zcode）
3. fallback ~/.claude
```

两边都已验证成立：
- CC：`~/.claude/skills` 存在 → userRoot = pluginRoot = `~/.claude`
- zcode：`~/.zcode/cli/skills` 不存在、`~/.zcode/skills` 存在 → userRoot = `~/.zcode`、pluginRoot = `~/.zcode/cli`

## 核心代码改动

### `lib/collect.js`（双根化）

```js
// 旧：collectAll(root, followSymlinks)
// 新：collectAll({ userRoot, pluginRoot }, followSymlinks)
function collectAll({ userRoot, pluginRoot }, followSymlinks) {
  return [
    ...collectUserMarkdown(userRoot, followSymlinks),      // skills / commands
    ...collectPluginMarkdown(pluginRoot, followSymlinks),  // plugins/cache/*/*/*
    ...collectMarketplaces(pluginRoot, followSymlinks),    // plugins/marketplaces/*
    ...collectMetadata(pluginRoot),                        // plugin.json / marketplace.json
  ];
}
```

`walkAndCollect` 递归逻辑零改动——它本就是"找任意 SKILL.md / commands 目录"。

### `scan.js`（参数化双根）

- 新增 `--user-root` / `--plugin-root`
- 保留 `--root`（= 两者相同，向后兼容手动单根调用，如 `--root ~/.claude`）
- 启动时若未显式给根，调用 `lib/roots.js` 自动探测

### `lib/roots.js`（新增）

实现上面的探测优先级链，导出 `resolveRoots(env)` → `{ userRoot, pluginRoot }`。

## 触发方式

1. **SessionStart hook**（后台异步、默认禁用、25s 超时、防递归 `SKILL_I18N_HOOK=1`）——原样移植 claude-code-zh-cn session-start 末尾那段，去掉 cli-patch 的几百行
2. **手动**：`bash skill-i18n/translate-skills.sh --user-root ~/.zcode --plugin-root ~/.zcode/cli`（或 `--root ~/.claude`）

## 配置（独立 env 前缀）

claude-code-zh-cn 用 `ZH_CN_SKILL_I18N_*`；本插件用 **`SKILL_I18N_*`**，避免两边同装时双双触发重复汉化。

| 变量 | 默认 | 说明 |
|---|---|---|
| `SKILL_I18N_ENABLE` | `0` | `1` 才启用 |
| `SKILL_I18N_PROVIDER` | `auto` | `auto` / `claude` / `openai` / `anthropic` |
| `SKILL_I18N_API_KEY` | 空 | openai/anthropic key（经环境变量传递，不进 argv） |
| `SKILL_I18N_BASE_URL` | provider 默认 | 兼容端点 |
| `SKILL_I18N_MODEL` | 空 | 模型名 |
| `SKILL_I18N_USER_ROOT` | 自动探测 | 显式覆盖 user 根 |
| `SKILL_I18N_PLUGIN_ROOT` | 自动探测 | 显式覆盖 plugin 根 |
| `SKILL_I18N_FOLLOW_SYMLINKS` | `0` | 跟随符号链接 |
| `SKILL_I18N_TIMEOUT` | `25` | hook 后台超时秒 |
| `SKILL_I18N_LIMIT` | `0` | 限制待翻译条数（调试用） |
| `SKILL_I18N_CACHE_DIR` | 宿主相关 | CC=`~/.claude/.skill-i18n-cache`，zcode=`~/.zcode/.skill-i18n-cache` |

## 与 claude-code-zh-cn 的关系

**保留不删**（已确认）。新插件代码源自 claude-code-zh-cn 的 skill-i18n，参数化双根 + 独立 env 前缀。claude-code-zh-cn 里的 skill-i18n 保留不动（默认禁用、有存量用户）。

代价：短期两份代码。未来可在 claude-code-zh-cn 把 skill-i18n 标 deprecated 指向本插件，统一为单一数据源。

## 可逆性 / 可靠性（全部复用）

- 行级 patch（只改 description 行 + 追加备份/标记，正文不变）
- `description_en` / `_description_en` 备份 + `x-zh-cn-translated` 标记
- 按英文原文 hash 缓存（插件 update 覆盖后下次启动自动重应用，不重复调 LLM）
- 写前 `verifyRewriteSafe`
- 翻译失败不写回，源文件永不损坏
- 占位符 `${...}` 校验，丢失则拒绝译文
- `restore.js --all` 一键还原

## 交付与验证

### 测试

- 移植 `tests/skill-i18n-collect.test.js`，扩展双根用例：CC 单根、zcode 双根、env 覆盖、fallback
- collect 双根化是唯一实质逻辑改动，留一个可跑的 node 自检（`node tests/...` 或 `__main__` 式 assert）

### 真实验证

装到 zcode，`SKILL_I18N_ENABLE=1` 跑一轮，确认：

1. 92 个英文 skill 被翻译
2. 45 个已汉化（有标记）的不重复翻译
3. `baidu-search` 等原生中文 description 被 CJK 比例检测跳过
4. 缓存正确写入 `~/.zcode/.skill-i18n-cache/`
5. `restore.js --all` 能还原

### 发布

`marketplace.json` + tag + GitHub release，zcode 里 `/plugin marketplace add <repo>` + `/plugin install skill-zh-cn@<marketplace>`。

## 决策记录

- **插件名 `skill-zh-cn`**：与项目目录一致，语义清晰；当前只做中文，YAGNI
- **claude-code-zh-cn 的 skill-i18n 保留不删**：最安全，避免影响存量用户；短期双份代码

## 未来债（ponytail 标记）

- `# ponytail: skill-i18n 代码短期内与 claude-code-zh-cn 双份维护；统一时机：claude-code-zh-cn 标 deprecated 指向本插件`
