// core/lib/collect.js — skill/command/metadata 文件发现（单一来源，scan 与 restore 共用）
//
// 多根设计：user 内容（skills/commands）从 userRoot 扫，插件内容（cache/marketplaces/
// metadata）从 pluginRoot 扫。
//   - CC：userRoot == pluginRoot == ~/.claude
//   - zcode：userRoot = ~/.zcode，pluginRoot = ~/.zcode/cli
//   - opencode / codex：userRoot == pluginRoot == 各自 config 根
// 统一用 walkAndCollect 递归 + 排除规则，告别固定子目录枚举（避免逐轮发现新目录结构）。

"use strict";

const fs = require("fs");
const path = require("path");

function tryReadDir(d) {
  try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; }
}
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function dirIsDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function fileIsFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
// 目录项是否为「文件」（含跟随符号链接指向的文件），用于 command .md 收集
function isFileEntry(e, full, followSymlinks) {
  if (e.isFile()) return true;
  return followSymlinks && e.isSymbolicLink() && fileIsFile(full);
}
// 目录项是否为「目录」（含跟随符号链接指向的目录），与 isFileEntry 对称
function isDirEntry(e, full, followSymlinks) {
  if (e.isDirectory()) return true;
  return followSymlinks && e.isSymbolicLink() && dirIsDir(full);
}

// 排除的目录段（非 skill/command 内容，或多语言副本 / 构建产物 / IDE 配置）
const EXCLUDE_SEGS = new Set([
  ".git", "node_modules", "docs", "dist", "tests", "test", "src",
  ".github", ".openclaw", ".vscode", ".idea",
]);

// 公共递归收集器：遍历 dir，遇到 SKILL.md 收为 skill，遇到 commands 目录取其下所有 .md 为 command。
// 跟随符号链接由 followSymlinks 控制。统一供 user / cache / marketplaces 三处使用。
// visitedRealpaths 防符号链接成环：进入目录时 realpath + 去重（每组根内部生效，跨组不共享）。
function walkAndCollect(dir, followSymlinks, out, visitedRealpaths) {
  let realDir;
  try { realDir = fs.realpathSync(dir); } catch { return; }
  if (visitedRealpaths.has(realDir)) return; // 已访问（防环）
  visitedRealpaths.add(realDir);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (EXCLUDE_SEGS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (isDirEntry(e, full, followSymlinks)) {
      if (e.name === "commands") {
        collectCommandsDeep(full, followSymlinks, out, visitedRealpaths, "command");
        continue; // 已收集，不再 walk（避免重复 + 深层 command 漏扫）
      }
      if (e.name === "agents") {
        collectCommandsDeep(full, followSymlinks, out, visitedRealpaths, "agent");
        continue;
      }
      walkAndCollect(full, followSymlinks, out, visitedRealpaths);
    } else if (e.isFile() && e.name === "SKILL.md") {
      out.push({ path: full, kind: "skill" });
    }
  }
}

// 递归收集 commands 目录下所有 .md（含嵌套子目录），作为 command。
// 应用 EXCLUDE_SEGS（与 walkAndCollect 一致），并在进入目录时 realpath + visitedRealpaths 防符号链接成环。
function collectCommandsDeep(dir, followSymlinks, out, visitedRealpaths, kind = "command") {
  let realDir;
  try { realDir = fs.realpathSync(dir); } catch { return; }
  if (visitedRealpaths.has(realDir)) return; // 已访问（防环）
  visitedRealpaths.add(realDir);
  for (const e of tryReadDir(dir)) {
    if (EXCLUDE_SEGS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (isFileEntry(e, full, followSymlinks) && e.name.endsWith(".md")) {
      out.push({ path: full, kind }); // command / agent（都是目录下的 .md）
    } else if (isDirEntry(e, full, followSymlinks)) {
      collectCommandsDeep(full, followSymlinks, out, visitedRealpaths, kind);
    }
  }
}

// 从一组根目录递归收集（user 的 skills/commands 根、cache 的各版本根、marketplaces 的各插件根）
function collectFromRoots(roots, followSymlinks) {
  const out = [];
  const visitedRealpaths = new Set();
  for (const r of roots) {
    if (!exists(r)) continue;
    // 根目录本身是 commands / agents 时，直接深收集其下 .md
    if (path.basename(r) === "commands") {
      collectCommandsDeep(r, followSymlinks, out, visitedRealpaths, "command");
    } else if (path.basename(r) === "agents") {
      collectCommandsDeep(r, followSymlinks, out, visitedRealpaths, "agent");
    } else {
      walkAndCollect(r, followSymlinks, out, visitedRealpaths);
    }
  }
  return out;
}

// 用户级：userRoot/skills, userRoot/commands, userRoot/agents（及 .claude/ 下同，兼容项目级）
function collectUserMarkdown(userRoot, followSymlinks) {
  return collectFromRoots([
    path.join(userRoot, "skills"),
    path.join(userRoot, "commands"),
    path.join(userRoot, "agents"),
    path.join(userRoot, ".claude", "skills"),
    path.join(userRoot, ".claude", "commands"),
    path.join(userRoot, ".claude", "agents"),
  ], followSymlinks);
}

// 插件 cache：pluginRoot/plugins/cache/<mp>/<plugin>/<version>/ 各版本根递归
function collectPluginMarkdown(pluginRoot, followSymlinks) {
  const roots = [];
  const cacheBase = path.join(pluginRoot, "plugins", "cache");
  for (const mp of tryReadDir(cacheBase)) {
    if (!mp.isDirectory()) continue;
    const mpDir = path.join(cacheBase, mp.name);
    for (const plugin of tryReadDir(mpDir)) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(mpDir, plugin.name);
      for (const ver of tryReadDir(pluginDir)) {
        if (ver.isDirectory()) roots.push(path.join(pluginDir, ver.name));
      }
    }
  }
  return collectFromRoots(roots, followSymlinks);
}

