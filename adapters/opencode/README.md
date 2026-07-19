# opencode 集成

skill-zh-cn v1 通过 **CLI** 手动汉化 opencode 的 skill / 命令说明。本页给一个**可粘贴的 opencode plugin** 示例，实现会话启动时自动汉化（可选，v1 不内置）。

## 前置：CLI 可用

```bash
git clone https://github.com/kaguyaluna2333/skill-zh-cn ~/skill-zh-cn
~/skill-zh-cn/bin/skill-zh-cn --host opencode --dry-run   # 看待译项
```

## 可粘贴：opencode plugin 自动汉化

把以下文件放到 `$OPENCODE_CONFIG_DIR/plugins/skill-zh-cn.js`（默认 `~/.config/opencode/plugins/skill-zh-cn.js`）：

```js
// opencode plugin：会话启动后台调 skill-zh-cn 汉化 opencode skill
const { spawn } = require("child_process");
const PLUGIN_HOME = (process.env.HOME || "") + "/skill-zh-cn";

module.exports = {
  // 注：opencode plugin lifecycle hook 名以官方文档为准，按需调整
  "session.start": () => {
    if (process.env.SKILL_I18N_ENABLE !== "1") return;
    if (process.env.SKILL_I18N_HOOK === "1") return; // 防递归
    const child = spawn(PLUGIN_HOME + "/bin/skill-zh-cn", ["--host", "opencode"], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, SKILL_I18N_HOOK: "1" },
    });
    child.unref();
  },
};
```

设 `SKILL_I18N_ENABLE=1` + provider/key 后，会话启动自动增量汉化。

## 翻译引擎配置

同主 README 的 env（`SKILL_I18N_PROVIDER` / `API_KEY` / `MODEL` / `BASE_URL`）。
