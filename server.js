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
const zlib = require('zlib');
const { URL } = require('url');

const { db, DATA_DIR, UPLOAD_DIR } = require('./db');
const { smartParse, hasNoticeSignal } = require('./lib/smartparse');
const { parseMultipart } = require('./lib/multipart');
const JL = require('./lib/jielong');
const safeJson = JL.safeJson; // 投票的 roster / options / choices 均为 JSON 文本字段，读取统一走安全解析

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
  // apiToken 与 ingestToken 分离：前者是管理接口凭证（X-Token），后者只能投递通知——
  // 快捷指令/机器人常把令牌发到群里或存进第三方，泄露投递令牌不应等于泄露管理员
  if (typeof c.apiToken !== 'string' || !c.apiToken || c.apiToken === c.ingestToken) {
    if (c.apiToken === c.ingestToken) console.error('config.json 中 apiToken 与 ingestToken 相同，已自动重新生成 apiToken');
    c.apiToken = crypto.randomBytes(16).toString('hex');
  }
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
    // 顺手清掉历史失败留下的半截临时文件（正式轮换的匹配规则只认 .db，管不到它们）
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      if (f.endsWith('.db.tmp')) { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (e) { /* 忽略 */ } }
    }
    // 先写临时文件再改名：VACUUM 中途失败（磁盘满 / 断电）不会留下顶掉好备份的半截文件
    const tmp = target + '.tmp';
    try { fs.unlinkSync(tmp); } catch (e) { /* 不存在 */ }
    db.exec(`VACUUM INTO '${tmp.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    fs.renameSync(tmp, target);
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

/* ---------- 附件目录清扫：删除磁盘上已无数据库引用的孤儿文件 ---------- */
// 出处：Windows 下文件被占用导致删除信息时 unlink 失败、上传写盘后进程崩溃等。
// 启动时扫一遍 + 每 24 小时一次；跳过 1 小时内的新文件，避免误删正在上传的内容。
function sweepOrphanUploads() {
  try {
    const known = new Set(db.prepare('SELECT stored_name FROM attachments').all().map((r) => String(r.stored_name).replace(/\//g, path.sep)));
    const cutoff = Date.now() - 3600 * 1000;
    let removed = 0;
    const scan = (dir, depth) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, f.name);
        if (f.isDirectory()) { if (depth < 2) scan(fp, depth + 1); continue; }
        if (known.has(path.relative(UPLOAD_DIR, fp))) continue;
        try {
          if (fs.statSync(fp).mtimeMs > cutoff) continue;
          fs.unlinkSync(fp);
          removed++;
        } catch (e) { /* 单个文件失败不影响整体 */ }
      }
    };
    scan(UPLOAD_DIR, 0);
    if (removed) {
      console.log(`附件清扫：移除 ${removed} 个无引用文件`);
      log(`附件清扫：移除 ${removed} 个无引用文件`);
    }
  } catch (e) {
    console.error('附件清扫失败：' + e.message);
  }
}
sweepOrphanUploads();
setInterval(sweepOrphanUploads, 24 * 60 * 60 * 1000);

/* ---------- 访问密码（可选，存 data/config.json 的 password 字段） ---------- */
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 与 Cookie Max-Age 一致（30 天）
const sessions = new Map();         // 内存会话：token -> 登录时间，重启后需重新登录
const loginFails = new Map();       // 登录失败限速：ip -> {n, t}
function hasSession(req) {
  const m = /(?:^|;\s*)infohub_session=([a-f0-9]{32,})/.exec(req.headers.cookie || '');
  const t = m && sessions.get(m[1]);
  if (!t) return false;
  if (Date.now() - t > SESSION_TTL) { sessions.delete(m[1]); return false; } // 过期会话惰性清除
  return true;
}
// 常量时间字符串比较：令牌/密码校验不暴露"第几位不匹配"的时序信息
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function authOk(req) {
  if (!CONFIG.password) return true; // 未设密码 = 不启用访问控制（家庭局域网场景）
  if (hasSession(req)) return true;
  const x = req.headers['x-token'];  // 机器人/脚本用管理接口令牌（apiToken）通行；投递令牌 ingestToken 不再具备管理权限
  return typeof x === 'string' && x !== '' && safeEqual(x, CONFIG.apiToken);
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
/* ---------- 敏感操作审计（data/logs/audit.log：时间 + 来源 IP + 动作） ---------- */
// 覆盖：删除信息 / 名单增删改 / 投票编辑停止删除 / 备份导出导入 / 登录成功。
// 局限：直连部署记到的是本机地址；经反向代理时需自行透传真实 IP。
const AUDIT_FILE = path.join(DATA_DIR, 'logs', 'audit.log');
function audit(ctx, action, detail) {
  try {
    const ip = (ctx && ctx.req && ctx.req.socket.remoteAddress) || '?';
    const line = `[${nowStr()}] ${ip} ${action}${detail ? ' ' + detail : ''}`;
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, line + '\n');
  } catch (e) { /* 审计失败不影响主流程 */ }
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
  const q = query.get('access_token') || '';
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return (q !== '' && safeEqual(q, token)) || (bearer !== '' && safeEqual(bearer, token));
}
// 按 ext_key（qq:群号）绑定站内群；没绑过但白名单里给了显示名 → 按名字绑定并回写 ext_key；都没有 → 自动建群
function bindOnebotGroup(qqGid, displayName) {
  const ext = 'qq:' + qqGid;
  const exist = db.prepare('SELECT * FROM groups WHERE ext_key = ?').get(ext);
  if (exist) return exist.id;
  const byName = db.prepare('SELECT * FROM groups WHERE name = ?').get(displayName);
  if (byName && !byName.ext_key) {
    // 只认领还没绑过其它 QQ 群的同名群：两个 QQ 群配了相同显示名时，
    // 否则后上报的会改写前者的 ext_key，两个群的消息来回混进同一个站内群
    db.prepare('UPDATE groups SET ext_key = ? WHERE id = ?').run(ext, byName.id);
    return byName.id;
  }
  const info = db.prepare(`INSERT INTO groups (name, platform, color, ext_key, created_at) VALUES (?, 'qq', ?, ?, ?)`)
    .run(displayName, pickColor(), ext, nowStr());
  return Number(info.lastInsertRowid);
}

function sendJSON(res, code, obj) {
  let body = JSON.stringify(obj);
  res.wrote = true;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' };
  // 大于 1KB 的 JSON 按 Accept-Encoding gzip（列表类响应体积可降 70%+，node:zlib 零依赖）
  const enc = String((res.req && res.req.headers['accept-encoding']) || '');
  if (body.length > 1024 && /\bgzip\b/i.test(enc)) {
    headers['Content-Encoding'] = 'gzip';
    body = zlib.gzipSync(body);
  }
  res.writeHead(code, headers);
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
      if (p.startsWith(':')) {
        try { params[p.slice(1)] = decodeURIComponent(segs[i]); }
        catch (e) { throw new HttpError(400, '链接格式错误'); } // 解码失败属客户端错误，返回 400 而非 500
      }
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
// 截止时间比较口径：纯日期自动补到当天 23:59，空值返回 NULL（列表筛选 / 统计 / 日历导出共用）
const DEADLINE_EXPR = `(CASE WHEN m.deadline IS NULL OR m.deadline = '' THEN NULL WHEN length(m.deadline) = 10 THEN m.deadline || ' 23:59' ELSE m.deadline END)`;
// 浏览器内联预览白名单：仅位图与 PDF；html/svg 等可执行内容一律强制下载（防同源脚本）
const PREVIEWABLE_RE = /^(image\/(png|jpeg|gif|webp|bmp)|application\/pdf)$/;
function getMessage(id) {
  const row = db.prepare(`${MSG_SELECT} WHERE m.id = ?`).get(id);
  if (!row) throw new HttpError(404, '信息不存在');
  attachItems([row]);
  return row;
}
// 智能解析 + 入库：webhook 接入、机器人自动收录、待审核收录三条路径共用同一口径
function insertParsedMessage(content, { groupId = null, sender = '', received } = {}) {
  const parsed = smartParse(content);
  const info = db.prepare(`INSERT INTO messages
      (title, content, category, status, group_id, sender_name, received_at, deadline, priority, tags, created_at, updated_at)
      VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(parsed.title || content.slice(0, 40), content, parsed.category, groupId,
      sender || parsed.sender || '', received || nowStr(), parsed.deadline || '',
      parsed.priority ? 1 : 0, (parsed.tags || []).join(','), nowStr(), nowStr());
  return { id: Number(info.lastInsertRowid), parsed };
}

