const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const hosts = require("../core/lib/hosts");

// 在隔离的 fake HOME 下跑（避免依赖真实机器装了哪些宿主），测完恢复 env
function withFakeHome(fn) {
  return () => {
    const origHome = process.env.HOME;
    const hadCpr = "CLAUDE_PLUGIN_ROOT" in process.env;
    const origCpr = process.env.CLAUDE_PLUGIN_ROOT;
    const hadOcd = "OPENCODE_CONFIG_DIR" in process.env;
    const origOcd = process.env.OPENCODE_CONFIG_DIR;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hosts-"));
    process.env.HOME = tmp;
    delete process.env.CLAUDE_PLUGIN_ROOT;
    delete process.env.OPENCODE_CONFIG_DIR;
    try {
      fn(tmp);
    } finally {
      process.env.HOME = origHome;
      if (hadCpr) process.env.CLAUDE_PLUGIN_ROOT = origCpr; else delete process.env.CLAUDE_PLUGIN_ROOT;
      if (hadOcd) process.env.OPENCODE_CONFIG_DIR = origOcd; else delete process.env.OPENCODE_CONFIG_DIR;
    }
  };
}

test("resolve({host:'codex'}) → ~/.codex 双根相同", withFakeHome((home) => {
  fs.mkdirSync(path.join(home, ".codex"));
  const r = hosts.resolve({ host: "codex" });
  assert.equal(r.host, "codex");
  assert.equal(r.userRoot, path.join(home, ".codex"));
  assert.equal(r.pluginRoot, path.join(home, ".codex"));
  assert.equal(r.cacheDir, path.join(home, ".codex", ".skill-i18n-cache"));
}));

test("resolve({host:'zcode'}) → userRoot ≠ pluginRoot（~/.zcode + ~/.zcode/cli）", withFakeHome((home) => {
  fs.mkdirSync(path.join(home, ".zcode"));
  const r = hosts.resolve({ host: "zcode" });
  assert.equal(r.host, "zcode");
  assert.equal(r.userRoot, path.join(home, ".zcode"));
  assert.equal(r.pluginRoot, path.join(home, ".zcode", "cli"));
}));

test("resolve({host:'opencode'}) 用 OPENCODE_CONFIG_DIR 覆盖默认", withFakeHome((home) => {
  const cfg = path.join(home, "custom-opencode");
  fs.mkdirSync(cfg);
  process.env.OPENCODE_CONFIG_DIR = cfg;
  const r = hosts.resolve({ host: "opencode" });
  assert.equal(r.userRoot, cfg);
  assert.equal(r.pluginRoot, cfg);
}));

test("resolve({host:'cc'}) → ~/.claude", withFakeHome((home) => {
  fs.mkdirSync(path.join(home, ".claude"));
  const r = hosts.resolve({ host: "cc" });
  assert.equal(r.host, "cc");
  assert.equal(r.userRoot, path.join(home, ".claude"));
  assert.equal(r.pluginRoot, path.join(home, ".claude"));
}));

test("显式 userRoot+pluginRoot 直接返回（cacheDir 跟 userRoot）", () => {
  const r = hosts.resolve({ userRoot: "/a", pluginRoot: "/b" });
  assert.equal(r.userRoot, "/a");
  assert.equal(r.pluginRoot, "/b");
  assert.equal(r.cacheDir, "/a/.skill-i18n-cache");
});

test("显式 root → 双根相同（CC 式快捷）", () => {
  const r = hosts.resolve({ root: "/x" });
  assert.equal(r.userRoot, "/x");
  assert.equal(r.pluginRoot, "/x");
});

test("无参数：特征扫描命中已装宿主（cc>zcode>opencode>codex 优先序）", withFakeHome((home) => {
  fs.mkdirSync(path.join(home, ".codex"));
  fs.mkdirSync(path.join(home, ".zcode"));
  // cc 与 opencode 不存在 → 命中优先序最高的 zcode
  const r = hosts.resolve();
  assert.equal(r.host, "zcode");
}))

test("无参数：仅 codex 存在 → 命中 codex", withFakeHome((home) => {
  fs.mkdirSync(path.join(home, ".codex"));
  const r = hosts.resolve();
  assert.equal(r.host, "codex");
}));

test("CLAUDE_PLUGIN_ROOT 反推：CC 安装（plugins 在 ~/.claude 下，有 skills）→ 双根 ~/.claude", withFakeHome((home) => {
  fs.mkdirSync(path.join(home, ".claude", "skills", "x"), { recursive: true });
  process.env.CLAUDE_PLUGIN_ROOT = path.join(home, ".claude", "plugins", "cache", "mp", "skill-zh-cn", "1.0.0");
  const r = hosts.resolve();
  assert.equal(r.pluginRoot, path.join(home, ".claude"));
  assert.equal(r.userRoot, path.join(home, ".claude"));
  assert.equal(r.host, "cc");
}));

test("CLAUDE_PLUGIN_ROOT 反推：zcode 安装（pluginRoot=~/.zcode/cli 无 skills）→ userRoot=~/.zcode", withFakeHome((home) => {
  fs.mkdirSync(path.join(home, ".zcode", "cli"), { recursive: true });
  fs.mkdirSync(path.join(home, ".zcode", "skills"), { recursive: true });
  process.env.CLAUDE_PLUGIN_ROOT = path.join(home, ".zcode", "cli", "plugins", "cache", "mp", "skill-zh-cn", "1.0.0");
  const r = hosts.resolve();
  assert.equal(r.pluginRoot, path.join(home, ".zcode", "cli"));
  assert.equal(r.userRoot, path.join(home, ".zcode"));
  assert.equal(r.host, "zcode");
}));

test("fallback：无任何宿主特征 → fallback cc (~/.claude)", withFakeHome((home) => {
  const r = hosts.resolve();
  assert.equal(r.host, "cc");
  assert.equal(r.userRoot, path.join(home, ".claude"));
}));

test("OPENCODE_CONFIG_DIR 线索（无 host/root）：opencode 显式目录", withFakeHome((home) => {
  const cfg = path.join(home, ".config", "opencode");
  fs.mkdirSync(cfg, { recursive: true });
  process.env.OPENCODE_CONFIG_DIR = cfg;
  const r = hosts.resolve();
  assert.equal(r.host, "opencode");
  assert.equal(r.userRoot, cfg);
}));

test("derivePluginRootFromInstall：无 plugins 段 → null", () => {
  assert.equal(hosts.derivePluginRootFromInstall("/just/a/path"), null);
  assert.equal(hosts.derivePluginRootFromInstall(""), null);
});
