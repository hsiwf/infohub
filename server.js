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
const AUTH = require('./lib/auth');
const safeJson = JL.safeJson; // 投票的 roster / options / choices 均为 JSON 文本字段，读取统一走安全解析

const PORT = Number(process.env.PORT || 5757);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 50 * 1024 * 1024; // 单次请求上限 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 单文件上传上限 50MB

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
  // 管理密码不以明文落盘。「文件里出现 password 字段」是用户在改密码的唯一信号，
  // 所以这里绝不能像旧版那样把缺失的字段补成 "" 再写回去——那会让下次启动把它
  // 误读成「用户显式清空」，把刚散列好的密码删掉（迁移不幂等，第 3 次重启即丢密码）：
  // · 字段缺失（日常启动）：什么都不动，维持 password_hash 现状；
  // · 写了明文（新增/改密）：重新散列并覆盖旧散列，删掉明文字段；
  // · 显式清空（""）= 关闭管理密码：连同旧散列一起去掉（README 的忘记密码流程）。
  // 首次升级写回失败（文件只读等）时内存恢复明文兜底，登录退回恒时比较，下次启动再试
  const hasPwField = Object.prototype.hasOwnProperty.call(c, 'password');
  if (hasPwField) {
    const plain = typeof c.password === 'string' ? c.password : '';
    if (plain !== '') {
      const salt = crypto.randomBytes(16).toString('hex');
      c.password_hash = crypto.scryptSync(plain, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 1 }).toString('hex');
      c.password_salt = salt;
      delete c.password;
      try { fs.writeFileSync(p, JSON.stringify(c, null, 2)); }
      catch (e) { c.password = plain; }
    } else {
      delete c.password_hash; delete c.password_salt; delete c.password;
      try { fs.writeFileSync(p, JSON.stringify(c, null, 2)); } catch (e) { /* 关闭动作没写回盘，下次启动再来 */ }
    }
  }
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
// 管理密码是否已设置：升级后明文字段消失，判定要看散列
function adminPwOn() { return !!(CONFIG.password_hash || CONFIG.password); }

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
    const known = new Set([
      ...db.prepare('SELECT stored_name FROM attachments').all(),
      ...db.prepare('SELECT stored_name FROM fund_attachments').all(),
      ...db.prepare('SELECT stored_name FROM idea_attachments').all(),
    ].map((r) => String(r.stored_name).replace(/\//g, path.sep)));
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

/* ---------- 访问控制：管理员密码 + 学号账号（密码散列存库，见 lib/auth.js） ---------- */
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 与 Cookie Max-Age 一致（30 天）
const sessions = new Map();         // 内存会话：token -> {t, role, sid, name, mustChange}，重启后需重新登录
const loginFails = new Map();       // 登录失败限速：ip 或 sid:学号 -> {n, t}
// 开了账号就启用访问控制（未设管理密码的局域网部署仍保持全站开放，见 README「快速开始」）
let USERS_EXIST = db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;
function accessControlOn() { return adminPwOn() || USERS_EXIST; }
function refreshUsersExist() { USERS_EXIST = db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0; }
/* ---------- 留言板发布限速（登录后可写的公开接口，防刷屏）：ip -> 最近发布时间戳数组 ---------- */
const gbPosts = new Map();
function guestbookRateOk(ip) {
  const now = Date.now();
  const arr = (gbPosts.get(ip) || []).filter((t) => now - t < 60000); // 只看最近 60 秒
  if (arr.length >= 6) { gbPosts.set(ip, arr); return false; }       // 每分钟最多 6 条
  arr.push(now);
  gbPosts.set(ip, arr);
  return true;
}
// 点赞限速（比发帖宽松）：ip -> 最近点赞时间戳数组，每分钟最多 40 次
const gbLikes = new Map();
function guestbookLikeRateOk(ip) {
  const now = Date.now();
  const arr = (gbLikes.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= 40) { gbLikes.set(ip, arr); return false; }
  arr.push(now);
  gbLikes.set(ip, arr);
  return true;
}
function sessionOf(req) {
  const m = /(?:^|;\s*)infohub_session=([a-f0-9]{32,})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s) return null;
  if (Date.now() - s.t > SESSION_TTL) { sessions.delete(m[1]); return null; } // 过期会话惰性清除
  return s;
}
// 常量时间字符串比较：令牌/密码校验不暴露"第几位不匹配"的时序信息
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function tokenAdminOk(req) {
  const x = req.headers['x-token'];  // 机器人/脚本用管理接口令牌（apiToken）通行；投递令牌 ingestToken 不再具备管理权限
  return typeof x === 'string' && x !== '' && safeEqual(x, CONFIG.apiToken);
}
// 管理员：未启用访问控制时人人都是（局域网开放部署）；否则要求管理员会话或 apiToken
function authOk(req) {
  if (!accessControlOn()) return true;
  const s = sessionOf(req);
  return (s && s.role === 'admin') || tokenAdminOk(req);
}
// 可读：任何登录身份（学生 / 班委 / 管理员）或持 apiToken 的脚本；未启用访问控制时开放
function canReadOk(req) {
  if (!accessControlOn()) return true;
  return !!sessionOf(req) || tokenAdminOk(req);
}
// 班委：管理员之外多出来的一级。**能做哪些事**只看请求层的 OFFICER_WRITE 清单
// （通知的发布 / 勾选完成 / 置顶、收录与丢弃待审核、接龙投票抽签的全套管理、删留言）；
// **能看到哪些个人信息**不在这里决定——学号与匿名选票明细由各接口按 authOk 另行脱敏。
function canPostOk(req) { const r = roleOf(req); return r === 'admin' || r === 'officer'; }
// 解析当前请求的角色：未启用访问控制时人人都是管理员；持 apiToken 的脚本也按管理员算
function roleOf(req) {
  if (!accessControlOn()) return 'admin';
  const s = sessionOf(req);
  if (s) return s.role;
  return tokenAdminOk(req) ? 'admin' : 'guest';
}
// 系统管理员判定：管理密码会话，或持 apiToken 的脚本（roleOf 同口径），班委不算
function isSysAdmin(ctx) {
  if (!ctx || !ctx.req) return false;
  const s = sessionOf(ctx.req);
  if (s && s.role === 'admin') return true;
  return tokenAdminOk(ctx.req);
}
// 上传件的 Content-Type 直接入库并在下载时写进响应头：值来自客户端，先按
// type/subtype 令牌白名单校验（与备份导入同口径），否则置空——非 ASCII 头值会让
// writeHead 抛 ERR_INVALID_CHAR，且 res.wrote 已置真时异常被吞、下载请求永久挂死
function cleanMime(v) {
  const s = sField(v, 100);
  return /^[A-Za-z0-9][\w!#$&^_.+-]*\/[\w!#$&^_.+-]*$/.test(s) ? s : '';
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
  if (!DT_RE.test(s)) return null;
  // 正则只看形状，「2026-13-45 99:99」也能过；再按月历/钟点校一遍，非法日期不入库
  // （字符串比较口径下这种值永不逾期，还会把日历与排序带歪）
  const [d, t] = s.split(' ');
  const [y, mo, da] = d.split('-').map(Number);
  const probe = new Date(y, mo - 1, da);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== da) return null;
  if (t) {
    const [hh, mm] = t.split(':').map(Number);
    if (hh > 23 || mm > 59) return null;
  }
  return s;
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
/* ---------- 操作记录（入库可查 + 文件落盘冗余） ----------
 * 只有系统管理员能在「操作记录」页看到全部账号做过什么；班委与同学一律看不到（含自己那条链）。
 * 写入由两层保证：
 *  ① 关键动作在路由内显式 audit(ctx, '删除信息', 'id=12') 给出人话描述；
 *  ② 请求层兜底：任何成功的 POST/PUT/DELETE 若路由没自己记，就按「方法 + 资源」补一条。
 * 这样"覆盖所有写操作"是结构性的，不依赖以后每个新路由都记得调用。
 * 局限：直连部署记到的是本机地址；经反向代理时需自行透传真实 IP。 */
const AUDIT_FILE = path.join(DATA_DIR, 'logs', 'audit.log');
const AUDIT_KEEP = 20000;          // 条数上限（班级规模下远超 180 天）
const AUDIT_KEEP_DAYS = 180;       // 时间上限，两者先到为准
// 自检脚本一次就写两百多条记录，会把真实使用埋掉：以 INFOHUB_SELFTEST=1 启动的服务进程
// 写出的记录统一打 tag，test.js 跑完按 tag 自清。只认服务端环境变量、不认请求头——
// 否则闯祸的人可以把自己的操作标成"测试噪声"等着被清掉。
const SELFTEST_TAG = process.env.INFOHUB_SELFTEST === '1' ? 'selftest' : '';
const insAudit = db.prepare(`INSERT INTO audit_log (sid, name, role, action, detail, ip, tag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
function auditWho(req) {
  const s = req && sessionOf(req);
  if (s) return { sid: s.sid || '', name: s.name || '', role: s.role || '' };
  if (req && tokenAdminOk(req)) return { sid: '', name: '管理令牌', role: 'admin' };
  if (req && !accessControlOn()) return { sid: '', name: '未启用访问控制', role: 'admin' };
  return { sid: '', name: '', role: '' };
}
let auditWrites = 0;
function auditPrune() {
  const cut = new Date(Date.now() - AUDIT_KEEP_DAYS * 86400000);
  const cutoff = `${cut.getFullYear()}-${pad(cut.getMonth() + 1)}-${pad(cut.getDate())} ${pad(cut.getHours())}:${pad(cut.getMinutes())}`;
  // 按"第 N 新的那条"定界，不能写成 MAX(id) - N：id 有空洞（自检清理、历史补记都删过/挪过行），
  // 用最大 id 减 N 会把还该保留的记录一起删掉。行数不足 N 时子查询为 NULL，比较不成立，天然不删
  db.prepare('DELETE FROM audit_log WHERE id <= (SELECT id FROM audit_log ORDER BY id DESC LIMIT 1 OFFSET ?)').run(AUDIT_KEEP);
  db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoff);
}
function audit(ctx, action, detail, asWho) {
  const req = ctx && ctx.req;
  const ip = (req && req.socket && req.socket.remoteAddress) || '?';
  const when = nowStr();
  // 登录成功的瞬间会话还没建起来，auditWho 认不出人，由调用方补上身份，
  // 否则这类行在"按学号筛选"里永远查不到（等于漏了某个账号的行为链）
  const who = asWho || auditWho(req);
  const line = `[${when}] ${ip} ${who.name || who.role || '匿名'} ${action}${detail ? ' ' + detail : ''}`;
  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    fs.appendFileSync(AUDIT_FILE, line + '\n');
  } catch (e) { /* 文件写不了也不能影响主流程 */ }
  try {
    insAudit.run(who.sid, who.name.slice(0, 40), who.role.slice(0, 12), action.slice(0, 40), String(detail || '').slice(0, 300), ip, SELFTEST_TAG, when);
    if (++auditWrites % 200 === 0) auditPrune();
  } catch (e) { log('操作记录入库失败：' + e.message); }
  if (ctx) ctx.audited = true; // 请求层据此不再补记，避免一次操作两条
}
/* ---------- 「哪一条」写成标题 / 姓名 / 内容摘要，而不是 id ----------
 * 删除与编辑必须在路由执行**之前**查库（删完就查不到名字了），请求层把结果挂在
 * ctx.auditSubject 上；路由里显式记的那几条与兜底补记都复用它。查不到就留空，
 * 兜底仍会按「方法 + 资源」记一条，覆盖不依赖这里。 */
function auditBrief(v, n) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function auditSubjectBase(resKey, id) {
  try {
    let r = null;
    switch (resKey) {
      case 'messages': r = db.prepare('SELECT title, content FROM messages WHERE id = ?').get(id);
        return r ? '《' + auditBrief(r.title || r.content, 40) + '》'
          + (r.title && r.content ? ' 正文「' + auditBrief(r.content, 40) + '」' : '') : 'id=' + id;
      case 'groups': r = db.prepare('SELECT name FROM groups WHERE id = ?').get(id);
        return r ? '「' + auditBrief(r.name, 30) + '」' : 'id=' + id;
      case 'attachments': r = db.prepare('SELECT orig_name, size FROM attachments WHERE id = ?').get(id);
        return r ? '「' + auditBrief(r.orig_name, 40) + '」 ' + Math.round(Number(r.size || 0) / 1024) + ' KB' : 'id=' + id;
      case 'inbox': r = db.prepare('SELECT content, sender_name, group_name FROM inbox WHERE id = ?').get(id);
        return r ? '「' + auditBrief(r.content, 40) + '」 来自 ' + (auditBrief(r.sender_name, 20) || '匿名')
          + (r.group_name ? ' @' + auditBrief(r.group_name, 20) : '') : 'id=' + id;
      case 'rosters': r = db.prepare('SELECT name, roster, keep_id FROM rosters WHERE id = ?').get(id);
        return r ? '「' + auditBrief(r.name, 30) + '」 ' + JL.parseRoster(r.roster, !!r.keep_id).list.length + ' 人' : 'id=' + id;
      case 'jielong': case 'jielongs': r = db.prepare('SELECT title FROM jielongs WHERE id = ?').get(id);
        return r ? '《' + auditBrief(r.title, 40) + '》' : 'id=' + id;
      case 'draw': case 'draws': r = db.prepare('SELECT title FROM draws WHERE id = ?').get(id);
        return r ? '《' + auditBrief(r.title, 40) + '》' : 'id=' + id;
      case 'vote': case 'votes': r = db.prepare('SELECT title FROM votes WHERE id = ?').get(id);
        return r ? '《' + auditBrief(r.title, 40) + '》' : 'id=' + id;
      case 'birthdays': r = db.prepare('SELECT name, month, day FROM birthdays WHERE id = ?').get(id);
        return r ? '「' + auditBrief(r.name, 20) + '」 ' + r.month + '月' + r.day + '日' : 'id=' + id;
      case 'funds': r = db.prepare('SELECT type, amount, note, happened_at FROM funds WHERE id = ?').get(id);
        return r ? (r.type === 'income' ? '收 ' : '支 ') + (Number(r.amount) / 100).toFixed(2) + ' 元'
          + (r.note ? '「' + auditBrief(r.note, 30) + '」' : '') + ' ' + auditBrief(r.happened_at, 16) : 'id=' + id;
      case 'fund-attachment': case 'fund-attachments': r = db.prepare('SELECT orig_name FROM fund_attachments WHERE id = ?').get(id);
        return r ? '「' + auditBrief(r.orig_name, 40) + '」' : 'id=' + id;
      case 'guestbook': r = db.prepare('SELECT nickname, content FROM guestbook WHERE id = ?').get(id);
        return r ? '「' + auditBrief(r.content, 40) + '」（' + (auditBrief(r.nickname, 20) || '匿名') + '）' : 'id=' + id;
      case 'campaign': case 'campaigns': r = db.prepare('SELECT title FROM idea_campaigns WHERE id = ?').get(id);
        return r ? '《' + auditBrief(r.title, 40) + '》' : 'id=' + id;
      case 'users': r = db.prepare('SELECT name, disabled FROM users WHERE sid = ?').get(id);
        return r ? '「' + auditBrief(r.name, 20) + '」（' + id + (r.disabled ? '，已停用' : '') + '）' : 'sid=' + id;
      default: return '';
    }
  } catch (e) { return ''; }
}
// 名称之外再带上原 id：管理员拿这行去核对或恢复时找得到对象（账号一栏本身写的就是学号，不重复）
function auditSubject(resKey, id) {
  if (!id) return '';
  const base = auditSubjectBase(resKey, id);
  if (!base || resKey === 'users') return base;
  return base + '（id ' + id + '）';
}
// 新建的对象这时还没进库可查（或由路由自己给更准的描述），兜底时从请求体挑一个能认出来的名字；
// 机器人上报 / 接口投递的正文在 message、text 这类字段里，只看字符串，数组型消息段跳过
function auditBodySubject(b) {
  if (!b || typeof b !== 'object') return '';
  for (const k of ['title', 'name', 'label', 'note', 'content', 'text', 'message']) {
    const s = typeof b[k] === 'string' ? b[k].trim() : '';
    if (s) return '《' + auditBrief(s, 40) + '》';
  }
  return '';
}
const AUDIT_VERB = { POST: '提交', PUT: '修改', DELETE: '删除' };
const AUDIT_RESOURCE = {
  messages: '信息', groups: '群', attachments: '附件', upload: '附件上传', inbox: '待审核',
  rosters: '班级名单', jielong: '接龙', jielongs: '接龙', draw: '抽签', draws: '签箱',
  votes: '投票', vote: '投票', birthdays: '生日成员', funds: '班费', 'fund-attachments': '班费凭证',
  'fund-attachment': '班费凭证', guestbook: '点子/留言', 'idea-attachments': '点子附件',
  campaigns: '征集', campaign: '征集', users: '账号', password: '密码',
  import: '备份导入', export: '备份导出', 'class-badge': '班徽', login: '登录', logout: '退出',
  ingest: '接口投递', onebot: '机器人上报',
};
// 路径第三段是固定子动作、不是 id 的那些路由
const AUDIT_LITERAL_SEG3 = new Set(['sync', 'accept-all', 'import', 'report', 'mine', 'export', 'similar', 'parse']);
// 「提交 信息」这类机器味说法换成真实动作；形状没命中时仍回落到「动词 + 资源」
const AUDIT_LABEL = {
  'POST /api/messages': '发布通知', 'PUT /api/messages/:id': '编辑通知', 'DELETE /api/messages/:id': '删除信息',
  'POST /api/messages/:id/toggle': '切换完成状态', 'POST /api/messages/:id/pin': '置顶或取消置顶',
  'POST /api/upload': '上传附件', 'DELETE /api/attachments/:id': '删除附件',
  'POST /api/groups': '新建群', 'PUT /api/groups/:id': '修改群', 'DELETE /api/groups/:id': '删除群',
  'POST /api/inbox/:id/accept': '收录待审核', 'POST /api/inbox/accept-all': '批量收录待审核',
  'DELETE /api/inbox/:id': '丢弃待审核', 'DELETE /api/inbox': '清空待审核',
  'POST /api/jielong': '发起接龙', 'POST /api/jielong/:id/join': '填写接龙', 'PUT /api/jielong/:id': '编辑接龙',
  'POST /api/jielong/:id/close': '结束接龙', 'DELETE /api/jielong/:id': '删除接龙', 'DELETE /api/jielong/:id/entry': '删除接龙填写',
  'POST /api/rosters': '新建名单', 'PUT /api/rosters/:id': '编辑名单', 'DELETE /api/rosters/:id': '删除名单',
  'POST /api/draw': '新建抽签', 'POST /api/draw/:id/go': '抽签点名', 'POST /api/draw/:id/undo': '撤销抽签',
  'POST /api/draw/:id/reset': '重置签箱', 'PUT /api/draw/:id': '编辑抽签', 'DELETE /api/draw/:id': '删除抽签',
  'POST /api/vote': '发起投票', 'POST /api/vote/:id/ballot': '投出选票', 'PUT /api/vote/:id': '编辑投票',
  'POST /api/vote/:id/stop': '结束投票', 'DELETE /api/vote/:id': '删除投票',
  'POST /api/birthdays': '新添加生日', 'PUT /api/birthdays/:id': '修改生日', 'DELETE /api/birthdays/:id': '删除生日',
  'POST /api/birthdays/import': '导入生日名单',
  'POST /api/funds': '记一笔班费', 'PUT /api/funds/:id': '修改班费记录', 'DELETE /api/funds/:id': '删除班费记录',
  'POST /api/funds/:id/attachment': '上传班费凭证', 'DELETE /api/fund-attachments/:id': '删除班费凭证',
  'POST /api/guestbook': '发布留言', 'PUT /api/guestbook/:id': '更新点子',
  'POST /api/guestbook/:id/like': '点赞留言', 'DELETE /api/guestbook/:id': '删除留言',
  'DELETE /api/idea-attachments/:id': '删除点子附件',
  'POST /api/campaigns': '发起征集', 'PUT /api/campaigns/:id': '编辑征集', 'DELETE /api/campaigns/:id': '删除征集',
  'POST /api/users/sync': '批量开通账号', 'PUT /api/users/:sid': '修改账号', 'DELETE /api/users/:sid': '删除账号',
  'POST /api/password': '修改自己的密码', 'POST /api/import': '导入备份',
  'POST /api/class-badge': '上传班徽', 'DELETE /api/class-badge': '删除班徽',
  'POST /api/ingest': '接口投递信息', 'POST /api/onebot': '机器人上报', 'POST /api/onebot/report': '机器人上报',
  'POST /api/parse': '解析文本', 'POST /api/similar': '查重相似信息',
  // 没设管理密码（开放模式）时登录接口直接放行、不校验任何东西，这类调用才落到这里
  'POST /api/login': '登录尝试',
};
function auditShape(method, norm) {
  const seg = norm.split('/');
  if (seg.length >= 4 && !AUDIT_LITERAL_SEG3.has(seg[3])) seg[3] = ':id';
  return method + ' ' + seg.join('/');
}
function auditFallback(ctx, method, norm) {
  const seg = norm.split('/');                 // ['', 'api', 资源, 可选 id, 可选子动作]
  const key = seg[2] || '';
  const name = AUDIT_RESOURCE[key] || key || '接口';
  const label = AUDIT_LABEL[auditShape(method, norm)] || `${AUDIT_VERB[method] || method} ${name}`;
  const idPart = seg.length >= 4 && !AUDIT_LITERAL_SEG3.has(seg[3]) ? seg[3] : '';
  let what = ctx.auditSubject || auditBodySubject(ctx.body);
  if (!what && idPart) what = '对象 ' + idPart;
  if (what && idPart && !/^(id=|sid=)/.test(what) && !what.includes('（id ')) what += '（id ' + idPart + '）';
  audit(ctx, label, what);
}
function sField(v, max) {
  const s = String(v == null ? '' : v).trim();
  return s.slice(0, max);
}
/* ---------- 班费收支：金额一律以「分」存整数，避免浮点累加误差 ---------- */
const FUND_TYPES = ['income', 'expense'];
function fundAmountFen(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const fen = Math.round(n * 100); // 元 → 分（四舍五入到分）
  if (fen <= 0 || fen > 10000000000) return null; // 必须为正，上限 1 亿元
  return fen;
}
function fundView(row) {
  return {
    id: row.id, type: row.type, amount: row.amount / 100,
    note: row.note, happened_at: row.happened_at,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}
// 筛选条件构造（列表与 CSV 导出共用同一口径）
function fundWhere(query) {
  const where = [];
  const args = [];
  const type = query.get('type');
  if (type === 'income' || type === 'expense') { where.push('type = ?'); args.push(type); }
  const from = cleanDT(query.get('from'));
  const to = cleanDT(query.get('to'));
  // 按天粒度比较：happened_at 可能是纯日期或带时分，两侧都截取日期部分再比，
  // 否则字符串比较下 '2026-10-19' < '2026-10-19 00:00' 会把起始日当天的账目整批漏掉。
  // 调用方传了带时分的时间点（页面只发日期，机器人/API 会发完整时间）时保持精确比较，不放宽到整天
  if (from) { where.push(from.length === 10 ? 'substr(happened_at, 1, 10) >= ?' : 'happened_at >= ?'); args.push(from); }
  if (to) { where.push(to.length === 10 ? 'substr(happened_at, 1, 10) <= ?' : 'happened_at <= ?'); args.push(to); }
  const search = (query.get('q') || '').trim();
  if (search) {
    where.push(`note LIKE ? ESCAPE '\\'`);
    args.push(likeArg(search));
  }
  return { whereSql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
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
  selftest: !!SELFTEST_TAG,   // 自检脚本据此判断能否按 tag 清理自己写的那批记录
}));
/* 登录失败也进操作记录：公网域名上"谁在试哪些学号"正是管理员要看到的东西。
 * 但这是未登录就能触发的写入，所以自己再限一道：同一 IP 的同一类失败 5 分钟内只落一条，
 * 其余只计数并在下一条里合并说明——否则对着登录接口刷就能把真实操作记录挤出 2 万条的滚动窗口。 */
const loginFailAudit = new Map();
function auditLoginFail(ctx, ip, kind, what) {
  const key = ip + '|' + kind;
  const now = Date.now();
  const rec = loginFailAudit.get(key);
  if (rec && rec.until > now) { rec.n++; return; }
  if (loginFailAudit.size > 4000) loginFailAudit.clear();   // 内存兜底：班级规模下远到不了
  loginFailAudit.set(key, { until: now + 5 * 60000, n: 0 });
  audit(ctx, '登录失败', what + (rec && rec.n ? `（同类失败近 5 分钟还挡了 ${rec.n} 次，未逐条记录）` : ''));
}
// 登录校验计时对齐用的假凭据（结构与真账号一致：16 字节盐 + 32 字节散列，永不可能匹配）
const DUMMY_LOGIN = { salt: crypto.randomBytes(16).toString('hex'), hash: crypto.randomBytes(32).toString('hex') };
route('POST', '/api/login', async (ctx) => {
  const b = ctx.body || {};
  const ip = ctx.req.socket.remoteAddress || '?';
  const sid = String(b.sid || '').trim().slice(0, 32);
  const pw = String(b.password || '');
  const now = Date.now();
  if (!accessControlOn()) return { ok: true, authRequired: false, role: 'admin' };
  // 两道限速：整 IP 挡撞库扩散；单学号 5 次失败锁 10 分钟——名单是全班可见的，
  // 不锁账号就等于任何人都能对着某个学号硬试 6 位初始密码
  const tooFast = (key, max, windowMs) => {
    const rec = loginFails.get(key);
    if (!rec) return false;
    if (now - rec.t > windowMs) { loginFails.delete(key); return false; }
    return rec.n >= max;
  };
  const bump = (key) => {
    const rec = loginFails.get(key) || { n: 0, t: now };
    rec.n += 1; rec.t = now;
    loginFails.set(key, rec);
  };
  const clearFails = (keys) => { for (const k of keys) loginFails.delete(k); };
  if (tooFast(ip, 10, 60000)) {
    auditLoginFail(ctx, ip, 'ip', '同一 IP 一分钟内试了 10 次以上，直接拒绝（撞库或共享设备连点）');
    throw new HttpError(429, '尝试次数过多，请一分钟后再试');
  }
  const newSession = (sess) => {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Object.assign({ t: now }, sess));
    ctx.res.setHeader('Set-Cookie', `infohub_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  };
  if (!sid) {
    // 管理员入口：密码仍是 config.json 的 password（未设置时不存在管理员登录）
    if (!adminPwOn()) throw new HttpError(400, '本站未设置管理密码');
    // 优先按散列校验；文件只读导致明文没能升级时退回恒时比较
    let okAdmin = false;
    if (CONFIG.password_hash) okAdmin = await AUTH.verifyPassword(pw, CONFIG.password_salt, CONFIG.password_hash);
    else {
      const a = Buffer.from(pw);
      const c = Buffer.from(CONFIG.password || '');
      okAdmin = a.length === c.length && crypto.timingSafeEqual(a, c);
    }
    if (!okAdmin) {
      bump(ip);
      auditLoginFail(ctx, ip, 'admin', '管理员密码不对');
      throw new HttpError(401, '密码不对');
    }
    clearFails([ip]);
    newSession({ role: 'admin', sid: '', name: '管理员' });
    audit(ctx, '登录成功', '管理员密码通过', { sid: '', name: '管理员', role: 'admin' });
    log('管理员登录成功，新会话已建立');
    return { ok: true, role: 'admin', name: '管理员' };
  }
  if (tooFast('sid:' + sid, 5, 10 * 60 * 1000)) {
    const rec = loginFails.get('sid:' + sid);
    const wait = Math.max(1, Math.ceil((rec.t + 10 * 60 * 1000 - now) / 60000));
    auditLoginFail(ctx, ip, 'locked', `学号 ${sid} 连续失败已锁定，还需等 ${wait} 分钟（本次请求未校验密码）`);
    throw new HttpError(429, '该学号连续失败次数过多，请 10 分钟后再试');
  }
  const u = db.prepare('SELECT * FROM users WHERE sid = ?').get(sid);
  // 学号不存在与密码不对回同一句话：登录接口不能用来枚举哪些学号开过号。
  // 但只对齐文案不够——账号不存在时若短路跳过 scrypt，响应会快几十毫秒，
  // 拿延迟照样能问出"这个学号开没开通"。所以不存在 / 停用也做一次同等成本的校验。
  const okPw = await AUTH.verifyPassword(pw, u ? u.salt : DUMMY_LOGIN.salt, u ? u.pw_hash : DUMMY_LOGIN.hash);
  const pass = !!u && !u.disabled && okPw;
  if (!pass) {
    bump(ip); bump('sid:' + sid);
    const tries = (loginFails.get('sid:' + sid) || { n: 0 }).n;
    // 记录里可以分辨（也只有管理员看得到），但对客户端只回同一句话
    if (!u) auditLoginFail(ctx, ip, 'no-sid', `查无此学号：${sid}（还没开通账号）`);
    else if (u.disabled) auditLoginFail(ctx, ip, 'disabled', `「${u.name}」（${sid}）已停用仍尝试登录`);
    else auditLoginFail(ctx, ip, 'pw', `「${u.name}」（${sid}）密码不对（该学号本轮第 ${tries} 次失败）`);
    throw new HttpError(401, '学号或密码不对');
  }
  // 停用的账号刻意与"密码不对"回同一句话（见上），差异只留在操作记录里：能登录说明真的通过了校验
  clearFails([ip, 'sid:' + sid]);
  newSession({ role: u.role, sid: u.sid, name: u.name, mustChange: !!u.must_change });
  db.prepare('UPDATE users SET last_login = ? WHERE sid = ?').run(nowStr(), u.sid);
  audit(ctx, '登录成功', u.name + '（' + u.sid + '）', { sid: u.sid, name: u.name, role: u.role });
  return { ok: true, role: u.role, name: u.name, sid: u.sid, mustChange: !!u.must_change };
});
route('POST', '/api/logout', (ctx) => {
  const m = /(?:^|;\s*)infohub_session=([a-f0-9]{32,})/.exec(ctx.req.headers.cookie || '');
  const s = m ? sessions.get(m[1]) : null;
  if (m) sessions.delete(m[1]);
  ctx.res.setHeader('Set-Cookie', 'infohub_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  // 会话一删，auditWho 就再也认不出是谁退的，所以把身份在删之前拿出来交给记录
  if (s) audit(ctx, '退出登录', (s.name || '匿名') + (s.sid ? '（' + s.sid + '）' : '（管理员密码）'),
    { sid: s.sid || '', name: s.name || '', role: s.role || '' });
  else ctx.audited = true; // 没会话可退（重复点退出 / 直接打接口），不值得留一条匿名记录
  return { ok: true };
});
route('GET', '/api/me', (ctx) => {
  const s = sessionOf(ctx.req);
  const open = !accessControlOn();
  const byToken = tokenAdminOk(ctx.req);
  return {
    authRequired: !open,
    loggedIn: open || !!s || byToken,
    readOnly: !open && !s && !byToken, // 未登录：只看得到登录页
    role: open ? 'admin' : (s ? s.role : (byToken ? 'admin' : 'guest')),
    name: s ? s.name : (open ? '开放访问' : ''),
    sid: s ? s.sid : '',
    mustChange: !!(s && s.mustChange),
  };
});
// 本人改密（学生 / 班委 / 管理员都走这里；管理员没有账号记录，只回会话标记）
route('POST', '/api/password', async (ctx) => {
  const s = sessionOf(ctx.req);
  if (!s || !s.sid) throw new HttpError(400, '请先用学号登录');
  const b = ctx.body || {};
  const oldPw = String(b.oldPassword || '');
  const newPw = String(b.newPassword || '');
  if (newPw.length < 6) throw new HttpError(400, '新密码至少 6 位');
  if (newPw.length > 64) throw new HttpError(400, '新密码过长');
  const u = db.prepare('SELECT * FROM users WHERE sid = ?').get(s.sid);
  if (!u || u.disabled) throw new HttpError(403, '账号不可用');
  if (!await AUTH.verifyPassword(oldPw, u.salt, u.pw_hash)) throw new HttpError(401, '原密码不对');
  if (oldPw === newPw) throw new HttpError(400, '新密码不能与原密码相同');
  const cred = await AUTH.makeCredential(newPw);
  db.prepare('UPDATE users SET pw_hash = ?, salt = ?, must_change = 0, updated_at = ? WHERE sid = ?')
    .run(cred.pwHash, cred.salt, nowStr(), u.sid);
  s.mustChange = false;
  // 改密的常见动机是"怀疑密码被人知道了"，所以同账号的其他会话要一并作废（只留下眼前这一个），
  // 否则改了密码，别人那份旧会话还能继续用到过期
  for (const [token, other] of sessions) if (other !== s && other.sid === u.sid) sessions.delete(token);
  audit(ctx, '修改密码', u.name + '（' + u.sid + '）' + (u.must_change ? ' 首次改掉初始密码' : '，同账号其他会话已退出'));
  return { ok: true };
});

/* ---------- 账号管理（仅管理员）：从班级名单开号、设班委、重置、停用 ---------- */
const USER_ROLES = ['student', 'officer'];
// 角色 / 状态 / 密码一变，旧会话立即作废——否则被降权的班委能带着旧权限继续用到会话过期
function dropUserSessions(sid) {
  for (const [token, s] of sessions) if (s.sid === sid) sessions.delete(token);
}
route('GET', '/api/users', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const items = db.prepare('SELECT sid, name, role, must_change, disabled, created_at, last_login FROM users ORDER BY sid').all();
  return { total: items.length, items };
});
route('POST', '/api/users/sync', async (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  // 没设管理密码时 authOk 恒真，开号等于把全站交给任意拿到链接的人
  if (!adminPwOn()) throw new HttpError(400, '请先在「统计接入」里设置管理密码，再开通账号');
  const r = db.prepare('SELECT * FROM rosters WHERE id = ?').get(Number((ctx.body || {}).rosterId));
  if (!r) throw new HttpError(400, '所选名单不存在');
  const list = JL.parseRoster(r.roster, !!r.keep_id).list;
  if (!list.length) throw new HttpError(400, '这份名单是空的');
  const has = db.prepare('SELECT sid FROM users WHERE sid = ?');
  // 先在事务外把凭据算完（scrypt 是异步的，不能进同步事务），再一次性原子入库：
  // 否则中途失败会留下半截账号且调用方拿到 500，不知道开了多少个
  const pending = [];
  let existing = 0;
  const noSid = [];
  for (const m of list) {
    const sid = String(m.id || '').trim();
    if (!sid) { noSid.push(m.name); continue; } // 没学号就没法当登录名，也不能用姓名（会重名）
    if (has.get(sid)) { existing++; continue; } // 已有账号不动密码
    pending.push([sid, String(m.name).slice(0, 40), await AUTH.makeCredential(AUTH.initialPassword(sid))]);
  }
  let created = 0;
  transact(() => {
    const ins = db.prepare(`INSERT INTO users (sid, name, pw_hash, salt, role, must_change, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'student', 1, ?, ?)`);
    for (const [sid, name, cred] of pending) {
      ins.run(sid, name, cred.pwHash, cred.salt, nowStr(), nowStr());
      created++;
    }
  });
  refreshUsersExist();
  audit(ctx, '开通账号', `名单「${auditBrief(r.name, 30)}」${list.length} 人：新增 ${created} 个、已存在 ${existing} 个`
    + (noSid.length ? `，${noSid.length} 人缺学号开不出（${auditBrief(noSid.join('、'), 40)}）` : ''));
  return { ok: true, created, existing, noSid };
});
route('PUT', '/api/users/:sid', async (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const u = db.prepare('SELECT * FROM users WHERE sid = ?').get(String(ctx.params.sid || '').trim());
  if (!u) throw new HttpError(404, '账号不存在');
  const b = ctx.body || {};
  const done = [];
  if (b.role !== undefined) {
    if (!USER_ROLES.includes(b.role)) throw new HttpError(400, '角色只能是 student 或 officer');
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE sid = ?').run(b.role, nowStr(), u.sid);
    done.push(b.role === u.role ? '角色仍是' + (b.role === 'officer' ? '班委' : '普通同学')
      : b.role === 'officer' ? '设为班委（可发通知与勾选完成 / 置顶、收录与丢弃待审核、管理接龙投票抽签、删留言）' : '降为普通同学');
  }
  if (b.disabled !== undefined) {
    db.prepare('UPDATE users SET disabled = ?, updated_at = ? WHERE sid = ?').run(b.disabled ? 1 : 0, nowStr(), u.sid);
    done.push(b.disabled ? '停用登录（历史数据保留）' : '恢复登录');
  }
  if (b.reset === true) {
    const cred = await AUTH.makeCredential(AUTH.initialPassword(u.sid));
    db.prepare('UPDATE users SET pw_hash = ?, salt = ?, must_change = 1, updated_at = ? WHERE sid = ?')
      .run(cred.pwHash, cred.salt, nowStr(), u.sid);
    done.push('密码重置为学号后 6 位');
  }
  if (!done.length) throw new HttpError(400, '没有要修改的内容');
  dropUserSessions(u.sid);
  audit(ctx, '修改账号', u.name + '（' + u.sid + '）' + done.join('、'));
  return { ok: true };
});
route('DELETE', '/api/users/:sid', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const info = db.prepare('DELETE FROM users WHERE sid = ?').run(String(ctx.params.sid || '').trim());
  if (!info.changes) throw new HttpError(404, '账号不存在');
  refreshUsersExist();
  dropUserSessions(String(ctx.params.sid || '').trim());
  audit(ctx, '删除账号', (ctx.auditSubject || 'sid=' + ctx.params.sid) + ' 登录名一并释放（他已有的接龙与选票记录保留）');
  return { ok: true };
});