/* ---------- 健康检查 / 配置 ---------- */
const PKG = require('./package.json');
const STARTED_AT = Date.now();
route('GET', '/api/health', () => ({
  ok: true,
  time: nowStr(),
  version: PKG.version,
  uptime: Math.round((Date.now() - STARTED_AT) / 1000),
}));
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
  sessions.set(token, Date.now());
  ctx.res.setHeader('Set-Cookie', `infohub_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  audit(ctx, '登录成功');
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
    apiToken: CONFIG.apiToken,
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
  const due = q.get('due');
  if (due === 'after') { where.push(DEADLINE_EXPR + ' >= ?'); args.push(nowStr()); }
  else if (due === 'overdue') { where.push(DEADLINE_EXPR + ' < ?'); args.push(nowStr()); }
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
  const limit = Math.min(Math.max(Number(q.get('limit')) || 50, 1), 200);
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
  const info = db.prepare('SELECT title FROM messages WHERE id = ?').get(id);
  db.prepare('DELETE FROM attachments WHERE message_id = ?').run(id);
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  audit(ctx, '删除信息', `id=${id}${info && info.title ? '「' + info.title + '」' : ''}`);
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
  const written = [];
  try {
    for (const f of files) {
      const orig = sanitizeName(f.filename);
      const ext = (orig.match(/\.[A-Za-z0-9]{1,9}$/) || [''])[0].toLowerCase();
      const month = nowStr().slice(0, 7).replace('-', '');
      const dir = path.join(UPLOAD_DIR, month);
      fs.mkdirSync(dir, { recursive: true });
      const stored = crypto.randomBytes(8).toString('hex') + ext;
      const fp0 = path.join(dir, stored);
      fs.writeFileSync(fp0, f.data);
      written.push(fp0);
      const rel = path.relative(UPLOAD_DIR, fp0).replace(/\\/g, '/');
      const info = db.prepare(`INSERT INTO attachments (message_id, orig_name, stored_name, size, mime, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
        .run(mid, orig, rel, f.data.length, sField(f.contentType, 100), nowStr());
      saved.push(Number(info.lastInsertRowid));
    }
  } catch (e) {
    // 多文件上传中途失败（如磁盘满）：把本次已写盘的文件和已入库的记录一并回滚，不留孤儿
    for (const id of saved) { try { db.prepare('DELETE FROM attachments WHERE id = ?').run(id); } catch (e2) { /* 忽略 */ } }
    for (const fp0 of written) { try { fs.unlinkSync(fp0); } catch (e2) { /* 留给清扫任务 */ } }
    throw e;
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
  const stream = fs.createReadStream(fp);
  // 头已发出，读流失败（文件被并发删除/权限变化）只能断开连接，避免响应永不结束
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
route('GET', '/api/attachments/:id/download', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  // 仅图片和 PDF 允许浏览器内联预览（白名单见 PREVIEWABLE_RE）；其余一律强制下载，避免同源脚本风险
  const previewable = PREVIEWABLE_RE.test(a.mime || '');
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
// 缩略图专用：不计阅读数，允许浏览器缓存，信息流里同一张图反复渲染不会虚增统计。
// 与 /download 同一类型白名单：非位图/PDF 一律转附件下载，防止 HTML/SVG 借此同源内联渲染
route('GET', '/api/attachments/:id/raw', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  const previewable = PREVIEWABLE_RE.test(a.mime || '');
  serveAttachment(ctx, a, { inline: previewable, cache: previewable });
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
  // 按信息完成状态过滤（status=open 只看未完成信息的附件 / status=done 只看已完成的）；缺省返回全部
  const st = ctx.query.get('status');
  if (st === 'open' || st === 'done') { where.push('m.status = ?'); args.push(st); }
  const limit = Math.min(Math.max(Number(ctx.query.get('limit')) || 100, 1), 300);
  const offset = Math.max(Number(ctx.query.get('offset')) || 0, 0);
  const whereSql = where.join(' AND ');
  const rows = db.prepare(`SELECT a.*, m.title AS message_title, m.status AS message_status, m.group_id,
      g.name AS group_name, g.platform AS group_platform
      FROM attachments a
      JOIN messages m ON m.id = a.message_id
      LEFT JOIN groups g ON g.id = m.group_id
      WHERE ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  // 全量统计（跟随当前筛选）：前端「累计阅读/下载」按这个数显示，而不是只汇总当前页
  const tot = db.prepare(`SELECT COALESCE(SUM(a.views), 0) AS views, COALESCE(SUM(a.downloads), 0) AS downloads
      FROM attachments a JOIN messages m ON m.id = a.message_id WHERE ${whereSql}`).get(...args);
  const cnt = db.prepare(`SELECT COUNT(*) AS c FROM attachments a JOIN messages m ON m.id = a.message_id WHERE ${whereSql}`).get(...args);
  return { items: rows, total: cnt.c, totalViews: tot.views, totalDownloads: tot.downloads };
});

/* ---------- 智能解析（供前端"智能识别"按钮） ---------- */
route('POST', '/api/parse', (ctx) => {
  const text = String((ctx.body || {}).text || '').slice(0, 20000);
  return { parsed: smartParse(text) };
});

/* ---------- 外部接入 webhook（机器人 / 手机快捷指令） ---------- */
route('POST', '/api/ingest', (ctx) => {
  // 投递令牌（ingestToken）与管理令牌（apiToken）都能投递通知——前者泄露不再波及管理权限
  const token = ctx.query.get('token') || ctx.req.headers['x-token'] || '';
  const ok = token !== '' && (safeEqual(token, CONFIG.ingestToken) || safeEqual(token, CONFIG.apiToken));
  if (!ok) throw new HttpError(401, '令牌无效');
  const b = ctx.body || {};
  const text = sField(b.text, 20000);
  if (!text) throw new HttpError(400, 'text 不能为空');

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
  const { id, parsed } = insertParsedMessage(text, {
    groupId: gid,
    sender: sField(b.sender, 60),
    received: cleanDT(b.received_at) || nowStr(),
  });
  return { ok: true, id, parsed };
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
      // 文件通知与消息一样要做补发去重：同人入口 + 同内容 + 5 分钟内只记一条
      const agoF = new Date(Date.now() - 5 * 60000);
      const agoFStr = `${agoF.getFullYear()}-${pad(agoF.getMonth() + 1)}-${pad(agoF.getDate())} ${pad(agoF.getHours())}:${pad(agoF.getMinutes())}`;
      const dupFile = db.prepare('SELECT id FROM messages WHERE group_id = ? AND content = ? AND received_at >= ? LIMIT 1')
        .get(bound, text, agoFStr);
      if (dupFile) return { ok: true, deduped: true, id: dupFile.id };
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
    // 去重必须带上群归属：两个班群 5 分钟内出现相同内容是常态，不能互相误判成重复上报
    const bound = isGroup ? (db.prepare('SELECT id FROM groups WHERE ext_key = ?').get('qq:' + gid) || {}).id : null;
    const dupMsg = db.prepare(`SELECT id FROM messages WHERE sender_name = ? AND content = ? AND received_at >= ? AND group_id IS ? LIMIT 1`)
      .get(sender, content, agoStr, bound ?? null);
    if (dupMsg) return { ok: true, deduped: true, id: dupMsg.id };
    const dupInbox = db.prepare(`SELECT id FROM inbox WHERE sender_name = ? AND content = ? AND received_at >= ? AND qq_gid = ? LIMIT 1`)
      .get(sender, content, agoStr, isGroup ? String(gid) : '');
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
  } else {
    // 私聊（includePrivate 开启时）与群消息一样要补发去重，否则框架重连后同一私聊重复入库
    const dup = db.prepare(`SELECT id FROM messages WHERE group_id IS NULL AND sender_name = ? AND content = ? AND received_at >= ? LIMIT 1`)
      .get(sender, content, agoStr);
    if (dup) return { ok: true, deduped: true, id: dup.id };
  }

  const { id, parsed } = insertParsedMessage(content, { groupId: gidInternal, sender, received });
  return { ok: true, id, parsed };
}
route('POST', '/api/onebot/report', handleOnebotReport);
route('POST', '/api/onebot', handleOnebotReport);

/* ---------- 待审核收件箱（review 模式：QQ 消息先入箱，管理员挑着收录） ---------- */
function acceptInboxItem(id) {
  const item = db.prepare('SELECT * FROM inbox WHERE id = ?').get(id);
  if (!item) throw new HttpError(404, '待审核消息不存在');
  const gid = item.qq_gid ? bindOnebotGroup(item.qq_gid, item.group_name || `QQ群 ${item.qq_gid}`) : null;
  const { id: mid } = insertParsedMessage(item.content, {
    groupId: gid,
    sender: item.sender_name,
    received: item.received_at || nowStr(),
  });
  db.prepare('DELETE FROM inbox WHERE id = ?').run(id);
  return mid;
}
route('GET', '/api/inbox', (ctx) => {
  const limit = Math.min(Math.max(Number(ctx.query.get('limit')) || 300, 1), 500);
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
  return !!(a && a.adminToken && t && safeEqual(t, a.adminToken));
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
      const r0 = a.roster[b.rid];
      // 名单可能被编辑过：rid 指向的槽位与提交的姓名对不上时不再盲信 rid，退回按姓名匹配。
      // 按词精确比较而非子串包含：防止「张三丰」带着「张三」的 rid 时误绑到张三头上
      const words = rawName.split(/\s+/).filter(Boolean);
      const matches = rawName === r0.name
        || (r0.id && words.includes(r0.id))
        || words.some((w) => w === r0.name);
      if (matches) slot = { i: b.rid, r: r0 };
    }
    if (!slot) {
      const hits = JL.findRosterHits(a.roster, rawName);
      if (hits.length) {
        // 重名时优先绑定还没接龙的槽位；全部已认领且命中不止一个，
        // 说明是重名学生用裸姓名提交，无法确定身份——绝不猜一个槽位去覆盖别人的记录
        slot = hits.find((h) => !a.entries.some((e) => !e.outside && e.rid === h.i));
        if (!slot) {
          if (hits.length === 1) slot = hits[0]; // 唯一匹配：本人再次提交即覆盖更新
          else throw new HttpError(409, '「' + rawName + '」在名单中有重名且均已接龙，请从下拉列表选择带学号的一项');
        }
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
    audit(ctx, '保存名单（覆盖同名）', '「' + name + '」' + list.length + ' 人');
    return { ok: true, id: exist.id, updated: true };
  }
  const info = db.prepare('INSERT INTO rosters (name, roster, keep_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, rosterRaw, keepId ? 1 : 0, nowStr(), nowStr());
  audit(ctx, '新建名单', '「' + name + '」' + list.length + ' 人');
  return { ok: true, id: Number(info.lastInsertRowid), updated: false };
});

// 编辑名单：改名 / 改内容 / 改是否保留学号（名单库视图调用）
route('PUT', '/api/rosters/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const old = db.prepare('SELECT id FROM rosters WHERE id = ?').get(id);
  if (!old) throw new HttpError(404, '名单不存在');
  const b = ctx.body || {};
  const name = sField(b.name, 60);
  if (!name) throw new HttpError(400, '请填写名单名称');
  const keepId = b.keepId === true;
  const rosterRaw = String(b.rosterRaw || '');
  const list = JL.parseRoster(rosterRaw, keepId).list;
  if (!list.length) throw new HttpError(400, '名单不能为空');
  if (list.length > 500) throw new HttpError(400, '名单最多 500 人');
  const clash = db.prepare('SELECT id FROM rosters WHERE name = ? AND id <> ?').get(name, id);
  if (clash) throw new HttpError(409, '已有同名名单，请换一个名称');
  db.prepare('UPDATE rosters SET name = ?, roster = ?, keep_id = ?, updated_at = ? WHERE id = ?')
    .run(name, rosterRaw, keepId ? 1 : 0, nowStr(), id);
  audit(ctx, '编辑名单', '「' + name + '」' + list.length + ' 人');
  return { ok: true, id };
});

route('DELETE', '/api/rosters/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const name = db.prepare('SELECT name FROM rosters WHERE id = ?').get(id);
  const info = db.prepare('DELETE FROM rosters WHERE id = ?').run(id);
  if (!info.changes) throw new HttpError(404, '名单不存在');
  audit(ctx, '删除名单', name ? '「' + name.name + '」' : 'id=' + id);
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

/* ---------- 生日（班级成员生日倒计时与祝福） ----------
 * 生日面前人人平等：不分老师/同学，只有"班级成员"。
 * 生日只存月日（年份选填，填了会显示"将满 N 岁"）；2 月 29 日在平年按 2 月 28 日庆祝。
 * 倒计时按服务器本地时间实时计算，不入库。 */
function bdayValid(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const t = new Date(2024, month - 1, day); // 2024 为闰年，允许 2 月 29 日
  return t.getDate() === day && t.getMonth() === month - 1;
}
function bdayInfo(m, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!m.month || !m.day) {
    return { id: m.id, name: m.name, month: 0, day: 0, year: Number(m.year) || 0,
      note: m.note || '', nextDate: '', daysUntil: null, isToday: false, turningAge: null, pending: true };
  }
  const occur = (yy) => new Date(yy, m.month - 1, (m.month === 2 && m.day === 29 && !(new Date(yy, 1, 29).getMonth() === 1)) ? 28 : m.day);
  let next = occur(now.getFullYear());
  if (next < today) next = occur(now.getFullYear() + 1);
  const daysUntil = Math.round((next - today) / 86400000);
  return {
    id: m.id, name: m.name,
    month: m.month, day: m.day,
    year: Number(m.year) || 0,
    note: m.note || '',
    nextDate: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`,
    daysUntil,
    isToday: daysUntil === 0,
    turningAge: m.year ? next.getFullYear() - Number(m.year) : null,
    pending: false,
  };
}
function bdayRowFromBody(b) {
  const month = Number(b.month), day = Number(b.day);
  if (!bdayValid(month, day)) throw new HttpError(400, '生日日期无效（月 1-12，日 1-31，注意每月天数）');
  const year = Number(b.year) || 0;
  if (year && (year < 1900 || year > 2100)) throw new HttpError(400, '出生年份应在 1900-2100 之间');
  return {
    name: sField(b.name, 60),
    month, day, year,
    note: sField(b.note, 200),
  };
}
function getBday(id) {
  const row = db.prepare('SELECT * FROM birthdays WHERE id = ?').get(id);
  return row ? { ...row, year: Number(row.year) || 0 } : null;
}

/* ---------- 投票表决（资格制名单 / 匿名可选 / 一人一票） ---------- */
function voteIsClosed(v) {
  return !!v.closed || !!(v.deadline && Date.now() > new Date(String(v.deadline).replace(' ', 'T')).getTime());
}
// 管理权限：管理员登录，或持有该投票的管理令牌 ?t=（可委托给班委）
function voteCanManage(ctx, v) {
  if (authOk(ctx.req)) return true;
  const t = ctx.query.get('t') || '';
  return !!v.admin_token && t !== '' && safeEqual(t, v.admin_token);
}
function voteTally(v, rows) {
  return safeJson(v.options, []).map((o) => ({
    key: o.key, label: o.label,
    votes: rows.filter((b) => safeJson(b.choices, []).includes(o.key)).length,
  }));
}

// 创建投票（管理操作）：资格名单必选——只有名单内的同学可以投票
route('POST', '/api/vote', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const b = ctx.body || {};
  const title = sField(b.title, 60);
  if (!title) throw new HttpError(400, '请填写投票标题');
  let roster = [];
  if (b.rosterId != null && b.rosterId !== '') {
    const r = db.prepare('SELECT * FROM rosters WHERE id = ?').get(Number(b.rosterId));
    if (!r) throw new HttpError(400, '所选名单不存在，请重新选择');
    roster = JL.parseRoster(r.roster, !!r.keep_id).list;
  } else {
    roster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
  }
  if (!roster.length) throw new HttpError(400, '请设置投票名单（只有名单内的同学可以投票）');
  if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
  const lines = String(b.optionsRaw || '').split(/[\n\r]+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) throw new HttpError(400, '请至少填写 2 个选项（每行一个候选人或选项）');
  if (lines.length > 50) throw new HttpError(400, '选项最多 50 个');
  const options = lines.map((label, i) => ({ key: 'o' + i, label: sField(label, 60) }));
  const maxSelect = Math.max(1, Math.min(Number(b.maxSelect) || 1, options.length));
  const token = JL.genToken();
  const vid = JL.genId(7);
  db.prepare(`INSERT INTO votes (id, title, description, deadline, closed, anonymous, require_sid, roster, options, max_select, admin_token, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`)
    .run(vid, title, sField(b.description, 1000), cleanDT(b.deadline) || '',
      b.anonymous === false ? 0 : 1,
      b.requireSid === true ? 1 : 0,
      JSON.stringify(roster), JSON.stringify(options), maxSelect, token, Date.now());
  return { ok: true, id: vid, adminToken: token };
});

route('GET', '/api/vote', () => {
  const items = db.prepare('SELECT * FROM votes ORDER BY created_at DESC').all().map((v) => {
    const total = safeJson(v.roster, []).length;
    const done = db.prepare('SELECT COUNT(*) AS c FROM vote_ballots WHERE vote_id = ?').get(v.id).c;
    return {
      id: v.id, title: v.title, description: v.description, deadline: v.deadline,
      closed: voteIsClosed(v), closedByAdmin: !!v.closed, anonymous: !!v.anonymous, maxSelect: v.max_select,
      total, done,
    };
  });
  return { items };
});

route('GET', '/api/vote/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  const roster = safeJson(v.roster, []);
  const options = safeJson(v.options, []);
  const rows = db.prepare('SELECT * FROM vote_ballots WHERE vote_id = ? ORDER BY time').all(v.id);
  const canManage = voteCanManage(ctx, v);
  // 匿名投票的选票明细（谁投给了谁）只有发起人能看；非匿名对所有人公开。
  // 资格名单是公示名单，对所有人可见——学生页的联想与专属链接锁定身份依赖它。
  const showBallots = canManage || !v.anonymous;
  const base = {
    id: v.id, title: v.title, description: v.description, deadline: v.deadline,
    closed: voteIsClosed(v), closedByAdmin: !!v.closed, anonymous: !!v.anonymous,
    requireSid: !!v.require_sid,
    options, maxSelect: v.max_select, rosterSize: roster.length, done: rows.length,
    // 需学号验证的投票不下发学号：防止「从详情读学号 → 回填 sid」绕过验证；发起人不遮蔽
    roster: canManage || !v.require_sid ? roster : roster.map((r) => ({ name: r.name })),
    tally: voteTally(v, rows),
  };
  // 发起人管理令牌仅在设密码部署且已登录时下发（未设密码时管理本就开放，无需下发）
  if (CONFIG.password && authOk(ctx.req)) base.adminToken = v.admin_token;
  if (canManage) {
    // 完成统计：未投票的资格名单槽位，仅发起人可见（用于提醒与核对冒票）
    base.missing = roster
      .map((r, i) => ({ i, id: r.id, name: r.name }))
      .filter((r) => !rows.some((b) => b.rid === r.i));
  }
  if (showBallots) {
    base.ballots = rows.map((b) => ({
      rid: b.rid, name: b.name, sid: b.sid, time: b.time,
      choices: safeJson(b.choices, []).map((k) => (options.find((o) => o.key === k) || {}).label || k),
    }));
  }
  return base;
});

