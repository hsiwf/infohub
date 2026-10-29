'use strict';

/*
 * 班级接龙核心逻辑（纯函数，零依赖）
 * 从独立项目「接龙小助手」并入：名单解析、身份匹配、进度统计、CSV 导出
 */

const crypto = require('crypto');

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LEN = ID_CHARS.length; // 31，用于消除模偏差
// 阈值：小于此值的字节直接取模，保证均匀分布（256 - (256 % 31) = 248）
const ID_THRESHOLD = 256 - (256 % ID_LEN);
function genId(len) {
  const b = crypto.randomBytes(len * 2); // 多取字节，遇到偏差值时跳过
  let s = '';
  for (let i = 0, j = 0; i < len && j < b.length; j++) {
    if (b[j] < ID_THRESHOLD) {
      s += ID_CHARS[b[j] % ID_LEN];
      i++;
    }
  }
  return s;
}
function isIdToken(t) { return /^\d{1,12}$/.test(t); }
function safeJson(s, fallback) {
  try { const v = JSON.parse(s); return v == null ? fallback : v; } catch (e) { return fallback; }
}

// 解析名单文本：支持每行一个、逗号/顿号/分号/空格/Tab 分隔；
// keepId 为 true 时保留"学号 姓名"里的学号，否则按纯姓名处理（去掉序号、学号）
function parseRoster(raw, keepId) {
  const result = { list: [], hasIds: false };
  if (!raw) return result;
  let pendingId = null;    // 独立成行的学号，挂到下一个名字上（学号列在前）
  let lastNameNoId = -1;   // 最近一个没有学号的名字，独立成行的学号也可回填给它（姓名列在前）
  const seen = new Set();
  const push = (id, name) => {
    name = String(name).replace(/[，,。;；、.]+$/, '').trim();
    if (!name) return;
    id = id ? String(id) : null;
    const key = (id || '') + '|' + name;
    if (seen.has(key)) return;
    seen.add(key);
    if (id) { result.hasIds = true; lastNameNoId = -1; }
    else lastNameNoId = result.list.length;
    result.list.push({ id, name });
  };
  for (let line of String(raw).split(/[\n\r]+/)) {
    line = line
      .replace(/^[([（【]?\d{1,4}\s*[.、)】）\]]\s*/, '')        // 行首序号：1. / 01、 / （3）
      .replace(/(^|\s)[([（【]?\d{1,4}\s*[.、)】）\]]/g, '$1')    // 行中序号
      .replace(/^[-*•·]+\s*/, '')
      .trim();
    if (!line) continue;
    for (let seg of line.split(/[,，、;；]+/)) {
      seg = seg.trim();
      if (!seg) continue;
      const tokens = seg.split(/\s+/).filter(Boolean);
      const idIdx = tokens.findIndex(isIdToken);
      if (tokens.length === 1) {
        const t = tokens[0];
        if (isIdToken(t)) {
          if (keepId) {
            if (lastNameNoId >= 0) {   // 回填给上一个没学号的名字
              result.list[lastNameNoId].id = t;
              result.hasIds = true;
              lastNameNoId = -1;
            } else {
              pendingId = t;
            }
          }
          continue;
        }
        push(keepId ? pendingId : null, t);
        pendingId = null;
      } else if (idIdx >= 0) {
        // 多 token 段的数字有三种可能：小序号（"1 张三 2023001"）、学号、或被误拆的内容。
        // 策略：先剥掉 1-2 位的小序号，再让每个姓名就近配一个学号，学号不再被当成姓名入库。
        // 段内没有任何 ≥3 位学号时，行首 1-2 位数字只能是序号（"1 张三"），
        // 不能当学号 1 配给姓名——否则假学号入库，学生用真实学号登录时全部失配
        const hasRealId = tokens.some((t) => isIdToken(t) && t.length >= 3);
        const seqLike = tokens.length >= 3 && /^\d{1,2}$/.test(tokens[0]) && tokens.slice(1).some((t) => isIdToken(t));
        let toks = seqLike ? tokens.slice(1) : tokens;
        if (!hasRealId && toks.length >= 2 && /^\d{1,2}$/.test(toks[0])) toks = toks.slice(1);
        const idOf = new Map(); // 姓名所在下标 -> 配对的学号
        for (let ii = 0; ii < toks.length; ii++) {
          if (!isIdToken(toks[ii])) continue;
          if (ii > 0 && !isIdToken(toks[ii - 1]) && !idOf.has(ii - 1)) idOf.set(ii - 1, toks[ii]);
          else {
            let j = ii + 1;
            while (j < toks.length && isIdToken(toks[j])) j++;
            if (j < toks.length && !idOf.has(j)) idOf.set(j, toks[ii]);
          }
        }
        for (let k = 0; k < toks.length; k++) {
          if (isIdToken(toks[k])) continue;
          push(keepId ? (idOf.get(k) || null) : null, toks[k]);
        }
        pendingId = null;
      } else {
        tokens.forEach(t => { push(keepId ? pendingId : null, t); pendingId = null; });
      }
    }
  }
  return result;
}

