// lib/cache.js — 全局译文缓存（零依赖）
// key = sha256(英文.trim().toLowerCase())，value = { en, zh, provider, ts }
// 插件 update 覆盖源文件后，标记丢失但原文相同 → 缓存命中 → 直接重应用，不重调 LLM。

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function hashKey(en) {
  return crypto.createHash("sha256").update(String(en).trim().toLowerCase()).digest("hex");
}

function load(cacheFile) {
  try {
    if (cacheFile && fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (data && data.entries) return data;
    }
  } catch {
    // 损坏的缓存文件：当作空缓存，不阻断流程
  }
  return { version: 1, entries: {} };
}

const MAX_ENTRIES = 5000;

function save(cacheFile, data) {
  if (!cacheFile) return;
  try {
    // 并发 lost-update 防护：先重新 load 最新文件，把已存在条目与本批 data.entries
    // 合并（后者覆盖前者同 key）再写，避免并发后写覆盖前写丢条目。
    if (data && data.entries) {
      const existing = load(cacheFile);
      if (existing && existing.entries) {
        for (const k of Object.keys(existing.entries)) {
          if (!(k in data.entries)) data.entries[k] = existing.entries[k];
        }
      }
      // 软上限：条目过多时按 ts 升序淘汰最旧，避免缓存无限膨胀拖慢启动
      const keys = Object.keys(data.entries);
      if (keys.length > MAX_ENTRIES) {
        keys.sort((a, b) => (data.entries[a].ts || 0) - (data.entries[b].ts || 0));
        const toRemove = keys.length - Math.floor(MAX_ENTRIES * 0.9);
        for (let i = 0; i < toRemove; i++) delete data.entries[keys[i]];
      }
    }
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    // tmp 名带 process.pid：避免多进程并发竞写同一 tmp 损坏
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    try {
      fs.renameSync(tmp, cacheFile);
    } catch {
      try { fs.unlinkSync(cacheFile); } catch {}
      fs.renameSync(tmp, cacheFile);
    }
  } catch {
    // 缓存写失败不阻断主流程
  }
}

function lookup(data, en, precomputedId) {
  // 调用方已算过 hash 时可传入 precomputedId，避免重复 sha256（scan 的热路径）
  const key = precomputedId || hashKey(en);
  const e = data.entries[key];
  return e && e.zh ? e.zh : null;
}

function put(data, en, zh, provider) {
  data.entries[hashKey(en)] = { en, zh, provider: provider || "unknown", ts: Date.now() };
}

module.exports = { hashKey, load, save, lookup, put, MAX_ENTRIES };