// 投票（学生免登录）：必须是资格名单内的槽位，一人一票（重投=覆盖改票）
route('POST', '/api/vote/:id/ballot', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (voteIsClosed(v)) throw new HttpError(400, '投票已结束，不能再提交');
  const roster = safeJson(v.roster, []);
  const options = safeJson(v.options, []);
  const b = ctx.body || {};
  const rawName = String(b.name || '').trim();
  if (!rawName) throw new HttpError(400, '请填写你的姓名或学号');
  let rid = null, id = null, name = rawName;
  if (Number.isInteger(b.rid) && b.rid >= 0 && b.rid < roster.length) {
    const r0 = roster[b.rid];
    const words = rawName.split(/\s+/).filter(Boolean);
    if (rawName === r0.name || words.includes(r0.name) || (r0.id && words.includes(r0.id))) {
      rid = b.rid; id = r0.id; name = r0.name;
    }
  }
  if (rid == null) {
    const hits = [];
    roster.forEach((r, i) => { if (r.name === rawName || (r.id && r.id === rawName)) hits.push(i); });
    // 精确匹配不到时按词匹配：兼容「2023001 张三」这类"学号+姓名"一起输入的写法
    if (!hits.length && /\s/.test(rawName)) {
      const words = rawName.split(/\s+/).filter(Boolean);
      roster.forEach((r, i) => { if (words.includes(r.name) || (r.id && words.includes(r.id))) hits.push(i); });
    }
    if (!hits.length) throw new HttpError(403, '你不在本次投票名单中，无法投票');
    if (hits.length > 1) throw new HttpError(409, '名单中有重名，请输入学号确认身份');
    rid = hits[0]; id = roster[rid].id; name = roster[rid].name;
  }
  // 学号强验证（发起时勾选）：槽位必须有学号，且提交内容里必须含有该学号。
  // 姓名可能是别人代填的，学号必须本人输入——冒用门槛从"知道姓名"提高到"知道学号"。
  // 专属链接 ?u= 视作已验证（链接一对一私发即凭证）
  if (v.require_sid && !(b.via === 'u' && rid != null)) {
    if (!id) throw new HttpError(400, '本次投票需学号验证，但名单中该成员没有学号，请联系发起人');
    const typedSid = String(b.sid || '').trim();
    if (typedSid !== String(id) && !rawName.includes(String(id))) {
      throw new HttpError(400, '学号验证未通过：请输入你的学号后再提交');
    }
  }
  // 选项清洗：去重、只认有效选项、不超过最多可选数；空选 = 弃权（计入已投，不计入票数）
  const chosen = [...new Set((Array.isArray(b.choices) ? b.choices : []).map(String))]
    .filter((k) => options.some((o) => o.key === k));
  if (chosen.length > v.max_select) throw new HttpError(400, `最多选择 ${v.max_select} 项`);
  const exist = db.prepare('SELECT id FROM vote_ballots WHERE vote_id = ? AND rid = ?').get(v.id, rid);
  if (exist) {
    db.prepare('UPDATE vote_ballots SET choices = ?, time = ? WHERE id = ?').run(JSON.stringify(chosen), Date.now(), exist.id);
    return { ok: true, updated: true };
  }
  db.prepare('INSERT INTO vote_ballots (vote_id, rid, sid, name, choices, time) VALUES (?, ?, ?, ?, ?, ?)')
    .run(v.id, rid, id || '', name, JSON.stringify(chosen), Date.now());
  return { ok: true };
});

