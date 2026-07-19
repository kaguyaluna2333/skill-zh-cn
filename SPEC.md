# Spec: skill-zh-cn

> 跨宿主 skill / 命令说明汉化工具集。一个宿主无关内核 + 通用 CLI + 各宿主挂载层。
>
> 状态：Phase 1 Specify（待人类审查）　·　日期：2026-07-20　·　仓库：kaguyaluna2333/skill-zh-cn（Private）

## Objective

把 AI 编程工具里显示给人看的 skill / command / 插件元数据 `description` 翻译成简体中文。

**为什么**：CC 的 skill 格式（`SKILL.md` + frontmatter）正在跨工具趋同——codex 装了一堆和 CC 同名的 skill（`skill-creator`、`agent-team-orchestration`…），opencode/codex/zcode 都有 `skills/` 目录且 frontmatter 兼容。一个汉化内核就能服务所有这些工具，不必每个工具各写一套。

**用户**：用 CC / zcode / opencode / codex 等工具、希望 `/` 命令列表和 skill 描述显示中文的开发者。

**成功长什么样**：装一次（或跑一条 CLI），四个工具的英文 skill 描述都变中文；已汉化的不重复翻译；可一键还原英文。

### 验收（reframed 自「汉化 zcode 等 skill 说明」）

- 四宿主（CC / zcode / opencode / codex）的英文 description 都能被翻译
- 已汉化（`x-zh-cn-translated` 标记或 CJK 比例高）的条目自动跳过，不重复耗 token
- 翻译失败绝不损坏源文件；`restore` 能还原全部
- CC / zcode 装上 plugin 即自动增量；opencode / codex 一条 CLI 命令搞定

## Tech Stack

- **Node.js ≥ 18**（CommonJS / `require`）
- **零运行时依赖**——只用 `node:` 内置（`fs`/`path`/`https`/`child_process`/`crypto`）
- **测试**：`node:test` + `node:assert/strict`（零依赖，同上游）
- **翻译引擎**（可选）：`claude` CLI / OpenAI 兼容 / Anthropic 兼容
- **无 build 步骤**——纯脚本

## Commands

```bash
# 测试（零依赖）
node --test tests/

# 通用 CLI —— 自动探测宿主
skill-zh-cn                          # 自动探测，扫描该宿主 skill
skill-zh-cn --host zcode             # 显式指定宿主
skill-zh-cn --host codex --dry-run   # 只看待翻译，不写盘
skill-zh-cn --root ~/.codex          # 任意根（绕过 profile）
skill-zh-cn restore --all            # 还原全部译文

# CC / zcode plugin 安装（各自宿主内）
/plugin marketplace add kaguyaluna2333/skill-zh-cn
/plugin install skill-zh-cn@skill-zh-cn

# 开启自动汉化（CC/zcode plugin 的 SessionStart hook）
#   settings.json env: SKILL_I18N_ENABLE=1
```

## Project Structure

```
skill-zh-cn/
├─ core/                       # 宿主无关内核（移植自 claude-code-zh-cn skill-i18n 并演进）
│  ├─ translate-skills.sh      # scan→translate→apply 编排（支持 --host/--user-root/--plugin-root）
│  ├─ scan.js                  # 扫描+解析+对比缓存，输出待翻译队列
│  ├─ translate.js             # 调 LLM（claude/openai/anthropic），读队列写缓存
│  ├─ apply.js                 # 行级 patch 写回（写前 verifyRewriteSafe）
│  ├─ restore.js               # 一键还原
│  └─ lib/
│     ├─ collect.js            # 多根递归扫描（SKILL.md / commands/*.md / 插件元数据 JSON）
│     ├─ hosts.js              # 【新】宿主 profile 表 + 自动探测 → {userRoot, pluginRoot, cacheDir}
│     ├─ frontmatter.js        # frontmatter 手写解析（移植）
│     ├─ metadata.js           # plugin.json/marketplace.json 解析（移植）
│     ├─ cache.js              # 按英文原文 hash 缓存（移植）
│     └─ cjk.js                # CJK 比例检测（移植）
├─ bin/skill-zh-cn             # 通用 CLI 入口（探测宿主 → 调 core）
├─ adapters/
│  ├─ claude-code/             # CC + zcode plugin（v1 完整自动挂载）
│  │  ├─ .claude-plugin/plugin.json
│  │  ├─ hooks.json            # SessionStart hook
│  │  └─ session-start         # 调 core（自动探测 CC vs zcode）
│  ├─ opencode/                # v1: README 给 JS plugin 可粘贴示例（不内置）
│  └─ codex/                   # v1: README 给 config.toml hook 可粘贴示例（不内置）
├─ tests/                      # node:test（移植 collect 测试 + 扩展 hosts/多根）
├─ .claude-plugin/marketplace.json   # CC/zcode marketplace 声明（仓库自包含，指向 adapters/claude-code）
├─ SPEC.md                     # 本文件（唯一 spec）
└─ README.md
```

