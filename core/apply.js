#!/usr/bin/env node
// core/apply.js — 读应用清单，安全写回。md 走 frontmatter，metadata 走 JSON。
// 清单项：{ path, kind, jsonPath?, en, zh }。按 path 分组，每文件一次读写（同一 JSON 多 description 一并处理）。
// 路径边界校验：清单文件必须在 --user-root 或 --plugin-root 之下（--root 等价于两者相同）。

"use strict";

const fs = require("fs");
const path = require("path");
const fm = require("./lib/frontmatter");
const meta = require("./lib/metadata");

function parseArgs(argv) {
  const a = { apply: "", dryRun: false, userRoot: "", pluginRoot: "", root: "" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--apply") a.apply = argv[++i];
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--user-root") a.userRoot = argv[++i];
    else if (k === "--plugin-root") a.pluginRoot = argv[++i];
    else if (k === "--root") a.root = argv[++i];
  }
  return a;
}

function safeWrite(file, content) {
  const tmp = `${file}.zh-cn-tmp.${process.pid}`;
  fs.writeFileSync(tmp, content);
  try { fs.chmodSync(tmp, fs.statSync(file).mode); } catch {} // 保留原文件权限
  try { fs.renameSync(tmp, file); }
  catch { try { fs.unlinkSync(file); } catch {} fs.renameSync(tmp, file); }
}

function readText(p) { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }

// 文件是否落在某个允许的根之下（防清单被篡改越界写）
function underAnyRoot(file, roots) {
  const resolved = path.resolve(file);
  for (const r of roots) {
    if (!r) continue;
    const rr = path.resolve(r);
    if (resolved === rr || resolved.startsWith(rr + path.sep)) return true;
  }
  return false;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apply) { console.error("apply: 缺少 --apply"); process.exit(0); }
  if (!fs.existsSync(args.apply)) { console.error("[apply] 清单不存在，无操作"); return; }
  let list;
  try { list = JSON.parse(fs.readFileSync(args.apply, "utf8")); }
  catch { console.error("[apply] 清单解析失败，无操作"); return; }

  // 允许的根：--user-root + --plugin-root（--root 补两者）
  const roots = [args.userRoot || args.root || "", args.pluginRoot || args.root || ""].filter(Boolean);

  // 按 path 分组（同一 JSON 文件的多个 description 一次性处理）
  const byPath = new Map();
  for (const item of list) {
    if (!byPath.has(item.path)) byPath.set(item.path, []);
    byPath.get(item.path).push(item);
  }

  let applied = 0;
  let skipped = 0;
  for (const [file, items] of byPath) {
    if (roots.length && !underAnyRoot(file, roots)) {
      console.error(`[apply] 路径越界，跳过 ${file}`);
      skipped += items.length;
      continue;
    }
    if (!fs.existsSync(file)) { skipped += items.length; continue; }
    const isMeta = items[0].kind === "metadata";

    if (isMeta) {
      const originalText = readText(file) || "";
      const obj = meta.tryParse(originalText);
      if (!obj) { console.error(`[apply] 跳过 ${file}: JSON 解析失败`); skipped += items.length; continue; }
      const toApply = items.filter((it) => it.jsonPath && !meta.isPathTranslated(obj, it.jsonPath));
      if (toApply.length === 0) { skipped += items.length; continue; }
      // 行级 patch（保持 JSON 格式，避免数组单行→多行等无意义 diff，Bug 3）；失败回退 serialize
      const patched = meta.applyToJsonText(originalText, toApply);
      let after;
      if (patched !== null) after = patched;
      else { for (const it of toApply) meta.applyTranslation(obj, it.jsonPath, it.zh, it.en); after = meta.serialize(obj); }
      if (args.dryRun) {
        console.log(`[dry-run] 将写 ${file}（${toApply.length} 项元数据）`);
        continue;
      }
      try { safeWrite(file, after); applied += toApply.length; }
      catch (e) { console.error(`[apply] 写入失败 ${file}: ${e.message}`); skipped += items.length; }
    } else {
      // md：一文件一个 description
      for (const it of items) {
        const text = readText(file);
        if (text === null) { skipped++; continue; }
        let rewritten;
        try { rewritten = fm.rewriteDescription(text, { zh: it.zh, en: it.en }); }
        catch (e) { console.error(`[apply] 跳过 ${file}: ${e.message}`); skipped++; continue; }
        if (!fm.verifyRewriteSafe(text, rewritten)) {
          console.error(`[apply] 自检失败，跳过 ${file}（正文或备份不一致）`);
          skipped++;
          continue;
        }
        if (args.dryRun) { console.log(`[dry-run] 将写 ${file}`); continue; }
        try { safeWrite(file, rewritten); applied++; }
        catch (e) { console.error(`[apply] 写入失败 ${file}: ${e.message}`); skipped++; }
      }
    }
  }

  console.log(`[apply] 完成: 写入 ${applied}，跳过 ${skipped}`);
}

main();
