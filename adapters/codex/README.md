# codex 集成

skill-zh-cn v1 通过 **CLI** 手动汉化 codex 的 skill 说明。本页给一个**可粘贴的 codex `config.toml` hook** 示例（可选，v1 不内置）。

## 前置：CLI 可用

```bash
git clone https://github.com/kaguyaluna2333/skill-zh-cn ~/skill-zh-cn
~/skill-zh-cn/bin/skill-zh-cn --host codex --dry-run   # 看待译项
```

## 可粘贴：codex 启动钩子

codex 的 `~/.codex/config.toml` 支持 hooks。追加（hook section 名 / 触发时机**以 codex 最新文档为准**，按需调整）：

```toml
# codex 启动时后台汉化（需 SKILL_I18N_ENABLE=1）
[hooks]
on_start = "SKILL_I18N_ENABLE=1 SKILL_I18N_HOOK=1 ~/skill-zh-cn/bin/skill-zh-cn --host codex >/dev/null 2>&1 &"
```

## 翻译引擎配置

同主 README 的 env（`SKILL_I18N_PROVIDER` / `API_KEY` / `MODEL` / `BASE_URL`）。
