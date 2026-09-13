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
  ok('JSON 导出', ex.status === 200 && Array.isArray(dump.messages) && Array.isArray(dump.groups));
  r = await post('/api/import', { groups: [], messages: [] });
  ok('有数据时导入被拒（防重复）', r.status === 400);

  // 9.5 force 导入：附件记录一并恢复（附件文件本身不在 JSON 中，随 data/ 目录迁移）
  r = await post('/api/import?force=1', {
    groups: [],
    messages: [{ id: 9900, title: '导入附件测试', content: '导入附件测试内容' }],
    attachments: [{ message_id: 9900, orig_name: '导入附件测试.txt', stored_name: '202601/0123456789abcdef.txt', size: 3, mime: 'text/plain', created_at: '2030-01-01 09:00' }],
  });
  ok('force 导入恢复附件记录', r.status === 200 && r.body.attachments === 1, JSON.stringify(r.body));
  r = await j('/api/files?q=' + encodeURIComponent('导入附件测试.txt'));
  ok('导入的附件出现在文件中心', r.status === 200 && r.body.items.length === 1, JSON.stringify(r.body));
  const imp = await j('/api/messages?q=' + encodeURIComponent('导入附件测试'));
  for (const it of (imp.body.items || [])) await j('/api/messages/' + it.id, { method: 'DELETE' });

  // 10. 登录接口（未设密码时随意输都放行；设了密码时用正确密码再验一次）
  r = await post('/api/login', { password: authRequired ? adminPw : 'x' });
  ok('登录接口' + (authRequired ? '（密码校验）' : '（未启用密码时不拦）'), r.status === 200);

  // 11. 静态页面
  for (const p2 of ['/', '/quick', '/css/style.css', '/js/app.js', '/icon.svg', '/manifest.webmanifest', '/sw.js']) {
    const s = await fetch(BASE + p2);
    ok('静态资源 ' + p2, s.status === 200);
  }
  const lh = await fetch(BASE + '/login');
  ok('登录页可访问', lh.status === 200);

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