/* ---------- 操作记录查询：只有系统管理员能看（按人 / 动作 / 日期筛） ---------- */
function auditWhere(query) {
  const where = [];
  const args = [];
  const who = sField(query.get('who'), 32);
  if (who) { where.push('sid = ?'); args.push(who); }
  const act = sField(query.get('action'), 40);
  if (act) { where.push('action LIKE ? ESCAPE \'\\\''); args.push(likeArg(act)); }
  const from = cleanDT(query.get('from'));
  const to = cleanDT(query.get('to'));
  if (from) { where.push('substr(created_at, 1, 10) >= ?'); args.push(from.slice(0, 10)); }
  if (to) { where.push('substr(created_at, 1, 10) <= ?'); args.push(to.slice(0, 10)); }
  return { whereSql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}
function auditPage(query) {
  const { whereSql, args } = auditWhere(query);
  const limit = Math.min(Math.max(Number(query.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(query.get('offset')) || 0, 0);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`).get(...args).c;
  const items = db.prepare(`SELECT id, sid, name, role, action, detail, ip, tag, created_at FROM audit_log ${whereSql}
      ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  return { total, items };
}
route('GET', '/api/audit', (ctx) => {
  // 只有系统管理员能看操作记录：班委与同学连"自己那条链"也不给看——
  // 记录里带着别人投给谁、谁还没交等同类内容，给自己看自己并不能把这份信息圈住
  if (!authOk(ctx.req)) throw new HttpError(401, '只有系统管理员能查看操作记录');
  return auditPage(ctx.query);
});
route('GET', '/api/audit/export', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const { whereSql, args } = auditWhere(ctx.query);
  const rows = db.prepare(`SELECT created_at, sid, name, role, action, detail, ip FROM audit_log ${whereSql}
      ORDER BY id DESC LIMIT 20000`).all(...args);
  const q = (v) => {
    let s = String(v == null ? '' : v);
    // 中和 Excel 公式注入：姓名、留言正文、通知标题这些内容都由人填，以 = + - @ 开头时
    // 直接打开 CSV 会被当公式执行（与班费 CSV、接龙 CSV 同一口径）
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const ROLE = { admin: '管理员', officer: '班委', student: '同学' };
  const lines = ['时间,学号,姓名,身份,操作,详情,来源 IP'];
  for (const r of rows) lines.push([r.created_at, r.sid, r.name, ROLE[r.role] || r.role, r.action, r.detail, r.ip].map(q).join(','));
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  ctx.res.wrote = true;
  ctx.res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="audit.csv"; filename*=UTF-8''${encodeURIComponent('操作记录.csv')}`,
  });
  ctx.res.end(body);
});
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

/* ---------- 管理设置：重置 apiToken（无需重启，旧令牌立即失效） ---------- */
route('POST', '/api/settings/reset-token', (ctx) => {
  if (!isSysAdmin(ctx)) throw new HttpError(401, '仅系统管理员可操作');
  const newToken = crypto.randomBytes(16).toString('hex');
  // 写回 data/config.json
  const cfgPath = path.join(DATA_DIR, 'config.json');
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    cfg.apiToken = newToken;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    throw new HttpError(500, '写入 config.json 失败：' + e.message);
  }
  // 同步更新内存中的 CONFIG
  CONFIG.apiToken = newToken;
  audit(ctx, '重置管理接口令牌', '已生成新 apiToken，旧令牌立即失效');
  return { ok: true, apiToken: newToken };
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
  if (!db.prepare('SELECT id FROM groups WHERE id = ?').get(id)) throw new HttpError(404, '群不存在');
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
  audit(ctx, '发布通知', '《' + auditBrief(title || content, 40) + '》'
    + (title && content ? ' 正文「' + auditBrief(content, 40) + '」' : '')
    + ' ' + (CAT_LABEL[category] || category) + (cleanDT(b.deadline) ? ' 截止 ' + cleanDT(b.deadline) : '')
    + '（id ' + info.lastInsertRowid + '）');
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
  const MSG_FIELD = { title: '标题', content: '正文', category: '分类', status: '状态', group_id: '所属群',
    sender_name: '来源', received_at: '接收时间', deadline: '截止时间', priority: '优先级', pinned: '置顶', tags: '标签' };
  const diff = Object.keys(v).filter((k) => String(v[k]) !== String(old[k])).map((k) => MSG_FIELD[k] || k);
  audit(ctx, '编辑通知', '《' + auditBrief(v.title || v.content, 40) + '》'
    + (diff.length ? ' 改了' + diff.join('、') : ' 提交内容与原值相同') + '（id ' + id + '）');
  return getMessage(id);
});

route('POST', '/api/messages/:id/toggle', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const was = db.prepare('SELECT status FROM messages WHERE id = ?').get(id);
  if (!was) throw new HttpError(404, '信息不存在'); // 不存在就 404，别先写一条凭空的审计再让 getMessage 抛错
  db.prepare(`UPDATE messages SET status = CASE WHEN status = 'open' THEN 'done' ELSE 'open' END,
      updated_at = ? WHERE id = ?`).run(nowStr(), id);
  audit(ctx, was.status === 'open' ? '标记为已完成' : '重新打开任务', ctx.auditSubject || 'id=' + id);
  return getMessage(id);
});
route('POST', '/api/messages/:id/pin', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const was = db.prepare('SELECT pinned FROM messages WHERE id = ?').get(id);
  if (!was) throw new HttpError(404, '信息不存在');
  db.prepare('UPDATE messages SET pinned = 1 - pinned, updated_at = ? WHERE id = ?').run(nowStr(), id);
  audit(ctx, was.pinned ? '取消置顶' : '置顶', ctx.auditSubject || 'id=' + id);
  return getMessage(id);
});

route('DELETE', '/api/messages/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const atts = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(id);
  // 先在事务里删行，提交后再删磁盘文件：反过来的话中途失败会留下"附件记录还在、文件已没了"的
  // 404 死链（与班费凭证删除同一顺序）；残留文件交给清扫任务
  const gone = transact(() => {
    const info = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    if (!info.changes) throw new HttpError(404, '信息不存在');
    db.prepare('DELETE FROM attachments WHERE message_id = ?').run(id);
    return true;
  });
  if (gone) {
    for (const a of atts) {
      const fp = path.resolve(UPLOAD_DIR, a.stored_name);
      try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
    }
  }
  audit(ctx, '删除信息', (ctx.auditSubject || `id=${id}`)
    + (atts.length ? ' 连带 ' + atts.length + ' 个附件' : ''));
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
      // 单文件尺寸检查：超过 MAX_FILE_SIZE 直接拒绝，不写盘
      if (f.data.length > MAX_FILE_SIZE) {
        throw new HttpError(413, '单文件不能超过 ' + Math.round(MAX_FILE_SIZE / 1024 / 1024) + ' MB：' + sanitizeName(f.filename));
      }
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
        .run(mid, orig, rel, f.data.length, cleanMime(f.contentType), nowStr());
      saved.push(Number(info.lastInsertRowid));
    }
  } catch (e) {
    // 多文件上传中途失败（如磁盘满）：把本次已写盘的文件和已入库的记录一并回滚，不留孤儿
    for (const id of saved) { try { db.prepare('DELETE FROM attachments WHERE id = ?').run(id); } catch (e2) { /* 忽略 */ } }
    for (const fp0 of written) { try { fs.unlinkSync(fp0); } catch (e2) { /* 留给清扫任务 */ } }
    throw e;
  }
  if (saved.length) {
    const owner = db.prepare('SELECT title, content FROM messages WHERE id = ?').get(mid);
    audit(ctx, '上传附件', (owner ? '《' + auditBrief(owner.title || owner.content, 30) + '》 ' : '（未挂信息） ')
      + saved.length + ' 个：' + files.slice(0, saved.length).map((f) => auditBrief(f.filename, 24)
        + ' ' + Math.round(f.data.length / 1024) + ' KB').join('、') + '（信息 id ' + mid + '）');
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
  // 历史数据里的 mime 可能带非 ASCII（老版本上传未净化）：下发前再拦一道，
  // 非法值回落 octet-stream，避免 writeHead 抛错且异常被吞掉导致请求挂死
  const mime = /^[A-Za-z0-9][\w!#$&^_.+-]*\/[\w!#$&^_.+-]*$/.test(a.mime || '') ? a.mime : 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.orig_name)}`,
    'X-Content-Type-Options': 'nosniff',
    ...(cache ? { 'Cache-Control': 'public, max-age=3600' } : {}),
  });
  res.wrote = true; // 置真必须在 writeHead 成功之后：抛错时 dispatcher 才能回 500 而不是静默挂起
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
    // 去重必须带上群归属：两个班群 5 分钟内出现相同内容是常态，不能互相误判成重复上报。
    // 未绑定 ext_key 的群消息不能落 group_id IS NULL 桶——那和已收录的私聊共用判重空间，
    // 会把「群成员发的与某条私聊同文」误判成重复静默丢弃；用 -1 占位（群 id 恒为正，永不命中）
    const bound = isGroup ? (db.prepare('SELECT id FROM groups WHERE ext_key = ?').get('qq:' + gid) || {}).id : null;
    const dupMsg = db.prepare(`SELECT id FROM messages WHERE sender_name = ? AND content = ? AND received_at >= ? AND group_id IS ? LIMIT 1`)
      .get(sender, content, agoStr, isGroup ? (bound ?? -1) : null);
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

/* ---------- 可嵌套事务 ----------
 * SQLite 不支持嵌套 BEGIN（"cannot start a transaction within a transaction"）。
 * 这里用 SAVEPOINT 实现嵌套：最外层用 BEGIN/COMMIT，内层用 SAVEPOINT/RELEASE，
 * 任一层抛错就回滚到其保存点，最外层回滚整个事务。node:sqlite 是同步执行，
 * 计数器在单线程内安全。 */
let txDepth = 0;
function transact(fn) {
  if (txDepth === 0) {
    db.exec('BEGIN');
    txDepth = 1;
    try { const r = fn(); db.exec('COMMIT'); txDepth = 0; return r; }
    catch (e) { try { db.exec('ROLLBACK'); } catch (e2) { /* 忽略 */ } txDepth = 0; throw e; }
  }
  const sp = 'sp' + txDepth;
  db.exec(`SAVEPOINT ${sp}`);
  txDepth++;
  try { const r = fn(); db.exec(`RELEASE ${sp}`); txDepth--; return r; }
  catch (e) { try { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); } catch (e2) { /* 忽略 */ } txDepth--; throw e; }
}

/* ---------- 待审核收件箱（review 模式：QQ 消息先入箱，管理员挑着收录） ---------- */
function acceptInboxItem(id) {
  const item = db.prepare('SELECT * FROM inbox WHERE id = ?').get(id);
  if (!item) throw new HttpError(404, '待审核消息不存在');
  // 事务包裹：INSERT messages + DELETE inbox 必须原子完成，避免中途失败导致重复收录
  // 被 accept-all 的外层事务调用时自动降为 SAVEPOINT，不产生嵌套 BEGIN
  return transact(() => {
    const gid = item.qq_gid ? bindOnebotGroup(item.qq_gid, item.group_name || `QQ群 ${item.qq_gid}`) : null;
    const { id: mid } = insertParsedMessage(item.content, {
      groupId: gid,
      sender: item.sender_name,
      received: item.received_at || nowStr(),
    });
    db.prepare('DELETE FROM inbox WHERE id = ?').run(id);
    return mid;
  });
}
route('GET', '/api/inbox', (ctx) => {
  // 待审核收件箱：机器人抓来的原始群消息，管理员与班委可审（班委的能力之一就是挑消息收录）
  if (!canPostOk(ctx.req)) throw new HttpError(401, '需要管理员或班委登录');
  const limit = Math.min(Math.max(Number(ctx.query.get('limit')) || 300, 1), 500);
  const total = db.prepare('SELECT COUNT(*) AS c FROM inbox').get().c;
  const rows = db.prepare('SELECT * FROM inbox ORDER BY id DESC LIMIT ?').all(limit);
  return { total, items: rows };
});
route('POST', '/api/inbox/accept-all', (ctx) => {
  const ids = db.prepare('SELECT id FROM inbox ORDER BY id LIMIT 500').all().map((r) => r.id);
  // 整体事务：逐条收录是独立写库，中途失败（如磁盘满）不应留下半收录状态
  transact(() => { for (const id of ids) acceptInboxItem(id); });
  console.log(`待审核批量收录：${ids.length} 条`);
  audit(ctx, '批量收录待审核', ids.length + ' 条（id ' + ids.slice(0, 8).join('、') + (ids.length > 8 ? '…' : '') + '）');
  return { ok: true, accepted: ids.length };
});
route('POST', '/api/inbox/:id/accept', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const mid = acceptInboxItem(id);
  audit(ctx, '收录待审核', (ctx.auditSubject || 'id=' + id) + ' → 信息 id ' + mid);
  return getMessage(mid);
});
route('DELETE', '/api/inbox/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const info = db.prepare('DELETE FROM inbox WHERE id = ?').run(id);
  if (!info.changes) throw new HttpError(404, '待审核消息不存在');
  audit(ctx, '丢弃待审核', ctx.auditSubject || 'id=' + id);
  return { ok: true };
});
route('DELETE', '/api/inbox', (ctx) => {
  const info = db.prepare('DELETE FROM inbox').run();
  audit(ctx, '清空待审核', Number(info.changes) + ' 条');
  return { ok: true, dismissed: Number(info.changes) };
});

