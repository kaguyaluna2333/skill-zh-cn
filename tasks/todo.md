# skill-zh-cn — Task List

> 详细任务卡见 `tasks/plan.md`。按顺序执行，勾选推进。

## Phase 1: 内核基础

- [ ] **T1** 移植内核 lib 四件套（frontmatter/metadata/cache/cjk）· S · 依赖: 无
  - [ ] four libs load via require
- [ ] **T2** collect.js 多根化（`collectAll({userRoot,pluginRoot})`）· M · 依赖: T1
  - [ ] `node --test tests/collect.test.js` 绿（含双根用例）
- [ ] **T3** scan/translate/apply/restore 移植 + 接多根（`--user-root`/`--plugin-root`，保留 `--root`）· M · 依赖: T2
  - [ ] zcode dry-run 列出 ~92 待译

### 🔶 Checkpoint 1: 内核可用 · review with human

## Phase 2: 宿主探测 + CLI

- [ ] **T4** hosts.js 四宿主 profile + 探测链（可与 T1–T3 并行）· S · 依赖: 无
  - [ ] `node --test tests/hosts.test.js` 绿
- [ ] **T5** scan/translate-skills.sh 接入 `--host` · S · 依赖: T3, T4
  - [ ] 四宿主 `--host X --dry-run` 正确
- [ ] **T6** `bin/skill-zh-cn` 通用 CLI（探测→调 core）· S · 依赖: T5
  - [ ] 无参自动探测 + `--host` + `restore --all`

### 🔶 Checkpoint 2 (CP1): CLI 可用 · review with human
- [ ] `node --test tests/` 全绿
- [ ] `skill-zh-cn --host <四宿主> --dry-run` 各自正确

## Phase 3: CC/zcode plugin + 发布

- [ ] **T7** adapters/claude-code plugin（plugin.json + hooks.json + session-start，env 改 `SKILL_I18N_*`）· M · 依赖: T6
  - [ ] CC + zcode `/plugin install` + `SKILL_I18N_ENABLE=1` 触发
- [ ] **T8** 根 `.claude-plugin/marketplace.json`（自包含）· S · 依赖: T7
  - [ ] marketplace add + install 跑通

### 🔶 Checkpoint 3 (CP2): plugin 可装可触发 · review with human

## Phase 4: 文档 + 验证

- [ ] **T9** README + opencode/codex 可粘贴示例（v1 不内置原生挂载）· M · 依赖: T6（可与 T7–T8 并行）
  - [ ] 按 README git clone + symlink + `--host codex` 走通
- [ ] **T10** 真实验证 + LICENSE（MIT，作者 kaguyaluna2333）· S · 依赖: T8, T9
  - [ ] zcode 92 翻译 / 45 不重复 / 原生中文跳过 / restore 还原
  - [ ] codex 跨工具复用
  - [ ] LICENSE（MIT）

### 🔶 Checkpoint 4 (CP3): 真实生效 · release ready
- [ ] SPEC 6 条 Success Criteria 全达成
- [ ] 同装 claude-code-zh-cn 不冲突