### 宿主 profile（`core/lib/hosts.js` 的核心数据）

| host | 探测特征 | userRoot | pluginRoot | cacheDir |
|---|---|---|---|---|
| `cc` | `~/.claude/` 存在 | `~/.claude` | `~/.claude` | `~/.claude/.skill-i18n-cache` |
| `zcode` | `~/.zcode/` 存在 | `~/.zcode` | `~/.zcode/cli` | `~/.zcode/.skill-i18n-cache` |
| `opencode` | `$OPENCODE_CONFIG_DIR` 或 `~/.config/opencode/` | configDir | configDir | `configDir/.skill-i18n-cache` |
| `codex` | `~/.codex/` 存在 | `~/.codex` | `~/.codex` | `~/.codex/.skill-i18n-cache` |

探测优先级：`--host` 显式 > `--root` 显式 > `CLAUDE_PLUGIN_ROOT`/`OPENCODE_CONFIG_DIR` 等环境线索 > 各宿主特征目录扫描 > fallback `~/.claude`。

## Code Style

纯 node CJS、零依赖、`node:` 前缀、中文注释、小函数。一段真实片段胜过三段描述——`hosts.js` 与 `collect.js` 多根签名即风格范例：

```js
// core/lib/hosts.js —— 宿主 profile 表 + 自动探测
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HOME = os.homedir();

// 每个宿主：探测函数 + 路径规则。新增宿主只加一行。
const HOSTS = {
  cc:       { detect: () => dirExists(`${HOME}/.claude`),                   userRoot: `${HOME}/.claude`,            pluginRoot: `${HOME}/.claude` },
  zcode:    { detect: () => dirExists(`${HOME}/.zcode`),                    userRoot: `${HOME}/.zcode`,             pluginRoot: `${HOME}/.zcode/cli` },
  opencode: { detect: () => dirExists(process.env.OPENCODE_CONFIG_DIR || `${HOME}/.config/opencode`),
              userRoot: () => process.env.OPENCODE_CONFIG_DIR || `${HOME}/.config/opencode` },
  codex:    { detect: () => dirExists(`${HOME}/.codex`),                    userRoot: `${HOME}/.codex`,            pluginRoot: `${HOME}/.codex` },
};

function dirExists(p) { try { return fs.existsSync(p) && fs.statSync(p).isDirectory(); } catch { return false; } }

// 探测：返回 { host, userRoot, pluginRoot, cacheDir }
function resolve({ host, userRoot, pluginRoot } = {}) {
  // ...env 显式 > CLAUDE_PLUGIN_ROOT/OPENCODE_CONFIG_DIR > 特征扫描 > fallback cc
}
module.exports = { HOSTS, resolve };
```

```js
// core/lib/collect.js —— 多根扫描（从上游单根演进）
function collectAll({ userRoot, pluginRoot }, followSymlinks) {
  return [
    ...collectUserMarkdown(userRoot, followSymlinks),      // skills / commands
    ...collectPluginMarkdown(pluginRoot, followSymlinks),  // plugins/cache/*/*/*
    ...collectMarketplaces(pluginRoot, followSymlinks),    // plugins/marketplaces/*
    ...collectMetadata(pluginRoot),                        // plugin.json / marketplace.json
  ];
}
```

约定：
- frontmatter 行级 patch（只改 `description` 行 + 追加备份/标记，正文不动，绝不重序列化）
- 失败绝不写回；占位符 `${...}` 校验，丢失则拒译
- 中文注释；技术术语保留英文（hook、plugin、frontmatter 不翻译）

## Testing Strategy

- **框架**：`node:test` + `node:assert/strict`，`node --test tests/` 运行，零依赖
- **位置**：`tests/`，镜像 `core/lib/*` 命名（`collect.test.js`、`hosts.test.js`…）
- **必覆盖**：
  - `hosts.test.js`：四宿主探测（CC/zcode/opencode/codex 特征命中 + env 覆盖 + fallback）
  - `collect.test.js`：移植上游 + 扩展**双根**用例（CC 单根、zcode 双根、多根混合、符号链接防环）
  - `frontmatter.test.js` / `metadata.test.js` / `cache.test.js` / `cjk.test.js`：移植上游