/* ---------- 班级接龙（独立项目「接龙小助手」并入） ----------
 * 全班登录后可读；学生提交 /j/:id 用登录账号定位身份；
 * 管理操作（编辑 / 停止 / 删除 / 导出）对系统管理员与班委同权，不区分发起人；
 * 名单与记录里的学号只随系统管理员的会话下发，班委也不能整份替换名单。
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
// 接龙的两套权限分开（与投票同一口径）：
// jielongAdminOk（仅系统管理员）决定"名单与记录里的学号要不要下发"——学号=登录名、初始密码=学号后 6 位，
// 整班学号给到任何一级账号都是账号接管链。
// jlCanEdit（管理员或班委）决定"能不能编辑 / 停止 / 删除这条接龙"，班委与管理员同权、不区分发起人。
// 历史上的 ?t= 委托令牌已随账号体系一起退役。
function jielongAdminOk(ctx) { return authOk(ctx.req); }
function jlCanEdit(ctx) { return canPostOk(ctx.req); }
// 名单原文只能由系统管理员整份替换：班委看到的名单是脱敏版（只有姓名），
// 让他保存一次就会把学号静默洗掉、已有记录全部转成"名单外"。
function rejectRosterRewrite(ctx) {
  if (!jielongAdminOk(ctx)) throw new HttpError(403, '名单不能这样整份替换：你看到的是去掉学号的名单，保存会把学号冲掉');
}
// 下发给某个会话的接龙视图：本人那条按会话学号定位（客户端不必拿姓名去猜），
// 非系统管理员一律去掉学号——GET 与 PUT 的响应必须走同一个函数，否则编辑响应会绕过脱敏漏出整班学号
function jielongViewFor(ctx, a) {
  const view = jielongView(a);
  const me = sessionOf(ctx.req) || {};
  view.mine = me.sid ? (a.entries.find((e) => String(e.id || '') === String(me.sid)) || null) : null;
  view.inList = !a.roster.length || a.roster.some((r) => me.sid && String(r.id || '') === String(me.sid));
  if (!jielongAdminOk(ctx)) {
    // 学号只给系统管理员：接龙的参与者名单是全班可见的，但带上学号就成了整班个人信息外泄
    view.roster = view.roster.map((r) => ({ name: r.name }));
    view.entries = view.entries.map((e) => ({ rid: e.rid, name: e.name, values: e.values, remark: e.remark, time: e.time, outside: e.outside }));
    if (view.missing) view.missing = view.missing.map((m) => ({ name: m.name }));
  }
  return view;
}
function saveJielongEntries(a) {
  const del = db.prepare('DELETE FROM jielong_entries WHERE jielong_id = ?');
  const ins = db.prepare(`INSERT INTO jielong_entries (jielong_id, rid, sid, name, values_json, remark, outside, time, seq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  transact(() => {
    del.run(a.id);
    a.entries.forEach((e, i) => {
      // seq 固定为当前数组下标：修改提交只更新内容与时间，不改变名单里的先后次序
      ins.run(a.id, e.rid == null ? null : e.rid, e.id || '', e.name, JSON.stringify(e.values || {}),
        e.remark || '', e.outside ? 1 : 0, e.time || Date.now(), i);
    });
  });
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
  // 发起接龙属于班委能力清单；停止 / 编辑 / 删除仍归管理员
  if (!canPostOk(ctx.req)) throw new HttpError(401, '需要管理员或班委登录');
  const b = ctx.body || {};
  const title = sField(b.title, 60);
  if (!title) throw new HttpError(400, '请填写接龙标题');
  // 名单两种来源：引用已有班级名单（rosterId，学号内容不经发起人）或直接粘贴文本
  let roster;
  if (b.rosterId != null && b.rosterId !== '') {
    const r = db.prepare('SELECT * FROM rosters WHERE id = ?').get(Number(b.rosterId));
    if (!r) throw new HttpError(400, '所选名单不存在，请重新选择');
    roster = JL.parseRoster(r.roster, !!r.keep_id).list;
  } else {
    roster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
  }
  if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
  const deadline = cleanDT(b.deadline) || '';
  const id = JL.genId(7);
  const fields = JL.sanitizeFields(b.fields);
  db.prepare(`INSERT INTO jielongs (id, title, description, deadline, roster, fields, allow_outside, closed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .run(id, title, sField(b.description, 1000), deadline, JSON.stringify(roster),
      JSON.stringify(fields), b.allowOutside === false ? 0 : 1, Date.now());
  audit(ctx, '发起接龙', '《' + auditBrief(title, 40) + '》 ' + roster.length + ' 人名单、' + fields.length
    + ' 个问题' + (deadline ? '，截止 ' + deadline : '') + (b.allowOutside === false ? '，仅限名单内' : '') + '（id ' + id + '）');
  return { ok: true, id };
});

route('GET', '/api/jielong/:id', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  return jielongViewFor(ctx, a);
});

// 学生提交/更新接龙（同一身份重新提交即覆盖，便于修改）；无需登录
route('POST', '/api/jielong/:id/join', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (JL.isClosed(a)) throw new HttpError(400, '该接龙已截止，无法再提交');
  const b = ctx.body || {};
  const me = sessionOf(ctx.req) || {};
  if (!me.sid) throw new HttpError(400, '请用班级账号参与接龙（管理员密码不参与填写）');
  // 身份只认登录账号的学号：姓名与名单槽位都由它推出，客户端传来的 name / rid 一概不采信
  let rid = null, id = String(me.sid), name = String(me.name || '').slice(0, 60), outside = false;
  const slot = a.roster.findIndex((r) => String(r.id || '') === id);
  if (slot === -1) {
    outside = true;
    if (a.roster.length && !a.allowOutside) throw new HttpError(400, '你不在本次接龙名单中，该接龙不允许名单外参与');
  } else {
    rid = slot; name = a.roster[slot].name || name; id = a.roster[slot].id || id;
  }

  const vals = b.values && typeof b.values === 'object' ? b.values : {};
  const values = {};
  for (const f of a.fields) {
    let v = String(vals[f.key] == null ? '' : vals[f.key]).trim().slice(0, 300);
    if (f.required && !v) throw new HttpError(400, '请填写「' + f.label + '」');
    // 单选项只认预设选项：绕过页面下拉的请求不能往统计表/CSV 里塞任意文本
    if (f.type === 'select' && v && !f.options.includes(v)) {
      throw new HttpError(400, '「' + f.label + '」只能从预设选项中选择');
    }
    if (v) values[f.key] = v;
  }
  const remark = sField(b.remark, 300);
  // 同一账号重复提交即覆盖自己那条：名单内按槽位，名单外按学号。
  // 学号兜底：以前先以名单外身份接过、后来名单补上其学号时，旧 outside 条目匹配不上，
  // 会被当成新人再插一条——同一人双记录，count/CSV 全部双计
  let exist = a.entries.find((e) => (rid != null ? (!e.outside && e.rid === rid) : (!!e.outside && String(e.id || '') === String(me.sid))));
  if (!exist && rid != null) {
    const old = a.entries.find((e) => !!e.outside && String(e.id || '') === String(id));
    if (old) exist = old;
  }
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
  const filled = a.fields.map((f) => (values[f.key] ? auditBrief(f.label, 12) + '「' + auditBrief(values[f.key], 24) + '」' : '')).filter(Boolean).join('、');
  audit(ctx, updated ? '修改接龙填写' : '填写接龙', (ctx.auditSubject || '') + ' ' + auditBrief(name, 20) + '（' + id + '）'
    + (filled ? ' 填：' + filled : ' 只留了姓名') + (remark ? ' 备注「' + auditBrief(remark, 24) + '」' : '') + (outside ? ' 名单外' : ''));
  const p = JL.progressOf(a);
  return { ok: true, updated, count: a.entries.length, position: a.entries.length, done: p.done, total: p.total, entry: { rid, id, name } };
});

// 管理：编辑（标题/说明/截止/名单/开关）；名单变更后已接记录自动重新匹配
route('PUT', '/api/jielong/:id', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jlCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const b = ctx.body || {};
  const before = { title: a.title, description: a.description, deadline: a.deadline, roster: a.roster.length };
  if (b.title !== undefined) {
    const t = sField(b.title, 60);
    if (!t) throw new HttpError(400, '标题不能为空');
    a.title = t;
  }
  if (b.description !== undefined) a.description = sField(b.description, 1000);
  if (b.deadline !== undefined) a.deadline = cleanDT(b.deadline) || '';
  if (b.allowOutside !== undefined) a.allowOutside = !!b.allowOutside;
  if (b.rosterRaw !== undefined) {
    rejectRosterRewrite(ctx);
    const newRoster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
    if (newRoster.length > 500) throw new HttpError(400, '名单最多 500 人');
    a.roster = newRoster;
    if (newRoster.length) JL.rematchEntries(a, newRoster); // 无名单接龙编辑时保持记录不变
  }
  // 元数据 UPDATE 与 entries 重写在同一事务内：名单变更后 rematch + 重写 entries，
  // 任何一步失败（如磁盘满）都整体回滚，避免元数据已改但记录未同步的半截状态
  transact(() => {
    db.prepare(`UPDATE jielongs SET title = ?, description = ?, deadline = ?, roster = ?, allow_outside = ? WHERE id = ?`)
      .run(a.title, a.description, a.deadline, JSON.stringify(a.roster), a.allowOutside ? 1 : 0, a.id);
    saveJielongEntries(a);
  });
  const ch = [];
  if (before.title !== a.title) ch.push('标题');
  if (before.description !== a.description) ch.push('说明');
  if (before.deadline !== a.deadline) ch.push('截止时间→' + (a.deadline || '不限'));
  if (before.roster !== a.roster.length) ch.push('名单（' + before.roster + '→' + a.roster.length + ' 人）');
  if (b.allowOutside !== undefined) ch.push('名单外参与' + (a.allowOutside ? '放开' : '关闭'));
  audit(ctx, '编辑接龙', '《' + auditBrief(a.title, 40) + '》' + (ch.length ? ' 改了' + ch.join('、') : ' 提交后无变化')
    + ' 已接 ' + a.entries.length + ' 人');
  return jielongViewFor(ctx, a);
});

// 管理：停止 / 重新开启
route('POST', '/api/jielong/:id/close', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jlCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  a.closed = !!(ctx.body || {}).closed;
  db.prepare('UPDATE jielongs SET closed = ? WHERE id = ?').run(a.closed ? 1 : 0, a.id);
  audit(ctx, a.closed ? '结束接龙' : '重新开放接龙', ctx.auditSubject + ' 已接 ' + a.entries.length + ' 人');
  return { ok: true, closed: a.closed };
});

// 管理：删除整个接龙（含全部记录，不可恢复）
route('DELETE', '/api/jielong/:id', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jlCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  transact(() => {   // 记录与主表同事务删，中途失败不会留下"接龙还在、记录空了"的空壳
    db.prepare('DELETE FROM jielong_entries WHERE jielong_id = ?').run(a.id);
    db.prepare('DELETE FROM jielongs WHERE id = ?').run(a.id);
  });
  audit(ctx, '删除接龙', ctx.auditSubject + ' 连带 ' + a.entries.length + ' 条填写记录');
  return { ok: true };
});

// 管理：删除某条接龙记录（优先按名单槽位 rid 定位，名单外记录按姓名）
route('DELETE', '/api/jielong/:id/entry', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jlCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const ridQ = ctx.query.get('rid');
  const rid = ridQ !== null && ridQ !== '' ? Number(ridQ) : null;
  let i = -1;
  if (rid != null && !isNaN(rid)) {
    i = a.entries.findIndex((e) => !e.outside && e.rid === rid);
  } else {
    const nm = String(ctx.query.get('name') || '');
    i = a.entries.findIndex((e) => e.name === nm);
  }
  let gone = null;
  if (i >= 0) {
    gone = a.entries[i];
    a.entries.splice(i, 1);
    saveJielongEntries(a);
  }
  audit(ctx, '删除接龙填写', ctx.auditSubject
    + (gone ? ' 删掉 ' + auditBrief(gone.name, 20) + (gone.outside ? '（名单外）' : '（槽位 ' + gone.rid + '）') : ' 按参数没找到对应记录'));
  return { ok: true };
});

// 管理：导出 CSV（带 BOM，Excel 直接打开不乱码）
route('GET', '/api/jielong/:id/export', (ctx) => {
  const a = getJielong(ctx.params.id);
  if (!a) throw new HttpError(404, '接龙不存在');
  if (!jlCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  // 导出给班委时同样不带学号（与页面下发同一口径），其余列不变
  const body = JL.buildCsv(a, jielongAdminOk(ctx));
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="jielong.csv"; filename*=UTF-8''${encodeURIComponent(a.title + '-接龙统计.csv')}`,
  });
  res.end(body);
});


/* ---------- 班级名单库（名单存一份，创建接龙 / 签箱时直接选用） ---------- */
route('GET', '/api/rosters', (ctx) => {
  // 名单全文（学号姓名）只归系统管理员；班委发起接龙 / 投票 / 问卷需要用到名单，
  // 返回名称与人数的元数据供选用——选用后由服务器按 id 读取名单，学号内容不经过班委
  const role = roleOf(ctx.req);
  if (role !== 'admin' && role !== 'officer') throw new HttpError(401, '需要管理员或班委登录');
  const metaOnly = role === 'officer';
  return {
  items: db.prepare('SELECT * FROM rosters ORDER BY updated_at DESC, id DESC').all().map((r) => {
    const keepId = !!r.keep_id;
    const count = JL.parseRoster(r.roster, keepId).list.length;
    if (metaOnly) return { id: r.id, name: r.name, count, updated_at: r.updated_at };
    return {
      id: r.id, name: r.name, roster: r.roster, keepId,
      count, updated_at: r.updated_at,
    };
  }),
  };
});

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
  const exist = db.prepare('SELECT id, roster, keep_id FROM rosters WHERE name = ?').get(name);
  if (exist) {
    db.prepare('UPDATE rosters SET roster = ?, keep_id = ?, updated_at = ? WHERE id = ?')
      .run(rosterRaw, keepId ? 1 : 0, nowStr(), exist.id);
    audit(ctx, '保存名单（覆盖同名）', '「' + auditBrief(name, 30) + '」' + list.length + ' 人'
      + (keepId ? '（含学号）' : '') + '，覆盖掉原来 ' + JL.parseRoster(exist.roster, !!exist.keep_id).list.length + ' 人（id ' + exist.id + '）');
    return { ok: true, id: exist.id, updated: true };
  }
  const info = db.prepare('INSERT INTO rosters (name, roster, keep_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, rosterRaw, keepId ? 1 : 0, nowStr(), nowStr());
  audit(ctx, '新建名单', '「' + auditBrief(name, 30) + '」' + list.length + ' 人'
    + (keepId ? '（含学号）' : '') + '（id ' + info.lastInsertRowid + '）');
  return { ok: true, id: Number(info.lastInsertRowid), updated: false };
});

// 编辑名单：改名 / 改内容 / 改是否保留学号（名单库视图调用）
route('PUT', '/api/rosters/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const old = db.prepare('SELECT name, roster, keep_id FROM rosters WHERE id = ?').get(id);
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
  const oldCount = JL.parseRoster(old.roster, !!old.keep_id).list.length;
  const ch = [];
  if (name !== old.name) ch.push('改名→' + auditBrief(name, 30));
  if (oldCount !== list.length) ch.push('人数 ' + oldCount + '→' + list.length);
  if (!!old.keep_id !== keepId) ch.push(keepId ? '改为保留学号' : '改为不保留学号');
  audit(ctx, '编辑名单', '「' + auditBrief(name, 30) + '」' + list.length + ' 人'
    + (ch.length ? '（改了' + ch.join('、') + '）' : '（提交后无变化）') + '（id ' + id + '）');
  return { ok: true, id };
});

route('DELETE', '/api/rosters/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const name = db.prepare('SELECT name FROM rosters WHERE id = ?').get(id);
  const info = db.prepare('DELETE FROM rosters WHERE id = ?').run(id);
  if (!info.changes) throw new HttpError(404, '名单不存在');
  audit(ctx, '删除名单', ctx.auditSubject || (name ? '「' + name.name + '」' : 'id=' + id));
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
function drawMask(list) {
  return (list || []).map((r) => (r && typeof r === 'object' ? { name: r.name } : r));
}
function drawView(d, withIds) {
  const remaining = drawRemaining(d);
  // 学号 = 登录名，初始密码 = 学号后 6 位，所以整班学号外泄等于把账号接管链摆上桌。
  // 与接龙、投票同一口径：名单里的人名给全体看，学号只有系统管理员能拿（班委能抽签，也看不到学号）
  const names = (list) => withIds ? list : drawMask(list);
  return {
    id: d.id, title: d.title, perDraw: d.perDraw, createdAt: d.createdAt,
    roster: names(d.roster), total: d.roster.length, remainingCount: remaining.length, remaining: names(remaining),
    rounds: (d.rounds || []).map((r) => ({ ...r, picked: names(r.picked) })), roundCount: d.rounds.length,
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
  // 名单两种来源：引用已有班级名单（rosterId）或直接粘贴文本，与接龙 / 投票同口径
  let roster;
  if (b.rosterId != null && b.rosterId !== '') {
    const r = db.prepare('SELECT * FROM rosters WHERE id = ?').get(Number(b.rosterId));
    if (!r) throw new HttpError(400, '所选名单不存在，请重新选择');
    roster = JL.parseRoster(r.roster, !!r.keep_id).list;
  } else {
    roster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
  }
  if (!roster.length) throw new HttpError(400, '请粘贴名单，至少 1 人');
  if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
  const id = JL.genId(7);
  const perDraw = Math.max(1, Math.min(Number(b.perDraw) || 1, roster.length));
  db.prepare('INSERT INTO draws (id, title, roster, per_draw, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, JSON.stringify(roster), perDraw, Date.now());
  audit(ctx, '新建抽签', '《' + auditBrief(title, 40) + '》 ' + roster.length + ' 人，每次抽 ' + perDraw + ' 人（id ' + id + '）');
  return { ok: true, id };
});

route('GET', '/api/draw/:id', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  return drawView(d, authOk(ctx.req));
});

route('POST', '/api/draw/:id/go', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  const b = ctx.body || {};
  let n = Math.max(1, Math.min(Number(b.count) || d.perDraw, 200));
  let remaining = drawRemaining(d);
  let reset = false;
  if (!remaining.length) {
    // 箱内已抽空：清空历史、开始新一轮。删除留到下面与本轮记录同事务提交，
    // 否则中途失败会把整轮历史抹光而新一轮没建成
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
  transact(() => {
    if (reset) db.prepare('DELETE FROM draw_rounds WHERE draw_id = ?').run(d.id);
    db.prepare('INSERT INTO draw_rounds (draw_id, picked, count, time) VALUES (?, ?, ?, ?)')
      .run(d.id, JSON.stringify(picked), n, Date.now());
  });
  d.rounds.push({ picked, count: n, time: Date.now() });
  const left = drawRemaining(d).length;
  const who = picked.map((p) => auditBrief(p && p.name != null ? p.name : p, 20) + (p && p.id ? '（' + p.id + '）' : '')).join('、');
  audit(ctx, '抽签点名', ctx.auditSubject + ' 第 ' + d.rounds.length + ' 轮抽中 ' + auditBrief(who, 150)
    + '，剩 ' + left + '/' + d.roster.length + ' 人' + (reset ? '（箱内抽空，自动开新一轮）' : ''));
  return { ok: true, picked: authOk(ctx.req) ? picked : drawMask(picked), count: n, remainingCount: left, total: d.roster.length, reset };
});

route('POST', '/api/draw/:id/undo', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  const last = db.prepare('SELECT * FROM draw_rounds WHERE draw_id = ? ORDER BY id DESC LIMIT 1').get(d.id);
  if (!last) throw new HttpError(400, '还没有抽过，没有可撤销的轮次');
  db.prepare('DELETE FROM draw_rounds WHERE id = ?').run(last.id);
  const restored = JL.safeJson(last.picked, []);
  const back = restored.map((p) => auditBrief(p && p.name != null ? p.name : p, 20)).join('、');
  audit(ctx, '撤销抽签', ctx.auditSubject + ' 放回 ' + auditBrief(back, 150) + '（共 ' + restored.length + ' 人）');
  // 从库中重读再算剩余，避免用过期的内存状态
  const fresh = drawFromRow(db.prepare('SELECT * FROM draws WHERE id = ?').get(d.id));
  return { ok: true, restored: authOk(ctx.req) ? restored : drawMask(restored), remainingCount: drawRemaining(fresh).length };
});

