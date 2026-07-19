// core/lib/hosts.js — 宿主 profile 表 + 自动探测 → { host, userRoot, pluginRoot, cacheDir }
//
// CC 的 skill 格式跨工具趋同（codex 实测兼容 frontmatter），本表覆盖四宿主：
//   cc       ~/.claude                              userRoot == pluginRoot
//   zcode    ~/.zcode + ~/.zcode/cli                userRoot ≠ pluginRoot（双根）
//   opencode $OPENCODE_CONFIG_DIR || ~/.config/opencode  userRoot == pluginRoot
//   codex    ~/.codex                               userRoot == pluginRoot
//
// 探测优先级：
//   1. --host <name>        显式宿主
//   2. --root <dir>         双根相同（CC 式单根快捷）
//   3. 显式 userRoot + pluginRoot
//   4. CLAUDE_PLUGIN_ROOT   hook 场景：插件知道自己装在哪，反推两棵树
//   5. OPENCODE_CONFIG_DIR  opencode 显式配置目录
//   6. 特征目录扫描         哪个宿主存在（cc > zcode > opencode > codex）
//   7. fallback cc

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function home() { return process.env.HOME || os.homedir(); }
function dirExists(p) {
  try { return !!(p && fs.existsSync(p) && fs.statSync(p).isDirectory()); } catch { return false; }
}
function cacheDirFor(userRoot) { return path.join(userRoot, ".skill-i18n-cache"); }

// 四宿主 profile。userRoot/pluginRoot 为函数（opencode 依赖 env），新增宿主只加一项。
const HOSTS = {
  cc: {
    detect: () => dirExists(path.join(home(), ".claude")),
    userRoot: () => path.join(home(), ".claude"),
    pluginRoot: () => path.join(home(), ".claude"),
  },
  zcode: {
    detect: () => dirExists(path.join(home(), ".zcode")),
    userRoot: () => path.join(home(), ".zcode"),
    pluginRoot: () => path.join(home(), ".zcode", "cli"),
  },
  opencode: {
    configDir: () => process.env.OPENCODE_CONFIG_DIR || path.join(home(), ".config", "opencode"),
    detect: () => dirExists(HOSTS.opencode.configDir()),
    userRoot: () => HOSTS.opencode.configDir(),
    pluginRoot: () => HOSTS.opencode.configDir(),
  },
  codex: {
    detect: () => dirExists(path.join(home(), ".codex")),
    userRoot: () => path.join(home(), ".codex"),
    pluginRoot: () => path.join(home(), ".codex"),
  },
};

// CLAUDE_PLUGIN_ROOT = <pluginRoot>/plugins/cache/<mp>/<plugin>/<ver> → 推导 pluginRoot（plugins 的父目录）
function derivePluginRootFromInstall(p) {
  if (!p) return null;
  const parts = p.split(path.sep);
  const idx = parts.lastIndexOf("plugins");
  if (idx <= 0) return null;
  return parts.slice(0, idx).join(path.sep) || path.sep;
}

// pluginRoot → userRoot：pluginRoot 下有 skills/ 用之；否则 dirname（zcode：~/.zcode/cli → ~/.zcode）
function deriveUserRoot(pluginRoot) {
  if (dirExists(path.join(pluginRoot, "skills"))) return pluginRoot;
  return path.dirname(pluginRoot);
}

function detectHostByRoots(ur, pr) {
  for (const name of ["cc", "zcode", "opencode", "codex"]) {
    const h = HOSTS[name];
    if (h.userRoot() === ur && h.pluginRoot() === pr) return name;
  }
  return null;
}

function resolve(opts = {}) {
  const { host, userRoot, pluginRoot, root } = opts;

  // 1. 显式 root（双根相同，CC 式快捷）
  if (root) {
    return { host: host || null, userRoot: root, pluginRoot: root, cacheDir: cacheDirFor(root) };
  }
  // 2. 显式 userRoot + pluginRoot
  if (userRoot && pluginRoot) {
    return { host: host || null, userRoot, pluginRoot, cacheDir: cacheDirFor(userRoot) };
  }
  // 3. 显式 host
  if (host && HOSTS[host]) {
    const h = HOSTS[host];
    return { host, userRoot: h.userRoot(), pluginRoot: h.pluginRoot(), cacheDir: cacheDirFor(h.userRoot()) };
  }
  // 4. CLAUDE_PLUGIN_ROOT 线索（hook 场景：插件装在哪就汉化哪边）
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    const pr = derivePluginRootFromInstall(process.env.CLAUDE_PLUGIN_ROOT);
    if (pr && dirExists(pr)) {
      const ur = deriveUserRoot(pr);
      return { host: detectHostByRoots(ur, pr), userRoot: ur, pluginRoot: pr, cacheDir: cacheDirFor(ur) };
    }
  }
  // 5. OPENCODE_CONFIG_DIR 线索
  if (process.env.OPENCODE_CONFIG_DIR && dirExists(process.env.OPENCODE_CONFIG_DIR)) {
    const cd = process.env.OPENCODE_CONFIG_DIR;
    return { host: "opencode", userRoot: cd, pluginRoot: cd, cacheDir: cacheDirFor(cd) };
  }
  // 6. 特征目录扫描：哪个宿主存在（优先序 cc > zcode > opencode > codex）
  for (const name of ["cc", "zcode", "opencode", "codex"]) {
    if (HOSTS[name].detect()) {
      const h = HOSTS[name];
      return { host: name, userRoot: h.userRoot(), pluginRoot: h.pluginRoot(), cacheDir: cacheDirFor(h.userRoot()) };
    }
  }
  // 7. fallback cc
  const ccRoot = path.join(home(), ".claude");
  return { host: "cc", userRoot: ccRoot, pluginRoot: ccRoot, cacheDir: cacheDirFor(ccRoot) };
}

module.exports = { HOSTS, resolve, cacheDirFor, derivePluginRootFromInstall, deriveUserRoot, detectHostByRoots };
