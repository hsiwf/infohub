'use strict';

/*
 * 信息汇总 · 一键自检脚本
 * 用法：先启动服务（node server.js 或 start.bat），然后另开一个命令行运行  node test.js
 * 全部通过会输出 PASS 汇总；任何一项失败会输出 FAIL 并以非零码退出。
 */

const BASE = process.env.TEST_BASE || 'http://localhost:5757';
// 数据目录与服务端同一套口径：npm run selftest 会把 INFOHUB_DATA_DIR 指到临时快照，
// 这里直连库文件的地方（读基线密码、清理 selftest 标记记录）就必须跟着指向同一份。
const DATA_DIR = process.env.INFOHUB_DATA_DIR
  ? require('path').resolve(process.env.INFOHUB_DATA_DIR)
  : require('path').join(__dirname, 'data');
let passed = 0;
let failed = 0;
const created = { groups: [], messages: [], campaigns: [], surveys: [], jielongIds: [] };
let cookie = ''; // 管理员登录后的会话 Cookie
let auditBaseline = 0; // 本轮自检开始前操作记录的最大 id

function ok(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra ? ' —— ' + extra : ''}`); }
}
async function j(path, opts) {
  const o = Object.assign({}, opts);
  o.headers = Object.assign({}, (opts && opts.headers) || {});
  if (cookie) o.headers.Cookie = cookie;
  const r = await fetch(BASE + path, o);
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let body = null;
  try { body = await r.json(); } catch (e) { /* 忽略 */ }
  return { status: r.status, body, headers: r.headers };
}
const post = (path, body) => j(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
// 带会话的 fetch：读门槛之后，"测功能不是测门禁"的用例要带登录态；返回原生 Response（要读二进制与头）
const withCookie = (path, opts, ck) => fetch((path.startsWith('http') ? path : BASE + path), Object.assign({}, opts, {
  headers: Object.assign({}, (opts && opts.headers) || {}, ck ? { Cookie: ck } : {}),
}));
let userCookie = ''; // 学生账号会话（非管理员视角）
const sf = (path, opts = {}) => withCookie(path, opts, cookie);
const su = (path, opts = {}) => withCookie(path, opts, userCookie);
// 以指定学号账号登录并调接口：接龙 / 投票的提交身份来自账号，测试也得用真实账号会话
const userSess = {};
async function userSession(sid) {
  if (!userSess[sid]) {
    const r = await fetch(BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid, password: String(sid).slice(-6) }),
    });
    if (!r.ok) throw new Error('账号登录失败 ' + sid + ' → ' + r.status);
    userSess[sid] = (r.headers.get('set-cookie') || '').split(';')[0];
  }
  return userSess[sid];
}
async function upost(sid, path, body) {
  const ck = await userSession(sid);
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify(body || {}) });
  let b = null; try { b = await r.json(); } catch (e) { /* 忽略 */ }
  return { status: r.status, body: b || {} };
}
async function uput(sid, path, body) {
  const ck = await userSession(sid);
  const r = await fetch(BASE + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify(body || {}) });
  let b = null; try { b = await r.json(); } catch (e) { /* 忽略 */ }
  return { status: r.status, body: b || {} };
}
async function udel(sid, path) {
  const ck = await userSession(sid);
  const r = await fetch(BASE + path, { method: 'DELETE', headers: { Cookie: ck } });
  let b = null; try { b = await r.json(); } catch (e) { /* 忽略 */ }
  return { status: r.status, body: b || {} };
}
async function uget(sid, path) {
  const ck = await userSession(sid);
  const r = await fetch(BASE + path, { headers: { Cookie: ck } });
  let b = null; try { b = await r.json(); } catch (e) { /* 忽略 */ }
  return { status: r.status, body: b || {} };
}

(async () => {
  console.log(`\n📋 信息汇总自检（${BASE}）\n`);

  // 1. 健康
  let r = await j('/api/health');
  ok('健康检查 /api/health', r.status === 200 && r.body.ok === true);

  // 附件全量统计基线（库里可能有真实数据，后续断言只看自检带来的增量）
  // 注意：必须在登录之后取——读门槛下未登录这条会 401，基线会变成 0

  // 2. 认证状态（未设密码时应为免登录）
  r = await j('/api/me');
  ok('会话状态 /api/me', r.status === 200 && typeof r.body.authRequired === 'boolean');
  const authRequired = !!r.body.authRequired;
  let adminPw = '';
  if (authRequired) {
    // 2.5 管理密码开启时：访客只读（可浏览、写入被拒），然后用密码自动登录继续自检
    // 2.5 设了管理密码 = 全站要登录：未登录连通知都读不到，写入自然更不行
    const g1 = await fetch(BASE + '/api/messages?limit=1');
    ok('读门槛：未登录不可浏览（401）', g1.status === 401);
    const gPage = await fetch(BASE + '/', { redirect: 'manual' });
    ok('读门槛：未登录访问首页跳 /login', gPage.status === 302 && /^\/login/.test(gPage.headers.get('location') || ''), gPage.headers.get('location'));
    const gAsset = await fetch(BASE + '/login');
    ok('登录页本身对未登录开放', gAsset.status === 200);
    // 回归：未登录跳登录页时 next 必须带上查询串——问卷/投票的 id 都在 ?id= 里，
    // 此前只带 pathname，登录后回到的是一个「无效链接」空页
    const gQ = await fetch(BASE + '/survey.html?id=abc123', { redirect: 'manual' });
    ok('登录跳转的 next 保留查询串（?id= 不丢）',
      gQ.status === 302 && decodeURIComponent(gQ.headers.get('location') || '').includes('/survey.html?id=abc123'),
      gQ.headers.get('location'));
    // 回归：跨站写请求防线不能误杀代理/域名部署的登录——首版按 Origin host 比对，
    // 反向代理下（Node 收到的 Host 与浏览器 Origin 不一致）正常登录全被 403。
    // 正确做法只看浏览器自动携带、伪造不了的 Sec-Fetch-Site
    const lgProxy = await fetch(BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://hsiwf.example.com' },
      body: JSON.stringify({ password: adminPw || 'x' }),
    });
    ok('外站 Origin 不误杀登录（代理部署形态）', lgProxy.status !== 403, 'status=' + lgProxy.status);
    const lgXs = await fetch(BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      body: JSON.stringify({ password: adminPw || 'x' }),
    });
    ok('Sec-Fetch-Site=cross-site 的写请求被拒（403）', lgXs.status === 403, 'status=' + lgXs.status);
    // 回归：/api/export/ 尾斜杠曾绕过门禁泄露全量备份，路由对斜杠不敏感，门禁必须同判
    const g2s = await fetch(BASE + '/api/export/');
    ok('尾斜杠不能绕过导出门禁（401）', g2s.status === 401);
    // 名单含学生学号姓名（敏感），访客同样不可读
    const g2r = await fetch(BASE + '/api/rosters');
    ok('名单库门禁：访客不可读（401）', g2r.status === 401);
    const g2 = await fetch(BASE + '/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) });
    ok('只读门禁：访客写入被拒（401）', g2.status === 401);
    try {
      adminPw = process.env.TEST_PASSWORD || JSON.parse(require('fs').readFileSync(require('path').join(DATA_DIR, 'config.json'), 'utf8')).password || '';
    } catch (e) { /* 读不到时留空 */ }
    if (adminPw) {
      // 记下"本轮自检开始时的最后一条操作记录"：库里可能已有真实使用的记录，
      // 后面的标记与自清断言只该针对本轮写的那批，不能拿真实数据当测试对象。
      // 必须取在管理员登录之前——那条「登录成功」也是本轮写的，取晚了它就清不掉了。
      try {
        const { DatabaseSync } = require('node:sqlite');
        const bdb = new DatabaseSync(require('path').join(DATA_DIR, 'infohub.db'), { readOnly: true });
        auditBaseline = bdb.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM audit_log').get().m;
        bdb.close();
      } catch (e) { /* 读不到本地库（例如对远端服务跑自检）：退回登录后用接口取 */ }
      r = await post('/api/login', { password: adminPw });
      ok('管理员自动登录', r.status === 200 && r.body.ok === true);
      if (!auditBaseline) {
        const ah = await j('/api/audit?limit=1');
        auditBaseline = ((ah.body && ah.body.items) || [])[0] ? ah.body.items[0].id : 0;
      }
    } else {
      ok('管理员自动登录', false, '未读到 data/config.json 的 password（也可设 TEST_PASSWORD 环境变量）');
    }
    // 2.6 学生会话：读门槛之后"非管理员视角"要有真实身份，用自检名单开两个账号并登录其一
    created.rosters = created.rosters || [];
    const accRoster = await post('/api/rosters', { name: '自检账号名单', rosterRaw: '60230001 自检同学\n2023001 张三\n2023002 李四\n2023003 王五\n2023004 张三\n2023005 王五明\n60230009 赵六\n无名氏', keepId: true });
    const accRosterId = accRoster.body.id;
    if (accRosterId) created.rosters.push(accRosterId);
    r = await post('/api/users/sync', { rosterId: accRosterId });
    ok('从名单开通账号（缺学号的跳过）', r.status === 200 && r.body.created + r.body.existing === 7 && r.body.noSid.length === 1, JSON.stringify(r.body));
    created.userSids = ['60230001', '2023001', '2023002', '2023003', '2023004', '2023005', '60230009'];
    r = await post('/api/users/sync', { rosterId: accRosterId });
    ok('重复开通不覆盖已有密码', r.status === 200 && r.body.created === 0 && r.body.existing === 7, JSON.stringify(r.body));
    r = await j('/api/users');
    // 库里可能已有真实班级账号，所以只断言"这批自检账号都在、且没有任何一行带出散列"，不断总条数
    const accSids = new Set((r.body.items || []).map((u) => u.sid));
    ok('账号列表不含密码散列', r.status === 200
      && (r.body.items || []).every((u) => !('pw_hash' in u) && !('salt' in u))
      && created.userSids.every((s) => accSids.has(s)), JSON.stringify(r.body.items[0]));
    {
      const lg = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: '60230001', password: '230001' }) });
      const sc = lg.headers.get('set-cookie');
      if (sc) userCookie = sc.split(';')[0];
      ok('学生用学号 + 初始密码（学号后 6 位）登录', lg.status === 200 && !!userCookie, 'status=' + lg.status);
      const bad = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: '60230001', password: 'x' }) });
      ok('学生密码不对被拒（401）', bad.status === 401);
    }
    r = await su('/api/messages?limit=1');
    ok('学生可读通知', r.status === 200);
    r = await fetch(BASE + '/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) });
    ok('未登录写入被拒（401）', r.status === 401);
    r = await su('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) });
    ok('学生不能发信息（401）', r.status === 401);
    r = await su('/api/rosters');
    ok('学生读不到班级名单（401）', r.status === 401);
    r = await su('/api/export');
    ok('学生读不到全量备份（401）', r.status === 401);
    r = await su('/api/funds');
    ok('学生可读班费公示', r.status === 200);
  }
  const baseFiles = (await j('/api/files')).body;
  const baseV = baseFiles.totalViews != null ? baseFiles.totalViews : 0;
  const baseD = baseFiles.totalDownloads != null ? baseFiles.totalDownloads : 0;

  // 3. 群：建 → 查 → 改 → 删
  r = await post('/api/groups', { name: '自检群' });
  const gid = r.body.id;
  ok('新建群', r.status === 200 && gid > 0);
  created.groups.push(gid);
  r = await j('/api/groups?withCounts=1');
  ok('群列表带计数', r.status === 200 && r.body.items.some((g) => g.id === gid));
  r = await j('/api/groups/' + gid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '自检群改', platform: 'qq', color: '#123456' }) });
  ok('修改群', r.status === 200 && r.body.name === '自检群改');

  // 4. 信息：建 → 改 → 置顶 → 完成 → 取消
  r = await post('/api/messages', { title: '自检信息', content: '自检信息的内容包含唯一标记自检串XYZ', category: 'task', group_id: gid, sender_name: '自检员', deadline: '2030-01-01 09:00', priority: 1, tags: '自检' });
  const mid = r.body.id;
  ok('新建信息', r.status === 200 && mid > 0 && r.body.deadline === '2030-01-01 09:00');
  created.messages.push(mid);
  r = await j('/api/messages/' + mid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检信息改' }) });
  ok('修改信息', r.status === 200 && r.body.title === '自检信息改');
  r = await post('/api/messages/' + mid + '/pin');
  ok('置顶切换', r.status === 200 && r.body.pinned === 1);
  r = await post('/api/messages/' + mid + '/toggle');
  ok('标记完成', r.status === 200 && r.body.status === 'done');
  r = await post('/api/messages/' + mid + '/toggle');
  ok('取消完成', r.status === 200 && r.body.status === 'open');

  // 5. 搜索与筛选
  r = await j('/api/messages?q=' + encodeURIComponent('自检信息改') + '&category=task&status=open');
  ok('搜索+筛选', r.status === 200 && r.body.total === 1);
  r = await j('/api/messages?q=' + encodeURIComponent('100%'));
  ok('搜索通配符按字面匹配（100%）', r.status === 200 && r.body.total === 0);

  // 5.5 截止时间范围筛选（大数据量下待办/日历依赖）
  r = await post('/api/messages', { title: '自检逾期信息', content: '内容', category: 'task', deadline: '2020-01-01 09:00' });
  const odMid = r.body.id;
  created.messages.push(odMid);
  r = await j('/api/messages?status=open&sort=deadline&due=after&limit=200');
  const nowStr2 = new Date();
  const nowCmp = nowStr2.getFullYear() + '-' + String(nowStr2.getMonth() + 1).padStart(2, '0') + '-' + String(nowStr2.getDate()).padStart(2, '0') + ' ' + String(nowStr2.getHours()).padStart(2, '0') + ':' + String(nowStr2.getMinutes()).padStart(2, '0');
  ok('due=after 只含未逾期', r.status === 200 && r.body.total > 0
    && r.body.items.every((it) => it.deadline && (it.deadline.length > 10 ? it.deadline : it.deadline + ' 23:59') >= nowCmp)
    && r.body.items.every((it) => it.id !== odMid));
  r = await j('/api/messages?status=open&sort=deadline_desc&due=overdue&limit=50');
  const odItems = r.body.items || [];
  const descOk = odItems.every((it, i) => i === 0 || (odItems[i - 1].deadline || '') >= (it.deadline || ''));
  ok('due=overdue 按截止倒序只含逾期', r.status === 200 && odItems.length > 0
    && odItems.every((it) => it.deadline && (it.deadline.length > 10 ? it.deadline : it.deadline + ' 23:59') < nowCmp) && descOk);
  r = await j('/api/messages?status=open&sort=deadline_desc&due=overdue&q=' + encodeURIComponent('自检逾期'));
  ok('due=overdue 叠加搜索命中目标', r.status === 200 && r.body.total === 1 && r.body.items[0] && r.body.items[0].id === odMid);

  // 6. 附件：传 → 查 → 下一步（含安全头）→ 删
  const boundary = '----infoboundary' + Date.now();
  const fileBody = Buffer.from('test-content-自检');
  const mp = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="message_id"\r\n\r\n${mid}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="自检.txt"\r\nContent-Type: text/plain\r\n\r\n`),
    fileBody, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  r = await j('/api/upload', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body: new Uint8Array(mp) });
  const aid = r.body.ids && r.body.ids[0];
  ok('上传附件', r.status === 200 && aid > 0);
  const d = await sf(`${BASE}/api/attachments/${aid}/download`);
  const dtext = Buffer.from(await d.arrayBuffer()).toString('utf8');
  ok('下载附件内容一致', d.status === 200 && dtext.includes('test-content-自检'));
  ok('下载带 nosniff 安全头', d.headers.get('x-content-type-options') === 'nosniff');
  ok('非白名单类型强制下载', (d.headers.get('content-disposition') || '').startsWith('attachment'));
  r = await j('/api/files?q=' + encodeURIComponent('自检.txt'));
  ok('文件中心搜索', r.status === 200 && r.body.items.length === 1);

  // 6.5 附件阅读/下载计数
  const dl2 = await sf(`${BASE}/api/attachments/${aid}/download?dl=1`);
  await dl2.arrayBuffer();
  const rawRes = await sf(`${BASE}/api/attachments/${aid}/raw`);
  await rawRes.arrayBuffer();
  ok('缩略图接口对非预览类型强制下载（防内联脚本）', (rawRes.headers.get('content-disposition') || '').startsWith('attachment'));
  r = await j('/api/files?q=' + encodeURIComponent('自检.txt'));
  const fa0 = r.body.items[0] || {};
  ok('附件下载计数（强制下载 2 次，缩略图不计）', fa0.downloads === 2 && fa0.views === 0, JSON.stringify(fa0));

  // 6.55 单文件上传上限：验证服务端有 MAX_FILE_SIZE 常量与检查逻辑（不实际传大文件避免内存压力）
  {
    const srvSrc = require('fs').readFileSync(require('path').join(__dirname, 'server.js'), 'utf8');
    ok('服务端定义 MAX_FILE_SIZE 常量', /const MAX_FILE_SIZE\s*=\s*50\s*\*\s*1024\s*\*\s*1024/.test(srvSrc));
    ok('上传路由检查单文件大小', /f\.data\.length > MAX_FILE_SIZE/.test(srvSrc) && /413/.test(srvSrc));
    ok('班费凭证上传也检查单文件大小', /fund_attachments/.test(srvSrc) && /MAX_FILE_SIZE/.test(srvSrc));
  }

  // 6.6 multipart 边界与字段名解析（RFC 的分隔符是「行首 + --boundary」，正文「行中」恰好出现
  //     "--boundary" 字符串时不能被误认成边界；Content-Disposition 里 filename 排在 name 之前也要取对字段名；
  //     首边界前只用 \n 换行的客户端不能整份解析不出来）
  for (const [label, lead] of [['CRLF 起始', Buffer.alloc(0)], ['前导裸 LF', Buffer.from('\n')]]) {
    const bd = '----infoboundary' + Date.now();
    const edgeBody = Buffer.from(`第一行\r\n这一行中段有--${bd}--结尾，不是边界\r\n第三行 保留\r\n`, 'utf8');
    const mp3 = Buffer.concat([lead,
      Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="message_id"\r\n\r\n${mid}\r\n`),
      Buffer.from(`--${bd}\r\nContent-Disposition: form-data; filename="自检边界.txt"; name="files"\r\nContent-Type: text/plain\r\n\r\n`),
      edgeBody, Buffer.from(`\r\n--${bd}--\r\n`),
    ]);
    const rr = await j('/api/upload', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + bd }, body: new Uint8Array(mp3) });
    const eid = rr.body.ids && rr.body.ids[0];
    ok(`multipart ${label}：正确识别字段（filename 在 name 前）`, rr.status === 200 && eid > 0, JSON.stringify(rr.body));
    if (eid) {
      const ed = await sf(`${BASE}/api/attachments/${eid}/download`);
      const eb = Buffer.from(await ed.arrayBuffer());
      ok(`multipart ${label}：文件逐字节完整（未被行中伪边界截断）`, eb.equals(edgeBody), JSON.stringify({ got: eb.length, want: edgeBody.length }));
      await j('/api/attachments/' + eid, { method: 'DELETE' });
    }
  }

  // 图片：打开（Sec-Fetch-Dest: document）计阅读，内嵌渲染（image）不计
  const http = require('http');
  const fetchWithDest = (path2, dest) => new Promise((resolve, reject) => {
    const u = new URL(BASE);
    const req = http.get({ host: u.hostname, port: u.port || 80, path: path2, headers: Object.assign({}, dest ? { 'sec-fetch-dest': dest } : {}, cookie ? { Cookie: cookie } : {}) }, (res2) => {
      const chunks = [];
      res2.on('data', (c) => chunks.push(c));
      res2.on('end', () => resolve({ status: res2.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
  const boundary2 = '----infoboundary' + Date.now();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const mp2 = Buffer.concat([
    Buffer.from(`--${boundary2}\r\nContent-Disposition: form-data; name="message_id"\r\n\r\n${mid}\r\n`),
    Buffer.from(`--${boundary2}\r\nContent-Disposition: form-data; name="files"; filename="自检图.png"\r\nContent-Type: image/png\r\n\r\n`),
    png, Buffer.from(`\r\n--${boundary2}--\r\n`),
  ]);
  r = await j('/api/upload', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary2 }, body: new Uint8Array(mp2) });
  const pid = r.body.ids && r.body.ids[0];
  ok('上传图片附件', r.status === 200 && pid > 0);
  const openRes = await fetchWithDest(`/api/attachments/${pid}/download`, 'document');
  ok('图片内联打开（inline）', openRes.status === 200 && (openRes.body.length || 0) > 0);
  await fetchWithDest(`/api/attachments/${pid}/download`, 'image');
  r = await j('/api/files?q=' + encodeURIComponent('自检图.png'));
  const fa1 = r.body.items[0] || {};
  ok('图片打开计阅读、内嵌渲染不计', fa1.views === 1 && fa1.downloads === 0, JSON.stringify(fa1));
  const pngRaw = await sf(`${BASE}/api/attachments/${pid}/raw`);
  await pngRaw.arrayBuffer();
  ok('图片缩略图仍内联（/raw 白名单不影响位图）', pngRaw.status === 200 && (pngRaw.headers.get('content-disposition') || '').startsWith('inline'));
  // 全量统计不带筛选查（totalViews/totalDownloads 跟随当前筛选）：断言自检带来的增量
  r = await j('/api/files');
  ok('文件中心返回全量统计（增量）', r.body.totalViews === baseV + 1 && r.body.totalDownloads === baseD + 2, JSON.stringify({ v: r.body.totalViews, d: r.body.totalDownloads, baseV, baseD }));

  // 6.6 文件中心按信息完成状态过滤：默认（status=open）只看未完成信息的附件，status 缺省全部可见
  r = await j('/api/files?status=open&q=' + encodeURIComponent('自检.txt'));
  ok('文件中心 status=open：未完成信息的附件可见', r.status === 200 && r.body.items.length === 1);
  await post(`/api/messages/${mid}/toggle`); // 标记完成
  r = await j('/api/files?status=open&q=' + encodeURIComponent('自检.txt'));
  ok('已完成信息的附件不再出现在 status=open', r.body.items.length === 0);
  r = await j('/api/files?status=done&q=' + encodeURIComponent('自检.txt'));
  ok('status=done：已完成信息的附件可见且带状态', r.body.items.length === 1 && r.body.items[0].message_status === 'done');
  r = await j('/api/files?q=' + encodeURIComponent('自检.txt'));
  ok('status 缺省：全部可见（兼容旧行为）', r.body.items.length === 1);
  await post(`/api/messages/${mid}/toggle`); // 还原为未完成，不影响后续自检
  r = await j('/api/files?status=open&q=' + encodeURIComponent('自检.txt'));
  ok('还原后附件重新可见', r.body.items.length === 1);

  // 6.7 文件中心 offset 分页（配合前端「加载 / 显示更多」逐页追加）
  r = await j('/api/files?limit=1');
  const fp1 = r.body.items[0] || {};
  ok('文件中心 limit=1 探总数（含全量统计）', r.status === 200 && r.body.total >= 2 && !!fp1.id && r.body.totalViews != null);
  r = await j('/api/files?limit=1&offset=1');
  ok('文件中心 offset=1 翻到下一条且不重复', r.body.items.length === 1 && r.body.items[0].id !== fp1.id);

  // 7. 智能解析
  r = await post('/api/parse', { text: '王老师：请同学们周五下午5点前把回执交给班主任，务必完成【重要】' });
  const p = r.body.parsed || {};
  ok('智能解析（分类/截止/重要/发送人）', p.category === 'task' && !!p.deadline && p.priority === 1 && p.sender === '王老师', JSON.stringify(p));
  r = await post('/api/parse', { text: '9月20日 16:30 前提交表格' });
  ok('智能解析保留分钟（16:30）', r.status === 200 && (r.body.parsed.deadline || '').endsWith('16:30'), JSON.stringify(r.body.parsed));
  r = await post('/api/parse', { text: '明天下午4点半前交回执' });
  ok('智能解析「点半」（16:30）', r.status === 200 && (r.body.parsed.deadline || '').endsWith('16:30'), JSON.stringify(r.body.parsed));
  // 带显式年份的数字日期：年份照用（不顺延），且不能被「月/日」弱匹配抢先解析成别的月份
  for (const [txt, want] of [['2027/3/5 前交回执', '2027-03-05'], ['截止 2027-3-5', '2027-03-05'], ['2025/1/5 前完成', '2025-01-05']]) {
    r = await post('/api/parse', { text: txt });
    ok('智能解析显式年份日期 ' + txt, r.status === 200 && (r.body.parsed.deadline || '').startsWith(want), JSON.stringify(r.body.parsed));
  }

  // 7.5 相似检测与 .ics 日历
  r = await post('/api/similar', { text: '自检信息的内容包含唯一标记' });
  ok('相似信息检测', r.status === 200 && r.body.items.some((x) => x.id === mid), JSON.stringify(r.body));
  const ics = await sf(BASE + '/api/calendar.ics');
  const icsText = await ics.text();
  ok('.ics 日历导出', ics.status === 200 && icsText.includes('BEGIN:VCALENDAR') && icsText.includes('BEGIN:VEVENT'));
  ok('DTSTAMP 符合 RFC 5545（YYYYMMDDTHHMMSS）', /DTSTAMP:\d{8}T\d{6}/.test(icsText), (icsText.match(/DTSTAMP:[^\r\n]*/) || [])[0]);
  r = await j('/api/messages?limit=-1');
  const lim1 = await j('/api/messages?limit=1');
  ok('limit 负数被封底（与 limit=1 等价，SQLite 的 LIMIT -1 不限条数）', r.body.items.length === 1 && lim1.body.items.length === 1, JSON.stringify({ a: r.body.items.length, b: lim1.body.items.length }));

  // 8. 外部接入 webhook + apiToken 安全
  const cfg = (await j('/api/config')).body;
  ok('apiToken 不在 /api/config 中暴露', !cfg.apiToken, JSON.stringify(Object.keys(cfg)));
  r = await post('/api/ingest?token=' + cfg.ingestToken, { text: '张老师：下周一交自学计划表', group: '自检接入群', platform: 'wechat' });
  ok('webhook 接入+自动识别', r.status === 200 && r.body.parsed.deadline && r.body.id > 0);
  created.messages.push(r.body.id);
  r = await post('/api/ingest?token=错误令牌', { text: 'x' });
  ok('错误令牌被拒（401）', r.status === 401);
  r = await j('/api/groups?withCounts=1');
  const autoG = r.body.items.find((g) => g.name === '自检接入群');
  ok('不存在的群自动创建', !!autoG);
  if (autoG) created.groups.push(autoG.id);

  // 8.5 apiToken 轮换：旧令牌立即失效
  let r2 = await j('/api/settings/reset-token', { method: 'POST' });
  ok('管理员可重置 apiToken', r2.status === 200 && r2.body.apiToken, JSON.stringify({ status: r2.status, hasToken: !!r2.body?.apiToken }));
  const newToken = r2.body.apiToken;
  // 用新令牌测试管理接口
  r2 = await fetch(BASE + '/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': newToken }, body: JSON.stringify({ title: '自检新token信息' }) });
  ok('新 apiToken 可通行管理接口', r2.status === 200);
  if (r2.status === 200) {
    const msgId = (await r2.json()).id;
    created.messages.push(msgId);
  }

  // 9. 统计与导出
  r = await j('/api/stats');
  ok('统计数据', r.status === 200 && typeof r.body.total === 'number' && Array.isArray(r.body.upcoming));
  const ex = await j('/api/export');
  const dump = ex.body;
  ok('JSON 导出', ex.status === 200 && Array.isArray(dump.messages) && Array.isArray(dump.groups) && Array.isArray(dump.jielongs) && Array.isArray(dump.draws) && Array.isArray(dump.rosters) && Array.isArray(dump.birthdays));
  r = await post('/api/import', { groups: [], messages: [] });
  ok('有数据时导入被拒（防重复）', r.status === 400);

  // 9.5 force 导入：附件与接龙一并恢复（附件文件本身不在 JSON 中，随 data/ 目录迁移）
  // 记录导入前名单 / 生意的快照，后面只清理自检导入的行——库里有真实数据时也必须能安全跑
  const rostersBefore = ((await j('/api/rosters')).body.items || []).map((x) => x.id);
  const birthdaysBefore = ((await j('/api/birthdays')).body.items || []).map((x) => x.id);
  // 名单用当次运行唯一的名字：force 导入对同名名单是覆盖语义，撞上真实名单会改写它
  const importRosterName = '自检导入名单' + Date.now();
  const backupPayload = {
    groups: [],
    messages: [{ id: 9900, title: '导入附件测试', content: '导入附件测试内容' }],
    attachments: [{ message_id: 9900, orig_name: '导入附件测试.txt', stored_name: '202601/0123456789abcdef.txt', size: 3, mime: 'text/plain', views: 3, downloads: 5, created_at: '2030-01-01 09:00' }],
    jielongs: [{ id: 'jlimport1', title: '导入接龙测试', description: '', deadline: '2030-01-01 10:00', roster: '[{"id":"2023001","name":"张三"}]', fields: '[]', allow_outside: 1, closed: 0, admin_token: 'importtoken', created_at: 1700000000000 }],
    jielongEntries: [
      { jielong_id: 'jlimport1', rid: 0, sid: '2023001', name: '张三', values_json: '{"f0":"参加"}', remark: '', outside: 0, time: 1700000001000, seq: 0 },
      { jielong_id: '不存在的接龙', rid: null, sid: '', name: '孤儿记录', values_json: '{}', remark: '', outside: 1, time: 1700000002000, seq: 1 },
      { jielong_id: 'jlimport1', rid: null, sid: '', name: '超长记录', values_json: '{"f0":"' + '长'.repeat(6000) + '"}', remark: '', outside: 0, time: 1700000003000, seq: 2 },
    ],
    draws: [{ id: 'dwimport1', title: '导入签箱测试', roster: '[{"id":"2023001","name":"张三"}]', per_draw: 1, created_at: 1700000000000 }],
    drawRounds: [{ draw_id: 'dwimport1', picked: '[{"id":"2023001","name":"张三"}]', count: 1, time: 1700000001000 }],
    rosters: [{ name: importRosterName, roster: '张三\n李四', keep_id: 1, created_at: '', updated_at: '' }],
    birthdays: [{ name: '导入寿星', month: 3, day: 8, year: 0, note: '', created_at: '' }],
  };
  r = await post('/api/import?force=1', backupPayload);
  ok('force 导入恢复附件与接龙', r.status === 200 && r.body.attachments === 1 && r.body.jielongs === 1 && r.body.jielongEntries === 1 && r.body.draws === 1 && r.body.drawRounds === 1 && r.body.rosters === 1 && r.body.birthdays === 1, JSON.stringify(r.body));
  r = await j('/api/files?q=' + encodeURIComponent('导入附件测试.txt'));
  const impAtt = (r.body.items || [])[0] || {};
  ok('导入的附件出现在文件中心（阅读/下载计数保留）', r.status === 200 && r.body.items.length === 1 && impAtt.views === 3 && impAtt.downloads === 5, JSON.stringify(r.body));
  r = await j('/api/jielong/jlimport1');
  ok('导入的接龙可访问（含记录）', r.status === 200 && r.body.title === '导入接龙测试' && r.body.done === 1 && r.body.total === 1 && r.body.entries[0].values.f0 === '参加', JSON.stringify(r.body));
  // force 合并导入幂等：同一份备份重导一遍，接龙记录先清后插不翻倍，名单同名覆盖、生日同名同日跳过
  r = await post('/api/import?force=1', backupPayload);
  ok('force 重导同一备份幂等', r.status === 200 && r.body.jielongEntries === 1 && r.body.rosters === 1 && r.body.birthdays === 0
    && r.body.imported === 0 && r.body.attachments === 0, JSON.stringify(r.body));
  r = await j('/api/jielong/jlimport1');
  ok('重导后接龙记录仍是一条', r.status === 200 && r.body.done === 1 && r.body.entries.length === 1, JSON.stringify({ n: r.body.entries.length }));
  r = await j('/api/jielong/jlimport1?t=importtoken', { method: 'DELETE' });
  ok('导入的接龙可管理（令牌随备份恢复）', r.status === 200);
  r = await j('/api/draw/dwimport1');
  ok('导入的签箱可访问（历史保留）', r.status === 200 && r.body.total === 1 && r.body.remainingCount === 0 && r.body.roundCount === 1, JSON.stringify(r.body));
  await j('/api/draw/dwimport1', { method: 'DELETE' });
  r = await j('/api/rosters');
  ok('导入的名单进入名单库', r.status === 200 && r.body.items.some((x) => !rostersBefore.includes(x.id) && x.name === importRosterName && x.count === 2), JSON.stringify(r.body));
  // 只删自检导入的行（对比导入前快照），绝不动库里已有的名单
  for (const it of r.body.items.filter((x) => !rostersBefore.includes(x.id))) await j('/api/rosters/' + it.id, { method: 'DELETE' });
  r = await j('/api/birthdays');
  ok('导入的生日成员进入生日列表', r.status === 200 && r.body.items.some((x) => !birthdaysBefore.includes(x.id) && x.name === '导入寿星' && x.month === 3 && x.day === 8), JSON.stringify(r.body));
  for (const it of r.body.items.filter((x) => !birthdaysBefore.includes(x.id))) await j('/api/birthdays/' + it.id, { method: 'DELETE' });
  const imp = await j('/api/messages?q=' + encodeURIComponent('导入附件测试'));
  for (const it of (imp.body.items || [])) await j('/api/messages/' + it.id, { method: 'DELETE' });

  // 9.6 导入原子性：中途失败（载荷内重复的接龙 id）必须整体回滚，不残留半截数据
  // （同 ext_key 的两个群不再触发失败——force 合并导入会把它们合并成一个群，这正是要测的新语义）
  const gBefore = (await j('/api/groups')).body.items.length;
  r = await post('/api/import?force=1', {
    groups: [{ name: '回滚测试甲' }],
    messages: [{ title: '回滚测试信息' }],
    jielongs: [{ id: 'duprb1', title: '回滚接龙一' }, { id: 'duprb1', title: '回滚接龙二' }],
  });
  ok('导入中途失败返回 500', r.status === 500, JSON.stringify(r.body));
  const gAfter = (await j('/api/groups')).body.items;
  ok('导入失败整体回滚（无残留）', gAfter.length === gBefore && !gAfter.some((g) => g.name === '回滚测试甲'), JSON.stringify(r.body));
  r = await j('/api/jielong/duprb1');
  ok('回滚后失败的接龙不留残骸', r.status === 404);

  // 10. 登录接口（未设密码时随意输都放行；设了密码时用正确密码再验一次）
  r = await post('/api/login', { password: authRequired ? adminPw : 'x' });
  ok('登录接口' + (authRequired ? '（密码校验）' : '（未启用密码时不拦）'), r.status === 200);

  // 10.5 OneBot 11 上报（QQ 机器人接入；review=待审核默认 / auto=自动收录，按部署配置分支）
  const obToken = cfg.onebot && cfg.onebot.token ? cfg.onebot.token : cfg.ingestToken;
  const reviewMode = (cfg.onebot && cfg.onebot.mode) !== 'auto';
  const rep = (payload, tok) => j('/api/onebot/report?access_token=' + encodeURIComponent(tok == null ? obToken : tok),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const obPayload = {
    post_type: 'message', message_type: 'group', group_id: 987654321,
    time: Math.floor(Date.now() / 1000), self_id: 10000,
    sender: { card: '王老师', nickname: 'wang' },
    message: [{ type: 'at', data: { qq: 'all' } }, { type: 'text', data: { text: '请同学们明天下午5点前把回执交到班委，务必完成' } }],
  };
  r = await rep(obPayload);
  let acceptedMid = 0;
  if (reviewMode) {
    ok('OneBot 上报进入待审核', r.status === 200 && r.body.inbox === true && r.body.id > 0, JSON.stringify(r.body));
    const iid = r.body.id;
    r = await j('/api/inbox');
    ok('待审核列表可查', r.status === 200 && r.body.items.some((x) => x.id === iid));
    r = await post('/api/inbox/' + iid + '/accept');
    ok('审核收录→信息流（自动识别）', r.status === 200 && r.body.id > 0 && !!r.body.deadline && r.body.group_name === 'QQ群 987654321', JSON.stringify(r.body));
    acceptedMid = r.body.id;
    r = await rep(obPayload);
    ok('OneBot 重复上报去重（审核模式）', r.status === 200 && r.body.deduped === true, JSON.stringify(r.body));
    let r2 = await rep({ ...obPayload, sender: { card: '李老师', nickname: 'li' }, message: [{ type: 'text', data: { text: '待审核忽略流程测试消息，请忽略这条本身' } }] });
    r = await j('/api/inbox/' + r2.body.id, { method: 'DELETE' });
    ok('忽略待审核消息', r.status === 200 && r.body.ok === true);
    // 待审核 limit 生效且 total 为全量（角标轮询 ?limit=1 不用拉全量）
    const inboxIds = []; // 自检创建的待审核 id，最后逐条清理，绝不清空用户真实的收件箱
    r = await rep({ ...obPayload, sender: { card: '赵老师', nickname: 'z' }, message: [{ type: 'text', data: { text: '待审核分页测试甲，请同学们查收通知' } }] });
    inboxIds.push(r.body.id);
    r = await rep({ ...obPayload, sender: { card: '钱老师', nickname: 'q' }, message: [{ type: 'text', data: { text: '待审核分页测试乙，请同学们查收通知' } }] });
    inboxIds.push(r.body.id);
    r = await j('/api/inbox?limit=1');
    ok('待审核 limit 生效且 total 为全量', r.body.items.length === 1 && r.body.total >= 2 && r.body.items[0].id === inboxIds[1], JSON.stringify(r.body));
    // 超长正文截断（与手动录入同一口径 20000）
    r = await rep({ ...obPayload, sender: { card: '长文', nickname: 'c' }, message: [{ type: 'text', data: { text: '截断测试开头，请同学们查收。' + '长'.repeat(25000) } }] });
    inboxIds.push(r.body.id);
    r = await j('/api/inbox?limit=1');
    ok('OneBot 超长正文截断到 20000', (r.body.items[0].content || '').length === 20000, '实际长度 ' + (r.body.items[0] ? (r.body.items[0].content || '').length : '无'));
    // 同内容不同群：各自独立进待审核，不能跨群误判成重复
    r = await rep({ ...obPayload, group_id: 987654322 });
    ok('OneBot 同内容不同群不误判去重', r.status === 200 && r.body.inbox === true, JSON.stringify(r.body));
    inboxIds.push(r.body.id);
    // 逐条忽略自检创建的待审核消息（不清空整个收件箱，里面可能有真实待审核内容）
    let dismissed = 0;
    for (const id of inboxIds) {
      r = await j('/api/inbox/' + id, { method: 'DELETE' });
      if (r.status === 200) dismissed++;
    }
    r = await j('/api/inbox');
    ok('自检待审核逐条清理（不动真实收件箱）', dismissed === 4 && !r.body.items.some((x) => inboxIds.includes(x.id)), JSON.stringify({ dismissed }));
  } else {
    ok('OneBot 群消息上报+自动识别', r.status === 200 && r.body.ok && r.body.id > 0 && r.body.parsed && !!r.body.parsed.deadline, JSON.stringify(r.body));
    if (r.body.id) created.messages.push(r.body.id);
    r = await rep(obPayload);
    ok('OneBot 重复上报自动去重', r.status === 200 && r.body.deduped === true, JSON.stringify(r.body));
  }
  if (acceptedMid) created.messages.push(acceptedMid);
  r = await rep({ post_type: 'meta_event', meta_event_type: 'heartbeat', time: Math.floor(Date.now() / 1000), status: {} });
  ok('OneBot 心跳事件忽略', r.status === 200 && r.body.ignored === true);
  r = await rep({ post_type: 'message', message_type: 'private', user_id: 1, time: Math.floor(Date.now() / 1000), sender: { nickname: 'x' }, message: '私信内容测试' });
  ok('OneBot 私信默认不收录', r.status === 200 && r.body.ignored === true, JSON.stringify(r.body));
  r = await rep({ post_type: 'message', message_type: 'group', group_id: 987654321, time: Math.floor(Date.now() / 1000), sender: { nickname: 'bot' }, message: [{ type: 'image', data: { file: 'a.jpg', url: 'http://x/a.jpg' } }] });
  ok('OneBot 纯图片消息不收录', r.status === 200 && r.body.ignored === true, JSON.stringify(r.body));
  r = await rep({ post_type: 'message', message_type: 'group', group_id: 987654321, time: Math.floor(Date.now() / 1000), sender: { nickname: '同学甲' }, message: '收到' });
  ok('OneBot 水言“收到”被防闲聊过滤', r.status === 200 && r.body.ignored === true && !!r.body.reason, JSON.stringify(r.body));
  r = await rep(obPayload, 'wrong-token');
  ok('OneBot 错误令牌被拒（401）', r.status === 401);
  // 管理令牌与投递令牌分离：ingestToken 不再能通行管理接口，apiToken 可以（两者都能投递通知）
  if (authRequired) {
    const r1 = await fetch(BASE + '/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': cfg.ingestToken }, body: JSON.stringify({ title: 'x' }) });
    ok('投递令牌不再通行管理接口（401）', r1.status === 401);
    // 用重置后的新 apiToken 测试（cfg.apiToken 已在 8.5 节被轮换失效）
    const r2 = await fetch(BASE + '/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': newToken }, body: JSON.stringify({ title: '自检apitoken信息' }) });
    const r2j = await r2.json();
    ok('新 apiToken 可通行管理接口', r2.status === 200 && r2j.id > 0);
    if (r2j.id) created.messages.push(r2j.id);
  }
  r = await j('/api/groups?withCounts=1');
  const obG = r.body.items.find((g) => g.name === 'QQ群 987654321');
  ok('OneBot 上报自动建群（QQ 平台）', !!obG && obG.platform === 'qq');
  if (obG) created.groups.push(obG.id);

  // 11. 静态页面
  for (const p2 of ['/', '/quick', '/css/style.css', '/js/app.js', '/icon.svg', '/manifest.webmanifest', '/sw.js']) {
    const s = await fetch(BASE + p2);
    ok('静态资源 ' + p2, s.status === 200);
  }
  const pageHome = await sf(BASE + '/');
  ok('页面带 X-Frame-Options / Referrer-Policy', pageHome.headers.get('x-frame-options') === 'DENY' && pageHome.headers.get('referrer-policy') === 'same-origin');
  const badseg = await sf(BASE + '/api/messages/xx%zz');
  ok('畸形路由参数返回 400（非 500）', badseg.status === 400);
  const lh = await fetch(BASE + '/login');
  ok('登录页可访问', lh.status === 200);
  r = await fetch(BASE + '/j/dut9dtk', { redirect: 'manual' });
  ok('学生接龙页需登录（跳登录页）', r.status === 302 && /^\/login/.test(r.headers.get('location') || ''), r.headers.get('location'));
  r = await fetch(BASE + '/js/qrcode.min.js');
  ok('二维码组件可加载', r.status === 200);

  // 12. 班级接龙（名单解析 / 账号身份 / 进度 / CSV）
  r = await post('/api/jielong', {
    title: '自检接龙', description: '自检用接龙',
    rosterRaw: '2023001 张三\n2023002 李四\n2023003 王五\n2023004 张三', keepId: true,
    deadline: '2030-01-01 18:00', allowOutside: true,
    fields: [{ label: '是否参加', type: 'select', required: true, options: ['参加', '不参加'] }],
  });
  const jl = r.body || {};
  ok('发起接龙（名单解析出学号，不再发管理令牌）', r.status === 200 && /^[a-z0-9]{7}$/.test(jl.id || '') && r.body.adminToken === undefined, JSON.stringify(r.body));
  if (authRequired) {
    const g4 = await fetch(BASE + '/api/jielong', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) });
    ok('未登录发起接龙被拒（401）', g4.status === 401);
  }
  r = await j('/api/jielong');
  ok('接龙列表带进度', r.status === 200 && r.body.items.some((x) => x.id === jl.id && x.total === 4), JSON.stringify(r.body));
  {
    const g7 = await uget('2023001', '/api/jielong/' + jl.id);
    ok('学生可看接龙详情与名单', g7.status === 200 && g7.body.roster.length === 4 && g7.body.missing.length === 4, JSON.stringify(g7.body).slice(0, 80));
    const peek = await uget('2023001', '/api/jielong/' + jl.id + '/export');
    ok('学生不能导出接龙 CSV（401）', peek.status === 401, 'status=' + peek.status);
  }
  r = await upost('2023001', `/api/jielong/${jl.id}/join`, { values: { f0: '参加' }, remark: '自检' });
  ok('账号提交：按学号定位槽位', r.status === 200 && r.body.entry.rid === 0 && r.body.entry.id === '2023001' && r.body.done === 1, JSON.stringify(r.body));
  r = await upost('2023004', `/api/jielong/${jl.id}/join`, { values: { f0: '不参加' } });
  ok('同名同学按各自学号各占一个槽位', r.status === 200 && r.body.entry.rid === 3 && r.body.entry.id === '2023004', JSON.stringify(r.body));
  r = await upost('2023001', `/api/jielong/${jl.id}/join`, { values: { f0: '不参加' } });
  ok('同一账号重复提交=覆盖不新增', r.status === 200 && r.body.updated === true && r.body.count === 2, JSON.stringify(r.body));
  r = await j('/api/jielong/' + jl.id);
  ok('覆盖后名单次序不变', r.body.entries[0].name === '张三' && r.body.entries[0].id === '2023001' && r.body.entries[0].values.f0 === '不参加', JSON.stringify(r.body.entries.map((e) => e.name)));
  r = await upost('60230009', `/api/jielong/${jl.id}/join`, { values: { f0: '参加' } });
  ok('名单外账号可参与（allowOutside）', r.status === 200 && r.body.entry.rid === null && r.body.done === 2, JSON.stringify(r.body));
  r = await upost('2023002', `/api/jielong/${jl.id}/join`, { values: { f0: '参加' }, remark: '=1+1' });
  ok('其余账号提交', r.status === 200 && r.body.entry.rid === 1 && r.body.entry.name === '李四', JSON.stringify(r.body));
  r = await j('/api/jielong/' + jl.id);
  ok('进度与未接名单', r.body.done === 3 && r.body.total === 4 && r.body.missing.length === 1 && r.body.missing[0].name === '王五', JSON.stringify(r.body.missing));
  r = await upost('2023003', `/api/jielong/${jl.id}/join`, { values: {} });
  ok('必填项缺失被拒', r.status === 400);
  r = await upost('2023003', `/api/jielong/${jl.id}/join`, { values: { f0: '绕过下拉的任意文本' } });
  ok('单选项只接受预设选项值（400）', r.status === 400, JSON.stringify(r.body));
  const csvRes = await sf(`${BASE}/api/jielong/${jl.id}/export`);
  const csvBuf = await csvRes.arrayBuffer();
  const csvBytes = new Uint8Array(csvBuf);
  const csvText = new TextDecoder('utf-8').decode(csvBuf);
  ok('CSV 导出（BOM+已接+未接+公式中和）', csvRes.status === 200
    && (csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF)
    && csvText.includes('张三') && csvText.includes('未接龙') && csvText.includes("'=1+1"), csvText.slice(0, 80));
  r = await j(`/api/jielong/${jl.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterRaw: '2023001 张三\n2023002 李四\n2023003 王五明\n2023004 张三', keepId: true }) });
  ok('编辑名单', r.status === 200 && r.body.roster.length === 4);
  r = await j('/api/jielong/' + jl.id);
  ok('已接记录按学号保持匹配（改名不错位）', r.body.done === 3 && r.body.missing.length === 1 && r.body.missing[0].name === '王五明', JSON.stringify(r.body.missing));
  r = await j(`/api/jielong/${jl.id}/entry?rid=0`, { method: 'DELETE' });
  ok('删除单条记录', r.status === 200);
  r = await j('/api/jielong/' + jl.id);
  ok('删除后未接名单更新', r.body.done === 2 && r.body.missing.some((m) => m.name === '张三'));
  r = await post(`/api/jielong/${jl.id}/close`, { closed: true });
  ok('停止接龙', r.status === 200 && r.body.closed === true);
  r = await upost('2023003', `/api/jielong/${jl.id}/join`, { values: { f0: '参加' } });
  ok('停止后提交被拒', r.status === 400);
  r = await j(`/api/jielong/${jl.id}`, { method: 'DELETE' });
  ok('删除整个接龙', r.status === 200);
  r = await j('/api/jielong/' + jl.id);
  ok('删除后详情 404', r.status === 404);
  // 纯日期截止时间按当天 23:59 判定（与信息中心 DEADLINE_EXPR 同口径）：已过的纯日期即自动截止
  r = await post('/api/jielong', { title: '自检日期截止接龙', deadline: '2020-01-01' });
  const jlDate = r.body.id;
  r = await upost('2023001', `/api/jielong/${jlDate}/join`, { values: {} });
  ok('接龙纯日期截止视为当天23:59（已过期拒绝提交）', r.status === 400, JSON.stringify(r.body));
  await j('/api/jielong/' + jlDate, { method: 'DELETE' });

  // 13. 抽签（名单轮抽：抽过的人下次不再被抽到，抽空自动开新一轮）
  r = await post('/api/draw', { title: '自检签箱', rosterRaw: '2023001 张三\n2. 李四\n王五\n赵六', keepId: true, perDraw: 2 });
  const dw = r.body || {};
  ok('新建签箱（名单解析出学号）', r.status === 200 && /^[a-z0-9]{7}$/.test(dw.id || ''), JSON.stringify(r.body));
  if (authRequired) {
    const g8 = await fetch(BASE + '/api/draw/' + dw.id + '/go', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 2 }) });
    ok('访客抽签被拒（401）', g8.status === 401);
  }
  r = await j('/api/draw/' + dw.id);
  ok('签箱详情', r.status === 200 && r.body.total === 4 && r.body.remainingCount === 4 && r.body.roundCount === 0, JSON.stringify(r.body));
  r = await post(`/api/draw/${dw.id}/go`, { count: 3 });
  ok('自定义人数抽签（3 人）', r.status === 200 && r.body.count === 3 && r.body.remainingCount === 1 && r.body.picked.length === 3, JSON.stringify(r.body));
  r = await post(`/api/draw/${dw.id}/go`, {});
  ok('剩余不足时抽走剩余（1 人）', r.status === 200 && r.body.count === 1 && r.body.remainingCount === 0);
  r = await post(`/api/draw/${dw.id}/go`, {});
  ok('抽空后自动开新一轮（默认 2 人）', r.status === 200 && r.body.reset === true && r.body.count === 2 && r.body.remainingCount === 2, JSON.stringify(r.body));
  r = await post(`/api/draw/${dw.id}/undo`, {});
  ok('撤销上一轮（全员重新可抽）', r.status === 200 && r.body.remainingCount === 4, JSON.stringify(r.body));
  r = await post(`/api/draw/${dw.id}/go`, { count: 1 });
  ok('默认人数兜底（count 缺省）', r.status === 200 && r.body.count === 1, JSON.stringify(r.body));
  r = await post(`/api/draw/${dw.id}/go`, { count: 1 });
  r = await j('/api/draw/' + dw.id);
  ok('抽过的人不再被抽到', r.body.remainingCount === 2 && r.body.roundCount === 2, JSON.stringify({ remaining: r.body.remainingCount, rounds: r.body.roundCount }));
  r = await post(`/api/draw/${dw.id}/reset`, {});
  ok('重置签箱', r.status === 200 && r.body.remainingCount === 4);
  r = await post(`/api/draw/${dw.id}/go`, { count: 4 });
  ok('一次抽走全部（4 人）', r.status === 200 && r.body.count === 4 && r.body.remainingCount === 0, JSON.stringify(r.body));
  // 名单改名（张三→张三明，学号不变）：已抽状态应按学号保持，不会再次被抽到
  r = await j(`/api/draw/${dw.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检签箱改', perDraw: 3, rosterRaw: '2023001 张三明\n2. 李四\n王五\n赵六', keepId: true }) });
  ok('编辑签箱', r.status === 200 && r.body.title === '自检签箱改' && r.body.perDraw === 3);
  r = await j('/api/draw/' + dw.id);
  ok('改名后按学号保持已抽状态', r.body.remainingCount === 0, JSON.stringify(r.body.remaining));
  // 学号 = 登录名、初始密码 = 学号后 6 位，所以整班学号外泄等于交出账号接管链：
  // 抽签详情此前只有接龙和投票做了脱敏，签箱这条 GET 忘了——同学一枚举 id 就能拿全班学号
  const asStudent = await uget('2023001', '/api/draw/' + dw.id);
  ok('抽签详情对同学不泄露学号（名单 / 剩余 / 历史都只剩姓名）',
    asStudent.status === 200 && asStudent.body.roster.length === 4
    && asStudent.body.roster.every((x) => !('id' in x) && x.name)
    && asStudent.body.remaining.every((x) => !('id' in x))
    && asStudent.body.rounds.every((r2) => r2.picked.every((x) => !('id' in x))),
    JSON.stringify({ roster: asStudent.body.roster[0], picked: asStudent.body.rounds[0] && asStudent.body.rounds[0].picked[0] }));
  const asAdmin2 = await j('/api/draw/' + dw.id);
  ok('管理员看签箱仍带学号（编辑签箱与按学号判重要用）', asAdmin2.body.roster.some((x) => x.id === '2023001'),
    JSON.stringify(asAdmin2.body.roster[0]));
  r = await j('/api/draw/' + dw.id, { method: 'DELETE' });
  ok('删除签箱', r.status === 200);
  r = await j('/api/draw/' + dw.id);
  ok('删除后详情 404', r.status === 404);

  // 14. 班级名单库（名单存一份，创建接龙 / 签箱时复用）
  r = await post('/api/rosters', { name: '自检名单', rosterRaw: '2023001 张三\n李四', keepId: true });
  const rid1 = r.body.id;
  ok('保存名单到名单库', r.status === 200 && rid1 > 0, JSON.stringify(r.body));
  if (authRequired) {
    const g9 = await fetch(BASE + '/api/rosters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', rosterRaw: 'y' }) });
    ok('访客保存名单被拒（401）', g9.status === 401);
  }
  r = await post('/api/rosters', { name: '自检名单', rosterRaw: '2023001 张三\n李四\n王五', keepId: true });
  ok('同名保存覆盖不重复', r.status === 200 && r.body.updated === true && r.body.id === rid1);
  r = await j('/api/rosters');
  let mineRoster = r.body.items.find((x) => x.id === rid1);
  ok('名单库列表（含解析人数）', r.status === 200 && mineRoster && mineRoster.count === 3 && mineRoster.keepId === true, JSON.stringify(r.body));
  r = await j('/api/rosters/' + rid1, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '自检名单改', rosterRaw: '2023001 张三\n李四\n王五\n赵六', keepId: true }) });
  ok('编辑名单（改名 + 改内容）', r.status === 200 && r.body.ok === true);
  r = await j('/api/rosters');
  mineRoster = r.body.items.find((x) => x.id === rid1);
  ok('编辑后名单生效（4 人，旧名不存在）', !!mineRoster && mineRoster.count === 4 && r.body.items.every((x) => x.name !== '自检名单'), JSON.stringify(r.body));
  r = await post('/api/jielong', { title: '名单库接龙', rosterRaw: mineRoster.roster, keepId: mineRoster.keepId });
  ok('用保存的名单发起接龙', r.status === 200 && /^[a-z0-9]{7}$/.test(r.body.id || ''), JSON.stringify(r.body));
  await j('/api/jielong/' + r.body.id, { method: 'DELETE' });
  r = await post('/api/draw', { title: '名单库签箱', rosterRaw: '2023001 张三\n李四\n王五', keepId: true, perDraw: 2 });
  await j('/api/draw/' + r.body.id, { method: 'DELETE' });
  r = await j('/api/rosters/' + rid1, { method: 'DELETE' });
  ok('删除名单', r.status === 200);
  r = await j('/api/rosters');
  ok('删除后名单查不到', r.status === 200 && !r.body.items.some((x) => x.id === rid1));

  // 15. 班级生日（倒计时 / 当天祝福 / 名单导入）
  const pad2t = (n) => String(n).padStart(2, '0');
  const plus5 = new Date(Date.now() + 5 * 86400000);
  const in5m = plus5.getMonth() + 1, in5d = plus5.getDate();
  const nowD = new Date();
  const todayMm = nowD.getMonth() + 1, todayDd = nowD.getDate();
  r = await post('/api/birthdays', { name: '自检寿星', month: in5m, day: in5d, year: 2010, note: '自检祝福语' });
  const bdId = r.body.id;
  const expAge = Number(r.body.nextDate.slice(0, 4)) - 2010;
  ok('添加生日成员（5 天后倒计时 + 年龄）', r.status === 200 && r.body.daysUntil === 5 && r.body.turningAge === expAge && r.body.note === '自检祝福语', JSON.stringify(r.body));
  r = await post('/api/birthdays', { name: '今天寿星', month: todayMm, day: todayDd });
  ok('添加今天生日成员', r.status === 200 && r.body.isToday === true && r.body.daysUntil === 0, JSON.stringify(r.body));
  const bdToday = r.body.id;
  r = await post('/api/birthdays', { name: '无效日期', month: 2, day: 30 });
  ok('无效日期被拒（2 月 30 日）', r.status === 400);
  r = await post('/api/birthdays', { name: '无效日期', month: 13, day: 1 });
  ok('无效月份被拒（13 月）', r.status === 400);
  r = await post('/api/birthdays', { name: '闰日同学', month: 2, day: 29 });
  const bdLeap = r.body.id;
  ok('2 月 29 日可保存', r.status === 200 && /^(\d{4})-02-(28|29)$/.test(r.body.nextDate), JSON.stringify(r.body));
  r = await j('/api/birthdays');
  ok('生日列表按倒计时排序（今天在前）', r.status === 200 && r.body.items[0] && r.body.items[0].isToday === true && r.body.items.some((x) => x.id === bdToday && x.isToday === true), JSON.stringify(r.body.today));
  if (authRequired) {
    const g10 = await fetch(BASE + '/api/birthdays', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', month: 1, day: 1 }) });
    ok('访客添加生日成员被拒（401）', g10.status === 401);
  }
  r = await j('/api/birthdays/' + bdId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '自检寿星改' }) });
  ok('编辑生日成员', r.status === 200 && r.body.name === '自检寿星改');
  // 名单库导入生日成员
  r = await post('/api/rosters', { name: '生日导入名单', rosterRaw: '导入同学甲\n导入同学乙', keepId: false });
  const ridBd = r.body.id;
  r = await post('/api/birthdays/import', { rosterId: ridBd });
  ok('从名单库导入生日成员', r.status === 200 && r.body.created === 2 && r.body.skipped === 0, JSON.stringify(r.body));
  r = await post('/api/birthdays/import', { rosterId: ridBd });
  ok('重复导入自动跳过', r.status === 200 && r.body.created === 0 && r.body.skipped === 2, JSON.stringify(r.body));
  r = await j('/api/birthdays');
  const pend = r.body.items.filter((x) => x.name === '导入同学甲' || x.name === '导入同学乙');
  const pendingOk = pend.length === 2 && pend.every((x) => x.pending && x.daysUntil === null);
  ok('未填生日的成员排在末尾且标记待填', pendingOk, JSON.stringify(r.body.items.filter((x) => x.pending)));
  await j('/api/rosters/' + ridBd, { method: 'DELETE' });
  r = await j('/api/birthdays');
  // 只删自检新建的成员（对比测试前快照），不动库里已有的生日
  for (const it of r.body.items.filter((x) => !birthdaysBefore.includes(x.id))) await j('/api/birthdays/' + it.id, { method: 'DELETE' });
  r = await j('/api/birthdays');
  ok('生日自检数据清理完成', r.status === 200 && r.body.items.every((x) => birthdaysBefore.includes(x.id)));

  // 15.5 投票表决（资格名单按学号 / 匿名可选 / 一人一票按账号）
  r = await post('/api/rosters', { name: '自检投票名单', rosterRaw: '2023001 张三\n2023002 李四\n2023003 王五', keepId: true });
  const voteRosterId = r.body.id;
  created.rosters.push(voteRosterId);
  r = await post('/api/vote', { title: '自检匿名投票', optionsRaw: '赞成\n反对\n弃权', maxSelect: 2, anonymous: true, rosterId: voteRosterId });
  const vid = r.body.id;
  ok('发起匿名投票（不再下发管理令牌）', r.status === 200 && !!vid && r.body.adminToken === undefined, JSON.stringify(r.body));
  r = await upost('60230009', `/api/vote/${vid}/ballot`, { choices: ['o0'] });
  ok('名单外账号投票被拒（403）', r.status === 403, JSON.stringify(r.body));
  r = await upost('2023001', `/api/vote/${vid}/ballot`, { choices: ['o0', 'o1'] });
  ok('名单内账号投票成功（最多可选 2 项）', r.status === 200 && r.body.rid === 0, JSON.stringify(r.body));
  r = await upost('2023001', `/api/vote/${vid}/ballot`, { choices: ['o2'] });
  ok('同一账号重复提交覆盖为一票（改票）', r.status === 200 && r.body.updated === true, JSON.stringify(r.body));
  r = await uget('2023001', `/api/vote/${vid}`);
  ok('学生会话看匿名投票：有票数、无他人明细与名单', r.status === 200 && Array.isArray(r.body.tally)
    && r.body.ballots === undefined && r.body.roster === undefined, JSON.stringify(Object.keys(r.body)));
  ok('本人已投状态与选票回传（不再靠 localStorage）', r.body.voted === true && r.body.myVote && r.body.myVote.choices[0] === 'o2', JSON.stringify(r.body.myVote));
  r = await j(`/api/vote/${vid}`);
  ok('管理员可查匿名明细与完成统计', Array.isArray(r.body.ballots) && r.body.ballots.length === 1
    && r.body.missing.length === 2 && r.body.ballots[0].sid === '2023001', JSON.stringify(r.body.ballots));
  r = await upost('2023002', `/api/vote/${vid}/ballot`, { choices: [] });
  ok('弃权（空选）计入已投不计入票数', r.status === 200);
  r = await j(`/api/vote/${vid}`);
  ok('完成数与票数口径一致', r.body.done === 2 && r.body.tally.reduce((s, t) => s + t.votes, 0) === 1, JSON.stringify(r.body.tally));
  r = await upost('2023003', `/api/vote/${vid}/ballot`, { choices: ['o0', 'o1', 'o2'] });
  ok('超过最多可选被拒（400）', r.status === 400);
  r = await j(`/api/vote/${vid}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检匿名投票改', deadline: '2030-01-02 10:00' }) });
  ok('编辑投票（标题 / 截止时间）', r.status === 200, JSON.stringify(r.body));
  r = await j(`/api/vote/${vid}`);
  ok('编辑后标题与截止生效', r.body.title === '自检匿名投票改' && r.body.deadline === '2030-01-02 10:00', JSON.stringify(r.body).slice(0, 80));
  r = await upost('2023003', `/api/vote/${vid}/ballot`, { choices: ['o0'] });
  ok('第三名账号投票', r.status === 200 && r.body.rid === 2, JSON.stringify(r.body));
  r = await post(`/api/vote/${vid}/stop`, {});
  ok('停止投票', r.status === 200);
  r = await upost('2023003', `/api/vote/${vid}/ballot`, { choices: ['o1'] });
  ok('停止后不能再投（400）', r.status === 400);
  r = await j(`/api/vote/${vid}`, { method: 'DELETE' });
  ok('删除投票（选票一并清理）', r.status === 200);
  r = await j('/api/vote/' + vid);
  ok('删除后详情 404', r.status === 404);
  await j('/api/rosters/' + voteRosterId, { method: 'DELETE' });

  // 15.55 结果可见时机（always / after_vote / after_close）与是否允许改票
  r = await post('/api/vote', { title: '可见性投票', optionsRaw: '赞成\n反对\n弃权', rosterRaw: '2023001 张三\n2023002 李四', keepId: true, reveal: 'after_close', allowChange: false });
  const vidV = r.body.id;
  ok('创建投票带可见性 / 改票设置', r.status === 200 && !!vidV, JSON.stringify(r.body));
  r = await j(`/api/vote/${vidV}`);
  ok('系统管理员始终可见票数且返回 reveal / allowChange', Array.isArray(r.body.tally) && r.body.reveal === 'after_close' && r.body.allowChange === false);
  {
    const g = await uget('2023001', `/api/vote/${vidV}`);
    ok('after_close：未结束时学生看不到票数', g.body.tallyHidden === true && g.body.tally === undefined, JSON.stringify(g.body).slice(0, 90));
    const b1 = await upost('2023001', `/api/vote/${vidV}/ballot`, { choices: ['o0'] });
    ok('首次投票成功并回本人槽位', b1.status === 200 && b1.body.rid === 0, JSON.stringify(b1.body));
    const b2 = await upost('2023001', `/api/vote/${vidV}/ballot`, { choices: ['o1'] });
    ok('禁止改票：已投者重复提交被拒（409）', b2.status === 409, 'status=' + b2.status);
    const g2 = await uget('2023001', `/api/vote/${vidV}`);
    ok('被拒的改票没有动原选票', g2.body.voted === true && g2.body.myVote.choices[0] === 'o0', JSON.stringify(g2.body.myVote));
    const gm = await j(`/api/vote/${vidV}`);
    ok('管理员不受改票开关限制', (await j(`/api/vote/${vidV}/stop`, { method: 'POST' })).status === 200 && Array.isArray(gm.body.tally));
    const gClosed = await uget('2023002', `/api/vote/${vidV}`);
    ok('停止后票数对全班公开', gClosed.body.closed === true && Array.isArray(gClosed.body.tally));
  }
  r = await post('/api/vote', { title: '投票后可见', optionsRaw: 'A\nB', rosterRaw: '2023001 张三\n2023002 李四', keepId: true, reveal: 'after_vote' });
  const vidW = r.body.id;
  {
    const g0 = await uget('2023001', `/api/vote/${vidW}`);
    ok('after_vote：没投时看不到票数', g0.body.tallyHidden === true);
    await upost('2023001', `/api/vote/${vidW}/ballot`, { choices: ['o0'] });
    const g1 = await uget('2023001', `/api/vote/${vidW}`);
    ok('after_vote：本人投过即可见票数', Array.isArray(g1.body.tally) && g1.body.tallyHidden !== true, JSON.stringify(g1.body.tally));
    const g2 = await uget('2023002', `/api/vote/${vidW}`);
    ok('after_vote：没投的人仍看不到（按会话判定，猜槽位无效）', g2.body.tallyHidden === true && g2.body.tally === undefined);
    const gAdmin = await j(`/api/vote/${vidW}/ballot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choices: ['o0'] }) });
    ok('管理员密码无学号身份，不能代投（400）', gAdmin.status === 400, JSON.stringify(gAdmin.body));
  }
  await j(`/api/vote/${vidW}`, { method: 'DELETE' });
  await j(`/api/vote/${vidV}`, { method: 'DELETE' });

  // 15.56 编辑：追加选项 / 追加投票人（只增不改，不动已有选票指向）
  r = await post('/api/vote', { title: '追加测试', optionsRaw: 'A\nB', rosterRaw: '2023001 张三\n2023002 李四', keepId: true });
  const vidA = r.body.id;
  await upost('2023001', `/api/vote/${vidA}/ballot`, { choices: ['o0'] });
  r = await j(`/api/vote/${vidA}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionsAppend: 'C\nD', rosterAppendRaw: '2023003 王五', rosterAppendKeepId: true, reveal: 'after_close', allowChange: false }) });
  ok('编辑追加选项 / 名单 / 改可见性', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
  r = await j(`/api/vote/${vidA}`);
  ok('追加后选项含新 key 且旧票不丢', r.body.options.length === 4 && r.body.options[2].key === 'o2' && r.body.options[3].key === 'o3'
    && r.body.done === 1 && r.body.tally.find((t) => t.key === 'o0').votes === 1, JSON.stringify({ opts: r.body.options.map((o) => o.key), done: r.body.done }));
  ok('追加后名单 3 人、未投 2 人', r.body.roster.length === 3 && (r.body.missing || []).length === 2, JSON.stringify({ roster: r.body.roster.length, missing: (r.body.missing || []).length }));
  ok('编辑改了 reveal / allow_change', r.body.reveal === 'after_close' && r.body.allowChange === false);
  r = await upost('2023003', `/api/vote/${vidA}/ballot`, { choices: ['o2'] });
  ok('追加进来的成员可投票（新选项也生效）', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
  r = await j(`/api/vote/${vidA}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterAppendRaw: '2023003 王五', keepId: true }) });
  r = await j(`/api/vote/${vidA}`);
  ok('重复追加名单去重', r.body.roster.length === 3, 'roster=' + r.body.roster.length);
  await j(`/api/vote/${vidA}`, { method: 'DELETE' });

  // 15.57 同名同学：身份按学号，姓名重名不再影响定位与计票
  r = await post('/api/vote', { title: '同名投票', optionsRaw: '赞成\n反对', rosterRaw: '2023001 张三\n2023004 张三', keepId: true });
  const vidT = r.body.id;
  await upost('2023001', `/api/vote/${vidT}/ballot`, { choices: ['o0'] });
  await upost('2023004', `/api/vote/${vidT}/ballot`, { choices: ['o1'] });
  r = await j(`/api/vote/${vidT}`);
  ok('同名两人各占一个槽位、各算一票', r.body.done === 2
    && r.body.ballots.some((x) => x.rid === 0 && x.sid === '2023001') && r.body.ballots.some((x) => x.rid === 1 && x.sid === '2023004'), JSON.stringify(r.body.ballots));
  await j(`/api/vote/${vidT}`, { method: 'DELETE' });

  // 15.58 记名投票明细：学号只给管理员；结果未到可见时机时明细整体不下发
  r = await post('/api/vote', { title: '记名明细', optionsRaw: '赞成\n反对', anonymous: false, rosterRaw: '2023001 张三\n2023002 李四', keepId: true, reveal: 'after_close' });
  const vidL = r.body.id;
  await upost('2023001', `/api/vote/${vidL}/ballot`, { choices: ['o0'] });
  {
    const g = await uget('2023002', `/api/vote/${vidL}`);
    ok('结果未可见时学生拿不到选票明细', g.body.tallyHidden === true && g.body.ballots === undefined, JSON.stringify(Object.keys(g.body)));
    const gm = await j(`/api/vote/${vidL}`);
    ok('管理员视角明细含学号（核对冒票用）', Array.isArray(gm.body.ballots) && gm.body.ballots[0].sid === '2023001', JSON.stringify(gm.body.ballots));
    await post(`/api/vote/${vidL}/stop`, {});
    const g2 = await uget('2023002', `/api/vote/${vidL}`);
    ok('结束后学生可见记名明细，但明细里没有学号', Array.isArray(g2.body.ballots) && g2.body.ballots.length === 1 && !('sid' in g2.body.ballots[0]), JSON.stringify(g2.body.ballots));
    ok('学生始终拿不到资格名单（只有人数）', g2.body.roster === undefined && g2.body.rosterSize === 2);
  }
  await j(`/api/vote/${vidL}`, { method: 'DELETE' });

  // 15.59 名单没学号 = 谁都投不了的死票，发起与追加时就要拦住
  r = await post('/api/vote', { title: '死票拦截', optionsRaw: '赞成\n反对', rosterRaw: '张三\n李四' });
  ok('名单无学号 → 拒绝发起（400）', r.status === 400, JSON.stringify(r.body));
  if (r.body && r.body.id) await j('/api/vote/' + r.body.id, { method: 'DELETE' });
  r = await post('/api/vote', { title: '死票拦截2', optionsRaw: '赞成\n反对', keepId: true, rosterRaw: '2023001 张三\n李四' });
  ok('部分成员缺学号也拒绝发起（400）', r.status === 400, JSON.stringify(r.body));
  if (r.body && r.body.id) await j('/api/vote/' + r.body.id, { method: 'DELETE' });
  r = await post('/api/vote', { title: '死票拦截3', optionsRaw: '赞成\n反对', keepId: true, rosterRaw: '2023001 张三\n2023002 李四' });
  const vidNoId = r.body.id;
  r = await j(`/api/vote/${vidNoId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterAppendRaw: '王五' }) });
  ok('追加无学号成员 → 拒绝（400）', r.status === 400, JSON.stringify(r.body));
  r = await j(`/api/vote/${vidNoId}`);
  ok('被拒绝的追加没有改动名单', r.status === 200 && r.body.roster.length === 2, JSON.stringify(r.body.roster));
  await j(`/api/vote/${vidNoId}`, { method: 'DELETE' });

  // 学生页契约金丝雀：身份来自登录账号，页面不再自报姓名 / 学号 / 豁免标记
  {
    const votePageSrc = require('fs').readFileSync(require('path').join(__dirname, 'public', 'vote.html'), 'utf8');
    ok('学生页不再自报身份（无姓名/学号输入框、无 via 豁免）',
      !/id="sid"/.test(votePageSrc) && !/id="name"/.test(votePageSrc) && !/\bvia\s*:/.test(votePageSrc));
    ok('学生页按服务端回传的 voted / inList 呈现', /act\.voted/.test(votePageSrc) && /act\.inList/.test(votePageSrc));
    // 票数卡片在表单卡片之上，截止后的说法必须是"以上"；标题也要从"实时"切到"最终"
    ok('截止后的口径是「以上为最终票数」', votePageSrc.includes('以上为最终票数') && !votePageSrc.includes('以下为最终票数'));
    ok('截止后票数标题改为最终票数', /closed\?'最终票数':'实时票数'/.test(votePageSrc));
    // 同学 / 班委在管理台的投票详情里就能直接下票（不必复制 /v/:id 链接跳走）
    const appSrc2 = require('fs').readFileSync(require('path').join(__dirname, 'public', 'js', 'app.js'), 'utf8');
    const selfStart = appSrc2.indexOf('const myAcct = state.me.sid');
    const selfEnd = appSrc2.indexOf('// 结果页定时原地刷新');
    const selfSeg = selfStart >= 0 && selfEnd > selfStart ? appSrc2.slice(selfStart, selfEnd) : '';
    ok('管理台详情内置「我的投票」面板', selfSeg.length > 500 && /我的投票/.test(selfSeg)
      && /\$\{selfPanel\}/.test(appSrc2) && /api\/vote\/' \+ d\.id \+ '\/ballot'/.test(selfSeg));
    ok('面板只对真实班级账号出现（管理员密码不能下票）', /const myAcct = state\.me\.sid \? state\.me : null/.test(selfSeg)
      && /selfPanel = !myAcct \? ''/.test(selfSeg) && !/isSysAdmin\(\) \? selfPanel/.test(appSrc2));
    ok('面板回填本人选票并遵守改票与多选规则', /d\.myVote/.test(selfSeg) && /vdone/.test(selfSeg)
      && /inputs\.filter\(\(x\) => x\.checked\)\.length > d\.maxSelect/.test(selfSeg));
    // 权限边界只写在 README / 更新日志里，不挂到每个投票页面上
    const privilegeLabel = /仅发起人可查|仅系统管理员可见|明细仅发起人|仅管理员可见/;
    ok('界面不标注谁能看选票明细', !privilegeLabel.test(votePageSrc) && !privilegeLabel.test(appSrc2));
    // 操作记录只归系统管理员：入口要藏起来，"本人看自己"那档必须整个没有
    const idxSrc2 = require('fs').readFileSync(require('path').join(__dirname, 'public', 'index.html'), 'utf8');
    ok('班级管理入口只对管理员显示，操作记录是它下面的标签',
      (idxSrc2.match(/data-view="rosters"[^>]*class="[^"]*admin-only/g) || []).length === 2
      && !idxSrc2.includes('data-view="audit"')
      && /ADMIN_TABS = \[\['rosters', '账号名单'\], \['audit', '操作记录'\], \['settings', '设置'\]\]/.test(appSrc2),
      (idxSrc2.match(/data-view="rosters"[^>]*/g) || []).join(' | '));
    ok('信息中心吸收待办 / 待审核 / 文件 / 统计（不再单独占导航）',
      !/data-view="(tasks|files|stats|inbox)"/.test(idxSrc2)
      && /data-view="feed"/.test(idxSrc2) && /id="hub-bar"/.test(idxSrc2)
      && /FEED_TABS = \[\['feed', '信息流'\], \['tasks', '待办'\], \['inbox', '待审核'\], \['files', '文件'\], \['stats', '统计'\]\]/.test(appSrc2));
    ok('前端不再有 /api/audit/mine', !appSrc2.includes('/api/audit/mine'));
  }

  // 退出登录入口契约金丝雀：同学与管理员都要够得着（管理员曾被"改密"提示一句挡回，等于没有出口）
  {
    const appSrc = require('fs').readFileSync(require('path').join(__dirname, 'public', 'js', 'app.js'), 'utf8');
    const idxSrc = require('fs').readFileSync(require('path').join(__dirname, 'public', 'index.html'), 'utf8');
    ok('顶栏有独立的退出按钮与账号胶囊', /id="btn-logout"/.test(idxSrc) && /id="me-chip"/.test(idxSrc));
    ok('账号面板里也有退出（两种身份都可达）', /id="acct-logout"/.test(appSrc) && /addEventListener\('click', doLogout\)/.test(appSrc));
    ok('管理员不再被"改密"提示挡在账号面板外', !/if \(!state\.me\.sid\) \{ toast\(/.test(appSrc) && /function openAccountModal/.test(appSrc));
    ok('退出按钮没有重复 id（统计页那处另名）', (appSrc.match(/id="btn-logout"/g) || []).length === 0
      && /id="btn-logout-2"/.test(appSrc));
  }

  // 班委权限的前端收口：动作按钮按 canPost 放行；学号、名单与明细仍只跟系统管理员走（服务端另有下发脱敏）
  {
    const appSrc3 = require('fs').readFileSync(require('path').join(__dirname, 'public', 'js', 'app.js'), 'utf8');
    ok('接龙 / 投票 / 抽签的动作按钮不再按系统管理员收口',
      !/isSysAdmin\(\)[^\n]*data-dw-del/.test(appSrc3) && !/isSysAdmin\(\)[^\n]*btn-dw-create/.test(appSrc3)
      && /canPost\(\)[^\n]*data-dw-del/.test(appSrc3) && /const canEdit = canPost\(\);/.test(appSrc3));
    ok('投票详情的编辑 / 停止 / 删除对班委出现',
      /canEdit \? `<div class="card-actions">[\s\S]{0,120}id="vote-edit"/.test(appSrc3));
    ok('接龙详情的管理面板对班委出现', /canEdit \? `<div class="panel">[\s\S]{0,1200}id="jl-del"/.test(appSrc3));
    ok('抽签动作区对班委出现', /canEdit \? `\s*<button class="dw-go"/.test(appSrc3));
    ok('通知卡片：勾选完成与置顶给班委，编辑与删除仍按系统管理员',
      /canPost\(\) \? `<div class="card-actions">[\s\S]{0,300}data-act="pin"[\s\S]{0,200}isSysAdmin\(\) \? `<button data-act="edit"/.test(appSrc3)
      && /isSysAdmin\(\) \? `<button data-act="edit"[\s\S]{0,120}data-act="del"/.test(appSrc3));
    // 名单区已收成共用组件，这两个编辑弹窗在班委手里不渲染名单框，
    // 此时 rosterRaw / keepId 必须整字段不提交（服务端按"字段没传"保留原名单含学号）。
    // 断言钉的是这条不变量而不是变量名：readRoster 在名单框缺失时返回 null，调用点用三元跳过。
    ok('班委的编辑弹窗不给名单输入框（不提交 rosterRaw，学号不会被脱敏视图冲掉）',
      /const ros = readRoster\('jl-e'\)/.test(appSrc3) && /const ros = readRoster\('dw-e'\)/.test(appSrc3)
      && /if \(!ta\) return null;/.test(appSrc3)
      && (appSrc3.match(/rosterRaw: ros \? ros\.raw : undefined/g) || []).length === 2
      && (appSrc3.match(/keepId: ros \? ros\.keepId : undefined/g) || []).length === 2);
    // 各模块「新建 / 发起」按钮必须同一种视觉分量（品牌 primary），页内小节才用 ghost。
    // 账号名单的「新建名单」长期是 ghost，和其他 7 个模块的入口不是一个权重，用户一眼就觉得没统一。
    ok('所有模块的新建/发起入口都是 primary（不再有 ghost 创建按钮）',
      !/<button class="ghost" id="btn-[a-z-]*(new|create|add)"/.test(appSrc3)
      && (appSrc3.match(/class="primary" id="btn-[a-z-]*(new|create|add)"/g) || []).length >= 8);
    // 顶级视图用 jl-head（h2）；inboxhead 只允许留在信息中心页内的三处小节头（待审核 / 文件×2）
    ok('顶级视图页头统一为 jl-head，inboxhead 只剩信息中心页内小节',
      (appSrc3.match(/class="inboxhead"/g) || []).length === 3
      && !/inboxhead[\s\S]{0,200}btn-roster-new/.test(appSrc3)
      && !/inboxhead[\s\S]{0,200}ad-export/.test(appSrc3));
    // 全站不能再有内联样式的 label（统一走 .form label / .splitline）
    ok('不再有 <label style=> 的内联写法', !/<label style="/.test(appSrc3));
    // 写死的前景色绕过令牌，深色模式下会糊成一片：问卷详情原先的 #666 落在深色卡上对比只有 1.46:1，等于看不见
    ok('app.js 不再写死前景色（走令牌）',
      !/#(eee|666|999|888|f0f0f0|f5f5f5|e0e0e0)\b/i.test(appSrc3)
      // 允许的字面色：颜色选择器默认值与 meta theme-color 兜底，这两处必须是字面量
      && (appSrc3.match(/#4f6ef2/g) || []).length <= 2);
    // 进度条全站只留一套基元：曾同时存在 .bar（渐变凹槽）、.tally-row .tbar（平色）、问卷内联手搓 20px 条
    // 比对 CSS 前先剥注释——注释里提到的 .tbar 是说明文字不是代码（同一条坑今天踩过两次了）
    ok('进度条只有一套基元（.tbar 已并入 .bar）',
      !/class="tbar"/.test(appSrc3)
      && !/\.tbar/.test(require('fs').readFileSync(require('path').join(__dirname, 'public', 'css', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
    // 拖拽插入指示不能写死主色，也不能用 border（会把题目挤动 2px）
    ok('拖拽插入指示用投影类而非写死 border',
      !/style\.borderTop = '2px solid/.test(appSrc3) && /classList\.add\('drop-above'\)/.test(appSrc3));
    // 自检必须跑在临时快照上：直接写真实库时，一轮被中断的自检会把几百条 "自检xxx" 留在库里，
    // 下一轮的「搜索命中 1 条」就成了 2 条——这类假失败查起来比 bug 还费时间
    const launcherSrc = require('fs').readFileSync(require('path').join(__dirname, 'selftest.js'), 'utf8')
      // 注释里也会写 "VACUUM INTO / 快照 / INFOHUB_DATA_DIR"，比对前先剥掉，否则文件开头那段
      // 说明就能把断言喂饱（同一条坑在 .tbar 那条上踩过）
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const dbSrc = require('fs').readFileSync(require('path').join(__dirname, 'db.js'), 'utf8');
    const testSrc = require('fs').readFileSync(require('path').join(__dirname, 'test.js'), 'utf8');
    ok('自检跑在隔离快照上（真实库不参与读写）',
      /VACUUM INTO/.test(launcherSrc) && /INFOHUB_DATA_DIR:\s*sandbox/.test(launcherSrc)
      && /process\.env\.INFOHUB_DATA_DIR/.test(dbSrc) && /purgeStaleFixtures\(/.test(launcherSrc)
      // test.js 直连库文件的地方必须跟着 DATA_DIR，否则收尾清理会去删真实库
      && !/join\(__dirname, 'data', 'infohub\.db'\)/.test(testSrc) && /join\(DATA_DIR, 'infohub\.db'\)/.test(testSrc));
    ok('班委发起时可从班级名单选用（引用模式，学号全文不经过班委）',
      /const officer = !isSysAdmin\(\)/.test(appSrc3)
      && /refOnly: true/.test(appSrc3)
      && (appSrc3.match(/gateRosterLibSave\('/g) || []).length === 2);
    ok('班委可用的命令面板项与页面按钮同一口径',
      /if \(canPost\(\)\) \{\s*cmds\.push\(\s*\{ iconHtml: icon\('plus'\), label: '添加信息'/.test(appSrc3)
      && !/if \(isSysAdmin\(\)\) \{\s*cmds\.push\(\s*\{ iconHtml: icon\('plus'\), label: '添加信息'/.test(appSrc3));
    // 待审核入口对班委开着，角标也要给班委轮询（只按 isSysAdmin 关掉会让班委看不到待审数量）
    ok('班委也能看到待审核角标', /async function updateInboxBadge\(\) \{\s*if \(!canPost\(\)\) return;/.test(appSrc3));
    // 快捷录入页：按角色判断能不能记，而不是按已废弃的 readOnly（全站登录后 readOnly 恒为 false，
    // 同学会看到一个点下去必然 401 的保存钮）
    const quickSrc = require('fs').readFileSync(require('path').join(__dirname, 'public', 'quick.html'), 'utf8');
    ok('快捷录入页按角色提示浏览模式（同学不会点到必然 401 的保存钮）',
      /me\.role==='admin'\|\|me\.role==='officer'/.test(quickSrc) && !/me\.readOnly/.test(quickSrc));
  }

  // 「日历详情」视图已下线（用户"感觉很鸡肋"）：入口与实现都不该再回来；但 .ics 订阅要留着
  {
    const idxSrc4 = require('fs').readFileSync(require('path').join(__dirname, 'public', 'index.html'), 'utf8');
    const appSrc4 = require('fs').readFileSync(require('path').join(__dirname, 'public', 'js', 'app.js'), 'utf8');
    ok('日历详情视图已下线（无导航入口、无 loadCalendar）',
      !idxSrc4.includes('data-view="calendar"') && !appSrc4.includes('loadCalendar') && !appSrc4.includes("'日历详情'"));
    ok('.ics 导出仍在（待办任务页）',
      /id="btn-ics"/.test(appSrc4) && /\/api\/calendar\.ics/.test(appSrc4) && (await sf(BASE + '/api/calendar.ics')).status === 200);
  }

  // 「思维碰撞」：留言寄语并进来，一个入口两个标签；匿名只影响墙上显示谁，界面不写"谁能查到"
  {
    const idxSrc5 = require('fs').readFileSync(require('path').join(__dirname, 'public', 'index.html'), 'utf8');
    const appSrc5 = require('fs').readFileSync(require('path').join(__dirname, 'public', 'js', 'app.js'), 'utf8');
    ok('导航里只剩一个「思维碰撞」入口（留言寄语不再是独立模块）',
      (idxSrc5.match(/data-view="guestbook"[\s\S]{0,400}?思维碰撞/g) || []).length === 2
      && !idxSrc5.includes('留言寄语'));
    ok('页面有两个标签：征集活动 / 留言，点子在征集下带状态与回复入口',
      /data-gb-tab="campaign"/.test(appSrc5) && /data-gb-tab="note"/.test(appSrc5)
      && /const IDEA_STATUS = \{ open: '待看', accepted: '采纳', done: '已实现', dropped: '搁置' \}/.test(appSrc5)
      && /data-idea-edit=/.test(appSrc5) && /data-camp-status=/.test(appSrc5));
    ok('征集列表能发起 / 进入 / 复制链接，链接 /c/ID 能直达详情',
      /id="btn-camp-new"/.test(appSrc5) && /data-camp-open=/.test(appSrc5) && /data-camp-copy=/.test(appSrc5)
      && appSrc5.includes('^\\/c\\/(') && /openCampaignModal/.test(appSrc5));
    ok('匿名文案不承诺管理员不可追溯', !/匿名[^\n]{0,30}(管理员|谁)[^\n]{0,14}(看不到|查不到|无法追溯)/.test(appSrc5 + idxSrc5));
    ok('点子支持附件（上传入口走 multipart，卡片上有下载条）',
      /id="gb-files"/.test(appSrc5) && /new FormData\(\)/.test(appSrc5) && /\/api\/idea-attachments\//.test(appSrc5));
    ok('私密征集有「匿名展示给全班」开关',
      /id="gb-share"/.test(appSrc5) && /匿名展示给全班/.test(appSrc5) && /public_share/.test(appSrc5));
  }

  // 编辑投票：说明与截止传空串即清空（显式字段语义）
  r = await post('/api/vote', { title: '自检编辑投票', optionsRaw: '赞成\n反对', rosterRaw: '2023001 张三\n2023002 李四', keepId: true, deadline: '2030-01-01 10:00' });
  const vidEdit = r.body.id;
  r = await j(`/api/vote/${vidEdit}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deadline: '' }) });
  ok('编辑投票可清空截止时间', r.status === 200, JSON.stringify(r.body));
  r = await j('/api/vote/' + vidEdit);
  ok('清空后截止时间为空', r.status === 200 && r.body.deadline === '', JSON.stringify(r.body));
  // 纯日期截止时间按当天 23:59 判定：已过的纯日期 → 投票自动结束
  r = await post('/api/vote', { title: '自检日期截止投票', optionsRaw: '赞成\n反对', rosterRaw: '2023001 张三\n2023002 李四', keepId: true, deadline: '2020-01-01' });
  const vidDate = r.body.id;
  r = await j('/api/vote/' + vidDate);
  ok('投票纯日期截止视为当天23:59（已过期自动结束）', r.status === 200 && r.body.closed === true, JSON.stringify({ closed: r.body.closed }));
  await j('/api/vote/' + vidDate, { method: 'DELETE' });
  await j('/api/vote/' + vidEdit, { method: 'DELETE' });
  // 审计日志：删除投票应留痕
  try {
    const auditText = require('fs').readFileSync(require('path').join(DATA_DIR, 'logs', 'audit.log'), 'utf8');
    ok('审计日志记录删除投票', auditText.includes('删除投票'));
  } catch (e) { ok('审计日志记录删除投票', false, 'audit.log 不存在'); }

  // 16. 班徽背景（上传 / 访问 / 删除）；真实环境已设置班徽时，测完原样还原
  const prevBadge = await sf(BASE + '/api/class-badge');
  const prevBadgeBytes = prevBadge.status === 200 ? Buffer.from(await prevBadge.arrayBuffer()) : null;
  const prevBadgeType = (prevBadge.headers.get('content-type') || 'image/png').split(';')[0];
  const pngBadge = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const bbd = '----bd' + Date.now();
  const bmp = Buffer.concat([
    Buffer.from(`--${bbd}\r\nContent-Disposition: form-data; name="files"; filename="badge.png"\r\nContent-Type: image/png\r\n\r\n`),
    pngBadge, Buffer.from(`\r\n--${bbd}--\r\n`),
  ]);
  r = await j('/api/class-badge', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + bbd }, body: new Uint8Array(bmp) });
  ok('上传班徽', r.status === 200, JSON.stringify(r.body));
  const bgRes = await sf(BASE + '/api/class-badge');
  const bgLen = (await bgRes.arrayBuffer()).byteLength;
  ok('班徽可访问（PNG 原样）', bgRes.status === 200 && bgLen === pngBadge.length, 'len=' + bgLen);
  ok('班徽响应带 CSP sandbox（SVG 防脚本）', (bgRes.headers.get('content-security-policy') || '').includes('sandbox'));
  if (authRequired) {
    const g12 = await fetch(BASE + '/api/class-badge', { method: 'DELETE' });
    ok('访客删除班徽被拒（401）', g12.status === 401);
  }
  r = await j('/api/class-badge', { method: 'DELETE' });
  ok('移除班徽', r.status === 200);
  if (prevBadgeBytes) {
    // 原本就有班徽：原样传回，不清掉真实环境的配置
    const rbd = '----bd-r' + Date.now();
    const bmp2 = Buffer.concat([
      Buffer.from(`--${rbd}\r\nContent-Disposition: form-data; name="files"; filename="badge-restore"\r\nContent-Type: ${prevBadgeType}\r\n\r\n`),
      prevBadgeBytes, Buffer.from(`\r\n--${rbd}--\r\n`),
    ]);
    r = await j('/api/class-badge', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + rbd }, body: new Uint8Array(bmp2) });
    const bgBack = await sf(BASE + '/api/class-badge');
    const backLen = (await bgBack.arrayBuffer()).byteLength;
    ok('原有班徽已还原', r.status === 200 && bgBack.status === 200 && backLen === prevBadgeBytes.length, 'len=' + backLen);
  } else {
    const bg404 = await sf(BASE + '/api/class-badge');
    ok('移除后班徽 404', bg404.status === 404);
  }

  // 17. 班费收支（记账 / 结余 / 校验 / 筛选 / CSV 导出 / 门禁）
  created.funds = created.funds || [];
  const TAG = '自检班费' + Date.now();
  r = await post('/api/funds', { type: 'income', amount: 500, note: TAG + '收缴' });
  ok('记一笔收入', r.status === 200 && r.body.amount === 500 && r.body.type === 'income', JSON.stringify(r.body));
  if (r.body.id) created.funds.push(r.body.id);
  const incomeId = r.body.id;
  r = await post('/api/funds', { type: 'expense', amount: 80.5, note: TAG + '买水笔' });
  ok('记一笔支出（含两位小数）', r.status === 200 && r.body.amount === 80.5, JSON.stringify(r.body));
  if (r.body.id) created.funds.push(r.body.id);
  r = await post('/api/funds', { type: 'expense', amount: 0 });
  ok('金额为 0 被拒（400）', r.status === 400);
  r = await post('/api/funds', { type: 'expense', amount: -10 });
  ok('负数金额被拒（400）', r.status === 400);
  r = await post('/api/funds', { type: '转账', amount: 10 });
  ok('非法类型被拒（400）', r.status === 400);

  r = await j('/api/funds');
  const fundSum = r.body.summary;
  ok('列表返回汇总', r.status === 200 && typeof fundSum.income === 'number' && typeof fundSum.balance === 'number', JSON.stringify(fundSum));
  ok('结余 = 收入 − 支出', Math.abs((fundSum.income - fundSum.expense) - fundSum.balance) < 0.001, JSON.stringify(fundSum));
  ok('两笔自检记录都在明细里', r.body.items.some((x) => String(x.id) === String(incomeId)));

  r = await j('/api/funds?type=expense');
  ok('按类型筛选只看支出', r.status === 200 && r.body.items.length >= 1 && r.body.items.every((x) => x.type === 'expense'), JSON.stringify(r.body.items.map((x) => x.type)));
  r = await j('/api/funds?q=' + encodeURIComponent(TAG));
  ok('搜索命中本次自检记录', r.status === 200 && r.body.items.length === 2, 'count=' + (r.body.items || []).length);
  r = await j('/api/funds?from=2000-01-01&to=2999-12-31');
  ok('日期区间筛选包含自检记录', r.status === 200 && r.body.items.some((x) => String(x.id) === String(incomeId)));
  // 回归：纯日期账目在「起止同一天」的区间里不能被漏掉（曾因 'YYYY-MM-DD' < 'YYYY-MM-DD 00:00' 字符串比较而丢当天数据）
  {
    const day = new Date().toISOString().slice(0, 10);
    const rd = await post('/api/funds', { type: 'expense', amount: 5.5, note: '当天账目', happened_at: day });
    if (rd.body && rd.body.id) created.funds.push(rd.body.id);
    const rf = await j('/api/funds?from=' + day + '&to=' + day);
    ok('起止同一天含当天纯日期账目', rf.status === 200 && rf.body.items.some((x) => String(x.id) === String(rd.body.id)), JSON.stringify(rf.body.items.map((x) => x.id)));
  }

  r = await j('/api/funds/' + incomeId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 620, note: TAG + '改后' }) });
  ok('编辑金额生效', r.status === 200 && r.body.amount === 620, JSON.stringify(r.body));

  const fundCsv = await sf(BASE + '/api/funds/export?q=' + encodeURIComponent(TAG));
  const fundCsvText = await fundCsv.text();
  ok('CSV 导出为 text/csv', fundCsv.status === 200 && (fundCsv.headers.get('content-type') || '').includes('text/csv'));
  ok('CSV 带 BOM 与表头', fundCsvText.startsWith('') && fundCsvText.includes('金额(元)'));
  ok('CSV 含明细与结余合计行', fundCsvText.includes(TAG) && fundCsvText.includes('结余'));
  // 负结余必须仍是数值格：公式注入的中和一度把 '-' 开头一律加前缀，按「支出」筛选时结余必为负，
  // 结果导出成文本 '-xx.xx'，Excel 里不能参与求和
  {
    const csvExp = await (await sf(BASE + '/api/funds/export?type=expense&q=' + encodeURIComponent(TAG))).text();
    const bal = (csvExp.match(/结余,(-?[\d.]+)/) || [])[1];
    ok('按支出筛选时负结余仍是数值（没被加单引号成文本）', /^-\d+\.\d{2}$/.test(String(bal)), '结余=' + bal);
  }
  {
    const rn = await post('/api/funds', { type: 'expense', amount: 100, note: '=1+3 自检公式' });
    if (rn.body && rn.body.id) created.funds.push(rn.body.id);
    const csvInj = await (await sf(BASE + '/api/funds/export?q=' + encodeURIComponent('=1+3 自检公式'))).text();
    ok('备注以 = 开头仍被加前缀中和（Excel 公式注入）', csvInj.includes("'=1+3 自检公式"), JSON.stringify(csvInj.split('\r\n').slice(0, 2)));
  }

  // 17b. 班费凭证附件：上传 / 内联元数据 / 下载 / 删除 / 级联
  r = await post('/api/funds', { type: 'expense', amount: 12.3, note: TAG + '凭证笔' });
  const attFundId = r.body.id;
  if (attFundId) created.funds.push(attFundId);
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fbd = '----fund' + Date.now();
  const fbody = Buffer.concat([
    Buffer.from(`--${fbd}\r\nContent-Disposition: form-data; name="files"; filename="receipt.png"\r\nContent-Type: image/png\r\n\r\n`),
    pngBytes, Buffer.from(`\r\n--${fbd}--\r\n`),
  ]);
  r = await j('/api/funds/' + attFundId + '/attachment', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + fbd }, body: new Uint8Array(fbody) });
  ok('上传班费凭证', r.status === 200 && Array.isArray(r.body.ids) && r.body.ids.length === 1, JSON.stringify(r.body));
  const attId = r.body.ids && r.body.ids[0];
  r = await j('/api/funds?q=' + encodeURIComponent(TAG) + '&type=expense');
  const attRow = (r.body.items || []).find((x) => String(x.id) === String(attFundId));
  ok('列表内联凭证元数据', !!attRow && Array.isArray(attRow.attachments) && attRow.attachments.length === 1 && attRow.attachments[0].mime === 'image/png', JSON.stringify(attRow && attRow.attachments));
  const attGet = await sf(BASE + '/api/fund-attachments/' + attId + '/file');
  const attBytes = Buffer.from(await attGet.arrayBuffer());
  ok('下载凭证内容一致且内联', attGet.status === 200 && attBytes.length === pngBytes.length && (attGet.headers.get('content-disposition') || '').startsWith('inline'), 'len=' + attBytes.length);
  r = await j('/api/fund-attachments/' + attId, { method: 'DELETE' });
  ok('删除单个凭证', r.status === 200);
  // 级联：再传一个，删整条记录后凭证应一并清除（下载 404）
  await j('/api/funds/' + attFundId + '/attachment', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + fbd }, body: new Uint8Array(fbody) });
  const attId2 = ((await j('/api/funds?q=' + encodeURIComponent(TAG) + '&type=expense')).body.items.find((x) => String(x.id) === String(attFundId)) || {}).attachments?.[0]?.id;
  await j('/api/funds/' + attFundId, { method: 'DELETE' });
  const attGet2 = await sf(BASE + '/api/fund-attachments/' + attId2 + '/file');
  ok('删除记录级联清除凭证', attId2 != null && attGet2.status === 404);
  if (authRequired) {
    const gAtt = await fetch(BASE + '/api/fund-attachments/' + attId + '/file');
    ok('凭证门禁：未登录不可看（401）', gAtt.status === 401);
    const gAttUp = await fetch(BASE + '/api/funds/' + attFundId + '/attachment', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + fbd }, body: new Uint8Array(fbody) });
    ok('凭证门禁：访客上传被拒（401）', gAttUp.status === 401);
  }
  const expFA = await j('/api/export');
  ok('备份导出含 fundAttachments 字段', expFA.status === 200 && Array.isArray(expFA.body.fundAttachments));

  if (authRequired) {
    const gFundView = await fetch(BASE + '/api/funds');
    ok('班费门禁：未登录不可浏览（401）', gFundView.status === 401);
    const gFundPost = await fetch(BASE + '/api/funds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'expense', amount: 1 }) });
    ok('班费门禁：访客记账被拒（401）', gFundPost.status === 401);
  }
  const expAll = await j('/api/export');
  ok('备份导出含 funds 字段', expAll.status === 200 && Array.isArray(expAll.body.funds));

  r = await j('/api/funds/' + incomeId, { method: 'DELETE' });
  ok('删除班费记录', r.status === 200);
  r = await j('/api/funds?q=' + encodeURIComponent(TAG));
  ok('删除后只剩一笔自检记录', r.status === 200 && r.body.items.length === 1, 'count=' + (r.body.items || []).length);
  try {
    const auditText = require('fs').readFileSync(require('path').join(DATA_DIR, 'logs', 'audit.log'), 'utf8');
    ok('审计日志记录删除班费记录', auditText.includes('删除班费记录'));
  } catch (e) { ok('审计日志记录删除班费记录', false, 'audit.log 不存在'); }

  // 18. 留言寄语（访客可写的公开留言板）
  created.guestbook = created.guestbook || [];
  const GB_TAG = '自检留言' + Date.now();
  // 发布按 IP 限速 6 条/分钟：紧接上一轮自检再跑会撞上窗口，撞上就等窗口滑过去再试一次
  const gbPost = async (body, anon) => {
    for (let i = 0; i < 6; i++) {
      const rr = await fetch(BASE + '/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(anon || !cookie ? {} : { Cookie: cookie }) },
        body: JSON.stringify(body),
      });
      if (rr.status !== 429) return { status: rr.status, body: await rr.json().catch(() => ({})) };
      await new Promise((res) => setTimeout(res, 12000));
    }
    return { status: 429, body: {} };
  };
  r = await gbPost({ nickname: '同学甲', content: GB_TAG + '第一句' });
  ok('发布留言', r.status === 200 && r.body.id && r.body.nickname === '同学甲', JSON.stringify(r.body));
  const gbId = r.body && r.body.id;
  if (gbId) created.guestbook.push(gbId);
  r = await gbPost({ content: '   ' });
  ok('空内容被拒（400）', r.status === 400);
  r = await j('/api/guestbook');
  ok('留言列表可见', r.status === 200 && r.body.items.some((x) => String(x.id) === String(gbId)), JSON.stringify(r.body.items && r.body.items[0]));
  r = await j('/api/guestbook?limit=1');
  ok('留言分页 limit 生效', r.status === 200 && r.body.items.length === 1 && r.body.total >= 1, 'total=' + (r.body && r.body.total));
  const gbAnon = await gbPost({ content: GB_TAG + '访客句' }, true);
  const gbAnonBody = gbAnon.body;
  ok('未登录不能发布留言（401）', gbAnon.status === 401, 'status=' + gbAnon.status);
  if (gbAnonBody && gbAnonBody.id) created.guestbook.push(gbAnonBody.id);
  // 点赞（访客可写的公开接口）+ 热度排序
  r = await post('/api/guestbook/' + gbId + '/like', {});
  ok('点赞计数递增', r.status === 200 && r.body.likes >= 1, JSON.stringify(r.body));
  const gbAnonLike = await su(BASE + '/api/guestbook/' + gbId + '/like', { method: 'POST' });
  ok('学生可点赞（登录写入按 IP 限速）', gbAnonLike.status === 200, 'status=' + gbAnonLike.status);
  r = await j('/api/guestbook?sort=hot');
  ok('列表返回 likes 字段', r.status === 200 && r.body.items.every((x) => typeof x.likes === 'number'));
  ok('最热排序按点赞降序（赞过的排第一）', r.status === 200 && r.body.items[0] && String(r.body.items[0].id) === String(gbId), JSON.stringify(r.body.items.slice(0, 3).map((x) => [x.id, x.likes])));
  r = await j('/api/guestbook/99999999/like', { method: 'POST' });
  ok('给不存在的留言点赞被拒（404）', r.status === 404);
  // 主题（一面墙按主题筛选：如「AI课反馈」「给张三」）——放在限速用例前，避免额度被刷爆
  const GB_TOPIC = '自检主题' + Date.now();
  r = await gbPost({ nickname: '同学乙', content: GB_TAG + '主题句', topic: GB_TOPIC });
  ok('带主题发布', r.status === 200 && r.body.topic === GB_TOPIC, JSON.stringify(r.body));
  const gbTopicId = r.body && r.body.id;
  if (gbTopicId) created.guestbook.push(gbTopicId);
  r = await j('/api/guestbook?topic=' + encodeURIComponent(GB_TOPIC));
  ok('按主题筛选只含该主题', r.status === 200 && r.body.items.length === 1 && String(r.body.items[0].id) === String(gbTopicId), JSON.stringify(r.body.items));
  ok('topics 聚合含该主题计数', (r.body.topics || []).some((t) => t.topic === GB_TOPIC && t.count === 1), JSON.stringify(r.body.topics));
  if (authRequired) {
    const gbAnonDel = await fetch(BASE + '/api/guestbook/' + gbId, { method: 'DELETE' });
    ok('访客删除留言被拒（401）', gbAnonDel.status === 401);
  }
  // 思维碰撞：同一面墙两个标签——点子带状态与公开回复，留言保留昵称 / 点赞 / 弹幕；
  // 匿名只藏"墙上显示谁"，提交人学号照常入库，只有系统管理员拿得到
  let ideaId = 0, ideaAnonId = 0, privIdeaId = 0, privAttId = 0;
  let campPublic = '', campPrivate = '';
  if (authRequired) {
    const ck = await userSession('2023001');
    // 点子挂在征集下、支持附件：正文 + 文件走 multipart，服务端在同一个事务里落库
    const ideaMp = (fields, files) => {
      const bd = '----ideab' + Date.now() + Math.random().toString(16).slice(2);
      const parts = [];
      for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
      for (const f of files) {
        parts.push(Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`), f.body, Buffer.from('\r\n'));
      }
      parts.push(Buffer.from(`--${bd}--\r\n`));
      return fetch(BASE + '/api/guestbook', {
        method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + bd, Cookie: ck },
        body: Buffer.concat(parts),
      }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    };
    // 发起征集只归系统管理员
    r = await post('/api/campaigns', { title: '自检公开征集', description: '想听听大家的点子', visibility: 'public' });
    campPublic = r.body.id || '';
    if (campPublic) created.campaigns.push(campPublic);
    ok('管理员能发起征集（默认公开）', r.status === 200 && /^[a-z0-9]{5,9}$/.test(campPublic), JSON.stringify(r.body));
    const stuNew = await fetch(BASE + '/api/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ title: '同学建的征集' }),
    });
    ok('同学不能发起征集（401）', stuNew.status === 401, 'status=' + stuNew.status);
    // 公开征集：正文 + 附件
    r = await ideaMp({ kind: 'idea', campaign: campPublic, content: GB_TAG + '提一个点子：周五办场辩论赛', public_share: 'true' }, [
      { name: '辩论赛规则.txt', type: 'text/plain', body: Buffer.from('第一轮：观点陈述\n第二轮：自由辩论', 'utf8') },
    ]);
    ideaId = r.body.id || 0;
    if (ideaId) created.guestbook.push(ideaId);
    const ideaAtts = r.body.attachments || [];
    const ideaAttId = ideaAtts[0] ? ideaAtts[0].id : 0;
    ok('公开征集：提交点子能带附件（署名来自账号、默认待看；公开征集不看「匿名公开」开关）',
      r.status === 200 && r.body.kind === 'idea' && r.body.status === 'open' && r.body.campaign_id === campPublic
      && r.body.nickname === '张三' && r.body.sid === undefined && r.body.public_share === false
      && ideaAtts.length === 1 && ideaAtts[0].orig_name === '辩论赛规则.txt' && ideaAtts[0].size > 0,
      JSON.stringify(r.body));
    // 只传文件、不写正文，并且匿名
    r = await ideaMp({ kind: 'idea', campaign: campPublic, content: '', anonymous: 'true' }, [
      { name: '晚自习问卷.txt', type: 'text/plain', body: Buffer.from('1. 手机收讲台还是自己保管？', 'utf8') },
    ]);
    ideaAnonId = r.body.id || 0;
    if (ideaAnonId) created.guestbook.push(ideaAnonId);
    const anonAtt = (r.body.attachments || [])[0];
    ok('点子可以只传附件（正文为空），匿名同样生效',
      r.status === 200 && r.body.content === '' && (r.body.attachments || []).length === 1
      && r.body.nickname === '匿名' && r.body.sid === undefined,
      JSON.stringify(r.body));
    // 附件内容原样可下载（学生登录即可）
    const dl = await su('/api/idea-attachments/' + ideaAttId + '/download');
    const dlBuf = Buffer.from(await dl.arrayBuffer());
    const anonDl = anonAtt ? await uget('2023002', '/api/idea-attachments/' + anonAtt.id + '/download') : { status: 0 };
    ok('点子附件可下载且内容逐字节一致（匿名点子的附件同样公开）',
      dl.status === 200 && dlBuf.toString('utf8') === '第一轮：观点陈述\n第二轮：自由辩论' && anonDl.status === 200,
      JSON.stringify([dl.status, dlBuf.length, anonDl.status]));
    // 公开征集：别的同学能看到全部提交，匿名的看不到真名 / 学号
    const pubOther = await uget('2023002', '/api/campaigns/' + campPublic);
    const otherAnon = (pubOther.body.items || []).find((x) => x.id === ideaAnonId);
    ok('公开征集里别的同学能看到全部提交，匿名的那条不露真名与学号',
      pubOther.status === 200 && (pubOther.body.items || []).length === 2
      && !!otherAnon && otherAnon.nickname === '匿名' && otherAnon.sid === undefined
      && !JSON.stringify(pubOther.body).includes('2023001'),
      JSON.stringify(otherAnon));
    // 匿名提交人只有系统管理员拿得到
    const adminViewPublic = await j('/api/campaigns/' + campPublic);
    const adminRow = (adminViewPublic.body.items || []).find((x) => x.id === ideaAnonId);
    ok('匿名提交：系统管理员能查到是谁提的', !!adminRow && adminRow.sid === '2023001' && adminRow.nickname === '张三',
      JSON.stringify(adminRow));
    // 私密征集：内容只有管理员与提交人可见；勾「匿名展示给全班」的那条放给全班看（仍匿名）
    r = await post('/api/campaigns', { title: '自检私密征集', visibility: 'private' });
    campPrivate = r.body.id || '';
    if (campPrivate) created.campaigns.push(campPrivate);
    r = await ideaMp({ kind: 'idea', campaign: campPrivate, content: '想不通的一件事', public_share: 'true' }, [
      { name: '反思问题.txt', type: 'text/plain', body: Buffer.from('为什么我总在最后一刻才开始？', 'utf8') },
    ]);
    privIdeaId = r.body.id || 0;
    const privAtt = (r.body.attachments || [])[0];
    privAttId = privAtt ? privAtt.id : 0;
    ok('私密征集：勾「匿名展示给全班」落库为匿名公开',
      r.status === 200 && r.body.public_share === true && r.body.anonymous === true
      && r.body.nickname === '匿名' && r.body.sid === undefined, JSON.stringify(r.body));
    const bView = await uget('2023002', '/api/campaigns/' + campPrivate);
    ok('私密征集：未公开的看不见，匿名公开的那条全班可见（不露真名 / 学号）',
      bView.status === 200 && (bView.body.items || []).length === 1 && bView.body.items[0].id === privIdeaId
      && bView.body.items[0].nickname === '匿名' && bView.body.items[0].sid === undefined
      && bView.body.items[0].public_share === true && bView.body.count === 1
      && !JSON.stringify(bView.body).includes('2023001'),
      JSON.stringify(bView.body.items));
    const aView = await uget('2023001', '/api/campaigns/' + campPrivate);
    ok('私密征集：提交人看得到自己那条（标着"我提的"）',
      (aView.body.items || []).length === 1 && aView.body.items[0].id === privIdeaId && aView.body.items[0].mine === true,
      JSON.stringify(aView.body.items));
    const adminViewPriv = await j('/api/campaigns/' + campPrivate);
    ok('私密征集：系统管理员看得到内容与提交人',
      (adminViewPriv.body.items || []).length === 1 && adminViewPriv.body.items[0].sid === '2023001' && adminViewPriv.body.canManage === true,
      JSON.stringify(adminViewPriv.body.items));
    // 匿名公开那条的附件同样放给全班；未公开的条目在导入用例里验
    const bDl = await uget('2023002', '/api/idea-attachments/' + privAttId + '/download');
    const aDl = await uget('2023001', '/api/idea-attachments/' + privAttId + '/download');
    const adDl = await sf('/api/idea-attachments/' + privAttId + '/download');
    ok('匿名公开的附件：别的同学也能下载（提交人 / 管理员当然也能）',
      bDl.status === 200 && aDl.status === 200 && adDl.status === 200, JSON.stringify([bDl.status, aDl.status, adDl.status]));
    // 同学不能改状态 / 回复；留言根本不该有这两个字段
    const stuEdit = await fetch(BASE + '/api/guestbook/' + ideaId, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: JSON.stringify({ status: 'accepted' }) });
    ok('同学不能改点子状态（401）', stuEdit.status === 401, 'status=' + stuEdit.status);
    r = await j('/api/guestbook/' + gbId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'accepted' }) });
    ok('留言没有状态与回复（400）', r.status === 400, JSON.stringify(r.body));
    // 附件删除：别人删不了，提交人自己能删，文件一起清掉
    const otherDel = await fetch(BASE + '/api/idea-attachments/' + ideaAttId, { method: 'DELETE', headers: { Cookie: await userSession('2023003') } });
    ok('别人不能删我的点子附件（403）', otherDel.status === 403, 'status=' + otherDel.status);
    const ownDel = await fetch(BASE + '/api/idea-attachments/' + ideaAttId, { method: 'DELETE', headers: { Cookie: ck } });
    ok('提交人能删自己的附件（再下载 404）',
      ownDel.status === 200 && (await su('/api/idea-attachments/' + ideaAttId + '/download')).status === 404,
      'status=' + ownDel.status);
    // 删点子连带清附件记录与文件
    r = await j('/api/guestbook/' + ideaAnonId, { method: 'DELETE' });
    const anonAttGone = anonAtt ? await su('/api/idea-attachments/' + anonAtt.id + '/download') : { status: 0 };
    ok('删点子连带清附件（下载 404）', r.status === 200 && anonAttGone.status === 404, JSON.stringify([r.status, anonAttGone.status]));
    // 留言墙只剩留言：点子都挂在征集下面
    const notes = await j('/api/guestbook');
    ok('留言墙只返回留言（点子不再混在这面墙上）',
      notes.status === 200 && notes.body.items.length > 0
      && notes.body.items.every((x) => x.kind === 'note')
      && !(notes.body.items || []).some((x) => x.id === ideaId),
      JSON.stringify((notes.body.items || []).slice(0, 3).map((x) => x.kind)));
    // 备份要带上征集、点子的类型 / 状态 / 回复 / 提交人
    const expGb = await j('/api/export');
    const expIdea = (expGb.body.guestbook || []).find((x) => x.id === ideaId);
    ok('备份导出带征集与点子的类型 / 状态 / 归属 / 提交人',
      !!expIdea && expIdea.kind === 'idea' && expIdea.status === 'open' && expIdea.campaign_id === campPublic
      && 'reply' in expIdea && 'anonymous' in expIdea && 'sid' in expIdea
      && (expGb.body.ideaCampaigns || []).some((c) => c.id === campPublic && c.visibility === 'public'),
      JSON.stringify(expIdea));
    r = await post('/api/import?force=1', {
      groups: [], messages: [],
      ideaCampaigns: [{ id: 'campcamp1', title: '导入征集', description: '来自备份', deadline: '2030-12-31 23:59', closed: 0, visibility: 'private', created_at: 1893456000000 }],
      guestbook: [
        { nickname: '导入旧留言', content: GB_TAG + '老备份里的留言', likes: 1, topic: '', created_at: '2030-01-02 10:00' },
        { id: 9901, nickname: '导入点子人', content: GB_TAG + '备份里的点子', kind: 'idea', campaign_id: 'campcamp1', status: 'accepted', reply: '看过', anonymous: 1, sid: '2023009', created_at: '2030-01-03 10:00' },
        { id: 9902, nickname: '导入点子人2', content: '', kind: 'idea', campaign_id: 'campcamp1', status: 'open', public_share: 1, created_at: '2030-01-04 10:00' },
      ],
      ideaAttachments: [{ idea_id: 9901, orig_name: '教程.pdf', stored_name: '209901/deadbeef.pdf', size: 1234, mime: 'application/pdf', created_at: '2030-01-03 10:00' }],
    });
    const impCamp = await j('/api/campaigns/campcamp1');
    const impIdea = (impCamp.body.items || []).find((x) => x.content === GB_TAG + '备份里的点子');
    const impIdea2 = (impCamp.body.items || []).find((x) => x.nickname === '导入点子人2');
    const impNote = ((await j('/api/guestbook?limit=200')).body.items || []).find((x) => x.content === GB_TAG + '老备份里的留言');
    ok('导入征集与提交：附件挂回原征集、空正文点子也恢复，老备份里的普通留言仍按留言恢复',
      r.status === 200 && impCamp.status === 200 && impCamp.body.visibility === 'private'
      && !!impIdea && impIdea.status === 'accepted' && impIdea.anonymous === true && impIdea.sid === '2023009' && impIdea.reply === '看过'
      && (impIdea.attachments || []).length === 1 && impIdea.attachments[0].orig_name === '教程.pdf'
      && !!impIdea2 && impIdea2.content === '' && impIdea2.public_share === true
      && !!impNote && impNote.kind === 'note',
      JSON.stringify({ st: r.status, camp: impCamp.status, idea: impIdea, idea2: impIdea2, note: impNote && impNote.kind }));
    // 私密征集里没勾「匿名展示给全班」的那条，别的同学仍然看不到
    const impAsStudent = await uget('2023002', '/api/campaigns/campcamp1');
    ok('私密征集（导入）：学生只看到「匿名公开」那条，另一条看不到',
      impAsStudent.status === 200 && (impAsStudent.body.items || []).length === 1
      && impAsStudent.body.items[0].content === '' && impAsStudent.body.items[0].nickname === '匿名'
      && impAsStudent.body.count === 2,
      JSON.stringify({ items: (impAsStudent.body.items || []).length, count: impAsStudent.body.count }));
    // 看不到的提交：点赞与删附件都要当"不存在"，别给存在性探测留口子
    {
      const ck2 = await userSession('2023002');
      const impAtt = impIdea && (impIdea.attachments || [])[0] ? impIdea.attachments[0].id : 0;
      const stubLike = impIdea ? await fetch(BASE + '/api/guestbook/' + impIdea.id + '/like', { method: 'POST', headers: { Cookie: ck2 } }) : { status: 0 };
      const stubDel = impAtt ? await fetch(BASE + '/api/idea-attachments/' + impAtt, { method: 'DELETE', headers: { Cookie: ck2 } }) : { status: 0 };
      ok('私密征集里没公开的提交：别人连点赞 / 删附件都当不存在（404）',
        stubLike.status === 404 && stubDel.status === 404, JSON.stringify([stubLike.status, stubDel.status]));
    }
    // 删除征集连带清掉提交与附件
    const impAttId = impIdea && (impIdea.attachments || [])[0] ? impIdea.attachments[0].id : 0;
    r = await j('/api/campaigns/campcamp1', { method: 'DELETE' });
    const impGone = await j('/api/campaigns/campcamp1');
    const impAttGone = impAttId ? await sf('/api/idea-attachments/' + impAttId + '/download') : { status: 0 };
    ok('删除征集连带清掉提交与附件（详情 404、附件 404）',
      r.status === 200 && impGone.status === 404 && impAttGone.status === 404,
      JSON.stringify([r.status, impGone.status, impAttGone.status]));
    if (impNote) await j('/api/guestbook/' + impNote.id, { method: 'DELETE' });
  }
  // 限速：6 条/分钟，快速连发应触发 429
  let got429 = false;
  for (let i = 0; i < 8 && !got429; i++) {
    const rr = await sf(BASE + '/api/guestbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: GB_TAG + '限' + i }) });
    if (rr.status === 429) { got429 = true; break; }
    const bb = await rr.json().catch(() => ({})); if (bb && bb.id) created.guestbook.push(bb.id);
  }
  ok('发布限速触发 429', got429);
  r = await j('/api/guestbook/' + gbId, { method: 'DELETE' });
  ok('管理员删除留言', r.status === 200);
  const expGB = await j('/api/export');
  ok('备份导出含 guestbook 字段', expGB.status === 200 && Array.isArray(expGB.body.guestbook) && expGB.body.guestbook.every((g) => 'likes' in g && 'topic' in g));

  // 19. 操作记录：管理员看全部、本人只看自己；写操作结构性覆盖（路由没显式记的由请求层兜底）
  {
    const gA = await fetch(BASE + '/api/audit');
    ok('未登录读不到操作记录（401）', gA.status === 401);
    r = await j('/api/audit?limit=200');
    ok('管理员可读操作记录', r.status === 200 && r.body.total > 10, 'total=' + (r.body && r.body.total));
    const detailOf = async (action) => (((await j('/api/audit?action=' + encodeURIComponent(action) + '&limit=60')).body || {}).items || []);
    const actTotal = async (a) => (((await j('/api/audit?action=' + encodeURIComponent(a))).body || {}).total || 0);
    // 点赞是高频低价值写入：同一 IP 5 分钟只落一条（其余只计数），否则活跃班会把它刷满两万条滚动窗口。
    // 复用上面那条自检留言（此时发布接口刚被限速打满，新建必然 429）。合并窗口活在本服务进程里，
    // 跨轮次连跑会命中上一轮的窗口、且上一轮的记录已被自清净掉，所以只断言"不放大"这个上界
    {
      const lkBefore = await actTotal('点赞留言');
      for (let i = 0; i < 3; i++) await post('/api/guestbook/' + gbTopicId + '/like', {});
      const lkAfter = await actTotal('点赞留言');
      ok('连续点赞最多只落一条记录（同类合并，防刷满两万条窗口）',
        lkAfter - lkBefore <= 1, `before=${lkBefore} +${lkAfter - lkBefore}`);
    }
    // 一次自检写几百条，最新一页里未必还有早期那条建群记录，所以按动作过滤查而不是翻首页
    ok('路由内显式审计入库（人话描述）', (await actTotal('删除信息')) > 0, 'total=' + (await actTotal('删除信息')));
    // 请求层兜底：路由没显式记的也要有动作短语（建群走请求体取名、删生日走派发前查库取对象名），
    // 而不是「提交 群」「删除 生日成员 对象 236」这种机器味说法
    ok('请求层兜底覆盖未显式审计的写操作', (await actTotal('新建群')) > 0 && (await actTotal('删除生日')) > 0,
      `新建群=${await actTotal('新建群')} 删除生日=${await actTotal('删除生日')}`);
    // 详情要能认出"哪一条、什么内容"，而不是一行 id
    const detBody = '自检审计详情正文' + Date.now();
    const detMsg = await post('/api/messages', { title: '自检审计详情', content: detBody });
    if (detMsg.body && detMsg.body.id) created.messages.push(detMsg.body.id);
    await j('/api/messages/' + (detMsg.body && detMsg.body.id), { method: 'DELETE' });
    const delInfoRows = detailOf('删除信息');
    const fundRows = detailOf('记一笔班费');
    const ballotRows = detailOf('投出选票');
    const joinRows = detailOf('填写接龙');
    const gbRows = detailOf('发布留言');
    const grpRows = detailOf('新建群');
    ok('删除信息带标题与正文摘要', (await delInfoRows).some((x) => (x.detail || '').includes('《自检审计详情》')
      && (x.detail || '').includes('正文「' + detBody + '」')), JSON.stringify((await delInfoRows)[0] && (await delInfoRows)[0].detail));
    ok('班费记录带收支方向与金额', (await fundRows).some((x) => (x.detail || '').includes('收 500.00 元') && (x.detail || '').includes(TAG + '收缴')), JSON.stringify((await fundRows)[0]));
    ok('选票记录带投票标题与所选选项', (await ballotRows).some((x) => (x.detail || '').includes('《自检匿名投票》') && (x.detail || '').includes('投给：')), JSON.stringify((await ballotRows)[0]));
    ok('接龙记录带接龙标题与填的内容', (await joinRows).some((x) => (x.detail || '').includes('《自检接龙》') && (x.detail || '').includes('是否参加「参加」')), JSON.stringify((await joinRows)[0]));
    ok('留言记录带内容摘要与昵称', (await gbRows).some((x) => (x.detail || '').includes(GB_TAG) && (x.detail || '').includes('同学甲')), JSON.stringify((await gbRows)[0] && (await gbRows)[0].detail));
    ok('兜底的记录也认得出对象（建群）', (await grpRows).some((x) => (x.detail || '').includes('《自检群》')), JSON.stringify((await grpRows)[0] && (await grpRows)[0].detail));
    const bdayRows = await detailOf('删除生日');
    ok('删除类的兜底在派发前查到了对象名', (bdayRows).some((x) => /「.+」 \d+月\d+日（id \d+）/.test(x.detail || '')), JSON.stringify((bdayRows)[0] && (bdayRows)[0].detail));
    const byWho = await j('/api/audit?who=60230001&limit=200');
    ok('记录带身份（学号 / 姓名 / 角色）', (byWho.body.items || []).some((x) => x.sid === '60230001' && x.name === '自检同学' && x.role === 'student'),
      JSON.stringify((byWho.body.items || [])[0]));
    // 自检写的记录要能被认出来并自清，否则一次自检就淹掉真实使用记录
    const health = await j('/api/health');
    const selftestMode = !!(health.body && health.body.selftest);
    if (selftestMode) {
      const mine = (r.body.items || []).filter((x) => x.id > auditBaseline);
      ok('本轮自检写入的记录都带 selftest 标记（真实记录不受影响）', mine.length > 0 && mine.every((x) => x.tag === 'selftest'),
        `本轮行数=${mine.length} 漏标=${mine.filter((x) => x.tag !== 'selftest').length} baseline=${auditBaseline}`);
    } else {
      console.log('  （提示：服务不是以 INFOHUB_SELFTEST=1 启动的，本次自检的操作记录会留在库里，跑完自行清理）');
    }
    ok('按学号筛选只含该账号', byWho.status === 200 && (byWho.body.items || []).length > 0 && byWho.body.items.every((x) => x.sid === '60230001'), JSON.stringify((byWho.body.items || [])[0]));
    const none = await j('/api/audit?action=' + encodeURIComponent('不存在的动作'));
    ok('按动作筛选无命中时为空', none.status === 200 && none.body.items.length === 0);
    const mine = await su('/api/audit/mine');
    ok('「本人看自己」那一档已取消（接口不存在）', mine.status === 404, 'status=' + mine.status);
    const ownRows = await su('/api/audit');
    ok('学生看不到操作记录，包括自己那条（401）', ownRows.status === 401, 'status=' + ownRows.status);
    const peek = await su('/api/audit?who=2023001');
    ok('学生看不到别人的操作记录（401）', peek.status === 401, 'status=' + peek.status);
    const csv = await sf('/api/audit/export');
    const csvText = await csv.text();
    ok('操作记录导出 CSV（BOM + 表头）', csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv')
      && csvText.startsWith('') && csvText.includes('操作,详情,来源 IP'), csvText.slice(0, 60));
    // 详情与姓名都由人填（留言正文、名单里的姓名）：以 = + - @ 开头时 Excel 会当公式执行，导出要加 ' 前缀
    {
      const injRoster = await post('/api/rosters', { name: '自检公式注入名单', rosterRaw: '60230050 =1+1', keepId: true });
      const injRid = injRoster.body && injRoster.body.id;
      if (injRid) created.rosters.push(injRid);
      await post('/api/users/sync', { rosterId: injRid });
      created.userSids.push('60230050');   // 不论是否真开通，收尾都试着删一次（404 无害）
      await j('/api/users/60230050', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) });
      const injCsv = await (await sf('/api/audit/export?action=' + encodeURIComponent('修改账号'))).text();
      ok('操作记录 CSV 中和 Excel 公式注入（姓名以 = 开头不会变成公式）',
        injCsv.includes("'=1+1（60230050）") && !/[,\r\n]=1\+1（60230050）/.test(injCsv),
        JSON.stringify(injCsv.split('\r\n').slice(1, 2)));
    }
    // 一次操作只落一条：路由显式记了，请求层不得重复
    const before = (await j('/api/audit?action=' + encodeURIComponent('删除信息'))).body.total;
    const tmp = await post('/api/messages', { title: '自检审计去重' });
    if (tmp.body.id) created.messages.push(tmp.body.id);
    await j('/api/messages/' + tmp.body.id, { method: 'DELETE' });
    const after = (await j('/api/audit?action=' + encodeURIComponent('删除信息'))).body.total;
    ok('一次删除只落一条记录（不重复计）', after - before === 1, `+${after - before}`);
    // 登录失败也要留痕（公网域名上管理员要看"谁在试哪些学号"），但这是未登录就能触发的写入，
    // 同一 IP 同类失败 5 分钟内合并成一条，防止刷登录把真实记录挤出滚动窗口
    if (authRequired) {
      const bad = (body) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
      // 记录要能分辨是哪一种、哪个学号，且绝不落密码本身。
      // 合并窗口活在服务器进程里：跨轮次连跑时同类失败会被合并掉，所以只断言"不放大"这个上界，
      // 不要求某一轮两种都出现
      const NO_SID = '2099' + String(Date.now()).slice(-6);
      const fRows = await detailOf('登录失败');
      const fBefore = await actTotal('登录失败');
      const e1 = await bad({ sid: NO_SID, password: 'x' });                // 查无此学号
      const e2 = await bad({ sid: '2023001', password: '密码肯定不对' });     // 密码不对
      const e3 = await bad({ sid: '2023001', password: '还是不对' });         // 同类紧接着再试，应被合并
      const fAfter = await actTotal('登录失败');
      const fresh = (await detailOf('登录失败'))[0] || {};
      ok('查无此学号与密码不对回同一句话（不能用来枚举账号）',
        e1.status === 401 && e2.status === 401 && e3.status === 401 && e1.body.error === e2.body.error, JSON.stringify([e1.body, e2.body]));
      ok('三次失败最多落两条（同类 5 分钟合并，不放大写入）', fAfter - fBefore <= 2, `before=${fBefore} after=${fAfter}`);
      ok('失败记录说清是哪一种、哪个学号', fAfter === fBefore
        || (fresh.detail || '').includes('查无此学号：' + NO_SID), `新增=${fAfter - fBefore} 详情=${JSON.stringify(fresh.detail)}`);
      const shapes = [/^查无此学号：\w+/, /^「.+」（\w+）密码不对（该学号本轮第 \d+ 次失败）/, /^「.+」（\w+）已停用仍尝试登录/,
        /^学号 \w+ 连续失败已锁定/, /^同一 IP 一分钟内/, /^管理员密码不对/];
      ok('所有失败记录都成式、且不含密码本身',
        fRows.every((x) => shapes.some((re) => re.test(x.detail || '')))
        && fRows.every((x) => !/密码肯定不对|还是不对|自检新密码99/.test(x.detail || '')),
        JSON.stringify(fRows.slice(0, 3).map((x) => x.detail)));
      const okRows = await detailOf('登录成功');
      ok('登录成功也归到具体账号（按学号筛得到，不是匿名一行）', (okRows || []).some((x) => x.sid === '60230001' && x.role === 'student'),
        JSON.stringify((okRows || []).slice(0, 2).map((x) => [x.sid, x.name, x.role])));
      // 退出登录同样要留痕：会话一删，请求层兜底就认不出是谁退的，身份只能由路由在删之前拿出来
      const ck3 = await userSession('2023003');
      const outRes = await withCookie('/api/logout', { method: 'POST' }, ck3);
      const meAfter = await withCookie('/api/me', {}, ck3);
      const outRows = await detailOf('退出登录');
      ok('退出登录成功且会话立即作废', outRes.status === 200 && !!(outRes.headers.get('set-cookie') || '').includes('Max-Age=0')
        && (await meAfter.json()).loggedIn === false, JSON.stringify(outRes.status));
      ok('退出登录留痕并归到具体账号', (outRows || []).some((x) => x.sid === '2023003' && x.name === '王五'),
        JSON.stringify((outRows || []).slice(0, 2).map((x) => [x.sid, x.name, x.detail])));
      const oBefore = await actTotal('退出登录');
      await fetch(BASE + '/api/logout', { method: 'POST' });   // 不带 Cookie：重复退 / 直接打接口
      ok('没有会话时退出不写匿名记录', (await actTotal('退出登录')) === oBefore, `before=${oBefore}`);
      delete userSess['2023003'];   // 退掉的会话不能留给后面的用例
    }
  }

  // 20. 班委能力清单：通知（发布 / 勾选完成 / 置顶）、接龙与投票与抽签的全套管理（不区分发起人）、
  //     收录与丢弃待审核、删除留言；仍然不行的是删信息与整份换名单、看名单与账号与班费与备份与操作记录、
  //     看匿名投票谁投给谁（明细、整班名单与学号都不下发）
  {
    r = await j('/api/users/2023005', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'officer' }) });
    ok('管理员把某学号设为班委', r.status === 200, JSON.stringify(r.body));
    const off = await userSession('2023005'); // 先设角色再登录，拿到的会话才带班委身份
    const op = (path, body) => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: off }, body: JSON.stringify(body || {}) }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    const opu = (path, body) => fetch(BASE + path, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: off }, body: JSON.stringify(body || {}) }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    const og = (path) => fetch(BASE + path, { headers: { Cookie: off } }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    const od = (path) => fetch(BASE + path, { method: 'DELETE', headers: { Cookie: off } }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    const ogText = async (path) => { const x = await fetch(BASE + path, { headers: { Cookie: off } }); return { status: x.status, type: x.headers.get('content-type') || '', text: await x.text() }; };
    const mk = await op('/api/messages', { title: '自检班委通知', content: '班委发的通知' });
    ok('班委能发通知', mk.status === 200 && mk.body.id > 0, JSON.stringify(mk.body));
    const mkId = mk.body && mk.body.id;
    if (mkId) created.messages.push(mkId);
    // 勾选完成 / 置顶：班委的日常就是盯这些勾选框
    const offToggle = mkId ? await op(`/api/messages/${mkId}/toggle`, {}) : { status: 0 };
    ok('班委能勾选完成', offToggle.status === 200 && offToggle.body.status === 'done', JSON.stringify(offToggle.body));
    const offPin = mkId ? await op(`/api/messages/${mkId}/pin`, {}) : { status: 0 };
    ok('班委能置顶通知', offPin.status === 200 && offPin.body.pinned === 1, JSON.stringify(offPin.body));
    const stuToggle = await upost('2023001', `/api/messages/${mkId}/toggle`, {});
    ok('同学不能勾选完成（401）', stuToggle.status === 401, 'status=' + stuToggle.status);
    const offEdit = await fetch(BASE + '/api/messages/' + mkId, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: off }, body: JSON.stringify({ title: '班委改标题' }) });
    ok('班委不能编辑通知正文（401，改内容与删一样归管理员）', offEdit.status === 401, 'status=' + offEdit.status);
    // 接龙全套：发起 / 改标题 / 停止 / 删某条 / 导出 / 删除，但整份名单不许班委替换（会把学号冲掉）
    {
      const jlp = await op('/api/jielong', { title: '自检班委接龙', rosterRaw: '2023005 王五明\n2023001 张三', keepId: true, fields: [{ key: 'f0', label: '姓名', type: 'text', required: true }] });
      ok('班委能发起接龙', jlp.status === 200 && !!jlp.body.id, JSON.stringify(jlp.body));
      const jlid = jlp.body.id;
      await upost('2023001', `/api/jielong/${jlid}/join`, { values: { f0: '张三' } });
      const jlEdit = await opu('/api/jielong/' + jlid, { title: '班委改的接龙', deadline: null, allowOutside: false });
      const jlAdminAfter = await j('/api/jielong/' + jlid);
      ok('班委能改接龙标题与开关，且学号没被冲掉',
        jlEdit.status === 200 && jlAdminAfter.status === 200 && jlAdminAfter.body.title === '班委改的接龙'
        && jlAdminAfter.body.allowOutside === false && jlAdminAfter.body.roster.length === 2
        && jlAdminAfter.body.roster[0].id === '2023005',
        JSON.stringify({ st: jlEdit.status, roster: jlAdminAfter.body && jlAdminAfter.body.roster }));
      const jlWash = await opu('/api/jielong/' + jlid, { rosterRaw: '王五明\n张三', keepId: false });
      ok('班委整份替换名单被拒（403，避免学号被脱敏视图冲掉）', jlWash.status === 403, JSON.stringify([jlWash.status, jlWash.body]));
      const jlOffView = await og('/api/jielong/' + jlid);
      ok('班委看接龙：名单、记录、未接都带学号（2026-10-31 口径）',
        jlOffView.status === 200 && jlOffView.body.roster.every((x) => !!x.id)
        && jlOffView.body.entries.every((e) => !!e.id)
        && (jlOffView.body.missing || []).every((m) => !!m.id),
        JSON.stringify({ roster: jlOffView.body.roster, entries: jlOffView.body.entries }));
      const jlOffClose = await op(`/api/jielong/${jlid}/close`, { closed: true });
      ok('班委能停止接龙', jlOffClose.status === 200 && jlOffClose.body.closed === true, JSON.stringify(jlOffClose.body));
      const jlOffEntry = await od(`/api/jielong/${jlid}/entry?rid=1`);
      ok('班委能删除某条接龙记录', jlOffEntry.status === 200, JSON.stringify(jlOffEntry.body));
      const offCsv = await ogText('/api/jielong/' + jlid + '/export');
      const adCsv = await withCookie('/api/jielong/' + jlid + '/export', {}, cookie).then((x) => x.text());
      ok('班委能导出 CSV，导出里同样带学号（2026-10-31 口径）',
        offCsv.status === 200 && /csv/.test(offCsv.type) && offCsv.text.includes('张三')
        && offCsv.text.includes('2023005') && adCsv.includes('2023005'),
        JSON.stringify({ st: offCsv.status, off: offCsv.text.slice(0, 60) }));
      const stuJlEdit = await fetch(BASE + '/api/jielong/' + jlid, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: await userSession('2023001') }, body: JSON.stringify({ title: '同学改不动' }) });
      ok('同学不能改接龙（401）', stuJlEdit.status === 401, 'status=' + stuJlEdit.status);
      const jlOffDel = await od('/api/jielong/' + jlid);
      const afterDel = await j('/api/jielong/' + jlid);
      ok('班委能删除整个接龙', jlOffDel.status === 200 && afterDel.status === 404, JSON.stringify([jlOffDel.status, afterDel.status]));
    }
    // 抽签全套：建箱 / 抽 / 撤销 / 重置 / 改标题 / 删除，同样拿不到学号
    {
      const dwc = await op('/api/draw', { title: '自检班委签箱', rosterRaw: '2023005 王五明\n2023001 张三\n2023002 李四', keepId: true, perDraw: 1 });
      ok('班委能新建签箱', dwc.status === 200 && !!dwc.body.id, JSON.stringify(dwc.body));
      const dwid = dwc.body.id;
      const dwGo = await op(`/api/draw/${dwid}/go`, { count: 2 });
      ok('班委能抽签，抽中名单带学号（2026-10-31 口径）',
        dwGo.status === 200 && dwGo.body.picked.length === 2 && dwGo.body.picked.every((p) => !!p.id),
        JSON.stringify(dwGo.body.picked));
      const dwAd = await j('/api/draw/' + dwid);
      ok('同一轮记录在管理员视角里仍带学号', dwAd.body.rounds[0].picked.every((p) => !!p.id), JSON.stringify(dwAd.body.rounds[0].picked));
      const dwUndo = await op(`/api/draw/${dwid}/undo`, {});
      ok('班委能撤销上一轮，放回名单带学号（2026-10-31 口径）',
        dwUndo.status === 200 && dwUndo.body.restored.every((p) => !!p.id), JSON.stringify(dwUndo.body.restored));
      ok('班委能重置签箱', (await op(`/api/draw/${dwid}/reset`, {})).status === 200);
      const dwEdit = await opu('/api/draw/' + dwid, { title: '班委改的签箱', perDraw: 2 });
      const dwAdEdit = await j('/api/draw/' + dwid);
      ok('班委能改签箱标题与每次抽几人，学号保留',
        dwEdit.status === 200 && dwAdEdit.body.title === '班委改的签箱' && dwAdEdit.body.perDraw === 2
        && dwAdEdit.body.roster.every((x) => !!x.id),
        JSON.stringify({ st: dwEdit.status, roster: dwAdEdit.body.roster }));
      ok('班委整份替换签箱名单被拒（403）', (await opu('/api/draw/' + dwid, { rosterRaw: '王五明', keepId: false })).status === 403);
      const stuGo = await upost('2023001', `/api/draw/${dwid}/go`, { count: 1 });
      ok('同学不能抽签（401）', stuGo.status === 401, 'status=' + stuGo.status);
      const dwDel = await od('/api/draw/' + dwid);
      ok('班委能删除签箱', dwDel.status === 200 && (await j('/api/draw/' + dwid)).status === 404, JSON.stringify(dwDel.body));
    }
    // 匿名投票的"谁投给谁"只归系统管理员：班委能改能停能删，但明细、整班名单与学号都拿不到
    {
      const av = await op('/api/vote', { title: '自检匿名只管理员可见', optionsRaw: '赞成\n反对', rosterRaw: '2023005 王五明\n2023001 张三\n2023002 李四', keepId: true });
      const avId = av.body && av.body.id;
      await upost('2023005', `/api/vote/${avId}/ballot`, { choices: ['o0'] });
      await upost('2023001', `/api/vote/${avId}/ballot`, { choices: ['o1'] });
      const asOfficer = await og('/api/vote/' + avId);
      ok('匿名投票：班委看不到是谁投的（无选票明细）',
        asOfficer.status === 200 && Array.isArray(asOfficer.body.tally) && asOfficer.body.done === 2
        && asOfficer.body.ballots === undefined && Array.isArray(asOfficer.body.roster)
        && asOfficer.body.roster.every((x) => !!x.id),
        JSON.stringify(Object.keys(asOfficer.body || {})));
      ok('班委能催票：未投名单带学号与槽位序号（2026-10-31 口径）',
        Array.isArray(asOfficer.body.missing) && asOfficer.body.missing.length === 1
        && asOfficer.body.missing[0].name === '李四' && asOfficer.body.missing[0].id === '2023002'
        && asOfficer.body.missing[0].i === 2 && typeof asOfficer.body.missing[0].bound === 'boolean',
        JSON.stringify(asOfficer.body.missing));
      const asPlain = await uget('2023001', '/api/vote/' + avId);
      ok('普通同学看不到未投名单', asPlain.status === 200 && asPlain.body.missing === undefined, JSON.stringify(Object.keys(asPlain.body || {})));
      const asAdmin = await j('/api/vote/' + avId);
      ok('匿名投票：只有系统管理员能看到明细与学号',
        Array.isArray(asAdmin.body.ballots) && asAdmin.body.ballots.length === 2
        && asAdmin.body.ballots.some((b) => b.sid === '2023001' && b.name === '张三')
        && asAdmin.body.missing.length === 1 && asAdmin.body.missing[0].id === '2023002',
        JSON.stringify({ ballots: asAdmin.body.ballots, missing: asAdmin.body.missing }));
      const avEdit = await opu('/api/vote/' + avId, { title: '班委改名', optionsAppend: '弃权不投' });
      const avStop = await op(`/api/vote/${avId}/stop`, {});
      const avAdmin = await j('/api/vote/' + avId);
      ok('班委能改匿名投票的标题与追加选项，也能停止投票',
        avEdit.status === 200 && avStop.status === 200 && avAdmin.body.title === '班委改名'
        && avAdmin.body.closed === true && avAdmin.body.options.length === 3
        && avAdmin.body.ballots.length === 2,   // 追加选项没动已有选票
        JSON.stringify({ st: [avEdit.status, avStop.status], title: avAdmin.body.title, closed: avAdmin.body.closed }));
      // 关掉改票后，班委也不能替别人覆盖选票——越过这把锁的只有系统管理员
      const lockVote = await op('/api/vote', { title: '自检改票锁', optionsRaw: '甲\n乙', allowChange: false, rosterRaw: '2023005 王五明\n2023001 张三\n2023002 李四', keepId: true });
      const lockId = lockVote.body.id;
      await upost('2023001', `/api/vote/${lockId}/ballot`, { choices: ['o0'] });
      const offRevote = await upost('2023005', `/api/vote/${lockId}/ballot`, { choices: ['o1'] });
      const offOverride = await upost('2023001', `/api/vote/${lockId}/ballot`, { choices: ['o1'] });
      ok('不允许改票时班委也替不了别人（本人重投被拒）',
        offRevote.status === 200 && offOverride.status === 409, JSON.stringify([offRevote.status, offOverride.status]));
      await j('/api/vote/' + lockId, { method: 'DELETE' });
      // 记名投票相反：明细本来就对全班公开，但学号只有管理员能看到
      const nv = await op('/api/vote', { title: '自检记名班委可见', optionsRaw: '赞成\n反对', anonymous: false, rosterRaw: '2023005 王五明', keepId: true });
      const nvId = nv.body && nv.body.id;
      await upost('2023005', `/api/vote/${nvId}/ballot`, { choices: ['o0'] });
      const asOfficer2 = await og('/api/vote/' + nvId);
      ok('记名投票：班委能看到是谁投的，但看不到学号',
        Array.isArray(asOfficer2.body.ballots) && asOfficer2.body.ballots.length === 1 && !('sid' in asOfficer2.body.ballots[0]),
        JSON.stringify(asOfficer2.body.ballots));
      const stuVoteEdit = await fetch(BASE + '/api/vote/' + avId, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: await userSession('2023001') }, body: JSON.stringify({ title: '同学改不动' }) });
      ok('同学不能改投票（401）', stuVoteEdit.status === 401, 'status=' + stuVoteEdit.status);
      const avDel = await od('/api/vote/' + avId);
      ok('班委能删除投票（连选票一起）',
        avDel.status === 200 && (await j('/api/vote/' + avId)).status === 404, JSON.stringify(avDel.body));
      await j('/api/vote/' + nvId, { method: 'DELETE' });
    }
    // 待审核：收录本来就归班委，丢弃也一样（用不存在的 id 探门槛，绝不空手清空真实收件箱）
    {
      const noItem = await od('/api/inbox/99999999');
      ok('班委能丢弃待审核（不存在的 id 报 404，说明门槛已放行）', noItem.status === 404, 'status=' + noItem.status);
      const stuDismiss = await fetch(BASE + '/api/inbox/99999999', { method: 'DELETE', headers: { Cookie: await userSession('2023001') } });
      ok('同学不能丢弃待审核（401）', stuDismiss.status === 401, 'status=' + stuDismiss.status);
      if (reviewMode) {
        const one = await rep({ ...obPayload, sender: { card: '孙老师', nickname: 's' }, message: [{ type: 'text', data: { text: '班委丢弃测试消息本身，请忽略' } }] });
        if (one.status === 200 && one.body.id) {
          const gone = await od('/api/inbox/' + one.body.id);
          const list = await og('/api/inbox?limit=500');
          ok('班委真的丢弃了一条待审核',
            gone.status === 200 && !(list.body.items || []).some((x) => x.id === one.body.id), JSON.stringify(gone.body));
        } else ok('班委真的丢弃了一条待审核', false, '造待审核失败：' + JSON.stringify(one.body));
      }
    }
    const vp = await op('/api/vote', { title: '自检班委投票', optionsRaw: 'A\nB', rosterRaw: '2023005 王五明', keepId: true });
    ok('班委能发起投票', vp.status === 200 && !!vp.body.id, JSON.stringify(vp.body));
    if (vp.body && vp.body.id) await j('/api/vote/' + vp.body.id, { method: 'DELETE' });
    // 留言按 IP 限速，本轮前面已经发过几条：撞上窗口就等它滑过去再试
    let gb = { status: 429 };
    for (let i = 0; i < 6; i++) {
      gb = await op('/api/guestbook', { content: '自检班委留言' });
      if (gb.status !== 429) break;
      await new Promise((res) => setTimeout(res, 12000));
    }
    ok('班委能发留言', gb.status === 200 && gb.body.id, JSON.stringify(gb.body));
    const gbId = gb.body && gb.body.id;
    if (gbId) created.guestbook.push(gbId);
    const gbDel = gbId ? await od('/api/guestbook/' + gbId) : { status: 0, body: null };
    ok('班委能删除留言', gbDel.status === 200, JSON.stringify(gbDel.body));
    if (gbId) await j('/api/guestbook/' + gbId, { method: 'DELETE' });
    // 点子的状态与公开回复：公开征集里班委也能改（值班时先标一句「收到」），改动进操作记录
    if (ideaId && campPublic) {
      const upd = await opu('/api/guestbook/' + ideaId, { status: 'accepted', reply: '好主意，下周班会上定' });
      const stuView = await uget('2023001', '/api/campaigns/' + campPublic);
      const seen = (stuView.body.items || []).find((x) => x.id === ideaId);
      ok('班委能改公开征集里的点子状态并写公开回复，同学看得到',
        upd.status === 200 && !!seen && seen.status === 'accepted'
        && seen.reply === '好主意，下周班会上定' && !!seen.reply_at && seen.sid === undefined,
        JSON.stringify(seen));
      const badStatus = await opu('/api/guestbook/' + ideaId, { status: 'nope' });
      ok('点子状态只认四个值（400）', badStatus.status === 400, JSON.stringify(badStatus.body));
      r = await j('/api/audit?action=' + encodeURIComponent('更新点子') + '&limit=20');
      ok('改点子状态进操作记录（写清状态与回复）',
        (r.body.items || []).some((x) => (x.detail || '').includes('状态→采纳') && (x.detail || '').includes('回复「好主意')),
        JSON.stringify((r.body.items || [])[0] && (r.body.items || [])[0].detail));
      // 私密征集：班委只能看到「匿名公开」的那条；状态 / 回复只归系统管理员
      if (campPrivate && privIdeaId) {
        const offShared = await og('/api/campaigns/' + campPrivate);
        ok('班委能看到私密征集里「匿名公开」的那条（仍是匿名）',
          offShared.status === 200 && (offShared.body.items || []).length === 1
          && offShared.body.items[0].nickname === '匿名' && offShared.body.items[0].sid === undefined,
          JSON.stringify(offShared.body.items));
        const offPrivPut = await opu('/api/guestbook/' + privIdeaId, { status: 'accepted' });
        ok('班委改不了私密征集里的点子（401）', offPrivPut.status === 401, 'status=' + offPrivPut.status);
        const offPrivDl = await og('/api/idea-attachments/' + privAttId + '/download');
        ok('匿名公开的附件班委也能下载', offPrivDl.status === 200, 'status=' + offPrivDl.status);
        // 没公开的提交：班委看不到（用导入造一条，免得再占留言墙的限速额度）
        await post('/api/import?force=1', {
          groups: [], messages: [],
          ideaCampaigns: [{ id: 'offcp1', title: '班委可见性', visibility: 'private', closed: 0, created_at: 1 }],
          guestbook: [{ id: 7701, nickname: '甲', content: '不公开的一条', kind: 'idea', campaign_id: 'offcp1', anonymous: 1, sid: '2023001', created_at: '2030-03-01 10:00' }],
        });
        const offHidden = await og('/api/campaigns/offcp1');
        ok('班委看不到私密征集里未公开的提交（只看得到份数）',
          offHidden.status === 200 && (offHidden.body.items || []).length === 0 && offHidden.body.count === 1,
          JSON.stringify({ items: (offHidden.body.items || []).length, count: offHidden.body.count }));
        await j('/api/campaigns/offcp1', { method: 'DELETE' });
        const admPut = await j('/api/guestbook/' + privIdeaId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'accepted', reply: '记下了，我想想' }) });
        ok('私密征集的状态与回复只归系统管理员', admPut.status === 200, JSON.stringify(admPut.body));
        // 删征集连带清提交与附件
        r = await j('/api/campaigns/' + campPrivate, { method: 'DELETE' });
        const privCampGone = await j('/api/campaigns/' + campPrivate);
        const privAttGone = await sf('/api/idea-attachments/' + privAttId + '/download');
        ok('删除征集连带清掉提交与附件（详情 404、附件 404）',
          r.status === 200 && privCampGone.status === 404 && privAttGone.status === 404,
          JSON.stringify([r.status, privCampGone.status, privAttGone.status]));
      }
    }
    // 征集关闭后不能再提交（放在这里避开留言墙「一分钟 6 条」的窗口）
    {
      const cc = await post('/api/campaigns', { title: '自检已关闭征集' });
      const ccId = cc.body && cc.body.id;
      await j('/api/campaigns/' + ccId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closed: true }) });
      let closedPost = { status: 429 };
      for (let i = 0; i < 6; i++) {
        closedPost = await op('/api/guestbook', { kind: 'idea', campaign: ccId, content: '关门后提交' });
        if (closedPost.status !== 429) break;
        await new Promise((res) => setTimeout(res, 12000));
      }
      ok('征集关闭后不能再提交（400）', closedPost.status === 400, JSON.stringify(closedPost.body));
      await j('/api/campaigns/' + ccId, { method: 'DELETE' });
    }
    // 提交人自删点子：同学能删自己发的，删别人的被拒（2026-11-01）
    {
      const mkRos2 = await post('/api/rosters', { name: '自检自删名单', rosterRaw: '2023001 张三\n2023002 李四', keepId: true });
      if (mkRos2.body && mkRos2.body.id) created.rosters.push(mkRos2.body.id);
      await j('/api/users/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterId: mkRos2.body.id }) });
      // 复位 2023001 为普通同学（前面的班委用例可能把它升成了班委），重登录拿新会话
      await j('/api/users/2023001', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student' }) });
      delete userSess['2023001'];
      const cc = await post('/api/campaigns', { title: '自检点子自删' });
      const ccId = cc.body && cc.body.id;
      if (ccId) created.campaigns.push(ccId);
      let mk = { status: 429 }, myId = null;
      for (let i = 0; i < 6 && mk.status === 429; i++) {
        mk = await upost('2023002', '/api/guestbook', { kind: 'idea', campaign: ccId, content: '李四发错了内容' });
        if (mk.status === 429) await new Promise((res) => setTimeout(res, 12000));
      }
      myId = mk.body && mk.body.id;
      ok('学生提交点子', mk.status === 200 && !!myId, JSON.stringify(mk.body).slice(0, 120));
      const delOther = await udel('2023001', '/api/guestbook/' + myId);
      ok('同学不能删别人的点子（401）', delOther.status === 401, 'status=' + delOther.status);
      const delOwn = await udel('2023002', '/api/guestbook/' + myId);
      ok('提交人能删除自己发的点子', delOwn.status === 200 && delOwn.body.ok === true, JSON.stringify(delOwn.body));
      const det = await j('/api/campaigns/' + ccId);
      ok('删除后点子从征集详情消失', ((det.body.ideas || []).every((x) => x.id !== myId)), JSON.stringify((det.body.ideas || []).map((x) => x.id)));
      await j('/api/campaigns/' + ccId, { method: 'DELETE' });
    }
    const noDel = await od('/api/messages/' + mkId);
    ok('班委不能删除信息（401）', noDel.status === 401, 'status=' + noDel.status);
    const noRoster = await og('/api/rosters');
    const rosMeta = noRoster.body && Array.isArray(noRoster.body.items) ? noRoster.body.items : null;
    ok('班委可选用班级名单（2026-10-31 口径：名单全文对班委可见）', noRoster.status === 200
      && rosMeta !== null && rosMeta.every((x) => typeof x.roster === 'string'),
      'status=' + noRoster.status);
    const noUsers = await og('/api/users');
    ok('班委看不到账号管理（401）', noUsers.status === 401);
    const noFund = await op('/api/funds', { type: 'expense', amount: 1 });
    ok('班委不能记班费（401）', noFund.status === 401);
    const noExport = await og('/api/export');
    ok('班委不能导出全量备份（401）', noExport.status === 401);
    const noAudit = await og('/api/audit');
    ok('班委看不到全部操作记录（401）', noAudit.status === 401);
    const noAuditCsv = await og('/api/audit/export');
    ok('导出操作记录同样只归系统管理员（班委 401）', noAuditCsv.status === 401, 'status=' + noAuditCsv.status);
    const stuAudit = await uget('2023001', '/api/audit/export');
    ok('同学也导不出操作记录（401）', stuAudit.status === 401, 'status=' + stuAudit.status);
    const ownAudit = await og('/api/audit/mine');
    ok('班委也看不到操作记录（含自己那条，401 / 404）',
      noAudit.status === 401 && ownAudit.status === 404, JSON.stringify([noAudit.status, ownAudit.status]));
    // 降回普通同学：旧会话必须作废，否则降权对已登录的人不生效
    r = await j('/api/users/2023005', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student' }) });
    ok('降回普通同学', r.status === 200);
    const stale = await op('/api/messages', { title: '旧会话应失效' });
    ok('角色变更后旧会话作废（401）', stale.status === 401, 'status=' + stale.status);
  }

  // 21. 本人改密链路与"登录即可用"的只读型 POST（写门槛上线时把 /api/password 一起挡了，
  // 结果全班都改不掉初始密码；自检此前完全没覆盖改密，所以 336 项全绿也照不出来）
  if (authRequired) {
    const loginAs = (pw) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: '2023003', password: pw }) })
      .then(async (x) => ({ status: x.status, ck: (x.headers.get('set-cookie') || '').split(';')[0] }));
    const s1 = await loginAs('023003');
    const s2 = await loginAs('023003');   // 模拟密码外泄后另一台设备也挂着
    const chg = await fetch(BASE + '/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: s1.ck },
      body: JSON.stringify({ oldPassword: '023003', newPassword: '自检新密码99' }) }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    ok('同学能改自己的密码（不被写门槛挡成 401）', chg.status === 200, JSON.stringify([chg.status, chg.body]));
    const oldAgain = await loginAs('023003');
    const newAgain = await loginAs('自检新密码99');
    ok('改密后旧密码失效、新密码可登录', oldAgain.status === 401 && newAgain.status === 200, JSON.stringify([oldAgain.status, newAgain.status]));
    const meOld2 = await fetch(BASE + '/api/me', { headers: { Cookie: s2.ck } }).then((x) => x.json());
    const meKeep = await fetch(BASE + '/api/me', { headers: { Cookie: s1.ck } }).then((x) => x.json());
    ok('改密作废旧会话、保留当前会话（怀疑密码被知道时才改密）',
      !meOld2.loggedIn && !!meKeep.loggedIn && meKeep.sid === '2023003', JSON.stringify([meOld2, meKeep]));
    r = await j('/api/users/2023003', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) });
    ok('管理员把密码重置回初始值', r.status === 200, JSON.stringify(r.body));
    delete userSess['2023003'];
    const sim = await upost('2023003', '/api/similar', { text: '自检查重用的唯一标记串' });
    ok('同学能用查重接口（班委发通知前也得查重）', sim.status === 200, JSON.stringify([sim.status, sim.body]));
    const parseAnon = await fetch(BASE + '/api/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '明天下午4点交回执' }) });
    ok('文本解析不再对未登录开放', parseAnon.status === 401, 'status=' + parseAnon.status);
    const parseOk = await post('/api/parse', { text: '明天下午4点交回执' });
    ok('登录后仍可解析文本', parseOk.status === 200 && !!parseOk.body.parsed, JSON.stringify(parseOk.body).slice(0, 60));
    const expInbox = await j('/api/export');
    ok('备份导出含待审核收件箱', Array.isArray(expInbox.body.inbox), JSON.stringify(Object.keys(expInbox.body || {})));
    // 备份里的选票若 rid 越界 / 缺失 / 重复，会绕开 UNIQUE(vote_id,rid) 的部分索引重复计票
    const badVote = { id: 'rbad101', title: '自检坏选票投票', description: '', deadline: '', closed: 0, anonymous: 1,
      roster: JSON.stringify([{ id: '2023001', name: '张三' }, { id: '2023002', name: '李四' }]),
      options: JSON.stringify([{ key: 'o0', label: '赞成' }]), max_select: 1, reveal: 'always', allow_change: 1, created_at: 1 };
    r = await post('/api/import?force=1', { groups: [], messages: [], votes: [badVote],
      voteBallots: [
        { vote_id: 'rbad101', rid: 99, sid: '2023001', name: '张三', choices: ['o0'], time: 1 },
        { vote_id: 'rbad101', rid: 0, sid: '2023001', name: '张三', choices: ['o0'], time: 2 },
        { vote_id: 'rbad101', rid: null, sid: '2023002', name: '李四', choices: ['o0'], time: 3 },
        { vote_id: 'rbad101', rid: null, sid: '', name: '幽灵', choices: [], time: 4 },
      ] });
    const vb = await j('/api/vote/rbad101');
    ok('导入选票按学号对回槽位、重复与无主的丢弃',
      r.status === 200 && r.body.voteBallots === 2 && vb.body.done === 2
      && (vb.body.ballots || []).length === 2 && vb.body.ballots.every((x) => x.rid === 0 || x.rid === 1),
      JSON.stringify({ imported: r.body.voteBallots, ballots: vb.body.ballots }));
    await j('/api/vote/rbad101', { method: 'DELETE' });
  }

  // ---- 问卷模板 CRUD ----
  {
    // 创建模板
    const tpl1 = await post('/api/survey-template', {
      name: '自检模板A',
      title: '自检问卷标题',
      description: '自检说明',
      questions: [
        { question: '问题1', qtype: 'single', options: ['选项A', '选项B'], required: true },
        { question: '问题2', qtype: 'text', options: [], required: false }
      ]
    });
    ok('创建问卷模板', tpl1.status === 200 && tpl1.body.ok && tpl1.body.id > 0, JSON.stringify(tpl1.body));
    if (tpl1.body.id) created.surveyTemplates = (created.surveyTemplates || []);
    created.surveyTemplates.push(tpl1.body.id);

    // 列表
    const list = await j('/api/survey-template');
    ok('获取模板列表', list.status === 200 && Array.isArray(list.body) && list.body.length >= 1, JSON.stringify({ status: list.status, len: list.body?.length }));

    // 更新模板
    const upd = await j('/api/survey-template/' + tpl1.body.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '自检模板A改', title: '新标题', questions: [{ question: '新问题', qtype: 'rating', options: ['1', '2', '3'], required: true }] })
    });
    ok('更新问卷模板', upd.status === 200 && upd.body.ok, JSON.stringify(upd.body));

    // 验证更新
    const list2 = await j('/api/survey-template');
    const found = list2.body.find((t) => t.id === tpl1.body.id);
    ok('更新后模板名称变化', found && found.name === '自检模板A改' && found.questions.length === 1, JSON.stringify(found));

    // 创建第二个模板用于删除测试
    const tpl2 = await post('/api/survey-template', {
      name: '待删除模板',
      title: '',
      description: '',
      questions: [{ question: '随便问问', qtype: 'text', options: [], required: false }]
    });
    ok('创建第二个模板', tpl2.status === 200 && tpl2.body.id > 0, JSON.stringify(tpl2.body));

    // 删除模板
    const del = await j('/api/survey-template/' + tpl2.body.id, { method: 'DELETE' });
    ok('删除问卷模板', del.status === 200 && del.body.ok, JSON.stringify(del.body));

    // 验证删除
    const list3 = await j('/api/survey-template');
    const gone = list3.body.find((t) => t.id === tpl2.body.id);
    ok('删除后模板不存在', !gone, JSON.stringify(gone));

    // 权限：普通同学不能创建/修改/删除模板
    const stuCreate = await upost('2023001', '/api/survey-template', { name: '不该成功', questions: [{ question: 'q', qtype: 'text', options: [], required: false }] });
    ok('同学不能创建模板（401）', stuCreate.status === 401, 'status=' + stuCreate.status);
    const stuUpdate = await fetch(BASE + '/api/survey-template/' + tpl1.body.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: userSess['2023001'] },
      body: JSON.stringify({ name: '不该改' })
    });
    ok('同学不能更新模板（401）', stuUpdate.status === 401, 'status=' + stuUpdate.status);
    const stuDelete = await fetch(BASE + '/api/survey-template/' + tpl1.body.id, {
      method: 'DELETE',
      headers: { Cookie: userSess['2023001'] }
    });
    ok('同学不能删除模板（401）', stuDelete.status === 401, 'status=' + stuDelete.status);

    // 校验：空名称、空问题、选项不足
    const badName = await post('/api/survey-template', { name: '', questions: [{ question: 'q', qtype: 'text', options: [], required: false }] });
    ok('模板名称不能为空（400）', badName.status === 400, 'status=' + badName.status);
    const noQ = await post('/api/survey-template', { name: '无问题', questions: [] });
    ok('模板至少一个问题（400）', noQ.status === 400, 'status=' + noQ.status);
    const badOpts = await post('/api/survey-template', { name: '选项不足', questions: [{ question: 'q', qtype: 'single', options: ['只有一个'], required: true }] });
    ok('选择题选项至少2个（400）', badOpts.status === 400, 'status=' + badOpts.status);

    // 备份往返：模板已进导出/导入清单，但「代码里写了」不等于「跑得通」——
    // 上一轮就是把 nSt 声明落在 try 块内、summary 在块外引用，每次导入成功反而 500，
    // 而全绿只覆盖有断言的地方，所以这里必须真的导一次再读回来
    const expTpl = await j('/api/export');
    const inExport = (expTpl.body.surveyTemplates || []).find((t) => t.name === '自检模板A改');
    ok('备份导出含问卷模板且问题原样带走', !!inExport && Array.isArray(JSON.parse(inExport.questions)) && JSON.parse(inExport.questions).length === 1,
      JSON.stringify({ keys: Object.keys(expTpl.body || {}).includes('surveyTemplates'), got: inExport && inExport.name }));

    const rtBackup = {
      groups: [], messages: [],
      surveyTemplates: [{ name: '自检导入模板RT', title: 'RT标题', description: 'RT说明',
        questions: JSON.stringify([{ question: '导入题', qtype: 'multiple', options: ['甲', '乙'], required: true }]),
        created_at: 1, updated_at: 2 }],
    };
    const impTpl = await j('/api/import?force=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rtBackup) });
    ok('备份导入模板返回成功（不再 500）', impTpl.status === 200 && impTpl.body.ok && impTpl.body.surveyTemplates === 1, JSON.stringify({ st: impTpl.status, body: impTpl.body }));
    const afterImp = await j('/api/survey-template');
    const rtRow = (afterImp.body || []).find((t) => t.name === '自检导入模板RT');
    ok('导入的模板可读回且问题解析成数组', !!rtRow && rtRow.title === 'RT标题' && Array.isArray(rtRow.questions) && rtRow.questions[0].question === '导入题',
      JSON.stringify(rtRow && { n: rtRow.name, t: rtRow.title, q: rtRow.questions }));
    // 合并导入（force=1）的语义是「并进来」，不是「换成这份」：
    // 曾按整表 DELETE 写法实现，用户做一次 force 合并就会抹光自己真实的模板库
    ok('force 合并不抹掉导入前已有的模板', (afterImp.body || []).some((t) => t.id === tpl1.body.id),
      JSON.stringify((afterImp.body || []).map((t) => t.name)));
    if (rtRow) created.surveyTemplates.push(rtRow.id);
  }

  // ---- 问卷主流程：提交 / 归一化 / 截止 / 导出 / 编辑守卫 ----
  // 模板 CRUD 之外，提交与导出这条链曾经没人测：CSV 导出的响应头里带中文文件名会
  // ERR_INVALID_CHAR，而 res.wrote 已置真导致异常被 dispatcher 吞掉、客户端永远挂起——
  // 全绿的自检愣是没发现。这条链的每一环都要有断言。
  {
    const mk = await post('/api/survey', {
      title: '自检主流程问卷',
      rosterRaw: '2023001 张三\n2023002 李四',
      keepId: true,
      questions: [
        { question: '单选题', qtype: 'single', options: ['甲', '乙'], required: true },
        { question: '数字题', qtype: 'number', options: [], required: false },
        { question: '文本题', qtype: 'text', options: [], required: false },
      ],
    });
    ok('创建混合题型问卷（含数字/日期题不炸）', mk.status === 200 && mk.body.ok && /^[a-z0-9]+$/.test(mk.body.id || ''), JSON.stringify(mk.body));
    if (mk.body.id) {
      created.surveys.push(mk.body.id);
      const svId = mk.body.id;
      const detail = await j('/api/survey/' + svId);
      const qid = detail.body.questions[0].id;
      // 按位置索引提交（1,2,3...）：入库必须归一化到题目 id，否则导出/统计读到空答案
      const sub = await upost('2023001', '/api/survey/' + svId + '/submit', { answers: { 1: '甲', 2: '18', 3: '=HYPERLINK("http://evil")' } });
      ok('按位置索引提交成功', sub.status === 200 && sub.body.ok, JSON.stringify(sub.body));
      const mine = await j('/api/survey/' + svId);
      const stored = (mine.body.responses || [])[0] || {};
      ok('位置键答案归一化到题目 id', !!stored.answers && stored.answers[String(qid)] === '甲'
        && Object.keys(stored.answers).every((k) => detail.body.questions.some((q) => String(q.id) === k)),
        JSON.stringify(stored.answers));
      // CSV 导出：曾因中文文件名挂死（无响应），且公式答案要被中和
      const csv = await sf('/api/survey/' + svId + '/export');
      const csvText = await csv.text();
      ok('CSV 导出返回 200（曾因中文文件名整请求挂死）', csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type') || ''),
        'status=' + csv.status);
      ok('CSV 公式答案被中和（前缀撇号）', csvText.includes("'=HYPERLINK") && !csvText.includes('"=HYPERLINK'),
        JSON.stringify(csvText));
      ok('CSV 无双重转义（引号成对）', !csvText.includes('""""""'), JSON.stringify(csvText));
      // 编辑规则分两层：元数据（标题/说明/截止）随时可改；题目/分组有提交后锁定
      const editMeta = await j('/api/survey/' + svId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '自检主流程问卷·改', deadline: '2030-06-30 18:00' }) });
      const afterMeta = await j('/api/survey/' + svId);
      ok('已有提交仍可改标题与截止时间', editMeta.status === 200 && afterMeta.body.title === '自检主流程问卷·改'
        && afterMeta.body.deadline === '2030-06-30 18:00' && afterMeta.body.questions.length === 3,
        JSON.stringify({ st: editMeta.status, dl: afterMeta.body.deadline }));
      const editQ = await j('/api/survey/' + svId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: [{ question: '新题', qtype: 'single', options: ['甲', '乙'], required: true }] }) });
      const afterQ = await j('/api/survey/' + svId);
      ok('已有提交时题目编辑被拒（400）且题目原样保留', editQ.status === 400 && afterQ.body.questions.length === 3,
        'status=' + editQ.status + ' ' + JSON.stringify(editQ.body));
      // 停止后再编辑 → 400
      const stop2 = await j('/api/survey/' + svId + '/stop', { method: 'POST' });
      const editStopped = await j('/api/survey/' + svId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '不该成功' }) });
      ok('已停止问卷编辑被拒（400）', stop2.status === 200 && editStopped.status === 400, 'status=' + editStopped.status);
    }

    // 备份往返：问题 id 不保留的话，恢复后 answers 的旧键会全部指空（统计/明细/CSV 全读不到）。
    // 同库 force 重导时旧 id 已被占用、必然换新号——正好验证「换号后答案键跟着重映射」
    {
      const mk = await post('/api/survey', {
        title: '自检备份往返问卷',
        rosterRaw: '2023001 张三',
        keepId: true,
        questions: [
          { question: '选一个', qtype: 'single', options: ['甲', '乙'], required: true },
          { question: '写一句', qtype: 'text', options: [], required: false },
        ],
      });
      if (mk.body.id) {
        created.surveys.push(mk.body.id);
        const d1 = await j('/api/survey/' + mk.body.id);
        const qid1 = d1.body.questions[0].id;
        await upost('2023001', '/api/survey/' + mk.body.id + '/submit', { answers: { [qid1]: '乙', [d1.body.questions[1].id]: '往返验证' } });
        const backup = await j('/api/export');
        const before = (backup.body.surveyQuestions || []).filter((q) => q.survey_id === mk.body.id);
        ok('导出的问题带 id（重映射的前提）', before.length === 2 && before.every((q) => Number.isInteger(q.id)),
          JSON.stringify(before.map((q) => q.id)));
        const imp = await post('/api/import?force=1', backup.body);
        ok('force 重导同库成功', imp.status === 200 && imp.body.ok && imp.body.surveyQuestions >= 2, JSON.stringify(imp.body));
        const d2 = await j('/api/survey/' + mk.body.id);
        const newQids = d2.body.questions.map((q) => String(q.id));
        const stored = (d2.body.responses || [])[0] || {};
        ok('重导后答案键指到新题目 id', Object.keys(stored.answers || {}).every((k) => newQids.includes(k))
          && Object.values(stored.answers || {}).includes('乙'),
          JSON.stringify({ keys: Object.keys(stored.answers || {}), newQids }));
      }
    }

    // 截止到点自动关闭：纯日期按当天 23:59，与投票同一口径
    const mkExp = await post('/api/survey', {
      title: '自检过期问卷',
      deadline: '2020-01-01',
      rosterRaw: '2023001 张三',
      keepId: true,
      questions: [{ question: '选一个', qtype: 'single', options: ['甲', '乙'], required: true }],
    });
    ok('创建带过去截止时间的问卷', mkExp.status === 200 && mkExp.body.ok, JSON.stringify(mkExp.body));
    if (mkExp.body.id) {
      created.surveys.push(mkExp.body.id);
      const list = await j('/api/survey');
      const row = (list.body.items || []).find((s) => s.id === mkExp.body.id);
      ok('过期问卷列表标记已截止', !!row && row.closed === true, JSON.stringify(row));
      const subExp = await upost('2023001', '/api/survey/' + mkExp.body.id + '/submit', { answers: { 1: '甲' } });
      ok('过期问卷提交被拒（400）', subExp.status === 400 && /截止/.test(subExp.body.error || ''), JSON.stringify(subExp.body));
      // 顺延截止时间 = 常规诉求：元数据可改，改完自动重新开放收集
      const ext = await j('/api/survey/' + mkExp.body.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deadline: '2030-01-01 12:00' }) });
      const row2 = ((await j('/api/survey')).body.items || []).find((s) => s.id === mkExp.body.id);
      const subReopen = await upost('2023001', '/api/survey/' + mkExp.body.id + '/submit', { answers: { 1: '乙' } });
      ok('顺延截止时间后自动重新开放收集', ext.status === 200 && row2 && row2.closed === false
        && subReopen.status === 200 && row2.deadline === '2030-01-01 12:00',
        JSON.stringify({ st: ext.status, closed: row2 && row2.closed, sub: subReopen.status }));
    }

    // 匿名→记名中途切换：历史匿名行无法补身份，但同学再提交时按 sid_hash 认出原行并回填身份（不产生双记录）
    {
      const mk = await post('/api/survey', {
        title: '自检匿名转记名问卷', anonymous: true, rosterRaw: '2023001 张三', keepId: true,
        questions: [{ question: '选一个', qtype: 'single', options: ['甲', '乙'], required: true }],
      });
      if (mk.body.id) {
        created.surveys.push(mk.body.id);
        const d0 = await j('/api/survey/' + mk.body.id);
        const qid = d0.body.questions[0].id;
        await upost('2023001', '/api/survey/' + mk.body.id + '/submit', { answers: { [qid]: '甲' } });
        const midAnon = await j('/api/survey/' + mk.body.id);
        const anonRow = (midAnon.body.responses || [])[0];
        // 匿名承诺的边界：落库不存身份；管理员明细用名单重算 sid_hash 反查填写人
        const { DatabaseSync: SyncDb } = require('node:sqlite');
        const sdb = new SyncDb(require('path').join(DATA_DIR, 'infohub.db'), { readOnly: true });
        const stored = sdb.prepare('SELECT sid, name FROM survey_responses WHERE survey_id = ?').get(mk.body.id);
        sdb.close();
        ok('匿名期落库不存身份', !!stored && stored.sid === '' && stored.name === '', JSON.stringify(stored));
        ok('匿名期管理员明细反查填写人', (midAnon.body.responses || []).length === 1
          && anonRow && anonRow.sid === '2023001' && anonRow.name === '张三', JSON.stringify(anonRow));
        const tog = await j('/api/survey/' + mk.body.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anonymous: false }) });
        await upost('2023001', '/api/survey/' + mk.body.id + '/submit', { answers: { [qid]: '乙' } });
        const after = await j('/api/survey/' + mk.body.id);
        const rows = after.body.responses || [];
        ok('转记名后再提交：身份回填到原行（不双记）', rows.length === 1 && rows[0].sid === '2023001' && rows[0].answers[String(qid)] === '乙',
          JSON.stringify(rows));
        const named = await j('/api/survey/' + mk.body.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anonymous: true }) });
        const back = await j('/api/survey/' + mk.body.id);
        ok('切回匿名仍可改', named.status === 200 && back.body.anonymous === true, JSON.stringify({ st: named.status, anon: back.body.anonymous }));
      }
    }
  }

  // ---- 班委按名单引用发起接龙（学号全文不经过班委） ----
  {
    const mkRos = await post('/api/rosters', { name: '自检引用名单', rosterRaw: '2023001 张三\n2023002 李四', keepId: true });
    if (mkRos.body.id) {
      (created.rosters = created.rosters || []).push(mkRos.body.id);
      // 先提班委再登录：角色变更会使旧会话立即作废
      await j('/api/users/2023001', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'officer' }) });
      delete userSess['2023001'];
      const offCk = await userSession('2023001');
      const rosRes = await fetch(BASE + '/api/rosters', { headers: { Cookie: offCk } });
      const rosList = await rosRes.json();
      const mine = (rosList.items || []).find((x) => x.name === '自检引用名单');
      ok('班委名单列表带学号全文（2026-10-31 口径）', rosRes.status === 200 && !!mine
        && typeof mine.roster === 'string' && mine.roster.indexOf('2023001') >= 0 && typeof mine.count === 'number', JSON.stringify(mine));
      const jl = await fetch(BASE + '/api/jielong', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: offCk }, body: JSON.stringify({ title: '自检引用接龙', rosterId: mkRos.body.id, fields: [{ label: '是否参加', type: 'select', options: ['参加', '不参加'], required: true }] }) }).then(r => r.json());
      ok('班委按名单引用发起接龙', !!jl.id, JSON.stringify(jl));
      if (jl.id) {
        (created.jielongIds = created.jielongIds || []).push(jl.id);
        const jdRes = await fetch(BASE + '/api/jielong/' + jl.id, { headers: { Cookie: offCk } });
        const jd = { status: jdRes.status, body: await jdRes.json().catch(() => ({})) };
        ok('引用的名单已生效（班委视角不含学号）', (jd.body.roster || []).length === 2, JSON.stringify(jd.body.roster));
      }
      await j('/api/users/2023001', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'student' }) });
      delete userSess['2023001'];
    }
    const stuRos = await fetch(BASE + '/api/rosters', { headers: { Cookie: await userSession('2023002') } });
    ok('学生不能读名单列表（401）', stuRos.status === 401, 'status=' + stuRos.status);
    if (mkRos.body.id) await j('/api/rosters/' + mkRos.body.id, { method: 'DELETE' });
  }

  /* ---------- 邮件催办：自助绑定 QQ、批量导入、催办限频 ---------- */
  if (authRequired) {
    console.log('\n—— 邮件催办 ——');
    r = await upost('2023001', '/api/me/qq/code', { qq: '111111111' });
    ok('纯 QQ 号不再接受（要求完整邮箱，400）', r.status === 400, 'status=' + r.status);
    r = await upost('2023001', '/api/me/qq/code', { qq: 'stu2023001@example.com' });
    ok('发送验证码（完整邮箱形式）', r.status === 200 && r.body.target === 'stu2023001@example.com' && !!r.body.devCode, JSON.stringify(r.body));
    const vcode = r.body.devCode || '';
    r = await uput('2023001', '/api/me/qq', { qq: 'stu2023001@example.com', code: vcode === '000000' ? '000001' : '000000' });
    ok('错误验证码被拒（400）', r.status === 400, 'status=' + r.status);
    r = await uput('2023001', '/api/me/qq', { qq: 'stu2023001@example.com', code: vcode });
    ok('验证码通过完成绑定（完整邮箱入库）', r.status === 200 && r.body.qq === 'stu2023001@example.com', JSON.stringify(r.body));
    r = await uget('2023001', '/api/me');
    ok('me 接口回传完整邮箱', r.status === 200 && r.body.qq === 'stu2023001@example.com', JSON.stringify(r.body).slice(0, 100));
    r = await upost('2023001', '/api/me/qq/code', { qq: 'stu2023001@example.com' });
    ok('60 秒内重发验证码被拒（429）', r.status === 429, 'status=' + r.status);
    r = await post('/api/users/qq-import', { text: '2023002 stu2023002@example.com\n2023002 222222222\n2023999 333333333\nbadline' });
    ok('管理员批量导入（只收完整邮箱，纯 QQ 号计入 bad）', r.status === 200 && r.body.updated === 1 && (r.body.bad || []).some((x) => String(x).indexOf('2023999') >= 0) && (r.body.bad || []).some((x) => String(x).indexOf('222222222') >= 0), JSON.stringify(r.body));
    const padRm = (n) => String(n).padStart(2, '0');
    const pastD = new Date(Date.now() - 2 * 3600 * 1000);
    const pastDeadline = pastD.getFullYear() + '-' + padRm(pastD.getMonth() + 1) + '-' + padRm(pastD.getDate()) + ' ' + padRm(pastD.getHours()) + ':' + padRm(pastD.getMinutes());
    r = await post('/api/jielong', {
      title: '自检提醒接龙', description: '截止提醒用',
      rosterRaw: '2023001 张三\n2023002 李四\n2023003 王五\n2023004 赵六', keepId: true,
      deadline: pastDeadline, allowOutside: true, fields: [],
    });
    const rmJl = (r.body || {}).id;
    if (rmJl) (created.jielongIds = created.jielongIds || []).push(rmJl);
    ok('创建逾期测试接龙', r.status === 200 && !!rmJl);
    r = await post('/api/jielong/' + rmJl + '/remind-mail', {});
    ok('手动邮件催办发出（含未绑定计数）', r.status === 200 && r.body.sent === 2 && r.body.noQQ === 2, JSON.stringify(r.body).slice(0, 140));
    ok('导入与验证的邮箱都能收到催办', ((r.body.mails || []).some((m) => m.to === 'stu2023001@example.com')) && ((r.body.mails || []).some((m) => m.to === 'stu2023002@example.com')), JSON.stringify(r.body.mails));
    r = await post('/api/jielong/' + rmJl + '/remind-mail', { slots: [0] });
    ok('管理员勾选收件人只发给勾选的人', r.status === 200 && r.body.sent === 0 && r.body.skipped === 1 && r.body.noQQ === 0, JSON.stringify(r.body).slice(0, 140));
    r = await post('/api/jielong/' + rmJl + '/remind-mail', {});
    ok('30 分钟内重复催办被限频', r.status === 200 && r.body.sent === 0 && r.body.skipped === 2, JSON.stringify(r.body).slice(0, 140));
    r = await upost('2023002', '/api/jielong/' + rmJl + '/remind-mail', {});
    ok('学生不能邮件催办（401/403）', r.status === 401 || r.status === 403, 'status=' + r.status);
    /* 批量导入已接：QQ 接龙原文粘贴 → 按学号/姓名匹配名单 */
    r = await post('/api/jielong/' + rmJl + '/import', { text: '2023001 张三\n2. 李四\n王五\n路人甲' });
    ok('批量导入已接（学号/序号/纯姓名混合，未匹配回报）', r.status === 200 && r.body.imported === 3 && r.body.unmatchedCount === 1, JSON.stringify(r.body).slice(0, 140));
    r = await j('/api/jielong/' + rmJl);
    ok('导入后完成统计生效', r.status === 200 && r.body.done === 3 && (r.body.missing || []).length === 1, JSON.stringify({ done: r.body.done, missing: r.body.missing }));
    r = await post('/api/jielong/' + rmJl + '/import', { text: '2023001 张三\n2023002 李四' });
    ok('重复导入按已接跳过', r.status === 200 && r.body.imported === 0 && r.body.already === 2, JSON.stringify(r.body));
    r = await upost('2023002', '/api/jielong/' + rmJl + '/import', { text: 'x' });
    ok('学生不能批量导入（401/403）', r.status === 401 || r.status === 403, 'status=' + r.status);
  }

  // ---- 清理自检数据 ----
  for (const id of created.messages) await j('/api/messages/' + id, { method: 'DELETE' });
  for (const id of created.groups) await j('/api/groups/' + id, { method: 'DELETE' });
  for (const id of (created.campaigns || [])) await j('/api/campaigns/' + id, { method: 'DELETE' });
  for (const id of created.funds) await j('/api/funds/' + id, { method: 'DELETE' });
  for (const id of created.guestbook) await j('/api/guestbook/' + id, { method: 'DELETE' });
  for (const id of (created.rosters || [])) await j('/api/rosters/' + id, { method: 'DELETE' });
  for (const id of (created.surveyTemplates || [])) await j('/api/survey-template/' + id, { method: 'DELETE' });
  for (const id of (created.surveys || [])) await j('/api/survey/' + id, { method: 'DELETE' });
  for (const id of (created.jielongIds || [])) await j('/api/jielong/' + id, { method: 'DELETE' });
  for (const sid of (created.userSids || [])) await j('/api/users/' + encodeURIComponent(sid), { method: 'DELETE' });
  console.log(`\n（自检数据已清理：${created.messages.length} 条信息、${created.groups.length} 个群）`);
  // 自检这一跑写进「操作记录」的行按 tag 清掉——否则一次自检几百条，真实使用记录会被埋掉。
  // 只有服务端以 INFOHUB_SELFTEST=1 启动时才会打这个标记（不认请求头，防闯祸的人把自己的记录标成噪声）
  {
    const h = await j('/api/health');
    if (h.body && h.body.selftest && process.env.TEST_KEEP_AUDIT === '1') {
      console.log('（TEST_KEEP_AUDIT=1：本次自检的操作记录保留在库里，供人工查看）');
    } else if (h.body && h.body.selftest) {
      try {
        const { DatabaseSync } = require('node:sqlite');
        const adb = new DatabaseSync(require('path').join(DATA_DIR, 'infohub.db'));
        // 只删本轮这一段 id 区间内的自检行：万一有人拿带 INFOHUB_SELFTEST 的服务跑真实业务，
        // 单靠 tag 会把同期别人的操作一起删掉
        const n = adb.prepare("DELETE FROM audit_log WHERE tag = 'selftest' AND id > ?").run(auditBaseline).changes;
        adb.close();
        console.log(`（自检操作记录已清理：${n} 条）`);
      } catch (e) {
        console.log(`（自检操作记录清理失败：${e.message}，可手动执行 DELETE FROM audit_log WHERE tag='selftest'）`);
      }
    } else {
      console.log('（本次服务不是 INFOHUB_SELFTEST=1 启动的，自检的操作记录未自动清理）');
    }
  }
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`结果：${passed} 通过，${failed} 失败`);
  console.log(failed === 0 ? '🎉 全部自检通过，可以放心使用/部署。' : '⚠️ 有失败项，请把上面的 ❌ 内容发给维护者排查。');
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('自检脚本异常：', e.message);
  console.error('请确认服务已启动（node server.js）。');
  // 异常退出前尽力清掉已创建的自检数据，避免半截数据残留在库里
  try {
    for (const id of created.messages) await j('/api/messages/' + id, { method: 'DELETE' });
    for (const id of created.groups) await j('/api/groups/' + id, { method: 'DELETE' });
    for (const id of (created.campaigns || [])) await j('/api/campaigns/' + id, { method: 'DELETE' });
    for (const id of (created.rosters || [])) await j('/api/rosters/' + id, { method: 'DELETE' });
    for (const id of (created.funds || [])) await j('/api/funds/' + id, { method: 'DELETE' });
    for (const id of (created.guestbook || [])) await j('/api/guestbook/' + id, { method: 'DELETE' });
    for (const id of (created.surveyTemplates || [])) await j('/api/survey-template/' + id, { method: 'DELETE' });
    for (const sid of (created.userSids || [])) await j('/api/users/' + encodeURIComponent(sid), { method: 'DELETE' });
  } catch (e2) { /* 尽力而为 */ }
  // 异常退出也要把本次自检的操作记录清掉，别留噪声
  try {
    const h = await j('/api/health');
    if (h.body && h.body.selftest) {
      const { DatabaseSync } = require('node:sqlite');
      const adb = new DatabaseSync(require('path').join(DATA_DIR, 'infohub.db'));
      adb.prepare("DELETE FROM audit_log WHERE tag = 'selftest' AND id > ?").run(auditBaseline);
      adb.close();
    }
  } catch (e2) { /* 尽力而为 */ }
  process.exit(1);
});
