// lib/metadata.js — 插件元数据 JSON（plugin.json / marketplace.json）的 description 提取/写回
// 与 frontmatter.js 对称：md 走 frontmatter，JSON 走这里。
// 备份用 _description_en，标记用 _zh_cn_translated（下划线前缀，避免与官方字段冲突）。
// marketplace.json 的多个 description（顶层 + plugins[] 每项）分别处理。

"use strict";

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 提取所有应翻译的 description 位置：plugin.json 顶层 + marketplace.json 的 plugins[]
function extractDescriptions(obj) {
  const out = [];
  if (obj && typeof obj.description === "string") {
    out.push({ jsonPath: "$.description", en: obj.description });
  }
  if (obj && obj.metadata && typeof obj.metadata.description === "string") {
    out.push({ jsonPath: "$.metadata.description", en: obj.metadata.description });
  }
  if (obj && Array.isArray(obj.plugins)) {
    obj.plugins.forEach((p, i) => {
      if (p && typeof p.description === "string") {
        out.push({ jsonPath: `$.plugins[${i}].description`, en: p.description });
      }
    });
  }
  return out;
}

// 取 jsonPath 对应的 owner 对象（持有 description 字段的对象）
function getOwner(obj, jsonPath) {
  if (!obj) return null;
  if (jsonPath === "$.description") return obj;
  if (jsonPath === "$.metadata.description") return obj.metadata || null;
  const m = /^\$\.plugins\[(\d+)\]\.description$/.exec(jsonPath);
  if (m && Array.isArray(obj.plugins)) return obj.plugins[+m[1]] || null;
  return null;
}

function isPathTranslated(obj, jsonPath) {
  const owner = getOwner(obj, jsonPath);
  return !!(owner && owner._zh_cn_translated);
}

// 应用译文（原地修改 owner）
function applyTranslation(obj, jsonPath, zh, en) {
  const owner = getOwner(obj, jsonPath);
  if (!owner) return;
  owner.description = zh;
  owner._description_en = en;
  owner._zh_cn_translated = true;
}

// 还原单个 owner：description = _description_en，删备份与标记
function restoreOwner(owner) {
  if (owner && owner._zh_cn_translated && typeof owner._description_en === "string") {
    owner.description = owner._description_en;
    delete owner._description_en;
    delete owner._zh_cn_translated;
  }
}

// 还原整个 JSON 对象的所有已译 description
function restoreAll(obj) {
  if (!obj) return;
  restoreOwner(obj);
  if (obj.metadata) restoreOwner(obj.metadata);
  if (Array.isArray(obj.plugins)) obj.plugins.forEach(restoreOwner);
}

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

// 行级 patch JSON 文本：替换 description 值 + 插入/更新 _description_en + _zh_cn_translated，
// 保持其余字节（数组单行/多行等格式）不变——避免 serialize 把单行数组展开成多行（Bug 3）。
// items: [{jsonPath, en, zh}]。返回新文本；无需改 / en 定位不到 / 格式无法保持 → null（apply 回退 serialize）。
function applyToJsonText(text, items) {
  const lines = text.split(/\r?\n/);
  const insertions = [];
  // 撞文修复：同 en 不同 item 必须分到不同行。用 claimed 集合记住已 claim 的行号，
  // 每个 item 的搜索从上一个匹配位置之后继续，跳过已 claim 的 idx。
  const claimed = new Set();
  let searchFrom = 0;
  for (const it of items) {
    if (!it.en || !it.zh) continue;
    const enPat = jsonStrForRegex(it.en);
    const re = new RegExp('^(\\s*)"description"\\s*:\\s*"' + enPat + '"(,?)\\s*$');
    let idx = -1;
    for (let i = searchFrom; i < lines.length; i++) {
      if (claimed.has(i)) continue;
      if (re.test(lines[i])) { idx = i; break; }
    }
    // 回退：items 非文档序时，向前搜索未 claim 的匹配行。
    if (idx < 0) {
      for (let i = 0; i < searchFrom; i++) {
        if (claimed.has(i)) continue;
        if (re.test(lines[i])) { idx = i; break; }
      }
    }
    if (idx < 0) continue;
    claimed.add(idx);
    searchFrom = idx + 1;
    const m = re.exec(lines[idx]);
    const indent = m[1];
    let enIdx = -1, markerIdx = -1;
    for (let i = idx + 1; i < lines.length; i++) {
      const tl = lines[i].trim();
      if (/^[}\]]/.test(tl)) break;
      if (/^"_description_en"\s*:/.test(tl)) enIdx = i;
      else if (/^"_zh_cn_translated"\s*:/.test(tl)) markerIdx = i;
    }
    // markerLine 逗号修复：marker 已存在（更新分支）时，逗号由 markerIdx 的下一非空行决定；
    // 否则由 description 行的下一非空行决定（marker 将被插到 idx+1，其后即原 idx+1 行）。
    const closeFromIdx = markerIdx >= 0 ? markerIdx + 1 : idx + 1;
    let nextIsClose = false;
    for (let i = closeFromIdx; i < lines.length; i++) {
      const tl = lines[i].trim();
      if (!tl) continue;
      nextIsClose = /^[}\]]/.test(tl);
      break;
    }
    insertions.push({ idx, indent, en: it.en, zh: it.zh, nextIsClose, enIdx, markerIdx });
  }
  if (insertions.length === 0) return null;
  insertions.sort((a, b) => b.idx - a.idx); // 从后往前，避免 idx 偏移
  for (const ins of insertions) {
    const { idx, indent, en, zh, nextIsClose, enIdx, markerIdx } = ins;
    lines[idx] = `${indent}"description": "${jsonStrQuote(zh)}",`;
    const enLine = `${indent}"_description_en": "${jsonStrQuote(en)}",`;
    const markerLine = `${indent}"_zh_cn_translated": true${nextIsClose ? "" : ","}`;
    // 更新分支修复：enIdx 与 markerIdx 独立判断。各自 >=0 则就地更新该行；缺谁插谁（插在 idx+1）。
    if (enIdx >= 0) lines[enIdx] = enLine;
    if (markerIdx >= 0) lines[markerIdx] = markerLine;
    const toInsert = [];
    if (enIdx < 0) toInsert.push(enLine);
    if (markerIdx < 0) toInsert.push(markerLine);
    if (toInsert.length > 0) lines.splice(idx + 1, 0, ...toInsert);
  }
  const out = lines.join("\n");
  try { JSON.parse(out); return out; } catch { return null; } // 格式损坏 → null，apply 回退 serialize
}

function jsonStrQuote(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
// it.en 是实际值；原文里是 JSON 字符串转义形式。先 stringify 拿转义形式，再 regex escape。
function jsonStrForRegex(s) {
  const jsonEscaped = JSON.stringify(s).slice(1, -1);
  return jsonEscaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  tryParse,
  extractDescriptions,
  isPathTranslated,
  applyTranslation,
  restoreAll,
  serialize,
  applyToJsonText,
};
