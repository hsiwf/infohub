'use strict';

/*
 * 密码散列（零依赖，node:crypto scrypt）
 * 库里只存 加盐散列，绝不存明文；校验走恒定时间比较。
 * 用异步 scrypt：批量开号（全班几十人）时不阻塞事件循环。
 */
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const PARAMS = { N: 16384, r: 8, p: 1 }; // Node 默认 cost，单次约 16MB 内存 / 几十毫秒
const KEYLEN = 32;

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}

async function hashPassword(pw, salt) {
  return (await scrypt(String(pw), Buffer.from(salt, 'hex'), KEYLEN, PARAMS)).toString('hex');
}

// 生成一组新凭据（随机盐 + 散列）
async function makeCredential(pw) {
  const salt = newSalt();
  return { salt, pwHash: await hashPassword(pw, salt) };
}

async function verifyPassword(pw, salt, pwHash) {
  if (!salt || !pwHash) return false;
  let a;
  try {
    a = Buffer.from(await hashPassword(pw, salt), 'hex');
  } catch (e) {
    return false;
  }
  const b = Buffer.from(String(pwHash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 初始密码：学号后 6 位（每人不同、学生自己能想起来，不必挨个下发）
function initialPassword(sid) {
  const s = String(sid || '').trim();
  return s.slice(-6);
}

module.exports = { makeCredential, verifyPassword, initialPassword, newSalt };
