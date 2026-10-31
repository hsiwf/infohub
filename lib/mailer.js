'use strict';
/* 零依赖 SMTP 发信：node:tls 直连（腾讯企业邮 smtp.exmail.qq.com:465 已验证）。
 * createMailer(cfg, opts) 返回 { enabled, dryRun, sent, sendMail }：
 * - enabled：host/user/pass 齐全才启用；dryRun（自检）模式视为启用但不碰网络
 * - dryRun 下每封邮件记进 sent 数组，自检直接断言，不依赖真实邮箱
 * - sendMail 内置 1.5 秒间隔节流，批量发送不会瞬间打满发件限额 */
const tls = require('node:tls');
const b64 = (s) => Buffer.from(String(s)).toString('base64');

function createMailer(cfg, opts = {}) {
  const state = {
    enabled: !!(cfg && cfg.host && cfg.user && cfg.pass) || !!opts.dryRun,
    dryRun: !!opts.dryRun,
    sent: [],
  };
  let lastSend = 0;
  async function sendMail({ to, subject, text }) {
    if (!state.enabled) throw new Error('SMTP 未配置');
    if (state.dryRun) { state.sent.push({ to, subject, text }); return { ok: true, dryRun: true }; }
    const gap = Date.now() - lastSend;
    if (gap < 1500) await new Promise((r) => setTimeout(r, 1500 - gap));
    lastSend = Date.now();
    await smtpSend(cfg, { to, subject, text });
    return { ok: true };
  }
  return Object.assign(state, { sendMail });
}

function smtpSend(cfg, { to, subject, text }) {
  return new Promise((resolve, reject) => {
    let stage = 0, buf = '';
    const sock = tls.connect({ host: cfg.host, port: cfg.port || 465, rejectUnauthorized: true });
    const fail = (m) => { try { sock.destroy(); } catch (e) { /* 已断开 */ } reject(new Error(m)); };
    sock.setTimeout(25000, () => fail('SMTP 连接超时'));
    sock.on('error', (e) => fail('SMTP 连接：' + e.message));
    sock.on('data', (d) => {
      buf += d.toString();
      if (!/\r\n$/.test(buf)) return; // 应答未收完整
      const lines = buf; buf = '';
      const lastLine = lines.trimEnd().split('\r\n').pop();
      const code = parseInt(lastLine.slice(0, 3), 10);
      if (lastLine.length > 3 && lastLine[3] !== ' ') return; // 多行应答的中间行，继续收
      const step = () => {
        switch (stage) {
          case 0: if (code !== 220) return fail('SMTP 问候异常 ' + code); stage = 1; sock.write('EHLO infohub\r\n'); break;
          case 1: if (code !== 250) return fail('EHLO 被拒 ' + code); stage = 2; sock.write('AUTH LOGIN\r\n'); break;
          case 2: if (code !== 334) return fail('SMTP 认证未启动 ' + code); stage = 3; sock.write(b64(cfg.user) + '\r\n'); break;
          case 3: if (code !== 334) return fail('SMTP 用户名被拒'); stage = 4; sock.write(b64(cfg.pass) + '\r\n'); break;
          case 4: if (code !== 235) return fail('SMTP 认证失败（检查客户端专用密码）' + code); stage = 5; sock.write('MAIL FROM:<' + cfg.from + '>\r\n'); break;
          case 5: if (code !== 250) return fail('MAIL FROM 被拒 ' + code); stage = 6; sock.write('RCPT TO:<' + to + '>\r\n'); break;
          case 6: if (code !== 250) return fail('收件人被拒 ' + to + ' ' + code); stage = 7; sock.write('DATA\r\n'); break;
          case 7: if (code !== 354) return fail('DATA 未就绪 ' + code); stage = 8;
            sock.write(
              'From: =?UTF-8?B?' + b64(cfg.fromName || '班级信息汇总') + '?= <' + cfg.from + '>\r\n' +
              'To: <' + to + '>\r\n' +
              'Subject: =?UTF-8?B?' + b64(subject) + '?=\r\n' +
              'Date: ' + new Date().toUTCString() + '\r\n' +
              'MIME-Version: 1.0\r\n' +
              'Content-Type: text/plain; charset=UTF-8\r\n' +
              'Content-Transfer-Encoding: base64\r\n' +
              '\r\n' +
              b64(text).replace(/(.{76})/g, '$1\r\n') + '\r\n.\r\n');
            break;
          case 8: if (code !== 250) return fail('正文被拒 ' + code); stage = 9; sock.write('QUIT\r\n'); break;
          case 9: resolve(); break;
        }
      };
      step();
    });
  });
}

module.exports = { createMailer };
