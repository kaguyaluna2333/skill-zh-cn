<h1 align="center">skill-zh-cn</h1>

<p align="center">
  <strong>跨宿主的 skill / 命令 / 子智能体说明汉化工具</strong><br/>
  <em>装在谁身上，就让谁的 agent 翻 —— 不依赖外部 CLI，也无需 API key</em>
</p>

<p align="center">
  <a href="#快速开始"><img src="https://img.shields.io/badge/快速开始-开始使用-3B82F6?style=for-the-badge" alt="快速开始"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3B82F6?style=for-the-badge" alt="License"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-D97757?style=flat-square&logo=claude&logoColor=white" alt="Claude Code"/>
  <img src="https://img.shields.io/badge/zcode-6E56CF?style=flat-square" alt="zcode"/>
  <img src="https://img.shields.io/badge/opencode-000000?style=flat-square" alt="opencode"/>
  <img src="https://img.shields.io/badge/Codex-412991?style=flat-square&logo=openai&logoColor=white" alt="Codex"/>
  <img src="https://img.shields.io/badge/Node-≥18-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node ≥18"/>
  <img src="https://img.shields.io/badge/零依赖-是-22C55E?style=flat-square" alt="零依赖"/>
</p>

---

CC 的 skill 格式（`SKILL.md` + frontmatter）正在跨工具趋同：codex 装了一堆和 CC 同名的 skill，opencode / codex / zcode 都有 `skills/` 目录且 frontmatter 兼容。所以一个汉化内核就能服务所有这些工具。

## 它做什么

把这些位置的英文 `description` 翻译成简体中文：

- **skill**（`SKILL.md`）
- **命令**（`commands/*.md`）
- **子智能体**（`agents/*.md`，含插件自带的，如 ECC 的 67 个）
- **插件元数据**（`plugin.json` / `marketplace.json`）

原文备份到 `description_en`，加 `x-zh-cn-translated` 标记，可一键还原。已汉化的不重复翻译；原生中文（CJK 检测）自动跳过。

## 快速开始

### CC / zcode —— plugin，由本宿主 agent 翻译

```text
/plugin marketplace add kaguyaluna2333/skill-zh-cn
/plugin install skill-zh-cn@skill-zh-cn
```

重启会话后，SessionStart hook 自动扫描待译项；检测到英文 description 时，会提示运行 `/skill-zh-cn`。直接运行即可——**由本宿主 agent 翻译**，无需 API key、不启动外部 CLI：

```text
/skill-zh-cn
```

### opencode / codex —— CLI，手动 / 定时

```bash
git clone https://github.com/kaguyaluna2333/skill-zh-cn
cd skill-zh-cn

./bin/skill-zh-cn --host codex --dry-run   # 只看待译项，不写盘
```

clone 后用 `core/agent-translate.sh` 走与 plugin 相同的 agent 翻译路径；或用 API 批量（见下方 env 配置）。自动触发示例见 [`adapters/opencode/`](adapters/opencode/)、[`adapters/codex/`](adapters/codex/)。

## 支持的宿主

| 宿主 | userRoot | pluginRoot | v1 触发 |
|---|---|---|---|
| Claude Code | `~/.claude` | `~/.claude` | plugin + SessionStart hook |
| zcode | `~/.zcode` | `~/.zcode/cli` | plugin + SessionStart hook |
| opencode | `$OPENCODE_CONFIG_DIR` 或 `~/.config/opencode` | 同左 | CLI |
| codex | `~/.codex` | `~/.codex` | CLI |

## 工作原理

三阶段流水线 **scan → translate → apply**：

- **scan**：递归找 `SKILL.md` / `commands/*.md` / `agents/*.md` / 插件元数据 JSON，解析 `description`，跳过已汉化（有标记）与原生中文（CJK 占比 > 0.3 或 CJK 字符数 ≥ 3），对比缓存只列新增 / 改动项。**默认只扫 plugin cache（运行副本）+ user**，不扫 `plugins/marketplaces`（那是插件 git 源码仓库，汉化会 dirty 且运行时不读）；`SKILL_I18N_INCLUDE_MARKETPLACES=1` 可全扫。`restore` 总是全扫以彻底清理。
- **translate**：默认走 **stdin provider**——译文由本宿主 agent 翻译后 pipe 进来（“装在谁身上让谁的 agent 翻”，零外部依赖）。可选 `claude` CLI / OpenAI 兼容 / Anthropic 兼容（API 批量）。按英文原文 hash 缓存，插件 update 覆盖后下次启动自动重应用，不重复调 LLM。
- **apply**：**行级 patch** 写回——只改 `description` 行 + 追加 `description_en` 备份与 `x-zh-cn-translated` 标记，正文逐字节不变（JSON 同样行级 patch，保持数组等格式不变）；写前 `verifyRewriteSafe` 自检。

**可靠性**：翻译失败绝不写回源文件；`${...}` 占位符校验（丢失则拒译）；零外部依赖（纯 node + `node:test`）；`restore --all` 一键还原。

## env 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `SKILL_I18N_PROVIDER` | （空） | `stdin`（本宿主 agent，推荐）/ `claude` / `openai` / `anthropic`；不指定则报错引导 |
| `SKILL_I18N_API_KEY` | 空 | openai / anthropic 的 key（经 env 传递，不进进程列表）|
| `SKILL_I18N_BASE_URL` | provider 默认 | 兼容端点 |
| `SKILL_I18N_MODEL` | 空 | openai / anthropic 模型名 |
| `SKILL_I18N_BATCH` | `10` | API 批量翻译每批条数（推理型 API 建议 `3`）|
| `SKILL_I18N_SUB` | `1` | 小批次重试最终兜底（单条）|
| `SKILL_I18N_REQUEST_TIMEOUT` | `180000` | API 单次请求超时 ms |
| `SKILL_I18N_TIMEOUT` | `25` | hook 后台超时秒 |
| `SKILL_I18N_USER_ROOT` / `SKILL_I18N_PLUGIN_ROOT` | 自动探测 | 显式覆盖扫描根 |
| `SKILL_I18N_INCLUDE_MARKETPLACES` | `0` | `1` 连 marketplaces 源码一起扫（默认只扫 cache + user）|

**推理型 API（MiniMax M 系列、GLM、DeepSeek-R1）**：建议 `SKILL_I18N_BATCH=3` + `SKILL_I18N_REQUEST_TIMEOUT=60000`（这类模型带 reasoning，大批量或短超时易失败）。不想配 API 就用 agent 翻译（`/skill-zh-cn`，`provider=stdin`），完全不受影响。

## CLI 用法

```text
skill-zh-cn                                     自动探测宿主，扫描并汉化
skill-zh-cn --host <cc|zcode|opencode|codex>
skill-zh-cn --root <dir>                        双根相同（CC 式单根）
skill-zh-cn --user-root X --plugin-root Y
skill-zh-cn --provider <stdin|claude|openai|anthropic>
skill-zh-cn --dry-run | list                    只列待译，不写盘
skill-zh-cn restore [--host X|--root Y|--all]
```

> `/skill-zh-cn`（plugin 提供的 command）走 agent 翻译（stdin），是推荐路径。CLI `skill-zh-cn` 需显式 `--provider`（或 env），适合终端批量。

## 开发

```bash
node --test tests/*.test.js                            # 全量测试（零依赖）
bash core/translate-skills.sh --host zcode --dry-run    # 手动 dry-run
```

## License

MIT