route('POST', '/api/draw/:id/reset', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  const n = d.rounds.length;
  db.prepare('DELETE FROM draw_rounds WHERE draw_id = ?').run(d.id);
  audit(ctx, '重置签箱', ctx.auditSubject + ' 清掉 ' + n + ' 轮历史，' + d.roster.length + ' 人全部回到箱内');
  return { ok: true, remainingCount: d.roster.length };
});

// 编辑（标题 / 名单 / 默认每次抽几人）；名单变更后按"学号+姓名"重新判断谁已抽过。
// 班委也能编辑，但只能改标题与每次抽几人——名单整份替换会让脱敏视图里的姓名覆盖掉学号。
route('PUT', '/api/draw/:id', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  const b = ctx.body || {};
  let roster = d.roster;
  if (b.rosterRaw !== undefined) {
    rejectRosterRewrite(ctx);
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
  return drawView(d, authOk(ctx.req));   // 按角色脱敏：班委拿不到学号，管理员编辑后要带学号回去，别让保存把学号洗掉
});

route('DELETE', '/api/draw/:id', (ctx) => {
  const d = getDraw(ctx.params.id);
  if (!d) throw new HttpError(404, '抽签不存在');
  // 轮次与签箱同事务删除（与接龙/投票同口径），第二条失败不会留下空壳签箱
  transact(() => {
    db.prepare('DELETE FROM draw_rounds WHERE draw_id = ?').run(d.id);
    db.prepare('DELETE FROM draws WHERE id = ?').run(d.id);
  });
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
  if (!!v.closed) return true;
  const d = JL.deadlineDate(v.deadline); // 纯日期按当天 23:59，与接龙口径一致
  return !!(d && Date.now() > d.getTime());
}
// 投票的两套权限必须分开：
// voteCanManage（仅系统管理员）管"看得到谁的选票、整班名单与学号、结果未到可见时机也能看票数、
// 允许关闭改票时仍能覆盖他人选票"——匿名投票的明细只归系统管理员。
// voteCanEdit（管理员或班委）管"能不能改这张投票"：编辑 / 停止 / 删除，班委与管理员同权、不区分发起人。
function voteCanManage(ctx) { return authOk(ctx.req); }
function voteCanEdit(ctx) { return canPostOk(ctx.req); }
function voteTally(v, rows) {
  return safeJson(v.options, []).map((o) => ({
    key: o.key, label: o.label,
    votes: rows.filter((b) => safeJson(b.choices, []).includes(o.key)).length,
  }));
}
// 名单必须每人带学号：选票身份靠"账号学号 → 名单槽位"定位，缺学号的人根本投不了票，
// 等于往班群发一张死票——所以拦在发起 / 追加名单这一步，而不是等学生撞错误
function missingSidHint(list) {
  const missing = list.filter((r) => !r.id).map((r) => r.name);
  // 同学号两条只算一个槽位（findIndex 永远命中第一条），第二条永远匹配不上、
  // 催票名单里会变成一个消不掉的「未投/未接龙」幽灵，发起时就拦下
  const seen = new Set();
  const dup = [];
  for (const r of list) {
    if (!r.id) continue;
    if (seen.has(String(r.id))) dup.push(r.name + '(' + r.id + ')');
    else seen.add(String(r.id));
  }
  const parts = [];
  if (missing.length) parts.push(missing.length + ' 人缺学号：' + missing.slice(0, 5).join('、') + (missing.length > 5 ? ' 等' : '')
    + '（名单写成「2023001 张三」并勾选保留学号）');
  if (dup.length) parts.push('学号重复：' + dup.slice(0, 5).join('、') + (dup.length > 5 ? ' 等' : '') + '，请去掉重复行');
  return parts.join('；');
}
// 会话身份 → 名单槽位：学号对得上才算本人，姓名不参与匹配（姓名可重名）
function voteSlotOf(roster, sid) {
  if (!sid) return null;
  const i = roster.findIndex((r) => String(r.id || '') === String(sid));
  return i === -1 ? null : i;
}

// 结果可见时机的说法（发起与编辑投票的审计描述共用，页面口径一致）
const REVEAL_LABEL = { always: '随时可见', after_vote: '投过票后可见', after_close: '结束后可见' };

// 创建投票（管理员或班委发起）：资格名单必选且每人带学号——选票身份按学号定位
route('POST', '/api/vote', (ctx) => {
  if (!canPostOk(ctx.req)) throw new HttpError(401, '需要管理员或班委登录');
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
  const miss = missingSidHint(roster);
  if (miss) throw new HttpError(400, '投票名单要按学号确认投票人，但' + miss);
  const lines = String(b.optionsRaw || '').split(/[\n\r]+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) throw new HttpError(400, '请至少填写 2 个选项（每行一个候选人或选项）');
  if (lines.length > 50) throw new HttpError(400, '选项最多 50 个');
  const options = lines.map((label, i) => ({ key: 'o' + i, label: sField(label, 60) }));
  const maxSelect = Math.max(1, Math.min(Number(b.maxSelect) || 1, options.length));
  const REVEALS = ['always', 'after_vote', 'after_close'];
  const reveal = REVEALS.includes(b.reveal) ? b.reveal : 'always';
  const allowChange = b.allowChange === false ? 0 : 1;
  const vid = JL.genId(7);
  db.prepare(`INSERT INTO votes (id, title, description, deadline, closed, anonymous, roster, options, max_select, reveal, allow_change, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`)
    .run(vid, title, sField(b.description, 1000), cleanDT(b.deadline) || '',
      b.anonymous === false ? 0 : 1,
      JSON.stringify(roster), JSON.stringify(options), maxSelect, reveal, allowChange, Date.now());
  audit(ctx, '发起投票', '《' + auditBrief(title, 40) + '》 ' + roster.length + ' 人可投，选项 ' + options.length + ' 个「'
    + auditBrief(options.map((o) => o.label).join(' / '), 90) + '」，限选 ' + maxSelect + ' 项，'
    + (b.anonymous === false ? '实名' : '匿名') + '，结果'
    + REVEAL_LABEL[reveal]
    + (allowChange ? '，允许改票' : '，不允许改票')
    + (cleanDT(b.deadline) ? '，截止 ' + cleanDT(b.deadline) : '') + '（id ' + vid + '）');
  return { ok: true, id: vid };
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
  const canManage = voteCanManage(ctx);
  // 匿名投票的选票明细（谁投给了谁）只有系统管理员能看，班委也只有催票视角；非匿名对全班公开
  const showBallots = canManage || !v.anonymous;
  const closed = voteIsClosed(v);
  const reveal = v.reveal || 'always';
  // 结果可见时机：always 一直可见；after_close 截止后可见；after_vote 投过票后可见。
  // "投没投"按会话账号对应的名单槽位判定，客户端伪造不了。
  const myRid = canManage ? null : voteSlotOf(roster, (sessionOf(ctx.req) || {}).sid);
  const mine = myRid == null ? null : rows.find((b) => b.rid === myRid) || null;
  const showTally = canManage || closed || reveal === 'always' || (reveal === 'after_vote' && !!mine);
  const base = {
    id: v.id, title: v.title, description: v.description, deadline: v.deadline,
    closed, closedByAdmin: !!v.closed, anonymous: !!v.anonymous,
    reveal, allowChange: v.allow_change !== 0,
    options, maxSelect: v.max_select, rosterSize: roster.length, done: rows.length,
    tallyHidden: !showTally,
    // 本人是否已投、投了什么：改票锁定与表单回填都靠它，不再依赖浏览器 localStorage 记号
    voted: !!mine, myVote: mine ? { choices: safeJson(mine.choices, []), time: mine.time } : null,
    inList: canManage || myRid != null,
  };
  if (showTally) base.tally = voteTally(v, rows);
  const nag = canPostOk(ctx.req);   // 班委及以上：可以催票，但看不到谁投给谁
  if (canManage) {
    // 管理员：整班资格名单 + 未投名单（带学号，重名能区分）
    base.roster = roster;
    base.missing = roster
      .map((r, i) => ({ i, id: r.id, name: r.name }))
      .filter((r) => !rows.some((b) => b.rid === r.i));
  } else if (nag) {
    // 班委的催票视角：只有"谁还没投"的姓名。投给谁、整班名单与学号都不下发——
    // 未投名单推不出任何人的选择，催票够用；学号仍只留在 /api/rosters（管理员）那一处
    base.missing = roster
      .map((r, i) => ({ name: r.name, voted: rows.some((b) => b.rid === i) }))
      .filter((r) => !r.voted)
      .map((r) => ({ name: r.name }));
  }
  if (showBallots && showTally) {
    base.ballots = rows.map((b) => ({
      rid: b.rid, name: b.name, time: b.time,
      ...(canManage ? { sid: b.sid } : {}),
      choices: safeJson(b.choices, []).map((k) => (options.find((o) => o.key === k) || {}).label || k),
    }));
  }
  return base;
});

// 投票：身份取登录账号（学号 → 名单槽位），一人一票由账号唯一性保证；重投=改票（除非发起人关掉开关）
route('POST', '/api/vote/:id/ballot', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (voteIsClosed(v)) throw new HttpError(400, '投票已结束，不能再提交');
  const roster = safeJson(v.roster, []);
  const options = safeJson(v.options, []);
  const b = ctx.body || {};
  const me = sessionOf(ctx.req) || {};
  if (!me.sid) throw new HttpError(400, '请用班级账号投票（管理员密码不参与投票）');
  const rid = voteSlotOf(roster, me.sid);
  if (rid == null) throw new HttpError(403, '你不在本次投票名单中，无法投票');
  // 选项清洗：去重、只认有效选项、不超过最多可选数；空选 = 弃权（计入已投，不计入票数）
  const chosen = [...new Set((Array.isArray(b.choices) ? b.choices : []).map(String))]
    .filter((k) => options.some((o) => o.key === k));
  if (chosen.length > v.max_select) throw new HttpError(400, `最多选择 ${v.max_select} 项`);
  const exist = db.prepare('SELECT id FROM vote_ballots WHERE vote_id = ? AND rid = ?').get(v.id, rid);
  const who = auditBrief(roster[rid].name || me.name || '', 20) + '（' + me.sid + '）';
  const picked = auditBrief(options.filter((o) => chosen.includes(o.key)).map((o) => o.label).join('、') || '弃权（没选任何项）', 120);
  if (exist) {
    // 关闭改票时，已投过的人再次提交直接拒绝（防"看到票数后改投热门"）；只有系统管理员能越过这个开关
    if (v.allow_change === 0 && !voteCanManage(ctx)) throw new HttpError(409, '本次投票不允许改票，你已投过票');
    db.prepare('UPDATE vote_ballots SET choices = ?, time = ? WHERE id = ?').run(JSON.stringify(chosen), Date.now(), exist.id);
    audit(ctx, '改投选票', ctx.auditSubject + ' ' + who + ' 改投：' + picked);
    return { ok: true, updated: true, rid };
  }
  db.prepare('INSERT INTO vote_ballots (vote_id, rid, sid, name, choices, time) VALUES (?, ?, ?, ?, ?, ?)')
    .run(v.id, rid, me.sid, roster[rid].name, JSON.stringify(chosen), Date.now());
  audit(ctx, '投出选票', ctx.auditSubject + ' ' + who + ' 投给：' + picked);
  return { ok: true, rid };
});

// 编辑投票：标题/说明/截止/结果可见时机/允许改票直接改；选项与名单只允许「追加」（只增不改，
// 保护已有选票指向的 option key 与名单槽位 rid 不错位）。字段显式传入才修改。
route('PUT', '/api/vote/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (!voteCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const b = ctx.body || {};
  const title = b.title !== undefined ? sField(b.title, 60) : v.title;
  if (!title) throw new HttpError(400, '标题不能为空');
  const description = b.description !== undefined ? sField(b.description, 1000) : v.description;
  const deadline = b.deadline !== undefined ? (cleanDT(b.deadline) || '') : (v.deadline || '');
  const REVEALS = ['always', 'after_vote', 'after_close'];
  const reveal = (b.reveal !== undefined && REVEALS.includes(b.reveal)) ? b.reveal : (v.reveal || 'always');
  const allowChange = b.allowChange !== undefined ? (b.allowChange === false ? 0 : 1) : v.allow_change;
  let options = safeJson(v.options, []);
  let roster = safeJson(v.roster, []);
  const optsBefore = options.length, rosterBefore = roster.length;
  if (b.optionsAppend !== undefined) {
    const lines = (Array.isArray(b.optionsAppend) ? b.optionsAppend : String(b.optionsAppend || '').split(/[\n\r]+/))
      .map((s) => String(s).trim()).filter(Boolean);
    if (lines.length) {
      if (options.length + lines.length > 50) throw new HttpError(400, '选项最多 50 个');
      let n = options.reduce((m, o) => { const x = /^o(\d+)$/.exec(o.key || ''); return x ? Math.max(m, +x[1]) : m; }, -1);
      const exist = new Set(options.map((o) => o.label));
      for (const label of lines) { const lb = sField(label, 60); if (!lb || exist.has(lb)) continue; options.push({ key: 'o' + (++n), label: lb }); }
    }
  }
  if (b.rosterAppendRaw !== undefined) {
    const add = JL.parseRoster(String(b.rosterAppendRaw || ''), b.rosterAppendKeepId === true).list;
    if (add.length) {
      // 名单靠学号定位投票人，追加进来的人没学号就永远投不了票
      const missAdd = missingSidHint(add);
      if (missAdd) throw new HttpError(400, '追加的成员要带学号（' + missAdd + '）');
      const seen = new Set(roster.map((r) => (r.id || '') + '|' + r.name));
      for (const r of add) { const k = (r.id || '') + '|' + r.name; if (seen.has(k)) continue; seen.add(k); roster.push(r); }
      if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
    }
  }
  db.prepare('UPDATE votes SET title = ?, description = ?, deadline = ?, reveal = ?, allow_change = ?, options = ?, roster = ? WHERE id = ?')
    .run(title, description, deadline, reveal, allowChange, JSON.stringify(options), JSON.stringify(roster), v.id);
  const ch = [];
  if (title !== v.title) ch.push('标题');
  if (description !== v.description) ch.push('说明');
  if (deadline !== (v.deadline || '')) ch.push('截止时间→' + (deadline || '不限'));
  if (reveal !== (v.reveal || 'always')) ch.push('结果' + REVEAL_LABEL[reveal]);
  if (allowChange !== v.allow_change) ch.push(allowChange ? '改为允许改票' : '改为不允许改票');
  if (options.length !== optsBefore) ch.push('追加选项 ' + (options.length - optsBefore) + ' 个');
  if (roster.length !== rosterBefore) ch.push('追加投票人 ' + (roster.length - rosterBefore) + ' 人');
  audit(ctx, '编辑投票', '《' + auditBrief(title, 40) + '》' + (ch.length ? ' 改了' + ch.join('、') : ' 提交后无变化')
    + '，现有 ' + db.prepare('SELECT COUNT(*) AS c FROM vote_ballots WHERE vote_id = ?').get(v.id).c + ' 张票');
  return { ok: true };
});

route('POST', '/api/vote/:id/stop', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (!voteCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  db.prepare('UPDATE votes SET closed = 1 WHERE id = ?').run(v.id);
  const got = safeJson(v.options, []).length;
  audit(ctx, '结束投票', '《' + auditBrief(v.title, 40) + '》 已收 '
    + db.prepare('SELECT COUNT(*) AS c FROM vote_ballots WHERE vote_id = ?').get(v.id).c + ' 张票'
    + (v.closed ? '（此前已被手动停止）' : '') + '，选项 ' + got + ' 个');
  return { ok: true };
});

