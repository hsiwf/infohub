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
const { smartParse, hasNoticeSignal } = require('./lib/smartparse');
const { parseMultipart } = require('./lib/multipart');
const JL = require('./lib/jielong');

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

/* ---------- 外部接入令牌 / OneBot 配置（存 data/config.json） ---------- */
function loadConfig() {
  const p = path.join(DATA_DIR, 'config.json');
  let c = null;
  try {
    c = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { /* 重新生成 */ }
  if (!c || typeof c !== 'object') c = {};
  // 逐字段补缺：不能整体覆盖，否则会把用户已设置的密码清掉
  if (typeof c.ingestToken !== 'string' || !c.ingestToken) c.ingestToken = crypto.randomBytes(16).toString('hex');
  if (typeof c.password !== 'string') c.password = '';
  // OneBot 11（QQ 机器人）接入配置：mode=review 消息先进「待审核」由人工收录（默认），
  // mode=auto 通过过滤后直接进信息流；token=access_token 鉴权；secret 非空时改用 HMAC 签名校验；
  // groups 为群白名单 { "QQ群号": "站内显示名" }，留空对象表示收录机器人所在的所有群
  c.onebot = Object.assign({ mode: 'review', token: '', secret: '', includePrivate: false, groups: {} }, c.onebot || {});
  // 防闲聊过滤（minLength/stopWords 两种模式都生效；keywords/adminsOnly/smart 仅 auto 模式参与）
  c.onebot.filter = Object.assign({
    minLength: 4,
    stopWords: ['收到', '收到收到', '好的', '好的收到', '嗯', '哦', '1', '+1', '666', 'ok', '谢谢', '谢谢老师', '哈哈', '哈哈哈', '哈哈哈哈'],
    keywords: [],      // 非空 = 只收录含任一关键词的消息，如 ['通知','作业','提交','截止']
    adminsOnly: false, // true = 只收录群主/管理员（通常是老师）的发言
    smart: false,      // true = 智能过滤：像通知/任务（有分类信号或截止时间）才收录
  }, c.onebot.filter || {});
  try { fs.writeFileSync(p, JSON.stringify(c, null, 2)); } catch (e) { /* 写不了就用内存值 */ }
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
function fmtSize(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}

/* ---------- OneBot 11 上报（QQ 机器人：NapCat / LLOneBot / Lagrange / go-cqhttp 等） ---------- */
const ONEBOT_CQ = {
  image: '[图片]', record: '[语音]', video: '[视频]', file: '[文件]',
  face: '', at: '', reply: '', music: '', node: '',
  json: '[卡片消息]', forward: '[合并转发]',
};
// OneBot 消息段数组 / CQ 码字符串统一成纯文本
function onebotText(msg) {
  if (Array.isArray(msg)) {
    return msg.map((seg) => {
      if (typeof seg === 'string') return seg;
      const d = (seg && seg.data) || {};
      if (seg.type === 'text') return d.text || '';
      if (seg.type === 'at') return d.qq === 'all' ? '@全体成员' : '';
      return ONEBOT_CQ[seg.type] !== undefined ? ONEBOT_CQ[seg.type] : '';
    }).join('').trim();
  }
  return String(msg || '').replace(/\[CQ:(\w+)[^\]]*\]/g, (s, t) => (ONEBOT_CQ[t] !== undefined ? ONEBOT_CQ[t] : '')).trim();
}
// OneBot 的 unix 秒时间 → 本地 "YYYY-MM-DD HH:MM"（超出合理范围按服务器时间处理）
function tsToLocal(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return null;
  const d = new Date(n * 1000);
  if (d.getFullYear() < 2020 || d.getTime() > Date.now() + 86400000) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function onebotSigOk(req, raw) {
  const secret = CONFIG.onebot.secret;
  if (!secret) return false;
  const sig = String(req.headers['x-signature'] || '');
  const expect = 'sha1=' + crypto.createHmac('sha1', secret).update(raw).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// 鉴权优先级：配置了 secret → 只认 HMAC 签名；否则认 access_token（query 或 Bearer 头）
function onebotAuthOk(req, query, raw) {
  if (CONFIG.onebot.secret) return onebotSigOk(req, raw);
  const token = CONFIG.onebot.token || CONFIG.ingestToken;
  const q = query.get('access_token');
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return (q === token) || (bearer !== '' && bearer === token);
}
// 按 ext_key（qq:群号）绑定站内群；没绑过但白名单里给了显示名 → 按名字绑定并回写 ext_key；都没有 → 自动建群
function bindOnebotGroup(qqGid, displayName) {
  const ext = 'qq:' + qqGid;
  const exist = db.prepare('SELECT * FROM groups WHERE ext_key = ?').get(ext);
  if (exist) return exist.id;
  const byName = db.prepare('SELECT * FROM groups WHERE name = ?').get(displayName);
  if (byName) {
    db.prepare('UPDATE groups SET ext_key = ? WHERE id = ?').run(ext, byName.id);
    return byName.id;
  }
  const info = db.prepare(`INSERT INTO groups (name, platform, color, ext_key, created_at) VALUES (?, 'qq', ?, ?, ?)`)
    .run(displayName, pickColor(), ext, nowStr());
  return Number(info.lastInsertRowid);
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
    onebot: {
      mode: CONFIG.onebot.mode || 'review',
      token: CONFIG.onebot.token || CONFIG.ingestToken,
      secretOn: !!CONFIG.onebot.secret,
      includePrivate: !!CONFIG.onebot.includePrivate,
      groups: CONFIG.onebot.groups || {},
      filter: CONFIG.onebot.filter,
    },
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
  // 截止时间范围筛选（due=after 未逾期 / due=overdue 已逾期）：
  // 大数据量下待办/日历只取相关区间，避免一年前的旧逾期把近期事项挤出分页
  const DLX = `(CASE WHEN m.deadline IS NULL OR m.deadline = '' THEN NULL WHEN length(m.deadline) = 10 THEN m.deadline || ' 23:59' ELSE m.deadline END)`;
  const due = q.get('due');
  if (due === 'after') { where.push(DLX + ' >= ?'); args.push(nowStr()); }
  else if (due === 'overdue') { where.push(DLX + ' < ?'); args.push(nowStr()); }
  const sort = q.get('sort') === 'deadline' ? 'deadline' : q.get('sort') === 'deadline_desc' ? 'deadline_desc' : 'time';
  const orderBy = sort === 'deadline'
    ? 'ORDER BY (CASE WHEN m.deadline IS NULL OR m.deadline = \'\' THEN 1 ELSE 0 END) ASC, m.deadline ASC, m.pinned DESC'
    : sort === 'deadline_desc'
      ? 'ORDER BY (CASE WHEN m.deadline IS NULL OR m.deadline = \'\' THEN 1 ELSE 0 END) ASC, m.deadline DESC, m.pinned DESC'
      : 'ORDER BY m.pinned DESC, m.received_at DESC, m.id DESC';
  const search = (q.get('q') || '').trim();
  if (search) {
    where.push(`(m.title LIKE ? ESCAPE '\\' OR m.content LIKE ? ESCAPE '\\' OR m.sender_name LIKE ? ESCAPE '\\' OR m.tags LIKE ? ESCAPE '\\')`);
    const like = likeArg(search);
    args.push(like, like, like, like);
  }
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

/* ---------- 附件 ---------- */
function serveAttachment(ctx, a, { inline, count, cache } = {}) {
  const fp = path.resolve(UPLOAD_DIR, a.stored_name);
  if (!fp.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(fp)) throw new HttpError(404, '文件已丢失');
  if (count === 'view') db.prepare('UPDATE attachments SET views = views + 1 WHERE id = ?').run(a.id);
  if (count === 'download') db.prepare('UPDATE attachments SET downloads = downloads + 1 WHERE id = ?').run(a.id);
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': a.mime || 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.orig_name)}`,
    'X-Content-Type-Options': 'nosniff',
    ...(cache ? { 'Cache-Control': 'public, max-age=3600' } : {}),
  });
  fs.createReadStream(fp).pipe(res);
}
route('GET', '/api/attachments/:id/download', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  // 仅图片和 PDF 允许浏览器内联预览；其余（含 html/svg 等可执行内容）一律强制下载，避免同源脚本风险
  const previewable = /^(image\/(png|jpeg|gif|webp|bmp)|application\/pdf)$/.test(a.mime || '');
  const forceDl = ctx.query.get('dl') === '1';
  const inline = previewable && !forceDl;
  // 计数规则：
  //  - 强制下载（?dl=1）或本身不可预览（点开即下载）→ 下载 +1
  //  - 可预览文件被打开阅读 → 阅读 +1；但 <img> 内嵌（Sec-Fetch-Dest: image）是页面渲染，不算
  if (forceDl || !inline) {
    serveAttachment(ctx, a, { inline, count: 'download' });
  } else if (String(ctx.req.headers['sec-fetch-dest'] || '') !== 'image') {
    serveAttachment(ctx, a, { inline, count: 'view' });
  } else {
    serveAttachment(ctx, a, { inline });
  }
});
// 缩略图专用：不计阅读数，允许浏览器缓存，信息流里同一张图反复渲染不会虚增统计
route('GET', '/api/attachments/:id/raw', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  serveAttachment(ctx, a, { inline: true, cache: true });
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
  const whereSql = where.join(' AND ');
  const rows = db.prepare(`SELECT a.*, m.title AS message_title, m.status AS message_status, m.group_id,
      g.name AS group_name, g.platform AS group_platform
      FROM attachments a
      JOIN messages m ON m.id = a.message_id
      LEFT JOIN groups g ON g.id = m.group_id
      WHERE ${whereSql} ORDER BY a.id DESC LIMIT ?`).all(...args, limit);
  // 全量统计（跟随当前筛选）：前端「累计阅读/下载」按这个数显示，而不是只汇总当前页
  const tot = db.prepare(`SELECT COALESCE(SUM(a.views), 0) AS views, COALESCE(SUM(a.downloads), 0) AS downloads
      FROM attachments a JOIN messages m ON m.id = a.message_id WHERE ${whereSql}`).get(...args);
  return { items: rows, totalViews: tot.views, totalDownloads: tot.downloads };
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

/* ---------- OneBot 11 HTTP POST 上报入口（QQ 群消息自动进站） ---------- */
function handleOnebotReport(ctx) {
  if (!onebotAuthOk(ctx.req, ctx.query, ctx.raw || Buffer.alloc(0))) throw new HttpError(401, '令牌无效');
  const b = ctx.body || {};
  const wl = CONFIG.onebot.groups || {};
  const wlKeys = Object.keys(wl);
  const gid = Number(b.group_id);
  const type = b.post_type;

  // 群文件上传通知：记一条“文件”消息（暂不下载文件本身）
  if (type === 'notice') {
    if (b.notice_type === 'group_upload' && Number.isInteger(gid) && (!wlKeys.length || wlKeys.includes(String(gid)))) {
      const f = b.file || {};
      const name = sField(f.name, 120);
      if (!name) return { ok: true, ignored: true };
      const size = Number(f.size) || 0;
      const bound = bindOnebotGroup(gid, (sField(wl[String(gid)], 60)) || `QQ群 ${gid}`);
      const text = `[文件] ${name}${size ? `（${fmtSize(size)}）` : ''}`;
      const info = db.prepare(`INSERT INTO messages
          (title, content, category, status, group_id, sender_name, received_at, created_at, updated_at)
          VALUES (?, ?, 'file', 'open', ?, 'QQ群文件', ?, ?, ?)`)
        .run(text, text, bound, tsToLocal(b.time) || nowStr(), nowStr(), nowStr());
      return { ok: true, id: Number(info.lastInsertRowid) };
    }
    return { ok: true, ignored: true };
  }
  if (type !== 'message') return { ok: true, ignored: true };

  const isGroup = b.message_type === 'group' && Number.isInteger(gid);
  const isPrivate = b.message_type === 'private';
  if (!isGroup && !(isPrivate && CONFIG.onebot.includePrivate)) return { ok: true, ignored: true };
  if (isGroup && wlKeys.length && !wlKeys.includes(String(gid))) return { ok: true, ignored: true };

  const text = onebotText(b.message != null ? b.message : b.raw_message);
  // 纯图片 / 表情等没有文字内容的消息不收录，避免刷屏
  if (!text || !text.replace(/\[(图片|语音|视频|文件|卡片消息|合并转发|表情)\]/g, '').trim()) {
    return { ok: true, ignored: true };
  }
  // 与手动录入接口同一口径：正文上限 20000 字
  const content = sField(text, 20000);

  // 水言过滤（两种模式都生效）：太短或命中屏蔽词的没有收录/审核价值
  const flt = CONFIG.onebot.filter || {};
  const plain = content.trim();
  const low = plain.toLowerCase();
  if (flt.minLength && plain.length < flt.minLength) return { ok: true, ignored: true, reason: 'too-short' };
  if ((flt.stopWords || []).some((w) => String(w).toLowerCase() === low)) return { ok: true, ignored: true, reason: 'stopword' };

  const sender = sField((b.sender && (b.sender.card || b.sender.nickname)) || '', 60);
  const received = tsToLocal(b.time) || nowStr();
  // 断线重连时框架可能补发最近消息：同人 + 同内容 + 5 分钟内视为重复上报，直接丢弃
  const ago = new Date(Date.now() - 5 * 60000);
  const agoStr = `${ago.getFullYear()}-${pad(ago.getMonth() + 1)}-${pad(ago.getDate())} ${pad(ago.getHours())}:${pad(ago.getMinutes())}`;

  // 人工审核模式（默认）：先进「待审核」，管理员在界面上挑着收录
  if ((CONFIG.onebot.mode || 'review') !== 'auto') {
    const dupMsg = db.prepare(`SELECT id FROM messages WHERE sender_name = ? AND content = ? AND received_at >= ? LIMIT 1`)
      .get(sender, content, agoStr);
    if (dupMsg) return { ok: true, deduped: true, id: dupMsg.id };
    const dupInbox = db.prepare(`SELECT id FROM inbox WHERE sender_name = ? AND content = ? AND received_at >= ? LIMIT 1`)
      .get(sender, content, agoStr);
    if (dupInbox) return { ok: true, deduped: true, id: dupInbox.id };
    const info = db.prepare(`INSERT INTO inbox (content, sender_name, group_name, qq_gid, received_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .run(content, sender, isGroup ? (sField(wl[String(gid)], 60) || `QQ群 ${gid}`) : '', isGroup ? String(gid) : '', received, nowStr());
    return { ok: true, inbox: true, id: Number(info.lastInsertRowid) };
  }

  // 自动收录模式：关键词 / 仅管理员 / 智能过滤（review 模式下这些由人工判断，不参与）
  if (flt.adminsOnly && (!isGroup || !['owner', 'admin'].includes(String((b.sender && b.sender.role) || '')))) {
    return { ok: true, ignored: true, reason: 'role' };
  }
  const kws = (flt.keywords || []).filter(Boolean);
  if (kws.length && !kws.some((k) => content.includes(k))) return { ok: true, ignored: true, reason: 'keyword' };
  if (flt.smart && !hasNoticeSignal(content)) return { ok: true, ignored: true, reason: 'chat' };

  let gidInternal = null;
  if (isGroup) {
    gidInternal = bindOnebotGroup(gid, (sField(wl[String(gid)], 60)) || `QQ群 ${gid}`);
    const dup = db.prepare(`SELECT id FROM messages WHERE group_id = ? AND sender_name = ? AND content = ? AND received_at >= ? LIMIT 1`)
      .get(gidInternal, sender, content, agoStr);
    if (dup) return { ok: true, deduped: true, id: dup.id };
  }

  const parsed = smartParse(content);
  const info = db.prepare(`INSERT INTO messages
      (title, content, category, status, group_id, sender_name, received_at, deadline, priority, tags, created_at, updated_at)
      VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(parsed.title || content.slice(0, 40), content, parsed.category, gidInternal, sender,
      received, parsed.deadline || '', parsed.priority ? 1 : 0, (parsed.tags || []).join(','), nowStr(), nowStr());
  return { ok: true, id: Number(info.lastInsertRowid), parsed };
}
route('POST', '/api/onebot/report', handleOnebotReport);
route('POST', '/api/onebot', handleOnebotReport);

/* ---------- 待审核收件箱（review 模式：QQ 消息先入箱，管理员挑着收录） ---------- */
function acceptInboxItem(id) {
  const item = db.prepare('SELECT * FROM inbox WHERE id = ?').get(id);
  if (!item) throw new HttpError(404, '待审核消息不存在');
  const gid = item.qq_gid ? bindOnebotGroup(item.qq_gid, item.group_name || `QQ群 ${item.qq_gid}`) : null;
  const parsed = smartParse(item.content);
  const info = db.prepare(`INSERT INTO messages
      (title, content, category, status, group_id, sender_name, received_at, deadline, priority, tags, created_at, updated_at)
      VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(parsed.title || item.content.slice(0, 40), item.content, parsed.category, gid, item.sender_name,
      item.received_at || nowStr(), parsed.deadline || '', parsed.priority ? 1 : 0, (parsed.tags || []).join(','), nowStr(), nowStr());
  db.prepare('DELETE FROM inbox WHERE id = ?').run(id);
  return Number(info.lastInsertRowid);
}
route('GET', '/api/inbox', (ctx) => {
  const limit = Math.min(Number(ctx.query.get('limit')) || 300, 500);
  const total = db.prepare('SELECT COUNT(*) AS c FROM inbox').get().c;
  const rows = db.prepare('SELECT * FROM inbox ORDER BY id DESC LIMIT ?').all(limit);
  return { total, items: rows };
});
route('POST', '/api/inbox/accept-all', () => {
  const ids = db.prepare('SELECT id FROM inbox ORDER BY id LIMIT 500').all().map((r) => r.id);
  for (const id of ids) acceptInboxItem(id);
  console.log(`待审核批量收录：${ids.length} 条`);
  return { ok: true, accepted: ids.length };
});
route('POST', '/api/inbox/:id/accept', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  return getMessage(acceptInboxItem(id));
});
route('DELETE', '/api/inbox/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const info = db.prepare('DELETE FROM inbox WHERE id = ?').run(id);
  if (!info.changes) throw new HttpError(404, '待审核消息不存在');
  return { ok: true };
});
route('DELETE', '/api/inbox', () => {
  const info = db.prepare('DELETE FROM inbox').run();
  return { ok: true, dismissed: Number(info.changes) };
});

/* ---------- 班级接龙（独立项目「接龙小助手」并入） ----------
 * 浏览公开（与信息流一致）；学生提交 /j/:id 无需登录；
 * 管理操作（编辑/停止/删除/导出）需要管理员登录，或凭该接龙的管理令牌 ?t=（可委托给班委）。
 * 数据存 SQLite：jielongs（含名单/字段 JSON）+ jielong_entries（按名单槽位 rid 匹配身份）。 */
function jielongFromRow(row) {
  if (!row) return null;
  const entries = db.prepare('SELECT * FROM jielong_entries WHERE jielong_id = ? ORDER BY seq, id').all(row.id)
    .map((r) => ({
      rid: r.rid == null ? null : Number(r.rid),
      id: r.sid || null,
      name: r.name,
      values: JL.safeJson(r.values_json, {}),
      remark: r.remark,
      time: Number(r.time) || 0,
      outside: !!r.outside,
    }));
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    deadline: row.deadline || '',
    roster: JL.safeJson(row.roster, []),
    fields: JL.safeJson(row.fields, []),
    allowOutside: !!row.allow_outside,
    closed: !!row.closed,
    adminToken: row.admin_token,
    createdAt: Number(row.created_at) || 0,
    entries,
  };
}
function getJielong(id) {
  return jielongFromRow(db.prepare('SELECT * FROM jielongs WHERE id = ?').get(String(id || '').toLowerCase()));
}
// 对外视图：不泄露管理令牌；附进度与自动截止状态
function jielongView(a) {
  const p = JL.progressOf(a);
  return {
    id: a.id, title: a.title, description: a.description, deadline: a.deadline,
    createdAt: a.createdAt, closed: a.closed, closedNow: JL.isClosed(a),
    fields: a.fields, allowOutside: a.allowOutside,
    roster: a.roster, hasRoster: p.hasRoster, total: p.total, done: p.done,
    count: a.entries.length,
    entries: a.entries.map((e) => ({ rid: e.rid, id: e.id, name: e.name, values: e.values, remark: e.remark, time: e.time, outside: !!e.outside })),
    missing: p.hasRoster ? p.missing : null,
  };
}
// 管理权双重校验：InfoHub 管理员登录，或该接龙自己的管理令牌（委托场景）
function jielongAdminOk(ctx, a) {
  if (authOk(ctx.req)) return true;
  const t = String(ctx.query.get('t') || '');
  return !!(a && a.adminToken && t && t === a.adminToken);
}
function saveJielongEntries(a) {
  const del = db.prepare('DELETE FROM jielong_entries WHERE jielong_id = ?');
  const ins = db.prepare(`INSERT INTO jielong_entries (jielong_id, rid, sid, name, values_json, remark, outside, time, seq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.exec('BEGIN');
  try {
    del.run(a.id);
    a.entries.forEach((e, i) => {
      // seq 固定为当前数组下标：修改提交只更新内容与时间，不改变名单里的先后次序
      ins.run(a.id, e.rid == null ? null : e.rid, e.id || '', e.name, JSON.stringify(e.values || {}),
        e.remark || '', e.outside ? 1 : 0, e.time || Date.now(), i);
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

route('GET', '/api/jielong', () => ({
  items: db.prepare('SELECT * FROM jielongs ORDER BY created_at DESC, id').all().map((row) => {
    const a = jielongFromRow(row);
    const p = JL.progressOf(a);
    return {
      id: a.id, title: a.title, description: a.description, deadline: a.deadline,
      createdAt: a.createdAt, closed: a.closed, closedNow: JL.isClosed(a),
      hasRoster: p.hasRoster, total: p.total, done: p.done, count: a.entries.length,
    };
  }),
}));

route('POST', '/api/jielong', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const b = ctx.body || {};
  const title = sField(b.title, 60);
  if (!title) throw new HttpError(400, '请填写接龙标题');
  const roster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
  if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
  const deadline = cleanDT(b.deadline) || '';
  const id = JL.genId(7);
  db.prepare(`INSERT INTO jielongs (id, title, description, deadline, roster, fields, allow_outside, closed, admin_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
    .run(id, title, sField(b.description, 1000), deadline, JSON.stringify(roster),
      JSON.stringify(JL.sanitizeFields(b.fields)), b.allowOutside === false ? 0 : 1,
      JL.genToken(), Date.now());
  return { ok: true, id, adminToken: db.prepare('SELECT admin_token FROM jielongs WHERE id = ?').get(id).admin_token };
});

route('GET', '/api/jielong/:id', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  const view = jielongView(a);
  // 管理员可取回管理令牌（生成委托给班委的管理链接）；普通访客不返回。
  // 未设密码时不返回——此时管理本就开放，令牌无需下发。
  if (CONFIG.password && authOk(ctx.req)) view.adminToken = a.adminToken;
  return view;
});

// 学生提交/更新接龙（同一身份重新提交即覆盖，便于修改）；无需登录
route('POST', '/api/jielong/:id/join', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (JL.isClosed(a)) throw new HttpError(400, '该接龙已截止，无法再提交');
  const b = ctx.body || {};
  const rawName = sField(b.name, 60);
  if (!rawName) throw new HttpError(400, '请填写姓名');

  // 身份匹配：优先用名单槽位序号（下拉/专属链接选定的），其次按学号/姓名文本匹配
  let rid = null, id = null, name = rawName, outside = false;
  if (a.roster.length) {
    let slot = null;
    if (Number.isInteger(b.rid) && b.rid >= 0 && b.rid < a.roster.length) {
      slot = { i: b.rid, r: a.roster[b.rid] };
    } else {
      const hits = JL.findRosterHits(a.roster, rawName);
      if (hits.length) {
        // 重名时优先绑定还没接龙的槽位
        slot = hits.find((h) => !a.entries.some((e) => !e.outside && e.rid === h.i)) || hits[0];
      }
    }
    if (slot) { rid = slot.i; id = slot.r.id; name = slot.r.name; }
    else outside = true;
  }
  if (outside && !a.allowOutside) {
    throw new HttpError(400, '「' + rawName + '」不在接龙名单中，请核对后从下拉列表中选择');
  }

  const vals = b.values && typeof b.values === 'object' ? b.values : {};
  const values = {};
  for (const f of a.fields) {
    let v = String(vals[f.key] == null ? '' : vals[f.key]).trim().slice(0, 300);
    if (f.required && !v) throw new HttpError(400, '请填写「' + f.label + '」');
    if (v) values[f.key] = v;
  }
  const remark = sField(b.remark, 300);
  const exist = a.entries.find((e) => outside
    ? (e.outside && e.rid == null && e.name === name)
    : (e.rid != null ? e.rid === rid : (!e.outside && e.name === name)));
  let updated = false;
  if (exist) {
    exist.rid = rid; exist.id = id; exist.name = name;
    exist.values = values;
    exist.remark = remark;
    exist.time = Date.now();
    exist.outside = outside;
    updated = true;
  } else {
    if (a.entries.length >= 1000) throw new HttpError(400, '接龙人数已达上限');
    a.entries.push({ rid, id, name, values, remark, time: Date.now(), outside });
  }
  saveJielongEntries(a);
  const p = JL.progressOf(a);
  return { ok: true, updated, count: a.entries.length, position: a.entries.length, done: p.done, total: p.total, entry: { rid, id, name } };
});

// 管理：编辑（标题/说明/截止/名单/开关）；名单变更后已接记录自动重新匹配
route('PUT', '/api/jielong/:id', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jielongAdminOk(ctx, a)) throw new HttpError(401, '令牌无效');
  const b = ctx.body || {};
  if (b.title !== undefined) {
    const t = sField(b.title, 60);
    if (!t) throw new HttpError(400, '标题不能为空');
    a.title = t;
  }
  if (b.description !== undefined) a.description = sField(b.description, 1000);
  if (b.deadline !== undefined) a.deadline = cleanDT(b.deadline) || '';
  if (b.allowOutside !== undefined) a.allowOutside = !!b.allowOutside;
  if (b.rosterRaw !== undefined) {
    const newRoster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
    if (newRoster.length > 500) throw new HttpError(400, '名单最多 500 人');
    a.roster = newRoster;
    if (newRoster.length) JL.rematchEntries(a, newRoster); // 无名单接龙编辑时保持记录不变
  }
  db.prepare(`UPDATE jielongs SET title = ?, description = ?, deadline = ?, roster = ?, allow_outside = ? WHERE id = ?`)
    .run(a.title, a.description, a.deadline, JSON.stringify(a.roster), a.allowOutside ? 1 : 0, a.id);
  saveJielongEntries(a);
  return jielongView(a);
});

// 管理：停止 / 重新开启
route('POST', '/api/jielong/:id/close', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jielongAdminOk(ctx, a)) throw new HttpError(401, '令牌无效');
  a.closed = !!(ctx.body || {}).closed;
  db.prepare('UPDATE jielongs SET closed = ? WHERE id = ?').run(a.closed ? 1 : 0, a.id);
  return { ok: true, closed: a.closed };
});

// 管理：删除整个接龙（含全部记录，不可恢复）
route('DELETE', '/api/jielong/:id', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jielongAdminOk(ctx, a)) throw new HttpError(401, '令牌无效');
  db.prepare('DELETE FROM jielong_entries WHERE jielong_id = ?').run(a.id);
  db.prepare('DELETE FROM jielongs WHERE id = ?').run(a.id);
  return { ok: true };
});

// 管理：删除某条接龙记录（优先按名单槽位 rid 定位，名单外记录按姓名）
route('DELETE', '/api/jielong/:id/entry', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jielongAdminOk(ctx, a)) throw new HttpError(401, '令牌无效');
  const ridQ = ctx.query.get('rid');
  const rid = ridQ !== null && ridQ !== '' ? Number(ridQ) : null;
  let i = -1;
  if (rid != null && !isNaN(rid)) {
    i = a.entries.findIndex((e) => !e.outside && e.rid === rid);
  } else {
    const nm = String(ctx.query.get('name') || '');
    i = a.entries.findIndex((e) => e.name === nm);
  }
  if (i >= 0) {
    a.entries.splice(i, 1);
    saveJielongEntries(a);
  }
  return { ok: true };
});

// 管理：导出 CSV（带 BOM，Excel 直接打开不乱码）
route('GET', '/api/jielong/:id/export', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jielongAdminOk(ctx, a)) throw new HttpError(401, '令牌无效');
  const body = JL.buildCsv(a);
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="jielong.csv"; filename*=UTF-8''${encodeURIComponent(a.title + '-接龙统计.csv')}`,
  });
  res.end(body);
});


/* ---------- 班级名单库（名单存一份，创建接龙 / 签箱时直接选用） ---------- */
route('GET', '/api/rosters', () => ({
  items: db.prepare('SELECT * FROM rosters ORDER BY updated_at DESC, id DESC').all().map((r) => {
    const keepId = !!r.keep_id;
    return {
      id: r.id, name: r.name, roster: r.roster, keepId,
      count: JL.parseRoster(r.roster, keepId).list.length, updated_at: r.updated_at,
    };
  }),
}));

// 按名称保存（同名覆盖），供前端"保存到名单库"调用
route('POST', '/api/rosters', (ctx) => {
  const b = ctx.body || {};
  const name = sField(b.name, 60);
  if (!name) throw new HttpError(400, '请填写名单名称');
  const keepId = b.keepId === true;
  const rosterRaw = String(b.rosterRaw || '');
  const list = JL.parseRoster(rosterRaw, keepId).list;
  if (!list.length) throw new HttpError(400, '名单不能为空');
  if (list.length > 500) throw new HttpError(400, '名单最多 500 人');
  const exist = db.prepare('SELECT id FROM rosters WHERE name = ?').get(name);
  if (exist) {
    db.prepare('UPDATE rosters SET roster = ?, keep_id = ?, updated_at = ? WHERE id = ?')
      .run(rosterRaw, keepId ? 1 : 0, nowStr(), exist.id);
    return { ok: true, id: exist.id, updated: true };
  }
  const info = db.prepare('INSERT INTO rosters (name, roster, keep_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, rosterRaw, keepId ? 1 : 0, nowStr(), nowStr());
  return { ok: true, id: Number(info.lastInsertRowid), updated: false };
});

route('DELETE', '/api/rosters/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const info = db.prepare('DELETE FROM rosters WHERE id = ?').run(id);
  if (!info.changes) throw new HttpError(404, '名单不存在');
  return { ok: true };
});

/* ---------- 抽签（按班级名单公平轮抽） ----------
 * 每个签箱绑定一份名单；抽过的人自动排除，下次不再被抽到；
 * 箱内抽空后自动开始新一轮；每轮结果留痕，可撤销、可重置。
 * 纯管理操作：走常规门禁（浏览公开，写入需管理员）。 */
function drawFromRow(row) {
  if (!row) return null;
  const rounds = db.prepare('SELECT * FROM draw_rounds WHERE draw_id = ? ORDER BY time, id').all(row.id)
    .map((r) => ({ picked: JL.safeJson(r.picked, []), count: Number(r.count) || 0, time: Number(r.time) || 0 }));
  return {
    id: row.id,
    title: row.title,
    roster: JL.safeJson(row.roster, []),
    perDraw: Math.max(1, Number(row.per_draw) || 1),
    createdAt: Number(row.created_at) || 0,
    rounds,
  };
}
function drawRemaining(d) {
  // 已抽判定优先按学号（改名后仍保持已抽状态，与接龙的重新匹配语义一致）；无学号按姓名
  const drawnIds = new Set();
  const drawnNames = new Set();
  for (const round of d.rounds) {
    for (const p of round.picked) {
      if (p.id) drawnIds.add(String(p.id));
      else drawnNames.add(p.name);
    }
  }
  return d.roster.filter((r) => (r.id ? !drawnIds.has(String(r.id)) : !drawnNames.has(r.name)));
}
function drawView(d) {
  const remaining = drawRemaining(d);
  return {
    id: d.id, title: d.title, perDraw: d.perDraw, createdAt: d.createdAt,
    roster: d.roster, total: d.roster.length, remainingCount: remaining.length, remaining,
    rounds: d.rounds, roundCount: d.rounds.length,
  };
}
function getDraw(id) {
  return drawFromRow(db.prepare('SELECT * FROM draws WHERE id = ?').get(String(id || '').toLowerCase()));
}

route('GET', '/api/draw', () => ({
  items: db.prepare('SELECT * FROM draws ORDER BY created_at DESC, id').all().map((row) => {
    const d = drawFromRow(row);
    return {
      id: d.id, title: d.title, perDraw: d.perDraw, createdAt: d.createdAt,
      total: d.roster.length, remainingCount: drawRemaining(d).length, roundCount: d.rounds.length,
    };
  }),
}));

route('POST', '/api/draw', (ctx) => {
  const b = ctx.body || {};
  const title = sField(b.title, 60);
  if (!title) throw new HttpError(400, '请填写抽签标题');
  const roster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
  if (!roster.length) throw new HttpError(400, '请粘贴名单，至少 1 人');
  if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
  const id = JL.genId(7);
  db.prepare('INSERT INTO draws (id, title, roster, per_draw, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, JSON.stringify(roster), Math.max(1, Math.min(Number(b.perDraw) || 1, roster.length)), Date.now());
  return { ok: true, id };
});

route('GET', '/api/draw/:id', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  return drawView(d);
});

route('POST', '/api/draw/:id/go', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  const b = ctx.body || {};
  let n = Math.max(1, Math.min(Number(b.count) || d.perDraw, 200));
  let remaining = drawRemaining(d);
  let reset = false;
  if (!remaining.length) {
    // 箱内已抽空：自动清空历史，开始新一轮
    db.prepare('DELETE FROM draw_rounds WHERE draw_id = ?').run(d.id);
    d.rounds = [];
    remaining = d.roster;
    reset = true;
  }
  n = Math.min(n, remaining.length); // 剩余不足时抽走剩余的全部
  const pool = remaining.slice();
  for (let i = pool.length - 1; i > 0; i--) { // Fisher-Yates，crypto.randomInt 无偏随机
    const j = crypto.randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, n);
  db.prepare('INSERT INTO draw_rounds (draw_id, picked, count, time) VALUES (?, ?, ?, ?)')
    .run(d.id, JSON.stringify(picked), n, Date.now());
  d.rounds.push({ picked, count: n, time: Date.now() });
  const left = drawRemaining(d).length;
  return { ok: true, picked, count: n, remainingCount: left, total: d.roster.length, reset };
});

route('POST', '/api/draw/:id/undo', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  const last = db.prepare('SELECT * FROM draw_rounds WHERE draw_id = ? ORDER BY id DESC LIMIT 1').get(d.id);
  if (!last) throw new HttpError(400, '还没有抽过，没有可撤销的轮次');
  db.prepare('DELETE FROM draw_rounds WHERE id = ?').run(last.id);
  const restored = JL.safeJson(last.picked, []);
  // 从库中重读再算剩余，避免用过期的内存状态
  const fresh = drawFromRow(db.prepare('SELECT * FROM draws WHERE id = ?').get(d.id));
  return { ok: true, restored, remainingCount: drawRemaining(fresh).length };
});

route('POST', '/api/draw/:id/reset', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  db.prepare('DELETE FROM draw_rounds WHERE draw_id = ?').run(d.id);
  return { ok: true, remainingCount: d.roster.length };
});

// 编辑（标题 / 名单 / 默认每次抽几人）；名单变更后按"学号+姓名"重新判断谁已抽过
route('PUT', '/api/draw/:id', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  const b = ctx.body || {};
  let roster = d.roster;
  if (b.rosterRaw !== undefined) {
    roster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
    if (!roster.length) throw new HttpError(400, '名单至少 1 人');
    if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
  }
  const title = b.title !== undefined ? sField(b.title, 60) : d.title;
  if (!title) throw new HttpError(400, '标题不能为空');
  const perDraw = b.perDraw !== undefined
    ? Math.max(1, Math.min(Number(b.perDraw) || 1, roster.length))
    : Math.min(d.perDraw, roster.length);
  db.prepare('UPDATE draws SET title = ?, roster = ?, per_draw = ? WHERE id = ?')
    .run(title, JSON.stringify(roster), perDraw, d.id);
  d.title = title; d.roster = roster; d.perDraw = perDraw;
  return drawView(d);
});

route('DELETE', '/api/draw/:id', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  db.prepare('DELETE FROM draw_rounds WHERE draw_id = ?').run(d.id);
  db.prepare('DELETE FROM draws WHERE id = ?').run(d.id);
  return { ok: true };
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
  let n = 0, nAtt = 0, nGroups = 0, nJl = 0, nJlE = 0, nDw = 0, nDwR = 0, nRs = 0;
  db.exec('BEGIN'); // 整体导入：任何一步失败就整体回滚，不残留半截数据
  try {
    const insG = db.prepare('INSERT INTO groups (name, platform, color, remark, ext_key, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const gmap = {};
    for (const g of b.groups) {
      const info = insG.run(
        sField(g.name, 60) || '未命名群',
        PLATFORMS.includes(g.platform) ? g.platform : 'other',
        /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : pickColor(),
        sField(g.remark, 200),
        sField(g.ext_key, 40),
        cleanDT(g.created_at) || nowStr());
      if (g.id != null) gmap[String(g.id)] = Number(info.lastInsertRowid);
    }
    const insM = db.prepare(`INSERT INTO messages
        (title, content, category, group_id, sender_name, received_at, deadline, priority, status, pinned, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
    // roster / fields / picked 允许存成 JSON 文本或数组对象，统一转成合法 JSON 文本入库
    const asJsonText = (v, fallback) => {
      if (typeof v === 'string') { try { JSON.parse(v); return v; } catch (e) { return fallback; } }
      if (v == null) return fallback;
      try { return JSON.stringify(v); } catch (e) { return fallback; }
    };
    // 恢复接龙与接龙记录（id 为随机字符串主键，原样保留；记录按 jielong_id 直接挂回）
    if (Array.isArray(b.jielongs)) {
    const insJ = db.prepare(`INSERT INTO jielongs (id, title, description, deadline, roster, fields, allow_outside, closed, admin_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const jlIds = new Set();
    for (const g of b.jielongs) {
      const id = /^[a-z0-9]{3,32}$/.test(String(g.id || '')) ? String(g.id) : JL.genId(7);
      insJ.run(id,
        sField(g.title, 60) || '未命名接龙',
        sField(g.description, 1000),
        cleanDT(g.deadline) || '',
        asJsonText(g.roster, '[]'),
        asJsonText(g.fields, '[]'),
        g.allow_outside === 0 || g.allowOutside === false ? 0 : 1,
        g.closed ? 1 : 0,
        sField(g.admin_token, 64),
        Math.max(0, Number(g.created_at) || Date.now()));
      jlIds.add(id);
      nJl++;
    }
    if (Array.isArray(b.jielongEntries)) {
      const insJE = db.prepare(`INSERT INTO jielong_entries (jielong_id, rid, sid, name, values_json, remark, outside, time, seq)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const e of b.jielongEntries) {
        if (!jlIds.has(String(e.jielong_id || ''))) continue; // 对应接龙不在本次备份中，跳过
        insJE.run(String(e.jielong_id),
          Number.isInteger(e.rid) ? e.rid : null,
          sField(e.sid, 40),
          sField(e.name, 60),
          asJsonText(e.values_json, '{}').slice(0, 5000),
          sField(e.remark, 300),
          e.outside ? 1 : 0,
          Math.max(0, Number(e.time) || 0),
          Math.max(0, Number(e.seq) || 0));
        nJlE++;
      }
    }
  }
  // 恢复抽签与轮次（id 原样保留；轮次按 draw_id 直接挂回）
  if (Array.isArray(b.draws)) {
    const insDw = db.prepare('INSERT INTO draws (id, title, roster, per_draw, created_at) VALUES (?, ?, ?, ?, ?)');
    const dwIds = new Set();
    for (const g of b.draws) {
      const id = /^[a-z0-9]{3,32}$/.test(String(g.id || '')) ? String(g.id) : JL.genId(7);
      insDw.run(id,
        sField(g.title, 60) || '未命名抽签',
        asJsonText(g.roster, '[]'),
        Math.max(1, Number(g.per_draw) || 1),
        Math.max(0, Number(g.created_at) || Date.now()));
      dwIds.add(id);
      nDw++;
    }
    if (Array.isArray(b.drawRounds)) {
      const insDR = db.prepare('INSERT INTO draw_rounds (draw_id, picked, count, time) VALUES (?, ?, ?, ?)');
      for (const e of b.drawRounds) {
        if (!dwIds.has(String(e.draw_id || ''))) continue; // 对应签箱不在本次备份中，跳过
        insDR.run(String(e.draw_id),
          asJsonText(e.picked, '[]'),
          Math.max(0, Number(e.count) || 0),
          Math.max(0, Number(e.time) || 0));
        nDwR++;
      }
    }
  }
  // 恢复名单库
  if (Array.isArray(b.rosters)) {
    const insR = db.prepare('INSERT INTO rosters (name, roster, keep_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
    for (const g of b.rosters) {
      insR.run(sField(g.name, 60) || '未命名名单', String(g.roster || ''), g.keep_id ? 1 : 0,
        cleanDT(g.created_at) || nowStr(), cleanDT(g.updated_at) || nowStr());
      nRs++;
    }
  }
    nGroups = Object.keys(gmap).length;
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw new HttpError(500, '导入失败已整体回滚（' + e.message + '），数据库未变动');
  }
  const summary = `${nGroups} 个群、${n} 条信息、${nAtt} 条附件记录、${nJl} 个接龙、${nJlE} 条接龙记录、${nDw} 个抽签、${nDwR} 轮抽签历史、${nRs} 份名单`;
  console.log('导入备份：' + summary);
  log('导入备份：' + summary);
  return { ok: true, groups: nGroups, imported: n, attachments: nAtt, jielongs: nJl, jielongEntries: nJlE, draws: nDw, drawRounds: nDwR, rosters: nRs };
});

/* ---------- 导出 .ics 日历（截止时间进手机系统日历） ---------- */
const CAT_LABEL = { notice: '通知', task: '任务', activity: '活动', file: '文件', other: '其他' };
route('GET', '/api/calendar.ics', (ctx) => {
  // 只导出未逾期事项：大数据量下按截止升序的前 500 条早已是陈年旧账
  const DLX = `(CASE WHEN m.deadline IS NULL OR m.deadline = '' THEN NULL WHEN length(m.deadline) = 10 THEN m.deadline || ' 23:59' ELSE m.deadline END)`;
  const rows = db.prepare(`SELECT m.id, m.title, m.content, m.category, m.deadline
      FROM messages m
      WHERE m.status = 'open' AND m.deadline IS NOT NULL AND m.deadline <> '' AND ${DLX} >= ?
      ORDER BY m.deadline LIMIT 500`).all(nowStr());
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
    attachments: db.prepare('SELECT id, message_id, orig_name, stored_name, size, mime, views, downloads, created_at FROM attachments ORDER BY id').all(),
    // 接龙：id 是随机字符串主键，导出/导入可原样保留，记录按 jielong_id 直接挂回
    jielongs: db.prepare('SELECT id, title, description, deadline, roster, fields, allow_outside, closed, admin_token, created_at FROM jielongs ORDER BY created_at, id').all(),
    jielongEntries: db.prepare('SELECT jielong_id, rid, sid, name, values_json, remark, outside, time, seq FROM jielong_entries ORDER BY jielong_id, seq, id').all(),
    // 抽签：同上，签箱 id 原样保留，轮次按 draw_id 直接挂回
    draws: db.prepare('SELECT id, title, roster, per_draw, created_at FROM draws ORDER BY created_at, id').all(),
    drawRounds: db.prepare('SELECT draw_id, picked, count, time FROM draw_rounds ORDER BY draw_id, id').all(),
    rosters: db.prepare('SELECT * FROM rosters ORDER BY id').all(),
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
  if (/^\/j\/[a-z0-9]+$/i.test(p)) p = '/jielong-join.html'; // 学生接龙页，接龙 ID 由页面脚本从路径解析
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
    // /api/jielong/* 同理白名单放行：浏览公开、学生提交无需登录，管理操作由接口自己校验
    // 管理员登录或该接龙的管理令牌（可委托给班委）。
    // /api/config 含接入令牌、/api/export 是全量备份，仅管理员可读；/api/parse 无副作用，保持开放。
    if (CONFIG.password && !authOk(req)
      && !pathname.startsWith('/api/jielong')
      && !['/api/login', '/api/logout', '/api/me', '/api/health', '/api/ingest', '/api/parse',
        '/api/onebot/report', '/api/onebot'].includes(pathname)
      && (req.method !== 'GET' || ['/api/config', '/api/export', '/api/inbox'].includes(pathname))) {
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
        ctx.raw = raw; // OneBot 签名校验和 multipart 解析都要用原始字节
        if (!ct.includes('multipart/form-data')) {
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
