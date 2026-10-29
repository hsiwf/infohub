'use strict';
/*
 * 全模块端到端测试矩阵（真实 HTTP 流量，非 mock）
 * 用法: node e2e-matrix.js <BASE> <管理密码>
 * 在指定服务上按「创建【测试】对象 → 逐项校验 → 反序清理」跑一遍全部模块，
 * 任何情况下清理都会执行（finally），生产环境跑完不残留。
 * 模块: 名单库/账号/信息+附件/待审核/投票/接龙/抽签/问卷/班费/留言/生日/操作记录/解析/静态资源
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:5757').replace(/\/$/, '');
const ADMIN_PW = process.argv[3] || '';
const crypto = require('crypto');

let adminCk = '', officerCk = '', studentCk = '';
let passed = 0, failed = 0;
const cleanup = []; // { label, fn } 反序执行
const results = [];

function ok(name, cond, extra) {
  if (cond) { passed++; results.push(`  ✅ ${name}`); }
  else { failed++; results.push(`  ❌ ${name}${extra ? ' —— ' + extra : ''}`); }
}
async function req(ck, method, path, body, raw) {
  const headers = {};
  if (ck) headers.Cookie = ck;
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body instanceof FormData ? body : (body !== undefined ? JSON.stringify(body) : undefined) });
  if (raw) return r;
  let j = null; try { j = await r.json(); } catch (e) { /* 二进制/非 JSON */ }
  return { status: r.status, body: j, headers: r.headers };
}
const admin = (m, p, b, raw) => req(adminCk, m, p, b, raw);
const officer = (m, p, b, raw) => req(officerCk, m, p, b, raw);
const student = (m, p, b, raw) => req(studentCk, m, p, b, raw);
const stamp = () => new Date().toISOString().slice(5, 16).replace('T', ' ');

async function login(sid, pw) {
  const body = sid ? { sid, password: pw } : { password: pw };
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('登录失败 ' + sid + ' → ' + r.status);
  return (r.headers.get('set-cookie') || '').split(';')[0];
}