route('DELETE', '/api/vote/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM votes WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '投票不存在');
  if (!voteCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const ballots = db.prepare('SELECT COUNT(*) AS c FROM vote_ballots WHERE vote_id = ?').get(v.id).c;
  db.exec('BEGIN'); // 选票与投票一起删，不残留孤儿选票
  try {
    db.prepare('DELETE FROM vote_ballots WHERE vote_id = ?').run(v.id);
    db.prepare('DELETE FROM votes WHERE id = ?').run(v.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  audit(ctx, '删除投票', '《' + auditBrief(v.title, 40) + '》 连带 ' + ballots + ' 张选票（不可恢复）');
  return { ok: true };
});

/* ==================== 问卷调查（多题组合，题型丰富） ==================== */
// 权限：班委可管理（创建/编辑/停止/删除），学生只读与提交
function surveyCanManage(ctx) { return canPostOk(ctx.req); }
function surveyCanEdit(ctx) { return canPostOk(ctx.req); }
// 到点自动截止，与投票同一口径：手动停止，或截止时间已过（纯日期按当天 23:59）
function surveyIsClosed(v) {
  if (!!v.closed) return true;
  const d = JL.deadlineDate(v.deadline);
  return !!(d && Date.now() > d.getTime());
}

// 创建问卷（管理员或班委发起）
route('POST', '/api/survey', (ctx) => {
  if (!surveyCanManage(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const b = ctx.body || {};
  const title = sField(b.title, 80);
  if (!title) throw new HttpError(400, '请填写问卷标题');
  // 解析名单
  let roster = [];
  if (b.rosterId != null && b.rosterId !== '') {
    const r = db.prepare('SELECT * FROM rosters WHERE id = ?').get(Number(b.rosterId));
    if (!r) throw new HttpError(400, '所选名单不存在，请重新选择');
    roster = JL.parseRoster(r.roster, !!r.keep_id).list;
  } else {
    roster = JL.parseRoster(String(b.rosterRaw || ''), b.keepId === true).list;
  }
  if (!roster.length) throw new HttpError(400, '请设置问卷对象（只有名单内的同学可以填写）');
  if (roster.length > 500) throw new HttpError(400, '名单最多 500 人');
  const miss = missingSidHint(roster);
  if (miss) throw new HttpError(400, '问卷名单要按学号确认填写人，但' + miss);
  // 解析问题列表
  const questions = Array.isArray(b.questions) ? b.questions : [];
  if (!questions.length) throw new HttpError(400, '请至少添加 1 个问题');
  if (questions.length > 50) throw new HttpError(400, '问题最多 50 个');
  // 解析分组（可选）
  const sections = Array.isArray(b.sections) ? b.sections : [];
  const sid = JL.genId(7);
  const anonymous = b.anonymous === true ? 1 : 0;
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO surveys (id, title, description, deadline, closed, roster, anonymous, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)`)
      .run(sid, title, sField(b.description, 1000), cleanDT(b.deadline) || '', JSON.stringify(roster), anonymous, Date.now());
    // 创建分组
    const sectionIds = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const sTitle = sField(s.title, 100);
      if (!sTitle) throw new HttpError(400, `分组 ${i + 1} 标题不能为空`);
      const result = db.prepare(`INSERT INTO survey_sections (survey_id, title, description, sort_order) VALUES (?, ?, ?, ?)`)
        .run(sid, sTitle, sField(s.description, 500), i);
      sectionIds.push(result.lastInsertRowid);
    }
    // 创建问题
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qtype = ['single', 'multiple', 'text', 'rating', 'number', 'date'].includes(q.qtype) ? q.qtype : 'single';
      const opts = ['single', 'multiple', 'rating'].includes(qtype) ? JSON.stringify((q.options || []).map((s) => sField(s, 60)).filter(Boolean)) : '[]';
      if (['single', 'multiple'].includes(qtype) && JSON.parse(opts).length < 2) throw new HttpError(400, `问题 ${i + 1} 至少需要 2 个选项`);
      if (qtype === 'rating' && JSON.parse(opts).length < 2) throw new HttpError(400, `问题 ${i + 1} 评分题至少需要 2 个评分等级`);
      // 确定问题所属分组
      let sectionId = null;
      if (q.sectionIndex != null && q.sectionIndex >= 0 && q.sectionIndex < sectionIds.length) {
        sectionId = sectionIds[q.sectionIndex];
      }
      db.prepare(`INSERT INTO survey_questions (survey_id, section_id, qtype, question, description, options, required, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(sid, sectionId, qtype, sField(q.question, 200), sField(q.description, 500), opts, q.required !== false ? 1 : 0, i);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  audit(ctx, '发起问卷', '《' + auditBrief(title, 40) + '》 ' + roster.length + ' 人可填，' + questions.length + ' 题（id ' + sid + '）' + (anonymous ? ' [匿名]' : '') + (sections.length ? '，' + sections.length + ' 个分组' : ''));
  return { ok: true, id: sid };
});

// 问卷列表
route('GET', '/api/survey', () => {
  const items = db.prepare('SELECT * FROM surveys ORDER BY created_at DESC').all().map((v) => {
    const rosterSize = safeJson(v.roster, []).length;
    const done = db.prepare('SELECT COUNT(*) AS c FROM survey_responses WHERE survey_id = ?').get(v.id).c;
    const qCount = db.prepare('SELECT COUNT(*) AS c FROM survey_questions WHERE survey_id = ?').get(v.id).c;
    return {
      id: v.id, title: v.title, description: v.description, deadline: v.deadline,
      closed: surveyIsClosed(v), qCount, rosterSize, done, anonymous: !!v.anonymous,
    };
  });
  return { items };
});

// 计算匿名问卷的 sid_hash（用于去重，不暴露真实学号）
function computeSidHash(surveyId, sid, salt) {
  return crypto.createHmac('sha256', salt).update(surveyId + ':' + sid).digest('hex');
}

// 问卷详情（含问题列表与统计）
route('GET', '/api/survey/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM surveys WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '问卷不存在');
  const roster = safeJson(v.roster, []);
  const sections = db.prepare('SELECT * FROM survey_sections WHERE survey_id = ? ORDER BY sort_order').all(v.id);
  const questions = db.prepare('SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order').all(v.id);
  const rows = db.prepare('SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY submitted_at').all(v.id);
  const canManage = surveyCanManage(ctx);
  const closed = surveyIsClosed(v);
  const sess = sessionOf(ctx.req);
  const mySid = sess ? sess.sid : '';
  // 匿名问卷用 sid_hash 识别本人，非匿名用 sid
  let mine = null;
  if (v.anonymous && v.dedup_salt && mySid) {
    const myHash = computeSidHash(v.id, mySid, v.dedup_salt);
    mine = rows.find((r) => r.sid_hash === myHash) || null;
  } else if (!v.anonymous) {
    mine = rows.find((r) => r.sid === mySid) || null;
  }
  // 结果查看权限：管理员看全部明细（带学号），班委看统计汇总（脱敏），学生只看自己的
  const showDetails = canManage && isSysAdmin(ctx);
  const showSummary = canManage && !isSysAdmin(ctx);
  // 构造返回
  const base = {
    id: v.id, title: v.title, description: v.description, deadline: v.deadline,
    closed, rosterSize: roster.length, done: rows.length, anonymous: !!v.anonymous,
    sections: sections.map((s) => ({ id: s.id, title: s.title, description: s.description || '' })),
    questions: questions.map((q) => ({
      id: q.id, section_id: q.section_id, qtype: q.qtype, question: q.question, description: q.description || '',
      options: ['single', 'multiple', 'rating'].includes(q.qtype) ? safeJson(q.options, []) : [],
      required: !!q.required,
    })),
    filled: !!mine, myAnswers: mine ? safeJson(mine.answers, {}) : null,
  };
  if (showDetails) {
    // 管理员：返回全部明细，带学号。匿名问卷落库不存身份，但 dedup_salt 与名单都在手里，
    // 用名单重算 sid_hash 反查填写人——匿名是对同学之间而言，管理员要能对上人
    let hashMap = null;
    if (v.anonymous && v.dedup_salt) {
      hashMap = new Map();
      roster.forEach((m) => {
        const msid = String(m.id || '');
        if (msid) hashMap.set(computeSidHash(v.id, msid, v.dedup_salt), m);
      });
    }
    base.responses = rows.map((r) => {
      const matched = hashMap && r.sid_hash ? hashMap.get(r.sid_hash) : null;
      return {
        sid: r.sid || (matched ? String(matched.id || '') : ''),
        name: r.name || (matched ? String(matched.name || '') : ''),
        answers: safeJson(r.answers, {}), submitted_at: r.submitted_at,
      };
    });
  } else if (showSummary) {
    // 班委：返回统计汇总（每题各选项计数），不含个人明细
    const stats = {};
    questions.forEach((q) => {
      if (q.qtype === 'text') {
        // 文本题：收集所有回答
        stats[q.id] = rows.map((r) => safeJson(r.answers, {})[String(q.id)] || '').filter(Boolean);
      } else if (q.qtype === 'number' || q.qtype === 'date') {
        // 数字/日期题：收集所有回答值
        stats[q.id] = rows.map((r) => safeJson(r.answers, {})[String(q.id)] || '').filter(Boolean);
      } else if (q.qtype === 'rating') {
        // 评分题：统计各评分计数
        const counts = {};
        safeJson(q.options, []).forEach((opt) => { counts[opt] = 0; });
        rows.forEach((r) => {
          const ans = safeJson(r.answers, {})[String(q.id)];
          if (ans && counts[ans] !== undefined) counts[ans]++;
        });
        stats[q.id] = counts;
      } else {
        // 单选/多选题：统计各选项计数
        const counts = {};
        safeJson(q.options, []).forEach((opt) => { counts[opt] = 0; });
        rows.forEach((r) => {
          const ans = safeJson(r.answers, {})[String(q.id)];
          if (Array.isArray(ans)) {
            ans.forEach((a) => { if (counts[a] !== undefined) counts[a]++; });
          } else if (ans && counts[ans] !== undefined) {
            counts[ans]++;
          }
        });
        stats[q.id] = counts;
      }
    });
    base.stats = stats;
  }
  return base;
});

// 提交问卷（学生填写）
route('POST', '/api/survey/:id/submit', (ctx) => {
  const v = db.prepare('SELECT * FROM surveys WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '问卷不存在');
  if (surveyIsClosed(v)) throw new HttpError(400, '问卷已截止，无法提交');
  const roster = safeJson(v.roster, []);
  const sess = sessionOf(ctx.req);
  if (!sess) throw new HttpError(401, '需要登录后填写');
  // 检查是否在名单内
  const slot = roster.findIndex((r) => String(r.id || '') === sess.sid);
  if (slot < 0) throw new HttpError(403, '你不在本次问卷的填写名单中');
  
  // 匿名问卷：生成 dedup_salt（首次提交时）并用 sid_hash 去重
  let dedupSalt = v.dedup_salt;
  if (v.anonymous && !dedupSalt) {
    dedupSalt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE surveys SET dedup_salt = ? WHERE id = ?').run(dedupSalt, v.id);
  }
  
  // 检查是否已提交：匿名用 sid_hash，非匿名用 sid。
  // 匿名中途转记名的衔接：转记名后，早先匿名期提交的行只有 sid_hash 没有 sid——
  // 按 sid 查不到会导致同一人出现第二条记录，所以这里补一道 sid_hash 兜底匹配；
  // 命中后在下方更新时把身份回填到原行上
  let existing = null;
  if (v.anonymous && dedupSalt) {
    const sidHash = computeSidHash(v.id, sess.sid, dedupSalt);
    existing = db.prepare('SELECT id FROM survey_responses WHERE survey_id = ? AND sid_hash = ?').get(v.id, sidHash);
  } else if (!v.anonymous) {
    existing = db.prepare('SELECT id FROM survey_responses WHERE survey_id = ? AND sid = ?').get(v.id, sess.sid);
    if (!existing && dedupSalt) {
      const sidHash = computeSidHash(v.id, sess.sid, dedupSalt);
      existing = db.prepare('SELECT id FROM survey_responses WHERE survey_id = ? AND sid_hash = ?').get(v.id, sidHash);
    }
  }
  
  const b = ctx.body || {};
  let answers = b.answers || {};
  const questions = db.prepare('SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order').all(v.id);
  // 提交格式识别：内置页面都按题目 id 提交；只有「所有键都是 1..n 的位置号且不与任何
  // 题目 id 重合」才按位置键整卷解读——逐键迁移的话，题目 id 恰为别题位置号时会抢答案
  const idSet = new Set(questions.map((q) => String(q.id)));
  const keys = Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== null);
  const looksPos = keys.length > 0 && questions.length > 0
    && keys.every((k) => /^[1-9]\d*$/.test(k) && +k >= 1 && +k <= questions.length && !idSet.has(k));
  if (looksPos) {
    const mapped = {};
    questions.forEach((q, i) => { if (answers[String(i + 1)] !== undefined) mapped[String(q.id)] = answers[String(i + 1)]; });
    answers = mapped;
  }
  // 入库前的答案卫生：只保留本卷题目的键；选择题/评分只认预设选项，数字题必须是数字，
  // 文本截长——绕过前端塞进来的任意键与超长值会污染统计与 CSV 导出
  const clean = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const ans = answers[String(q.id)];
    if (ans === undefined || ans === null) continue;
    if (['single', 'multiple', 'rating'].includes(q.qtype)) {
      const opts = safeJson(q.options, []);
      const vals = (Array.isArray(ans) ? ans : [ans]).map((x) => String(x).slice(0, 60)).filter((x) => opts.includes(x));
      if (vals.length) clean[String(q.id)] = q.qtype === 'multiple' ? vals : vals[0];
    } else if (q.qtype === 'number') {
      const s = String(ans).trim().slice(0, 32);
      if (s !== '') {
        if (!/^-?\d+(\.\d+)?$/.test(s)) throw new HttpError(400, `问题"${q.question}"必须为数字`);
        clean[String(q.id)] = s;
      }
    } else {
      // text / date
      const s = String(ans).slice(0, 5000);
      if (s.trim()) clean[String(q.id)] = s;
    }
  }
  answers = clean;
  // 必填校验放在卫生化之后：校验口径与最终入库的值一致
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.required) continue;
    const ans = answers[String(q.id)];
    if (['single', 'multiple'].includes(q.qtype)) {
      if (!ans || (Array.isArray(ans) && !ans.length)) throw new HttpError(400, `问题"${q.question}"为必填`);
    } else {
      // text, rating, number, date
      if (!ans || !String(ans).trim()) throw new HttpError(400, `问题"${q.question}"为必填`);
    }
  }
  
  if (existing) {
    // 已提交过，更新答案。转记名后命中匿名期旧行时，顺带把学号姓名回填到原记录
    // （仍匿名的问卷传空串等于不改动这两列）
    db.prepare(`UPDATE survey_responses SET answers = ?, submitted_at = ?, sid = ?, name = ? WHERE id = ?`)
      .run(JSON.stringify(answers), Date.now(), v.anonymous ? '' : sess.sid, v.anonymous ? '' : sess.name, existing.id);
    audit(ctx, '修改问卷', '《' + auditBrief(v.title, 40) + '》' + (v.anonymous ? ' [匿名]' : ' by ' + sess.name + '（' + sess.sid + '）'));
  } else {
    // 首次提交
    const storeSid = v.anonymous ? '' : sess.sid;
    const storeName = v.anonymous ? '' : (sess.name || '');
    const sidHash = v.anonymous && dedupSalt ? computeSidHash(v.id, sess.sid, dedupSalt) : '';
    db.prepare(`INSERT INTO survey_responses (survey_id, sid, name, answers, submitted_at, sid_hash)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .run(v.id, storeSid, storeName, JSON.stringify(answers), Date.now(), sidHash);
    audit(ctx, '提交问卷', '《' + auditBrief(v.title, 40) + '》' + (v.anonymous ? ' [匿名]' : ' by ' + sess.name + '（' + sess.sid + '）'));
  }
  return { ok: true, updated: !!existing };
});

// 停止问卷
route('POST', '/api/survey/:id/stop', (ctx) => {
  const v = db.prepare('SELECT * FROM surveys WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '问卷不存在');
  if (!surveyCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  if (!!v.closed) throw new HttpError(400, '问卷已停止');
  db.prepare('UPDATE surveys SET closed = 1 WHERE id = ?').run(v.id);
  audit(ctx, '停止问卷', '《' + auditBrief(v.title, 40) + '》');
  return { ok: true };
});

// 编辑问卷。规则分两层：
// · 标题/说明/截止时间随时可改——截止到点的问卷顺延截止时间后自动重新开放收集（surveyIsClosed
//   按当前 deadline 现算，改完即生效），这是「问卷收着收着想延期」的正常诉求；
// · 题目/分组涉及已存答案的归属（answers 按题目 id 存键、选项做白名单），有人提交后就锁定，
//   只有 0 份提交时才能整卷重排；手动「停止」的问卷（closed=1）保持不可编辑
route('PUT', '/api/survey/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM surveys WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '问卷不存在');
  if (!surveyCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  if (!!v.closed) throw new HttpError(400, '问卷已停止，无法编辑');
  const b = ctx.body || {};
  const wantQuestions = b.questions && Array.isArray(b.questions);
  const wantSections = b.sections && Array.isArray(b.sections);
  if (wantQuestions || wantSections) {
    const respCount = db.prepare('SELECT COUNT(*) AS c FROM survey_responses WHERE survey_id = ?').get(v.id).c;
    if (respCount > 0) throw new HttpError(400, '已有 ' + respCount + ' 份提交，题目不能再修改；标题/说明/截止时间仍可调整');
  }
  if (b.title != null) {
    const title = sField(b.title, 80);
    if (!title) throw new HttpError(400, '标题不能为空');
    db.prepare('UPDATE surveys SET title = ? WHERE id = ?').run(title, v.id);
  }
  if (b.description !== undefined) db.prepare('UPDATE surveys SET description = ? WHERE id = ?').run(sField(b.description, 1000), v.id);
  if (b.deadline !== undefined) db.prepare('UPDATE surveys SET deadline = ? WHERE id = ?').run(cleanDT(b.deadline) || '', v.id);
  // 匿名/记名可中途切换，只影响之后的提交：匿名期已提交的行没有存身份，历史无法补出
  // （详情里显示「匿名提交」占位）；转记名后同学再提交时按 sid_hash 认出原行并回填身份
  if (b.anonymous !== undefined && (b.anonymous === true || b.anonymous === false) && (b.anonymous ? 1 : 0) !== v.anonymous) {
    db.prepare('UPDATE surveys SET anonymous = ? WHERE id = ?').run(b.anonymous ? 1 : 0, v.id);
    v.anonymous = b.anonymous ? 1 : 0;
    ctx.anonToggled = true;
  }
  // 问题与分组的重建放进同一个事务，且题目的分组归属按 b.sections 的下标重新挂回
  // （与发起时的 sectionIndex 契约一致）——原先分区替换不进事务，题目重建还会把
  // section_id 全部洗成 NULL，只剩题目时又指向已被删掉的旧分区
  if (wantQuestions || wantSections) {
    if (wantQuestions) {
      // 与发起时同一套校验：题量上限与选择题/评分题的选项下限
      if (b.questions.length === 0) throw new HttpError(400, '请至少添加 1 个问题');
      if (b.questions.length > 50) throw new HttpError(400, '问题最多 50 个');
    }
    db.exec('BEGIN');
    try {
      let sectionIds = db.prepare('SELECT id FROM survey_sections WHERE survey_id = ? ORDER BY sort_order').all(v.id).map((r) => r.id);
      if (b.sections && Array.isArray(b.sections)) {
        db.prepare('DELETE FROM survey_sections WHERE survey_id = ?').run(v.id);
        sectionIds = [];
        for (let i = 0; i < b.sections.length; i++) {
          const s = b.sections[i];
          const info = db.prepare(`INSERT INTO survey_sections (survey_id, title, description, sort_order) VALUES (?, ?, ?, ?)`)
            .run(v.id, sField(s.title, 80), sField(s.description || '', 500), i);
          sectionIds.push(Number(info.lastInsertRowid));
        }
      }
      if (wantQuestions) {
        db.prepare('DELETE FROM survey_questions WHERE survey_id = ?').run(v.id);
        for (let i = 0; i < b.questions.length; i++) {
          const q = b.questions[i];
          const qtype = ['single', 'multiple', 'text', 'rating', 'number', 'date'].includes(q.qtype) ? q.qtype : 'single';
          const opts = ['single', 'multiple', 'rating'].includes(qtype) ? JSON.stringify((q.options || []).map((s) => sField(s, 60)).filter(Boolean)) : '[]';
          if (['single', 'multiple'].includes(qtype) && JSON.parse(opts).length < 2) throw new HttpError(400, `问题 ${i + 1} 至少需要 2 个选项`);
          if (qtype === 'rating' && JSON.parse(opts).length < 2) throw new HttpError(400, `问题 ${i + 1} 评分题至少需要 2 个评分等级`);
          const sectionId = (q.sectionIndex != null && q.sectionIndex >= 0 && q.sectionIndex < sectionIds.length) ? sectionIds[q.sectionIndex] : null;
          db.prepare(`INSERT INTO survey_questions (survey_id, section_id, qtype, question, description, options, required, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(v.id, sectionId, qtype, sField(q.question, 200), sField(q.description, 500), opts, q.required !== false ? 1 : 0, i);
        }
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  audit(ctx, '编辑问卷', '《' + auditBrief(v.title || b.title || '', 40) + '》'
    + (ctx.anonToggled ? (v.anonymous ? ' 改为匿名收集' : ' 改为记名收集（管理员可查提交人）') : ''));
  return { ok: true };
});

// 删除问卷
route('DELETE', '/api/survey/:id', (ctx) => {
  const v = db.prepare('SELECT * FROM surveys WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '问卷不存在');
  if (!surveyCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const respCount = db.prepare('SELECT COUNT(*) AS c FROM survey_responses WHERE survey_id = ?').get(v.id).c;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM survey_responses WHERE survey_id = ?').run(v.id);
    db.prepare('DELETE FROM survey_questions WHERE survey_id = ?').run(v.id);
    db.prepare('DELETE FROM survey_sections WHERE survey_id = ?').run(v.id);
    db.prepare('DELETE FROM surveys WHERE id = ?').run(v.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  audit(ctx, '删除问卷', '《' + auditBrief(v.title, 40) + '》 连带 ' + respCount + ' 份回答（不可恢复）');
  return { ok: true };
});

// 导出问卷结果为CSV
route('GET', '/api/survey/:id/export', (ctx) => {
  const v = db.prepare('SELECT * FROM surveys WHERE id = ?').get(ctx.params.id);
  if (!v) throw new HttpError(404, '问卷不存在');
  if (!surveyCanManage(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const questions = db.prepare('SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order').all(v.id);
  const rows = db.prepare('SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY submitted_at').all(v.id);
  const isSysAdmin = sessionOf(ctx.req) && sessionOf(ctx.req).role === 'admin';
  
  // 中和 Excel 公式注入：答案、姓名、题面都是人填的文本，以 = + - @ 开头时直接打开
  // 会被当公式执行（与班费/接龙/操作记录 CSV 同一口径；问卷列全是文本，统一处理无副作用）
  const escText = (val) => {
    const s = String(val == null ? '' : val);
    return '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"';
  };
  let csv = '\uFEFF'; // BOM for Excel UTF-8
  csv += '学号,姓名,提交时间,' + questions.map((q) => escText(q.question)).join(',') + '\n';

  // 数据行
  for (const r of rows) {
    const answers = safeJson(r.answers, {});
    // 匿名期收集的行没有身份：导出时写「匿名」占位，避免出现看似丢失的空格
    const sid = v.anonymous ? '匿名' : (isSysAdmin ? (r.sid || '匿名') : '');
    const name = v.anonymous ? '匿名' : (r.name || '匿名');
    const time = r.submitted_at ? new Date(r.submitted_at).toLocaleString('zh-CN') : '';
    const cells = questions.map((q) => {
      let ans = answers[String(q.id)];
      if (Array.isArray(ans)) ans = ans.join('、');
      else if (!ans) ans = '';
      return String(ans); // 只取原始值，转义/中和统一由行级 escText 做，避免二次转义
    });
    csv += [sid, name, time, ...cells].map(escText).join(',') + '\n';
  }
  
  const res = ctx.res;
  res.wrote = true;
  // 文件名走 RFC 5987 编码：头值里出现中文会 ERR_INVALID_CHAR，而此时 res.wrote 已置真，
  // dispatcher 会把这个异常静默吞掉，客户端就永远等不到响应
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="survey.csv"; filename*=UTF-8''${encodeURIComponent(v.title + '_问卷结果.csv')}`,
  });
  res.end(csv);
  audit(ctx, '导出问卷结果', '《' + auditBrief(v.title, 40) + '》 ' + rows.length + ' 份回答');
});

/* ---------- 问卷模板（管理员/班委可自定义，发起问卷时快速套用） ---------- */
route('GET', '/api/survey-template', () => {
  return db.prepare('SELECT * FROM survey_templates ORDER BY updated_at DESC, id DESC').all()
    .map((t) => ({ ...t, questions: safeJson(t.questions, []) }));
});

route('POST', '/api/survey-template', (ctx) => {
  if (!surveyCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const b = ctx.body || {};
  const name = sField(b.name, 40);
  if (!name) throw new HttpError(400, '模板名称不能为空');
  const title = sField(b.title || '', 60);
  const description = sField(b.description || '', 1000);
  const questions = Array.isArray(b.questions) ? b.questions : [];
  if (questions.length === 0) throw new HttpError(400, '模板至少需要一个问题');
  if (questions.length > 50) throw new HttpError(400, '模板最多 50 个问题');
  for (const q of questions) {
    if (!sField(q.question, 200)) throw new HttpError(400, '问题内容不能为空');
    if (!['single', 'multiple', 'rating', 'number', 'date', 'text'].includes(q.qtype)) throw new HttpError(400, '题型不合法');
    if (['single', 'multiple', 'rating'].includes(q.qtype)) {
      if (!Array.isArray(q.options) || q.options.length < 2) throw new HttpError(400, '选项至少 2 个');
    }
  }
  const now = Date.now();
  const info = db.prepare('INSERT INTO survey_templates (name, title, description, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, title, description, JSON.stringify(questions), now, now);
  audit(ctx, '新建问卷模板', '「' + auditBrief(name, 30) + '」' + questions.length + ' 个问题');
  return { ok: true, id: Number(info.lastInsertRowid) };
});

route('PUT', '/api/survey-template/:id', (ctx) => {
  if (!surveyCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '参数错误');
  const old = db.prepare('SELECT * FROM survey_templates WHERE id = ?').get(id);
  if (!old) throw new HttpError(404, '模板不存在');
  const b = ctx.body || {};
  const name = b.name !== undefined ? sField(b.name, 40) : old.name;
  if (!name) throw new HttpError(400, '模板名称不能为空');
  const title = b.title !== undefined ? sField(b.title, 60) : old.title;
  const description = b.description !== undefined ? sField(b.description, 1000) : old.description;
  let questions = old.questions;
  if (b.questions !== undefined) {
    if (!Array.isArray(b.questions)) throw new HttpError(400, 'questions 须为数组');
    if (b.questions.length === 0) throw new HttpError(400, '模板至少需要一个问题');
    if (b.questions.length > 50) throw new HttpError(400, '模板最多 50 个问题');
    for (const q of b.questions) {
      if (!sField(q.question, 200)) throw new HttpError(400, '问题内容不能为空');
      if (!['single', 'multiple', 'rating', 'number', 'date', 'text'].includes(q.qtype)) throw new HttpError(400, '题型不合法');
      if (['single', 'multiple', 'rating'].includes(q.qtype)) {
        if (!Array.isArray(q.options) || q.options.length < 2) throw new HttpError(400, '选项至少 2 个');
      }
    }
    questions = JSON.stringify(b.questions);
  }
  db.prepare('UPDATE survey_templates SET name = ?, title = ?, description = ?, questions = ?, updated_at = ? WHERE id = ?')
    .run(name, title, description, questions, Date.now(), id);
  audit(ctx, '编辑问卷模板', '「' + auditBrief(name, 30) + '」');
  return { ok: true };
});

route('DELETE', '/api/survey-template/:id', (ctx) => {
  if (!surveyCanEdit(ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '参数错误');
  const old = db.prepare('SELECT * FROM survey_templates WHERE id = ?').get(id);
  if (!old) throw new HttpError(404, '模板不存在');
  db.prepare('DELETE FROM survey_templates WHERE id = ?').run(id);
  audit(ctx, '删除问卷模板', '「' + auditBrief(old.name, 30) + '」');
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
  audit(ctx, '新添加生日', '「' + auditBrief(m.name, 20) + '」 ' + m.month + '月' + m.day + '日'
    + (m.year ? '（' + m.year + ' 年生）' : '（生日待补）') + (m.note ? ' 备注「' + auditBrief(m.note, 24) + '」' : '')
    + '（id ' + info.lastInsertRowid + '）');
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
  const ch = [];
  if (m.name !== old.name) ch.push('姓名→' + auditBrief(m.name, 20));
  if (Number(m.month) !== Number(old.month) || Number(m.day) !== Number(old.day)) ch.push('生日→' + m.month + '月' + m.day + '日');
  if (Number(m.year) !== Number(old.year)) ch.push('年份→' + (m.year || '未填'));
  if (m.note !== old.note) ch.push('备注→' + auditBrief(m.note, 24));
  audit(ctx, '修改生日', '「' + auditBrief(old.name, 20) + '」（id ' + id + '）' + (ch.length ? ' 改了' + ch.join('、') : ' 提交后无变化'));
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
  if (!roster) throw new HttpError(404, '名单不存在，请先在「账号名单」里保存一份班级名单');
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
  audit(ctx, '导入生日名单', '名单「' + auditBrief(roster.name, 30) + '」 ' + summary);
  log('生日成员' + summary);
  return { ok: true, created, skipped };
});

/* ---------- 班费收支（班级班费的收入 / 支出记账与结余公示） ----------
 * 浏览公开（与信息中心一致，班费本就讲透明公示）；记 / 改 / 删为管理操作，走常规门禁（需管理员登录）。
 * 金额以「分」存整数；结余 = 收入合计 − 支出合计，按当前筛选口径实时算，不入库。 */
route('GET', '/api/funds', (ctx) => {
  const { whereSql, args } = fundWhere(ctx.query);
  const limit = Math.min(Math.max(Number(ctx.query.get('limit')) || 200, 1), 500);
  const offset = Math.max(Number(ctx.query.get('offset')) || 0, 0);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM funds ${whereSql}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM funds ${whereSql} ORDER BY happened_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset);
  const sum = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
      FROM funds ${whereSql}`).get(...args);
  // 内联每条记录的凭证附件元数据（图片缩略图 / 文件名），一次批量查避免 N+1
  const attsBy = {};
  if (rows.length) {
    const ids = rows.map((x) => x.id);
    const ph = ids.map(() => '?').join(',');
    for (const a of db.prepare(`SELECT id, fund_id, orig_name, mime, size FROM fund_attachments WHERE fund_id IN (${ph}) ORDER BY id`).all(...ids)) {
      (attsBy[a.fund_id] ||= []).push({ id: a.id, orig_name: a.orig_name, mime: a.mime, size: a.size });
    }
  }
  return {
    total,
    items: rows.map((r) => ({ ...fundView(r), attachments: attsBy[r.id] || [] })),
    summary: { income: sum.income / 100, expense: sum.expense / 100, balance: (sum.income - sum.expense) / 100, count: total },
  };
});

route('POST', '/api/funds', (ctx) => {
  const b = ctx.body || {};
  const type = FUND_TYPES.includes(b.type) ? b.type : '';
  if (!type) throw new HttpError(400, '请选择收支类型（收入 / 支出）');
  const fen = fundAmountFen(b.amount);
  if (fen == null) throw new HttpError(400, '金额需为大于 0 的数字（最多两位小数）');
  const note = sField(b.note, 200);
  const happened = cleanDT(b.happened_at) || nowStr().slice(0, 10);
  const info = db.prepare(`INSERT INTO funds (type, amount, note, happened_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
    .run(type, fen, note, happened, nowStr(), nowStr());
  audit(ctx, '记一笔班费', (type === 'income' ? '收 ' : '支 ') + (fen / 100).toFixed(2) + ' 元'
    + (note ? '「' + auditBrief(note, 30) + '」' : '') + ' ' + happened + '（id ' + info.lastInsertRowid + '）');
  return fundView(db.prepare('SELECT * FROM funds WHERE id = ?').get(Number(info.lastInsertRowid)));
});

route('PUT', '/api/funds/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const old = db.prepare('SELECT * FROM funds WHERE id = ?').get(id);
  if (!old) throw new HttpError(404, '记录不存在');
  const b = ctx.body || {};
  const type = 'type' in b ? (FUND_TYPES.includes(b.type) ? b.type : old.type) : old.type;
  let fen = old.amount;
  if ('amount' in b) {
    const v = fundAmountFen(b.amount);
    if (v == null) throw new HttpError(400, '金额需为大于 0 的数字（最多两位小数）');
    fen = v;
  }
  const v = {
    note: 'note' in b ? sField(b.note, 200) : old.note,
    happened_at: 'happened_at' in b ? (cleanDT(b.happened_at) || old.happened_at) : old.happened_at,
  };
  db.prepare(`UPDATE funds SET type = ?, amount = ?, note = ?, happened_at = ?, updated_at = ? WHERE id = ?`)
    .run(type, fen, v.note, v.happened_at, nowStr(), id);
  const ch = [];
  if (type !== old.type) ch.push((type === 'income' ? '改为收入' : '改为支出'));
  if (fen !== old.amount) ch.push('金额 ' + (old.amount / 100).toFixed(2) + ' → ' + (fen / 100).toFixed(2) + ' 元');
  if (v.note !== old.note) ch.push('用途→「' + auditBrief(v.note, 24) + '」');
  if (v.happened_at !== old.happened_at) ch.push('日期→' + v.happened_at);
  audit(ctx, '修改班费记录', (ch.length ? ch.join('、') : '提交后无变化') + '（id ' + id + '）');
  return fundView(db.prepare('SELECT * FROM funds WHERE id = ?').get(id));
});

route('DELETE', '/api/funds/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  // 两条 DELETE 同事务，避免中途失败留下悬空凭证记录；磁盘文件在提交后删（残留交给清扫任务）
  const files = transact(() => {
    const info = db.prepare('DELETE FROM funds WHERE id = ?').run(id);
    if (!info.changes) throw new HttpError(404, '记录不存在');
    const names = db.prepare('SELECT stored_name FROM fund_attachments WHERE fund_id = ?').all(id).map((a) => a.stored_name);
    db.prepare('DELETE FROM fund_attachments WHERE fund_id = ?').run(id);
    return names;
  });
  for (const name of files) {
    const fp = path.resolve(UPLOAD_DIR, name);
    try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
  }
  audit(ctx, '删除班费记录', (ctx.auditSubject || 'id=' + id) + (files.length ? '，连带删掉 ' + files.length + ' 份凭证' : ''));
  return { ok: true };
});

/* ---------- 班费凭证附件（支出证明等）：复用附件存储与类型白名单，独立表按 fund_id 关联 ---------- */
route('POST', '/api/funds/:id/attachment', async (ctx) => {
  const fid = Number(ctx.params.id);
  if (!Number.isInteger(fid)) throw new HttpError(400, '参数错误');
  if (!db.prepare('SELECT id FROM funds WHERE id = ?').get(fid)) throw new HttpError(404, '记录不存在');
  if (!ctx.raw) throw new HttpError(400, '需要 multipart 表单');
  const { files } = parseMultipart(ctx.raw, ctx.req.headers['content-type'] || '');
  if (!files.length) throw new HttpError(400, '请选择文件');
  const saved = [];
  const written = [];
  try {
    for (const f of files) {
      // 单文件尺寸检查：超过 MAX_FILE_SIZE 直接拒绝，不写盘
      if (f.data.length > MAX_FILE_SIZE) {
        throw new HttpError(413, '单文件不能超过 ' + Math.round(MAX_FILE_SIZE / 1024 / 1024) + ' MB：' + sanitizeName(f.filename));
      }
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
      const info = db.prepare(`INSERT INTO fund_attachments (fund_id, orig_name, stored_name, size, mime, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`)
        .run(fid, orig, rel, f.data.length, cleanMime(f.contentType), nowStr());
      saved.push(Number(info.lastInsertRowid));
    }
  } catch (e) {
    for (const id of saved) { try { db.prepare('DELETE FROM fund_attachments WHERE id = ?').run(id); } catch (e2) { /* 忽略 */ } }
    for (const fp0 of written) { try { fs.unlinkSync(fp0); } catch (e2) { /* 留给清扫任务 */ } }
    throw e;
  }
  audit(ctx, '上传班费凭证', ctx.auditSubject + ' 附 ' + saved.length + ' 个：'
    + auditBrief(files.slice(0, saved.length).map((f) => f.filename + ' ' + Math.round(f.data.length / 1024) + ' KB').join('、'), 120));
  return { ok: true, ids: saved };
});

// 打开 / 下载凭证：仅位图与 PDF 内联预览，其余强制下载（与消息附件同一白名单，防同源脚本）
route('GET', '/api/fund-attachments/:id/file', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM fund_attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  const previewable = PREVIEWABLE_RE.test(a.mime || '');
  serveAttachment(ctx, a, { inline: previewable, cache: previewable });
});

route('DELETE', '/api/fund-attachments/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM fund_attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  const fp = path.resolve(UPLOAD_DIR, a.stored_name);
  try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
  db.prepare('DELETE FROM fund_attachments WHERE id = ?').run(id);
  return { ok: true };
});

// 导出 CSV（带 BOM，Excel 直接打开不乱码；沿用当前筛选口径）
route('GET', '/api/funds/export', (ctx) => {
  const { whereSql, args } = fundWhere(ctx.query);
  const rows = db.prepare(`SELECT * FROM funds ${whereSql} ORDER BY happened_at DESC, id DESC LIMIT 5000`).all(...args);
  const quote = (s) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const escCell = (val) => quote(String(val == null ? '' : val));
  // Excel 公式注入只可能来自用户可控的文本（备注、日期由 cleanDT 规整过）；
  // 不能顺手作用到金额列——按「支出」筛选时结余必为负数，加前缀会把数值格成文本
  const escText = (val) => {
    const s = String(val == null ? '' : val);
    return quote(/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
  };
  const yuan = (fen) => (fen / 100).toFixed(2);
  const lines = ['日期,类型,金额(元),备注'];
  let income = 0, expense = 0;
  for (const r of rows) {
    if (r.type === 'income') income += r.amount; else expense += r.amount;
    lines.push([escText(r.happened_at), escCell(r.type === 'income' ? '收入' : '支出'), escCell(yuan(r.amount)), escText(r.note)].join(','));
  }
  // 上限 5000 行防误拖全库：真被截断时必须说清楚——下面的合计只累计已取出的行，不是全量
  if (rows.length >= 5000) lines.push('', ['提示', '仅导出前 5000 条，以下合计不含被截断部分', '', ''].map(escText).join(','));
  lines.push('', ['合计', '收入', yuan(income), ''].map(escCell).join(','));
  lines.push(['', '支出', yuan(expense), ''].map(escCell).join(','));
  lines.push(['', '结余', yuan(income - expense), ''].map(escCell).join(','));
  const body = '﻿' + lines.join('\r\n') + '\r\n';
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="fund.csv"; filename*=UTF-8''${encodeURIComponent('班费收支.csv')}`,
  });
  res.end(body);
});

/* ---------- 征集活动（先发布一次征集，再往里收点子；像投票那样可发链接、可截止） ----------
 * visibility：public 全班可见（互相能看、能点赞）；private 只有系统管理员与提交人看得到，
 * 班委只看到份数。发起 / 编辑 / 删除只归系统管理员；点子的状态与回复在公开征集里归管理员与班委，
 * 私密征集里只归系统管理员。 */
function campaignOf(id) { return db.prepare('SELECT * FROM idea_campaigns WHERE id = ?').get(String(id || '').toLowerCase()); }
function campaignIsClosed(c) {
  if (!!c.closed) return true;
  const d = JL.deadlineDate(c.deadline);
  return !!(d && Date.now() > d.getTime());
}
function campaignView(c, ctx) {
  const me = sessionOf(ctx.req) || {};
  const count = db.prepare("SELECT COUNT(*) AS c FROM guestbook WHERE kind = 'idea' AND campaign_id = ?").get(c.id).c;
  const myCount = me.sid ? db.prepare("SELECT COUNT(*) AS c FROM guestbook WHERE kind = 'idea' AND campaign_id = ? AND sid = ?").get(c.id, me.sid).c : 0;
  const visibility = c.visibility === 'private' ? 'private' : 'public';
  return {
    id: c.id, title: c.title, description: c.description, deadline: c.deadline,
    closed: !!c.closed, closedNow: campaignIsClosed(c), visibility,
    createdAt: Number(c.created_at) || 0, count, myCount,
    // 处理提交（改状态 / 回复 / 删）的权限：私密征集只归系统管理员
    canManage: visibility === 'private' ? authOk(ctx.req) : canPostOk(ctx.req),
  };
}
function ideaInPrivateCampaign(row) {
  if (row.kind !== 'idea' || !row.campaign_id) return false;
  const c = campaignOf(row.campaign_id);
  return !!(c && c.visibility === 'private');
}
// 提交内容能不能被这个会话看到：私密征集只有系统管理员、提交人本人，以及主动「匿名公开」的那几条
function ideaVisible(row, ctx) {
  if (!ideaInPrivateCampaign(row)) return true;
  if (authOk(ctx.req)) return true;
  if (row.public_share) return true;
  const me = sessionOf(ctx.req) || {};
  return !!(me.sid && row.sid === me.sid);
}
function ideaManageOk(row, ctx) {
  return ideaInPrivateCampaign(row) ? authOk(ctx.req) : canPostOk(ctx.req);
}

route('GET', '/api/campaigns', (ctx) => ({
  items: db.prepare('SELECT * FROM idea_campaigns ORDER BY created_at DESC, id').all().map((c) => campaignView(c, ctx)),
}));

route('POST', '/api/campaigns', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const b = ctx.body || {};
  const title = sField(b.title, 60);
  if (!title) throw new HttpError(400, '请填写征集标题');
  const visibility = b.visibility === 'private' ? 'private' : 'public';
  const deadline = cleanDT(b.deadline) || '';
  const id = JL.genId(7);
  db.prepare(`INSERT INTO idea_campaigns (id, title, description, deadline, closed, visibility, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)`)
    .run(id, title, sField(b.description, 1000), deadline, visibility, Date.now());
  audit(ctx, '发起征集', '《' + auditBrief(title, 40) + '》'
    + (visibility === 'private' ? '仅我与提交人可见' : '全班可见')
    + (deadline ? '，截止 ' + deadline : '') + '（id ' + id + '）');
  return { ok: true, id };
});

route('GET', '/api/campaigns/:id', (ctx) => {
  const c = campaignOf(ctx.params.id);
  if (!c) throw new HttpError(404, '征集不存在');
  const view = campaignView(c, ctx);
  const admin = authOk(ctx.req);
  const me = sessionOf(ctx.req) || {};
  let rows = db.prepare("SELECT * FROM guestbook WHERE kind = 'idea' AND campaign_id = ? ORDER BY id DESC").all(c.id);
  // 私密征集：别人只看得到「匿名公开」的那几条自己的提交；管理员看全部
  if (view.visibility === 'private' && !admin) rows = rows.filter((r) => r.public_share || (me.sid && r.sid === me.sid));
  // 匿名只影响墙上显示谁：非系统管理员拿到的一律是「匿名」，真名不出服务端
  const items = attachIdeaAtts(rows.map((r) => gbMask(r, ctx)));
  const statusCounts = {};
  for (const r of rows) { const k = r.status || 'open'; statusCounts[k] = (statusCounts[k] || 0) + 1; }
  return { ...view, items, statusCounts };
});

route('PUT', '/api/campaigns/:id', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const c = campaignOf(ctx.params.id);
  if (!c) throw new HttpError(404, '征集不存在');
  const b = ctx.body || {};
  const title = b.title !== undefined ? sField(b.title, 60) : c.title;
  if (!title) throw new HttpError(400, '标题不能为空');
  const description = b.description !== undefined ? sField(b.description, 1000) : c.description;
  const deadline = b.deadline !== undefined ? (cleanDT(b.deadline) || '') : (c.deadline || '');
  const curVis = c.visibility === 'private' ? 'private' : 'public';
  const visibility = b.visibility !== undefined ? (b.visibility === 'private' ? 'private' : 'public') : curVis;
  const closed = b.closed !== undefined ? (b.closed ? 1 : 0) : (c.closed ? 1 : 0);
  db.prepare('UPDATE idea_campaigns SET title = ?, description = ?, deadline = ?, visibility = ?, closed = ? WHERE id = ?')
    .run(title, description, deadline, visibility, closed, c.id);
  const ch = [];
  if (title !== c.title) ch.push('标题');
  if (description !== c.description) ch.push('说明');
  if (deadline !== (c.deadline || '')) ch.push('截止→' + (deadline || '不限'));
  if (visibility !== curVis) ch.push(visibility === 'private' ? '改为仅我与提交人可见' : '改为全班可见');
  if (closed !== (c.closed ? 1 : 0)) ch.push(closed ? '停止收集' : '重新开放');
  audit(ctx, '编辑征集', '《' + auditBrief(title, 40) + '》' + (ch.length ? ' 改了' + ch.join('、') : ' 提交后无变化'));
  return { ok: true };
});

route('DELETE', '/api/campaigns/:id', (ctx) => {
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const c = campaignOf(ctx.params.id);
  if (!c) throw new HttpError(404, '征集不存在');
  const n = db.prepare("SELECT COUNT(*) AS c FROM guestbook WHERE kind = 'idea' AND campaign_id = ?").get(c.id).c;
  const files = transact(() => {
    const names = db.prepare(`SELECT stored_name FROM idea_attachments
        WHERE idea_id IN (SELECT id FROM guestbook WHERE kind = 'idea' AND campaign_id = ?)`).all(c.id).map((a) => a.stored_name);
    db.prepare(`DELETE FROM idea_attachments WHERE idea_id IN (SELECT id FROM guestbook WHERE kind = 'idea' AND campaign_id = ?)`).run(c.id);
    db.prepare("DELETE FROM guestbook WHERE kind = 'idea' AND campaign_id = ?").run(c.id);
    db.prepare('DELETE FROM idea_campaigns WHERE id = ?').run(c.id);
    return names;
  });
  for (const name of files) {
    const fp = path.resolve(UPLOAD_DIR, name);
    try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
  }
  audit(ctx, '删除征集', (ctx.auditSubject || '《' + auditBrief(c.title, 40) + '》')
    + ' 连带 ' + n + ' 份提交' + (files.length ? '、' + files.length + ' 个附件' : '') + '（不可恢复）');
  return { ok: true };
});

/* ---------- 思维碰撞（原「留言寄语」并进来：同一面墙两个标签） ----------
 * 点子：同学提的活动建议、或供我反思的问题，带状态（待看 / 采纳 / 已实现 / 搁置）与公开回复；
 * 留言：原来那面寄语墙，昵称 / 点赞 / 弹幕 / 主题照旧（老数据 kind='note'）。
 * 匿名的口径：匿名只影响"墙上显示谁"——提交人的学号与真实姓名照常入库（管理员才查得到），
 * 但界面里不写这一点。列表下发时非系统管理员拿到的一律是「匿名」，真名不出服务端。
 * 发布与点赞按 IP 限速、内容长度上限防刷屏；列表与弹幕一律前端转义，杜绝 XSS。 */
const IDEA_STATUS = ['open', 'accepted', 'done', 'dropped'];
const IDEA_STATUS_LABEL = { open: '待看', accepted: '采纳', done: '已实现', dropped: '搁置' };
function gbMask(row, ctx) {
  const admin = authOk(ctx.req);
  const me = sessionOf(ctx.req) || {};
  const isIdea = row.kind === 'idea';
  // 匿名只影响墙上显示谁；「匿名公开」是私密征集里主动公开的那条，同样不露名字
  const hideWho = isIdea && !admin && (!!row.anonymous || !!row.public_share);
  const out = {
    id: row.id, kind: isIdea ? 'idea' : 'note',
    content: row.content, likes: row.likes, topic: row.topic, created_at: row.created_at,
    status: isIdea ? (row.status || 'open') : '',
    reply: isIdea ? (row.reply || '') : '', reply_at: isIdea ? (row.reply_at || '') : '',
    campaign_id: isIdea ? (row.campaign_id || '') : '',
    nickname: hideWho ? '匿名' : (row.nickname || '匿名'),
    anonymous: isIdea && !!row.anonymous,
    public_share: isIdea && !!row.public_share,
    // 自己提的那条标一下（匿名时只对本人成立，别人算不出是谁）
    mine: !!(me.sid && row.sid && me.sid === row.sid),
  };
  // 匿名点子的提交人只有系统管理员拿得到
  if (admin && isIdea) { out.sid = row.sid || ''; out.submitter = row.nickname || ''; }
  return out;
}
// 把点子的附件挂到列表项上（一次批量查，别 N+1）；留言没有附件
function attachIdeaAtts(items) {
  const ids = items.filter((m) => m.kind === 'idea').map((m) => m.id);
  if (!ids.length) return items;
  const ph = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id, idea_id, orig_name, size, mime FROM idea_attachments WHERE idea_id IN (${ph}) ORDER BY id`).all(...ids);
  const map = {};
  for (const a of rows) (map[a.idea_id] ||= []).push(a);
  for (const m of items) if (m.kind === 'idea') m.attachments = map[m.id] || [];
  return items;
}
route('GET', '/api/guestbook', (ctx) => {
  // 这里只剩「留言」这面墙：点子挂在征集下面，走 /api/campaigns/:id
  const q = ctx.query;
  const limit = Math.min(Math.max(Number(q.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(q.get('offset')) || 0, 0);
  const topic = sField(q.get('topic'), 20);
  const where = ["kind = 'note'"];
  const args = [];
  if (topic) { where.push('topic = ?'); args.push(topic); }
  const whereSql = 'WHERE ' + where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS c FROM guestbook ${whereSql}`).get(...args).c;
  const order = q.get('sort') === 'hot' ? 'ORDER BY likes DESC, id DESC' : 'ORDER BY id DESC';
  const items = db.prepare(`SELECT * FROM guestbook ${whereSql} ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
  // 主题聚合（不随话题筛选变）：主题由同学自由填写，不限条数的话一次 GET 的响应体与 chips 都会被刷爆
  const topics = db.prepare(`SELECT topic, COUNT(*) AS c FROM guestbook WHERE kind = 'note' AND topic <> ''
      GROUP BY topic ORDER BY c DESC, MAX(id) DESC LIMIT 30`).all().map((t) => ({ topic: t.topic, count: t.c }));
  return { total, items: items.map((r) => gbMask(r, ctx)), topics };
});

const IDEA_ATT_MAX = 5;                        // 一条点子最多 5 个附件
const IDEA_ATT_MAX_BYTES = 20 * 1024 * 1024;   // 单个 ≤ 20MB：传教程 / 文档够用，别让 100MB 的请求体一人占满
const IDEA_ATT_TOTAL_BYTES = 40 * 1024 * 1024;
// 建点子 / 发留言。点子可以带文件（multipart，比如直接交一篇教程），
// 文件与记录同一个事务：任何一步失败都不留半截数据，也不留孤儿文件
route('POST', '/api/guestbook', async (ctx) => {
  const ip = (ctx.req.socket && ctx.req.socket.remoteAddress) || '?';
  if (!guestbookRateOk(ip)) throw new HttpError(429, '发言太快了，歇一会儿再发');
  let b = ctx.body || {};
  let files = [];
  if ((ctx.req.headers['content-type'] || '').includes('multipart/form-data')) {
    const parsed = parseMultipart(ctx.raw || Buffer.alloc(0), ctx.req.headers['content-type'] || '');
    b = parsed.fields || {};
    files = parsed.files || [];
  }
  const kind = b.kind === 'idea' ? 'idea' : 'note';
  if (kind !== 'idea' && files.length) throw new HttpError(400, '留言不支持附件');
  // 点子必须挂在一次征集下，而且征集得还在收
  let campaign = null;
  if (kind === 'idea') {
    campaign = campaignOf(b.campaign);
    if (!campaign) throw new HttpError(400, '请先选择一个征集');
    if (campaignIsClosed(campaign)) throw new HttpError(400, '这次征集已经结束，不能再提交了');
  }
  const content = sField(b.content, 500);
  // 点子允许"只传文件"：只交一篇教程、备忘录也行；留言仍必须有正文
  if (!content && !(kind === 'idea' && files.length)) {
    throw new HttpError(400, kind === 'idea' ? '写点什么，或者选一个文件' : '留言内容不能为空');
  }
  if (files.length > IDEA_ATT_MAX) throw new HttpError(400, `一条点子最多 ${IDEA_ATT_MAX} 个附件`);
  let totalBytes = 0;
  for (const f of files) {
    if (f.data.length > IDEA_ATT_MAX_BYTES) throw new HttpError(400, `「${sanitizeName(f.filename)}」超过 20MB，换个小一点的文件`);
    totalBytes += f.data.length;
  }
  if (totalBytes > IDEA_ATT_TOTAL_BYTES) throw new HttpError(400, '附件合计超过 40MB，请分开提交');
  const topic = sField(b.topic, 20);
  const me = sessionOf(ctx.req) || {};
  const trueish = (v) => v === true || v === 'true' || v === 'on';
  // 点子的署名来自登录账号（不用再输昵称）；留言仍是自由昵称。
  // 私密征集里名字本来就不给外人看，一律按匿名落库；「匿名公开」是提交人主动把这一条放给全班看，
  // 仍然是匿名展示（附件同权限）。公开征集里勾「匿名」本来就是"匿名给全班看"，不需要额外开关。
  const privateCampaign = !!(campaign && campaign.visibility === 'private');
  const anonymous = kind === 'idea' && (privateCampaign || trueish(b.anonymous));
  const publicShare = kind === 'idea' && privateCampaign && trueish(b.public_share);
  const nickname = kind === 'idea' ? (me.name || '管理员') : (sField(b.nickname, 20) || '匿名');
  const status = kind === 'idea' ? 'open' : '';
  const written = [];
  let newId;
  try {
    newId = transact(() => {
      const info = db.prepare(`INSERT INTO guestbook (nickname, content, topic, kind, status, sid, anonymous, campaign_id, public_share, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(nickname, content, topic, kind, status, me.sid || '', anonymous ? 1 : 0, campaign ? campaign.id : '',
          publicShare ? 1 : 0, nowStr());
      const id = Number(info.lastInsertRowid);
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
        db.prepare(`INSERT INTO idea_attachments (idea_id, orig_name, stored_name, size, mime, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`)
          .run(id, orig, rel, f.data.length, cleanMime(f.contentType), nowStr());
      }
      return id;
    });
  } catch (e) {
    for (const fp0 of written) { try { fs.unlinkSync(fp0); } catch (e2) { /* 留给清扫任务 */ } }
    throw e;
  }
  // 操作记录只有系统管理员看得到，匿名的真实提交人要在这里留下
  const fileNames = files.map((f) => sanitizeName(f.filename));
  audit(ctx, kind === 'idea' ? '提点子' : '发布留言',
    (campaign ? '《' + auditBrief(campaign.title, 30) + '》 ' : '')
    + '「' + auditBrief(content || fileNames.join('、'), 60) + '」（' + nickname + (me.sid ? ' ' + me.sid : '')
    + (kind === 'idea' && privateCampaign
      ? (publicShare ? '，匿名公开给全班' : '，仅我与提交人可见')
      : (anonymous ? '，匿名提交' : '')) + '）' + (topic ? ' 主题「' + auditBrief(topic, 20) + '」' : '')
    + (fileNames.length ? ' 附 ' + fileNames.length + ' 个：' + auditBrief(fileNames.join('、'), 80) : '')
    + '（id ' + newId + '）');
  return attachIdeaAtts([gbMask(db.prepare('SELECT * FROM guestbook WHERE id = ?').get(newId), ctx)])[0];
});

// 点子的状态与回复：公开征集归管理员与班委（值班时先标一句"收到"），私密征集只归系统管理员
route('PUT', '/api/guestbook/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const old = db.prepare('SELECT * FROM guestbook WHERE id = ?').get(id);
  if (!old) throw new HttpError(404, '点子不存在');
  if (old.kind !== 'idea') throw new HttpError(400, '留言没有状态与回复');
  if (!ideaManageOk(old, ctx)) throw new HttpError(401, '需要管理员或班委登录');
  const b = ctx.body || {};
  const status = b.status !== undefined ? String(b.status) : (old.status || 'open');
  if (!IDEA_STATUS.includes(status)) throw new HttpError(400, '状态只能是待看 / 采纳 / 已实现 / 搁置');
  const reply = b.reply !== undefined ? sField(b.reply, 500) : (old.reply || '');
  // 回复改过才刷新时间；清空回复就把时间一起清掉
  const replyAt = !reply ? '' : (reply !== (old.reply || '') ? nowStr() : (old.reply_at || ''));
  db.prepare('UPDATE guestbook SET status = ?, reply = ?, reply_at = ? WHERE id = ?').run(status, reply, replyAt, id);
  const ch = [];
  if (status !== (old.status || 'open')) ch.push('状态→' + IDEA_STATUS_LABEL[status]);
  if (reply !== (old.reply || '')) ch.push(reply ? '回复「' + auditBrief(reply, 40) + '」' : '清空回复');
  audit(ctx, '更新点子', '「' + auditBrief(old.content, 40) + '」'
    + (ch.length ? ' ' + ch.join('、') : ' 提交后无变化') + '（id ' + id + '）');
  return gbMask(db.prepare('SELECT * FROM guestbook WHERE id = ?').get(id), ctx);
});

