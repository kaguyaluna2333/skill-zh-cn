#!/usr/bin/env node
// core/scan.js — 扫描 skill/command/metadata 来源，解析，对比缓存，输出待翻译队列。
// 多根：--user-root 扫 skills/commands，--plugin-root 扫 plugins/cache/marketplaces/metadata。
// --root X 等价于 --user-root X --plugin-root X（CC 式单根，向后兼容手动调用）。
// 来源枚举委托 core/lib/collect.js（与 restore 共享，避免两处遍历漂移）。
// 输出：{ userRoot, pluginRoot, toTranslate:[{id,en,items}], cached:[{...}], skip:[{path,reason}] }

"use strict";

const fs = require("fs");
const path = require("path");
const collect = require("./lib/collect");
const fm = require("./lib/frontmatter");
const meta = require("./lib/metadata");
const cache = require("./lib/cache");
const { cjkRatio, CJK_RATIO_THRESHOLD } = require("./lib/cjk");
const { readText } = require("./lib/io");

function parseArgs(argv) {
  const a = { userRoot: "", pluginRoot: "", root: "", cache: "", output: "", print: false, printCount: "", limit: 0, includeMarketplaces: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--user-root") a.userRoot = argv[++i];
    else if (k === "--plugin-root") a.pluginRoot = argv[++i];
    else if (k === "--root" || k === "--scan-root") a.root = argv[++i];
    else if (k === "--cache") a.cache = argv[++i];
    else if (k === "--output") a.output = argv[++i];
    else if (k === "--print") a.print = true;
    else if (k === "--print-count") a.printCount = argv[++i];
    else if (k === "--include-marketplaces") a.includeMarketplaces = true;
    else if (k === "--limit") a.limit = Number.parseInt(argv[++i], 10) || 0;
  }
  return a;
}

function enqueue(toTranslate, cached, cacheData, en, item) {
  const id = cache.hashKey(en);
  // 复用已算出的 id，避免 lookup 内部再 sha256 一次
  const zh = cache.lookup(cacheData, en, id);
  if (zh) {
    cached.push({ path: item.path, kind: item.kind, jsonPath: item.jsonPath, en, zh, id });
  } else {
    if (!toTranslate.has(id)) toTranslate.set(id, { id, en, items: [] });
    toTranslate.get(id).items.push({ path: item.path, kind: item.kind, jsonPath: item.jsonPath });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // --root 作双根相同的快捷方式（CC 式单根，向后兼容）
  const userRoot = args.userRoot || args.root || "";
  const pluginRoot = args.pluginRoot || args.root || "";
  if (!userRoot || !pluginRoot) { console.error("scan: 缺少 --user-root/--plugin-root 或 --root"); process.exit(0); }
  if (!args.output) { console.error("scan: 缺少 --output"); process.exit(0); }

  const cacheData = args.cache ? cache.load(args.cache) : { entries: {} };
  // 默认不跟随符号链接：避免改写符号链接指向的外部源仓库
  const follow = process.env.SKILL_I18N_FOLLOW_SYMLINKS === "1";
  const files = collect.collectAll({ userRoot, pluginRoot, includeMarketplaces: args.includeMarketplaces }, follow);
  const mdFiles = files.filter((f) => f.kind !== "metadata");
  const jsonFiles = files.filter((f) => f.kind === "metadata");

  const toTranslate = new Map();
  const cached = [];
  const skip = [];

  for (const f of mdFiles) {
    const text = readText(f.path);
    if (text === null) { skip.push({ path: f.path, reason: "unreadable" }); continue; }
    const parsed = fm.parseFrontmatter(text);
    if (fm.hasTranslatedMarker(parsed)) { skip.push({ path: f.path, reason: "already-translated" }); continue; }
    const en = parsed.desc ? parsed.desc.value : null;
    if (en === null) { skip.push({ path: f.path, reason: "no-description" }); continue; }
    if (en.trim() === "") { skip.push({ path: f.path, reason: "empty-description" }); continue; }
    if (cjkRatio(en) > CJK_RATIO_THRESHOLD) { skip.push({ path: f.path, reason: "already-zh" }); continue; }
    enqueue(toTranslate, cached, cacheData, en, { path: f.path, kind: f.kind });
  }

  for (const f of jsonFiles) {
    const text = readText(f.path);
    if (text === null) { skip.push({ path: f.path, reason: "unreadable" }); continue; }
    const obj = meta.tryParse(text);
    if (!obj) { skip.push({ path: f.path, reason: "invalid-json" }); continue; }
    const descs = meta.extractDescriptions(obj);
    if (descs.length === 0) { skip.push({ path: f.path, reason: "no-description" }); continue; }
    for (const d of descs) {
      if (meta.isPathTranslated(obj, d.jsonPath)) continue;
      if (cjkRatio(d.en) > CJK_RATIO_THRESHOLD) continue;
      enqueue(toTranslate, cached, cacheData, d.en, { path: f.path, kind: "metadata", jsonPath: d.jsonPath });
    }
  }

  let toTranslateList = [...toTranslate.values()];
  if (args.limit > 0 && toTranslateList.length > args.limit) {
    toTranslateList = toTranslateList.slice(0, args.limit);
  }
  const result = { userRoot, pluginRoot, toTranslate: toTranslateList, cached, skip };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2));

  // --print-count FILE：把 toTranslate.length 写入 FILE，供 hook 省掉第二次 node 冷启动
  if (args.printCount) {
    try {
      fs.mkdirSync(path.dirname(args.printCount), { recursive: true });
      fs.writeFileSync(args.printCount, String(result.toTranslate.length));
    } catch { /* 忽略计数写入失败，hook 侧 cat 失败兜底 0 */ }
  }

  if (args.print) {
    const toFileTotal = result.toTranslate.reduce((n, t) => n + t.items.length, 0);
    console.error(`[scan] md ${mdFiles.length} + 元数据 ${jsonFiles.length} 文件`);
    console.error(`  待翻译: ${result.toTranslate.length} 条唯一 / ${toFileTotal} 项`);
    console.error(`  缓存命中: ${result.cached.length} 项`);
    console.error(`  跳过: ${result.skip.length} 项`);
    for (const t of result.toTranslate) console.error(`    [译] ${t.en.slice(0, 70)}`);
  }
}

main();