route('PUT', '/api/vote/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (!voteCanManage(ctx, v)) throw new HttpError(401, '需要管理员登录或管理令牌');
  const b = ctx.body || {};
  db.prepare('UPDATE votes SET title = ?, description = ?, deadline = ? WHERE id = ?')
    .run(sField(b.title, 60) || v.title, sField(b.description, 1000) || v.description,
      cleanDT(b.deadline) || v.deadline, v.id);
  audit(ctx, '编辑投票', '「' + (sField(b.title, 60) || v.title) + '」');
  return { ok: true };
});

route('POST', '/api/vote/:id/stop', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (!voteCanManage(ctx, v)) throw new HttpError(401, '需要管理员登录或管理令牌');
  db.prepare('UPDATE votes SET closed = 1 WHERE id = ?').run(v.id);
  audit(ctx, '停止投票', '「' + v.title + '」');
  return { ok: true };
});

route('DELETE', '/api/vote/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (!voteCanManage(ctx, v)) throw new HttpError(401, '需要管理员登录或管理令牌');
  db.exec('BEGIN'); // 选票与投票一起删，不残留孤儿选票
  try {
    db.prepare('DELETE FROM vote_ballots WHERE vote_id = ?').run(v.id);
    db.prepare('DELETE FROM votes WHERE id = ?').run(v.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  audit(ctx, '删除投票', '「' + v.title + '」');
  return { ok: true };
});

route('GET', '/api/birthdays', () => {
  const now = new Date();
  const items = db.prepare('SELECT * FROM birthdays').all()
    .map((r) => bdayInfo({ ...r, year: Number(r.year) || 0 }, now))
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999) || a.name.localeCompare(b.name, 'zh'));
  const today = items.filter((i) => i.isToday);
  let hasBadge = false;
  try { hasBadge = fs.statSync(BADGE_FILE).isFile(); } catch (e) { /* 无班徽 */ }
  return { items, today, todayCount: today.length, hasBadge };
});