// 自定义填写项清洗：最多 8 项，select 至少 2 个选项
function sanitizeFields(raw) {
  if (!Array.isArray(raw)) return [];
  const types = ['text', 'textarea', 'select'];
  const out = [];
  for (const f of raw.slice(0, 8)) {
    if (!f || typeof f !== 'object') continue;
    const label = String(f.label || '').trim().slice(0, 30);
    if (!label) continue;
    let type = types.includes(f.type) ? f.type : 'text';
    let options = Array.isArray(f.options)
      ? f.options.map(o => String(o).trim().slice(0, 50)).filter(Boolean).slice(0, 20)
      : [];
    if (type === 'select' && options.length < 2) type = 'text';
    out.push({ key: 'f' + out.length, label, type, options, required: !!f.required });
  }
  return out;
}

// 截止时间统一口径：纯日期按当天 23:59（本地时间），与信息中心 DEADLINE_EXPR 一致
function deadlineDate(s) {
  const str = String(s || '');
  if (!str) return null;
  const d = new Date(str.length === 10 ? str + 'T23:59' : str.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}
// a.deadline 为 "YYYY-MM-DD HH:MM"（或纯日期），到点自动截止
function isClosed(a) {
  if (!!a.closed) return true;
  const d = deadlineDate(a.deadline);
  return !!(d && Date.now() > d.getTime());
}

// 按名单"槽位"统计：学号+姓名唯一确定一个人，重名也不会互相覆盖
function progressOf(a) {
  if (!a.roster.length) {
    return { hasRoster: false, total: a.entries.length, done: a.entries.length, missing: [] };
  }
  const doneRids = new Set(a.entries.filter(e => !e.outside && e.rid != null).map(e => e.rid));
  const missing = a.roster
    .map((r, i) => ({ id: r.id, name: r.name, i }))
    .filter(x => !doneRids.has(x.i));
  return { hasRoster: true, total: a.roster.length, done: a.roster.length - missing.length, missing };
}

// 名单变更后重新匹配已接记录：优先"学号+姓名"，学号相同视为同一人（如改名）；
// 其次按姓名唯一匹配（重名时不抢已认领的槽位）；都找不到转为"名单外"
function rematchEntries(a, newRoster) {
  const claimed = new Set();
  for (const e of a.entries) {
    if (e.outside) continue;
    let hit = -1;
    if (e.id) {
      hit = newRoster.findIndex(r => r.id && r.id === e.id && r.name === e.name);
      if (hit < 0) hit = newRoster.findIndex(r => r.id && r.id === e.id);
    }
    if (hit < 0) {
      const nameHits = [];
      newRoster.forEach((r, i) => { if (r.name === e.name && !claimed.has(i)) nameHits.push(i); });
      if (nameHits.length) hit = nameHits[0];
    }
    if (hit >= 0) {
      claimed.add(hit);
      e.rid = hit;
      e.id = newRoster[hit].id;
      e.name = newRoster[hit].name;
    } else {
      e.rid = null;
      e.outside = true;
    }
  }
}

// 导出 CSV（带 BOM，Excel 直接打开不乱码）
function buildCsv(a, withIds = true) {
  const escCell = (v) => {
    v = String(v == null ? '' : v);
    // 中和 Excel 公式注入：学生提交的内容以公式触发字符开头时，加 ' 前缀让它按文本处理
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const fmtTs = ts => {
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const hasAnyId = withIds && (a.roster.some(r => r.id) || a.entries.some(e => e.id));
  const rows = [['序号', ...(hasAnyId ? ['学号'] : []), '姓名', '状态', ...a.fields.map(f => f.label), '备注', '名单外', '提交时间']];
  a.entries.forEach((e, i) => {
    rows.push([i + 1, ...(hasAnyId ? [e.id || ''] : []), e.name, '已接龙', ...a.fields.map(f => e.values[f.key] || ''), e.remark || '', e.outside ? '是' : '', fmtTs(e.time)]);
  });
  const p = progressOf(a);
  p.missing.forEach(m => rows.push([rows.length, ...(hasAnyId ? [m.id || ''] : []), m.name, '未接龙', ...a.fields.map(() => ''), '', '', '']));
  return '\uFEFF' + rows.map(r => r.map(escCell).join(',')).join('\r\n');
}

module.exports = {
  genId, isIdToken, safeJson, deadlineDate,
  parseRoster, sanitizeFields,
  isClosed, progressOf, rematchEntries, buildCsv,
};
