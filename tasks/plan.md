# Implementation Plan: skill-zh-cn

> 配套 `SPEC.md`。本文件 = 实现顺序与任务卡；`tasks/todo.md` = 可勾选清单。
>
> Phase 2 产出 · 2026-07-20 · 待人类审查

## Overview

把 claude-code-zh-cn 的 skill-i18n 抽成一个跨宿主汉化工具集：宿主无关内核（`core/`）+ 通用 CLI（`bin/skill-zh-cn`）+ 分层挂载（`adapters/`）。v1 支持 CC / zcode（plugin+hook 自动）、opencode / codex（CLI 手动）。

## Architecture Decisions

- **内核宿主无关**：CC skill 格式跨工具趋同（codex 实测兼容 frontmatter），collect 多根扫描 + frontmatter/metadata 解析对所有宿主通用
- **hosts.js profile 表**：每宿主一行探测规则，新增宿主只加一行
- **垂直切片**：每个任务端到端可验证（扫得动→探得准→CLI 跑得通→装得上→真生效），不做"先全 lib 再全脚本"的水平层
- **渐进挂载**：CC/zcode v1 自动 plugin，opencode/codex v1 手动 CLI + 可粘贴示例，原生挂载留 v2
- **零依赖**：纯 node CJS + `node:test`，无 package.json 运行时依赖

## Dependency Graph

```
T1 lib 四件套(移植) ─┐
                     ├─► T2 collect 多根 ─► T3 scan/translate/apply/restore ─┐
T4 hosts 探测 ──────────────────────────────────────────────────────────────┴─► T5 接入 hosts ─► T6 bin CLI
                                                                                                          │
                                                               ┌────────────────────────────────────────────┤
                                                               ▼                                            ▼
                                                          T7 CC/zcode plugin ─► T8 marketplace.json      T9 README + opencode/codex 文档
                                                               │                                            │
                                                               └─────────────────────► T10 真实验证 ◄───────┘
```

并行机会：T4（hosts）与 T1–T3（内核移植）相互独立，可并行；T9（文档）与 T7–T8（plugin）独立，可并行。

## Task List

### Phase 1: 内核基础（移植 + 多根化）

#### Task 1: 移植内核 lib 四件套
**Description**：从 claude-code-zh-cn 原样移植四个纯函数 lib 到 `core/lib/`，建立内核目录。
**Acceptance**：
- [ ] `frontmatter.js`：解析/提取 description、识别 `x-zh-cn-translated` 标记
- [ ] `metadata.js`：从 plugin.json/marketplace.json 提取 description 字段路径
- [ ] `cache.js`：按英文原文 hash 存取译文
- [ ] `cjk.js`：CJK 比例计算 + 阈值
**Verification**：`node -e "require('./core/lib/frontmatter')"` 等四个都能加载不报错；后续 T2/T5 测试覆盖行为
**Dependencies**：None
**Files**：`core/lib/frontmatter.js`, `core/lib/metadata.js`, `core/lib/cache.js`, `core/lib/cjk.js`
**Scope**：S（4 文件，原样移植）

#### Task 2: collect.js 多根化
**Description**：移植 collect.js，把 `collectAll(root)` 改为 `collectAll({userRoot, pluginRoot})`：userMarkdown 用 userRoot，plugin/marketplaces/metadata 用 pluginRoot。`walkAndCollect` 递归逻辑零改。
**Acceptance**：
- [ ] CC 单根（userRoot==pluginRoot==~/.claude）扫出 skills/commands/plugin metadata
- [ ] zcode 双根（userRoot=~/.zcode、pluginRoot=~/.zcode/cli）分别扫对
- [ ] 符号链接默认不跟随、防环逻辑保留
**Verification**：`node --test tests/collect.test.js` 绿（移植上游用例 + 新增双根用例）
**Dependencies**：T1
**Files**：`core/lib/collect.js`, `tests/collect.test.js`
**Scope**：M（2 文件，核心逻辑改动）