route('POST', '/api/birthdays', (ctx) => {
  const m = bdayRowFromBody(ctx.body || {});
  if (!m.name) throw new HttpError(400, '请填写成员姓名');
  const info = db.prepare('INSERT INTO birthdays (name, month, day, year, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(m.name, m.month, m.day, m.year, m.note, nowStr());
  const row = getBday(Number(info.lastInsertRowid));
  return bdayInfo(row, new Date());
});

route('PUT', '/api/birthdays/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const old = getBday(id);
  if (!old) throw new HttpError(404, '成员不存在');
  const b = ctx.body || {};
  const m = bdayRowFromBody({
    name: b.name !== undefined ? b.name : old.name,
    month: b.month !== undefined ? b.month : old.month,
    day: b.day !== undefined ? b.day : old.day,
    year: b.year !== undefined ? b.year : old.year,
    note: b.note !== undefined ? b.note : old.note,
  });
  if (!m.name) throw new HttpError(400, '请填写成员姓名');
  db.prepare('UPDATE birthdays SET name = ?, month = ?, day = ?, year = ?, note = ? WHERE id = ?')
    .run(m.name, m.month, m.day, m.year, m.note, id);
  return bdayInfo(getBday(id), new Date());
});

route('DELETE', '/api/birthdays/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const info = db.prepare('DELETE FROM birthdays WHERE id = ?').run(id);
  if (!info.changes) throw new HttpError(404, '成员不存在');
  return { ok: true };
});