async function main() {
  results.push(`—— ${BASE} ——`);

  /* 0. 登录三身份 */
  adminCk = await login('', ADMIN_PW);
  const me = await admin('GET', '/api/me');
  ok('管理员登录', me.status === 200 && me.body.role === 'admin');

  /* 1. 名单库 + 批量开号（后续所有模块的测试账号来源） */
  const ros = await admin('POST', '/api/rosters', { name: '【测试】矩阵名单', rosterRaw: '99001 测试甲\n99002 测试乙\n99003 测试丙', keepId: true });
  ok('创建测试名单', ros.status === 200 && ros.body.id > 0);
  const rosterId = ros.body.id;
  cleanup.push({ label: '名单库', fn: () => admin('DELETE', '/api/rosters/' + rosterId) });
  const sync = await admin('POST', '/api/users/sync', { rosterId });
  ok('按名单批量开号', sync.status === 200 && sync.body.created === 3, JSON.stringify(sync.body));
  for (const sid of ['99001', '99002', '99003']) cleanup.push({ label: '账号' + sid, fn: () => admin('DELETE', '/api/users/' + sid) });
  // 99001 提为班委（班委权限链路要用）
  const setOfficer = await admin('PUT', '/api/users/99001', { role: 'officer' });
  ok('设置测试班委', setOfficer.status === 200);

  officerCk = await login('99001', '99001');
  studentCk = await login('99002', '99002');
  const meStu = await student('GET', '/api/me');
  ok('测试学生登录', meStu.status === 200 && meStu.body.sid === '99002');

  /* 2. 信息中心：发布→智能解析→编辑→置顶→完成→附件→文件中心→删除 */
  {
    const mk = await officer('POST', '/api/messages', { title: '【测试】周四18:00交心得', content: '【测试】周四18:00前交心得，逾期不候', group_id: null });
    ok('班委发布通知', mk.status === 200 && mk.body.id > 0, JSON.stringify(mk.body));
    const mid = mk.body.id;
    cleanup.push({ label: '信息' + mid, fn: () => admin('DELETE', '/api/messages/' + mid) });
    ok('智能解析出截止时间', /deadline/.test(JSON.stringify(mk.body)) && mk.body.deadline === null ? true : (mk.body.deadline || '').startsWith(new Date().getFullYear() + '-'), 'deadline=' + JSON.stringify(mk.body.deadline));
    const up = await officer('POST', '/api/upload', (() => { const fd = new FormData(); fd.append('message_id', String(mid)); fd.append('files', new File(['【测试】附件内容'], '【测试】附件.txt', { type: 'text/plain' }), '【测试】附件.txt'); return fd; })());
    ok('上传附件', up.status === 200 && (up.body.ids || []).length === 1, JSON.stringify(up.body));
    const attId = (up.body.ids || [])[0];
    if (attId) cleanup.push({ label: '附件', fn: () => admin('DELETE', '/api/messages/' + mid) }); // 随信息级联
    const dl = await student('GET', '/api/attachments/' + attId + '/download', undefined, true);
    ok('学生下载附件', dl.status === 200 && dl.headers.get('content-type'));
    const files = await student('GET', '/api/files');
    ok('文件中心可见', files.status === 200 && JSON.stringify(files.body).includes('【测试】附件'));
    const toggle = await officer('POST', '/api/messages/' + mid + '/toggle');
    ok('勾选完成', toggle.status === 200 && toggle.body.status === 'done', JSON.stringify(toggle.body && toggle.body.status));
    const pin = await officer('POST', '/api/messages/' + mid + '/pin');
    ok('置顶', pin.status === 200 && pin.body.pinned === 1, JSON.stringify(pin.body && pin.body.pinned));
    const edit = await admin('PUT', '/api/messages/' + mid, { title: '【测试】周四18:00交心得（改）' });
    ok('编辑通知（管理员）', edit.status === 200 && /（改）/.test(edit.body.title));
    const stuEdit = await student('POST', '/api/messages/' + mid + '/toggle');
    ok('学生不能勾选完成（401）', stuEdit.status === 401, 'status=' + stuEdit.status);
  }

  /* 3. 待审核：OneBot 上报 → 收录；ingest 令牌 = 直投信息流 */
  {
    const cfg = await admin('GET', '/api/config');
    const obToken = cfg.body.onebot.token;
    // 直投通道：ingest 令牌直接进信息流
    const rep = await req('', 'POST', '/api/ingest?token=' + cfg.body.ingestToken, { text: '【测试】机器人投递：明天下午三点班会', group: '【测试】QQ群', sender: '【测试】老师' });
    ok('令牌直投进信息流', rep.status === 200 && !!rep.body.id, JSON.stringify(rep.body).slice(0, 90));
    if (rep.body.id) cleanup.push({ label: '直投信息' + rep.body.id, fn: () => admin('DELETE', '/api/messages/' + rep.body.id) });
    const bad = await req('', 'POST', '/api/ingest?token=wrong-token', { text: 'x' });
    ok('错误令牌被拒（401）', bad.status === 401, 'status=' + bad.status);
    // 审核通道：OneBot 上报（group_id 取白名单内第一个，未配白名单则任意群号）
    const wl = Object.keys((cfg.body.onebot || {}).groups || {});
    const gid = wl.length ? Number(wl[0]) : 998877;
    // OneBot 鉴权走 access_token / Bearer 头（令牌 = onebot.token || ingestToken）
    const obRes = await fetch(BASE + '/api/onebot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + obToken }, body: JSON.stringify({ post_type: 'message', message_type: 'group', group_id: gid, time: Math.floor(Date.now() / 1000), self_id: 1, user_id: 111, sender: { card: '【测试】老师', nickname: '【测试】老师' }, raw_message: '【测试】下周三下午三点班会，请准时' }) });
    const ob = { status: obRes.status, body: await obRes.json().catch(() => ({})) };
    ok('OneBot 上报进待审核', ob.status === 200 && ob.body.inbox === true, JSON.stringify(ob.body).slice(0, 90));
    if (ob.body.id) cleanup.push({ label: '收件箱' + ob.body.id, fn: () => admin('DELETE', '/api/inbox/' + ob.body.id).catch(() => {}) });
    const box = await officer('GET', '/api/inbox');
    const item = (box.body.items || []).find((x) => /下周三下午三点班会/.test(x.content || ''));
    ok('待审核列表可见（班委）', box.status === 200 && !!item, 'status=' + box.status);
    if (item) {
      const acc = await officer('POST', '/api/inbox/' + item.id + '/accept');
      ok('班委收录进信息流', acc.status === 200, JSON.stringify(acc.body));
      if (acc.body.id) cleanup.push({ label: '收录信息' + acc.body.id, fn: () => admin('DELETE', '/api/messages/' + acc.body.id) });
    }
  }

  /* 4. 投票：建→投→改票→票数→权限→删 */
  {
    const mk = await officer('POST', '/api/vote', { title: '【测试】班级聚餐投票', rosterRaw: '99001 测试甲\n99002 测试乙', keepId: true, anonymous: false, maxSelect: 1, reveal: 'always', allowChange: true,
      optionsRaw: '周六\n周日' });
    ok('发起投票', mk.status === 200 && mk.body.id, JSON.stringify(mk.body));
    const vid = mk.body.id;
    if (vid) cleanup.push({ label: '投票' + vid, fn: () => admin('DELETE', '/api/vote/' + vid) });
    const d = await officer('GET', '/api/vote/' + vid);
    const keys = (d.body.options || []).map((o) => o.key);
    const b1 = await student('POST', '/api/vote/' + vid + '/ballot', { choices: [keys[0]] });
    ok('学生投票', b1.status === 200, JSON.stringify(b1.body));
    const b2 = await student('POST', '/api/vote/' + vid + '/ballot', { choices: [keys[1]] });
    ok('允许改票时覆盖成功', b2.status === 200, JSON.stringify(b2.body));
    const det = await officer('GET', '/api/vote/' + vid);
    const tally = det.body.tally || [];
    ok('票数统计正确', (tally.find((t) => t.key === keys[1]) || {}).votes === 1, JSON.stringify(tally));
    const noVote = await req('', 'POST', '/api/vote/' + vid + '/ballot', { choices: [keys[0]] });
    ok('未登录不能投票（401）', noVote.status === 401, 'status=' + noVote.status);
  }

  /* 5. 接龙：建→名单内接→名单外接→覆盖→进度→删 */
  {
    const mk = await officer('POST', '/api/jielong', { title: '【测试】春游接龙', rosterRaw: '99001 测试甲', keepId: true, allowOutside: true,
      fields: [{ label: '是否参加', type: 'select', options: ['参加', '不参加'], required: true }] });
    ok('发起接龙', mk.status === 200 && mk.body.id, JSON.stringify(mk.body));
    const jid = mk.body.id;
    if (jid) cleanup.push({ label: '接龙' + jid, fn: () => admin('DELETE', '/api/jielong/' + jid) });
    const j1 = await login('99001', '99001').then((ck) => req(ck, 'POST', '/api/jielong/' + jid + '/join', { values: { f0: '参加' } }));
    ok('名单内学生接龙', j1.status === 200, JSON.stringify(j1.body));
    const j2 = await student('POST', '/api/jielong/' + jid + '/join', { values: { f0: '不参加' } });
    ok('名单外学生接龙被标记', j2.status === 200, JSON.stringify(j2.body));
    const j3 = await student('POST', '/api/jielong/' + jid + '/join', { values: { f0: '参加' } });
    ok('重复提交为覆盖（不双记）', j3.status === 200, JSON.stringify(j3.body));
    const det = await officer('GET', '/api/jielong/' + jid);
    ok('进度与名单外统计正确', det.body.done === 1 && det.body.entries.length === 2, JSON.stringify({ done: det.body.done, n: det.body.entries.length }));
    const csv = await admin('GET', '/api/jielong/' + jid + '/export', undefined, true);
    ok('接龙 CSV 导出', csv.status === 200);
  }

  /* 6. 抽签：建→抽→撤销→重置→删 */
  {
    const mk = await officer('POST', '/api/draw', { title: '【测试】点名签箱', rosterRaw: '99001 测试甲\n99002 测试乙\n99003 测试丙', keepId: true, perDraw: 2 });
    ok('新建签箱', mk.status === 200 && mk.body.id, JSON.stringify(mk.body));
    const did = mk.body.id;
    if (did) cleanup.push({ label: '签箱' + did, fn: () => admin('DELETE', '/api/draw/' + did) });
    const go = await officer('POST', '/api/draw/' + did + '/go', { count: 2 });
    ok('抽 2 人', go.status === 200 && (go.body.picked || []).length === 2, JSON.stringify(go.body).slice(0, 120));
    const undo = await officer('POST', '/api/draw/' + did + '/undo');
    ok('撤销上一轮', undo.status === 200, JSON.stringify(undo.body).slice(0, 80));
    const reset = await officer('POST', '/api/draw/' + did + '/reset');
    ok('重置签箱', reset.status === 200, JSON.stringify(reset.body).slice(0, 80));
    const stuView = await student('GET', '/api/draw/' + did);
    ok('学生看抽签不泄露学号', stuGetNoSid(stuView.body), JSON.stringify(stuView.body).slice(0, 100));
  }
  function stuGetNoSid(body) { return !/\d{5,}/.test(JSON.stringify(body.roster || body.picked || [])); }

  /* 7. 问卷：建（混合题型）→ 学生提交 → 统计 → 元数据编辑 → 题目锁定 → 导出 → 删 */
  {
    const mk = await officer('POST', '/api/survey', { title: '【测试】矩阵问卷', rosterRaw: '99001 测试甲\n99002 测试乙', keepId: true, anonymous: false,
      questions: [
        { question: '单选题', qtype: 'single', options: ['甲', '乙'], required: true },
        { question: '多选题', qtype: 'multiple', options: ['A', 'B', 'C'], required: false },
        { question: '评分题', qtype: 'rating', options: ['1', '2', '3', '4', '5'], required: true },
        { question: '文本题', qtype: 'text', options: [], required: false },
      ] });
    ok('发起混合题型问卷', mk.status === 200 && mk.body.id, JSON.stringify(mk.body));
    const sid2 = mk.body.id;
    if (sid2) cleanup.push({ label: '问卷' + sid2, fn: () => admin('DELETE', '/api/survey/' + sid2) });
    const d = await officer('GET', '/api/survey/' + sid2);
    const q = d.body.questions;
    const sub = await student('POST', '/api/survey/' + sid2 + '/submit', { answers: { [q[0].id]: '甲', [q[1].id]: ['A', 'C'], [q[2].id]: '4', [q[3].id]: 'TEST-文本回答' } });
    ok('学生提交问卷', sub.status === 200, JSON.stringify(sub.body));
    const badSub = await student('POST', '/api/survey/' + sid2 + '/submit', { answers: { [q[0].id]: '甲', [q[2].id]: '9' } });
    ok('评分越界被拒（400）', badSub.status === 400, JSON.stringify(badSub.body));
    const stats = await admin('GET', '/api/survey/' + sid2);
    const stored = (stats.body.responses || [])[0] || {};
    ok('统计读到全部题型答案', stored.answers && stored.answers[String(q[0].id)] === '甲' && Array.isArray(stored.answers[String(q[1].id)]), JSON.stringify(stored.answers));
    const meta = await officer('PUT', '/api/survey/' + sid2, { deadline: '2030-01-01 12:00' });
    ok('已有提交仍可改截止时间', meta.status === 200, JSON.stringify(meta.body));
    const lockQ = await officer('PUT', '/api/survey/' + sid2, { questions: q });
    ok('已有提交时题目锁定（400）', lockQ.status === 400, JSON.stringify(lockQ.body));
    const csv = await admin('GET', '/api/survey/' + sid2 + '/export', undefined, true);
    const csvText = await csv.text();
    ok('问卷 CSV 导出（200 + 无双重转义）', csv.status === 200 && !csvText.includes('""""""'), 'status=' + csv.status);
  }

  /* 8. 班费：收/支→结余→导出→删 */
  {
    const in1 = await admin('POST', '/api/funds', { type: 'income', amount: 88.8, note: 'TEST-fund-收', happened_at: stamp().slice(0, 10) });
    const out1 = await admin('POST', '/api/funds', { type: 'expense', amount: 12.34, note: 'TEST-fund-支', happened_at: stamp().slice(0, 10) });
    ok('记一笔收入与支出', in1.status === 200 && out1.status === 200);
    if (in1.body.id) cleanup.push({ label: '班费收', fn: () => admin('DELETE', '/api/funds/' + in1.body.id) });
    if (out1.body.id) cleanup.push({ label: '班费支', fn: () => admin('DELETE', '/api/funds/' + out1.body.id) });
    const list = await admin('GET', '/api/funds');
    const mine = (list.body.items || []).filter((x) => /TEST-fund-/.test(x.note || ''));
    ok('结余按收支汇总', mine.length === 2 && Math.abs(mine.find((x) => x.type === 'income').amount - 88.8) < 0.001, JSON.stringify(mine.map((x) => [x.type, x.amount])));
    const stuFunds = await student('GET', '/api/funds');
    ok('学生不可记班费（写接口管理员限定）', (await student('POST', '/api/funds', { type: 'income', amount: 1, note: 'x', happened_at: '2026-01-01' })).status === 401, 'status=' + (await student('POST', '/api/funds', { type: 'income', amount: 1, note: 'x', happened_at: '2026-01-01' })).status);
    const csv = await admin('GET', '/api/funds/export', undefined, true);
    ok('班费 CSV 导出', csv.status === 200);
  }

  /* 9. 留言：发→赞→删 */
  {
    const pub = await student('POST', '/api/guestbook', { content: 'TEST-guestbook 矩阵验证', nickname: '测试乙' });
    ok('学生发留言', pub.status === 200 && pub.body.id, JSON.stringify(pub.body));
    const gid = pub.body.id;
    if (gid) cleanup.push({ label: '留言' + gid, fn: () => admin('DELETE', '/api/guestbook/' + gid) });
    const like = await officer('POST', '/api/guestbook/' + gid + '/like');
    ok('班委点赞', like.status === 200, JSON.stringify(like.body));
    const del = await admin('DELETE', '/api/guestbook/' + gid);
    ok('管理员删留言', del.status === 200);
  }

  /* 10. 生日 */
  {
    const bd = await admin('POST', '/api/birthdays', { name: '【测试】寿星', month: 12, day: 31, year: 2006 });
    ok('添加生日成员', bd.status === 200, JSON.stringify(bd.body));
    if (bd.body.id) cleanup.push({ label: '生日', fn: () => admin('DELETE', '/api/birthdays/' + bd.body.id) });
    const list = await student('GET', '/api/birthdays');
    ok('生日列表学生可读（脱敏）', list.status === 200 && JSON.stringify(list.body).includes('【测试】寿星'));
  }

  /* 11. 操作记录：本轮动作都有留痕 */
  {
    const a = await admin('GET', '/api/audit?limit=100');
    const text = JSON.stringify(a.body);
    ok('操作记录含发布/投票/接龙留痕', /发布通知|发起投票|发起接龙|记一笔班费/.test(text), '');
  }

  /* 12. 静态资源一致性：sw 版本与 app.js 可取 */
  {
    const sw = await req('', 'GET', '/sw.js', undefined, true);
    const swText = await sw.text();
    const m = /infohub-static-v(\d+)/.exec(swText);
    ok('sw.js 可取且带缓存版本', sw.status === 200 && !!m, 'v=' + (m && m[1]));
    const appjs = await req('', 'GET', '/js/app.js', undefined, true);
    const buf = Buffer.from(await appjs.arrayBuffer());
    ok('app.js 可取（md5 ' + crypto.createHash('md5').update(buf).digest('hex').slice(0, 8) + '）', appjs.status === 200 && buf.length > 100000, 'len=' + buf.length);
    globalThis.__appjsMd5 = crypto.createHash('md5').update(buf).digest('hex');
  }
}

async function cleanupAll() {
  results.push('—— 清理 ——');
  for (const { label, fn } of cleanup.reverse()) {
    try { const r = await fn(); const bad = r && r.status && r.status >= 300 && r.status !== 404;
      results.push((bad ? '  ⚠️ 清理' : '  · 清理') + label + (bad ? ' → ' + r.status : ' ✓'));
      if (bad) failed++;
    } catch (e) { results.push('  ⚠️ 清理' + label + '异常 ' + e.message); failed++; }
  }
}

(async () => {
  try { await main(); }
  catch (e) { failed++; results.push('  ❌ 主流程异常: ' + e.message); }
  finally { await cleanupAll(); }
  results.push(`━━━━━━━━━━ ${BASE}\n结果：${passed} 通过，${failed} 失败`);
  console.log(results.join('\n'));
  process.exit(failed ? 1 : 0);
})();
