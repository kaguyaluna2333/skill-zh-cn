// lib/cjk.js — CJK 字符比例检测，判断 description 是否已经是中文
// 被 scan.js 调用，跳过已中文化的条目。

"use strict";

// 返回字符串中 CJK / 全角字符占非空白字符的比例，[0, 1]。
// CJK 占比超过此阈值视为已是中文，跳过翻译
const CJK_RATIO_THRESHOLD = 0.3;

function isCjkCode(c) {
  return (
    (c >= 0x4e00 && c <= 0x9fff) || // CJK 统一表意文字
    (c >= 0x3400 && c <= 0x4dbf) || // 扩展 A
    (c >= 0xf900 && c <= 0xfaff) || // 兼容表意文字
    (c >= 0x3000 && c <= 0x303f) || // CJK 标点符号
    (c >= 0xff00 && c <= 0xffef)    // 全角字符
  );
}

function cjkRatio(s) {
  if (!s) return 0;
  let cjk = 0;
  let total = 0;
  const str = String(s);
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c > 0x20 && c !== 0x2028 && c !== 0x2029) total++; // 非空白才计入分母
    if (isCjkCode(c)) cjk++;
  }
  return total === 0 ? 0 : cjk / total;
}

// CJK 字符绝对计数：description 含 N 个中文字符即视为已是中文（跳过翻译）。
// 补 cjkRatio 的盲区——中英混合描述（如「跨宿主（Claude Code / zcode）的 skill 汉化」）
// 中文为主但英文产品名多导致 ratio 卡阈值下，用绝对计数兜底（Bug 5）。
const CJK_COUNT_THRESHOLD = 3;
function cjkCount(s) {
  if (!s) return 0;
  let cjk = 0;
  const str = String(s);
  for (const ch of str) {
    if (isCjkCode(ch.codePointAt(0))) cjk++;
  }
  return cjk;
}

module.exports = { cjkRatio, cjkCount, CJK_RATIO_THRESHOLD, CJK_COUNT_THRESHOLD };