// 从名单库批量导入（同名成员跳过，防止重复导入）
route('POST', '/api/birthdays/import', (ctx) => {
  const b = ctx.body || {};
  const rosterId = Number(b.rosterId);
  if (!Number.isInteger(rosterId)) throw new HttpError(400, '参数错误');
  const roster = db.prepare('SELECT * FROM rosters WHERE id = ?').get(rosterId);
  if (!roster) throw new HttpError(404, '名单不存在，请先在名单库保存班级名单');
  const list = JL.parseRoster(roster.roster, !!roster.keep_id).list;
  const existNames = new Set(db.prepare('SELECT name FROM birthdays').all().map((r) => r.name));
  const ins = db.prepare('INSERT INTO birthdays (name, month, day, year, note, created_at) VALUES (?, 0, 0, 0, ?, ?)');
  let created = 0, skipped = 0;
  for (const p of list) {
    if (existNames.has(p.name)) { skipped++; continue; }
    ins.run(p.name, '', nowStr());
    created++;
  }
  const summary = `导入 ${created} 人、跳过 ${skipped} 人（重名已存在）`;
  log('生日成员' + summary);
  return { ok: true, created, skipped };
});

/* ---------- 班徽背景（生日页可自定义水印，可选） ---------- */
const BADGE_FILE = path.join(DATA_DIR, 'class-badge');
function sniffImage(buf) {
  if (!buf || buf.length < 6) return '';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  if (buf.slice(0, 300).toString('utf8').toLowerCase().includes('<svg')) return 'image/svg+xml';
  return '';
}
route('GET', '/api/class-badge', (ctx) => {
  let buf;
  try { buf = fs.readFileSync(BADGE_FILE); } catch (e) { throw new HttpError(404, '未设置班徽'); }
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': sniffImage(buf) + '; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    // SVG 中可能内嵌脚本：sandbox 让浏览器以唯一透明源渲染，即使直接打开也不执行任何脚本
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'no-cache',
  });
  res.end(buf);
});
route('POST', '/api/class-badge', async (ctx) => {
  if (!ctx.raw) throw new HttpError(400, '需要 multipart 表单');
  const { files } = parseMultipart(ctx.raw, ctx.req.headers['content-type'] || '');
  if (!files.length) throw new HttpError(400, '请选择班徽图片');
  const buf = files[0].data;
  if (!buf.length || buf.length > 5 * 1024 * 1024) throw new HttpError(400, '图片需小于 5MB');
  if (!sniffImage(buf)) throw new HttpError(400, '仅支持 PNG / JPG / GIF / WebP / SVG 图片');
  fs.writeFileSync(BADGE_FILE, buf);
  return { ok: true };
});
route('DELETE', '/api/class-badge', (ctx) => {
  try { fs.unlinkSync(BADGE_FILE); } catch (e) { /* 本来就没有 */ }
  return { ok: true };
});

