'use strict';

/*
 * 信息汇总 InfoHub — 零依赖本地服务
 * 运行：node server.js   （需要 Node.js 22.5+，使用内置 node:sqlite）
 * 数据：全部保存在 ./data/ 目录（SQLite 数据库 + 附件文件）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { URL } = require('url');

const { db, DATA_DIR, UPLOAD_DIR } = require('./db');
const { smartParse } = require('./lib/smartparse');
const { parseMultipart } = require('./lib/multipart');

const PORT = Number(process.env.PORT || 5757);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 100 * 1024 * 1024; // 单次请求上限 100MB

const CATEGORIES = ['notice', 'task', 'activity', 'file', 'other'];
const PLATFORMS = ['qq', 'wechat', 'other'];
const PALETTE = ['#4f6ef2', '#07c160', '#12b7f5', '#f97316', '#8b5cf6', '#ef4444', '#0ea5e9', '#14b8a6'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* ---------- 外部接入令牌（存 data/config.json） ---------- */
function loadConfig() {
  const p = path.join(DATA_DIR, 'config.json');
  let c = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) c = parsed;
  } catch (e) { /* 首次启动生成 */ }
  let changed = false;
  if (typeof c.ingestToken !== 'string' || !c.ingestToken) { c.ingestToken = crypto.randomBytes(16).toString('hex'); changed = true; }
  if (typeof c.password !== 'string') { c.password = ''; changed = true; }
  if (changed || !fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(c, null, 2));
  return c;
}
const CONFIG = loadConfig();

/* ---------- 自动备份（每天一份，保留最近 14 份） ---------- */
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function autoBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const target = path.join(BACKUP_DIR, `auto-${nowStr().slice(0, 10)}.db`);
    if (fs.existsSync(target)) return;
    db.exec(`VACUUM INTO '${target.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    while (files.length > 14) {
      const old = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch (e) { /* 忽略 */ }
    }
    console.log('已自动备份数据库 → ' + target);
    log('自动备份完成 → ' + target);
  } catch (e) {
    console.error('自动备份失败：' + e.message);
  }
}
autoBackup();
setInterval(autoBackup, 30 * 60 * 1000);

/* ---------- 访问密码（可选，存 data/config.json 的 password 字段） ---------- */
const sessions = new Set();          // 内存会话，重启后需重新登录
const loginFails = new Map();        // 登录失败限速：ip -> {n, t}
function hasSession(req) {
  const m = /(?:^|;\s*)infohub_session=([a-f0-9]{32,})/.exec(req.headers.cookie || '');
  return !!(m && sessions.has(m[1]));
}
function authOk(req) {
  if (!CONFIG.password) return true; // 未设密码 = 不启用访问控制（家庭局域网场景）
  if (hasSession(req)) return true;
  const x = req.headers['x-token'];  // 机器人/脚本用接入令牌也能通行
  return typeof x === 'string' && x !== '' && x === CONFIG.ingestToken;
}

/* ---------- 小工具 ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const DT_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/;
function cleanDT(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace('T', ' ').slice(0, 16);
  return DT_RE.test(s) ? s : null;
}
/* ---------- 文件日志（后台运行时也有迹可查） ---------- */
const LOG_FILE = path.join(DATA_DIR, 'logs', 'server.log');
function log(...args) {
  const line = `[${nowStr()}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) { /* 写不了文件就只打印 */ }
  console.log(line);
}
function sField(v, max) {
  const s = String(v == null ? '' : v).trim();
  return s.slice(0, max);
}
function sanitizeName(name) {
  let s = String(name || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  if (s === '.' || s === '..') s = 'file';
  return s.slice(0, 120) || 'file';
}
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}
function pickColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}
// 搜索词按字面匹配：转义 LIKE 通配符 % 和 _
function likeArg(s) {
  return '%' + String(s).replace(/([\\%_])/g, '\\$1') + '%';
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.wrote = true;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, '文件太大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ---------- 路由 ---------- */
const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
}
function matchRoute(method, pathname) {
  const segs = pathname.split('/').filter(Boolean);
  outer: for (const r of routes) {
    if (r.method !== method || r.parts.length !== segs.length) continue;
    const params = {};
    for (let i = 0; i < segs.length; i++) {
      const p = r.parts[i];
      if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if (p !== segs[i]) continue outer;
    }
    return { r, params };
  }
  return null;
}

