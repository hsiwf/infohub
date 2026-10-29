/* 自检启动器：把服务连同一份临时数据快照起起来，再跑 test.js。
 *
 * 为什么要快照：一次自检要写上千条操作记录、建几百条信息，还会跑备份导入。以前这些
 * 全落在真实库上——跑顺了靠收尾删除，进程被杀 / 断电 / 中途异常就留下一堆残留，
 * 下一次自检的「搜索命中 1 条」变成 2 条、改群名撞上同名 409，于是要么反复手工清数据，
 * 要么对着上一次的失败结果猜是不是代码问题。
 *
 * 现在改成：先用 VACUUM INTO 拿一份一致性快照（直接复制文件在 WAL 下会拿到半截状态），
 * 连 config.json 和 uploads 一起放进临时目录，服务端用 INFOHUB_DATA_DIR 指过去。
 * 真实库自始至终不参与读写，跑完连临时目录一起删掉，怎么中断都不会污染下一次。
 *
 * 端口被占用不再需要拒绝执行——数据已经隔离，另找一个空闲端口跑就行。
 *
 * 用法：npm run selftest
 *   TEST_KEEP_SNAPSHOT=1 npm run selftest   保留本次快照目录，人工查看写了什么
 *   INFOHUB_SELFTEST 仍会带上：操作记录打 tag='selftest'，便于单独跑 test.js 时识别
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { DatabaseSync } = require('node:sqlite');

const REAL_DATA = path.join(__dirname, 'data');
const KEEP = process.env.TEST_KEEP_SNAPSHOT === '1';
const base = (p) => String(p).replace(/\\/g, '/').replace(/'/g, "''");

const get = (port, p) => new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${port}${p}`, (r) => { let s = ''; r.on('data', (d) => s += d); r.on('end', () => res({ status: r.statusCode, s })); }).on('error', rej);
});

function portFree(port) {
  return new Promise((res) => {
    const sv = net.createServer();
    sv.once('error', () => res(false));
    sv.once('listening', () => sv.close(() => res(true)));
    sv.listen(port, '127.0.0.1');
  });
}

// 附件类用例要能读到库里已有的文件，所以 uploads 整份复制进快照目录
function copyTree(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    const st = fs.statSync(src);
    if (st.isDirectory()) copyTree(src, dst);
    else if (st.isFile()) fs.copyFileSync(src, dst);
  }
}

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'infohub-selftest-'));
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  const realDb = path.join(REAL_DATA, 'infohub.db');
  if (fs.existsSync(realDb)) {
    const src = new DatabaseSync(realDb);
    try { src.exec(`VACUUM INTO '${base(path.join(dir, 'infohub.db'))}'`); } finally { src.close(); }
    purgeStaleFixtures(path.join(dir, 'infohub.db'));
  }
  for (const f of ['config.json']) {
    const p = path.join(REAL_DATA, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, f));
  }
  copyTree(path.join(REAL_DATA, 'uploads'), path.join(dir, 'uploads'));
  return dir;
}

// 快照里删掉上几轮被中断的自检留下的行。不删的话这些残留会把「搜索命中 1 条」变成 2 条、
// 让改群名撞上同名 409、让留言板最热排序被上一轮点赞过的旧条目压住——于是每次失败都要
// 先花一番力气分辨到底是代码问题还是残留问题。只删自检脚本自己造出来的固定名，真实数据不动。
const FIXTURES = {
  messages: "title LIKE '自检%'",
  groups: "name LIKE '自检%'",
  guestbook: "content LIKE '自检%'",
  funds: "note LIKE '自检%'",
  idea_campaigns: "title LIKE '自检%'",
  rosters: "name LIKE '自检%'",
  votes: "title LIKE '自检%'",
  surveys: "title LIKE '自检%'",
  jielongs: "title LIKE '自检%'",
  draws: "title LIKE '自检%'",
  survey_templates: "name LIKE '自检%'",
  inbox: "content LIKE '%自检%'",
  audit_log: "tag = 'selftest'",
};
function purgeStaleFixtures(dbPath) {
  const db = new DatabaseSync(dbPath);
  const report = [];
  try {
    db.exec('BEGIN');
    const n = (t, w) => db.prepare(`SELECT count(*) n FROM ${t} WHERE ${w}`).get().n;
    for (const [t, w] of Object.entries(FIXTURES)) {
      const hit = n(t, w);
      if (!hit) continue;
      db.prepare(`DELETE FROM ${t} WHERE ${w}`).run();
      report.push(`${t} ${hit}`);
    }
    const cascade = [
      ['attachments', 'message_id NOT IN (SELECT id FROM messages)'],
      ['fund_attachments', 'fund_id NOT IN (SELECT id FROM funds)'],
      ['idea_attachments', 'idea_id NOT IN (SELECT id FROM guestbook)'],
      ['vote_ballots', 'vote_id NOT IN (SELECT id FROM votes)'],
      ['survey_questions', 'survey_id NOT IN (SELECT id FROM surveys)'],
      ['survey_responses', 'survey_id NOT IN (SELECT id FROM surveys)'],
      ['jielong_entries', 'jielong_id NOT IN (SELECT id FROM jielongs)'],
      ['draw_rounds', 'draw_id NOT IN (SELECT id FROM draws)'],
    ];
    for (const [t, w] of cascade) {
      const hit = n(t, w);
      if (!hit) continue;
      db.prepare(`DELETE FROM ${t} WHERE ${w}`).run();
      report.push(`${t}(孤儿) ${hit}`);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('快照清理残留失败（不影响自检，只是可能重现上轮的假失败）：' + e.message);
  } finally {
    db.close();
  }
  if (report.length) console.log('已从快照里清掉上几轮自检的残留：' + report.join('、'));
}

function dropSandbox(dir) {
  if (KEEP) { console.log(`（快照保留在 ${dir}）`); return; }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.error('临时快照没删干净：' + e.message); }
}

async function pickPort() {
  const wanted = Number(process.env.PORT || 5757);
  for (const p of [wanted, 5758, 5759, 5760, 0]) {
    if (p === 0) break;
    if (await portFree(p)) return p;
  }
  return new Promise((res, rej) => {
    const sv = net.createServer();
    sv.once('error', rej);
    sv.listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => res(p)); });
  });
}

let sandbox = null;
process.on('exit', () => { if (sandbox) dropSandbox(sandbox); });
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => { if (sandbox) dropSandbox(sandbox); process.exit(130); }));

async function main() {
  sandbox = makeSandbox();
  const port = await pickPort();
  console.log(`自检快照：${sandbox}${KEEP ? '（按要求保留）' : '（跑完自动删除）'}`);
  if (port !== Number(process.env.PORT || 5757)) console.log(`5757 被占用，本次改用端口 ${port}`);

  // 管理密码已升级为散列落盘（config.json 里不再有明文），自检必须用已知密码：
  // 往快照的 config.json 写入固定测试密码，服务启动时自动升级成散列，test.js 拿同一个明文登录
  const TEST_PW = 'selftest-password';
  try {
    const cfgPath = path.join(sandbox, 'config.json');
    const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
    cfg.password = TEST_PW;
    delete cfg.password_hash; delete cfg.password_salt;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  } catch (e) { /* 写不进去时 test.js 会按无密码分支走 */ }

  const env = Object.assign({}, process.env, {
    INFOHUB_SELFTEST: '1',
    INFOHUB_DATA_DIR: sandbox,
    PORT: String(port),
    TEST_BASE: `http://127.0.0.1:${port}`,
    TEST_PASSWORD: TEST_PW,
  });
  const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () => { try { srv.kill(); } catch (e) { /* 已退出 */ } };
  srv.on('exit', (code) => { if (code) { console.error('自检服务启动失败，退出码 ' + code); process.exit(1); } });

  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const h = JSON.parse((await get(port, '/api/health')).s);
      if (h.selftest === true) { ready = true; console.log(`自检服务已就绪（http://127.0.0.1:${port}，数据目录已隔离）`); break; }
      console.error('服务起来了但 selftest 标记为 false，说明 env 没传进去，拒绝继续');
      break;
    } catch (e) { /* 还在监听前，继续等 */ }
  }
  if (!ready) { stop(); process.exit(1); }

  const t = spawn(process.execPath, ['test.js'], { stdio: 'inherit', env });
  t.on('exit', (code) => {
    stop();
    // 二次启动回归：config.json 里带明文密码的服务，第一次启动把它散列化；
    // 历史上第 2、3 次启动会把「规范化补出的空 password 字段」误读成用户清空，
    // 把散列删掉——管理员密码静默消失。管理密码这类配置迁移必须幂等，连启多次验证。
    setTimeout(async () => {
      try {
        let ok2 = true;
        const cfgPath = path.join(sandbox, 'config.json');
        for (let boot = 2; boot <= 3; boot++) {
          const srv2 = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'ignore'] });
          let up = false;
          for (let i = 0; i < 40 && !up; i++) {
            await new Promise((r) => setTimeout(r, 250));
            try { up = (await get(port, '/api/health')).status === 200; } catch (e) { /* 还没起来 */ }
          }
          if (!up) { console.error(`❌ 第 ${boot} 次启动失败`); ok2 = false; srv2.kill(); break; }
          const lg = await new Promise((res) => {
            const req = http.request(`http://127.0.0.1:${port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (r) => { let s = ''; r.on('data', (d) => s += d); r.on('end', () => res({ status: r.statusCode, s })); });
            req.on('error', () => res({ status: 0, s: '' }));
            req.end(JSON.stringify({ password: TEST_PW }));
          });
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
          if (lg.status !== 200 || !cfg.password_hash) {
            console.error(`❌ 第 ${boot} 次启动后管理密码丢失（hash=${!!cfg.password_hash}，登录=${lg.status}）——密码迁移不幂等`);
            ok2 = false;
          }
          srv2.kill();
          await new Promise((r) => setTimeout(r, 300));
        }
        if (ok2) console.log('✓ 二次/三次启动回归：管理密码散列在多次重启后保持有效');
        process.exit(ok2 ? (code || 0) : 1);
      } catch (e) { console.error('二次启动回归异常：' + e.message); process.exit(1); }
    }, 300);
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