/* ---------- 导入备份 ---------- */
route('POST', '/api/import', (ctx) => {
  const b = ctx.body || {};
  if (!Array.isArray(b.groups) || !Array.isArray(b.messages)) {
    throw new HttpError(400, '备份文件格式不对（缺少 groups / messages）');
  }
  // 非空库一律拒绝（force=1 除外）：检查全部业务表，防止只有名单/生日等数据时被误判为空库而重复导入
  const exist = ['messages', 'groups', 'attachments', 'inbox', 'jielongs', 'jielong_entries', 'draws', 'draw_rounds', 'rosters', 'birthdays', 'votes', 'vote_ballots']
    .reduce((sum, t) => sum + db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c, 0);
  if (exist > 0 && ctx.query.get('force') !== '1') {
    throw new HttpError(400, '当前已有数据，为防止重复导入被拒绝。请先用空数据文件夹再导入');
  }
  // force=1 为合并导入：接龙/抽签按原 id 替换（记录先清后插，保证重导同一份备份结果一致），
  // 群按 ext_key 合并，名单同名覆盖，生日同名同生日跳过——否则固定主键撞唯一索引必然整体回滚
  const force = ctx.query.get('force') === '1';
  let n = 0, nAtt = 0, nGroups = 0, nJl = 0, nJlE = 0, nDw = 0, nDwR = 0, nRs = 0, nBd = 0, nV = 0, nVB = 0;
  db.exec('BEGIN'); // 整体导入：任何一步失败就整体回滚，不残留半截数据
  try {
    const insG = db.prepare('INSERT INTO groups (name, platform, color, remark, ext_key, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const gmap = {};
    for (const g of b.groups) {
      const ext = sField(g.ext_key, 40);
      if (force && ext) {
        const same = db.prepare('SELECT id FROM groups WHERE ext_key = ?').get(ext);
        if (same) { // 机器人白名单按 ext_key 关联，合并进已有群而不是撞唯一索引
          db.prepare('UPDATE groups SET name = ?, platform = ?, color = ?, remark = ? WHERE id = ?')
            .run(sField(g.name, 60) || '未命名群', PLATFORMS.includes(g.platform) ? g.platform : 'other',
              /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : pickColor(), sField(g.remark, 200), same.id);
          if (g.id != null) gmap[String(g.id)] = same.id;
          continue;
        }
      }
      const info = insG.run(
        sField(g.name, 60) || '未命名群',
        PLATFORMS.includes(g.platform) ? g.platform : 'other',
        /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : pickColor(),
        sField(g.remark, 200),
        ext,
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
    // 恢复附件记录（附件文件本身不在 JSON 里，需随 data/ 目录整体迁移；阅读/下载计数随记录一并保留）
    if (Array.isArray(b.attachments)) {
      const insA = db.prepare(`INSERT INTO attachments (message_id, orig_name, stored_name, size, mime, views, downloads, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const a of b.attachments) {
        const mid = mmap[String(a.message_id)];
        if (!mid) continue; // 对应信息不在本次备份中，跳过
        const stored = sField(a.stored_name, 200).replace(/\\/g, '/');
        if (!stored || stored.includes('..') || stored.startsWith('/')) continue;
        // mime 会原样写进 Content-Type 响应头，只接受干净的类型串，防止借导入塞进非法头值
        const mime = /^[A-Za-z0-9][\w!#$&^_.+-]*\/[\w!#$&^_.+-]*$/.test(String(a.mime || '')) ? String(a.mime) : '';
        insA.run(mid, sField(a.orig_name, 200), stored, Math.max(0, Number(a.size) || 0),
          mime, Math.max(0, Number(a.views) || 0), Math.max(0, Number(a.downloads) || 0),
          cleanDT(a.created_at) || nowStr());
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
    const insJ = db.prepare(`${force ? 'INSERT OR REPLACE' : 'INSERT'} INTO jielongs (id, title, description, deadline, roster, fields, allow_outside, closed, admin_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const jlIds = new Set();
    for (const g of b.jielongs) {
      const id = /^[a-z0-9]{3,32}$/.test(String(g.id || '')) ? String(g.id) : JL.genId(7);
      if (jlIds.has(id)) throw new Error('备份中存在重复的接龙 id：' + id); // 载荷自身矛盾，让事务整体回滚
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
    if (force) for (const id of jlIds) db.prepare('DELETE FROM jielong_entries WHERE jielong_id = ?').run(id);
    if (Array.isArray(b.jielongEntries)) {
      const insJE = db.prepare(`INSERT INTO jielong_entries (jielong_id, rid, sid, name, values_json, remark, outside, time, seq)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const e of b.jielongEntries) {
        if (!jlIds.has(String(e.jielong_id || ''))) continue; // 对应接龙不在本次备份中，跳过
        // 填写内容非法或超限（合法上限约 2.6KB）整条跳过：硬截断会产生非法 JSON，读取时静默丢内容
        const valsJson = e.values_json == null ? '{}' : asJsonText(e.values_json, null);
        if (valsJson == null || valsJson.length > 5000) continue;
        insJE.run(String(e.jielong_id),
          Number.isInteger(e.rid) ? e.rid : null,
          sField(e.sid, 40),
          sField(e.name, 60),
          valsJson,
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
    const insDw = db.prepare(`${force ? 'INSERT OR REPLACE' : 'INSERT'} INTO draws (id, title, roster, per_draw, created_at) VALUES (?, ?, ?, ?, ?)`);
    const dwIds = new Set();
    for (const g of b.draws) {
      const id = /^[a-z0-9]{3,32}$/.test(String(g.id || '')) ? String(g.id) : JL.genId(7);
      if (dwIds.has(id)) throw new Error('备份中存在重复的抽签 id：' + id);
      insDw.run(id,
        sField(g.title, 60) || '未命名抽签',
        asJsonText(g.roster, '[]'),
        Math.max(1, Number(g.per_draw) || 1),
        Math.max(0, Number(g.created_at) || Date.now()));
      dwIds.add(id);
      nDw++;
    }
    if (force) for (const id of dwIds) db.prepare('DELETE FROM draw_rounds WHERE draw_id = ?').run(id);
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
      const name = sField(g.name, 60) || '未命名名单';
      const same = force ? db.prepare('SELECT id FROM rosters WHERE name = ?').get(name) : null;
      if (same) { // 同名覆盖（与名单库"同名保存覆盖"语义一致）
        db.prepare('UPDATE rosters SET roster = ?, keep_id = ?, updated_at = ? WHERE id = ?')
          .run(String(g.roster || ''), g.keep_id ? 1 : 0, cleanDT(g.updated_at) || nowStr(), same.id);
      } else {
        insR.run(name, String(g.roster || ''), g.keep_id ? 1 : 0,
          cleanDT(g.created_at) || nowStr(), cleanDT(g.updated_at) || nowStr());
      }
      nRs++;
    }
  }
  // 恢复生日成员
  if (Array.isArray(b.birthdays)) {
    const insB = db.prepare('INSERT INTO birthdays (name, month, day, year, note, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const g of b.birthdays) {
      const nm = sField(g.name, 60) || '未命名成员', mo = Math.max(0, Number(g.month) || 0), dy = Math.max(0, Number(g.day) || 0);
      if (force && db.prepare('SELECT id FROM birthdays WHERE name = ? AND month = ? AND day = ?').get(nm, mo, dy)) continue; // 重导幂等
      insB.run(nm, mo, dy, Math.max(0, Number(g.year) || 0), sField(g.note, 200), cleanDT(g.created_at) || nowStr());
      nBd++;
    }
  }
  // 恢复投票与选票（id 随机字符串主键原样保留；选票按 vote_id 直接挂回）
  if (Array.isArray(b.votes)) {
    const insV = db.prepare(`${force ? 'INSERT OR REPLACE' : 'INSERT'} INTO votes (id, title, description, deadline, closed, anonymous, require_sid, roster, options, max_select, admin_token, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const vIds = new Set();
    for (const g of b.votes) {
      const id = /^[a-z0-9]{3,32}$/.test(String(g.id || '')) ? String(g.id) : JL.genId(7);
      if (vIds.has(id)) throw new Error('备份中存在重复的投票 id：' + id);
      insV.run(id,
        sField(g.title, 60) || '未命名投票',
        sField(g.description, 1000),
        cleanDT(g.deadline) || '',
        g.closed ? 1 : 0,
        g.anonymous === false ? 0 : 1,
        g.require_sid ? 1 : 0,
        asJsonText(g.roster, '[]'),
        asJsonText(g.options, '[]'),
        Math.max(1, Number(g.max_select) || 1),
        sField(g.admin_token, 64),
        Math.max(0, Number(g.created_at) || Date.now()));
      vIds.add(id);
      nV++;
    }
    if (force) for (const id of vIds) db.prepare('DELETE FROM vote_ballots WHERE vote_id = ?').run(id);
    if (Array.isArray(b.voteBallots)) {
      const insVB = db.prepare('INSERT INTO vote_ballots (vote_id, rid, sid, name, choices, time) VALUES (?, ?, ?, ?, ?, ?)');
      for (const e of b.voteBallots) {
        if (!vIds.has(String(e.vote_id || ''))) continue; // 对应投票不在本次备份中，跳过
        insVB.run(String(e.vote_id),
          Number.isInteger(e.rid) ? e.rid : null,
          sField(e.sid, 40),
          sField(e.name, 60),
          asJsonText(e.choices, '[]'),
          Math.max(0, Number(e.time) || 0));
        nVB++;
      }
    }
  }
    nGroups = Object.keys(gmap).length;
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw new HttpError(500, '导入失败已整体回滚（' + e.message + '），数据库未变动');
  }
  const summary = `${nGroups} 个群、${n} 条信息、${nAtt} 条附件记录、${nJl} 个接龙、${nJlE} 条接龙记录、${nDw} 个抽签、${nDwR} 轮抽签历史、${nV} 个投票、${nVB} 张选票、${nRs} 份名单、${nBd} 位生日成员`;
  console.log('导入备份：' + summary);
  log('导入备份：' + summary);
  audit(ctx, '导入备份', summary);
  return { ok: true, groups: nGroups, imported: n, attachments: nAtt, jielongs: nJl, jielongEntries: nJlE, draws: nDw, drawRounds: nDwR, votes: nV, voteBallots: nVB, rosters: nRs, birthdays: nBd };
});

/* ---------- 导出 .ics 日历（截止时间进手机系统日历） ---------- */
const CAT_LABEL = { notice: '通知', task: '任务', activity: '活动', file: '文件', other: '其他' };
route('GET', '/api/calendar.ics', (ctx) => {
  // 只导出未逾期事项：大数据量下按截止升序的前 500 条早已是陈年旧账
  const rows = db.prepare(`SELECT m.id, m.title, m.content, m.category, m.deadline
      FROM messages m
      WHERE m.status = 'open' AND m.deadline IS NOT NULL AND m.deadline <> '' AND ${DEADLINE_EXPR} >= ?
      ORDER BY m.deadline LIMIT 500`).all(nowStr());
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  // RFC 5545 要求 DATE-TIME 形如 YYYYMMDDTHHMMSS（日期与时间之间必须有 T）
  const stamp = nowStr().slice(0, 10).replace(/-/g, '') + 'T' + nowStr().slice(11, 16).replace(':', '') + '00';
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
  const total = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  const week = db.prepare(`SELECT COUNT(*) AS c FROM messages
      WHERE received_at >= strftime('%Y-%m-%d %H:%M','now','localtime','-6 days')`).get().c;
  const openTasks = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE status = 'open' AND category = 'task'`).get().c;
  // DEADLINE_EXPR 对空截止返回 NULL，比较自然为假，无需再排除空值
  const overdue = db.prepare(`SELECT COUNT(*) AS c FROM messages m
      WHERE m.status = 'open' AND ${DEADLINE_EXPR} < ${NOW}`).get().c;
  const upcoming = db.prepare(`${MSG_SELECT}
      WHERE m.status = 'open' AND ${DEADLINE_EXPR} >= ${NOW}
      AND ${DEADLINE_EXPR} <= strftime('%Y-%m-%d %H:%M','now','localtime','+7 days')
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
    // 投票：id 随机字符串主键原样保留，选票按 vote_id 直接挂回
    votes: db.prepare('SELECT id, title, description, deadline, closed, anonymous, require_sid, roster, options, max_select, admin_token, created_at FROM votes ORDER BY created_at, id').all(),
    voteBallots: db.prepare('SELECT vote_id, rid, sid, name, choices, time FROM vote_ballots ORDER BY vote_id, id').all(),
    rosters: db.prepare('SELECT * FROM rosters ORDER BY id').all(),
    birthdays: db.prepare('SELECT id, name, month, day, year, note, created_at FROM birthdays ORDER BY id').all(),
  };
  const body = JSON.stringify(dump, null, 2);
  audit(ctx, '导出备份', Object.keys(dump).length + ' 类数据');
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
  if (/^\/v\/[a-z0-9]+$/i.test(p)) p = '/vote.html'; // 学生投票页，投票 ID 由页面脚本从路径解析
  let fp = path.normalize(path.join(PUBLIC_DIR, p));
  if (fp !== PUBLIC_DIR && !fp.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    if (!path.extname(p)) fp = path.join(PUBLIC_DIR, 'index.html'); // 前端路由回退
    else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
  }
  const ext = path.extname(fp).toLowerCase();
  // 基础安全头（OWASP Secure Headers）：页面禁止被第三方嵌入（防点击劫持），引用地址不外泄到外站。
  // CSP 允许内联脚本/样式（页面零构建所依赖），但把其余来源都锁到本站，作为转义遗漏时的第二道防线
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'",
    'Referrer-Policy': 'same-origin',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(fp);
  stream.on('error', () => res.destroy()); // 头已发出，读流失败只能断开连接
  stream.pipe(res);
}

/* ---------- HTTP 入口 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local');
  const pathname = u.pathname;

  if (pathname.startsWith('/api/')) {
    if (process.env.INFOHUB_DEBUG === '1') console.log('[debug]', req.method, pathname + u.search);
    // 归一化路径：/api/export/ 与 /api//export 与 /api/export 必须同判——
    // 路由匹配对斜杠不敏感，门禁若按原始 pathname 精确比较，尾斜杠就能绕过保护
    const norm = '/' + pathname.split('/').filter(Boolean).join('/');
    // 不开放跨域：避免未设密码时，用户浏览器里打开的任意网页都能读取局域网内的数据。
    // 机器人 / 快捷指令走 curl 等非浏览器客户端，不受同源策略影响。
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    // 访问门禁：设了管理密码时，浏览（页面与查询接口）对所有人开放——学生可看；
    // 写入类操作需要管理员登录。机器人凭接入令牌通行（ingest 自带令牌校验，不在此拦截）。
    // /api/jielong/* 同理白名单放行：浏览公开、学生提交无需登录，管理操作由接口自己校验
    // 管理员登录或该接龙的管理令牌（可委托给班委）。
    // /api/config 含接入令牌、/api/export 是全量备份、/api/rosters 是学生名单（含学号姓名，敏感），
    // 三者仅管理员可读；/api/parse 无副作用，保持开放。
    if (CONFIG.password && !authOk(req)
      && !norm.startsWith('/api/jielong')
      && !norm.startsWith('/api/vote')
      && !['/api/login', '/api/logout', '/api/me', '/api/health', '/api/ingest', '/api/parse',
        '/api/onebot/report', '/api/onebot'].includes(norm)
      && (req.method !== 'GET' || ['/api/config', '/api/export', '/api/inbox', '/api/rosters'].includes(norm))) {
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

// 过期会话 / 失败限速记录每小时批量清一次（登录校验里也有惰性清除，这里防内存缓慢增长）
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of sessions) if (now - t > SESSION_TTL) sessions.delete(k);
  for (const [ip, rec] of loginFails) if (now - rec.t > 10 * 60 * 1000) loginFails.delete(ip); // 10 分钟无新失败即清
}, 60 * 60 * 1000);
// systemd / Docker 停止时优雅关闭：先停接新连接，3 秒后强制退出兜底
process.on('SIGTERM', () => {
  log('收到 SIGTERM，正在关闭服务…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
});

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
