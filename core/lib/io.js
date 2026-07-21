// lib/io.js — 安全读写工具（零依赖）
// safeWrite: 起手即私有的原子写，消除 write→chmod 之间的 world-readable 窗口。
// readText:  文件不存在/不可读时返回 null，不抛。

"use strict";

const fs = require("fs");

function safeWrite(file, content) {
  const tmp = `${file}.zh-cn-tmp.${process.pid}`;
  // 起手即私有（0o600）：writeFileSync 默认随 umask 可能 world-readable，
  // 此处显式锁定权限，彻底关闭「写完到 chmod 之前」的可读窗口。
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  // 还原原文件权限；原文件不存在（新建）时保留 0o600
  try { fs.chmodSync(tmp, fs.statSync(file).mode); } catch {}
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    if (e && e.code === "EXDEV") {
      // 跨设备：rename 不可用，用 copy 覆盖原文件再清 tmp。
      // 绝不 unlink 原文件——丢译文比回退到英文代价大得多。
      fs.copyFileSync(tmp, file);
      try { fs.unlinkSync(tmp); } catch {}
    } else {
      // 其它错误：清理 tmp 后原样抛出，不掩盖问题，不无脑删原文件。
      try { fs.unlinkSync(tmp); } catch {}
      throw e;
    }
  }
}

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return null; }
}

module.exports = { safeWrite, readText };
