'use strict';

/*
 * 信息汇总 · 一键自检脚本
 * 用法：先启动服务（node server.js 或 start.bat），然后另开一个命令行运行  node test.js
 * 全部通过会输出 PASS 汇总；任何一项失败会输出 FAIL 并以非零码退出。
 */

const BASE = process.env.TEST_BASE || 'http://localhost:5757';
let passed = 0;
let failed = 0;
const created = { groups: [], messages: [], attachments: [] };
let cookie = ''; // 管理员登录后的会话 Cookie

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

(async () => {
  console.log(`\n📋 信息汇总自检（${BASE}）\n`);

  // 1. 健康
  let r = await j('/api/health');
  ok('健康检查 /api/health', r.status === 200 && r.body.ok === true);

  // 2. 认证状态（未设密码时应为免登录）
  r = await j('/api/me');
  ok('会话状态 /api/me', r.status === 200 && typeof r.body.authRequired === 'boolean');
  const authRequired = !!r.body.authRequired;
  let adminPw = '';
  if (authRequired) {
    // 2.5 管理密码开启时：访客只读（可浏览、写入被拒），然后用密码自动登录继续自检
    const g1 = await fetch(BASE + '/api/messages?limit=1');
    ok('只读门禁：访客可浏览', g1.status === 200);
    const g2 = await fetch(BASE + '/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x' }) });
    ok('只读门禁：访客写入被拒（401）', g2.status === 401);
    try {
      adminPw = process.env.TEST_PASSWORD || JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'data', 'config.json'), 'utf8')).password || '';
    } catch (e) { /* 读不到时留空 */ }
    if (adminPw) {
      r = await post('/api/login', { password: adminPw });
      ok('管理员自动登录', r.status === 200 && r.body.ok === true);
    } else {
      ok('管理员自动登录', false, '未读到 data/config.json 的 password（也可设 TEST_PASSWORD 环境变量）');
    }
  }

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
  created.attachments.push(aid);
  const d = await fetch(`${BASE}/api/attachments/${aid}/download`);
  const dtext = Buffer.from(await d.arrayBuffer()).toString('utf8');
  ok('下载附件内容一致', d.status === 200 && dtext.includes('test-content-自检'));
  ok('下载带 nosniff 安全头', d.headers.get('x-content-type-options') === 'nosniff');
  ok('非白名单类型强制下载', (d.headers.get('content-disposition') || '').startsWith('attachment'));
  r = await j('/api/files?q=' + encodeURIComponent('自检.txt'));
  ok('文件中心搜索', r.status === 200 && r.body.items.length === 1);

  // 6.5 附件阅读/下载计数
  const dl2 = await fetch(`${BASE}/api/attachments/${aid}/download?dl=1`);
  await dl2.arrayBuffer();
  const rawRes = await fetch(`${BASE}/api/attachments/${aid}/raw`);
  await rawRes.arrayBuffer();
  r = await j('/api/files?q=' + encodeURIComponent('自检.txt'));
  const fa0 = r.body.items[0] || {};
  ok('附件下载计数（强制下载 2 次，缩略图不计）', fa0.downloads === 2 && fa0.views === 0, JSON.stringify(fa0));

  // 图片：打开（Sec-Fetch-Dest: document）计阅读，内嵌渲染（image）不计
  const http = require('http');
  const fetchWithDest = (path2, dest) => new Promise((resolve, reject) => {
    const u = new URL(BASE);
    const req = http.get({ host: u.hostname, port: u.port || 80, path: path2, headers: dest ? { 'sec-fetch-dest': dest } : {} }, (res2) => {
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
  created.attachments.push(pid);
  const openRes = await fetchWithDest(`/api/attachments/${pid}/download`, 'document');
  ok('图片内联打开（inline）', openRes.status === 200 && (openRes.body.length || 0) > 0);
  await fetchWithDest(`/api/attachments/${pid}/download`, 'image');
  r = await j('/api/files?q=' + encodeURIComponent('自检图.png'));
  const fa1 = r.body.items[0] || {};
  ok('图片打开计阅读、内嵌渲染不计', fa1.views === 1 && fa1.downloads === 0, JSON.stringify(fa1));
  // 全量统计不带筛选查（totalViews/totalDownloads 跟随当前筛选，此处应=两个附件之和）
  r = await j('/api/files');
  ok('文件中心返回全量统计', r.body.totalViews === 1 && r.body.totalDownloads === 2, JSON.stringify({ v: r.body.totalViews, d: r.body.totalDownloads }));

  // 7. 智能解析
  r = await post('/api/parse', { text: '王老师：请同学们周五下午5点前把回执交给班主任，务必完成【重要】' });
  const p = r.body.parsed || {};
  ok('智能解析（分类/截止/重要/发送人）', p.category === 'task' && !!p.deadline && p.priority === 1 && p.sender === '王老师', JSON.stringify(p));
  r = await post('/api/parse', { text: '9月20日 16:30 前提交表格' });
  ok('智能解析保留分钟（16:30）', r.status === 200 && (r.body.parsed.deadline || '').endsWith('16:30'), JSON.stringify(r.body.parsed));
  r = await post('/api/parse', { text: '明天下午4点半前交回执' });
  ok('智能解析「点半」（16:30）', r.status === 200 && (r.body.parsed.deadline || '').endsWith('16:30'), JSON.stringify(r.body.parsed));

  // 7.5 相似检测与 .ics 日历
  r = await post('/api/similar', { text: '自检信息的内容包含唯一标记' });
  ok('相似信息检测', r.status === 200 && r.body.items.some((x) => x.id === mid), JSON.stringify(r.body));
  const ics = await fetch(BASE + '/api/calendar.ics');
  const icsText = await ics.text();
  ok('.ics 日历导出', ics.status === 200 && icsText.includes('BEGIN:VCALENDAR') && icsText.includes('BEGIN:VEVENT'));

  // 8. 外部接入 webhook
  const cfg = (await j('/api/config')).body;
  r = await post('/api/ingest?token=' + cfg.ingestToken, { text: '张老师：下周一交自学计划表', group: '自检接入群', platform: 'wechat' });
  ok('webhook 接入+自动识别', r.status === 200 && r.body.parsed.deadline && r.body.id > 0);
  created.messages.push(r.body.id);
  r = await post('/api/ingest?token=错误令牌', { text: 'x' });
  ok('错误令牌被拒（401）', r.status === 401);
  r = await j('/api/groups?withCounts=1');
  const autoG = r.body.items.find((g) => g.name === '自检接入群');
  ok('不存在的群自动创建', !!autoG);
  if (autoG) created.groups.push(autoG.id);

  // 9. 统计与导出
  r = await j('/api/stats');
  ok('统计数据', r.status === 200 && typeof r.body.total === 'number' && Array.isArray(r.body.upcoming));
  const ex = await j('/api/export');
  const dump = ex.body;
  ok('JSON 导出', ex.status === 200 && Array.isArray(dump.messages) && Array.isArray(dump.groups) && Array.isArray(dump.jielongs) && Array.isArray(dump.draws) && Array.isArray(dump.rosters));
  r = await post('/api/import', { groups: [], messages: [] });
  ok('有数据时导入被拒（防重复）', r.status === 400);

  // 9.5 force 导入：附件与接龙一并恢复（附件文件本身不在 JSON 中，随 data/ 目录迁移）
  r = await post('/api/import?force=1', {
    groups: [],
    messages: [{ id: 9900, title: '导入附件测试', content: '导入附件测试内容' }],
    attachments: [{ message_id: 9900, orig_name: '导入附件测试.txt', stored_name: '202601/0123456789abcdef.txt', size: 3, mime: 'text/plain', created_at: '2030-01-01 09:00' }],
    jielongs: [{ id: 'jlimport1', title: '导入接龙测试', description: '', deadline: '2030-01-01 10:00', roster: '[{"id":"2023001","name":"张三"}]', fields: '[]', allow_outside: 1, closed: 0, admin_token: 'importtoken', created_at: 1700000000000 }],
    jielongEntries: [
      { jielong_id: 'jlimport1', rid: 0, sid: '2023001', name: '张三', values_json: '{"f0":"参加"}', remark: '', outside: 0, time: 1700000001000, seq: 0 },
      { jielong_id: '不存在的接龙', rid: null, sid: '', name: '孤儿记录', values_json: '{}', remark: '', outside: 1, time: 1700000002000, seq: 1 },
    ],
    draws: [{ id: 'dwimport1', title: '导入签箱测试', roster: '[{"id":"2023001","name":"张三"}]', per_draw: 1, created_at: 1700000000000 }],
    drawRounds: [{ draw_id: 'dwimport1', picked: '[{"id":"2023001","name":"张三"}]', count: 1, time: 1700000001000 }],
    rosters: [{ name: '导入名单', roster: '张三\n李四', keep_id: 1, created_at: '', updated_at: '' }],
  });
  ok('force 导入恢复附件与接龙', r.status === 200 && r.body.attachments === 1 && r.body.jielongs === 1 && r.body.jielongEntries === 1 && r.body.draws === 1 && r.body.drawRounds === 1 && r.body.rosters === 1, JSON.stringify(r.body));
  r = await j('/api/files?q=' + encodeURIComponent('导入附件测试.txt'));
  ok('导入的附件出现在文件中心', r.status === 200 && r.body.items.length === 1, JSON.stringify(r.body));
  r = await j('/api/jielong/jlimport1');
  ok('导入的接龙可访问（含记录）', r.status === 200 && r.body.title === '导入接龙测试' && r.body.done === 1 && r.body.total === 1 && r.body.entries[0].values.f0 === '参加', JSON.stringify(r.body));
  r = await j('/api/jielong/jlimport1?t=importtoken', { method: 'DELETE' });
  ok('导入的接龙可管理（令牌随备份恢复）', r.status === 200);
  r = await j('/api/draw/dwimport1');
  ok('导入的签箱可访问（历史保留）', r.status === 200 && r.body.total === 1 && r.body.remainingCount === 0 && r.body.roundCount === 1, JSON.stringify(r.body));
  await j('/api/draw/dwimport1', { method: 'DELETE' });
  r = await j('/api/rosters');
  ok('导入的名单进入名单库', r.status === 200 && r.body.items.length === 1 && r.body.items[0].name === '导入名单', JSON.stringify(r.body));
  for (const it of r.body.items) await j('/api/rosters/' + it.id, { method: 'DELETE' });
  const imp = await j('/api/messages?q=' + encodeURIComponent('导入附件测试'));
  for (const it of (imp.body.items || [])) await j('/api/messages/' + it.id, { method: 'DELETE' });

  // 9.6 导入原子性：中途失败（重复 ext_key 触发唯一索引）必须整体回滚，不残留半截数据
  const gBefore = (await j('/api/groups')).body.items.length;
  r = await post('/api/import?force=1', {
    groups: [{ id: 1, name: '回滚测试甲', ext_key: 'qq:rb' }, { id: 2, name: '回滚测试乙', ext_key: 'qq:rb' }],
    messages: [{ title: '回滚测试信息' }],
  });
  ok('导入中途失败返回 500', r.status === 500, JSON.stringify(r.body));
  const gAfter = (await j('/api/groups')).body.items;
  ok('导入失败整体回滚（无残留）', gAfter.length === gBefore && !gAfter.some((g) => g.name === '回滚测试甲'), JSON.stringify(r.body));

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
    await rep({ ...obPayload, sender: { card: '赵老师', nickname: 'z' }, message: [{ type: 'text', data: { text: '待审核分页测试甲，请同学们查收通知' } }] });
    await rep({ ...obPayload, sender: { card: '钱老师', nickname: 'q' }, message: [{ type: 'text', data: { text: '待审核分页测试乙，请同学们查收通知' } }] });
    r = await j('/api/inbox?limit=1');
    ok('待审核 limit 生效且 total 为全量', r.body.items.length === 1 && r.body.total === 2, JSON.stringify(r.body));
    // 超长正文截断（与手动录入同一口径 20000）
    await rep({ ...obPayload, sender: { card: '长文', nickname: 'c' }, message: [{ type: 'text', data: { text: '截断测试开头，请同学们查收。' + '长'.repeat(25000) } }] });
    r = await j('/api/inbox?limit=1');
    ok('OneBot 超长正文截断到 20000', (r.body.items[0].content || '').length === 20000, '实际长度 ' + (r.body.items[0] ? (r.body.items[0].content || '').length : '无'));
    r = await j('/api/inbox', { method: 'DELETE' });
    ok('清空待审核', r.status === 200 && r.body.dismissed === 3, JSON.stringify(r.body));
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
  r = await j('/api/groups?withCounts=1');
  const obG = r.body.items.find((g) => g.name === 'QQ群 987654321');
  ok('OneBot 上报自动建群（QQ 平台）', !!obG && obG.platform === 'qq');
  if (obG) created.groups.push(obG.id);

  // 11. 静态页面
  for (const p2 of ['/', '/quick', '/css/style.css', '/js/app.js', '/icon.svg', '/manifest.webmanifest', '/sw.js']) {
    const s = await fetch(BASE + p2);
    ok('静态资源 ' + p2, s.status === 200);
  }
  const lh = await fetch(BASE + '/login');
  ok('登录页可访问', lh.status === 200);
  r = await fetch(BASE + '/j/dut9dtk');
  ok('学生接龙页 /j/:id', r.status === 200 && (await r.text()).includes('班级接龙'));
  r = await fetch(BASE + '/js/qrcode.min.js');
  ok('二维码组件可加载', r.status === 200);

  // 12. 班级接龙（名单解析 / 身份匹配 / 进度 / 管理令牌 / CSV）
  r = await post('/api/jielong', {
    title: '自检接龙', description: '自检用接龙',
    rosterRaw: '2023001 张三\n2. 李四\n王五\n2023004 张三', keepId: true,
    deadline: '2030-01-01 18:00', allowOutside: true,
    fields: [{ label: '是否参加', type: 'select', required: true, options: ['参加', '不参加'] }],
  });
  const jl = r.body || {};
  ok('发起接龙（名单解析出学号）', r.status === 200 && /^[a-z0-9]{7}$/.test(jl.id || '') && !!jl.adminToken, JSON.stringify(r.body));
  if (authRequired) {
    const g4 = await fetch(BASE + '/api/jielong', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x' }) });
    ok('访客发起接龙被拒（401）', g4.status === 401);
  }
  r = await j('/api/jielong');
  ok('接龙列表带进度', r.status === 200 && r.body.items.some((x) => x.id === jl.id && x.total === 4), JSON.stringify(r.body));
  const g7 = await fetch(BASE + '/api/jielong/' + jl.id);
  const g7j = await g7.json();
  ok('接龙详情（访客不泄露管理令牌）', g7.status === 200 && g7j.roster.length === 4 && g7j.roster[0].id === '2023001' && g7j.adminToken === undefined && g7j.missing.length === 4);
  if (authRequired) {
    r = await j('/api/jielong/' + jl.id);
    ok('管理员可取回管理令牌', r.status === 200 && r.body.adminToken === jl.adminToken);
  }
  r = await post(`/api/jielong/${jl.id}/join`, { name: '张三', values: { f0: '参加' }, remark: '自检' });
  ok('提交（重名绑定首个未接槽位）', r.status === 200 && r.body.entry.rid === 0 && r.body.entry.id === '2023001' && r.body.done === 1, JSON.stringify(r.body));
  r = await post(`/api/jielong/${jl.id}/join`, { name: '2023004', values: { f0: '不参加' } });
  ok('按学号命中另一位重名同学', r.status === 200 && r.body.entry.rid === 3 && r.body.entry.id === '2023004');
  r = await post(`/api/jielong/${jl.id}/join`, { name: '张三', values: { f0: '不参加' } });
  ok('重复提交覆盖不新增', r.status === 200 && r.body.updated === true && r.body.count === 2);
  r = await j('/api/jielong/' + jl.id);
  ok('修改提交后名单次序不变', r.body.entries[0].name === '张三' && r.body.entries[0].id === '2023001' && r.body.entries[0].values.f0 === '不参加', JSON.stringify(r.body.entries.map((e) => e.name)));
  const g5 = await fetch(BASE + `/api/jielong/${jl.id}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '赵六', values: { f0: '参加' } }) });
  const g5j = await g5.json();
  ok('名单外可提交且无需登录', g5.status === 200 && g5j.entry.rid === null && g5j.done === 2, JSON.stringify(g5j));
  r = await post(`/api/jielong/${jl.id}/join`, { rid: 1, name: '李四', values: { f0: '参加' } });
  ok('专属链接按槽位提交', r.status === 200 && r.body.entry.rid === 1 && r.body.entry.name === '李四');
  r = await j('/api/jielong/' + jl.id);
  ok('进度与未接名单', r.body.done === 3 && r.body.total === 4 && r.body.missing.length === 1 && r.body.missing[0].name === '王五', JSON.stringify(r.body.missing));
  r = await post(`/api/jielong/${jl.id}/join`, { name: '王五', values: {} });
  ok('必填项缺失被拒', r.status === 400);
  if (authRequired) {
    // 密码模式下：无 Cookie 且令牌错误 → 管理操作 401（未设密码时全站开放，无此拒绝路径）
    const g6 = await fetch(`${BASE}/api/jielong/${jl.id}/export?t=` + encodeURIComponent('错误令牌'));
    ok('错误管理令牌被拒（401）', g6.status === 401);
  }
  const csvRes = await fetch(`${BASE}/api/jielong/${jl.id}/export?t=` + encodeURIComponent(jl.adminToken));
  const csvBuf = await csvRes.arrayBuffer();
  const csvBytes = new Uint8Array(csvBuf);
  const csvText = new TextDecoder('utf-8').decode(csvBuf);
  ok('CSV 导出（BOM+已接+未接）', csvRes.status === 200
    && (csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF)
    && csvText.includes('张三') && csvText.includes('未接龙'), csvText.slice(0, 80));
  r = await j(`/api/jielong/${jl.id}?t=` + encodeURIComponent(jl.adminToken), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterRaw: '2023001 张三\n李四\n王五明\n2023004 张三', keepId: true }) });
  ok('编辑名单', r.status === 200 && r.body.roster.length === 4);
  r = await j('/api/jielong/' + jl.id);
  ok('已接记录自动重新匹配', r.body.done === 3 && r.body.missing.length === 1 && r.body.missing[0].name === '王五明', JSON.stringify(r.body.missing));
  r = await j(`/api/jielong/${jl.id}/entry?rid=0&t=` + encodeURIComponent(jl.adminToken), { method: 'DELETE' });
  ok('删除单条记录', r.status === 200);
  r = await j('/api/jielong/' + jl.id);
  ok('删除后未接名单更新', r.body.done === 2 && r.body.missing.some((m) => m.name === '张三'));
  r = await post(`/api/jielong/${jl.id}/close?t=` + encodeURIComponent(jl.adminToken), { closed: true });
  ok('停止接龙', r.status === 200 && r.body.closed === true);
  r = await post(`/api/jielong/${jl.id}/join`, { name: '王五明', values: { f0: '参加' } });
  ok('停止后提交被拒', r.status === 400);
  r = await j(`/api/jielong/${jl.id}?t=` + encodeURIComponent(jl.adminToken), { method: 'DELETE' });
  ok('删除整个接龙', r.status === 200);
  r = await j('/api/jielong/' + jl.id);
  ok('删除后详情 404', r.status === 404);

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
  ok('名单库列表（含解析人数）', r.status === 200 && r.body.items.length === 1 && r.body.items[0].count === 3 && r.body.items[0].keepId === true, JSON.stringify(r.body));
  r = await post('/api/jielong', { title: '名单库接龙', rosterRaw: r.body.items[0].roster, keepId: r.body.items[0].keepId });
  ok('用保存的名单发起接龙', r.status === 200 && /^[a-z0-9]{7}$/.test(r.body.id || ''), JSON.stringify(r.body));
  await j('/api/jielong/' + r.body.id, { method: 'DELETE' });
  r = await post('/api/draw', { title: '名单库签箱', rosterRaw: '2023001 张三\n李四\n王五', keepId: true, perDraw: 2 });
  await j('/api/draw/' + r.body.id, { method: 'DELETE' });
  r = await j('/api/rosters/' + rid1, { method: 'DELETE' });
  ok('删除名单', r.status === 200);
  r = await j('/api/rosters');
  ok('删除后名单库为空', r.status === 200 && r.body.items.length === 0);

  // ---- 清理自检数据 ----
  for (const id of created.messages) await j('/api/messages/' + id, { method: 'DELETE' });
  for (const id of created.groups) await j('/api/groups/' + id, { method: 'DELETE' });
  console.log(`\n（自检数据已清理：${created.messages.length} 条信息、${created.groups.length} 个群）`);

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`结果：${passed} 通过，${failed} 失败`);
  console.log(failed === 0 ? '🎉 全部自检通过，可以放心使用/部署。' : '⚠️ 有失败项，请把上面的 ❌ 内容发给维护者排查。');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('自检脚本异常：', e.message);
  console.error('请确认服务已启动（node server.js）。');
  process.exit(1);
});