/* 点赞是高频、低价值的写操作（同一 IP 每分钟最多 40 次）：逐条落库，几分钟就能把两万条
 * 滚动窗口刷满，把真正的发布 / 删除挤出去。与登录失败同一处理——同一 IP 5 分钟只落一条，
 * 其余只计数并在下一条里合并说明。 */
const likeAudit = new Map();
function auditGuestbookLike(ctx, ip, detail) {
  const now = Date.now();
  const rec = likeAudit.get(ip);
  if (rec && rec.until > now) {
    rec.n++;
    // 点赞是成功的写请求，不显式记账就会被请求层兜底补一行——合并掉的那几条必须自己把门关掉
    if (ctx) ctx.audited = true;
    return;
  }
  if (likeAudit.size > 4000) likeAudit.clear();   // 内存兜底：班级规模下远到不了
  likeAudit.set(ip, { until: now + 5 * 60000, n: 0 });
  audit(ctx, '点赞留言', detail + (rec && rec.n ? `（同类点赞近 5 分钟还写入了 ${rec.n} 次，未逐条记录）` : ''));
}
// 点赞：访客可点，按 IP 限速（比发帖宽松）；无身份体系，服务端只做频控，防刷同浏览器去重在前端 localStorage
route('POST', '/api/guestbook/:id/like', (ctx) => {
  const ip = (ctx.req.socket && ctx.req.socket.remoteAddress) || '?';
  if (!guestbookLikeRateOk(ip)) throw new HttpError(429, '点赞太频繁，稍后再说');
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const row = db.prepare('SELECT * FROM guestbook WHERE id = ?').get(id);
  // 私密征集里没公开的提交：对看不到的人直接当不存在，别给"存在性探测 / 刷赞"留口子
  if (!row || !ideaVisible(row, ctx)) throw new HttpError(404, '内容不存在');
  db.prepare('UPDATE guestbook SET likes = likes + 1 WHERE id = ?').run(id);
  const likes = db.prepare('SELECT likes FROM guestbook WHERE id = ?').get(id).likes;
  auditGuestbookLike(ctx, ip, ctx.auditSubject + ' 累计 ' + likes + ' 赞');
  return { ok: true, likes };
});

