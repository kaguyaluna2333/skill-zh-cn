# skill-zh-cn — Task List

> 详细任务卡见 `tasks/plan.md`。

## ✅ 已完成（自主实现 + 隔离验证）

- [x] **T1** lib 四件套（frontmatter/metadata/cache/cjk 原样移植）
- [x] **T2** collect.js 单根→双根（`collectAll({userRoot,pluginRoot})`）+ 双根测试
- [x] **T3** scan/translate/apply/restore + translate-skills.sh（env `SKILL_I18N_*`、双根）
- [x] **T4** hosts.js 四宿主探测（cc/zcode/opencode/codex + CLAUDE_PLUGIN_ROOT 反推）
- [x] **T5** translate-skills.sh `--host`
- [x] **T6** bin/skill-zh-cn 通用 CLI（自动探测/--host/restore/help）
- [x] **T7** CC/zcode plugin 挂载（plugin 根=仓库根，core 随 plugin 安装）
- [x] **T8** marketplace.json（自包含 source=`./`）
- [x] **T9** README + adapters/opencode|codex 可粘贴示例
- [x] **T10** LICENSE（MIT）
- [x] **T11** 翻译引擎改本宿主 agent（hook scan + `/skill-zh-cn` command + `provider=stdin`）

测试 26/26 绿；隔离环境全流程验证（中文 description + description_en 备份 + 标记 + 正文不变、再 scan 跳过、restore 还原）。

## 🔶 留给用户（各自宿主会话验证）

- [ ] **zcode**：`/plugin marketplace add kaguyaluna2333/skill-zh-cn` → `/plugin install skill-zh-cn@skill-zh-cn` → 重启会话 → hook scan 到 ~804 条 → `/skill-zh-cn`（zcode agent 翻译）
- [ ] **CC**：同上（CC agent 翻译，待译 ~1 条）
- [ ] 确认产物 frontmatter（`description` 中文 + `description_en` 英文 + `x-zh-cn-translated: true` + 正文不变）
- [ ] `restore` 验证还原

## v2 / 后续

- opencode JS plugin / codex config.toml 原生挂载（v1 仅文档示例）
- npm 正式发布（v1.1）