/* ---------- 数据读取辅助 ---------- */
function attachItems(rows) {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const atts = db.prepare(`SELECT * FROM attachments WHERE message_id IN (${ph}) ORDER BY id`).all(...ids);
  const map = {};
  for (const a of atts) (map[a.message_id] ||= []).push(a);
  for (const r of rows) r.attachments = map[r.id] || [];
}
const MSG_SELECT = `SELECT m.*, g.name AS group_name, g.color AS group_color, g.platform AS group_platform
  FROM messages m LEFT JOIN groups g ON g.id = m.group_id`;
function getMessage(id) {
  const row = db.prepare(`${MSG_SELECT} WHERE m.id = ?`).get(id);
  if (!row) throw new HttpError(404, '信息不存在');
  attachItems([row]);
  return row;
}

/* ---------- 健康检查 / 配置 ---------- */
route('GET', '/api/health', () => ({ ok: true, time: nowStr() }));
route('POST', '/api/login', (ctx) => {
  if (!CONFIG.password) return { ok: true, authRequired: false };
  const ip = ctx.req.socket.remoteAddress || '?';
  const rec = loginFails.get(ip) || { n: 0, t: 0 };
  if (Date.now() - rec.t < 60000 && rec.n >= 10) throw new HttpError(429, '尝试次数过多，请一分钟后再试');
  const pw = String((ctx.body || {}).password || '');
  const a = Buffer.from(pw);
  const b = Buffer.from(CONFIG.password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    rec.n += 1; rec.t = Date.now(); loginFails.set(ip, rec);
    throw new HttpError(401, '密码不对');
  }
  loginFails.delete(ip);
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  ctx.res.setHeader('Set-Cookie', `infohub_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  log('登录成功，新会话已建立');
  return { ok: true };
});
route('POST', '/api/logout', (ctx) => {
  const m = /(?:^|;\s*)infohub_session=([a-f0-9]{32,})/.exec(ctx.req.headers.cookie || '');
  if (m) sessions.delete(m[1]);
  ctx.res.setHeader('Set-Cookie', 'infohub_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return { ok: true };
});
route('GET', '/api/me', (ctx) => ({
  authRequired: !!CONFIG.password,
  loggedIn: !CONFIG.password || hasSession(ctx.req),
  readOnly: !!CONFIG.password && !hasSession(ctx.req), // 只读访客：可浏览，不可增删改
}));
route('GET', '/api/config', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要登录');
  return {
    port: PORT,
    ingestToken: CONFIG.ingestToken,
    lanUrls: lanIPs().map((ip) => `http://${ip}:${PORT}`),
  };
});