// 点子附件：登录即可下载（匿名点子的文件同样公开，文件名里不含提交人）；位图 / PDF 内联，其余强制下载
route('GET', '/api/idea-attachments/:id/download', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM idea_attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  // 私密征集里的提交内容与附件，只有系统管理员与提交人拿得到；对别人直接当不存在
  const idea = db.prepare('SELECT * FROM guestbook WHERE id = ?').get(a.idea_id);
  if (!idea || !ideaVisible(idea, ctx)) throw new HttpError(404, '附件不存在');
  const previewable = PREVIEWABLE_RE.test(a.mime || '');
  serveAttachment(ctx, a, { inline: previewable && ctx.query.get('dl') !== '1' });
});

// 删附件：提交人自己能删（传错了换一个），能处理这次征集的人也能删
route('DELETE', '/api/idea-attachments/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const a = db.prepare('SELECT * FROM idea_attachments WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, '附件不存在');
  const idea = db.prepare('SELECT * FROM guestbook WHERE id = ?').get(a.idea_id);
  const me = sessionOf(ctx.req) || {};
  const own = !!(idea && me.sid && idea.sid === me.sid);
  // 看不到的提交，连附件是否存在都不告诉对方
  if (!idea || !ideaVisible(idea, ctx)) throw new HttpError(404, '附件不存在');
  if (!(ideaManageOk(idea, ctx) || own)) throw new HttpError(403, '只能删自己点子的附件');
  const fp = path.resolve(UPLOAD_DIR, a.stored_name);
  try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
  db.prepare('DELETE FROM idea_attachments WHERE id = ?').run(id);
  audit(ctx, '删除点子附件', '「' + auditBrief(a.orig_name, 40) + '」'
    + (idea ? ' 属于「' + auditBrief(idea.content, 30) + '」' : ''));
  return { ok: true };
});

