# skill-zh-cn

跨宿主 skill 说明汉化。一个宿主无关内核 + 通用 CLI，把 **Claude Code / zcode / opencode / codex** 等工具里显示给人看的 skill / 命令 `description` 翻译成简体中文。

CC 的 skill 格式（`SKILL.md` + frontmatter）正在跨工具趋同——codex 装了一堆和 CC 同名的 skill，opencode/codex/zcode 都有 `skills/` 目录且 frontmatter 兼容。所以**一个汉化内核就能服务所有这些工具**。

## 它做什么

把 `/` 命令列表、skill 列表、插件管理界面里的英文功能描述翻译成中文。原文备份到 `description_en`，加 `x-zh-cn-translated` 标记，可一键还原。已汉化的不重复翻译，原生中文（如 `百度搜索`）自动跳过。

## 快速开始

### CC / zcode —— plugin，自动汉化

```text
# 在 CC 或 zcode 里
/plugin marketplace add kaguyaluna2333/skill-zh-cn
/plugin install skill-zh-cn@skill-zh-cn
```

开启自动汉化（SessionStart 后台异步，新装项**下次会话**生效）——`settings.json` 的 `env`：

```json
{
  "env": {
    "SKILL_I18N_ENABLE": "1",
    "SKILL_I18N_PROVIDER": "anthropic",
    "SKILL_I18N_API_KEY": "你的 key",
    "SKILL_I18N_MODEL": "你的模型",
    "SKILL_I18N_BASE_URL": "https://你的端点"
  }
}
```

不配 API 时 `PROVIDER` 留默认 `auto`，走 `claude` CLI（零配置，但较慢）。

### opencode / codex —— CLI，手动 / 定时

```bash
git clone https://github.com/kaguyaluna2333/skill-zh-cn
cd skill-zh-cn

./bin/skill-zh-cn --host codex --dry-run   # 只看待译项，不写盘
./bin/skill-zh-cn --host codex             # 真正翻译
./bin/skill-zh-cn restore --host codex     # 还原英文

./bin/skill-zh-cn --dry-run                # 无 --host → 自动探测本机宿主
```

opencode / codex 的**自动触发**（可选）：见 [`adapters/opencode/`](adapters/opencode/)、[`adapters/codex/`](adapters/codex/) 的可粘贴 hook 示例。

## 支持的宿主

| 宿主 | userRoot | pluginRoot | v1 触发 |
|---|---|---|---|
| Claude Code | `~/.claude` | `~/.claude` | plugin + SessionStart hook |
| zcode | `~/.zcode` | `~/.zcode/cli` | plugin + SessionStart hook |
| opencode | `$OPENCODE_CONFIG_DIR` 或 `~/.config/opencode` | 同左 | CLI |
| codex | `~/.codex` | `~/.codex` | CLI |

## 工作原理

三阶段流水线 **scan → translate → apply**：

- **scan**：递归找 `SKILL.md` / `commands/*.md` / `agents/*.md`（含插件子智能体，如 ECC 的 67 个）/ 插件元数据 JSON，解析 `description`，跳过已汉化（有标记）与原生中文（CJK 比例），对比缓存只列新增/改动项。**默认只扫 plugin cache（运行副本）+ user**，不扫 `plugins/marketplaces`（那是插件 git 源码仓库，汉化会 dirty 且运行时不读）；`SKILL_I18N_INCLUDE_MARKETPLACES=1` 或 `--include-marketplaces` 可全扫。`restore` 总是全扫以彻底清理。
- **translate**：调 LLM（`claude` CLI / OpenAI 兼容 / Anthropic 兼容），按英文原文 hash 缓存（插件 update 覆盖后下次启动自动重应用，不重复调 LLM）
- **apply**：**行级 patch** 写回——只改 `description` 行 + 追加 `description_en` 备份与 `x-zh-cn-translated` 标记，正文逐字节不变；写前 `verifyRewriteSafe` 自检

可靠性：翻译失败绝不写回源文件；`${...}` 占位符校验（丢失则拒译）；零外部依赖（纯 node + `node:test`）；`restore --all` 一键还原全部。

## env 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `SKILL_I18N_ENABLE` | `0` | `1` 才启用 plugin hook |
| `SKILL_I18N_PROVIDER` | （空） | `stdin`（本宿主 agent，推荐）/ `claude` / `openai` / `anthropic`；不指定则报错引导 |
| `SKILL_I18N_API_KEY` | 空 | openai/anthropic 的 key（经 env 传递，不进进程列表）|
| `SKILL_I18N_BASE_URL` | provider 默认 | 兼容端点 |
| `SKILL_I18N_MODEL` | 空 | openai/anthropic 模型名 |
| `SKILL_I18N_BATCH` | `10` | API 批量翻译每批条数（推理型 API 建议 `3`）|
| `SKILL_I18N_SUB` | `1` | 小批次重试最终兜底（单条）|
| `SKILL_I18N_REQUEST_TIMEOUT` | `180000` | API 单次请求超时 ms |
| `SKILL_I18N_TIMEOUT` | `25` | hook 后台超时秒 |
| `SKILL_I18N_USER_ROOT` / `SKILL_I18N_PLUGIN_ROOT` | 自动探测 | 显式覆盖扫描根 |
| `SKILL_I18N_INCLUDE_MARKETPLACES` | `0` | `1` 连 marketplaces 源码一起扫（默认只扫 cache+user）|

**推理型 API（MiniMax M 系列、GLM、DeepSeek-R1）推荐**：`SKILL_I18N_BATCH=3`（小批，单次响应快）+ `SKILL_I18N_REQUEST_TIMEOUT=60000`。这类模型带 reasoning 思考，大批量或短超时易失败；agent 翻译（`/skill-zh-cn`，`provider=stdin`）则不受影响。

## CLI 用法

```text
skill-zh-cn                            自动探测宿主，扫描并汉化
skill-zh-cn --host <cc|zcode|opencode|codex>
skill-zh-cn --root <dir>               双根相同（CC 式单根）
skill-zh-cn --user-root X --plugin-root Y
skill-zh-cn --dry-run | list           只列待译，不写盘
skill-zh-cn restore [--host X|--root Y|--all]
```

## 开发

```bash
node --test tests/*.test.js             # 全量测试（零依赖）
bash core/translate-skills.sh --host zcode --dry-run   # 手动 dry-run
```

License: MIT