/* ---------- 群管理 ---------- */
route('GET', '/api/groups', (ctx) => {
  const withCounts = ctx.query.get('withCounts');
  const rows = withCounts
    ? db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM messages m WHERE m.group_id = g.id) AS count
        FROM groups g ORDER BY g.id`).all()
    : db.prepare('SELECT * FROM groups ORDER BY id').all();
  return { items: rows };
});
route('POST', '/api/groups', (ctx) => {
  const b = ctx.body || {};
  const name = sField(b.name, 60);
  if (!name) throw new HttpError(400, '群名称不能为空');
  if (db.prepare('SELECT id FROM groups WHERE name = ?').get(name)) throw new HttpError(409, '已存在同名群，请换个名字');
  const platform = PLATFORMS.includes(b.platform) ? b.platform : 'other';
  const color = /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : pickColor();
  const info = db.prepare('INSERT INTO groups (name, platform, color, created_at) VALUES (?, ?, ?, ?)')
    .run(name, platform, color, nowStr());
  return { ok: true, id: Number(info.lastInsertRowid) };
});
route('PUT', '/api/groups/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const g = db.prepare('SELECT id FROM groups WHERE id = ?').get(id);
  if (!g) throw new HttpError(404, '群不存在');
  const b = ctx.body || {};
  const name = sField(b.name, 60);
  if (!name) throw new HttpError(400, '群名称不能为空');
  if (db.prepare('SELECT id FROM groups WHERE name = ? AND id <> ?').get(name, id)) throw new HttpError(409, '已存在同名群，请换个名字');
  const platform = PLATFORMS.includes(b.platform) ? b.platform : 'other';
  const color = /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : pickColor();
  db.prepare('UPDATE groups SET name = ?, platform = ?, color = ? WHERE id = ?').run(name, platform, color, id);
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
});
route('DELETE', '/api/groups/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  db.prepare('UPDATE messages SET group_id = NULL WHERE group_id = ?').run(id);
  db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  return { ok: true };
});

/* ---------- 信息（通知/任务） ---------- */
route('GET', '/api/messages', (ctx) => {
  const q = ctx.query;
  const where = [];
  const args = [];
  const gid = q.get('group_id');
  if (gid) { where.push('m.group_id = ?'); args.push(Number(gid) || 0); }
  const cat = q.get('category');
  if (cat && CATEGORIES.includes(cat)) { where.push('m.category = ?'); args.push(cat); }
  const st = q.get('status');
  if (st === 'open' || st === 'done') { where.push('m.status = ?'); args.push(st); }
  const search = (q.get('q') || '').trim();
  if (search) {
    where.push(`(m.title LIKE ? ESCAPE '\\' OR m.content LIKE ? ESCAPE '\\' OR m.sender_name LIKE ? ESCAPE '\\' OR m.tags LIKE ? ESCAPE '\\')`);
    const like = likeArg(search);
    args.push(like, like, like, like);
  }
  const sort = q.get('sort') === 'deadline' ? 'deadline' : 'time';
  const orderBy = sort === 'deadline'
    ? 'ORDER BY (CASE WHEN m.deadline IS NULL OR m.deadline = \'\' THEN 1 ELSE 0 END) ASC, m.deadline ASC, m.pinned DESC'
    : 'ORDER BY m.pinned DESC, m.received_at DESC, m.id DESC';
  const limit = Math.min(Number(q.get('limit')) || 50, 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM messages m ${whereSql}`).get(...args).c;
  const rows = db.prepare(`${MSG_SELECT} ${whereSql} ${orderBy} LIMIT ? OFFSET ?`)
    .all(...args, limit, offset);
  attachItems(rows);
  return { total, items: rows };
});

function getGroupRef(v) {
  if (v == null || v === '') return null;
  const id = Number(v);
  if (!Number.isInteger(id)) return null;
  const g = db.prepare('SELECT id FROM groups WHERE id = ?').get(id);
  return g ? g.id : null;
}