route('DELETE', '/api/guestbook/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '参数错误');
  const row = db.prepare('SELECT * FROM guestbook WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, '内容不存在');
  // 删留言 / 点子：公开征集归管理员与班委（值班时清掉不当内容），私密征集只归系统管理员
  if (!ideaManageOk(row, ctx)) throw new HttpError(401, '需要管理员或班委登录');
  // 点子可能带附件：数据库记录在事务里一起清，磁盘文件提交后再删（文件被占用时留给清扫任务）
  const files = transact(() => {
    const names = db.prepare('SELECT stored_name FROM idea_attachments WHERE idea_id = ?').all(id).map((a) => a.stored_name);
    db.prepare('DELETE FROM idea_attachments WHERE idea_id = ?').run(id);
    db.prepare('DELETE FROM guestbook WHERE id = ?').run(id);
    return names;
  });
  for (const name of files) {
    const fp = path.resolve(UPLOAD_DIR, name);
    try { if (fp.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略 */ }
  }
  audit(ctx, row.kind === 'idea' ? '删除点子' : '删除留言', (ctx.auditSubject || 'id=' + id)
    + (files.length ? ' 连带 ' + files.length + ' 个附件' : ''));
  return { ok: true };
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
  const hadBadge = fs.existsSync(BADGE_FILE);
  fs.writeFileSync(BADGE_FILE, buf);
  audit(ctx, '上传班徽', '「' + auditBrief(files[0].filename, 40) + '」 ' + Math.round(buf.length / 1024) + ' KB'
    + (hadBadge ? '（覆盖原有班徽）' : ''));
  return { ok: true };
});
route('DELETE', '/api/class-badge', (ctx) => {
  const had = fs.existsSync(BADGE_FILE);
  try { fs.unlinkSync(BADGE_FILE); } catch (e) { /* 本来就没有 */ }
  audit(ctx, '删除班徽', had ? '生日页水印恢复默认' : '本来就没设班徽（无变化）');
  return { ok: true };
});

/* ---------- 导入备份 ---------- */
route('POST', '/api/import', async (ctx) => {
  const b = ctx.body || {};
  if (!Array.isArray(b.groups) || !Array.isArray(b.messages)) {
    throw new HttpError(400, '备份文件格式不对（缺少 groups / messages）');
  }
  // 非空库一律拒绝（force=1 除外）：检查全部业务表，防止只有名单/生日等数据时被误判为空库而重复导入
  const exist = ['messages', 'groups', 'attachments', 'inbox', 'jielongs', 'jielong_entries', 'draws', 'draw_rounds', 'rosters', 'birthdays', 'votes', 'vote_ballots', 'surveys', 'survey_questions', 'survey_responses', 'survey_templates', 'funds', 'guestbook', 'idea_campaigns', 'idea_attachments', 'users']
    .reduce((sum, t) => sum + db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c, 0);
  if (exist > 0 && ctx.query.get('force') !== '1') {
    throw new HttpError(400, '当前已有数据，为防止重复导入被拒绝。请先用空数据文件夹再导入');
  }
  // force=1 为合并导入：接龙/抽签按原 id 替换（记录先清后插，保证重导同一份备份结果一致），
  // 群按 ext_key 合并，名单同名覆盖，生日同名同生日跳过——否则固定主键撞唯一索引必然整体回滚
  const force = ctx.query.get('force') === '1';
  let n = 0, nAtt = 0, nGroups = 0, nJl = 0, nJlE = 0, nDw = 0, nDwR = 0, nRs = 0, nBd = 0, nV = 0, nVB = 0, nSv = 0, nSq = 0, nSr = 0, nSt = 0, nFn = 0, nFA = 0, nGb = 0, nCamp = 0, nIA = 0, nUs = 0, nInbox = 0;
  // 备份不带密码散列，恢复时要把每个账号重算成"学号后 6 位"的初始散列。scrypt 是异步的（几十毫秒一次），
  // 绝不能留在事务里：开着 BEGIN  await 会让出事件循环，期间别的请求要么报"事务内不能开事务"、
  // 要么把自己的写落进这个事务被导入的回滚一起抹掉。所以先在事务外算完，再进事务纯写。
  const pendingUsers = [];
  let usersTouched = false; // 声明在事务外：COMMIT 之后（try 块作用域之外）也要读它来刷新 USERS_EXIST
  if (Array.isArray(b.users)) {
    for (const g of b.users) {
      const sid = String(g.sid || '').trim().slice(0, 32);
      if (!sid) continue;
      const cred = await AUTH.makeCredential(AUTH.initialPassword(sid));
      pendingUsers.push({ sid, cred, name: sField(g.name, 40), role: USER_ROLES.includes(g.role) ? g.role : 'student',
        disabled: g.disabled ? 1 : 0, created: cleanDT(g.created_at) || nowStr() });
    }
  }
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
      // 手工建的群 ext_key 为空，force 重导同一份备份不能每次都复制一个同名空壳
      // （消息有去重键不会翻倍，群会）；按名字合并进已有群
      if (force && !ext) {
        const sameName = db.prepare('SELECT id FROM groups WHERE name = ?').get(sField(g.name, 60) || '未命名群');
        if (sameName) { if (g.id != null) gmap[String(g.id)] = sameName.id; continue; }
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
      const mTitle = sField(m.title, 120), mContent = sField(m.content, 20000);
      const mRecv = cleanDT(m.received_at) || nowStr();
      // 合并导入要幂等：生日 / 留言 / 名单都有去重键，信息与附件此前没有——重导同一份备份会让
      // 每条信息和附件记录翻倍
      if (force && db.prepare('SELECT id FROM messages WHERE title = ? AND content = ? AND received_at = ?').get(mTitle, mContent, mRecv)) continue;
      const info = insM.run(
        mTitle,
        mContent,
        CATEGORIES.includes(m.category) ? m.category : 'notice',
        m.group_id != null && gmap[String(m.group_id)] != null ? gmap[String(m.group_id)] : null,
        sField(m.sender_name, 60),
        mRecv,
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
        if (force && db.prepare('SELECT id FROM attachments WHERE stored_name = ?').get(stored)) continue; // 同一个物理文件不重复登记
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
    const insJ = db.prepare(`${force ? 'INSERT OR REPLACE' : 'INSERT'} INTO jielongs (id, title, description, deadline, roster, fields, allow_outside, closed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
  // 恢复生日成员（与创建路径同一口径：校验月日合法性）
  if (Array.isArray(b.birthdays)) {
    const insB = db.prepare('INSERT INTO birthdays (name, month, day, year, note, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const g of b.birthdays) {
      const nm = sField(g.name, 60) || '未命名成员';
      const mo = Math.max(0, Number(g.month) || 0);
      const dy = Math.max(0, Number(g.day) || 0);
      // 跳过非法日期：bdayValid 要求月 1-12、日合法（2 月允许 29 日）
      if (!bdayValid(mo, dy)) continue;
      if (force && db.prepare('SELECT id FROM birthdays WHERE name = ? AND month = ? AND day = ?').get(nm, mo, dy)) continue; // 重导幂等
      insB.run(nm, mo, dy, Math.max(0, Number(g.year) || 0), sField(g.note, 200), cleanDT(g.created_at) || nowStr());
      nBd++;
    }
  }
  // 恢复班费收支（金额以「分」存整数，直接取备份值；类型非法或金额 ≤ 0 跳过）
  const fMap = {}; // 备份里的旧 fund_id → 新库自增 id，供凭证附件挂回
  if (Array.isArray(b.funds)) {
    const insF = db.prepare(`INSERT INTO funds (type, amount, note, happened_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`);
    for (const g of b.funds) {
      const type = FUND_TYPES.includes(g.type) ? g.type : '';
      const fen = Math.max(0, Math.min(Math.round(Number(g.amount) || 0), 10000000000));
      if (!type || !fen) continue;
      const note = sField(g.note, 200);
      const happened = cleanDT(g.happened_at) || nowStr().slice(0, 10);
      if (force) {
        const dup = db.prepare('SELECT id FROM funds WHERE type = ? AND amount = ? AND happened_at = ? AND note = ?').get(type, fen, happened, note);
        if (dup) { if (g.id != null) fMap[String(g.id)] = dup.id; continue; } // 重导幂等；仍登记 id 映射，其凭证才能挂回
      }
      const ins = insF.run(type, fen, note, happened, cleanDT(g.created_at) || nowStr(), cleanDT(g.updated_at) || nowStr());
      if (g.id != null) fMap[String(g.id)] = Number(ins.lastInsertRowid);
      nFn++;
    }
  }
  // 恢复班费凭证附件（文件本身随 data/ 目录整体迁移，这里只恢复记录；stored_name 防穿越、mime 白名单）
  if (Array.isArray(b.fundAttachments)) {
    const insFA = db.prepare(`INSERT INTO fund_attachments (fund_id, orig_name, stored_name, size, mime, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`);
    for (const a of b.fundAttachments) {
      const newFund = fMap[String(a.fund_id)];
      if (!newFund) continue; // 对应班费记录不在本次备份中，跳过
      const stored = sField(a.stored_name, 200).replace(/\\/g, '/');
      if (!stored || stored.includes('..') || stored.startsWith('/')) continue;
      const mime = /^[A-Za-z0-9][\w!#$&^_.+-]*\/[\w!#$&^_.+-]*$/.test(String(a.mime || '')) ? String(a.mime) : '';
      insFA.run(newFund, sField(a.orig_name, 200), stored, Math.max(0, Number(a.size) || 0), mime, cleanDT(a.created_at) || nowStr());
      nFA++;
    }
  }
  // 恢复征集活动（id 是随机短串，原样保留；点子的 campaign_id 靠它挂回去）
  if (Array.isArray(b.ideaCampaigns)) {
    const insC = db.prepare(`${force ? 'INSERT OR REPLACE' : 'INSERT'} INTO idea_campaigns (id, title, description, deadline, closed, visibility, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const seenC = new Set();
    for (const c of b.ideaCampaigns) {
      const id = /^[a-z0-9]{3,32}$/.test(String(c.id || '')) ? String(c.id) : JL.genId(7);
      if (seenC.has(id)) continue; // 载荷自身重复，留第一条
      seenC.add(id);
      insC.run(id, sField(c.title, 60) || '未命名征集', sField(c.description, 1000), cleanDT(c.deadline) || '',
        c.closed ? 1 : 0, c.visibility === 'private' ? 'private' : 'public', Number(c.created_at) || Date.now());
      nCamp++;
    }
  }
  // 恢复点子 / 留言（内容为空的跳过；昵称与正文按当前口径截断）。
  // 老备份没有 kind 与状态字段：一律按留言恢复，不会凭空多出一条"待看"的点子
  const gbmap = {};   // 备份里的 id → 新插入的 id（点子附件靠它挂回去）
  if (Array.isArray(b.guestbook)) {
    const insGB = db.prepare(`INSERT INTO guestbook (nickname, content, likes, topic, kind, status, reply, reply_at, sid, anonymous, campaign_id, public_share, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const g of b.guestbook) {
      const kind = g.kind === 'idea' ? 'idea' : 'note';
      const content = sField(g.content, 500);
      // 留言必须有正文；点子允许只带附件（比如只交一篇教程）
      if (!content && kind !== 'idea') continue;
      const nickname = sField(g.nickname, 20) || '匿名';
      const created = cleanDT(g.created_at) || nowStr();
      const status = kind === 'idea' ? (IDEA_STATUS.includes(g.status) ? g.status : 'open') : '';
      const reply = kind === 'idea' ? sField(g.reply, 500) : '';
      const replyAt = reply ? (cleanDT(g.reply_at) || created) : '';
      const anonymous = kind === 'idea' && g.anonymous ? 1 : 0;
      const publicShare = kind === 'idea' && g.public_share ? 1 : 0;
      // 征集不在本次备份 / 库里没有时留空：内容仍保留，只是不会出现在某个征集下面
      let campaignId = kind === 'idea' ? sField(g.campaign_id, 32) : '';
      if (campaignId && !campaignOf(campaignId)) campaignId = '';
      if (force && db.prepare('SELECT id FROM guestbook WHERE nickname = ? AND content = ? AND created_at = ?').get(nickname, content, created)) continue; // 重导幂等
      const info = insGB.run(nickname, content, Math.max(0, Number(g.likes) || 0), sField(g.topic, 20), kind, status,
        reply, replyAt, sField(g.sid, 32), anonymous, campaignId, publicShare, created);
      if (g.id != null) gbmap[String(g.id)] = Number(info.lastInsertRowid);
      nGb++;
    }
    // 恢复点子附件记录（物理文件不在 JSON 里，随 data/ 目录整体迁移）
    if (Array.isArray(b.ideaAttachments)) {
      const insIA = db.prepare(`INSERT INTO idea_attachments (idea_id, orig_name, stored_name, size, mime, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`);
      for (const a of b.ideaAttachments) {
        const ideaId = gbmap[String(a.idea_id)];
        if (!ideaId) continue; // 对应点子不在本次备份里，跳过
        const stored = sField(a.stored_name, 200).replace(/\\/g, '/');
        if (!stored || stored.includes('..') || stored.startsWith('/')) continue;
        if (force && db.prepare('SELECT id FROM idea_attachments WHERE stored_name = ?').get(stored)) continue; // 同一个物理文件不重复登记
        const mime = /^[A-Za-z0-9][\w!#$&^_.+-]*\/[\w!#$&^_.+-]*$/.test(String(a.mime || '')) ? String(a.mime) : '';
        insIA.run(ideaId, sField(a.orig_name, 200), stored, Math.max(0, Number(a.size) || 0), mime,
          cleanDT(a.created_at) || nowStr());
        nIA++;
      }
    }
  }
  // 恢复待审核收件箱：机器人 review 模式下攒的未收录消息只存在这里，不备份就等于恢复后这批消息永久丢失
  if (Array.isArray(b.inbox)) {
    const insIn = db.prepare(`INSERT ${force ? 'OR REPLACE' : ''} INTO inbox (id, content, sender_name, group_name, qq_gid, received_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const it of b.inbox) {
      const content = sField(it.content, 4000);
      if (!content) continue;
      const recv = cleanDT(it.received_at) || nowStr();
      const id = Number(it.id) > 0 ? Number(it.id) : null;
      if (id == null && force && db.prepare('SELECT id FROM inbox WHERE content = ? AND received_at = ?').get(content, recv)) continue;
      insIn.run(id, content, sField(it.sender_name, 60), sField(it.group_name, 60), sField(it.qq_gid, 40),
        recv, cleanDT(it.created_at) || nowStr());
      nInbox++;
    }
  }
  // 恢复账号：备份里没有密码散列，导入后按初始密码（学号后 6 位）重开并要求改密。
  // USERS_EXIST 是内存量，不能在事务里刷新：后续步骤抛错回滚后 users 表已清空，
  // 它却停留在 true——开放部署会被一次失败导入整个锁死，直到重启进程
  if (Array.isArray(b.users)) {
    const insU = db.prepare(`INSERT ${force ? 'OR REPLACE' : ''} INTO users
        (sid, name, role, disabled, pw_hash, salt, must_change, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`);
    for (const u of pendingUsers) {
      insU.run(u.sid, u.name, u.role, u.disabled, u.cred.pwHash, u.cred.salt, u.created, nowStr());
      nUs++;
    }
    usersTouched = true;
  }
  // 恢复投票与选票（id 随机字符串主键原样保留；选票按 vote_id 直接挂回）
  if (Array.isArray(b.votes)) {
    const insV = db.prepare(`${force ? 'INSERT OR REPLACE' : 'INSERT'} INTO votes (id, title, description, deadline, closed, anonymous, roster, options, max_select, reveal, allow_change, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const vIds = new Set();
    const vSlots = new Map();   // 投票 id → 资格名单（用来把选票的 rid 校到合法槽位）
    const REVEALS = ['always', 'after_vote', 'after_close'];
    for (const g of b.votes) {
      const id = /^[a-z0-9]{3,32}$/.test(String(g.id || '')) ? String(g.id) : JL.genId(7);
      if (vIds.has(id)) throw new Error('备份中存在重复的投票 id：' + id);
      insV.run(id,
        sField(g.title, 60) || '未命名投票',
        sField(g.description, 1000),
        cleanDT(g.deadline) || '',
        g.closed ? 1 : 0,
        g.anonymous === false ? 0 : 1,
        asJsonText(g.roster, '[]'),
        asJsonText(g.options, '[]'),
        Math.max(1, Number(g.max_select) || 1),
        REVEALS.includes(g.reveal) ? g.reveal : 'always',
        g.allow_change === 0 || g.allowChange === false ? 0 : 1,
        Math.max(0, Number(g.created_at) || Date.now()));
      vIds.add(id);
      const rosterJson = safeJson(asJsonText(g.roster, '[]'), []);
      vSlots.set(id, Array.isArray(rosterJson) ? rosterJson : []); // 名单不是数组时按空名单处理，别让 findIndex 抛 TypeError 整包 500
      nV++;
    }
    if (force) for (const id of vIds) db.prepare('DELETE FROM vote_ballots WHERE vote_id = ?').run(id);
    if (Array.isArray(b.voteBallots)) {
      const insVB = db.prepare('INSERT INTO vote_ballots (vote_id, rid, sid, name, choices, time) VALUES (?, ?, ?, ?, ?, ?)');
      const seenSlot = new Set();
      for (const e of b.voteBallots) {
        const vid = String(e.vote_id || '');
        if (!vIds.has(vid)) continue; // 对应投票不在本次备份中，跳过
        const sid = sField(e.sid, 40);
        const roster = vSlots.get(vid) || [];
        // rid 必须是合法槽位：越界或为 null 的选票绕得开 UNIQUE(vote_id,rid) 的部分索引，
        // 恢复后会重复计票、进度也对不上；能按学号对回槽位的就补回槽位
        let rid = Number.isInteger(e.rid) && e.rid >= 0 && e.rid < roster.length ? e.rid : null;
        if (rid == null && sid) {
          const i = roster.findIndex((r) => String(r.id || '') === sid);
          if (i >= 0) rid = i;
        }
        if (rid == null && !sid) continue;
        const key = vid + '|' + (rid != null ? 'r' + rid : 's' + sid);
        if (seenSlot.has(key)) continue;   // 一人一票：同槽位 / 同学号的重复票只留第一条
        seenSlot.add(key);
        insVB.run(vid, rid, sid, sField(e.name, 60), asJsonText(e.choices, '[]'), Math.max(0, Number(e.time) || 0));
        nVB++;
      }
    }
  }
  // 恢复问卷、问题与回答（id 随机字符串主键原样保留；问题/回答按 survey_id 直接挂回）
  if (Array.isArray(b.surveys)) {
    const insSv = db.prepare(`${force ? 'INSERT OR REPLACE' : 'INSERT'} INTO surveys (id, title, description, deadline, closed, roster, anonymous, dedup_salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const svIds = new Set();
    for (const g of b.surveys) {
      const id = /^[a-z0-9]{3,32}$/.test(String(g.id || '')) ? String(g.id) : JL.genId(7);
      if (svIds.has(id)) throw new Error('备份中存在重复的问卷 id：' + id);
      insSv.run(id,
        sField(g.title, 80) || '未命名问卷',
        sField(g.description, 1000),
        cleanDT(g.deadline) || '',
        g.closed ? 1 : 0,
        asJsonText(g.roster, '[]'),
        g.anonymous ? 1 : 0,
        sField(g.dedup_salt, 64),
        Math.max(0, Number(g.created_at) || Date.now()));
      svIds.add(id);
      nSv++;
    }
    // 恢复分组：自增 id 会重新分配，记 oldId → newId 映射供题目重挂
    if (force) for (const id of svIds) db.prepare('DELETE FROM survey_sections WHERE survey_id = ?').run(id);
    const secMap = new Map(); // surveyId + ':' + oldSectionId → newSectionId
    if (Array.isArray(b.surveySections)) {
      const insSs = db.prepare('INSERT INTO survey_sections (survey_id, title, description, sort_order) VALUES (?, ?, ?, ?)');
      for (const s of b.surveySections) {
        const sid = String(s.survey_id || '');
        if (!svIds.has(sid)) continue;
        const info = insSs.run(sid, sField(s.title, 80), sField(s.description || '', 500), Number(s.sort_order) || 0);
        if (s.id != null) secMap.set(sid + ':' + String(s.id), Number(info.lastInsertRowid));
      }
    }
    // 恢复问题：优先原样保留备份里的题目 id（回答的 answers 按它存键）；
    // id 被占用时才换新号并记映射，最后统一重写回答的键
    if (force) for (const id of svIds) db.prepare('DELETE FROM survey_questions WHERE survey_id = ?').run(id);
    const qIdMap = new Map(); // surveyId + ':' + oldQuestionId → 最终 questionId
    if (Array.isArray(b.surveyQuestions)) {
      const insSq = db.prepare('INSERT INTO survey_questions (survey_id, section_id, qtype, question, description, options, required, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const insSqId = db.prepare('INSERT INTO survey_questions (id, survey_id, section_id, qtype, question, description, options, required, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const e of b.surveyQuestions) {
        const sid = String(e.survey_id || '');
        if (!svIds.has(sid)) continue;
        const qtype = ['single', 'multiple', 'text', 'rating', 'number', 'date'].includes(e.qtype) ? e.qtype : 'single';
        const secId = e.section_id != null ? (secMap.get(sid + ':' + String(e.section_id)) ?? null) : null;
        const wantId = Number.isInteger(Number(e.id)) && Number(e.id) > 0 ? Number(e.id) : null;
        let finalId;
        if (wantId && !db.prepare('SELECT id FROM survey_questions WHERE id = ?').get(wantId)) {
          finalId = wantId;
          insSqId.run(finalId, sid, secId, qtype, sField(e.question, 200), sField(e.description || '', 500), asJsonText(e.options, '[]'), e.required ? 1 : 0, Number(e.sort_order) || 0);
        } else {
          const info = insSq.run(sid, secId, qtype, sField(e.question, 200), sField(e.description || '', 500), asJsonText(e.options, '[]'), e.required ? 1 : 0, Number(e.sort_order) || 0);
          finalId = Number(info.lastInsertRowid);
        }
        if (e.id != null) qIdMap.set(sid + ':' + String(e.id), String(finalId));
        nSq++;
      }
    }
    // 恢复回答：answers 的键按 qIdMap 从旧题目 id 改挂到最终题目 id，位置键原样保留
    if (force) for (const id of svIds) db.prepare('DELETE FROM survey_responses WHERE survey_id = ?').run(id);
    if (Array.isArray(b.surveyResponses)) {
      const insSr = db.prepare('INSERT INTO survey_responses (survey_id, sid, name, answers, submitted_at, sid_hash) VALUES (?, ?, ?, ?, ?, ?)');
      for (const e of b.surveyResponses) {
        const sid = String(e.survey_id || '');
        if (!svIds.has(sid)) continue;
        const rawAns = safeJson(asJsonText(e.answers, '{}'), {});
        const answers = {};
        for (const [k, val] of Object.entries(rawAns)) {
          const to = qIdMap.get(sid + ':' + k);
          answers[to != null ? to : k] = val;
        }
        insSr.run(sid, sField(e.sid, 40), sField(e.name, 60), JSON.stringify(answers), Math.max(0, Number(e.submitted_at) || 0), sField(e.sid_hash, 64));
        nSr++;
      }
    }
  }
  // 恢复问卷模板（自增主键，按「模板名」去重跳过——与本文件其余自增表同一口径：
  // rosters 按 name、guestbook 按 nickname+content+created_at。绝不能在 force 下整表 DELETE：
  // 那是「合并导入一份备份」，整表清会把用户真实模板连带抹掉）
  if (Array.isArray(b.surveyTemplates)) {
    const insSt = db.prepare('INSERT INTO survey_templates (name, title, description, questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const t of b.surveyTemplates) {
      const name = sField(t.name, 40);
      if (!name) continue;
      const qs = asJsonText(t.questions, '[]');
      if (force && db.prepare('SELECT id FROM survey_templates WHERE name = ? AND questions = ?').get(name, qs)) continue; // 重导幂等
      insSt.run(name, sField(t.title || '', 60), sField(t.description || '', 1000), qs, Math.max(0, Number(t.created_at) || 0), Math.max(0, Number(t.updated_at) || 0));
      nSt++;
    }
  }
    nGroups = Object.keys(gmap).length;
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw new HttpError(500, '导入失败已整体回滚（' + e.message + '），数据库未变动');
  }
  if (usersTouched) refreshUsersExist(); // 事务提交后再刷新内存量，回滚路径不会带着假状态
  const summary = `${nGroups} 个群、${n} 条信息、${nAtt} 条附件记录、${nInbox} 条待审核、${nJl} 个接龙、${nJlE} 条接龙记录、${nDw} 个抽签、${nDwR} 轮抽签历史、${nV} 个投票、${nVB} 张选票、${nSv} 个问卷、${nSq} 个问题、${nSr} 份回答、${nSt} 个模板、${nRs} 份名单、${nBd} 位生日成员、${nFn} 条班费记录、${nFA} 个班费凭证、${nGb} 条点子/留言、${nCamp} 个征集、${nIA} 个点子附件、${nUs} 个账号`;
  console.log('导入备份：' + summary);
  log('导入备份：' + summary);
  audit(ctx, '导入备份', summary);
  return { ok: true, groups: nGroups, imported: n, attachments: nAtt, inbox: nInbox, jielongs: nJl, jielongEntries: nJlE, draws: nDw, drawRounds: nDwR, votes: nV, voteBallots: nVB, surveys: nSv, surveyQuestions: nSq, surveyResponses: nSr, surveyTemplates: nSt, rosters: nRs, birthdays: nBd, funds: nFn, fundAttachments: nFA, guestbook: nGb, ideaCampaigns: nCamp, ideaAttachments: nIA, users: nUs };
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
  // 全量备份（含令牌、名单、选票等一切数据），仅管理员
  if (!authOk(ctx.req)) throw new HttpError(401, '需要管理员登录');
  const dump = {
    exported_at: nowStr(),
    groups: db.prepare('SELECT * FROM groups ORDER BY id').all(),
    messages: db.prepare('SELECT * FROM messages ORDER BY id').all(),
    attachments: db.prepare('SELECT id, message_id, orig_name, stored_name, size, mime, views, downloads, created_at FROM attachments ORDER BY id').all(),
    // 接龙：id 是随机字符串主键，导出/导入可原样保留，记录按 jielong_id 直接挂回
    jielongs: db.prepare('SELECT id, title, description, deadline, roster, fields, allow_outside, closed, created_at FROM jielongs ORDER BY created_at, id').all(),
    jielongEntries: db.prepare('SELECT jielong_id, rid, sid, name, values_json, remark, outside, time, seq FROM jielong_entries ORDER BY jielong_id, seq, id').all(),
    // 抽签：同上，签箱 id 原样保留，轮次按 draw_id 直接挂回
    draws: db.prepare('SELECT id, title, roster, per_draw, created_at FROM draws ORDER BY created_at, id').all(),
    drawRounds: db.prepare('SELECT draw_id, picked, count, time FROM draw_rounds ORDER BY draw_id, id').all(),
    // 投票：id 随机字符串主键原样保留，选票按 vote_id 直接挂回
    votes: db.prepare('SELECT id, title, description, deadline, closed, anonymous, roster, options, max_select, reveal, allow_change, created_at FROM votes ORDER BY created_at, id').all(),
    voteBallots: db.prepare('SELECT vote_id, rid, sid, name, choices, time FROM vote_ballots ORDER BY vote_id, id').all(),
    // 问卷：id 随机字符串主键原样保留，问题与回答按 survey_id 直接挂回。
    // 问题与分组的自增 id 也必须带上：回答的 answers 按题目 id 存键、题目按 section_id
    // 挂分组——不带 id 的话恢复后题目拿新号，全部历史答案的键都会指空
    surveys: db.prepare('SELECT id, title, description, deadline, closed, roster, anonymous, dedup_salt, created_at FROM surveys ORDER BY created_at, id').all(),
    surveySections: db.prepare('SELECT id, survey_id, title, description, sort_order FROM survey_sections ORDER BY survey_id, id').all(),
    surveyQuestions: db.prepare('SELECT id, survey_id, section_id, qtype, question, description, options, required, sort_order FROM survey_questions ORDER BY survey_id, id').all(),
    surveyResponses: db.prepare('SELECT survey_id, sid, name, answers, submitted_at, sid_hash FROM survey_responses ORDER BY survey_id, id').all(),
    surveyTemplates: db.prepare('SELECT id, name, title, description, questions, created_at, updated_at FROM survey_templates ORDER BY id').all(),
    rosters: db.prepare('SELECT * FROM rosters ORDER BY id').all(),
    birthdays: db.prepare('SELECT id, name, month, day, year, note, created_at FROM birthdays ORDER BY id').all(),
    funds: db.prepare('SELECT id, type, amount, note, happened_at, created_at, updated_at FROM funds ORDER BY id').all(),
    fundAttachments: db.prepare('SELECT id, fund_id, orig_name, stored_name, size, mime, created_at FROM fund_attachments ORDER BY id').all(),
    ideaCampaigns: db.prepare('SELECT * FROM idea_campaigns ORDER BY created_at, id').all(),
    guestbook: db.prepare(`SELECT id, nickname, content, likes, topic, kind, status, reply, reply_at, sid, anonymous, campaign_id, public_share, created_at
        FROM guestbook ORDER BY id`).all(),
    // 点子附件的物理文件不在 JSON 里（随 data/ 目录迁移），这里只搬记录
    ideaAttachments: db.prepare('SELECT id, idea_id, orig_name, stored_name, size, mime, created_at FROM idea_attachments ORDER BY id').all(),
    // 待审核收件箱也是数据：review 模式下攒着还没收录的群消息，只存在这一张表里
    inbox: db.prepare('SELECT id, content, sender_name, group_name, qq_gid, received_at, created_at FROM inbox ORDER BY id').all(),
    // 账号只导身份与角色，绝不导密码散列：散列跨库搬等于把密码体系一起搬走，
    // 恢复后一律回到初始密码（学号后 6 位）并要求各自改密
    users: db.prepare('SELECT sid, name, role, disabled FROM users ORDER BY sid').all(),
  };
  const body = JSON.stringify(dump, null, 2);
  const N = (k) => (Array.isArray(dump[k]) ? dump[k].length : 0);
  audit(ctx, '导出备份', '信息 ' + N('messages') + ' 条、群 ' + N('groups') + ' 个、接龙 ' + N('jielongs') + ' 个、投票 '
    + N('votes') + ' 个（选票 ' + N('voteBallots') + ' 张）、问卷 ' + N('surveys') + ' 个（分组 ' + N('surveySections') + ' 个、问题 ' + N('surveyQuestions') + ' 个、回答 ' + N('surveyResponses') + ' 份、模板 ' + N('surveyTemplates') + ' 个）、名单 ' + N('rosters') + ' 份、班费 ' + N('funds')
    + ' 条、点子/留言 ' + N('guestbook') + ' 条、征集 ' + N('ideaCampaigns') + ' 个、点子附件 ' + N('ideaAttachments')
    + ' 个、账号 ' + N('users') + ' 个，共 ' + Math.round(body.length / 1024) + ' KB');
  const res = ctx.res;
  res.wrote = true;
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="infohub-backup-${nowStr().slice(0, 10)}.json"`,
  });
  res.end(body);
});

/* ---------- 静态文件 ---------- */
function serveStatic(req, res, pathname, search) {
  // 页面按登录态放行（未登录跳 /login），登录页与静态资源始终可取
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { p = pathname; }
  if (p === '/' || p === '') p = '/index.html';
  if (p === '/quick') p = '/quick.html';
  if (p === '/login') p = '/login.html';
  if (/^\/j\/[a-z0-9]+$/i.test(p)) p = '/jielong-join.html'; // 学生接龙页，接龙 ID 由页面脚本从路径解析
  if (/^\/v\/[a-z0-9]+$/i.test(p)) p = '/vote.html'; // 学生投票页，投票 ID 由页面脚本从路径解析
  if (/^\/s\/[a-z0-9]+$/i.test(p)) p = '/survey.html'; // 学生问卷页，问卷 ID 由页面脚本从路径解析
  if (/^\/survey\/[a-z0-9]+$/i.test(p)) p = '/survey.html'; // 问卷页（完整路径）
  let fp = path.normalize(path.join(PUBLIC_DIR, p));
  if (fp !== PUBLIC_DIR && !fp.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    if (!path.extname(p)) fp = path.join(PUBLIC_DIR, 'index.html'); // 前端路由回退
    else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
  }
  const ext = path.extname(fp).toLowerCase();
  // 未登录只能看登录页：其余 HTML 页面一律先跳 /login（静态资源不跳，登录页本身要用它们）。
  // next 必须带上查询串：问卷/投票/接龙的 id 都在 ?id= 里，丢了等于登录后回到一个空页
  if (ext === '.html' && fp !== path.join(PUBLIC_DIR, 'login.html') && !canReadOk(req)) {
    res.writeHead(302, { Location: '/login?next=' + encodeURIComponent((pathname + search).slice(0, 200)) });
    res.end();
    return;
  }
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
    // 跨站写请求防线：只认浏览器自动带的 Sec-Fetch-Site 头（伪造不了，也和代理配置无关）。
    // 首版按「Origin host 必须等于 Host」判定，在反向代理/域名部署下（代理转发给 Node 的
    // Host 与浏览器 Origin 不一致）把正常登录也误杀成 403——Sec-Fetch-Site 反映的是请求
    // 发起方的真实站点关系，不存在这个问题。旧浏览器不发这个头，交由 SameSite=Lax Cookie 兜底；
    // curl / 机器人 / 快捷指令不发这个头，不受影响
    if (req.method !== 'GET' && req.method !== 'HEAD' && String(req.headers['sec-fetch-site'] || '') === 'cross-site') {
      sendJSON(res, 403, { error: '跨站请求已拒绝' });
      return;
    }
    // 访问门禁：设了管理密码或开了账号之后，全站（页面 + 查询接口）都要先登录——
    // 域名是公网可达的，未登录可读等于把通知、附件、班费、同学生日与学号发给互联网。
    // 例外只有：登录 / 登出 / 自身身份 / 健康检查，以及凭令牌接入的机器人通道（各自在接口内校验令牌）。
    const PUBLIC_API = ['/api/login', '/api/logout', '/api/me', '/api/health', '/api/ingest',
      '/api/onebot/report', '/api/onebot'];
    if (!canReadOk(req) && !PUBLIC_API.includes(norm)) {
      sendJSON(res, 401, { error: '请先登录', authRequired: true });
      return;
    }
    // 写入门禁：管理动作（增删改）默认只归管理员。班委另有一份**能力清单**（唯一出处，便于审计）：
    // 发通知与勾选完成 / 置顶、上传附件、收录与丢弃待审核、接龙与投票与抽签与问卷的全套管理
    // （发起 / 编辑 / 停止 / 删除 / 抽人 / 撤销 / 重置，问卷含模板管理）、删除留言；清单之外一律要管理员（班费、名单、账号、备份、操作记录）。
    // 这份清单只回答"能不能做这件事"；"能不能看到全班学号、匿名选票明细"另有按管理员收窄的下发脱敏，
    // 两处彼此独立——班委能管接龙投票抽签，但拿不到整班学号，也看不到匿名投票谁投给谁。
    // 接龙填写 / 投票选票 / 留言发布点赞 / 本人改密是登录用户各自的提交动作，走 SUBMIT_API 通道，
    // 各自在接口内校验身份（改密要求会话里有学号，管理员密码没有，走 config.json）。
    // 解析文本与查重只读不写库，任何登录用户都能用（班委发通知前也得查重）。
    const SUBMIT_API = /^\/api\/(jielong\/[a-z0-9]+\/join|vote\/[a-z0-9]+\/ballot|survey\/[a-z0-9]+\/submit|guestbook(\/\d+\/like)?|idea-attachments\/\d+|password)$/;
    const HELPER_API = /^\/api\/(parse|similar)$/;
    const OFFICER_WRITE = [
      /^POST \/api\/(messages|upload|vote|jielong|draw|survey|survey-template|inbox\/accept-all)$/,
      /^POST \/api\/inbox\/\d+\/accept$/,
      /^POST \/api\/messages\/\d+\/(toggle|pin)$/,
      /^POST \/api\/(vote|jielong|draw|survey)\/[a-z0-9]+\/(stop|close|go|undo|reset)$/,
      /^(PUT|DELETE) \/api\/(vote|jielong|draw|survey|survey-template)\/[a-z0-9]+$/,
      /^PUT \/api\/guestbook\/\d+$/,   // 改点子的状态 / 回复（管理员与班委）
      /^DELETE \/api\/(jielong\/[a-z0-9]+\/entry|guestbook\/\d+|inbox(\/\d+)?)$/,
    ];
    if (req.method !== 'GET' && !PUBLIC_API.includes(norm) && !SUBMIT_API.test(norm) && !HELPER_API.test(norm)
      && !authOk(req) && !(canPostOk(req) && OFFICER_WRITE.some((re) => re.test(req.method + ' ' + norm)))) {
      sendJSON(res, 401, { error: '需要管理员或班委登录', authRequired: true });
      return;
    }
    try {
      const m = matchRoute(req.method, pathname);
      if (!m) throw new HttpError(404, '接口不存在');
      const ctx = { req, res, query: u.searchParams, params: m.params };
      // 派发前先抓「对象是谁、内容摘要」：删除路由跑完原行就不在了，PUT/POST 子动作
      // （投票 ballot / 接龙 join / 留言 like）也要引用父对象的名字，只能在这时候查
      const sseg = norm.split('/');
      if (req.method !== 'GET' && sseg.length >= 4 && !AUDIT_LITERAL_SEG3.has(sseg[3])) {
        ctx.auditSubject = auditSubject(sseg[2], sseg[3]);
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        // 令牌型公开入口（ingest / onebot 上报）先初筛再读 body：令牌明确不对的请求直接 401，
        // 不必替它缓冲最多 50MB 的请求体。只对「带了令牌且确实不匹配」的请求生效；
        // OneBot 配了 secret（HMAC 模式）时不看令牌、必须读 body 验签，跳过初筛
        const ct0 = req.headers['content-type'] || '';
        if (req.method === 'POST' && (norm === '/api/ingest' || norm === '/api/onebot' || norm === '/api/onebot/report')) {
          const isOb = norm !== '/api/ingest';
          let t0 = '', tokenOk = false;
          if (isOb) {
            const obToken = CONFIG.onebot.token || CONFIG.ingestToken;
            const auth = String(req.headers.authorization || '');
            t0 = u.searchParams.get('access_token') || (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '');
            tokenOk = t0 !== '' && !CONFIG.onebot.secret && !safeEqual(t0, obToken);
          } else {
            t0 = u.searchParams.get('token') || req.headers['x-token'] || '';
            tokenOk = t0 !== '' && !safeEqual(t0, CONFIG.ingestToken) && !safeEqual(t0, CONFIG.apiToken);
          }
          if (tokenOk) { sendJSON(res, 401, { error: '令牌无效' }); return; }
        }
        const ct = ct0;
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
      // 兜底记录：成功的写请求若路由内没显式记过，就按「方法 + 资源」补一条——
      // 覆盖是结构性的，不依赖以后每个新路由都记得调用 audit()
      if (req.method !== 'GET' && !ctx.audited) auditFallback(ctx, req.method, norm);
    } catch (e) {
      if (res.wrote) return;
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      sendJSON(res, status, { error: e instanceof HttpError ? e.message : '服务器内部错误' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJSON(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  serveStatic(req, res, pathname, u.search);
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
  for (const [k, t] of sessions) if (now - t.t > SESSION_TTL) sessions.delete(k); // t 是会话对象，时间戳在 t.t（此前写成 now - t 恒 NaN，清扫是死代码）
  for (const [ip, rec] of loginFails) if (now - rec.t > 10 * 60 * 1000) loginFails.delete(ip); // 10 分钟无新失败即清
  for (const [ip, arr] of gbPosts) { const kept = arr.filter((t) => now - t < 60000); if (kept.length) gbPosts.set(ip, kept); else gbPosts.delete(ip); }
  for (const [ip, arr] of gbLikes) { const kept = arr.filter((t) => now - t < 60000); if (kept.length) gbLikes.set(ip, kept); else gbLikes.delete(ip); }
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
  log(`管理密码：  ${adminPwOn() ? '已开启（未登录只看到登录页，浏览与增删改都要先登录）' : '未设置（全站开放，可在 data/config.json 的 password 字段设置后重启）'}`);
  if (SELFTEST_TAG) log('⚠ 自检模式（INFOHUB_SELFTEST=1）：本进程写的操作记录都带 selftest 标记，自检脚本跑完会按标记删除——只用于测试，别拿它跑真实业务');
  log('关闭服务：  在本窗口按 Ctrl+C');
  // 裁剪原本只在"每写满 200 条"时顺带跑一次，低频实例（小班级、只发几条通知）可能几个月
  // 都不触发，180 天的保留上限就成了空话；启动时先扫一次
  auditPrune();
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