#### Task 3: scan/translate/apply/restore 移植 + 接多根
**Description**：移植 core 四脚本。scan.js 新增 `--user-root`/`--plugin-root`（保留 `--root` 作两者相同的快捷方式）；translate-skills.sh 编排时传双根；apply/restore 原样。
**Acceptance**：
- [ ] `node core/scan.js --user-root ~/.zcode --plugin-root ~/.zcode/cli --dry-run` 列出待译项
- [ ] `--root ~/.claude` 向后兼容仍工作
- [ ] translate/apply 跑通一条（`--limit 1` 或 mock）
**Verification**：对 zcode 跑 dry-run，确认列出 ~92 待译、跳过已汉化/原生中文
**Dependencies**：T2
**Files**：`core/scan.js`, `core/translate.js`, `core/apply.js`, `core/restore.js`, `core/translate-skills.sh`
**Scope**：M（5 文件）

### Checkpoint 1: 内核可用
- [ ] `node --test tests/` 已有测试绿
- [ ] 手动 dry-run 能扫 CC 单根 + zcode 双根
- [ ] **Review with human before proceeding**

### Phase 2: 宿主探测 + 通用 CLI

#### Task 4: hosts.js 宿主探测
**Description**：新增 `core/lib/hosts.js`，四宿主 profile 表（cc/zcode/opencode/codex）+ 探测链：`--host` > `--root` > `CLAUDE_PLUGIN_ROOT`/`OPENCODE_CONFIG_DIR` > 特征目录扫描 > fallback `~/.claude`。返回 `{host, userRoot, pluginRoot, cacheDir}`。
**Acceptance**：
- [ ] `resolve({host:'codex'})` → userRoot=pluginRoot=~/.codex，cacheDir=~/.codex/.skill-i18n-cache
- [ ] `resolve({host:'zcode'})` → userRoot=~/.zcode、pluginRoot=~/.zcode/cli
- [ ] 无参数自动探测命中本机已装宿主（zcode+codex+opencode 都在）
- [ ] `OPENCODE_CONFIG_DIR` 覆盖 opencode 根
**Verification**：`node --test tests/hosts.test.js` 绿（四宿主 + env 覆盖 + fallback）
**Dependencies**：None（与 T1–T3 独立，可并行）
**Files**：`core/lib/hosts.js`, `tests/hosts.test.js`
**Scope**：S（2 文件）

#### Task 5: scan/CLI 接入 hosts
**Description**：scan.js 和 translate-skills.sh 接入 hosts.js，支持 `--host <name>`：自动 resolve 双根 + cacheDir，按宿主落缓存。
**Acceptance**：
- [ ] `bash core/translate-skills.sh --host zcode --dry-run` 工作，cacheDir 落 ~/.zcode/.skill-i18n-cache
- [ ] `--host codex` / `--host opencode` 同理
**Verification**：四宿主 `--host X --dry-run` 都正确列出待译项
**Dependencies**：T3, T4
**Files**：`core/scan.js`, `core/translate-skills.sh`
**Scope**：S（2 文件）

#### Task 6: bin/skill-zh-cn 通用 CLI
**Description**：`bin/skill-zh-cn`（node 脚本，`chmod +x`），解析 `--host/--root/--dry-run/restore`，无参时自动探测宿主，调 core。
**Acceptance**：
- [ ] `./bin/skill-zh-cn --host codex --dry-run` 列出 codex 待译项
- [ ] `./bin/skill-zh-cn`（无参）自动探测本机宿主
- [ ] `./bin/skill-zh-cn restore --all` 还原
**Verification**：四宿主 `--dry-run` 正确；无参自动探测
**Dependencies**：T5
**Files**：`bin/skill-zh-cn`
**Scope**：S（1 文件）

### Checkpoint 2: CLI 可用（CP1）
- [ ] `node --test tests/` 全绿（含 hosts + collect 双根）
- [ ] `skill-zh-cn --host <cc|zcode|opencode|codex> --dry-run` 各自正确
- [ ] **Review with human before proceeding**

### Phase 3: CC/zcode plugin 挂载 + 发布