route('POST', '/api/messages', (ctx) => {
  const b = ctx.body || {};
  const title = sField(b.title, 120);
  const content = sField(b.content, 20000);
  if (!title && !content) throw new HttpError(400, '标题和内容至少填一项');
  const category = CATEGORIES.includes(b.category) ? b.category : 'notice';
  const status = b.status === 'done' ? 'done' : 'open';
  const received = cleanDT(b.received_at) || nowStr();
  const info = db.prepare(`INSERT INTO messages
      (title, content, category, status, group_id, sender_name, received_at, deadline, priority, pinned, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(title, content, category, status, getGroupRef(b.group_id), sField(b.sender_name, 60),
      received, cleanDT(b.deadline), b.priority ? 1 : 0, b.pinned ? 1 : 0, sField(b.tags, 200),
      nowStr(), nowStr());
  return getMessage(Number(info.lastInsertRowid));
});

route('GET', '/api/messages/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  return getMessage(id);
});

route('PUT', '/api/messages/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const old = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (!old) throw new HttpError(404, '信息不存在');
  const b = ctx.body || {};
  const v = {
    title: 'title' in b ? sField(b.title, 120) : old.title,
    content: 'content' in b ? sField(b.content, 20000) : old.content,
    category: CATEGORIES.includes(b.category) ? b.category : old.category,
    status: b.status === 'done' ? 'done' : b.status === 'open' ? 'open' : old.status,
    group_id: 'group_id' in b ? getGroupRef(b.group_id) : old.group_id,
    sender_name: 'sender_name' in b ? sField(b.sender_name, 60) : old.sender_name,
    received_at: 'received_at' in b ? (cleanDT(b.received_at) || '') : old.received_at,
    deadline: 'deadline' in b ? (cleanDT(b.deadline) || '') : old.deadline,
    priority: 'priority' in b ? (b.priority ? 1 : 0) : old.priority,
    pinned: 'pinned' in b ? (b.pinned ? 1 : 0) : old.pinned,
    tags: 'tags' in b ? sField(b.tags, 200) : old.tags,
  };
  if (!v.title && !v.content) throw new HttpError(400, '标题和内容至少填一项');
  db.prepare(`UPDATE messages SET title = ?, content = ?, category = ?, status = ?, group_id = ?,
      sender_name = ?, received_at = ?, deadline = ?, priority = ?, pinned = ?, tags = ?, updated_at = ?
      WHERE id = ?`)
    .run(v.title, v.content, v.category, v.status, v.group_id, v.sender_name, v.received_at,
      v.deadline, v.priority, v.pinned, v.tags, nowStr(), id);
  return getMessage(id);
});

route('POST', '/api/messages/:id/toggle', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  db.prepare(`UPDATE messages SET status = CASE WHEN status = 'open' THEN 'done' ELSE 'open' END,
      updated_at = ? WHERE id = ?`).run(nowStr(), id);
  return getMessage(id);
});
route('POST', '/api/messages/:id/pin', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  db.prepare('UPDATE messages SET pinned = 1 - pinned, updated_at = ? WHERE id = ?').run(nowStr(), id);
  return getMessage(id);
});

route('DELETE', '/api/messages/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const atts = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(id);
  for (const a of atts) {
    const fp = path.resolve(UPLOAD_DIR, a.stored_name);
    try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
  }
  db.prepare('DELETE FROM attachments WHERE message_id = ?').run(id);
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return { ok: true };
});

/* ---------- 附件 ---------- */
route('POST', '/api/upload', async (ctx) => {
  if (!ctx.raw) throw new HttpError(400, '需要 multipart 表单');
  const { fields, files } = parseMultipart(ctx.raw, ctx.req.headers['content-type'] || '');
  const mid = Number(fields.message_id);
  const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(mid);
  if (!msg) throw new HttpError(400, 'message_id 无效');
  const saved = [];
  for (const f of files) {
    const orig = sanitizeName(f.filename);
    const ext = (orig.match(/\.[A-Za-z0-9]{1,9}$/) || [''])[0].toLowerCase();
    const month = nowStr().slice(0, 7).replace('-', '');
    const dir = path.join(UPLOAD_DIR, month);
    fs.mkdirSync(dir, { recursive: true });
    const stored = crypto.randomBytes(8).toString('hex') + ext;
    fs.writeFileSync(path.join(dir, stored), f.data);
    const rel = path.relative(UPLOAD_DIR, path.join(dir, stored)).replace(/\\/g, '/');
    const info = db.prepare(`INSERT INTO attachments (message_id, orig_name, stored_name, size, mime, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .run(mid, orig, rel, f.data.length, sField(f.contentType, 100), nowStr());
    saved.push(Number(info.lastInsertRowid));
  }
  return { ok: true, ids: saved };
});

route('GET', '/api/attachments/:id/download', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  const fp = path.resolve(UPLOAD_DIR, a.stored_name);
  if (!fp.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(fp)) throw new HttpError(404, '文件已丢失');
  // 仅图片和 PDF 允许浏览器内联预览；其余（含 html/svg 等可执行内容）一律强制下载，避免同源脚本风险
  const inline = /^(image\/(png|jpeg|gif|webp|bmp)|application\/pdf)$/.test(a.mime || '');
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': a.mime || 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.orig_name)}`,
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(fp).pipe(res);
});