- **覆盖预期**：内核逻辑（collect/hosts/frontmatter/metadata）必须有测试；translate 的 LLM 调用用 mock/`--limit 0` 跳过真实调用
- **可跑自检**：`node --test tests/` 一条命令全绿才能提交

## Boundaries

**Always do（铁律）**
- 改 `collect.js` / `hosts.js` 前先跑 `node --test tests/`，绿了才提交
- 翻译失败绝不写回源文件（上游铁律）
- 每次翻译备份原文（`description_en` / `_description_en`）+ 标记 `x-zh-cn-translated`
- 写前 `verifyRewriteSafe`；占位符 `${...}` 校验
- 新增宿主必须同时加 profile + 探测测试

**Ask first（先问）**
- 改 frontmatter / 备份字段格式约定（影响兼容性）
- 加新翻译 provider
- 改 env 前缀 `SKILL_I18N_*`
- 动 claude-code-zh-cn 上游（它是独立项目，有存量用户）
- v2 才做：opencode JS plugin / codex config.toml 原生挂载
- 引入任何运行时依赖（破坏零依赖）

**Never do（绝不）**
- 删除或绕过 `description_en` 备份机制
- 翻译丢失 `${...}` 占位符的译文还写回
- 提交 `.skill-i18n-cache/`、API key、`auth.json` 等敏感文件
- 重新序列化整个 frontmatter（必须行级 patch）

## Success Criteria（具体、可测）

1. `node --test tests/` 全绿，含四宿主探测 + collect 多根用例
2. `skill-zh-cn --host <cc|zcode|opencode|codex> --dry-run` 各自正确识别根并列出待翻译项
3. CC/zcode：`/plugin install` 后 `SKILL_I18N_ENABLE=1`，SessionStart 自动汉化
4. **zcode 实测**：137 skill 中 92 个英文被翻译，45 个已汉化不重复，`baidu-search` 等原生中文被跳过；缓存写 `~/.zcode/.skill-i18n-cache/`；`restore --all` 还原
5. **codex 实测**：`skill-zh-cn --host codex` 扫 `~/.codex/skills/` 并汉化（证明跨工具内核复用）
6. 同时装 claude-code-zh-cn（`ZH_CN_SKILL_I18N_ENABLE=1`）和本插件（`SKILL_I18N_ENABLE=1`）不重复汉化（env 前缀隔离）

## Decisions（决策记录）

- **多宿主工具集**（非单一 plugin）：CC skill 格式跨工具趋同，内核可复用 → 一个内核服务四工具
- **渐进式挂载**（v1）：CC/zcode 完整 plugin+hook（自动）；opencode/codex 用 CLI 手动/定时，README 给可粘贴示例但不内置 → v2 按需加原生挂载（YAGNI）
- **作者原创**：skill-i18n 代码由本仓库作者编写并提 PR 合入 claude-code-zh-cn，现抽成独立通用项目；上游那份保留不删（默认禁用、有存量用户）；短期双份，未来可统一
- **汉化范围**：skill / command / 插件元数据 description；**不含 agents**（codex agent 是 toml、opencode agent 格式未稳，且原诉求是「Skill 说明」）
- **env 前缀 `SKILL_I18N_*`**（去 `ZH_CN_`），避免与上游 `ZH_CN_SKILL_I18N_*` 冲突导致重复汉化
- **插件名 `skill-zh-cn`**：与项目目录一致；当前只做中文
- **发布渠道**：CC/zcode 新建**独立 marketplace**（仓库根 `.claude-plugin/marketplace.json` 自包含，不碰 claude-code-zh-cn）；opencode/codex **v1 git clone + symlink**，**v1.1 发 npm**

## Resolved（原 Open Questions）

1. **发布渠道**：CC/zcode **新建独立 marketplace**（仓库根 `.claude-plugin/marketplace.json` 自包含，不碰 claude-code-zh-cn）；opencode/codex **v1 git clone + symlink**，**v1.1 发 npm**
2. **opencode/codex 原生挂载**：留 **v2**（渐进式，v1 先验证 CLI 跨工具能用）
3. **CLI 分发**：**v1 git clone，v1.1 npm**（同 #1）

## Ponytail 债务标记

- `# ponytail: skill-i18n 内核短期内与 claude-code-zh-cn 双份维护；统一时机=上游标 deprecated 指向本仓库`
- `# ponytail: opencode/codex v1 只给可粘贴示例不做原生挂载；升级路径=各加一个 adapter（opencode JS plugin / codex config.toml hook）`