#### Task 7: CC/zcode plugin 挂载
**Description**：`adapters/claude-code/` 完整 plugin。移植上游 session-start 的 skill-i18n 段（去 cli-patch 几百行），env 前缀改 `SKILL_I18N_*`，调 core 自动探测 CC vs zcode。保留后台异步 + 25s 超时 + 防递归 `SKILL_I18N_HOOK=1`。
**Acceptance**：
- [ ] 目录结构是合法 CC plugin（plugin.json + hooks.json + session-start）
- [ ] session-start 后台异步调 core，不阻塞启动
- [ ] env 前缀 `SKILL_I18N_*`（不与上游 `ZH_CN_SKILL_I18N_*` 冲突）
**Verification**：在 CC 和 zcode 各 `/plugin install` 本地路径 + `SKILL_I18N_ENABLE=1`，SessionStart 触发翻译
**Dependencies**：T6
**Files**：`adapters/claude-code/.claude-plugin/plugin.json`, `adapters/claude-code/hooks/hooks.json`, `adapters/claude-code/hooks/session-start`
**Scope**：M（3 文件）

#### Task 8: marketplace.json 自包含
**Description**：根 `.claude-plugin/marketplace.json` 声明 skill-zh-cn，指向 `adapters/claude-code`。
**Acceptance**：
- [ ] `/plugin marketplace add kaguyaluna2333/skill-zh-cn` 识别成功
- [ ] `/plugin install skill-zh-cn@skill-zh-cn` 装上
**Verification**：CC/zcode 实跑 marketplace add + install
**Dependencies**：T7
**Files**：`.claude-plugin/marketplace.json`
**Scope**：S（1 文件）

### Checkpoint 3: plugin 可装可触发（CP2）
- [ ] CC/zcode `/plugin install` 成功
- [ ] `SKILL_I18N_ENABLE=1` 后 SessionStart 自动汉化
- [ ] **Review with human before proceeding**

### Phase 4: 文档 + 真实验证

#### Task 9: README + opencode/codex 文档
**Description**：README 写四宿主用法（CC/zcode 安装、opencode/codex CLI 用法）。`adapters/opencode/`、`adapters/codex/` 放可粘贴的 opencode JS plugin / codex config.toml hook 示例（v1 不内置，仅文档）。
**Acceptance**：
- [ ] README 清楚四宿主安装/使用路径
- [ ] opencode/codex 可粘贴示例能生效（用户粘到自己的 plugins/config 即可触发）
**Verification**：按 README 走 git clone + symlink + `skill-zh-cn --host codex`
**Dependencies**：T6
**Files**：`README.md`, `adapters/opencode/README.md`, `adapters/codex/README.md`
**Scope**：M（3 文件）

#### Task 10: 真实验证 + 收尾
**Description**：zcode 实测全流程；codex 跨工具复用验证；补 LICENSE（MIT，作者 kaguyaluna2333）。
**Acceptance**：
- [ ] zcode：92 英文 skill 翻译、45 已汉化不重复、baidu-search 等原生中文跳过、缓存正确
- [ ] `skill-zh-cn restore --all` 还原全部
- [ ] codex：`--host codex` 扫 ~/.codex/skills 并汉化（跨工具复用）
- [ ] LICENSE（MIT）到位
**Verification**：实跑 + 检查产物 frontmatter（description 中文 + description_en 备份 + 标记）
**Dependencies**：T8, T9
**Files**：`LICENSE`
**Scope**：S（1 文件）

### Checkpoint 4: 真实生效（CP3）
- [ ] SPEC 的 6 条 Success Criteria 全部达成
- [ ] 同装 claude-code-zh-cn + 本插件不重复汉化
- [ ] Ready for review / release

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| opencode 兼容性难验证（本地 skill 几乎空） | Med | 用 codex 做跨工具验证（有真 skill）；opencode 标注"需实环境验证"，靠格式趋同 + web 文档 |
| zcode SessionStart hook 不触发本插件 | Med | zcode 已跑 hindsight/ponytail 同机制 hook；T7 实测确认 |
| claude CLI 在非 CC 宿主未必可用作翻译引擎 | Low | 默认 auto，文档主推 openai/anthropic API；claude CLI 兜底 |

## Open Questions

无（Phase 1 全部 resolved）。v2 待定：opencode JS plugin / codex config.toml 原生挂载、npm 正式发布。