route('DELETE', '/api/attachments/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  const fp = path.resolve(UPLOAD_DIR, a.stored_name);
  try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
  db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
  return { ok: true };
});

route('GET', '/api/files', (ctx) => {
  const where = ['1=1'];
  const args = [];
  const gid = ctx.query.get('group_id');
  if (gid) { where.push('m.group_id = ?'); args.push(Number(gid) || 0); }
  const s = (ctx.query.get('q') || '').trim();
  if (s) {
    where.push(`(a.orig_name LIKE ? ESCAPE '\\' OR m.title LIKE ? ESCAPE '\\')`);
    const like = likeArg(s);
    args.push(like, like);
  }
  const limit = Math.min(Number(ctx.query.get('limit')) || 100, 300);
  const rows = db.prepare(`SELECT a.*, m.title AS message_title, m.status AS message_status, m.group_id,
      g.name AS group_name, g.platform AS group_platform
      FROM attachments a
      JOIN messages m ON m.id = a.message_id
      LEFT JOIN groups g ON g.id = m.group_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ?`).all(...args, limit);
  return { items: rows };
});

/* ---------- 智能解析（供前端"智能识别"按钮） ---------- */
route('POST', '/api/parse', (ctx) => {
  const text = String((ctx.body || {}).text || '').slice(0, 20000);
  return { parsed: smartParse(text) };
});