// marketplaces：pluginRoot/plugins/marketplaces/<name>/ 各插件根递归
function collectMarketplaces(pluginRoot, followSymlinks) {
  const roots = [];
  const mpBase = path.join(pluginRoot, "plugins", "marketplaces");
  for (const mp of tryReadDir(mpBase)) {
    if (mp.isDirectory() || (followSymlinks && mp.isSymbolicLink())) {
      roots.push(path.join(mpBase, mp.name));
    }
  }
  return collectFromRoots(roots, followSymlinks);
}

// 插件元数据 JSON：plugin.json（cache 下）+ marketplace.json（cache 下 + marketplaces 下，后者仅 includeMarketplaces）
function collectMetadata(pluginRoot, includeMarketplaces = false) {
  const out = [];
  const seen = new Set();
  const add = (p) => { if (exists(p) && !seen.has(p)) { seen.add(p); out.push({ path: p, kind: "metadata" }); } };
  const cacheBase = path.join(pluginRoot, "plugins", "cache");
  for (const mp of tryReadDir(cacheBase)) {
    if (!mp.isDirectory()) continue;
    const mpDir = path.join(cacheBase, mp.name);
    for (const plugin of tryReadDir(mpDir)) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(mpDir, plugin.name);
      for (const ver of tryReadDir(pluginDir)) {
        if (!ver.isDirectory()) continue;
        const cp = path.join(pluginDir, ver.name, ".claude-plugin");
        add(path.join(cp, "plugin.json"));
        add(path.join(cp, "marketplace.json"));
      }
    }
  }
  if (includeMarketplaces) {
    const mpBase = path.join(pluginRoot, "plugins", "marketplaces");
    for (const m of tryReadDir(mpBase)) {
      if (!m.isDirectory()) continue;
      add(path.join(mpBase, m.name, ".claude-plugin", "marketplace.json"));
    }
  }
  return out;
}

// 统一收集所有来源。多根：userRoot 扫 skills/commands，pluginRoot 扫 cache/metadata。
// includeMarketplaces 默认 false：不扫 plugins/marketplaces（那是插件 git 源码仓库，
// 汉化会 git dirty 且运行时不读——运行读的是 cache 安装副本）。
// restore 传 true 以便彻底清理任何已汉化文件（含源码里曾有标记的）。
// 对 CC 传 { userRoot: A, pluginRoot: A }；对 zcode 传 { userRoot: ~/.zcode, pluginRoot: ~/.zcode/cli }。
function collectAll({ userRoot, pluginRoot, includeMarketplaces = false }, followSymlinks) {
  const out = [
    ...collectUserMarkdown(userRoot, followSymlinks),
    ...collectPluginMarkdown(pluginRoot, followSymlinks),
    ...collectMetadata(pluginRoot, includeMarketplaces),
  ];
  if (includeMarketplaces) out.push(...collectMarketplaces(pluginRoot, followSymlinks));
  return out;
}

module.exports = {
  collectAll, walkAndCollect, collectCommandsDeep, collectFromRoots,
  collectUserMarkdown, collectPluginMarkdown, collectMarketplaces, collectMetadata,
  EXCLUDE_SEGS,
};