/* ---------- 外部接入 webhook（机器人 / 手机快捷指令） ---------- */
route('POST', '/api/ingest', (ctx) => {
  const token = ctx.query.get('token') || ctx.req.headers['x-token'] || '';
  if (token !== CONFIG.ingestToken) throw new HttpError(401, '令牌无效');
  const b = ctx.body || {};
  const text = sField(b.text, 20000);
  if (!text) throw new HttpError(400, 'text 不能为空');
  const parsed = smartParse(text);

  let gid = null;
  const groupName = sField(b.group || b.group_name, 60);
  if (groupName) {
    let g = db.prepare('SELECT id FROM groups WHERE name = ?').get(groupName);
    if (!g) {
      const platform = PLATFORMS.includes(b.platform) ? b.platform : 'other';
      const info = db.prepare('INSERT INTO groups (name, platform, color, created_at) VALUES (?, ?, ?, ?)')
        .run(groupName, platform, pickColor(), nowStr());
      gid = Number(info.lastInsertRowid);
    } else gid = g.id;
  }
  const received = cleanDT(b.received_at) || nowStr();
  const info = db.prepare(`INSERT INTO messages
      (title, content, category, status, group_id, sender_name, received_at, deadline, priority, tags, created_at, updated_at)
      VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(parsed.title || text.slice(0, 40), text, parsed.category, gid,
      sField(b.sender, 60) || parsed.sender || '', received, parsed.deadline || '',
      parsed.priority ? 1 : 0, (parsed.tags || []).join(','), nowStr(), nowStr());
  return { ok: true, id: Number(info.lastInsertRowid), parsed };
});

/* ---------- 导入备份 ---------- */
route('POST', '/api/import', (ctx) => {
  const b = ctx.body || {};
  if (!Array.isArray(b.groups) || !Array.isArray(b.messages)) {
    throw new HttpError(400, '备份文件格式不对（缺少 groups / messages）');
  }
  const exist = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c
    + db.prepare('SELECT COUNT(*) AS c FROM groups').get().c;
  if (exist > 0 && ctx.query.get('force') !== '1') {
    throw new HttpError(400, '当前已有数据，为防止重复导入被拒绝。请先用空数据文件夹再导入');
  }
  const insG = db.prepare('INSERT INTO groups (name, platform, color, remark, created_at) VALUES (?, ?, ?, ?, ?)');
  const gmap = {};
  for (const g of b.groups) {
    const info = insG.run(
      sField(g.name, 60) || '未命名群',
      PLATFORMS.includes(g.platform) ? g.platform : 'other',
      /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : pickColor(),
      sField(g.remark, 200),
      cleanDT(g.created_at) || nowStr());
    if (g.id != null) gmap[String(g.id)] = Number(info.lastInsertRowid);
  }
  const insM = db.prepare(`INSERT INTO messages
      (title, content, category, group_id, sender_name, received_at, deadline, priority, status, pinned, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let n = 0;
  const mmap = {}; // 旧 message_id → 新 id，供附件记录恢复关联
  for (const m of b.messages) {
    const info = insM.run(
      sField(m.title, 120),
      sField(m.content, 20000),
      CATEGORIES.includes(m.category) ? m.category : 'notice',
      m.group_id != null && gmap[String(m.group_id)] != null ? gmap[String(m.group_id)] : null,
      sField(m.sender_name, 60),
      cleanDT(m.received_at) || nowStr(),
      cleanDT(m.deadline) || '',
      m.priority ? 1 : 0,
      m.status === 'done' ? 'done' : 'open',
      m.pinned ? 1 : 0,
      sField(m.tags, 200),
      cleanDT(m.created_at) || nowStr(),
      nowStr());
    if (m.id != null) mmap[String(m.id)] = Number(info.lastInsertRowid);
    n++;
  }
  // 恢复附件记录（附件文件本身不在 JSON 里，需随 data/ 目录整体迁移）
  let nAtt = 0;
  if (Array.isArray(b.attachments)) {
    const insA = db.prepare(`INSERT INTO attachments (message_id, orig_name, stored_name, size, mime, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`);
    for (const a of b.attachments) {
      const mid = mmap[String(a.message_id)];
      if (!mid) continue; // 对应信息不在本次备份中，跳过
      const stored = sField(a.stored_name, 200).replace(/\\/g, '/');
      if (!stored || stored.includes('..') || stored.startsWith('/')) continue;
      insA.run(mid, sField(a.orig_name, 200), stored, Math.max(0, Number(a.size) || 0),
        sField(a.mime, 100), cleanDT(a.created_at) || nowStr());
      nAtt++;
    }
  }
  const summary = `${Object.keys(gmap).length} 个群、${n} 条信息、${nAtt} 条附件记录`;
  console.log('导入备份：' + summary);
  log('导入备份：' + summary);
  return { ok: true, groups: Object.keys(gmap).length, imported: n, attachments: nAtt };
});

/* ---------- 导出 .ics 日历（截止时间进手机系统日历） ---------- */
const CAT_LABEL = { notice: '通知', task: '任务', activity: '活动', file: '文件', other: '其他' };
route('GET', '/api/calendar.ics', (ctx) => {
  const rows = db.prepare(`SELECT m.id, m.title, m.content, m.category, m.deadline
      FROM messages m
      WHERE m.status = 'open' AND m.deadline IS NOT NULL AND m.deadline <> ''
      ORDER BY m.deadline LIMIT 500`).all();
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const stamp = nowStr().replace(/[-: ]/g, '') + '00';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//InfoHub//信息汇总//CN', 'X-WR-CALNAME:信息汇总·截止提醒', 'CALSCALE:GREGORIAN'];
  for (const m of rows) {
    const date = m.deadline.slice(0, 10).replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:infohub-${m.id}@infohub.local`);
    lines.push(`DTSTAMP:${stamp}`);
    if (m.deadline.length > 10) {
      lines.push(`DTSTART:${date}T${m.deadline.slice(11, 16).replace(':', '')}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${date}`);
    }
    lines.push(`SUMMARY:【${CAT_LABEL[m.category] || '事项'}】${icsEsc(m.title || '无标题')}`);
    lines.push(`DESCRIPTION:${icsEsc((m.content || '').slice(0, 500))}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const body = lines.join('\r\n') + '\r\n';
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="infohub-deadlines.ics"',
  });
  res.end(body);
});

/* ---------- 相似信息检测（防重复录入） ---------- */
route('POST', '/api/similar', (ctx) => {
  const b = ctx.body || {};
  const text = sField(b.text, 100).replace(/\s+/g, '');
  if (text.length < 8) return { items: [] };
  const excludeId = Number(b.excludeId) || 0;
  const like = likeArg(text.slice(0, 15));
  const rows = db.prepare(`SELECT id, title, received_at, category FROM messages
      WHERE (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\') AND id <> ?
      ORDER BY id DESC LIMIT 5`).all(like, like, excludeId);
  return { items: rows };
});

/* ---------- 统计 ---------- */
route('GET', '/api/stats', () => {
  const NOW = `strftime('%Y-%m-%d %H:%M','now','localtime')`;
  const DL = `(CASE WHEN length(deadline) = 10 THEN deadline || ' 23:59' ELSE deadline END)`;
  const total = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  const week = db.prepare(`SELECT COUNT(*) AS c FROM messages
      WHERE received_at >= strftime('%Y-%m-%d %H:%M','now','localtime','-6 days')`).get().c;
  const openTasks = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE status = 'open' AND category = 'task'`).get().c;
  const overdue = db.prepare(`SELECT COUNT(*) AS c FROM messages
      WHERE status = 'open' AND deadline IS NOT NULL AND deadline <> '' AND ${DL} < ${NOW}`).get().c;
  const upcoming = db.prepare(`${MSG_SELECT}
      WHERE m.status = 'open' AND m.deadline IS NOT NULL AND m.deadline <> ''
      AND ${DL.replace(/deadline/g, 'm.deadline')} >= ${NOW}
      AND ${DL.replace(/deadline/g, 'm.deadline')} <= strftime('%Y-%m-%d %H:%M','now','localtime','+7 days')
      ORDER BY m.deadline LIMIT 8`).all();
  const byGroup = db.prepare(`SELECT g.id, g.name, g.platform, g.color, COUNT(m.id) AS count
      FROM groups g LEFT JOIN messages m ON m.group_id = g.id
      GROUP BY g.id ORDER BY count DESC`).all();
  const byCategory = db.prepare('SELECT category, COUNT(*) AS c FROM messages GROUP BY category').all();
  return { total, week, openTasks, overdue, upcoming, byGroup, byCategory };
});

/* ---------- 导出备份 ---------- */
route('GET', '/api/export', (ctx) => {
  const dump = {
    exported_at: nowStr(),
    groups: db.prepare('SELECT * FROM groups ORDER BY id').all(),
    messages: db.prepare('SELECT * FROM messages ORDER BY id').all(),
    attachments: db.prepare('SELECT id, message_id, orig_name, stored_name, size, mime, created_at FROM attachments ORDER BY id').all(),
  };
  const body = JSON.stringify(dump, null, 2);
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="infohub-backup-${nowStr().slice(0, 10)}.json"`,
  });
  res.end(body);
});

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, pathname) {
  // 管理密码模式下页面照常开放（学生可浏览），登录页固定在 /login
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { p = pathname; }
  if (p === '/' || p === '') p = '/index.html';
  if (p === '/quick') p = '/quick.html';
  if (p === '/login') p = '/login.html';
  let fp = path.normalize(path.join(PUBLIC_DIR, p));
  if (fp !== PUBLIC_DIR && !fp.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    if (!path.extname(p)) fp = path.join(PUBLIC_DIR, 'index.html'); // 前端路由回退
    else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
  }
  const ext = path.extname(fp).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(fp).pipe(res);
}

/* ---------- HTTP 入口 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local');
  const pathname = u.pathname;

  if (pathname.startsWith('/api/')) {
    if (process.env.INFOHUB_DEBUG === '1') console.log('[debug]', req.method, pathname + u.search);
    // 不开放跨域：避免未设密码时，用户浏览器里打开的任意网页都能读取局域网内的数据。
    // 机器人 / 快捷指令走 curl 等非浏览器客户端，不受同源策略影响。
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    // 访问门禁：设了管理密码时，浏览（页面与查询接口）对所有人开放——学生可看；
    // 写入类操作需要管理员登录。机器人凭接入令牌通行（ingest 自带令牌校验，不在此拦截）。
    // /api/config 含接入令牌、/api/export 是全量备份，仅管理员可读；/api/parse 无副作用，保持开放。
    if (CONFIG.password && !authOk(req)
      && !['/api/login', '/api/logout', '/api/me', '/api/health', '/api/ingest', '/api/parse'].includes(pathname)
      && (req.method !== 'GET' || ['/api/config', '/api/export'].includes(pathname))) {
      sendJSON(res, 401, { error: '需要管理员登录', authRequired: true });
      return;
    }
    try {
      const m = matchRoute(req.method, pathname);
      if (!m) throw new HttpError(404, '接口不存在');
      const ctx = { req, res, query: u.searchParams, params: m.params };
      if (req.method === 'POST' || req.method === 'PUT') {
        const ct = req.headers['content-type'] || '';
        const raw = await readBody(req);
        if (ct.includes('multipart/form-data')) ctx.raw = raw;
        else {
          try { ctx.body = raw.length ? JSON.parse(raw.toString('utf8') || '{}') : {}; }
          catch (e) { throw new HttpError(400, 'JSON 格式错误'); }
        }
      }
      const out = await m.r.handler(ctx);
      if (!res.wrote && out !== undefined) sendJSON(res, 200, out);
      else if (!res.wrote) sendJSON(res, 200, { ok: true });
    } catch (e) {
      if (res.wrote) return;
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      sendJSON(res, status, { error: e.message || '服务器错误' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJSON(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  serveStatic(req, res, pathname);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  ⚠️  端口 ${PORT} 已被占用——很可能信息汇总已经在运行了。`);
    console.error(`  直接打开  http://localhost:${PORT}  即可使用；`);
    console.error(`  或换一个端口启动：  set PORT=8080 && node server.js`);
    process.exit(1);
  }
  throw e;
});

server.on('clientError', (err, socket) => {
  try { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch (e) { /* 忽略 */ }
});
// 后台长期运行：意外错误记日志但不退出（SQLite 操作是同步的，状态不会坏）
process.on('uncaughtException', (e) => { log('未捕获异常（已忽略，继续运行）:', (e && e.stack) || String(e)); });
process.on('unhandledRejection', (e) => { log('未处理的 Promise 拒绝:', (e && (e.stack || e.message)) || String(e)); });

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`📥 信息汇总 已启动  （Node ${process.version}）`);
  log(`本机访问：  http://localhost:${PORT}`);
  for (const ip of ips) log(`手机访问：  http://${ip}:${PORT}   （手机需与电脑同一 Wi-Fi）`);
  if (!ips.length) log('（未检测到局域网 IP，手机暂时无法访问）');
  log(`数据目录：  ${DATA_DIR}`);
  log(`管理密码：  ${CONFIG.password ? '已开启（所有人可浏览，增删改需管理员登录）' : '未设置（所有人可改，可在 data/config.json 的 password 字段设置后重启）'}`);
  log('关闭服务：  在本窗口按 Ctrl+C');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // 由 start.bat 启动时自动打开浏览器
  if (process.env.INFOHUB_OPEN === '1') {
    const u = `http://localhost:${PORT}`;
    try {
      const { exec } = require('child_process');
      if (process.platform === 'win32') exec(`start "" "${u}"`);
      else if (process.platform === 'darwin') exec(`open "${u}"`);
      else exec(`xdg-open "${u}"`);
    } catch (e) { /* 打不开也无妨 */ }
  }
});
