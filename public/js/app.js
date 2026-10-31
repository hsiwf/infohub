'use strict';

/* ========= 工具 ========= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* 内联 SVG 图标集（lucide 风格，24x24 描边，零依赖）。
 * 需要更多图标时在此追加路径即可，key 全部小写。 */
const ICON_PATHS = {
  'inbox': '<rect x="3" y="4" width="18" height="15" rx="2"/><path d="M3 10h5l2 3h4l2-3h5"/>',
  'feed': '<path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M16 4v16"/><path d="M7 9h5M7 13h5M7 17h3"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'chev-down': '<path d="m6 9 6 6 6-6"/>',
  'vote': '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V5h8v5"/><path d="m9.5 14 2 2 3.5-3.5"/>',
  'survey': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  'dots': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  'jielong': '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="4" cy="18" r="1.6"/>',
  'draw': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M9 3v6M15 3v6"/><path d="m9 14 2 2 4-4"/>',
  'birthday': '<path d="M4 21h16"/><path d="M6 21v-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M12 14v-4"/><path d="M10.5 7.5C10.5 6.5 12 5 12 5s1.5 1.5 1.5 2.5a1.5 1.5 0 0 1-3 0z"/>',
  'fund': '<path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><path d="M16 12v6"/><circle cx="16" cy="13" r="1.3"/>',
  'guestbook': '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.4-4.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/><path d="M12 8.5c1-1.6 3.2-.7 3 .9-.1 1.2-1.6 2.1-3 3.1-1.4-1-2.9-1.9-3-3.1-.2-1.6 2-2.5 3-.9z"/>',
  'bulb': '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z"/>',
  'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01"/>',
  'file': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  'chart': '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
  'search': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  'moon': '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'bell': '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  'bell-off': '<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.9 17.9 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><path d="m2 2 20 20"/>',
  'lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  'logout': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'edit': '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  'paperclip': '<path d="m21.4 11.05-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  'doc': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  'sheet': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  'pdf': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h1.5A1.5 1.5 0 0 1 12 14.5v1A1.5 1.5 0 0 1 10.5 17H9v-4zM15 13h2.5M15 17v-4M16.2 15.5H15"/>',
  'slides': '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20M12 16v4"/>',
  'archive': '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9"/><path d="M10 13h4"/>',
  'video': '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>',
  'audio': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'refresh': '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  'link': '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  'users': '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  'copy': '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  'external': '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
  'alert': '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  'pin': '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  'loader': '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  'star': '<path d="m12 3 3 6.2 6.9 1-5 4.9 1.2 6.9-6.1-3.2L5.9 22 7 15.1 2 10l6.9-1z"/>',
  'heart': '<path d="M12 21s-7.5-4.9-10-9.3C.6 8.9 2 5.5 5.2 5c2-.3 3.5.8 4.3 2 .8-1.2 2.3-2.3 4.3-2 3.2.5 4.6 3.9 3.2 6.7C19.5 16.1 12 21 12 21z"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  'stop': '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  'sparkles': '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
  'undo': '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'message': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'wechat': '<path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h6A2.5 2.5 0 0 1 14 5.5v3a2.5 2.5 0 0 1-2.5 2.5H8l-3.2 3V11h.7A2.5 2.5 0 0 1 3 8.5z"/><path d="M11 10.2c.6-.1 1.3-.2 2-.2 3.3 0 6 1.9 6 4.2 0 1.2-.7 2.3-1.8 3.1l.5 1.9-2.3-1.2c-.7.2-1.5.3-2.4.3-1 0-2-.2-2.8-.5"/>',
  'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  'qr': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v3M17 21h4M14 21h.01"/>',
};
function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 转义后按搜索词高亮（先按原文匹配、分段转义，避免 XSS）
function hl(text, q) {
  const raw = String(text == null ? '' : text);
  if (!q) return esc(raw);
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(safe, 'gi');
  let out = '', last = 0, m;
  while ((m = re.exec(raw))) {
    out += esc(raw.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
    last = m.index + m[0].length;
    if (!m[0].length) re.lastIndex++;
  }
  return out + esc(raw.slice(last));
}
/* 信息中心标题/正文里的网址自动转成可点击链接（新标签页打开）。
 * 先在原文里切出 URL 段、各段分别转义，不吃 XSS；URL 字符集排除 CJK 与全角区，
 * 避免「…com.cn请及时填写」这类通知把后面的话拼进链接。 */
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`\u2000-\u206f\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]+/gi;
function trimUrlTail(u) {
  // 粘在链接尾部的英文标点去掉；右括号只在链接内没配上左括号时才当作正文标点
  const PAIRS = { ')': '(', ']': '[', '}': '{' };
  while (u.length) {
    const c = u.slice(-1);
    if ('.,;:!?"\''.includes(c)) { u = u.slice(0, -1); continue; }
    if (PAIRS[c] && u.split(PAIRS[c]).length < u.split(c).length) { u = u.slice(0, -1); continue; }
    break;
  }
  return u;
}
function linkify(text, q) {
  const raw = String(text == null ? '' : text);
  let out = '', last = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(raw))) {
    const url = trimUrlTail(m[0]);
    out += hl(raw.slice(last, m.index), q);
    last = m.index + url.length;
    // 去掉尾部标点后已不成其为网址的（如只剩「https://」）按普通文本输出
    const core = url.replace(/^(?:https?:\/\/|www\.)/i, '');
    if (core && /[.:]/.test(core)) {
      const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
      out += `<a class="tlink" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${hl(url, q)}</a>`;
    } else {
      out += esc(url);
    }
    URL_RE.lastIndex = last; // 被当标点去掉的尾部字符留给下轮按普通文本渲染
  }
  return out + hl(raw.slice(last), q);
}
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowLocalVal() {
  const d = new Date();
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dtToVal(s) {
  if (!s) return '';
  s = String(s).replace(' ', 'T').slice(0, 16);
  // datetime-local 不接受纯日期；只有日期时按"当天最后"处理，避免编辑时丢值
  return s.length === 10 ? s + 'T23:59' : s;
}
function valToDt(s) { return s ? String(s).replace('T', ' ') : ''; }
function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}
function friendlyDate(dateStr) {
  const now = new Date();
  const t = ymd(now);
  if (dateStr === t) return '今天';
  if (dateStr === ymd(new Date(now.getTime() + 86400000))) return '明天';
  if (dateStr === ymd(new Date(now.getTime() - 86400000))) return '昨天';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  const diff = Math.round((d - new Date(t + 'T00:00:00')) / 86400000);
  if (diff > 0 && diff < 7) return '周' + '日一二三四五六'[d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function fmtReceived(s) {
  if (!s) return '';
  const [date, time] = String(s).split(' ');
  const now = new Date();
  // 当天消息用相对时间（刚刚 / N 分钟前），更早的保持日期可读
  if (date === ymd(now) && time) {
    const diffMin = (now - new Date(date + 'T' + time)) / 60000;
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return Math.floor(diffMin) + ' 分钟前';
    return '今天 ' + time.slice(0, 5);
  }
  return friendlyDate(date) + (time ? ' ' + time.slice(0, 5) : '');
}
function dlChip(dl) {
  if (!dl) return '';
  const [date, time] = String(dl).split(' ');
  const now = new Date();
  const nowStr = `${ymd(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const end = time ? `${date} ${time}` : `${date} 23:59`;
  let cls = 'ok';
  if (end < nowStr) cls = 'overdue';
  else if (date === ymd(now)) cls = 'today';
  else if (date <= ymd(new Date(now.getTime() + 3 * 86400000))) cls = 'soon';
  const label = cls === 'overdue'
    ? `已逾期 · ${friendlyDate(date)}${time ? ' ' + time.slice(0, 5) : ''}`
    : `截止 ${friendlyDate(date)}${time ? ' ' + time.slice(0, 5) : ''}`;
  return `<span class="dlchip ${cls}">${icon(cls === 'overdue' ? 'alert' : 'clock')}${esc(label)}</span>`;
}

const CATS = {
  notice: { label: '通知', icon: icon('feed', 'ic-feed') },
  task: { label: '任务', icon: icon('pin', 'ic-task') },
  activity: { label: '活动', icon: icon('sparkles', 'ic-activity') },
  file: { label: '文件', icon: icon('paperclip', 'ic-file') },
  other: { label: '其他', icon: icon('dots', 'ic-other') },
};
const PLATS = {
  qq: { label: 'QQ', cls: 'plat-qq', icon: icon('message') },
  wechat: { label: '微信', cls: 'plat-wx', icon: icon('wechat') },
  other: { label: '其他', cls: 'plat-ot', icon: icon('globe') },
};

async function api(path, opts = {}) {
  const o = { headers: {} };
  if (opts.method) o.method = opts.method;
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData) { o.body = opts.body; }
    else { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  }
  const r = await fetch(path, o);
  if (!r.ok) {
    let msg = `请求失败(${r.status})`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch (e) { /* ignore */ }
    // 管理员会话过期：提示后回登录页。必须是"密码模式 + 确认处于登录态"才跳转——
    // 页面刚打开时 state.me 还是默认值，访客的 401（如待审核角标）绝不能触发跳转
    if (r.status === 401 && state.me.authRequired && state.me.loggedIn) {
      toast(msg, 'error');
      setTimeout(() => { location.href = '/login'; }, 900);
    }
    const err = new Error(msg);
    err.status = r.status; // 调用方区分网络抖动（无 status / 5xx）与资源已删除（404）
    throw err;
  }
  return r.json();
}

let toastTimer = null;
function toast(msg, type) {
  const el = $('#toast');
  // 图标是内置可信 SVG，文案走 textContent 防注入
  el.innerHTML = '';
  const ic = document.createElement('span');
  ic.className = 't-ic' + (type === 'error' ? ' err' : '');
  ic.innerHTML = icon(type === 'error' ? 'alert' : 'check');
  const tx = document.createElement('span');
  tx.textContent = msg;
  el.append(ic, tx);
  el.className = 'show' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2400);
}

/* ========= 状态 ========= */
const state = {
  view: 'feed',
  q: '',
  category: '',
  group: null,
  sort: 'time',
  showDone: false,
  total: 0,
  inboxTotal: 0,   // 待审核条数（信息中心的「待审核」标签上显示）
  groups: [],
  editingId: null,
  pendingFiles: [],
  existingAtts: [],
  vote: null,
  survey: null,    // 问卷详情状态 {id}；null = 列表
  me: { authRequired: false, loggedIn: true, role: 'admin', name: '', sid: '', mustChange: false }, // 会话状态（启动时从 /api/me 拉取；默认按开放部署的乐观值，避免首屏闪一下）
  dividerShown: false,
  jl: null,        // 接龙详情状态 {id}；null = 列表
  jlBanner: false, // 创建成功横幅（只显示一次）
  jlQuiet: false,  // 定时刷新中（不滚动）
  draw: null,      // 抽签详情的签箱 id；null = 列表
  fund: { type: '', q: '', from: '', to: '' }, // 班费收支筛选条件
  gb: { tab: 'campaign', campaign: null, status: '', danmaku: true, files: [], loaded: 0, total: 0, sort: 'new', topic: '', shown: new Set() },  // 思维碰撞：征集列表/留言墙两个标签、当前征集、状态筛选、待传附件、弹幕
  audit: { offset: 0, who: '', action: '', from: '', to: '' },  // 操作记录筛选与分页
};
let gbTimer = null; // 弹幕轮播定时器

/* ========= 身份与权限 ========= */
// 角色由 /api/me 给出：admin=管理员（管理密码登录）/ officer=班委 / student=同学 / guest=未登录
function isSysAdmin() { return state.me.role === 'admin'; }
function isOfficer() { return state.me.role === 'officer'; }
const ME_ROLE = { admin: '管理员', officer: '班委', student: '同学' };
function canPost() { return isSysAdmin() || isOfficer(); }
async function loadMe() {
  try { state.me = await api('/api/me'); } catch (e) { /* 拉取失败沿用默认值 */ }
  document.body.classList.toggle('readonly', !canPost());
  const lb = $('#btn-login');
  if (lb) lb.style.display = state.me.loggedIn ? 'none' : '';
  const out = $('#btn-logout');
  if (out) {
    out.style.display = state.me.loggedIn && state.me.authRequired ? '' : 'none';
    if (!out.bound) { out.bound = true; out.addEventListener('click', doLogout); }
  }
  const idc = $('#me-chip');
  if (idc) {
    idc.style.display = state.me.role === 'guest' ? 'none' : '';
    idc.innerHTML = (ME_ROLE[state.me.role] || state.me.role) + (state.me.name ? ' · ' + esc(state.me.name) : '')
      + (state.me.mustChange ? ' <b class="me-warn">改密码</b>' : '');
    idc.title = state.me.mustChange ? '你仍在用初始密码，点这里改成自己的' : '账号与退出登录';
    idc.onclick = openAccountModal;
  }
  // 账号名单只归管理员；等待审核归管理员与班委
  document.querySelectorAll('.admin-only').forEach((el) => { el.style.display = isSysAdmin() ? '' : 'none'; });
  document.querySelectorAll('.post-only').forEach((el) => { el.style.display = canPost() ? '' : 'none'; });
}

/* ========= 弹窗 ========= */
let lastFocusEl = null;
function openModal(html) {
  lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $('#modal-root').innerHTML = `<div class="backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const bd = $('#modal-root .backdrop');
  // 只有"按下"和"松开"都在遮罩上才关闭——在弹窗里选中文字拖到遮罩上不会误关
  let downOnBackdrop = false;
  bd.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === bd; });
  bd.addEventListener('click', (e) => { if (e.target === bd && downOnBackdrop) closeModal(); });
  const cancel = $('#btn-cancel');
  if (cancel) cancel.addEventListener('click', closeModal);
  // 焦点圈定：Tab 在弹窗内循环，不漏到背景页面
  const modal = $('#modal-root .modal');
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const els = $$('.modal button, .modal input:not([type=hidden]), .modal textarea, .modal select, .modal a[href]')
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // 初始焦点落在第一个可交互元素上
  setTimeout(() => {
    const target = $$('.modal input:not([type=hidden]):not([type=checkbox]):not([type=color]):not([type=file]), .modal textarea, .modal select, .modal button.primary, .modal button.ghost')
      .find((el) => !el.disabled && el.offsetParent !== null);
    if (target) target.focus();
  }, 40);
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  state.pendingFiles = []; // 弹窗已关，暂存的附件一并作废，否则离开页面会被误判“有未保存内容”
  if (lastFocusEl && document.body.contains(lastFocusEl)) { try { lastFocusEl.focus(); } catch (e) { /* 忽略 */ } }
  lastFocusEl = null;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ========= 侧栏 / 顶栏 ========= */
function platIcon(p) { return (PLATS[p] || PLATS.other).icon; }

function renderSidebar() {
  $('#grouplist').innerHTML =
    `<div class="gitem ${state.group ? '' : 'active'}" data-gid="">${icon('inbox')} 全部群</div>` +
    state.groups.map((g) => `
      <div class="gitem ${String(state.group) === String(g.id) ? 'active' : ''}" data-gid="${g.id}">
        <span class="dot" style="background:${esc(g.color)}"></span>
        ${platIcon(g.platform)} ${esc(g.name)}
        <span class="cnt">${g.count}</span>
      </div>`).join('');
  $('#group-sel').innerHTML = `<option value="">全部群</option>` +
    state.groups.map((g) => `<option value="${g.id}" ${String(state.group) === String(g.id) ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
}

async function loadGroups() {
  const data = await api('/api/groups?withCounts=1');
  state.groups = data.items;
  renderSidebar();
}

function renderChips() {
  const chips = [['', '全部'], ['notice', '通知'], ['task', '任务'], ['activity', '活动'], ['file', '文件'], ['other', '其他']];
  // 手机上没有侧栏：群筛选激活时在这里显示可关闭的小标签
  const g = state.groups.find((x) => String(x.id) === String(state.group));
  const groupChip = g ? `<button class="chipbtn active" data-clear-group="1" title="清除群筛选">${icon('users')} ${esc(g.name)} ✕</button>` : '';
  $('#chips').innerHTML = groupChip + chips.map(([k, l]) =>
    `<button class="chipbtn ${state.category === k ? 'active' : ''}" data-cat="${k}">${k ? (CATS[k] || CATS.other).icon : icon('feed')}<span>${l}</span></button>`).join('') +
    `<label class="showdone"><input type="checkbox" id="showdone" ${state.showDone ? 'checked' : ''}> 显示已完成</label>`;
  $('#chips').style.display = state.view === 'feed' ? 'flex' : 'none';
  // 让选中的分类滚进视野（手机上点后面的标签时不会弹回最左）
  const act = $('#chips .chipbtn.active');
  if (act && act.scrollIntoView) {
    try { act.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* 老浏览器忽略 */ }
  }
}

/* ========= 信息流 ========= */
// 骨架屏：数据到达前的占位卡片（只用于首屏，追加加载不显示）
function skeletonFeed(n = 4) {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<div class="card skel" aria-hidden="true">
      <div class="skline w30"></div>
      <div class="skline w70 tall"></div>
      <div class="skline w95"></div>
      <div class="skline w45"></div>
    </div>`;
  }
  return s;
}
function cardHTML(it) {
  const cat = CATS[it.category] || CATS.other;
  const plat = it.group_platform ? (PLATS[it.group_platform] || PLATS.other) : null;
  const done = it.status === 'done';
  const tags = (it.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const body = (it.content || '').replace(/\r/g, '').trim();
  // 长正文不再按字数砍断：全文渲染，超过约 8 行默认折叠，点「展开全文」查看
  const folded = body.length > 300;
  const atts = (it.attachments || []).map((a) => {
    // 图片附件直接显示缩略图（/raw 不计阅读数），点击看大图才算一次阅读
    // 类型范围与服务端 /raw 白名单一致（SVG 等会被服务端转附件下载，不能当缩略图）
    if (/^image\/(png|jpeg|gif|webp|bmp)/.test(a.mime || '')) {
      return `<a class="att-thumb" href="/api/attachments/${a.id}/download" target="_blank" title="${esc(a.orig_name)}"><img loading="lazy" src="/api/attachments/${a.id}/raw" alt="${esc(a.orig_name)}"></a>`;
    }
    return `<a class="att" href="/api/attachments/${a.id}/download" target="_blank">${icon('paperclip')} ${esc(a.orig_name)} <span class="att-size">${fmtSize(a.size)}</span></a>`;
  }).join('');
  return `<article class="card cat-${it.category}${done ? ' done' : ''}${it.pinned ? ' pinned' : ''}" data-id="${it.id}">
    <div class="card-top">
      <span class="badge cat-${it.category}">${cat.icon} ${cat.label}</span>
      ${it.pinned ? '<span class="pintag">' + icon('pin') + '</span>' : ''}
      ${it.group_name ? `<span class="chip ${plat ? plat.cls : ''}">${plat ? plat.icon : ''}${plat ? plat.label : ''}·${esc(it.group_name)}</span>` : ''}
      ${it.sender_name ? `<span class="sender">${icon('users')} ${esc(it.sender_name)}</span>` : ''}
      <span class="spacer"></span>
      <span class="time">${esc(fmtReceived(it.received_at))}</span>
    </div>
    <h3 class="card-title">${linkify(it.title || '(无标题)', state.q)}</h3>
    ${body ? `<p class="card-body${folded ? ' clamped' : ''}">${linkify(body, state.q)}</p>${folded ? `<button class="bodymore" data-act="bodymore" aria-expanded="${!folded}">${icon('chev-down')} 展开全文</button>` : ''}` : ''}
    <div>${dlChip(it.deadline)}</div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    ${atts ? `<div class="atts">${atts}</div>` : ''}
    ${canPost() ? `<div class="card-actions">
      <button data-act="toggle" class="ghost">${done ? icon('undo') + ' 取消完成' : icon('check') + ' 完成'}</button>
      <button data-act="pin" class="ghost">${icon('pin')} ${it.pinned ? '取消置顶' : '置顶'}</button>
      ${isSysAdmin() ? `<button data-act="edit" class="ghost">${icon('edit')} 编辑</button>
      <button data-act="del" class="ghost danger">${icon('trash')} 删除</button>` : ''}
    </div>` : ''}
  </article>`;
}

async function loadFeed(append = false) {
  const seq = loadSeq; // 入口捕获代次：响应回来时若已切换视图/筛选（代次变化）则丢弃
  const stale = () => seq !== loadSeq;
  const view = $('#view');
  if (!append) view.innerHTML = skeletonFeed();
  // 主列表只放未完成；已完成的单独放底部“已完成”区（offset 只数未完成卡片）
  const offset = append ? $$('#view .card:not(.done)').length : 0;
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.group) params.set('group_id', state.group);
  params.set('status', 'open');
  params.set('sort', state.sort);
  params.set('limit', '50');
  params.set('offset', String(offset));
  const data = await api('/api/messages?' + params);
  if (stale()) return; // 等待期间用户已切换视图 / 筛选，丢弃旧响应
  state.total = data.total;
  const more = $('#btn-more');
  if (more) more.closest('.morewrap').remove();

  // 已完成区：勾选“显示已完成”时在底部出现。默认只探一次总数、不渲染卡片，
  // 点「加载已完成 / 显示更多」按 100 条一页追加；有搜索词时直接加载第一页
  let doneSection = '';
  let autoDone = false;
  if (state.showDone && offset === 0) {
    const dp = new URLSearchParams(params);
    dp.set('status', 'done');
    dp.set('sort', 'time');
    dp.set('limit', '1');
    dp.delete('offset');
    try {
      const probe = await api('/api/messages?' + dp);
      if (stale()) return;
      if (probe.total > 0) {
        doneSection = `<div id="done-sec"><div id="done-list"></div>${doneBarHTML(probe.total, 0)}</div>`;
        autoDone = !!state.q;
      }
    } catch (e) { /* 已完成区加载失败不影响主列表 */ }
  }

  if (offset === 0) view.innerHTML = '';
  if (state.total === 0) {
    const filtered = !!(state.q || state.category || state.group);
    view.innerHTML = filtered
      ? `<div class="empty"><div class="big">${icon('search')}</div>当前筛选条件下没有信息<br>
         <button id="btn-clear-filter" class="ghost" style="margin-top:12px">✕ 清除筛选，查看全部信息</button></div>`
      : canPost()
        ? `<div class="empty"><div class="big">${icon('inbox')}</div>还没有记录<br>点右上角「＋ 添加信息」，把老师发的通知粘贴进来试试</div>`
        : `<div class="empty"><div class="big">${icon('inbox')}</div>还没有记录<br>老师发布通知后会出现在这里</div>`;
    if (doneSection) {
      view.insertAdjacentHTML('beforeend', doneSection);
      if (autoDone) loadMoreDone().catch(() => {});
    }
    addBdBanner();
    addNoPasswordBanner();
    return;
  }
  // 提醒功能一次性引导（仅在通知权限未决定时出现）
  if (!append && 'Notification' in window && Notification.permission === 'default' && !localStorage.getItem('infohub-notif-dismissed')) {
    view.insertAdjacentHTML('afterbegin', `<div class="notifbar">${icon('bell')} 建议开启截止提醒：逾期和 24 小时内截止的任务会自动弹窗通知
      <span class="spacer"></span><button id="notif-on" class="mini">开启</button><button id="notif-no" class="mini">暂不</button></div>`);
    const on = $('#notif-on');
    const off = $('#notif-no');
    if (on) on.addEventListener('click', () => { localStorage.setItem('infohub-notif-dismissed', '1'); onBellClick(); const b = on.closest('.notifbar'); if (b) b.remove(); });
    if (off) off.addEventListener('click', () => { localStorage.setItem('infohub-notif-dismissed', '1'); const b = off.closest('.notifbar'); if (b) b.remove(); });
  }
  let html = '';
  let dividerDone = append && state.dividerShown;
  if (!append) state.dividerShown = false;
  for (const it of data.items) {
    // 按截止时间排序时，给沉底的"无截止时间"信息加一条分隔线
    if (state.sort === 'deadline' && !dividerDone && !it.deadline) {
      html += '<div class="feeddivider">以下信息没有截止时间（按收到时间排列）</div>';
      dividerDone = true;
      state.dividerShown = true;
    }
    html += cardHTML(it);
  }
  const shown = offset + data.items.length;
  let moreHtml = '';
  if (shown < state.total) {
    moreHtml = `<div class="morewrap"><button id="btn-more" class="ghost">加载更多（已显示 ${shown}/${state.total}）</button></div>`;
  }
  // 已完成区存在时，新内容要插在它前面，保证“已完成”永远在最底部
  const doneSec = $('#done-sec', view);
  if (doneSec) doneSec.insertAdjacentHTML('beforebegin', html + moreHtml);
  else view.insertAdjacentHTML('beforeend', html + moreHtml + doneSection);
  if (autoDone) loadMoreDone().catch(() => {});
  if (!append) { addBdBanner(); addNoPasswordBanner(); }
  const newMore = $('#btn-more');
  if (newMore) newMore.addEventListener('click', () => {
    // 先禁用再请求：响应慢时连点会用同一 offset 追加出重复的一页；失败后恢复可重试
    newMore.disabled = true;
    loadFeed(true).catch((e) => {
      newMore.disabled = false;
      toast(e.message, 'error');
    });
  });
}
// 「已完成」区的计数条与分页追加：已渲染的卡片数就是下一页的 offset，视图刷新后自然归位
function doneBarHTML(total, loaded) {
  const rest = total - loaded;
  const label = loaded ? `已显示 ${Math.min(loaded, total)} / ${total} 条` : `共 ${total} 条已完成`;
  const btn = rest > 0 ? `<button class="mini" data-act="donemore">${loaded ? '显示更多' : '加载已完成'}</button>` : '';
  return `<div class="morebar"><span>${icon('check')} ${label}</span><span class="spacer"></span>${btn}</div>`;
}
async function loadMoreDone() {
  const sec = $('#done-sec');
  if (!sec) return;
  const bar = sec.querySelector('.morebar');
  const btn = bar && bar.querySelector('button');
  if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }
  const offset = sec.querySelectorAll('.card').length;
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.category) p.set('category', state.category);
  if (state.group) p.set('group_id', state.group);
  p.set('status', 'done');
  p.set('sort', 'time');
  p.set('limit', '100');
  p.set('offset', String(offset));
  try {
    const d = await api('/api/messages?' + p);
    // 响应等待期间视图可能被重新渲染（同名的新容器），元素身份对不上就丢弃旧响应
    const sec2 = $('#done-sec');
    if (!sec2 || sec2 !== sec) return;
    sec2.querySelector('#done-list').insertAdjacentHTML('beforeend', d.items.map(cardHTML).join(''));
    if (bar && bar.isConnected) bar.outerHTML = doneBarHTML(d.total, offset + d.items.length);
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = offset ? '显示更多' : '加载已完成'; }
  }
}
// 生日横幅：今天有人过生日时，信息页最顶部展示（含空结果页）
function addBdBanner() {
  if (!bdTodayCache || !bdTodayCache.length) return;
  if ($('.bd-feedbanner')) return; // 已展示过就不重复插（追加加载时 loadFeed 会再次走到这里）
  const view = $('#view');
  view.insertAdjacentHTML('afterbegin', `<div class="bd-feedbanner">${icon('birthday')} 今天是 ${bdTodayCache.map((m) => '<b>' + esc(m.name) + '</b>').join('、')} 的生日，让我们送上祝福！<a data-bd-goto>去看看 →</a></div>`);
  const goto = $('[data-bd-goto]');
  if (goto) goto.addEventListener('click', () => {
    state.view = 'birthday';
    syncNavActive();
    renderView().catch((e) => toast(e.message, 'error'));
  });
}
// 未设密码提醒：这种部署下任何人都能修改内容，信息页常驻提示（可一次性关闭）
function addNoPasswordBanner() {
  if (state.me.authRequired !== false) return; // 已设密码时不出现
  if (localStorage.getItem('infohub-nopass-dismissed')) return;
  if ($('.nopass-banner')) return;
  const view = $('#view');
  view.insertAdjacentHTML('afterbegin', `<div class="nopass-banner notifbar">${icon('alert')} 未设置管理密码：任何打开此页面的人都能修改内容。可在 data/config.json 的 password 字段设置密码后重启生效。<button class="mini" id="nopass-ok">知道了</button></div>`);
  const b = $('#nopass-ok');
  if (b) b.addEventListener('click', () => {
    localStorage.setItem('infohub-nopass-dismissed', '1');
    const el = document.querySelector('.nopass-banner');
    if (el) el.remove();
  });
}

/* ========= 待审核收件箱（QQ review 模式） ========= */
function inboxRow(it) {
  return `<div class="irow" data-iid="${it.id}">
    <div class="imain">
      <div class="itext">${hl(it.content, state.q)}</div>
      <div class="imeta">
        ${it.group_name ? `<span class="chip plat-qq">${icon('message')} ${esc(it.group_name)}</span>` : ''}
        ${it.sender_name ? `<span>${icon('users')} ${esc(it.sender_name)}</span>` : ''}
        <span>${icon('clock')} ${esc(fmtReceived(it.received_at))}</span>
      </div>
    </div>
    <span class="spacer"></span>
    <div class="ibtns">
      <button class="ghost" data-iact="accept" data-iid="${it.id}">${icon('check')} 收录</button>
      <button class="ghost danger" data-iact="dismiss" data-iid="${it.id}">忽略</button>
    </div>
  </div>`;
}
async function loadInbox() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/inbox');
  if (seq !== loadSeq) return;
  state.inboxTotal = data.total;
  renderHubBar();   // 角标长在「待审核」标签上
  const items = !state.q ? data.items : data.items.filter((it) =>
    ((it.content || '') + (it.sender_name || '') + (it.group_name || '')).toLowerCase().includes(state.q.toLowerCase()));
  if (!data.items.length) {
    view.innerHTML = `<div class="empty"><div class="big">${icon('check')}</div>没有待审核的消息<br>QQ 机器人的消息会先进到这里，收录后才会出现在信息流</div>`;
    return;
  }
  view.innerHTML = `
    <div class="inboxhead">
      <h3>${icon('inbox')} 待审核（${items.length}${items.length !== data.total ? '/' + data.total : ''}）</h3>
      <span class="hint">收录后自动识别分类和截止时间；与已有信息重复的可以直接忽略</span>
      <span class="spacer"></span>
      <button class="ghost" id="btn-inbox-accept-all">${icon('check')} 全部收录</button>
      <button class="ghost danger" id="btn-inbox-clear">${icon('trash')} 全部忽略</button>
    </div>
    ${items.map(inboxRow).join('') || '<p class="empty-mini">没有匹配的消息</p>'}`;
  $('#btn-inbox-accept-all').addEventListener('click', async () => {
    if (!confirm(`把待审核的 ${data.total} 条全部收录进信息流？`)) return;
    try {
      const r = await api('/api/inbox/accept-all', { method: 'POST' });
      toast(`已收录 ${r.accepted} 条 ✓`);
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  });
  $('#btn-inbox-clear').addEventListener('click', async () => {
    if (!confirm(`忽略全部 ${data.total} 条待审核消息？（不再收录）`)) return;
    try {
      const r = await api('/api/inbox', { method: 'DELETE' });
      toast(`已忽略 ${r.dismissed} 条`);
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  });
  $$('#view [data-iact]').forEach((btn) => btn.addEventListener('click', async () => {
    const id = btn.dataset.iid;
    try {
      if (btn.dataset.iact === 'accept') {
        await api(`/api/inbox/${id}/accept`, { method: 'POST' });
        toast('已收录进信息流 ✓');
      } else {
        await api('/api/inbox/' + id, { method: 'DELETE' });
        toast('已忽略');
      }
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  }));
}

/* ========= 待办任务 ========= */
function taskRow(it) {
  const plat = it.group_platform ? (PLATS[it.group_platform] || PLATS.other) : null;
  const attN = (it.attachments || []).length;
  return `<div class="trow" data-id="${it.id}">
    ${canPost() ? '<button class="tcheck" data-act="toggle" title="标记完成">' + icon('check') + '</button>' : ''}
    <div class="tmain">
      <div class="ttitle"${isSysAdmin() ? ' data-act="edit"' : ''}>${hl(it.title || (it.content || '').slice(0, 30), state.q)}</div>
      <div class="tmeta">
        ${it.group_name ? `<span class="chip ${plat ? plat.cls : ''}">${plat ? plat.icon : ''}${plat ? plat.label : ''}·${esc(it.group_name)}</span>` : ''}
        ${it.sender_name ? `<span>${icon('users')} ${esc(it.sender_name)}</span>` : ''}
        ${dlChip(it.deadline)}
        ${attN ? `<span>${icon('paperclip')} ${attN} 个附件</span>` : ''}
      </div>
    </div>
  </div>`;
}

async function loadTasks() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  // 大数据量下分三路取数：最近的逾期（新的在前）、未逾期事项、无截止时间的任务，
  // 避免一年前的旧逾期按截止升序霸占分页、把近期要紧的事挤出列表
  const mk = (extra) => {
    const p = new URLSearchParams({ status: 'open', limit: '200' });
    if (state.q) p.set('q', state.q);
    if (state.group) p.set('group_id', state.group);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return '/api/messages?' + p;
  };
  const [odRes, upRes, tdRes] = await Promise.all([
    api(mk({ sort: 'deadline_desc', due: 'overdue', limit: '100' })),
    api(mk({ sort: 'deadline', due: 'after' })),
    api(mk({ category: 'task' })),
  ]);
  if (seq !== loadSeq) return;
  const overdueTotal = odRes.total || 0;
  const items = odRes.items.concat(upRes.items, tdRes.items.filter((it) => !it.deadline));
  if (!items.length) {
    view.innerHTML = `<div class="empty"><div class="big">${icon('check')}</div>没有待办任务，太棒了！<br>任务类信息或带截止时间的信息会出现在这里</div>`;
    return;
  }
  const now = new Date();
  const today = ymd(now);
  const week = ymd(new Date(now.getTime() + 7 * 86400000));
  const buckets = { overdue: [], today: [], week: [], later: [] };
  for (const it of items) {
    if (!it.deadline) { buckets.later.push(it); continue; }
    const d = it.deadline.slice(0, 10);
    const end = it.deadline.length > 10 ? it.deadline : d + ' 23:59';
    if (end < `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}`) buckets.overdue.push(it);
    else if (d === today) buckets.today.push(it);
    else if (d <= week) buckets.week.push(it);
    else buckets.later.push(it);
  }
  const sec = (key, title, list) => list.length
    ? `<div class="tasksec sec-${key}"><h3>${title}（${list.length}）</h3>${list.map(taskRow).join('')}</div>` : '';
  const overdueTitle = overdueTotal > buckets.overdue.length
    ? `${icon('alert')} 已逾期（共 ${overdueTotal} 条，显示最近 ${buckets.overdue.length} 条）`
    : `${icon('alert')} 已逾期（${buckets.overdue.length}）`;
  view.innerHTML =
    `<div class="taskhead"><span class="hint">按截止时间排列，点圆圈打勾完成，点标题可编辑</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ghost" id="btn-ics">${icon('calendar')} 导出到手机日历（.ics）</button>
        <button class="ghost" id="btn-print">${icon('doc')} 打印清单</button>
      </span></div>` +
    sec('overdue', overdueTitle, buckets.overdue) +
    sec('today', `${icon('clock')} 今天要完成`, buckets.today) +
    sec('week', `${icon('calendar')} 未来 7 天`, buckets.week) +
    sec('later', `${icon('clock')} 以后 / 无截止`, buckets.later);
  $('#btn-ics').addEventListener('click', () => window.open('/api/calendar.ics'));
  $('#btn-print').addEventListener('click', () => window.print());
}

/* ========= 文件中心 ========= */
function extIcon(name) {
  const e = (String(name).split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(e)) return [icon('image'), '图片'];
  if (['doc', 'docx'].includes(e)) return [icon('doc'), 'Word'];
  if (['xls', 'xlsx', 'csv'].includes(e)) return [icon('sheet'), 'Excel'];
  if (e === 'pdf') return [icon('pdf'), 'PDF'];
  if (['ppt', 'pptx'].includes(e)) return [icon('slides'), 'PPT'];
  if (['zip', 'rar', '7z'].includes(e)) return [icon('archive'), '压缩包'];
  if (['mp4', 'mov', 'avi', 'mkv'].includes(e)) return [icon('video'), '视频'];
  if (['mp3', 'wav', 'm4a'].includes(e)) return [icon('audio'), '音频'];
  return [icon('file'), '文件'];
}
function fileRowHTML(a) {
  const [fileIcon, typeName] = extIcon(a.orig_name);
  const plat = a.group_platform ? (PLATS[a.group_platform] || PLATS.other) : null;
  return `<div class="frow">
    <div class="ficon">${fileIcon}</div>
    <div class="fmain">
      <div class="fname">${hl(a.orig_name, state.q)} <span class="att-size">${fmtSize(a.size)}</span></div>
      <div class="fmeta">
        <span>${typeName}</span>
        ${a.message_status === 'done' ? `<span class="fdone">${icon('check')} 已完成</span>` : ''}
        <span title="打开预览次数">${icon('eye')} ${a.views || 0}</span>
        <span title="下载次数">${icon('download')} ${a.downloads || 0}</span>
        ${a.group_name ? `<span class="chip ${plat ? plat.cls : ''}">${plat ? plat.icon : ''}${plat ? plat.label : ''}·${esc(a.group_name)}</span>` : ''}
        <span class="fmsg" data-msg="${a.message_id}">来自：${hl(a.message_title || '(无标题)', state.q)}</span>
        <span>${esc(fmtReceived(a.created_at))}</span>
      </div>
    </div>
    <a class="ghost" href="/api/attachments/${a.id}/download" target="_blank">打开</a>
    <a class="ghost" href="/api/attachments/${a.id}/download?dl=1">下载</a>
  </div>`;
}
function fileBarHTML(total, loaded, act, id, done) {
  const rest = total - loaded;
  const noun = done ? '个已完成文件' : '个文件';
  const label = loaded ? `已显示 ${Math.min(loaded, total)} / ${total} ${noun}` : `共 ${total} ${noun}`;
  const btn = rest > 0 ? `<button class="mini" data-act="${act}">${loaded ? '显示更多' : (done ? '加载已完成文件' : '加载文件列表')}</button>` : '';
  return `<div class="morebar"${id ? ` id="${id}"` : ''}><span>${icon('file')} ${label}</span><span class="spacer"></span>${btn}</div>`;
}
async function loadFiles() {
  const seq = loadSeq;
  const stale = () => seq !== loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const mkParams = (status) => {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.group) p.set('group_id', state.group);
    if (status) p.set('status', status);
    return p;
  };
  // 主列表只放未完成信息的附件；已完成信息的附件像信息中心一样单独成区放在下方
  // （勾选「显示已完成」时出现）。两区各自按需分页加载，默认只探总数；
  // 搜索时直接加载第一页（搜索是要找具体文件，不该再多一步点击）
  const openProbe = mkParams('open');
  openProbe.set('limit', '1');
  const data = await api('/api/files?' + openProbe);
  if (stale()) return;
  let doneTotal = 0, doneViews = 0, doneDls = 0, autoDone = false;
  if (state.showDone) {
    const doneProbe = mkParams('done');
    doneProbe.set('limit', '1');
    const d = await api('/api/files?' + doneProbe);
    if (stale()) return;
    doneTotal = d.total;
    doneViews = d.totalViews || 0;
    doneDls = d.totalDownloads || 0;
    autoDone = !!state.q;
  }
  if (!data.total && !doneTotal) {
    // 空态也要保留「显示已完成」开关：已完成附件可能存在，不能给一个无法翻案的假空结果
    view.innerHTML = `
      <div class="inboxhead"><h3>${icon('file')} 文件（0）</h3>
        <label class="showdone"><input type="checkbox" id="files-showdone" ${state.showDone ? 'checked' : ''}> 显示已完成</label></div>
      <div class="empty"><div class="big">${icon('file')}</div>还没有文件<br>在添加/编辑信息时可以上传附件</div>`;
    const sd0 = $('#files-showdone');
    if (sd0) sd0.addEventListener('change', () => {
      state.showDone = sd0.checked;
      renderView().catch((e2) => toast(e2.message, 'error'));
    });
    return;
  }
  const totViews = (data.totalViews || 0) + doneViews;
  const totDls = (data.totalDownloads || 0) + doneDls;
  view.innerHTML = `
    <div class="inboxhead"><h3>${icon('file')} 文件（${data.total}）</h3>
      <span class="hint">${icon('eye')} 累计阅读 ${totViews} 次 · ${icon('download')} 累计下载 ${totDls} 次</span>
      <label class="showdone"><input type="checkbox" id="files-showdone" ${state.showDone ? 'checked' : ''}> 显示已完成</label></div>
    ${data.total ? '<div id="file-list"></div>' + fileBarHTML(data.total, 0, 'filemore', 'file-more') : '<p class="empty-mini">没有未完成信息的附件</p>'}
    ${doneTotal ? `<div id="done-files"><div class="feeddivider">${icon('check')} 已完成（${doneTotal}）</div><div id="done-file-list"></div>${fileBarHTML(doneTotal, 0, 'filedone', '', true)}</div>` : ''}`;
  const sd = $('#files-showdone');
  if (sd) sd.addEventListener('change', () => {
    state.showDone = sd.checked;
    renderView().catch((e2) => toast(e2.message, 'error'));
  });
  if (state.q) {
    if (data.total) loadMoreFiles().catch((e2) => toast(e2.message, 'error'));
    if (autoDone) loadMoreDoneFiles().catch(() => {});
  }
}
async function loadMoreFiles() {
  const list = $('#file-list');
  if (!list) return;
  const bar = $('#file-more');
  const btn = bar && bar.querySelector('button');
  if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }
  const offset = list.querySelectorAll('.frow').length;
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.group) p.set('group_id', state.group);
  p.set('status', 'open');
  p.set('limit', '100');
  p.set('offset', String(offset));
  try {
    const d = await api('/api/files?' + p);
    // 响应等待期间视图可能被重新渲染（同名的新容器），元素身份对不上就丢弃旧响应
    if (!list.isConnected || $('#file-list') !== list) return;
    list.insertAdjacentHTML('beforeend', d.items.map(fileRowHTML).join(''));
    if (bar && bar.isConnected) bar.outerHTML = fileBarHTML(d.total, offset + d.items.length, 'filemore', 'file-more');
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = offset ? '显示更多' : '加载文件列表'; }
  }
}
async function loadMoreDoneFiles() {
  const list = $('#done-file-list');
  if (!list) return;
  const bar = list.parentElement.querySelector('.morebar');
  const btn = bar && bar.querySelector('button');
  if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }
  const offset = list.querySelectorAll('.frow').length;
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.group) p.set('group_id', state.group);
  p.set('status', 'done');
  p.set('limit', '100');
  p.set('offset', String(offset));
  try {
    const d = await api('/api/files?' + p);
    // 响应等待期间视图可能被重新渲染（同名的新容器），元素身份对不上就丢弃旧响应
    if (!list.isConnected || $('#done-file-list') !== list) return;
    list.insertAdjacentHTML('beforeend', d.items.map(fileRowHTML).join(''));
    if (bar && bar.isConnected) bar.outerHTML = fileBarHTML(d.total, offset + d.items.length, 'filedone', '', true);
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = offset ? '显示更多' : '加载已完成文件'; }
  }
}

/* ========= 账号名单（名单是一份份的列表，账号按学号全局唯一，这里并成一屏） ========= */
const US_ROLE = { admin: '管理员', officer: '班委', student: '同学' };
// 一行一个人：账号信息按学号 join 进来（u 为空即"没开号"）
function usRow(name, sid, u) {
  // 变量别叫 state：会遮住全局的 state 对象
  const status = !sid ? '<span class="hint">缺学号，无法开号</span>'
    : !u ? '<span class="hint">未开号</span>'
    : `${u.disabled ? '<span class="jl-badge off">已停用</span>' : ''}${u.must_change ? '<span class="jl-badge off">未修改初始密码</span>' : ''}${(!u.disabled && !u.must_change) ? '<span class="hint">正常</span>' : ''}`;
  const acts = !u ? '' : `<span class="us-acts">
      <button class="mini" data-us-role="${esc(sid)}" data-to="${u.role === 'officer' ? 'student' : 'officer'}">${u.role === 'officer' ? '降为同学' : '设为班委'}</button>
      <button class="mini" data-us-reset="${esc(sid)}" data-name="${esc(name)}">重置密码</button>
      <button class="mini ${u.disabled ? '' : 'danger'}" data-us-disable="${esc(sid)}" data-off="${u.disabled ? '0' : '1'}">${u.disabled ? '恢复' : '停用'}</button></span>`;
  return `<tr><td>${esc(name)}</td><td class="hint">${esc(sid || '—')}</td>
      <td class="hint">${u ? esc(u.qq_id || '—') : '—'}</td>
      <td>${u ? esc(US_ROLE[u.role] || u.role) : '—'}</td><td>${status}</td>
      <td class="hint">${u ? esc(u.last_login || '从未登录') : '—'}</td><td>${acts}</td></tr>`;
}
const US_HEAD = '<thead><tr><th>姓名</th><th>学号</th><th>提醒邮箱</th><th>身份</th><th>状态</th><th>最近登录</th><th></th></tr></thead>';
// 成员表：只列这份名单里的人；名单改过之后残留的账号另有收口，否则那些账号在界面上管不到
function rosterMemberTable(r, accBySid) {
  const parsed = jlParseRoster(r.roster, r.keepId);
  if (!parsed.list.length) return '<span class="hint">（名单内容为空）</span>';
  const rows = parsed.list.map((m) => usRow(m.name, m.id, m.id ? accBySid.get(String(m.id)) : null)).join('');
  const opened = parsed.list.filter((m) => m.id && accBySid.get(String(m.id))).length;
  const noSid = parsed.list.filter((m) => !m.id).length;
  return `<div class="us-sum">已开号 <b>${opened}</b> / ${parsed.list.length} 人${noSid ? ` · <span class="warn-t">${noSid} 人缺学号开不出账号</span>` : ''}
    ${isSysAdmin() ? `<button class="ghost" data-us-sync="${r.id}">${icon('plus')} 按这份名单开通账号</button>
    <button class="ghost" data-us-csv="${r.id}">${icon('download')} 导出成员表</button>` : ''}</div>
    <div class="ad-wrap"><table class="ad-table">${US_HEAD}<tbody>${rows}</tbody></table></div>`;
}
function orphanAccountsPanel(items, accBySid) {
  if (!accBySid.size) return '';
  const inRosters = new Set();
  items.forEach((r) => jlParseRoster(r.roster, r.keepId).list.forEach((m) => { if (m.id) inRosters.add(String(m.id)); }));
  const orphans = [...accBySid.values()].filter((u) => !inRosters.has(String(u.sid)));
  if (!orphans.length) return '';
  return `<div class="panel">
    <div class="jl-head"><h2>不在任何名单里的账号（${orphans.length}）</h2><span class="hint">名单被改过或删掉后剩下的账号，仍可登录，在这里停用或降级</span></div>
    <div class="ad-wrap"><table class="ad-table">${US_HEAD}<tbody>${orphans.map((u) => usRow(u.name, u.sid, u)).join('')}</tbody></table></div>
  </div>`;
}
async function loadRosters() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/rosters');
  if (seq !== loadSeq) return;
  const items = data.items || [];
  let accBySid = new Map();
  try { accBySid = new Map(((await api('/api/users')).items || []).map((u) => [String(u.sid), u])); } catch (e) { /* 拉不到账号列表就只当没开号 */ }
  if (seq !== loadSeq) return; // 第二个 await 之后也要复查，迟到的响应不能盖掉用户已切到的新视图
  const emptyHint = items.length ? '' : `<div class="empty"><div class="big">${icon('users')}</div>还没有保存的名单<br>点「新建名单」，或在发起接龙时勾选「保存到班级名单」</div>`;
  view.innerHTML = `
    <div class="jl-head"><h2>${icon('users')} 账号名单</h2></div>
    <p class="hint">${items.length} 份名单 · ${accBySid.size} 个账号。名单存一份，发起接龙、抽签点名、生日导入时直接复用；学号也是登录名，初始密码是学号后 6 位</p>
    ${isSysAdmin() ? `<div class="jl-actions"><button class="primary" id="btn-roster-new">${icon('plus')} 新建名单</button><button class="ghost" id="btn-qq-import">${icon('upload')} 导入提醒邮箱</button></div>` : ''}
    ${items.map((r) => `
      <div class="panel" data-rid="${r.id}">
        <div class="jl-head"><h2>${esc(r.name)}</h2><span class="hint">${r.count} 人${r.keepId ? ' · 含学号' : ''} · ${esc(fmtReceived(r.updated_at))}</span></div>
        <div class="roster-pv" hidden>${rosterMemberTable(r, accBySid)}</div>
        <div class="card-actions">
          <button class="ghost" data-ract="toggle">${icon('eye')} 成员与账号</button>
          <button class="ghost" data-ract="copy">${icon('copy')} 复制全文</button>
          ${isSysAdmin() ? `<button class="ghost" data-ract="edit">${icon('edit')} 编辑名单</button>
          <button class="ghost danger" data-ract="del">${icon('trash')} 删除</button>` : ''}
        </div>
      </div>`).join('')}
    ${orphanAccountsPanel(items, accBySid)}
    ${emptyHint}`;
  const newBtn = $('#btn-roster-new');
  if (newBtn) newBtn.addEventListener('click', () => openRosterModal(null));
  const reload = () => renderView().catch(() => {});
  $$('[data-us-csv]').forEach((b) => b.addEventListener('click', () => {
    const r = items.find((x) => String(x.id) === b.dataset.usCsv);
    if (!r) return;
    const parsed = jlParseRoster(r.roster, r.keepId).list;
    const lines = [['姓名', '学号', '提醒邮箱', '身份', '状态', '最近登录'].join(',')];
    for (const m of parsed) {
      const u = m.id ? accBySid.get(String(m.id)) : null;
      const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      lines.push([cell(m.name || ''), cell(m.id || ''), cell(u && u.qq_id ? u.qq_id : ''), cell(u ? (US_ROLE[u.role] || u.role) : '未开号'),
        cell(u ? (u.disabled ? '已停用' : (u.must_change ? '未改初始密码' : '正常')) : '—'), cell(u ? (u.last_login || '从未登录') : '—')].join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (r.name || '成员') + '-成员表.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('成员表已导出 ✓（含提醒邮箱列）');
  }));
  const putUser = async (sid, body, msg) => {
    try { await api('/api/users/' + encodeURIComponent(sid), { method: 'PUT', body }); toast(msg); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  $$('[data-us-sync]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const r = await api('/api/users/sync', { method: 'POST', body: { rosterId: Number(b.dataset.usSync) } });
      toast(`已开通 ${r.created} 个账号` + (r.existing ? `，${r.existing} 个已存在` : '') + (r.noSid && r.noSid.length ? `；${r.noSid.length} 人缺学号未开通` : ''));
      reload();
    } catch (e) { toast(e.message, 'error'); b.disabled = false; }
  }));
  const qqImportBtn = $('#btn-qq-import');
  if (qqImportBtn) qqImportBtn.addEventListener('click', () => {
    openModal(`
      <h2>${icon('upload')} 导入提醒邮箱</h2>
      <p class="hint">每行一条：<code>学号 邮箱</code>（空格 / 逗号分隔均可，须填完整邮箱如 123456@qq.com）。同学也可以在自己「账号」面板里自助修改（需邮件验证码确认）。</p>
      <div class="form"><textarea id="qq-import-text" rows="8" placeholder="2023001 123456@qq.com&#10;2023002 stu2023002@example.com"></textarea></div>
      <div class="modal-foot"><button class="ghost" id="btn-cancel">取消</button><button class="primary" id="qq-import-ok">${icon('check')} 导入</button></div>`);
    $('#qq-import-ok').addEventListener('click', async () => {
      const text = $('#qq-import-text').value;
      try {
        const r = await api('/api/users/qq-import', { method: 'POST', body: { text } });
        closeModal();
        toast('已更新 ' + r.updated + ' 人' + (r.bad && r.bad.length ? '；' + r.bad.length + ' 行未匹配到账号' : ''), r.updated ? undefined : 'error');
        reload();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
  $$('[data-us-role]').forEach((b) => b.addEventListener('click', () => {
    const to = b.dataset.to;
    putUser(b.dataset.usRole, { role: to }, to === 'officer' ? '已设为班委（该同学需重新登录生效）' : '已降为同学');
  }));
  $$('[data-us-reset]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm(`把「${b.dataset.name}」的密码重置为学号后 6 位？对方下次登录要重新改。`)) return;
    putUser(b.dataset.usReset, { reset: true }, '密码已重置');
  }));
  $$('[data-us-disable]').forEach((b) => b.addEventListener('click', () => {
    const off = b.dataset.off === '1';
    if (off && !confirm('停用后该同学将无法登录，历史数据保留。确定停用？')) return;
    putUser(b.dataset.usDisable, { disabled: off }, off ? '账号已停用' : '账号已恢复');
  }));
  view.querySelectorAll('.panel[data-rid]').forEach((card) => {
    const r = items.find((x) => String(x.id) === card.dataset.rid);
    if (!r) return;
    const pv = card.querySelector('.roster-pv');
    const tbtn = card.querySelector('[data-ract="toggle"]');
    if (tbtn) tbtn.addEventListener('click', () => {
      pv.hidden = !pv.hidden;
      tbtn.innerHTML = icon('eye') + (pv.hidden ? ' 成员与账号' : ' 收起');
    });
    const cbtn = card.querySelector('[data-ract="copy"]');
    if (cbtn) cbtn.addEventListener('click', () => jlCopy(r.roster, '名单全文已复制，可粘贴到接龙 / 抽签'));
    const ebtn = card.querySelector('[data-ract="edit"]');
    if (ebtn) ebtn.addEventListener('click', () => openRosterModal(r));
    const dbtn = card.querySelector('[data-ract="del"]');
    if (dbtn) dbtn.addEventListener('click', async () => {
      if (!confirm(`确定删除名单「${r.name}」（${r.count} 人）吗？\n已发起的接龙 / 抽签不受影响。`)) return;
      try {
        await api('/api/rosters/' + r.id, { method: 'DELETE' });
        toast('名单已删除');
        renderView().catch((e2) => toast(e2.message, 'error'));
      } catch (e2) { toast(e2.message, 'error'); }
    });
  });
}
function openRosterModal(item) {
  openModal(`
    <h2>${item ? `${icon('edit')} 编辑名单` : `${icon('users')} 新建名单`}</h2>
    <div class="form">
      <label>名单名称</label>
      <input id="rs-name" maxlength="60" value="${esc(item ? item.name : '')}" placeholder="如：计科2603班">
      ${rosterFields({ prefix: 'rs', label: '名单内容', value: item ? item.roster : '', keepId: !!(item && item.keepId), rows: 10, lib: false })}
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="rs-save">${icon('check')} 保存</button>
    </div>`);
  bindRosterFields({ prefix: 'rs', sidFor: '开账号' });
  $('#rs-save').addEventListener('click', async () => {
    const r = readRoster('rs');
    const name = $('#rs-name').value.trim();
    if (!name) { toast('请填写名单名称', 'error'); return; }
    const body = { name, rosterRaw: r.raw, keepId: r.keepId };
    try {
      if (item) await api('/api/rosters/' + item.id, { method: 'PUT', body });
      else await api('/api/rosters', { method: 'POST', body });
      toast(item ? '名单已更新' : '名单已保存');
      closeModal();
      renderView().catch((e2) => toast(e2.message, 'error'));
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* 退出登录：同学 / 班委 / 管理员都要能一步够到——共享设备上"忘了退"比多点两下严重 */
async function doLogout() {
  if (!confirm('退出后要看内容得重新输密码。确定退出？')) return;
  try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* 服务端退不掉也照样回登录页 */ }
  location.href = '/login';
}

// 账号面板：身份说明 + 本人改密（学号账号）+ 退出登录。
// 管理员没有学号账号（密码在 data/config.json），只给说明与退出，不再一句话把入口挡掉。
function openAccountModal() {
  const me = state.me;
  const isAcct = !!me.sid;
  openModal(`
    <h2>${icon('lock')} 账号</h2>
    <div class="acct-head">
      <b>${esc(ME_ROLE[me.role] || me.role || '已登录')}</b>${me.name ? '<span>' + esc(me.name) + '</span>' : ''}
      ${isAcct ? `<span class="hint">学号 ${esc(me.sid)}</span>` : ''}
      ${me.mustChange ? '<span class="jl-badge off">仍在用初始密码</span>' : ''}
    </div>
    ${me.mustChange ? '<div class="dupwarn">初始密码是学号后 6 位，全班都猜得到。建议现在就改成自己的。</div>' : ''}
    ${isAcct ? `<div class="form">
      <label>原密码</label><input id="pw-old" type="password" maxlength="64" autocomplete="current-password">
      <label>新密码（至少 6 位）</label><input id="pw-new" type="password" maxlength="64" autocomplete="new-password">
      <label>再输一遍新密码</label><input id="pw-new2" type="password" maxlength="64" autocomplete="new-password">
    </div>
    <div class="form" style="margin-top:10px">
      <label>接收提醒的邮箱（填完整邮箱，如 123456@qq.com；修改需输入邮件验证码确认）</label>
      <div class="jl-linkrow"><input id="acct-qq" inputmode="email" maxlength="80" value="${esc(me.qq || '')}" placeholder="例如 123456@qq.com"><button class="ghost" id="qq-code">${icon('bell')} 发送验证码</button></div>
      <div class="form" id="qq-code-row" hidden>
        <label>邮件验证码（10 分钟内有效）</label>
        <input id="acct-qq-code" inputmode="numeric" maxlength="6" placeholder="6 位数字">
      </div>
    </div>` : `<div class="hint acct-note">管理员密码写在部署时的 <code>data/config.json</code> 的 password 里，不在班级账号表中，改它要编辑那个文件并重启服务。</div>`}
    <div class="modal-foot">
      <button class="ghost danger" id="acct-logout">${icon('logout')} 退出登录</button>
      <button class="ghost" id="btn-cancel">关闭</button>
      ${isAcct ? `<button class="ghost" id="qq-save">${icon('check')} 确认绑定</button>` : ''}
      ${isAcct ? `<button class="primary" id="pw-save">${icon('check')} 改密码</button>` : ''}
    </div>`);
  $('#acct-logout').addEventListener('click', () => { closeModal(); doLogout(); });
  const save = $('#pw-save');
  if (save) save.addEventListener('click', async () => {
    const oldPassword = $('#pw-old').value;
    const np = $('#pw-new').value, np2 = $('#pw-new2').value;
    if (!oldPassword) { toast('请输入原密码', 'error'); return; }
    if (np.length < 6) { toast('新密码至少 6 位', 'error'); return; }
    if (np !== np2) { toast('两次输入的新密码不一致', 'error'); return; }
    try {
      await api('/api/password', { method: 'POST', body: { oldPassword, newPassword: np } });
      closeModal();
      toast('密码已修改 ✓');
      state.me.mustChange = false;
      loadMe().catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  });
  const qqCodeBtn = $('#qq-code');
  if (qqCodeBtn) qqCodeBtn.addEventListener('click', async () => {
    const qq = ($('#acct-qq') ? $('#acct-qq').value : '').trim();
    if (!qq) { toast('先填完整邮箱再发送验证码', 'error'); return; }
    qqCodeBtn.disabled = true;
    try {
      const r = await api('/api/me/qq/code', { method: 'POST', body: { qq } });
      const row = $('#qq-code-row');
      if (row) row.hidden = false;
      const codeInput = $('#acct-qq-code');
      if (codeInput) { codeInput.value = ''; codeInput.focus(); }
      toast('验证码已发送到 ' + r.target);
      let left = 60;
      const t = setInterval(() => {
        left--;
        qqCodeBtn.textContent = left > 0 ? '重发(' + left + 's)' : '发送验证码';
        if (left <= 0) { clearInterval(t); qqCodeBtn.disabled = false; }
      }, 1000);
    } catch (e) { toast(e.message, 'error'); qqCodeBtn.disabled = false; }
  });
  const qqSave = $('#qq-save');
  if (qqSave) qqSave.addEventListener('click', async () => {
    const qq = ($('#acct-qq') ? $('#acct-qq').value : '').trim();
    const code = ($('#acct-qq-code') ? $('#acct-qq-code').value : '').trim();
    if (qq && !code) { toast('修改邮箱需要先点「发送验证码」并填入邮件里的验证码', 'error'); return; }
    try {
      const r = await api('/api/me/qq', { method: 'PUT', body: { qq, code } });
      state.me.qq = r.qq;
      toast(qq ? '提醒邮箱已绑定 ✓（' + r.qq + '）' : '已取消提醒邮件 ✓');
      closeModal();
    } catch (e) { toast(e.message, 'error'); }
  });
}
/* ========= 操作记录（管理员看全部，本人只看自己） ========= */
async function loadAudit() {
  const seq = loadSeq;
  const view = $('#view');
  const admin = isSysAdmin();
  const f = state.audit;
  view.innerHTML = '<div class="loading">加载中…</div>';
  // 操作记录只归系统管理员；同学与班委连自己那条链都看不到（接口同口径，这里只是不让人白跑一趟）
  if (!admin) { view.innerHTML = '<div class="empty">只有系统管理员能查看操作记录</div>'; return; }
  const qs = () => '/api/audit?limit=50&offset=' + f.offset
    + (f.who ? '&who=' + encodeURIComponent(f.who) : '')
    + (f.action ? '&action=' + encodeURIComponent(f.action) : '')
    + (f.from ? '&from=' + encodeURIComponent(f.from) : '')
    + (f.to ? '&to=' + encodeURIComponent(f.to) : '');
  let data, actors = [];
  try {
    data = await api(qs());
    if (!actors.length) { try { actors = (await api('/api/users')).items; } catch (e) { /* 拉不到就不给下拉 */ } }
  } catch (e) { if (seq !== loadSeq) return; view.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (seq !== loadSeq) return;
  const ROLE = { admin: '管理员', officer: '班委', student: '同学' };
  const row = (x) => `<tr>
      <td class="hint">${esc(x.created_at)}</td>
      <td><b>${esc(x.name || '—')}</b>${x.sid ? `<div class="hint">${esc(x.sid)}</div>` : ''}</td>
      <td class="hint">${esc(ROLE[x.role] || x.role || '—')}</td>
      <td>${esc(x.action)}</td>
      <td class="hint ad-detail">${esc(x.detail || '')}</td>
      <td class="hint">${esc(x.ip || '')}</td>
    </tr>`;
  view.innerHTML = `
    <div class="jl-head"><h2>${icon('clock')} 操作记录</h2><span class="hint">全部账号</span></div>
    <p class="hint">记录所有写操作与登录、登录失败：谁、什么时候、对哪一条（标题 / 姓名 / 内容摘要）、来自哪个 IP；普通浏览不记录，只有系统管理员能看</p>
    <div class="jl-actions"><button class="ghost" id="ad-export">${icon('download')} 导出 CSV</button></div>
    <div class="panel ad-filter">
      <label class="ad-f"><span>账号</span><select id="ad-who"><option value="">全部</option>${actors.map((u) => `<option value="${esc(u.sid)}"${f.who === u.sid ? ' selected' : ''}>${esc(u.name)} ${esc(u.sid)}</option>`).join('')}</select></label>
      <label class="ad-f"><span>动作</span><input id="ad-action" type="text" maxlength="40" placeholder="如：删除信息、发布通知、投出选票" value="${esc(f.action)}"></label>
      <label class="ad-f"><span>起</span><input id="ad-from" type="date" value="${esc(f.from)}"></label>
      <label class="ad-f"><span>止</span><input id="ad-to" type="date" value="${esc(f.to)}"></label>
      <button class="mini" id="ad-go">查询</button>
      <span class="gb-total">共 ${data.total} 条</span>
    </div>
    ${data.items.length ? `<div class="panel ad-wrap"><table class="ad-table"><thead><tr><th>时间</th><th>操作者</th><th>身份</th><th>动作</th><th>详情</th><th>IP</th></tr></thead><tbody>${data.items.map(row).join('')}</tbody></table></div>`
      : '<div class="empty">没有符合条件的记录</div>'}
    ${f.offset + data.items.length < data.total ? `<div class="morebar"><button class="mini" id="ad-more">加载更多</button></div>` : ''}`;
  const apply = (patch) => { Object.assign(state.audit, patch); renderView().catch(() => {}); };
  const bindVal = (id, ev, key) => { const el = $(id); if (el) el.addEventListener(ev, (e) => apply({ [key]: e.target.value, offset: 0 })); };
  bindVal('#ad-who', 'change', 'who');
  bindVal('#ad-action', 'change', 'action');
  bindVal('#ad-from', 'change', 'from');
  bindVal('#ad-to', 'change', 'to');
  const goBtn = $('#ad-go');
  if (goBtn) goBtn.addEventListener('click', () => apply({
    action: ($('#ad-action') || {}).value || '', from: ($('#ad-from') || {}).value || '', to: ($('#ad-to') || {}).value || '', offset: 0,
  }));
  const exp = $('#ad-export');
  if (exp) exp.addEventListener('click', () => {
    const p = new URLSearchParams();
    if (f.who) p.set('who', f.who);
    if (f.action) p.set('action', f.action);
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
    window.open('/api/audit/export?' + p.toString(), '_blank');
  });
  const more = $('#ad-more');
  if (more) more.addEventListener('click', () => apply({ offset: f.offset + 50 }));
}

/* ========= 投票表决（资格制名单 / 匿名可选 / 一人一票） ========= */
const voteStatusBadge = (v) => {
  if (v.closedByAdmin) return '<span class="jl-badge off">已停止</span>';
  if (v.closed) return '<span class="jl-badge off">已结束</span>';
  return '<span class="jl-badge on">进行中</span>';
};
async function loadVotes() {
  const seq = loadSeq;
  const view = $('#view');
  if (state.vote) { await loadVoteDetail(); return; }
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/vote');
  if (seq !== loadSeq) return;
  const items = data.items || [];
  view.innerHTML = `
    <div class="jl-head"><h2>${icon('vote')} 投票表决</h2></div>
    <p class="hint">全班一人一票，可匿名；结果可设为一直可见、投过票后才可见，或结束后才可见。</p>
    ${canPost() ? `<div class="jl-actions"><button class="primary" id="btn-vote-new">${icon('plus')} 发起投票</button></div>` : ''}
    ${items.map((v) => `
      <div class="panel">
        <div class="jl-head"><h2>${esc(v.title)}</h2>${voteStatusBadge(v)}</div>
        ${v.description ? `<p class="jl-desc">${esc(v.description)}</p>` : ''}
        <div class="jl-meta">
          <span>已投 <b>${v.done}</b> / ${v.total} 人</span>
          ${v.deadline ? `<span>${icon('clock')} 截止 ${esc(v.deadline)}</span>` : ''}
          <span>${v.anonymous ? '匿名投票' : '记名投票'}</span>
        </div>
        <div class="jl-actions">
          <button class="primary" data-vid-open="${v.id}">${icon('vote')} ${v.closed ? '查看投票' : '进入投票'}</button>
          <button class="ghost" data-vid-copy="${v.id}">${icon('copy')} 复制学生链接</button>
        </div>
      </div>`).join('')}
    ${items.length ? '' : `<div class="empty"><div class="big">${icon('vote')}</div>还没有发起过投票<br>${canPost() ? '点「发起投票」开始一次班级表决' : '班委发起投票后会出现在这里'}</div>`}`;
  const newBtn = $('#btn-vote-new');
  if (newBtn) newBtn.addEventListener('click', () => openVoteModal());
  $$('[data-vid-open]').forEach((b) => b.addEventListener('click', () => {
    state.vote = b.dataset.vidOpen;
    renderView().catch((e) => toast(e.message, 'error'));
  }));
  $$('[data-vid-copy]').forEach((b) => b.addEventListener('click', () => jlCopy(location.origin + '/v/' + b.dataset.vidCopy, '学生链接已复制，可发到班群')));
}
async function loadVoteDetail(quiet) {
  if (!state.vote) return;
  const seq = loadSeq;
  const view = $('#view');
  const silent = !!view.querySelector('[data-vote-detail="' + state.vote + '"]'); // 已在本详情页：轮询走静默
  let d;
  try { d = await api('/api/vote/' + state.vote); }
  catch (e) {
    if (seq !== loadSeq) return;
    if ((silent || quiet) && e.status !== 404) return; // 网络抖动：原地静默；404 = 投票已被删除，照常退出
    vStopTimer(); // 投票已不存在，别让空转的轮询定时器留在内存里
    state.vote = null;
    toast(e.message, 'error');
    return loadVotes();
  }
  if (seq !== loadSeq) return; // 等待期间已切换视图，丢弃旧响应
  // 静默刷新：数据没变化就不动 DOM——阅读、勾选、滚动位置全保留
  const sig = JSON.stringify([d, canPost()]);
  if (silent && sig === view.dataset.voteSig) return;
  view.dataset.voteSig = sig;
  const fmtTs = (ts) => {
    const dt = new Date(ts);
    const p2 = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
  };
  const canEdit = canPost();   // 能不能改这张投票；能不能看"谁投给谁"由服务端下发决定，与这里无关
  const stuLink = location.origin + '/v/' + d.id;
  // 结果可见时机：服务端在未达可见条件时不下发 tally，只给 tallyHidden
  const showTally = Array.isArray(d.tally);
  const maxVotes = showTally ? Math.max(1, ...d.tally.map((t) => t.votes)) : 0;
  const totalVotes = showTally ? d.tally.reduce((s, t) => s + t.votes, 0) : 0;
  // 班级账号（同学 / 班委）在管理台里就能直接投，不必再跳 /v/:id 独立页；
  // 管理员密码没有名单槽位，服务端也拒绝其下票，所以这块只对真实账号出现
  const myAcct = state.me.sid ? state.me : null;
  const myLabels = myAcct && d.myVote
    ? (d.options.filter((o) => (d.myVote.choices || []).includes(o.key)).map((o) => o.label).join('、') || '弃权（没选任何项）') : '';
  const selfPanel = !myAcct ? '' : `
    <div class="panel">
      <div class="jl-head"><h2 style="font-size:15px">我的投票</h2>
        <span class="hint">以 ${esc(myAcct.name || '')}（${esc(myAcct.sid)}）的身份${d.closed ? '' : (d.allowChange ? '，截止前再提交即覆盖' : '，本次不允许改票')}</span></div>
      ${d.voted ? `<div class="vdone">✓ 你已投：${esc(myLabels)} · ${esc(fmtTs(d.myVote.time))}</div>` : ''}
      ${!d.inList ? '<div class="dupwarn">你不在本次投票的资格名单中，不能下票（结果可以正常查看）。</div>' : ''}
      ${d.inList && !d.closed ? `<div id="selfBox">${d.options.map((o) => `
        <label class="vopt"><input type="${d.maxSelect > 1 ? 'checkbox' : 'radio'}" name="selfvote" value="${esc(o.key)}"${(d.myVote || {}).choices && d.myVote.choices.includes(o.key) ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}
        <div class="card-actions"><button class="primary" id="self-vote">${icon('check')} ${d.voted ? '重新提交（覆盖上一张）' : '投出选票'}</button>
        <span class="hint">${d.maxSelect > 1 ? `最多选 ${d.maxSelect} 项；` : ''}一项都不选即弃权</span></div>
      </div>` : ''}
      ${d.inList && d.closed && !d.voted ? '<div class="hint">投票已结束，你这一票没投出去。</div>' : ''}
      <div class="hint" style="margin-top:8px">也可以用独立投票页（同一个账号、同一张票，不会重复计）：<code>${esc(stuLink)}</code>
        <button class="mini" id="vote-copy-stu2">${icon('copy')} 复制</button></div>
    </div>`;
  view.innerHTML = `
    <button class="ghost jl-back" id="vote-back" data-vote-detail="${d.id}">← 返回投票列表</button>
    <div class="panel">
      <div class="jl-head"><h2>${esc(d.title)}</h2>${voteStatusBadge(d)}</div>
      ${d.description ? `<p class="jl-desc">${esc(d.description)}</p>` : ''}
      <div class="jl-meta">
        ${d.deadline ? `<span>截止：${esc(d.deadline)}</span>` : ''}
        <span>${d.anonymous ? '匿名投票（同学之间互不可见）' : '记名投票（明细对所有人公开）'}</span>
        <span>${d.maxSelect > 1 ? `每人最多投 ${d.maxSelect} 项` : '每人一票'}</span>
      </div>
    </div>
    ${selfPanel}
    <div class="panel">
      <div class="jl-head"><h2 style="font-size:15px">${d.closed ? '最终票数' : '实时票数'}</h2><span class="hint">已完成 ${d.done} / ${d.rosterSize} 人${d.closed ? ' · 投票已结束，票数不再变动' : ''}</span></div>
      ${showTally ? d.tally.map((t) => {
        const pct = Math.round(t.votes * 100 / maxVotes);
        const share = totalVotes ? Math.round(t.votes * 100 / totalVotes) : 0;
        return `<div class="tally-row"><div class="tlabel"><b>${esc(t.label)}</b><span class="hint">${t.votes} 票 · ${share}%</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
      }).join('') : `<div class="tally-hidden">${d.reveal === 'after_vote' ? '完成投票后即可查看各选项票数' : '投票结束后可查看票数'}</div>`}
      <div class="jl-linkrow"><input readonly value="${esc(stuLink)}"><button class="ghost" id="vote-copy-stu">${icon('link')} 复制学生链接</button></div>
    </div>
    ${Array.isArray(d.missing) ? `
    <div class="panel">
      <div class="jl-head"><h2 style="font-size:15px">完成统计</h2><span class="hint">已投 ${d.done} / ${d.rosterSize} 人，未投 ${d.missing.length} 人</span></div>
      ${d.missing.length ? d.missing.map((m) => `<span class="jl-chip">${esc(m.id ? m.id + ' ' : '')}${esc(m.name)}</span>`).join('') : '<span class="hint">全部投完 ✓</span>'}
      ${d.missing.length ? `<div class="card-actions"><button class="ghost" id="vote-copy-miss">${icon('copy')} 复制未投名单提醒</button><button class="ghost" id="vote-mail-miss">${icon('bell')} 邮件催办未投</button></div>` : ''}
    </div>` : ''}
    ${Array.isArray(d.ballots) ? `
    <div class="panel">
      <div class="jl-head"><h2 style="font-size:15px">选票明细</h2><span class="hint">共 ${d.ballots.length} 张</span></div>
      ${(d.ballots || []).map((b, i) => `<div class="entry-line"><b>${i + 1}. ${esc(b.name)}</b><span class="entry-txt">投给：${esc(b.choices.join('、') || '弃权')} · ${esc(fmtTs(b.time))}</span></div>`).join('') || '<span class="hint">还没有人投票</span>'}
    </div>` : ''}
    ${canEdit ? `<div class="card-actions">
      ${!d.closed ? '<button class="ghost" id="vote-edit">' + icon('edit') + ' 编辑</button>' : ''}
      ${!d.closed ? '<button class="ghost" id="vote-stop">停止投票</button>' : ''}
      <button class="ghost danger" id="vote-del">${icon('trash')} 删除投票</button>
    </div>` : ''}`;
  const back = $('#vote-back');
  if (back) back.addEventListener('click', () => { state.vote = null; renderView().catch(() => {}); });
  const copyStu = $('#vote-copy-stu');
  if (copyStu) copyStu.addEventListener('click', () => jlCopy(stuLink, '学生链接已复制，可发到班群'));
  const copyStu2 = $('#vote-copy-stu2');
  if (copyStu2) copyStu2.addEventListener('click', () => jlCopy(stuLink, '投票链接已复制，可发到班群'));
  const selfBox = $('#selfBox');
  if (selfBox) {
    const inputs = Array.from(selfBox.querySelectorAll('input[name="selfvote"]'));
    const sync = () => inputs.forEach((i) => { i.parentElement.classList.toggle('sel', i.checked); });
    inputs.forEach((i) => i.addEventListener('change', () => {
      if (d.maxSelect > 1 && inputs.filter((x) => x.checked).length > d.maxSelect) {
        i.checked = false; toast('每人最多选 ' + d.maxSelect + ' 项');
      }
      sync();
    }));
    sync();
    const btn = $('#self-vote');
    btn.addEventListener('click', async () => {
      const picked = inputs.filter((x) => x.checked).map((x) => x.value);
      if (!picked.length && !confirm('没有勾选任何选项，这样提交算作弃权（计入已投票人数）。确定提交？')) return;
      btn.disabled = true;
      try {
        const r = await api('/api/vote/' + d.id + '/ballot', { method: 'POST', body: { choices: picked } });
        toast(r.updated ? '选票已更新 ✓' : '投票成功 ✓');
        renderView().catch(() => {});
      } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
    });
  }
  const copyMiss = $('#vote-copy-miss');
  if (copyMiss) copyMiss.addEventListener('click', () => {
    const lines = (d.missing || []).map((m) => (m.id ? m.id + ' ' : '') + m.name);
    jlCopy('以下同学还没完成投票「' + d.title + '」，请尽快：\n' + lines.join('\n') + '\n投票入口：' + stuLink, '未投名单提醒已复制');
  });
  const mailMiss = $('#vote-mail-miss');
  if (mailMiss) mailMiss.addEventListener('click', () => {
    if (!d.missing || !d.missing.length) { toast('全部都已投完'); return; }
    openMailPickModal(d.missing.map((m) => ({ i: m.i, label: (m.id ? m.id + ' ' : '') + m.name, bound: !!m.bound })), async (slots) => {
      const r = await api('/api/vote/' + d.id + '/remind-mail', { method: 'POST', body: { slots } });
      toast('已发 ' + r.sent + ' 封' + (r.noQQ ? '，' + r.noQQ + ' 人未绑定邮箱' : '') + (r.skipped ? '，' + r.skipped + ' 人 30 分钟内已催过' : ''), r.sent ? undefined : 'error');
    });
  });
  const stopBtn = $('#vote-stop');
  if (stopBtn) stopBtn.addEventListener('click', async () => {
    if (!confirm('确定停止这次投票吗？停止后不能再提交。')) return;
    try { await api('/api/vote/' + d.id + '/stop', { method: 'POST' }); toast('投票已停止'); state.vote = null; renderView().catch(() => {}); }
    catch (e) { toast(e.message, 'error'); }
  });
  const editBtn = $('#vote-edit');
  if (editBtn) editBtn.addEventListener('click', () => openVoteEditModal(d));
  const delBtn = $('#vote-del');
  if (delBtn) delBtn.addEventListener('click', async () => {
    if (!confirm('确定删除这次投票吗？所有选票将一并删除，不可恢复。')) return;
    try { await api('/api/vote/' + d.id, { method: 'DELETE' }); toast('投票已删除'); state.vote = null; renderView().catch(() => {}); }
    catch (e) { toast(e.message, 'error'); }
  });
  // 结果页定时原地刷新（管理台/访客都能看到实时票数）
  // 每次重设前先清旧定时器：轮询回调自身也会进入这里，不清理会越积越多形成请求风暴
  vStopTimer();
  vTimer = setInterval(async () => {
    if ($('#modal-root').children.length) return;
    const el = document.activeElement;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    const y = window.scrollY;
    try { await loadVoteDetail(); if (window.scrollY !== y) window.scrollTo(0, y); } catch (e) { /* 静默 */ }
  }, 8000);
}
function openVoteModal() {
  openModal(`
    <h2>${icon('vote')} 发起投票</h2>
    <div class="form">
      <label>投票标题</label>
      <input id="vt-title" maxlength="60" placeholder="如：评选入团积极分子">
      <label>投票说明（选填）</label>
      <textarea id="vt-desc" rows="2" maxlength="1000" placeholder="投票规则、候选人情况等说明…"></textarea>
      <label>选项 / 候选人（每行一个，至少 2 个）</label>
      <textarea id="vt-options" rows="4" placeholder="张三&#10;李四&#10;王五"></textarea>
      ${rosterFields({ prefix: 'vt', label: '投票资格名单（只有名单内的同学可以投票）' })}
      <label>每人最多可选</label>
      <input id="vt-max" type="number" min="1" value="1" style="max-width:120px">
      <label>截止时间（选填，到点自动结束）</label>
      <input id="vt-deadline" type="datetime-local">
      <label class="splitline"><input type="checkbox" id="vt-anon" checked> 匿名投票（同学之间看不到彼此投给谁）</label>
      <label>结果可见时机</label>
      <select id="vt-reveal" style="max-width:240px">
        <option value="always">一直可见（投票中也能看到各选项票数）</option>
        <option value="after_vote">投过票后可见</option>
        <option value="after_close">投票结束后可见（最防跟风）</option>
      </select>
      <label class="splitline"><input type="checkbox" id="vt-revote" checked> 允许改票（截止前可重复提交覆盖；关闭则投过即锁定）</label>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="vt-save">${icon('check')} 发起投票</button>
    </div>`);
  // 投票按学号定位投票人（身份来自登录账号），名单缺学号的人根本投不了票——发起前就点出来
  bindRosterFields({
    prefix: 'vt', mode: 'ref', sidFor: '投票',
    applyRoster: (r) => { if (r && r.refOnly) return; $('#vt-roster').value = r.roster; $('#vt-keepid').checked = !!r.keepId; },
  });
  $('#vt-save').addEventListener('click', async () => {
    const title = $('#vt-title').value.trim();
    if (!title) { toast('请填写投票标题', 'error'); return; }
    const ros = readRoster('vt', 'ref');
    if (!ros.libId && !ros.raw.trim()) { toast('请设置投票名单', 'error'); return; }
    try {
      const body = {
        title,
        description: $('#vt-desc').value.trim(),
        optionsRaw: $('#vt-options').value,
        maxSelect: Number($('#vt-max').value) || 1,
        anonymous: $('#vt-anon').checked,
        reveal: $('#vt-reveal').value,
        allowChange: $('#vt-revote').checked,
        deadline: valToDt($('#vt-deadline').value),
        rosterId: ros.libId || null,
        rosterRaw: ros.raw,
        keepId: ros.keepId,
      };
      const r = await api('/api/vote', { method: 'POST', body });
      toast('投票已发起 ✓');
      closeModal();
      state.vote = r.id;
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  });
}

// 编辑投票（管理员与班委同权，不区分发起人）：标题/说明/截止/结果可见时机/允许改票可改；选项与名单只可「追加」，
// 已有选项 key 与名单槽位 rid 不动，避免打乱已投票的指向。
function openVoteEditModal(v) {
  const curOpts = (v.options || []).map((o) => o.label).join('、');
  openModal(`
    <h2>${icon('edit')} 编辑投票</h2>
    <div class="form">
      <label>标题</label><input id="vt-e-title" maxlength="60" value="${esc(v.title)}">
      <label>说明</label><textarea id="vt-e-desc" rows="2" maxlength="1000">${esc(v.description || '')}</textarea>
      <label>截止时间（留空表示不设截止）</label><input id="vt-e-deadline" type="datetime-local" value="${dtToVal(v.deadline)}">
      <label>结果可见时机</label>
      <select id="vt-e-reveal">
        <option value="always"${v.reveal === 'always' || !v.reveal ? ' selected' : ''}>一直可见</option>
        <option value="after_vote"${v.reveal === 'after_vote' ? ' selected' : ''}>投过票后可见</option>
        <option value="after_close"${v.reveal === 'after_close' ? ' selected' : ''}>投票结束后可见</option>
      </select>
      <label class="splitline"><input type="checkbox" id="vt-e-revote"${v.allowChange === false ? '' : ' checked'}> 允许改票（截止前可重复提交覆盖）</label>
      <label>追加选项（每行一个，只增不改；已有选项：${esc(curOpts || '无')}）</label>
      <textarea id="vt-e-optappend" rows="2" placeholder="需要新增的选项，每行一个…"></textarea>
      <label class="splitline"><input type="checkbox" id="vt-e-roster-keepid"> 追加名单保留学号</label>
      <label>追加投票人（每行一个，支持「学号 姓名」；只增不改，已有 ${esc(String(v.rosterSize || 0))} 人）</label>
      <textarea id="vt-e-rosterappend" rows="2" placeholder="新增可投票的同学，每行一个…"></textarea>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="vt-e-save">保存修改</button>
    </div>`);
  $('#vt-e-save').addEventListener('click', async () => {
    if (!$('#vt-e-title').value.trim()) { toast('标题不能为空', 'error'); return; }
    const body = {
      title: $('#vt-e-title').value.trim(),
      description: $('#vt-e-desc').value,
      deadline: valToDt($('#vt-e-deadline').value),
      reveal: $('#vt-e-reveal').value,
      allowChange: $('#vt-e-revote').checked,
    };
    const optApp = $('#vt-e-optappend').value.trim();
    if (optApp) body.optionsAppend = optApp;
    const rosterApp = $('#vt-e-rosterappend').value.trim();
    if (rosterApp) { body.rosterAppendRaw = rosterApp; body.rosterAppendKeepId = $('#vt-e-roster-keepid').checked; }
    try {
      await api(`/api/vote/${v.id}`, { method: 'PUT', body });
      closeModal();
      toast('修改已保存');
      loadVoteDetail();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ========= 统计与接入 ========= */
function statCard(lab, num, cls = '') {
  return `<div class="statcard ${cls}"><div class="num">${num}</div><div class="lab">${lab}</div></div>`;
}
// 信息中心的「统计」：数字与分布，登录就能看
async function loadStats() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const st = await api('/api/stats'); // 会话状态由启动时的 loadMe 提供，这里不重复请求
  if (seq !== loadSeq) return;
  const maxG = Math.max(1, ...st.byGroup.map((g) => g.count));
  const maxC = Math.max(1, ...st.byCategory.map((c) => c.c));
  view.innerHTML = `
    <div class="statgrid">
      ${statCard(`${icon('feed')} 信息总数`, st.total)}
      ${statCard(`${icon('sparkles')} 近 7 天新增`, st.week)}
      ${statCard(`${icon('pin')} 待完成任务`, st.openTasks)}
      ${statCard(`${icon('alert')} 已逾期`, st.overdue, st.overdue ? 'danger' : '')}
    </div>
    <div class="panel">
      <h3>${icon('alert')} 即将截止（7 天内）</h3>
      ${st.upcoming.length ? st.upcoming.map((it) => `
        <div class="uprow" data-id="${it.id}">
          <span class="badge cat-${it.category}">${(CATS[it.category] || CATS.other).label}</span>
          <b>${esc(it.title || (it.content || '').slice(0, 24))}</b>
          <span class="spacer"></span>${dlChip(it.deadline)}
        </div>`).join('') : '<p class="empty-mini">7 天内没有要截止的事</p>'}
    </div>
    <div class="panel">
      <h3>${icon('chart')} 分类统计</h3>
      ${st.byCategory.length ? st.byCategory.map((c) => `
        <div class="barrow">
          <span class="barname">${(CATS[c.category] || CATS.other).icon} ${(CATS[c.category] || CATS.other).label}</span>
          <div class="bar"><i style="width:${Math.round(c.c / maxC * 100)}%"></i></div>
          <span class="barnum">${c.c}</span>
        </div>`).join('') : '<p class="empty-mini">暂无数据</p>'}
    </div>
    <div class="panel">
      <h3>${icon('users')} 各群信息量</h3>
      ${st.byGroup.length ? st.byGroup.map((g) => `
        <div class="barrow">
          <span class="barname">${platIcon(g.platform)} ${esc(g.name)}</span>
          <div class="bar"><i style="width:${Math.round(g.count / maxG * 100)}%;background:${esc(g.color)}"></i></div>
          <span class="barnum">${g.count}</span>
        </div>`).join('') : '<p class="empty-mini">还没有添加群</p>'}
    </div>
    <div class="panel">
      <h3>${icon('bell')} 截止提醒</h3>
      <p class="hint">点顶栏铃铛开启浏览器通知：只要信息页开着，<b>已逾期</b>或 <b>24 小时内截止</b>的任务会弹窗提醒
      （同一条每天只提醒一次，每 5 分钟检查一次）。手机上把本页"添加到主屏幕"后同样有效。</p>
      <button class="ghost" id="btn-bell-2">${icon('bell')} 开启 / 检查提醒</button>
    </div>`;
  $('#btn-bell-2').addEventListener('click', onBellClick);
  if (isSysAdmin()) $$('.uprow', view).forEach((row) => row.addEventListener('click', async () => {
    const it = await api('/api/messages/' + row.dataset.id);
    openMessageModal(it);
  }));
}

// 班级管理 → 设置（仅系统管理员）：接入地址 / 机器人 / 群管理 / 备份
async function loadSettings() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const st = await api('/api/stats');   // 群管理面板要显示每个群的信息量
  if (seq !== loadSeq) return;
  const editable = isSysAdmin();
  const cfg = await api('/api/config').catch(() => null);
  if (seq !== loadSeq) return;
  const ingestUrl = cfg ? `${cfg.lanUrls[0] || `http://localhost:${cfg.port}`}/api/ingest?token=${cfg.ingestToken}` : '';
  const onebotUrl = cfg ? `${cfg.lanUrls[0] || `http://localhost:${cfg.port}`}/api/onebot/report` : '';
  const ob = (cfg && cfg.onebot) || { token: '', groups: {} };
  const obMode = ob.mode === 'auto' ? 'auto' : 'review';
  const obKeys = Object.keys(ob.groups || {});
  const obFilter = ob.filter || {};
  const fparts = [];
  if (obFilter.minLength) fparts.push(`短于 ${obFilter.minLength} 字的跳过`);
  if ((obFilter.stopWords || []).length) fparts.push(`水词屏蔽 ${obFilter.stopWords.length} 个`);
  if ((obFilter.keywords || []).length) fparts.push(`只收录含关键词：${obFilter.keywords.join('、')}`);
  if (obFilter.adminsOnly) fparts.push('只收录群主/管理员发言');
  if (obFilter.smart) fparts.push('只收像通知/任务的消息');
  const napcatExample = cfg ? JSON.stringify({ network: { httpClients: [{
    name: 'infohub', enable: true, url: onebotUrl, messagePostFormat: 'array', reportSelfMessage: false, token: ob.token,
  }] } }, null, 2) : '';
  view.innerHTML = `
    ${cfg ? `<div class="panel">
      <h3>${icon('inbox')} 自动接入（进阶）</h3>
      <p class="hint">把这个接口地址给自动化程序（手机快捷指令等）使用，新消息会自动进入信息流，
      并自动识别分类和截止时间。</p>
      <div class="codebox">${esc(ingestUrl)}</div>
      <button class="ghost" id="btn-copy-ingest">${icon('copy')} 复制接口地址</button>
      <p class="hint">请求体示例：<code>{"text":"消息原文","group":"班级通知群","sender":"王老师","platform":"wechat"}</code></p>
    </div>` : ''}
    ${cfg ? `<div class="panel">
      <h3>${icon('message')} QQ 自动接入（OneBot 机器人）</h3>
      ${obMode === 'auto'
        ? `<p class="hint">当前为 <b>自动收录</b> 模式：消息通过防闲聊过滤后直接进入信息流。想改成先人工挑一遍，在 data/config.json 里把 onebot.mode 改为 <code>"review"</code>。</p>`
        : `<p class="hint">当前为 <b>人工审核</b> 模式（默认）：群消息先进「信息中心 → 待审核」，由你挑哪些收录进信息流，收录时自动识别分类和截止时间。想全自动收录，在 data/config.json 里把 onebot.mode 改为 <code>"auto"</code>。</p>`}
      <p class="hint">在电脑上用 <b>NapCat / LLOneBot / Lagrange / go-cqhttp</b> 等 OneBot 11 框架登录一个 QQ 小号并拉进班级群，
      在它的网络配置里添加 <b>HTTP POST 上报</b>，地址和令牌填下面两项。群文件上传也会记录（纯图片/表情消息不收录，避免刷屏）。</p>
      <div class="codebox">${esc(onebotUrl)}</div>
      <button class="ghost" id="btn-copy-onebot">${icon('copy')} 复制上报地址</button>
      <p class="hint">令牌 access_token：<code>${esc(ob.token)}</code>${ob.secretOn ? '（已在 config 里启用签名校验，框架 secret 填同一段密钥）' : '（与接入令牌相同；可在 data/config.json 的 onebot.token 单独设置，或设 onebot.secret 启用签名校验）'}</p>
      <p class="hint">NapCat / LLOneBot 配置示例（其他框架按各自文档填同样两项）：</p>
      <div class="codebox">${esc(napcatExample)}</div>
      <button class="ghost" id="btn-copy-onebot-json">${icon('copy')} 复制配置示例</button>
      ${editable ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
        <p class="hint"><b>管理接口令牌轮换</b>：点击后生成新 apiToken，旧令牌立即失效。新令牌在服务器 data/config.json 中查看。</p>
        <button class="ghost" id="btn-reset-token" style="color:var(--danger)">${icon('refresh')} 重置 apiToken</button>
      </div>` : ''}
      <p class="hint">${icon('lock')} 防闲聊过滤：${fparts.length
        ? `${esc(fparts.join('；'))}。在 data/config.json 的 onebot.filter 里调整${obMode === 'review' ? '（关键词、仅管理员、只收通知类仅在 auto 模式参与）' : ''}。`
        : '当前未启用，群里所有文字消息都会收录。可在 data/config.json 的 onebot.filter 里开启：最短长度、水词屏蔽、关键词白名单、仅群主/管理员、只收通知类（像通知/任务的才收录）。'}</p>
      ${obKeys.length
        ? `<p class="hint">已设群白名单，只收录：<code>${obKeys.map((k) => esc(k)).join('</code>、<code>')}</code>（显示名：${obKeys.map((k) => esc(ob.groups[k] || `QQ群 ${k}`)).join('、')}）</p>`
        : '<p class="hint">未设白名单：机器人所在<b>所有群</b>的消息都会收录。只想收录部分群，在 data/config.json 的 onebot.groups 里配置（如 <code>"groups": {"123456789": "班级通知群"}</code>），保存后重启生效。</p>'}
    </div>` : ''}
    <div class="panel">
      <h3>${icon('users')} 群管理</h3>
      ${st.byGroup.map((g) => `
        <div class="gmrow">
          <span class="dot" style="background:${esc(g.color)}"></span>
          <span class="gmname">${platIcon(g.platform)} ${esc(g.name)}</span>
          <span class="spacer"></span><b class="gmnum">${g.count}</b>
          ${editable ? `<button class="mini" data-editgroup="${g.id}">编辑</button>` : ''}
        </div>`).join('') || `<p class="empty-mini">${editable ? '还没有群，点下面按钮添加' : '还没有群'}</p>`}
      ${editable ? '<button class="ghost" id="btn-add-group2" style="margin-top:10px">' + icon('plus') + ' 添加群</button>' : ''}
      ${editable ? '<p class="hint">手机上在这里就能加群、改群名、删群，不用连电脑。</p>' : ''}
    </div>
    <div class="panel">
      <h3>${icon('archive')} 数据备份</h3>
      <p class="hint">所有数据都在本机 data/ 文件夹——<b>复制整个文件夹即完整备份</b>（含附件）。
      每次启动和跨天时会自动备份到 data/backups/（保留最近 14 份）；也可以导出 JSON。</p>
      ${editable ? `<button class="ghost" id="btn-export">${icon('download')} 导出 JSON 备份</button>
      <label class="importwrap">${icon('upload')} 导入 JSON 备份<input id="import-file" type="file" accept=".json,application/json"></label>` : ''}
      ${state.me.authRequired ? (state.me.loggedIn
        ? '<button class="ghost" id="btn-logout-2" style="margin-left:10px">' + icon('logout') + ' 退出登录</button>'
        : '<a class="ghost" href="/login" style="margin-left:10px;text-decoration:none;display:inline-block">' + icon('lock') + ' 管理员登录</a>') : ''}
      <p class="hint">导入建议只在空数据时使用（已有数据时服务器会拒绝，防止重复）。JSON 备份会恢复附件记录与接龙数据，但不含附件文件本身——完整备份请复制整个 data/ 文件夹。</p>
    </div>`;
  const copyBtn = $('#btn-copy-ingest');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ingestUrl); toast('已复制接口地址'); }
    catch (e) { toast('复制失败，请手动选择复制', 'error'); }
  });
  const obCopy = $('#btn-copy-onebot');
  if (obCopy) obCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(onebotUrl); toast('已复制上报地址'); }
    catch (e) { toast('复制失败，请手动选择复制', 'error'); }
  });
  const obCopyJson = $('#btn-copy-onebot-json');
  if (obCopyJson) obCopyJson.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(napcatExample); toast('已复制配置示例'); }
    catch (e) { toast('复制失败，请手动选择复制', 'error'); }
  });
  const resetTokenBtn = $('#btn-reset-token');
  if (resetTokenBtn) resetTokenBtn.addEventListener('click', async () => {
    if (!confirm('确定要重置 apiToken 吗？旧令牌将立即失效。')) return;
    try {
      const r = await api('/api/settings/reset-token', { method: 'POST' });
      toast('已重置 apiToken ✓');
      // 刷新设置页面显示新令牌（虽然不直接显示，但重新加载确保状态一致）
      renderView().catch(() => {});
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  const exportBtn = $('#btn-export');
  if (exportBtn) exportBtn.addEventListener('click', () => { window.open('/api/export'); });
  const logoutBtn = $('#btn-logout-2');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
  const addGroup2 = $('#btn-add-group2');
  if (addGroup2) addGroup2.addEventListener('click', () => openGroupModal(null));
  if (editable) $$('[data-editgroup]').forEach((b) => b.addEventListener('click', () => {
    const g = state.groups.find((x) => String(x.id) === b.dataset.editgroup);
    if (g) openGroupModal(g);
  }));
  const importFile = $('#import-file');
  if (importFile) importFile.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.groups) || !Array.isArray(data.messages)) throw new Error('不是有效的备份文件');
      if (!confirm(`将导入 ${data.groups.length} 个群、${data.messages.length} 条信息。\n若当前已有数据，服务器会拒绝以防重复。继续吗？`)) return;
      const r = await api('/api/import', { method: 'POST', body: data });
      toast(`导入成功：${r.groups} 个群、${r.imported} 条信息${r.attachments ? `、${r.attachments} 条附件` : ''}${r.jielongs ? `、${r.jielongs} 个接龙` : ''} ✓`);
      refresh();
    } catch (err) {
      toast('导入失败：' + err.message, 'error');
    }
    e.target.value = '';
  });
}

/* ========= 添加 / 编辑信息 ========= */
function renderPendingFiles() {
  $('#f-filelist').innerHTML = state.pendingFiles.map((f, i) =>
    `<span class="att-edit">${icon('paperclip')} ${esc(f.name)} <button type="button" class="mini danger" data-rm="${i}">✕</button></span>`).join('');
  $$('#f-filelist [data-rm]').forEach((b) => b.addEventListener('click', () => {
    state.pendingFiles.splice(Number(b.dataset.rm), 1);
    renderPendingFiles();
  }));
}

function openMessageModal(item) {
  state.editingId = item ? item.id : null;
  state.pendingFiles = [];
  state.existingAtts = item ? (item.attachments || []) : [];
  const groupOpts = ['<option value="">（不选群）</option>']
    .concat(state.groups.map((g) => `<option value="${g.id}" ${item && item.group_id === g.id ? 'selected' : ''}>${esc(g.name)}</option>`))
    .join('');
  const catOpts = Object.entries(CATS).map(([k, v]) =>
    `<option value="${k}" ${item && item.category === k ? 'selected' : ''}>${v.label}</option>`).join('');
  openModal(`
    <h2>${item ? `${icon('edit')} 编辑信息` : `${icon('inbox')} 添加信息`}</h2>
    <div class="form">
      <div class="labrow"><label>消息原文（粘贴老师发的通知/任务）</label>
        <button id="btn-smart" type="button" class="mini">${icon('search')} 识别正文</button></div>
      <textarea id="f-content" placeholder="把老师发的通知、任务原文粘贴到这里，再点「识别正文」自动填标题、分类和截止时间…">${item ? esc(item.content || '') : ''}</textarea>
      <label class="splitline"><input type="checkbox" id="f-split"> ${icon('sheet')} 按空行拆分为多条（一次粘贴多条通知时勾选，每条自动识别截止时间）</label>
      <div id="f-dup" class="dupwarn" style="display:none"></div>
      <div class="grid2">
        <div><label>标题</label><input id="f-title" value="${item ? esc(item.title || '') : ''}" placeholder="留空则取原文第一行"></div>
        <div><label>分类</label><select id="f-category">${catOpts}</select></div>
        <div><label>来自群</label><select id="f-group">${groupOpts}</select></div>
        <div><label>发送人</label><input id="f-sender" value="${item ? esc(item.sender_name || '') : ''}" placeholder="如：王老师"></div>
        <div><label>收到时间</label><input id="f-received" type="datetime-local" value="${item ? dtToVal(item.received_at) : nowLocalVal()}"></div>
        <div><label>截止时间（选填）</label><input id="f-deadline" type="datetime-local" value="${item ? dtToVal(item.deadline) : ''}"></div>
      </div>
      <div class="grid2">
        <div><label>标签（逗号分隔）</label><input id="f-tags" value="${item ? esc(item.tags || '') : ''}" placeholder="如：作业,打卡"></div>
        <div class="checkline">
          <label><input type="checkbox" id="f-priority" ${item && item.priority ? 'checked' : ''}> ${icon('star')} 重要</label>
          <label><input type="checkbox" id="f-done" ${item && item.status === 'done' ? 'checked' : ''}> ${icon('check')} 已完成</label>
        </div>
      </div>
      <label>附件（可多选）</label>
      <input id="f-files" type="file" multiple>
      ${state.existingAtts.length ? `<label>已有附件</label><div class="filelist">${state.existingAtts.map((a) =>
        `<span class="att-edit">${icon('paperclip')} ${esc(a.orig_name)} <button type="button" class="mini danger" data-delatt="${a.id}">✕</button></span>`).join('')}</div>` : ''}
      <div id="f-filelist" class="filelist"></div>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="btn-save">保存</button>
    </div>`);

  $('#btn-smart').addEventListener('click', async () => {
    const text = $('#f-content').value.trim();
    if (!text) { toast('请先把消息原文粘贴到上面', 'error'); return; }
    try {
      const { parsed } = await api('/api/parse', { method: 'POST', body: { text } });
      if (parsed.title) $('#f-title').value = parsed.title;
      $('#f-category').value = parsed.category;
      if (parsed.deadline) $('#f-deadline').value = dtToVal(parsed.deadline);
      if (parsed.sender && !$('#f-sender').value) $('#f-sender').value = parsed.sender;
      if (parsed.priority) $('#f-priority').checked = true;
      if (parsed.tags && parsed.tags.length) $('#f-tags').value = parsed.tags.join(',');
      toast(`已识别：${CATS[parsed.category].label}${parsed.deadline ? ' · 截止 ' + parsed.deadline : ''}${parsed.priority ? ' · 重要' : ''}`);
    } catch (e) { toast(e.message, 'error'); }
  });

  $('#f-files').addEventListener('change', (e) => {
    for (const f of e.target.files) state.pendingFiles.push(f);
    e.target.value = '';
    renderPendingFiles();
  });

  $$('[data-delatt]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('删除这个附件文件？')) return;
    try {
      await api('/api/attachments/' + b.dataset.delatt, { method: 'DELETE' });
      state.existingAtts = state.existingAtts.filter((a) => String(a.id) !== b.dataset.delatt);
      b.closest('.att-edit').remove();
      toast('附件已删除');
    } catch (e) { toast(e.message, 'error'); }
  }));

  $('#btn-save').addEventListener('click', async () => {
    const payload = {
      content: $('#f-content').value.trim(),
      title: $('#f-title').value.trim(),
      category: $('#f-category').value,
      group_id: $('#f-group').value || null,
      sender_name: $('#f-sender').value.trim(),
      received_at: valToDt($('#f-received').value),
      deadline: valToDt($('#f-deadline').value),
      priority: $('#f-priority').checked ? 1 : 0,
      status: $('#f-done').checked ? 'done' : 'open',
      tags: $('#f-tags').value.trim(),
    };
    if (!payload.title && !payload.content) { toast('标题和内容至少填一项', 'error'); return; }
    try {
      // 批量模式：按空行拆分为多条，每段各自识别正文（附件会挂到第一条）
      const splitBox = $('#f-split');
      if (splitBox && splitBox.checked && !state.editingId) {
        const parts = payload.content.split(/\n\s*\n+/).map((s) => s.trim()).filter((s) => s.length >= 2);
        if (parts.length > 1) {
          let n = 0;
          let failedAt = -1;
          for (let pi = 0; pi < parts.length; pi++) {
            const part = parts[pi];
            try {
              let pp = {};
              try { pp = (await api('/api/parse', { method: 'POST', body: { text: part } })).parsed; } catch (e) { /* 识别失败就按普通文本存 */ }
              const created = await api('/api/messages', { method: 'POST', body: {
                content: part,
                title: pp.title || part.slice(0, 40),
                category: pp.category,
                deadline: pp.deadline || null,
                priority: pp.priority ? 1 : 0,
                tags: payload.tags || (pp.tags || []).join(','),
                group_id: payload.group_id,
                sender_name: payload.sender_name,
                received_at: payload.received_at,
              } });
              if (n === 0 && state.pendingFiles.length) {
                const fd = new FormData();
                fd.append('message_id', created.id);
                for (const f of state.pendingFiles) fd.append('files', f, f.name);
                await api('/api/upload', { method: 'POST', body: fd });
              }
              n++;
            } catch (e) {
              failedAt = pi;
              break; // 中途失败就停下：已入库的不重发，未发的留在输入框里
            }
          }
          if (failedAt >= 0) {
            const rest = parts.slice(failedAt).join('\n\n');
            $('#f-content').value = rest;
            splitBox.checked = false;
            toast(`已创建 ${n}/${parts.length} 条，第 ${failedAt + 1} 条失败：未创建的部分仍留在输入框`, 'error');
            refresh();
            return;
          }
          closeModal();
          toast(`已按空行拆分添加 ${n} 条 ✓`);
          refresh();
          return;
        }
      }
      let msg;
      if (state.editingId) msg = await api('/api/messages/' + state.editingId, { method: 'PUT', body: payload });
      else msg = await api('/api/messages', { method: 'POST', body: payload });
      if (state.pendingFiles.length) {
        const fd = new FormData();
        fd.append('message_id', msg.id);
        for (const f of state.pendingFiles) fd.append('files', f, f.name);
        await api('/api/upload', { method: 'POST', body: fd });
      }
      closeModal();
      toast(state.editingId ? '已保存修改' : '已添加 ✓');
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Ctrl/Cmd + Enter 快速保存
  $('.modal').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#btn-save').click(); }
  });
  // Ctrl+V 直接粘贴截图作为附件
  $('.modal').addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type || !item.type.startsWith('image/')) continue;
      const f = item.getAsFile();
      if (!f) continue;
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const d = new Date();
      const name = `粘贴图片_${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
      state.pendingFiles.push(new File([f], name, { type: f.type }));
      renderPendingFiles();
      toast('已添加粘贴的图片：' + name);
      e.preventDefault();
    }
  });

  // 重复录入检测：原文输入停顿后查相似信息
  let dupTimer = null, dupSeq = 0;
  $('#f-content').addEventListener('input', () => {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(async () => {
      const box = $('#f-dup');
      if (!box) return;
      const text = $('#f-content').value.trim();
      if (text.length < 8) { box.style.display = 'none'; return; }
      const seq = ++dupSeq; // 序号防竞态：慢的旧响应不覆盖新结果（与命令面板同一模式）
      try {
        const { items } = await api('/api/similar', { method: 'POST', body: { text, excludeId: state.editingId } });
        if (seq !== dupSeq) return;
        if (!items.length) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        box.innerHTML = `${icon('alert')} 可能已录入过相似信息（避免重复记录，可点击查看）：<br>` +
          items.map((it) => `<a href="javascript:void(0)" data-dup="${it.id}">· ${esc(it.title || '(无标题)')}（${esc(fmtReceived(it.received_at))}）</a>`).join('<br>');
        box.querySelectorAll('[data-dup]').forEach((a) => a.addEventListener('click', async () => {
          const it = await api('/api/messages/' + a.dataset.dup);
          openMessageModal(it);
        }));
      } catch (e) { /* 静默 */ }
    }, 800);
  });
}

/* ========= 添加 / 编辑群 ========= */
function openGroupModal(group) {
  openModal(`
    <h2>${group ? `${icon('edit')} 编辑群` : `${icon('plus')} 添加群`}</h2>
    <div class="form">
      <label>群名称</label>
      <input id="g-name" value="${group ? esc(group.name) : ''}" placeholder="如：班级通知群">
      <div class="grid2">
        <div><label>平台</label>
          <select id="g-platform">
            <option value="wechat" ${group && group.platform === 'wechat' ? 'selected' : ''}>微信</option>
            <option value="qq" ${group && group.platform === 'qq' ? 'selected' : ''}>QQ</option>
            <option value="other" ${group && group.platform === 'other' ? 'selected' : ''}>其他</option>
          </select></div>
        <div><label>标记颜色</label><input id="g-color" type="color" value="${group ? esc(group.color) : '#4f6ef2'}"></div>
      </div>
      ${group ? `<button id="g-del" class="ghost danger" style="margin-top:14px">${icon('trash')} 删除该群（群里的信息会保留）</button>` : ''}
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="btn-save-group">保存</button>
    </div>`);
  $('#btn-save-group').addEventListener('click', async () => {
    const body = { name: $('#g-name').value.trim(), platform: $('#g-platform').value, color: $('#g-color').value };
    if (!body.name) { toast('请填写群名称', 'error'); return; }
    try {
      if (group) await api('/api/groups/' + group.id, { method: 'PUT', body });
      else await api('/api/groups', { method: 'POST', body });
      closeModal();
      toast('已保存');
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  });
  const del = $('#g-del');
  if (del) del.addEventListener('click', async () => {
    if (!confirm(`确定删除群「${group.name}」吗？\n群里的信息不会被删除，只是不再归类。`)) return;
    try {
      await api('/api/groups/' + group.id, { method: 'DELETE' });
      if (String(state.group) === String(group.id)) state.group = null;
      closeModal();
      toast('群已删除');
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ========= 班级名单（创建接龙 / 签箱时复用名单） ========= */
// 在弹窗里绑定"从班级名单选择 + 删除"控件；applyRoster(选中项) 由调用方填充表单
async function setupRosterLib(prefix, applyRoster) {
  const sel = $('#' + prefix + '-roster-lib');
  const delBtn = $('#' + prefix + '-roster-lib-del');
  if (!sel) return;
  // 名单全文（学号姓名）只归系统管理员；班委在这里按名称选用名单——
  // 选中项只传 id，由服务器读取名单，学号内容不经过班委（能看到名字与人数，看不到名单全文）
  const officer = !isSysAdmin();
  let lib = [];
  try { lib = (await api('/api/rosters')).items; } catch (e) { /* 拉取失败按空处理 */ }
  const renderOptions = () => {
    sel.innerHTML = '<option value="">— 手动粘贴名单 —</option>' +
      lib.map((r) => `<option value="${r.id}">${esc(r.name)}（${r.count} 人）</option>`).join('');
  };
  renderOptions();
  if (officer) {
    // 班委：按名称选用名单（只看到名字与人数），选中即由服务器读取——学号全文不经过班委
    const ta = $('#' + prefix + '-roster');
    const cb = $('#' + prefix + '-keepid');
    const refHint = document.createElement('p');
    refHint.className = 'hint';
    refHint.style.margin = '6px 0 0';
    sel.parentElement.after(refHint);
    const sync = () => {
      const chosen = !!sel.value;
      if (ta) ta.style.display = chosen ? 'none' : '';
      const kl = cb ? cb.closest('label') : null;
      if (kl) kl.style.display = chosen ? 'none' : '';
      refHint.textContent = chosen ? '✓ 已选用该名单，提交时由服务器读取（名单学号对你不可见）' : '';
    };
    sel.addEventListener('change', () => {
      const r = lib.find((x) => String(x.id) === sel.value);
      sync();
      applyRoster(r ? { ...r, refOnly: true } : null);
    });
    sync();
    return;
  }
  sel.addEventListener('change', () => {
    const r = lib.find((x) => String(x.id) === sel.value);
    delBtn.style.display = r ? '' : 'none';
    if (r) applyRoster(r);
  });
  delBtn.addEventListener('click', async () => {
    const r = lib.find((x) => String(x.id) === sel.value);
    if (!r || !confirm(`从班级名单删除「${r.name}」？`)) return;
    try {
      await api('/api/rosters/' + r.id, { method: 'DELETE' });
      lib = lib.filter((x) => x.id !== r.id);
      renderOptions();
      sel.value = '';
      delBtn.style.display = 'none';
      toast('已从班级名单删除');
    } catch (e) { toast(e.message, 'error'); }
  });
}
// 保存到班级名单（名称留空则跳过）；失败抛错由调用方提示
async function saveRosterToLib(prefix, name, rosterRaw, keepId) {
  return api('/api/rosters', { method: 'POST', body: { name, rosterRaw, keepId } });
}
// 班委发起时不写班级名单（名单库只归系统管理员）：输入框和它的标题一起藏掉并把值清空，
// 否则他填了名字就会在创建前撞一次 401，整次发起失败。
// 按 rosterFields 生成的 -libname-lb 定位标题，不靠 previousElementSibling 猜——
// 规范结构里输入框的兄弟是包着 label 的 .labrow，猜法会漏藏标题。
function gateRosterLibSave(prefix) {
  const el = $('#' + prefix + '-roster-libname');
  if (!el || isSysAdmin()) return;
  const lb = $('#' + prefix + '-roster-libname-lb');
  if (lb) lb.style.display = 'none';
  el.style.display = 'none';
  el.value = '';
}

/* ---------- 名单区共用组件（全站唯一一份） ----------
 * 名单库 / 投票 / 问卷 / 接龙 / 抽签 / 接龙编辑 / 抽签编辑 七处原先各写一套：
 * 两套 DOM 结构、两种 placeholder、三种"含学号"文案、两种预览容器，
 * 而且只有接龙抽签会按粘贴内容自动勾选学号——把「2023001 张三」粘进投票时学号被静默丢掉，
 * 而投票正是按学号定位投票人的。这里收成一处，结构、文案、行为都不再分叉。
 *
 * mode 是真实协议差异，不是历史包袱，必须保留：
 *   'ref'  —— 投票 / 问卷：可只交 rosterId，服务端在有人提交时现读名单（改名单不影响已投的票）
 *   'copy' —— 接龙 / 抽签 / 名单库：把文本抄进框内，随 rosterRaw 一起快照进实体
 */
const ROSTER_KEEPID_LABEL = '名单含学号（按「学号 姓名」解析，重名时能区分）';
const ROSTER_PLACEHOLDER = '每行一个人，Excel / QQ 名单整列可直接粘贴\n例如：2023001 张三 · 2. 李四 · 王五';

function rosterFields(o) {
  const { prefix, label, value = '', keepId = false, rows = 5, lib = true, saveToLib = false } = o;
  const ph = esc(ROSTER_PLACEHOLDER).replace(/\n/g, '&#10;');
  const out = [`<label>${label}</label>`];
  if (lib) out.push(
    `<div class="labrow"><select id="${prefix}-roster-lib" style="flex:1;min-width:0"><option value="">— 手动粘贴名单 —</option></select>`
    + `<button type="button" class="mini danger" id="${prefix}-roster-lib-del" style="display:none;white-space:nowrap">${icon('trash')} 删除</button></div>`);
  out.push(`<textarea id="${prefix}-roster" rows="${rows}" placeholder="${ph}">${esc(value)}</textarea>`);
  out.push(`<label class="splitline"><input type="checkbox" id="${prefix}-keepid" ${keepId ? 'checked' : ''}> ${ROSTER_KEEPID_LABEL}</label>`);
  if (saveToLib) out.push(
    `<label id="${prefix}-roster-libname-lb">保存到班级名单（选填，同名覆盖，下次可直接选用）</label>`,
    `<input id="${prefix}-roster-libname" maxlength="60" placeholder="例如：计科2603">`);
  out.push(`<div id="${prefix}-roster-pv" class="roster-pv"></div>`);
  return out.join('\n      ');
}

function rosterPreviewHtml(raw, keepId, o = {}) {
  const parsed = jlParseRoster(raw, keepId);
  const verb = o.sidFor;
  if (!parsed.list.length) {
    return o.libId
      ? `<span class="ok-t">✓ 已选用班级名单，提交时由服务器读取</span>`
      : `<span class="warn-t">还没有名单${o.libId ? '' : '：从班级名单选，或直接粘贴'}</span>`;
  }
  const missing = parsed.list.filter((m) => !m.id);
  return `<div>识别到 <b>${parsed.list.length}</b> 人${keepId ? '（含学号）' : ''}：</div>`
    + parsed.list.slice(0, 50).map((m) => `<span class="jl-chip plain">${esc(jlSlotLabel(m))}</span>`).join('')
    + (parsed.list.length > 50 ? `<span class="jl-chip plain">…共 ${parsed.list.length} 人</span>` : '')
    + (o.libId ? '<div class="hint">上面是从班级名单选的那份；改成手输即为快照名单</div>' : '')
    + (verb && missing.length
      ? `<div class="warn-t">${missing.length} 人缺学号，无法${verb}：`
        + esc(missing.slice(0, 5).map((m) => m.name).join('、')) + (missing.length > 5 ? ' 等' : '')
        + '——名单写成「2023001 张三」并勾选上面的学号项</div>' : '');
}

function bindRosterFields(o) {
  const { prefix, mode = 'copy', sidFor, applyRoster } = o;
  const ta = $('#' + prefix + '-roster'), cb = $('#' + prefix + '-keepid'), pv = $('#' + prefix + '-roster-pv');
  if (!ta || !cb || !pv) return;
  const libSel = $('#' + prefix + '-roster-lib');
  let touched = cb.checked;   // 用户没手动动过学号勾之前，按粘贴内容自动判定（原先只有接龙抽签这么做）
  const draw = () => {
    // ref 模式下选了班级名单就不需要框里的文本，预览要说清这份名单从哪来
    const libId = mode === 'ref' && libSel ? libSel.value : '';
    pv.innerHTML = rosterPreviewHtml(ta.value, cb.checked, { sidFor, libId });
  };
  const auto = () => {
    if (touched) return;
    const k = jlParseRoster(ta.value, true).hasIds;
    if (k !== cb.checked) { cb.checked = k; draw(); }
  };
  ta.addEventListener('input', () => {
    // 手动编辑名单文本即脱离按 id 引用（否则引用的名单会覆盖手改内容）
    if (libSel && libSel.value) { libSel.value = ''; if (delBtn) delBtn.style.display = 'none'; }
    auto(); draw();
  });
  cb.addEventListener('change', () => { touched = true; draw(); });
  if (libSel) {
    libSel.addEventListener('change', draw);
    setupRosterLib(prefix, applyRoster || ((r) => { ta.value = r.roster; touched = true; draw(); }));
  }
  draw();
}

// 发起 / 保存时统一从这里取值，调用点不再自己拼 id。
// 名单框不存在时返回 null 而不是空值：编辑弹窗里非系统管理员看不到名单输入，
// 此时必须整字段不提交，服务端才按"字段没传"保持原名单（含学号）不动；
// 若回退成空串就会把别人的名单清空。
function readRoster(prefix, mode = 'copy') {
  const ta = $('#' + prefix + '-roster');
  if (!ta) return null;
  const libSel = $('#' + prefix + '-roster-lib');
  return {
    libId: mode === 'ref' && libSel ? libSel.value : '',
    raw: ta.value,
    keepId: !!($('#' + prefix + '-keepid') || {}).checked,
    libName: (($('#' + prefix + '-roster-libname') || {}).value || '').trim(),
  };
}

/* ========= 班级接龙（自「接龙小助手」并入） ========= */
let jlTimer = null;
function jlStopTimer() { if (jlTimer) { clearInterval(jlTimer); jlTimer = null; } }
let vTimer = null;
function vStopTimer() { if (vTimer) { clearInterval(vTimer); vTimer = null; } }
function jlSlotLabel(r) { return r.id ? r.id + ' ' + r.name : r.name; }
function jlFmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function jlIsIdToken(t) { return /^\d{1,12}$/.test(t); }
// 与服务端一致的名单解析（发起/编辑时实时预览）
function jlParseRoster(raw, keepId) {
  const result = { list: [], hasIds: false };
  if (!raw) return result;
  let pendingId = null, lastNameNoId = -1;
  const seen = new Set();
  const push = (id, name) => {
    name = String(name).replace(/[，,。;；、.]+$/, '').trim();
    if (!name) return;
    id = id ? String(id) : null;
    const key = (id || '') + '|' + name;
    if (seen.has(key)) return;
    seen.add(key);
    if (id) { result.hasIds = true; lastNameNoId = -1; }
    else lastNameNoId = result.list.length;
    result.list.push({ id, name });
  };
  for (let line of String(raw).split(/[\n\r]+/)) {
    line = line
      .replace(/^[([（【]?\d{1,4}\s*[.、)】）\]]\s*/, '')
      .replace(/(^|\s)[([（【]?\d{1,4}\s*[.、)】）\]]/g, '$1')
      .replace(/^[-*•·]+\s*/, '')
      .trim();
    if (!line) continue;
    for (let seg of line.split(/[,，、;；]+/)) {
      seg = seg.trim();
      if (!seg) continue;
      const tokens = seg.split(/\s+/).filter(Boolean);
      const idIdx = tokens.findIndex(jlIsIdToken);
      if (tokens.length === 1) {
        const t = tokens[0];
        if (jlIsIdToken(t)) {
          if (keepId) {
            if (lastNameNoId >= 0) { result.list[lastNameNoId].id = t; result.hasIds = true; lastNameNoId = -1; }
            else pendingId = t;
          }
          continue;
        }
        push(keepId ? pendingId : null, t);
        pendingId = null;
      } else if (idIdx >= 0) {
        // 与 lib/jielong.js parseRoster 保持同步：多 token 段先剥 1-2 位小序号
        // （"1 张三 2023001"），再让每个姓名就近配一个学号（"2023001 张三 2023002 李四"），
        // 学号不再被当成姓名入库
        const seqLike = tokens.length >= 3 && /^\d{1,2}$/.test(tokens[0]) && tokens.slice(1).some((t) => jlIsIdToken(t));
        const toks = seqLike ? tokens.slice(1) : tokens;
        const idOf = new Map(); // 姓名所在下标 -> 配对的学号
        for (let ii = 0; ii < toks.length; ii++) {
          if (!jlIsIdToken(toks[ii])) continue;
          if (ii > 0 && !jlIsIdToken(toks[ii - 1]) && !idOf.has(ii - 1)) idOf.set(ii - 1, toks[ii]);
          else {
            let j = ii + 1;
            while (j < toks.length && jlIsIdToken(toks[j])) j++;
            if (j < toks.length && !idOf.has(j)) idOf.set(j, toks[ii]);
          }
        }
        for (let k = 0; k < toks.length; k++) {
          if (jlIsIdToken(toks[k])) continue;
          push(keepId ? (idOf.get(k) || null) : null, toks[k]);
        }
        pendingId = null;
      } else {
        tokens.forEach((t) => { push(keepId ? pendingId : null, t); pendingId = null; });
      }
    }
  }
  return result;
}
// 复制：优先 clipboard API，http 局域网等非安全上下文自动降级
async function jlCopy(text, okMsg) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
    toast(ok ? (okMsg || '已复制') : '复制失败，请长按手动复制', ok ? '' : 'error');
    return ok;
  };
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); toast(okMsg || '已复制'); return; }
  } catch (e) { /* 降级 */ }
  fallback();
}
// 二维码组件懒加载：首页不加载 qrcode.min.js，首次扫码时按需注入
function loadQrLib() {
  return new Promise((resolve, reject) => {
    if (typeof qrcode === 'function') { resolve(); return; }
    const s = document.createElement('script');
    s.src = '/js/qrcode.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('二维码组件加载失败'));
    document.head.appendChild(s);
  });
}
async function jlQr(text, box) {
  try {
    await loadQrLib();
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    box.innerHTML = qr.createSvgTag(4, 0);
  } catch (e) { box.innerHTML = '<p class="empty-mini">' + esc(e.message || '二维码生成失败') + '</p>'; }
}
function openJlQrModal(url) {
  openModal(`<h2>${icon('qr')} 扫码接龙</h2><div class="qrbox">${''}</div>
    <p class="hint" style="text-align:center">手机扫码打开接龙页，或复制链接发到班群</p>
    <div class="modal-foot"><button class="ghost" id="btn-cancel">关闭</button></div>`);
  jlQr(url, $('#modal-root .qrbox'));
}

const jlStatusBadge = (a) => {
  if (a.closed) return '<span class="jl-badge off">已停止</span>';
  if (a.closedNow) return '<span class="jl-badge off">已截止</span>';
  return '<span class="jl-badge on">进行中</span>';
};
function jlProgressHtml(a) {
  if (a.hasRoster) {
    const pct = a.total ? Math.round(a.done / a.total * 100) : 0;
    const mCnt = (a.missing || []).length;
    return `<div class="jl-prognum"><b>${a.done}</b><span class="sep">/</span><span>${a.total}</span><span class="unit">人已接龙</span></div>
      <div class="jl-bar"><i style="width:${pct}%"></i></div>
      <div class="jl-progsub">${mCnt ? '还有 ' + mCnt + ' 人未接龙' : '全部已接龙'}${a.count > a.done ? '，另有 ' + (a.count - a.done) + ' 人名单外接龙' : ''}</div>`;
  }
  return `<div class="jl-prognum"><b>${a.count}</b><span class="unit">人已接龙</span></div>
    <div class="jl-bar"><i style="width:${a.count ? 100 : 0}%"></i></div>
    <div class="jl-progsub">未设置名单，仅统计接龙人数</div>`;
}

/* ---------- 接龙列表 ---------- */
async function loadJielong() {
  const seq = loadSeq;
  jlStopTimer();
  const view = $('#view');
  if (state.jl) { await loadJielongDetail(); return; }
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/jielong');
  if (seq !== loadSeq) return;
  const items = data.items.map((a) => {
    const canEdit = canPost();
    return `<div class="panel">
      <div class="jl-head"><h2>${esc(a.title)}</h2>${jlStatusBadge(a)}</div>
      ${a.description ? `<p class="jl-desc">${esc(a.description.length > 80 ? a.description.slice(0, 80) + '…' : a.description)}</p>` : ''}
      <div class="jl-meta">${a.deadline ? `${icon('clock')} 截止 ${esc(a.deadline)}` : ''}
        <span>${a.hasRoster ? `${icon('check')} ${a.done}/${a.total} 已接` : `${icon('users')} ${a.count} 人已接`}</span>
        <span>发起于 ${jlFmtTime(a.createdAt)}</span></div>
      <div class="jl-actions">
        <button class="ghost" data-jl-open="${a.id}">${icon('external')} 打开接龙页</button>
        <button class="ghost" data-jl-copy="${a.id}">${icon('copy')} 复制学生链接</button>
        ${canEdit ? `<button class="ghost" data-jl-manage="${a.id}">${icon('settings')} 管理</button>` : ''}
      </div>
    </div>`;
  }).join('');

  view.innerHTML =
    `<div class="jl-head"><h2>${icon('jielong')} 活动接龙</h2></div>
    <p class="hint">接龙链接发到班群，同学点开即填即交；自动比对名单，谁没接龙一目了然。</p>
    ${canPost() ? `<div class="jl-actions"><button class="primary" id="btn-jl-create">${icon('plus')} 发起接龙</button></div>` : ''}
    ${items || `<div class="empty"><div class="big">${icon('jielong')}</div>还没有接龙` +
      (canPost() ? '<br>点上面「发起接龙」，把班群里的接龙搬到这里' : '<br>发起后接龙会出现在这里') + '</div>'}`;
  const createBtn = $('#btn-jl-create');
  if (createBtn) createBtn.addEventListener('click', openJielongCreateModal);
  $$('[data-jl-manage]').forEach((b) => b.addEventListener('click', () => {
    state.jl = { id: b.dataset.jlManage };
    renderView().catch((e) => toast(e.message, 'error'));
  }));
  $$('[data-jl-open]').forEach((b) => b.addEventListener('click', () => window.open('/j/' + b.dataset.jlOpen)));
  $$('[data-jl-copy]').forEach((b) => b.addEventListener('click', () => jlCopy(location.origin + '/j/' + b.dataset.jlCopy, '学生链接已复制，可发到班群')));
}

/* 邮件催办选人弹窗：people = [{ i, label, bound, known }]，未绑定邮箱的置灰（发了也收不到） */
function openMailPickModal(people, onSend) {
  openModal(`
    <h2>${icon('bell')} 邮件催办</h2>
    <p class="hint">勾选要提醒的同学（默认全选）。标「未绑定」的还没绑定提醒邮箱，发了也收不到。</p>
    <div class="form" id="mail-pick-list">
      ${people.map((p) => `<label class="mail-pick-row"><input type="checkbox" data-i="${p.i}" ${p.bound ? 'checked' : 'disabled'}> ${esc(p.label)}${p.bound ? '' : ' <span class="jl-badge off">未绑定</span>'}</label>`).join('')}
    </div>
    <div class="modal-foot"><button class="ghost" id="btn-cancel">取消</button><button class="primary" id="mail-pick-ok">${icon('bell')} 发送</button></div>`);
  $('#mail-pick-ok').addEventListener('click', async () => {
    const slots = $$('#mail-pick-list input[type=checkbox]:checked').map((c) => Number(c.dataset.i)).filter((x) => !Number.isNaN(x));
    if (!slots.length) { toast('没有勾选任何人', 'error'); return; }
    try { await onSend(slots); closeModal(); } catch (e) { toast(e.message, 'error'); }
  });
}

/* ---------- 接龙详情（管理台） ---------- */
async function loadJielongDetail(quiet) {
  if (!state.jl) return; // 轮询回调可能在用户退出详情后才回来，此时不能再覆盖视图
  const seq = loadSeq;
  const view = $('#view');
  const silent = !!view.querySelector('[data-jl-detail="' + state.jl.id + '"]'); // 已在本详情页：轮询走静默
  let a;
  try { a = await api('/api/jielong/' + state.jl.id); }
  catch (e) {
    if (seq !== loadSeq) return;
    if ((silent || quiet) && e.status !== 404) return; // 网络抖动：原地静默；404 = 接龙已被删除，照常退出
    state.jl = null;
    toast(e.message, 'error');
    return loadJielong();
  }
  if (seq !== loadSeq) return; // 等待期间已切换视图，丢弃旧响应
  const canEdit = canPost();   // 接龙的管理动作班委与管理员同权；学号要不要显示由服务端下发时脱敏决定
  const stuLink = location.origin + '/j/' + a.id;

  const withId = (a.roster || []).some((r) => r.id) || a.entries.some((e) => e.id);

  // 静默刷新：数据没变化就不动 DOM——阅读、勾选、滚动位置、文字选中全保留
  const sig = JSON.stringify([a, canEdit, stuLink, withId]);
  if (silent && sig === view.dataset.jlSig) return;
  view.dataset.jlSig = sig;

  view.innerHTML = `
    <button class="ghost jl-back" id="jl-back" data-jl-detail="${a.id}">← 返回接龙列表</button>
    ${state.jlBanner ? `<div class="jl-banner">${icon('check')} 接龙创建成功！把「学生链接」发到班群即可；本页可随时查看进度、复制提醒文案。<b>这条接龙的入口保存在本浏览器</b>，换设备登录后从「活动接龙」进入。</div>` : ''}
    <div class="panel">
      <div class="jl-head"><h2>${esc(a.title)}</h2>${jlStatusBadge(a)}</div>
      ${a.description ? `<p class="jl-desc">${esc(a.description)}</p>` : ''}
      <div class="jl-meta">${a.deadline ? `${icon('clock')} 截止 ${esc(a.deadline)}` : '不限截止时间'}<span>发起于 ${jlFmtTime(a.createdAt)}</span>
        ${a.closedNow ? '<span class="jl-badge warn">已截止，不能再提交</span>' : ''}</div>
      <div class="jl-prog">${jlProgressHtml(a)}</div>
    </div>
    ${canEdit ? `<div class="panel">
      <div class="jl-linkrow"><input readonly value="${esc(stuLink)}"><button class="ghost" id="jl-copy-stu">复制学生链接</button>
        <button class="ghost" id="jl-show-qr">二维码</button></div>
      <div class="jl-actions">
        <button class="ghost" id="jl-copy-miss">${icon('copy')} 复制未接名单</button>
        <button class="ghost" id="jl-mail-miss">${icon('bell')} 邮件催办未接</button>
        <button class="ghost" id="jl-import-done">${icon('upload')} 批量导入已接</button>
        <a class="ghost" id="jl-export" href="/api/jielong/${a.id}/export" download>${icon('download')} 导出 CSV</a>
        <button class="ghost" id="jl-edit">${icon('edit')} 编辑</button>
        <button class="ghost" id="jl-close">${a.closed ? `${icon('refresh')} 重新开启` : `${icon('clock')} 停止接龙`}</button>
        <button class="ghost danger" id="jl-del">${icon('trash')} 删除接龙</button>
      </div>
    </div>` : ''}
    <div class="panel">
      <h3>${icon('users')} 已接龙（${a.entries.length} 人）</h3>
      ${a.entries.length ? `<div class="jl-tblwrap"><table class="jl-table">
        <thead><tr><th>#</th>${withId ? '<th>学号</th>' : ''}<th>姓名</th>
        ${a.fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>备注</th><th>时间</th>${canEdit ? '<th></th>' : ''}</tr></thead>
        <tbody>${a.entries.map((e, i) => `
          <tr><td>${i + 1}</td>
          ${withId ? `<td>${esc(e.id || '—')}</td>` : ''}
          <td><b>${esc(e.name)}</b>${e.outside ? ' <span class="jl-badge warn">名单外</span>' : ''}</td>
          ${a.fields.map((f) => `<td>${esc(e.values[f.key] || '—')}</td>`).join('')}
          <td>${esc(e.remark || '—')}</td>
          <td class="dim">${jlFmtTime(e.time)}</td>
          ${canEdit ? `<td><button class="mini danger" data-jl-del-entry="${e.outside || e.rid == null ? 'n:' + esc(e.name) : 'r:' + e.rid}">删除</button></td>` : ''}</tr>`).join('')}</tbody>
      </table></div>` : '<p class="empty-mini">还没有人接龙，快把学生链接发到班群吧</p>'}
    </div>
    ${a.hasRoster ? `<div class="panel">
      <h3>${icon('clock')} 未接龙（${(a.missing || []).length} 人）</h3>
      ${(a.missing || []).length
        ? `<div>${a.missing.map((m) => `<span class="jl-chip">${esc(jlSlotLabel(m))}</span>`).join('')}</div>`
        : '<p class="empty-mini">全部完成！</p>'}
    </div>` : ''}`;

  state.jlBanner = false;
  $('#jl-back').addEventListener('click', () => { state.jl = null; renderView().catch(() => {}); });

  // 每 5 秒静默刷新：数据没变就不动页面；弹窗打开或正在输入时不打扰
  jlStopTimer();
  jlTimer = setInterval(async () => {
    if ($('#modal-root').children.length) return;
    const el = document.activeElement;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    if (!state.jl || state.view !== 'jielong') return; // 已退出详情页，别再覆盖视图
    const y = window.scrollY; // 在替换 DOM 前捕获，替换后内容高度变化可能重置滚动
    const cur = view.innerHTML;
    state.jlQuiet = true;
    try {
      await loadJielongDetail(true); // quiet：接口挂了原地静默，本轮跳过
    } catch (e) { /* 静默 */ } finally { state.jlQuiet = false; }
    if (view.innerHTML !== cur) window.scrollTo(0, y); // 只有数据真的变了才需要恢复滚动
  }, 5000);
  if (!state.jlQuiet) window.scrollTo(0, 0);

  if (!canEdit) return;

  $('#jl-copy-stu').addEventListener('click', () => jlCopy(stuLink, '学生链接已复制'));
  $('#jl-show-qr').addEventListener('click', () => openJlQrModal(stuLink));
  $('#jl-copy-miss').addEventListener('click', () => {
    const missing = a.missing || [];
    if (!a.hasRoster) { toast('本次接龙未设置名单'); return; }
    if (!missing.length) { toast('全部都已接龙'); return; }
    jlCopy('【' + a.title + '】还没有接龙的同学（' + missing.length + '人）：\n' +
      missing.map(jlSlotLabel).join('、') + '\n请点击链接完成接龙：' + stuLink, '已复制，可粘贴到班群提醒大家');
  });
  $('#jl-mail-miss').addEventListener('click', () => {
    const missing = a.missing || [];
    if (!a.hasRoster) { toast('本次接龙未设置名单'); return; }
    if (!missing.length) { toast('全部都已接龙'); return; }
    openMailPickModal(missing.map((m) => ({ i: m.i, label: (m.id ? m.id + ' ' : '') + m.name, bound: !!m.bound })), async (slots) => {
      const r = await api('/api/jielong/' + a.id + '/remind-mail', { method: 'POST', body: { slots } });
      toast('已发 ' + r.sent + ' 封' + (r.noQQ ? '，' + r.noQQ + ' 人未绑定邮箱' : '') + (r.skipped ? '，' + r.skipped + ' 人 30 分钟内已催过' : ''), r.sent ? undefined : 'error');
      loadJielongDetail();
    });
  });
  $('#jl-import-done').addEventListener('click', () => {
    openModal(`
      <h2>${icon('upload')} 批量导入已接</h2>
      <p class="hint">把 QQ 接龙原文粘进来（每行一个 / 序号 / 顿号分隔都认，带学号更准）。按名单匹配后标记为已接（备注「代录」）；已接过的自动跳过，不在名单里的会原样列出。</p>
      <div class="form"><textarea id="jl-import-text" rows="8" placeholder="1. 张三&#10;2. 李四&#10;或：张三、李四、王五"></textarea></div>
      <div class="modal-foot"><button class="ghost" id="btn-cancel">取消</button><button class="primary" id="jl-import-ok">${icon('check')} 导入</button></div>`);
    $('#jl-import-ok').addEventListener('click', async () => {
      const text = $('#jl-import-text').value;
      try {
        const r = await api('/api/jielong/' + a.id + '/import', { method: 'POST', body: { text } });
        closeModal();
        toast('已导入 ' + r.imported + ' 人' + (r.already ? '，' + r.already + ' 人已接跳过' : '') + (r.unmatchedCount ? '；未匹配：' + r.unmatched.join('、') : ''), r.imported ? undefined : 'error');
        loadJielongDetail();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
  $('#jl-edit').addEventListener('click', () => openJielongEditModal(a));
  $('#jl-close').addEventListener('click', async () => {
    const target = !a.closed;
    if (target && !confirm('确定停止接龙？停止后同学将无法再提交（可重新开启）。')) return;
    try {
      await api(`/api/jielong/${a.id}/close`, { method: 'POST', body: { closed: target } });
      toast(target ? '已停止接龙' : '已重新开启接龙');
      loadJielongDetail();
    } catch (e) { toast(e.message, 'error'); }
  });
  $('#jl-del').addEventListener('click', async () => {
    if (!confirm(`确定删除整个接龙？「${a.title}」的全部数据（含 ${a.entries.length} 条记录）将被清除，不可恢复！`)) return;
    if (!confirm('再次确认：真的要删除吗？')) return;
    try {
      await api(`/api/jielong/${a.id}`, { method: 'DELETE' });
      state.jl = null;
      toast('接龙已删除');
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-jl-del-entry]').forEach((btn) => btn.addEventListener('click', async () => {
    const key = btn.dataset.jlDelEntry;
    const label = key.startsWith('r:') ? '该同学的' : `「${key.slice(2)}」的`;
    if (!confirm(`确定删除${label}接龙记录？`)) return;
    try {
      await api(`/api/jielong/${a.id}/entry?${key.startsWith('r:') ? 'rid=' + key.slice(2) : 'name=' + encodeURIComponent(key.slice(2))}`, { method: 'DELETE' });
      loadJielongDetail();
    } catch (e) { toast(e.message, 'error'); }
  }));
}

/* ---------- 发起 / 编辑接龙 ---------- */
function openJielongCreateModal() {
  const fields = [{ label: '接龙内容', type: 'text', required: true, options: [] }];

  const renderFields = () => {
    const box = $('#jl-fields');
    box.innerHTML = '';
    fields.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'jl-frow';
      row.innerHTML = `<div class="line1">
          <input class="f-label" data-i="${i}" maxlength="30" placeholder="项目名称，如：是否参加" value="${esc(f.label)}">
          <select class="f-type" data-i="${i}">
            <option value="text"${f.type === 'text' ? ' selected' : ''}>单行文本</option>
            <option value="textarea"${f.type === 'textarea' ? ' selected' : ''}>多行文本</option>
            <option value="select"${f.type === 'select' ? ' selected' : ''}>单选</option>
          </select>
          <button class="mini danger f-del" data-i="${i}" type="button">✕</button></div>
        <div class="line2">
          <label><input type="checkbox" class="f-required" data-i="${i}"${f.required ? ' checked' : ''}>必填</label>
          <input class="f-options" data-i="${i}" maxlength="200" placeholder="选项用逗号分隔，如：参加,不参加" value="${esc((f.options || []).join(','))}"${f.type === 'select' ? '' : ' style="display:none"'}>
        </div>`;
      box.appendChild(row);
    });
    box.querySelectorAll('.f-label').forEach((el) => el.addEventListener('input', () => { fields[+el.dataset.i].label = el.value; }));
    box.querySelectorAll('.f-type').forEach((el) => el.addEventListener('change', () => { fields[+el.dataset.i].type = el.value; renderFields(); }));
    box.querySelectorAll('.f-required').forEach((el) => el.addEventListener('change', () => { fields[+el.dataset.i].required = el.checked; }));
    box.querySelectorAll('.f-options').forEach((el) => el.addEventListener('input', () => {
      fields[+el.dataset.i].options = el.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }));
    box.querySelectorAll('.f-del').forEach((el) => el.addEventListener('click', () => { fields.splice(+el.dataset.i, 1); renderFields(); }));
  };

  openModal(`
    <h2>${icon('jielong')} 发起接龙</h2>
    <div class="form">
      <label>接龙标题</label>
      <input id="jl-title" maxlength="60" placeholder="例如：9月12日春游报名">
      <label>说明（选填）</label>
      <textarea id="jl-desc" rows="2" maxlength="1000" placeholder="时间、地点、要求等，同学打开链接就能看到"></textarea>
      ${rosterFields({ prefix: 'jl', label: '班级名单（选填，用于自动统计谁没接龙）', saveToLib: true })}
      <label>截止时间（选填）</label>
      <input id="jl-deadline" type="datetime-local">
      <label>接龙内容（同学需要填写的项目，可增减）</label>
      <div id="jl-fields"></div>
      <button class="ghost" id="jl-addfield" type="button">${icon('plus')} 添加填写项</button>
      <label class="splitline" style="margin-top:12px"><input type="checkbox" id="jl-outside" checked> 允许名单外的同学接龙（会标记“名单外”）</label>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="jl-save">创建接龙</button>
    </div>`);

  renderFields();
  $('#jl-addfield').addEventListener('click', () => {
    if (fields.length >= 8) { toast('最多 8 个填写项', 'error'); return; }
    fields.push({ label: '', type: 'text', required: true, options: [] });
    renderFields();
  });
  gateRosterLibSave('jl');
  bindRosterFields({ prefix: 'jl', mode: 'ref' });

  $('#jl-save').addEventListener('click', async () => {
    const title = $('#jl-title').value.trim();
    if (!title) { toast('请填写接龙标题', 'error'); return; }
    const ros = readRoster('jl', 'ref');
    try {
      // 名单本身选填：只填了库名没贴名单时跳过保存，别让辅助字段把主流程 400 卡断
      if (ros.libName && ros.raw.trim()) await saveRosterToLib('jl', ros.libName, ros.raw, ros.keepId);
      const r = await api('/api/jielong', { method: 'POST', body: {
        title,
        description: $('#jl-desc').value.trim(),
        rosterId: ros.libId || null,
        rosterRaw: ros.libId ? '' : ros.raw,
        keepId: ros.libId ? undefined : ros.keepId,
        deadline: valToDt($('#jl-deadline').value) || null,
        allowOutside: $('#jl-outside').checked,
        fields: fields.filter((f) => f.label.trim()).map((f) => ({ label: f.label.trim(), type: f.type, required: f.required, options: f.options || [] })),
      } });
      closeModal();
      state.jl = { id: r.id };
      state.jlBanner = true;
      if (state.view !== 'jielong') state.view = 'jielong';
      syncNavActive();
      renderView().catch(() => {});
      toast('接龙创建成功 ✓');
    } catch (e) { toast(e.message, 'error'); }
  });
}

function openJielongEditModal(a) {
  openModal(`
    <h2>${icon('edit')} 编辑接龙</h2>
    <div class="form">
      <label>标题</label><input id="jl-e-title" maxlength="60" value="${esc(a.title)}">
      <label>说明</label><textarea id="jl-e-desc" rows="2" maxlength="1000">${esc(a.description || '')}</textarea>
      <label>截止时间（留空表示不设截止）</label><input id="jl-e-deadline" type="datetime-local" value="${dtToVal(a.deadline)}">
      ${isSysAdmin() ? rosterFields({
        prefix: 'jl-e', label: '名单（保存后已接记录自动重新匹配；不在新名单中的已接记录会转为"名单外"）',
        value: (a.roster || []).map(jlSlotLabel).join('\n'),
        keepId: (a.roster || []).some((r) => r.id), lib: false,
      })
        : `<label>名单</label><div class="hint">共 ${(a.roster || []).length} 人；名单不能在这里改，保存会把学号冲掉。这里只改标题、说明、截止与开关</div>`}
      <label class="splitline"><input type="checkbox" id="jl-e-outside" ${a.allowOutside ? 'checked' : ''}> 允许名单外的同学接龙</label>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="jl-e-save">保存修改</button>
    </div>`);
  bindRosterFields({ prefix: 'jl-e' });
  $('#jl-e-save').addEventListener('click', async () => {
    if (!$('#jl-e-title').value.trim()) { toast('标题不能为空', 'error'); return; }
    const ros = readRoster('jl-e');
    try {
      await api(`/api/jielong/${a.id}`, { method: 'PUT', body: {
        title: $('#jl-e-title').value,
        description: $('#jl-e-desc').value,
        deadline: valToDt($('#jl-e-deadline').value) || null,
        rosterRaw: ros ? ros.raw : undefined,
        keepId: ros ? ros.keepId : undefined,
        allowOutside: $('#jl-e-outside').checked,
      } });
      closeModal();
      toast('修改已保存');
      loadJielongDetail();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ========= 抽签（按班级名单公平轮抽） ========= */
async function loadDraw() {
  const seq = loadSeq;
  const view = $('#view');
  if (state.draw) { await loadDrawDetail(); return; }
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/draw');
  if (seq !== loadSeq) return;
  const items = data.items.map((d) => `
    <div class="panel">
      <div class="jl-head"><h2>${esc(d.title)}</h2>${d.remainingCount ? `<span class="jl-badge on">箱内剩 ${d.remainingCount}/${d.total}</span>` : '<span class="jl-badge off">本轮已抽完</span>'}</div>
      <div class="jl-meta"><span>每次抽 ${d.perDraw} 人</span><span>已抽 ${d.roundCount} 轮</span><span>名单 ${d.total} 人</span></div>
      <div class="jl-actions">
        <button class="primary" data-dw-open="${d.id}">${icon('draw')} 进入抽签</button>
        ${canPost() ? `<button class="ghost danger" data-dw-del="${d.id}">${icon('trash')} 删除</button>` : ''}
      </div>
    </div>`).join('');
  view.innerHTML = `
    <div class="jl-head"><h2>${icon('draw')} 抽签点名</h2></div>
    <p class="hint">按班级名单建签箱：抽过的人自动排除，下次不会被抽到；箱内抽空后自动开始新一轮，保证大家轮流参加。</p>
    ${canPost() ? `<div class="jl-actions"><button class="primary" id="btn-dw-create">${icon('plus')} 新建签箱</button></div>` : ''}
    ${items || `<div class="empty"><div class="big">${icon('draw')}</div>还没有签箱<br>${canPost() ? '点上面「新建签箱」，粘贴班级名单就能开始抽签' : '发起后签箱会出现在这里'}</div>`}`;
  const createBtn = $('#btn-dw-create');
  if (createBtn) createBtn.addEventListener('click', openDrawCreateModal);
  $$('[data-dw-open]').forEach((b) => b.addEventListener('click', () => {
    state.draw = b.dataset.dwOpen;
    renderView().catch((e) => toast(e.message, 'error'));
  }));
  $$('[data-dw-del]').forEach((b) => b.addEventListener('click', async () => {
    const box = data.items.find((x) => x.id === b.dataset.dwDel);
    if (!confirm(`确定删除签箱「${box ? box.title : ''}」？抽签历史一并清除，不可恢复！`)) return;
    try { await api('/api/draw/' + b.dataset.dwDel, { method: 'DELETE' }); toast('签箱已删除'); loadDraw(); }
    catch (e) { toast(e.message, 'error'); }
  }));
}

async function loadDrawDetail() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  let d;
  try { d = await api('/api/draw/' + state.draw); }
  catch (e) {
    if (seq !== loadSeq) return;
    state.draw = null; toast(e.message, 'error'); return loadDraw();
  }
  if (seq !== loadSeq) return; // 等待期间已切换视图，丢弃旧响应
  renderDrawDetail(d);
}

function renderDrawDetail(d) {
  const view = $('#view');
  const canEdit = canPost();   // 抽签的全套动作班委可用；学号要不要出现由服务端下发时脱敏决定
  const pct = d.total ? Math.round((d.total - d.remainingCount) / d.total * 100) : 0;
  const done = d.total > 0 && d.remainingCount === 0;
  const last = d.rounds[d.rounds.length - 1];
  // 已抽完时输入框预置"新一轮"的默认人数，而不是 1
  const nextN = done ? Math.min(d.perDraw, d.total) : Math.min(d.perDraw, Math.max(d.remainingCount, 1));
  const nextMax = Math.max(done ? d.total : d.remainingCount, 1);
  view.innerHTML = `
    <button class="ghost jl-back" id="dw-back">← 返回抽签列表</button>
    <div class="panel">
      <div class="jl-head"><h2>${esc(d.title)}</h2>${done ? '<span class="jl-badge off">本轮已抽完</span>' : `<span class="jl-badge on">箱内剩 ${d.remainingCount}/${d.total}</span>`}</div>
      <div class="jl-meta"><span>名单 ${d.total} 人</span><span>已抽 ${d.roundCount} 轮</span></div>
      <div class="jl-prog"><div class="jl-bar"><i style="width:${pct}%"></i></div></div>
    </div>
    <div class="panel">
      <div class="dw-countrow">本次抽 <input id="dw-count" type="number" min="1" max="${nextMax}" value="${nextN}"> 人
        <span class="hint" style="margin:0">${done ? '箱内已抽空，下次抽签自动开始新一轮' : `还剩 ${d.remainingCount} 人未被抽到`}</span></div>
      <div class="dw-result" id="dw-result">${last ? last.picked.map((p) => `<span class="dw-name">${esc(p.name)}</span>`).join('') : `<span class="dw-empty">点下面按钮开始抽签</span>`}</div>
      ${canEdit ? `
      <button class="dw-go" id="dw-go">${icon('draw')} 开始抽签${done ? '（新一轮）' : ''}</button>
      <div class="jl-actions">
        <button class="ghost" id="dw-undo" ${d.roundCount ? '' : 'disabled'}>${icon('undo')} 撤销上一轮</button>
        <button class="ghost" id="dw-reset" ${d.roundCount ? '' : 'disabled'}>${icon('refresh')} 重置箱子</button>
        <span class="hint" style="margin:0">重置后所有人重新可被抽到</span>
      </div>` : ''}
    </div>
    <div class="panel">
      <h3>${icon('clock')} 抽签记录（${d.roundCount} 轮）</h3>
      ${d.roundCount ? d.rounds.slice().reverse().map((r, i) => `
        <div class="dw-round"><span class="dw-rtime">第 ${d.roundCount - i} 轮 · ${jlFmtTime(r.time)}</span>
          <span class="dw-rnames">${r.picked.map((p) => `<span class="dw-rname">${esc(p.name)}</span>`).join('')}</span>
        </div>`).join('') : '<p class="empty-mini">还没有抽过</p>'}
    </div>
    ${canEdit ? `<div class="jl-actions">
      <button class="ghost" id="dw-edit">${icon('edit')} 编辑签箱</button>
      <button class="ghost danger" id="dw-del">${icon('trash')} 删除签箱</button>
    </div>` : ''}`;
  $('#dw-back').addEventListener('click', () => { state.draw = null; renderView().catch(() => {}); });
  if (!canEdit) return;

  $('#dw-go').addEventListener('click', async () => {
    const n = Math.max(1, Number($('#dw-count').value) || d.perDraw);
    const btn = $('#dw-go');
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = icon('loader') + ' 抽签中…';
    try {
      const r = await api(`/api/draw/${d.id}/go`, { method: 'POST', body: { count: n } });
      await loadDrawDetail();
      toast(`抽中 ${r.count} 人${r.reset ? '，已自动开始新一轮' : ''}`);
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.innerHTML = orig;
    }
  });
  $('#dw-undo').addEventListener('click', async () => {
    if (!confirm('撤销最近一轮抽签？这一轮抽到的人重新可被抽到。')) return;
    try {
      const r = await api(`/api/draw/${d.id}/undo`, { method: 'POST' });
      toast(`已撤销，${r.restored.map((p) => p.name).join('、')} 重新可抽`);
      loadDrawDetail();
    } catch (e) { toast(e.message, 'error'); }
  });
  $('#dw-reset').addEventListener('click', async () => {
    if (!confirm('重置签箱？所有人重新可被抽到（历史记录清空）。')) return;
    try { await api(`/api/draw/${d.id}/reset`, { method: 'POST' }); toast('签箱已重置'); loadDrawDetail(); }
    catch (e) { toast(e.message, 'error'); }
  });
  $('#dw-edit').addEventListener('click', () => openDrawEditModal(d));
  $('#dw-del').addEventListener('click', async () => {
    if (!confirm(`确定删除签箱「${d.title}」？抽签历史一并清除，不可恢复！`)) return;
    try {
      await api('/api/draw/' + d.id, { method: 'DELETE' });
      state.draw = null;
      toast('签箱已删除');
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  });
}

function openDrawCreateModal() {
  openModal(`
    <h2>${icon('draw')} 新建签箱</h2>
    <div class="form">
      <label>抽签标题</label>
      <input id="dw-title" maxlength="60" placeholder="例如：运动会志愿者抽签">
      ${rosterFields({ prefix: 'dw', label: '班级名单（签箱里的人，支持直接粘贴 Excel / QQ 名单）', saveToLib: true })}
      <label>每次抽几人（抽签时还可以临时改）</label>
      <input id="dw-perdraw" type="number" min="1" value="1">
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="dw-save">创建签箱</button>
    </div>`);
  gateRosterLibSave('dw');
  bindRosterFields({ prefix: 'dw', mode: 'ref' });
  $('#dw-save').addEventListener('click', async () => {
    const title = $('#dw-title').value.trim();
    if (!title) { toast('请填写抽签标题', 'error'); return; }
    const ros = readRoster('dw', 'ref');
    try {
      if (ros.libName && ros.raw.trim()) await saveRosterToLib('dw', ros.libName, ros.raw, ros.keepId);
      const r = await api('/api/draw', { method: 'POST', body: {
        title,
        rosterId: ros.libId || null,
        rosterRaw: ros.libId ? '' : ros.raw,
        keepId: ros.libId ? undefined : ros.keepId,
        perDraw: Number($('#dw-perdraw').value) || 1,
      } });
      closeModal();
      state.draw = r.id;
      if (state.view !== 'draw') state.view = 'draw';
      syncNavActive();
      renderView().catch(() => {});
      toast('签箱创建成功 ✓');
    } catch (e) { toast(e.message, 'error'); }
  });
}

function openDrawEditModal(d) {
  openModal(`
    <h2>${icon('edit')} 编辑签箱</h2>
    <div class="form">
      <label>标题</label><input id="dw-e-title" maxlength="60" value="${esc(d.title)}">
      ${isSysAdmin() ? rosterFields({
        prefix: 'dw-e', label: '名单（保存后按"学号+姓名"匹配已抽记录；不在新名单中的已抽记录自动失效）',
        value: d.roster ? d.roster.map(jlSlotLabel).join('\n') : '',
        keepId: (d.roster || []).some((r) => r.id), lib: false,
      })
        : `<label>名单</label><div class="hint">共 ${d.total} 人；名单不能在这里改，保存会把学号冲掉。这里只改标题与每次抽几人</div>`}
      <label>每次抽几人</label>
      <input id="dw-e-perdraw" type="number" min="1" value="${d.perDraw}">
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="dw-e-save">保存修改</button>
    </div>`);
  bindRosterFields({ prefix: 'dw-e' });
  $('#dw-e-save').addEventListener('click', async () => {
    if (!$('#dw-e-title').value.trim()) { toast('标题不能为空', 'error'); return; }
    const ros = readRoster('dw-e');
    try {
      await api('/api/draw/' + d.id, { method: 'PUT', body: {
        title: $('#dw-e-title').value,
        rosterRaw: ros ? ros.raw : undefined,
        keepId: ros ? ros.keepId : undefined,
        perDraw: Number($('#dw-e-perdraw').value) || 1,
      } });
      closeModal();
      toast('修改已保存');
      loadDrawDetail();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ========= 班级生日（倒计时与祝福） ========= */
// 祝福语：开头 × 主体 × 结尾 随机组合，尽量不重样
const BD_WISH_OPEN = [
  '生日快乐！', '🎂 生日快乐！', '叮咚～你的生日祝福已送达：', '今天的主角是你！',
  '🎉 HAPPY BIRTHDAY 🎉', '又到了一年中属于你的这一天～', '蜡烛已点好，掌声已备好：', '嘿！今天你最大：',
];
const BD_WISH_CORE = [
  '愿新的一岁里，开心每天都有，好运一直都在',
  '愿你所愿皆成真，所行皆坦途',
  '愿你被这个世界温柔以待，快乐像蛋糕一样甜',
  '愿烦恼像气球一样飞走，微笑常挂在嘴角',
  '愿你眼里有光、心中有爱、前路有期待',
  '愿你平安喜乐，万事胜意',
  '愿你保持热爱，也能奔赴山海',
  '愿所有的好运，都准时降落在你身上',
  '愿你喜欢的都拥有，失去的都释怀',
  '愿你永远有敢想敢做的勇气，和说走就走的底气',
];
const BD_WISH_TAIL = ['🎂', '🎉 🎈', '（蜡烛已点好，就等你啦）', '✨ 🎂 ✨', '—— 来自班级的祝福', '🥳'];
function bdWish(m) {
  if (m.note) return m.note;
  let s = Math.floor(Math.random() * 100000);
  const pick = (arr) => { const v = arr[s % arr.length]; s = Math.floor(s / arr.length) + 7; return v; };
  return pick(BD_WISH_OPEN) + pick(BD_WISH_CORE) + (Math.random() < 0.5 ? ' ' + pick(BD_WISH_TAIL) : '');
}
let bdTodayCache = null;
async function refreshBirthdaysToday() {
  try {
    bdTodayCache = (await api('/api/birthdays')).today || [];
    setNavBadge('birthday', bdTodayCache.length, { bday: true }); // 有人过生日时，导航「🎂 生日」亮起弹跳的 🎂
    // 首屏竞态：生日数据比信息流先发出、后到达时，补插横幅（addBdBanner 自带查重）
    if (state.view === 'feed' && !$('.bd-feedbanner')) addBdBanner();
  } catch (e) { /* 静默 */ }
  return bdTodayCache || [];
}
async function checkBirthdayNotifs() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const today = await refreshBirthdaysToday();
    const key = 'infohub-bday-notified-' + ymd(new Date());
    // 只保留当天的提醒记录，历史 key 会一直占着 localStorage
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('infohub-bday-notified-') && k !== key)
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* 忽略 */ }
    if (!today.length) return;
    const done = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    for (const m of today) {
      if (done.has(String(m.id))) continue;
      done.add(String(m.id));
      try { new Notification('🎂 今天是 ' + m.name + ' 的生日', { body: bdWish(m), tag: 'infohub-bday-' + m.id }); } catch (e) { /* 忽略 */ }
    }
    localStorage.setItem(key, JSON.stringify([...done]));
  } catch (e) { /* 静默 */ }
}

/* ========= 问卷调查 ========= */
async function loadSurveys() {
  const seq = loadSeq;
  const view = $('#view');
  if (state.survey) { await loadSurveyDetail(); return; }
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/survey');
  if (seq !== loadSeq) return;
  const items = data.items || [];
  view.innerHTML = `
    <div class="jl-head"><h2>${icon('survey')} 问卷调查</h2></div>
    <p class="hint">把题目一道一道拼成问卷，单选 / 多选 / 评分 / 数字 / 日期 / 文本都可以；可匿名，可设截止时间。</p>
    ${canPost() ? `<div class="jl-actions"><button class="primary" id="btn-survey-new">${icon('plus')} 发起问卷</button></div>` : ''}
    ${items.map((s) => `
      <div class="panel">
        <div class="jl-head"><h2>${esc(s.title)}</h2><span class="jl-badge ${s.closed ? 'off' : 'on'}">${s.closed ? '已截止' : '收集中'}</span></div>
        ${s.description ? `<p class="jl-desc">${esc(s.description)}</p>` : ''}
        <div class="jl-meta">
          <span>已填 <b>${s.done}</b> / ${s.rosterSize} 人</span>
          ${s.deadline ? `<span>${icon('clock')} 截止 ${esc(s.deadline)}</span>` : ''}
          <span>${s.anonymous ? '匿名问卷' : '记名问卷'}</span>
        </div>
        <div class="jl-actions">
          <button class="primary" data-sid-open="${s.id}">${icon('survey')} ${s.closed ? '查看问卷' : '进入问卷'}</button>
          <button class="ghost" data-sid-copy="${s.id}">${icon('copy')} 复制学生链接</button>
        </div>
      </div>`).join('')}
    ${items.length ? '' : `<div class="empty"><div class="big">${icon('survey')}</div>还没有发起过问卷<br>${canPost() ? '点「发起问卷」开始一次班级调研' : '班委发起问卷后会出现在这里'}</div>`}`;
  const newBtn = $('#btn-survey-new');
  if (newBtn) newBtn.addEventListener('click', () => openSurveyModal());
  $$('[data-sid-open]').forEach((b) => b.addEventListener('click', () => {
    state.survey = b.dataset.sidOpen;
    renderView().catch((e) => toast(e.message, 'error'));
  }));
  $$('[data-sid-copy]').forEach((b) => b.addEventListener('click', () => jlCopy(location.origin + '/s/' + b.dataset.sidCopy, '学生链接已复制，可发到班群')));
}

async function loadSurveyDetail() {
  if (!state.survey) return;
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  let d;
  try { d = await api('/api/survey/' + state.survey); }
  catch (e) {
    if (seq !== loadSeq) return;
    state.survey = null;
    toast(e.message, 'error');
    return loadSurveys();
  }
  if (seq !== loadSeq) return;
  const fmtTs = (ts) => {
    const dt = new Date(ts);
    const p2 = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
  };
  const canEdit = canPost();
  const stuLink = location.origin + '/s/' + d.id;
  
  // 渲染问题列表
  const questionsHtml = d.questions.map((q, idx) => `
    <div class="panel" style="margin-top:12px">
      <div class="jl-head"><h2 style="font-size:15px">${idx + 1}. ${esc(q.question)}${q.required ? ' <span class="q-required">*</span>' : ''}</h2>
        <span class="hint">${{single:'单选',multiple:'多选',rating:'评分',number:'数字',date:'日期',text:'文本题'}[q.qtype] || '单选'}</span></div>
      ${q.description ? `<div class="q-description">${esc(q.description)}</div>` : ''}
      ${q.qtype === 'single' ? q.options.map((opt) => `
        <label class="vopt"><input type="radio" name="q_${q.id}" value="${esc(opt)}"><span>${esc(opt)}</span></label>
      `).join('') : ''}
      ${q.qtype === 'multiple' ? q.options.map((opt) => `
        <label class="vopt"><input type="checkbox" name="q_${q.id}" value="${esc(opt)}"><span>${esc(opt)}</span></label>
      `).join('') : ''}
      ${q.qtype === 'rating' ? q.options.map((opt) => `
        <label class="vopt"><input type="radio" name="q_${q.id}" value="${esc(opt)}"><span>${esc(opt)}</span></label>
      `).join('') : ''}
      ${q.qtype === 'number' ? `<input type="number" id="ans_${q.id}" placeholder="请输入数字" style="width:100%;margin-top:8px">` : ''}
      ${q.qtype === 'date' ? `<input type="date" id="ans_${q.id}" style="width:100%;margin-top:8px">` : ''}
      ${q.qtype === 'text' ? `<textarea id="ans_${q.id}" placeholder="请输入你的回答" style="width:100%;min-height:80px;margin-top:8px"></textarea>` : ''}
    </div>
  `).join('');

  // 根据权限显示不同内容
  let resultsHtml = '';
  if (d.responses) {
    // 管理员：先给统计图（与班委视图同一套 tally 基元，从提交明细实时算），
    // 再跟逐人明细——此前管理员只有文字明细，看不出整体分布
    const n = d.responses.length;
    const statFor = (q) => {
      if (q.qtype === 'single' || q.qtype === 'multiple') {
        const counts = {};
        q.options.forEach((o) => { counts[o] = 0; });
        d.responses.forEach((r) => {
          const a = r.answers[String(q.id)];
          (Array.isArray(a) ? a : [a]).forEach((x) => { if (x && counts[x] !== undefined) counts[x]++; });
        });
        return { type: 'bars', counts };
      }
      if (q.qtype === 'rating') {
        const counts = {};
        q.options.forEach((o) => { counts[o] = 0; });
        let sum = 0, cnt = 0;
        d.responses.forEach((r) => {
          const a = r.answers[String(q.id)];
          if (a && counts[a] !== undefined) { counts[a]++; sum += Number(a); cnt++; }
        });
        return { type: 'bars', counts, avg: cnt ? (sum / cnt).toFixed(1) : null };
      }
      return { type: 'list' };
    };
    const bars = (s) => Object.entries(s.counts).map(([opt, count]) => {
      const pct = n ? Math.round(count / n * 100) : 0;
      return `<div class="tally-row"><div class="tlabel"><b>${esc(opt)}</b><span class="hint">${count} 票 · ${pct}%</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    const chartHtml = `
      <div class="panel" style="margin-top:16px">
        <div class="jl-head"><h2 style="font-size:15px">统计图（${n} 份）</h2>
          <span class="hint">自动汇总；逐人原文见下方明细</span></div>
        ${n ? d.questions.map((q) => {
          const s = statFor(q);
          if (s.type === 'list') return ''; // 文本题无分布可言，原文在下方明细逐条列
          const avg = s.avg != null ? ` <span class="hint">平均 ${s.avg} 分</span>` : '';
          return `<div class="item-group"><b>${esc(q.question)}</b>${avg}${bars(s)}</div>`;
        }).join('') : '<div class="hint">还没有人提交</div>'}
      </div>`;
    resultsHtml = chartHtml + `
      <div class="panel" style="margin-top:16px">
        <div class="jl-head"><h2 style="font-size:15px">回答明细（${n} 份）</h2>
          <span class="hint">按提交时间排列</span></div>
        ${d.responses.map((r, i) => `
          <div class="item-group">
            <b>${i + 1}. ${r.name ? `${esc(r.name)}（${esc(r.sid)}）` : '<span class="hint">匿名提交（未匹配到名单）</span>'}<span class="hint" style="margin-left:8px">${fmtTs(r.submitted_at)}</span></b>
            ${d.questions.map((q) => {
              const ans = r.answers[String(q.id)];
              const ansText = Array.isArray(ans) ? ans.join('、') : (ans || '未回答');
              return `<div class="entry-sub">${esc(q.question)}：${esc(ansText)}</div>`;
            }).join('')}
          </div>
        `).join('')}
      </div>`;
  } else if (d.stats) {
    // 班委：显示统计汇总
    resultsHtml = `
      <div class="panel" style="margin-top:16px">
        <div class="jl-head"><h2 style="font-size:15px">统计汇总</h2>
          <span class="hint">班委视角，不含个人明细</span></div>
        ${d.questions.map((q) => {
          const stat = d.stats[String(q.id)];
          if (q.qtype === 'text' || q.qtype === 'number' || q.qtype === 'date') {
            // 文本/数字/日期题：服务端返回的是回答值数组，按列表展示
            // （此前 number/date 落进选择题分支，把数组下标当选项名渲染出错乱条）
            return `<div class="item-group">
              <b>${esc(q.question)}</b>
              ${(stat || []).map((ans, i) => `<div class="entry-sub">${i + 1}. ${esc(ans)}</div>`).join('')}
              ${(!stat || !stat.length) ? '<div class="entry-sub hint">暂无回答</div>' : ''}
            </div>`;
          } else {
            // 选择题：与投票详情同一套票数条（堆叠标签 + 共享 .bar 基元）；评分题加平均分
            const total = Object.values(stat || {}).reduce((a, b) => a + b, 0);
            let avgTag = '';
            if (q.qtype === 'rating' && total) {
              const sum = Object.entries(stat || {}).reduce((a, [opt, count]) => a + Number(opt) * count, 0);
              avgTag = ` <span class="hint">平均 ${(sum / total).toFixed(1)} 分</span>`;
            }
            return `<div class="item-group">
              <b>${esc(q.question)}</b>${avgTag}
              ${Object.entries(stat || {}).map(([opt, count]) => {
                const pct = total ? Math.round(count / total * 100) : 0;
                return `<div class="tally-row"><div class="tlabel"><b>${esc(opt)}</b><span class="hint">${count} 票 · ${pct}%</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
              }).join('')}
            </div>`;
          }
        }).join('')}
      </div>`;
  } else if (d.myAnswers) {
    // 学生：显示自己的回答
    resultsHtml = `
      <div class="panel" style="margin-top:16px">
        <div class="jl-head"><h2 style="font-size:15px">我的回答</h2>
          <span class="hint">你已提交的答案</span></div>
        ${d.questions.map((q) => {
          const ans = d.myAnswers[String(q.id)];
          const ansText = Array.isArray(ans) ? ans.join('、') : (ans || '未回答');
          return `<div class="item-group">
            <b>${esc(q.question)}</b>
            <div class="entry-sub">${esc(ansText)}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  view.innerHTML = `
    <button class="ghost jl-back" id="btn-survey-back">← 返回问卷列表</button>
    <div class="panel">
      <div class="jl-head"><h2>${esc(d.title)}</h2>
        <span class="jl-badge ${d.closed ? 'off' : 'on'}">${d.closed ? '已截止' : '收集中'}</span>
        ${d.anonymous ? '<span class="jl-badge off">匿名</span>' : ''}</div>
      ${d.description ? `<p class="jl-desc">${esc(d.description)}</p>` : ''}
      <div class="jl-meta">
        <span>已填 <b>${d.done}</b> / ${d.rosterSize} 人</span>
        ${d.deadline ? `<span>${icon('clock')} 截止 ${esc(d.deadline)}</span>` : ''}
        <span>${d.anonymous ? '匿名问卷（不收集学号和姓名）' : '记名问卷'}</span>
      </div>
      ${canEdit ? `<div class="jl-actions">
        ${!d.closed ? `<button class="ghost" id="btn-survey-stop">${icon('stop')} 停止问卷</button>` : ''}
        <button class="ghost" id="btn-survey-settings">${icon('edit')} 修改设置</button>
        <button class="ghost" id="btn-survey-export">${icon('download')} 导出CSV</button>
        <button class="ghost danger" id="btn-survey-delete">${icon('trash')} 删除问卷</button>
      </div>` : ''}
      <div class="jl-linkrow"><input readonly value="${esc(stuLink)}"><button class="ghost" id="btn-copy-stu-link">${icon('link')} 复制学生链接</button></div>
    </div>
    ${!d.closed ? questionsHtml : ''}
    ${!d.closed ? `
      <div class="panel" style="margin-top:12px">
        <div class="jl-head"><h2 style="font-size:15px">${d.filled ? '修改答案' : '提交答案'}</h2></div>
        <div class="jl-actions">
          <button class="primary" id="btn-survey-submit">${icon('check')} ${d.filled ? '保存修改' : '提交问卷'}</button>
          <span class="hint">共 ${d.questions.length} 题，必填 ${d.questions.filter(q => q.required).length} 题${d.filled ? '，截止前可改，以最新答案为准' : ''}</span>
        </div>
        <div id="survey-progress" class="panel" style="margin-top:12px;padding:12px;display:none">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:14px;font-weight:600">答题进度</span>
            <span id="progress-text" class="hint">0 / ${d.questions.length}</span>
          </div>
          <div class="bar" style="height:8px">
            <i id="progress-bar" style="width:0%"></i>
          </div>
          <div id="progress-detail" class="entry-sub hint" style="margin-left:0;font-size:12px"></div>
        </div>
      </div>
    ` : ''}
    ${d.closed ? '<div class="panel" style="margin-top:12px"><div class="hint">问卷已截止，无法提交。</div></div>' : ''}
    ${resultsHtml}`;

  // 事件绑定
  const backBtn = $('#btn-survey-back');
  if (backBtn) backBtn.addEventListener('click', () => { state.survey = null; renderView(); });

  const copyBtn = $('#btn-copy-stu-link');
  if (copyBtn) copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(stuLink); toast('链接已复制'); });

  const exportBtn = $('#btn-survey-export');
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    try {
      // 不查 r.ok 的话，401/500 的 JSON 错误体也会被存成 .csv 还提示成功
      const r = await fetch('/api/survey/' + d.id + '/export');
      if (!r.ok) {
        let msg = '导出失败（' + r.status + '）';
        try { const j = await r.json(); if (j.error) msg = j.error; } catch (e) { /* 非 JSON 就用默认文案 */ }
        throw new Error(msg);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${d.title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast('导出成功');
    } catch (e) { toast('导出失败：' + e.message, 'error'); }
  });

  const stopBtn = $('#btn-survey-stop');
  if (stopBtn) stopBtn.addEventListener('click', async () => {
    if (!confirm('确定要停止此问卷吗？停止后不能再提交。')) return;
    try {
      await api('/api/survey/' + d.id + '/stop', { method: 'POST' });
      toast('问卷已停止');
      renderView();
    } catch (e) { toast(e.message, 'error'); }
  });

  // 修改设置：标题/说明/截止时间随时可改（顺延截止时间会自动重新开放收集）；
  // 已有提交时题目锁定，弹窗里如实说明
  const settingsBtn = $('#btn-survey-settings');
  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    openModal(`
      <h2>${icon('edit')} 修改问卷设置</h2>
      <div class="form">
        <label>标题</label>
        <input id="sv-e-title" maxlength="80" value="${esc(d.title)}">
        <label>说明（选填）</label>
        <textarea id="sv-e-desc" rows="2" maxlength="1000">${esc(d.description || '')}</textarea>
        <label>截止时间（留空 = 不设截止）</label>
        <input id="sv-e-deadline" type="datetime-local" value="${dtToVal(d.deadline)}">
        <label class="splitline" style="margin-top:8px"><input type="checkbox" id="sv-e-anon" ${d.anonymous ? 'checked' : ''}> 匿名收集（不记录提交人身份）</label>
        <p class="hint" style="margin:6px 0 0">切换只影响之后的提交：转记名后管理员可看到提交人；匿名期已收的历史提交不与身份关联（系统不做回溯识别）。${d.done ? `当前已有 ${d.done} 份匿名期提交。` : ''}</p>
        ${d.done ? `<p class="hint" style="margin-top:8px">已有 ${d.done} 份提交：题目不能再改，只能调整标题/说明/截止时间。顺延截止时间后问卷会重新开放收集。</p>` : ''}
      </div>
      <div class="modal-foot">
        <button class="ghost" id="btn-cancel">取消</button>
        <button class="primary" id="sv-e-save">${icon('check')} 保存修改</button>
      </div>`);
    $('#sv-e-save').addEventListener('click', async () => {
      const title = $('#sv-e-title').value.trim();
      if (!title) { toast('标题不能为空', 'error'); return; }
      try {
        await api('/api/survey/' + d.id, { method: 'PUT', body: {
          title,
          description: $('#sv-e-desc').value.trim(),
          deadline: valToDt($('#sv-e-deadline').value) || '',
          anonymous: $('#sv-e-anon').checked,
        } });
        closeModal();
        toast('修改已保存');
        renderView();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  // 删除问卷：连带全部提交，仅管理员与班委可操作（API 侧同权限），二次确认写明份数
  const delSurveyBtn = $('#btn-survey-delete');
  if (delSurveyBtn) delSurveyBtn.addEventListener('click', async () => {
    const n = d.done || 0;
    if (!confirm(`确定删除问卷「${d.title}」吗？${n ? `连同 ${n} 份提交` : ''}一起删除，不可恢复！`)) return;
    try {
      await api('/api/survey/' + d.id, { method: 'DELETE' });
      toast('问卷已删除');
      state.survey = null;
      renderView();
    } catch (e) { toast(e.message, 'error'); }
  });

  // 进度更新函数
  const progressContainer = $('#survey-progress');
  const progressBar = $('#progress-bar');
  const progressText = $('#progress-text');
  const progressDetail = $('#progress-detail');
  
  function updateProgress() {
    if (!progressContainer) return;
    
    let answered = 0;
    let requiredAnswered = 0;
    const totalRequired = d.questions.filter(q => q.required).length;
    
    for (const q of d.questions) {
      let isAnswered = false;
      if (['text', 'number', 'date'].includes(q.qtype)) {
        const val = $(`#ans_${q.id}`)?.value.trim();
        isAnswered = !!val;
      } else {
        const checked = view.querySelectorAll(`input[name="q_${q.id}"]:checked`);
        isAnswered = checked.length > 0;
      }
      
      if (isAnswered) {
        answered++;
        if (q.required) requiredAnswered++;
      }
    }
    
    const percent = d.questions.length > 0 ? Math.round((answered / d.questions.length) * 100) : 0;
    progressBar.style.width = percent + '%';
    progressText.textContent = `${answered} / ${d.questions.length}`;
    
    const requiredPercent = totalRequired > 0 ? Math.round((requiredAnswered / totalRequired) * 100) : 100;
    progressDetail.innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <span>总进度：${percent}%</span>
        <span>必填题：${requiredAnswered}/${totalRequired}（${requiredPercent}%）</span>
        ${requiredAnswered === totalRequired && answered === d.questions.length 
          ? '<span style="color:var(--success);font-weight:600">✓ 全部完成</span>' 
          : ''}
      </div>
    `;
  }
  
  // 显示进度条并监听输入变化
  if (progressContainer) {
    progressContainer.style.display = 'block';
    updateProgress();

    // 监听所有输入框的变化（数字/日期输入框也要算，否则进度条不动）
    view.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(el => {
      el.addEventListener('change', updateProgress);
    });
    view.querySelectorAll('textarea, input[type="number"], input[type="date"]').forEach(el => {
      el.addEventListener('input', updateProgress);
    });
  }

  // 已提交过：预填本人答案，改完点「保存修改」整份覆盖（服务端按本人更新）
  if (d.filled && d.myAnswers) {
    for (const q of d.questions) {
      const ans = d.myAnswers[String(q.id)];
      if (ans == null) continue;
      if (['single', 'rating'].includes(q.qtype)) {
        const el = view.querySelector(`input[name="q_${q.id}"][value="${CSS.escape(String(ans))}"]`);
        if (el) el.checked = true;
      } else if (q.qtype === 'multiple' && Array.isArray(ans)) {
        for (const val of ans) {
          const el = view.querySelector(`input[name="q_${q.id}"][value="${CSS.escape(String(val))}"]`);
          if (el) el.checked = true;
        }
      } else {
        const el = $(`#ans_${q.id}`);
        if (el) el.value = ans;
      }
    }
    updateProgress();
  }

  const submitBtn = $('#btn-survey-submit');
  if (submitBtn) submitBtn.addEventListener('click', async () => {
    const answers = {};
    for (const q of d.questions) {
      if (['single', 'multiple', 'rating'].includes(q.qtype)) {
        const checked = Array.from(view.querySelectorAll(`input[name="q_${q.id}"]:checked`)).map(el => el.value);
        if (q.required && !checked.length) { toast(`问题"${q.question}"为必填`, 'error'); return; }
        answers[String(q.id)] = q.qtype === 'single' || q.qtype === 'rating' ? checked[0] : checked;
      } else if (q.qtype === 'number') {
        const val = $(`#ans_${q.id}`).value.trim();
        if (q.required && !val) { toast(`问题"${q.question}"为必填`, 'error'); return; }
        if (val && isNaN(val)) { toast(`问题"${q.question}"必须为数字`, 'error'); return; }
        answers[String(q.id)] = val;
      } else if (q.qtype === 'date') {
        const val = $(`#ans_${q.id}`).value;
        if (q.required && !val) { toast(`问题"${q.question}"为必填`, 'error'); return; }
        answers[String(q.id)] = val;
      } else {
        // text
        const val = $(`#ans_${q.id}`).value.trim();
        if (q.required && !val) { toast(`问题"${q.question}"为必填`, 'error'); return; }
        answers[String(q.id)] = val;
      }
    }
    try {
      const r = await api('/api/survey/' + d.id + '/submit', { method: 'POST', body: { answers } });
      toast(r && r.updated ? '修改已保存' : '提交成功');
      renderView();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// 问卷模板管理
function openTemplateManager(onClose) {
  let templates = [];
  let editingId = null;

  async function loadList() {
    templates = await api('/api/survey-template');
    renderList();
  }

  function renderList() {
    const listEl = $('#tpl-list');
    if (!listEl) return;
    if (templates.length === 0) {
      listEl.innerHTML = '<div class="empty"><div class="big">' + icon('survey') + '</div>还没有模板<br>点「新建模板」创建第一个</div>';
      return;
    }
    listEl.innerHTML = templates.map((t) => `
      <div class="panel" style="margin-top:8px;padding:12px" data-tpl-id="${t.id}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <strong>${esc(t.name)}</strong>
            <span class="hint" style="margin-left:8px">${t.questions.length} 个问题</span>
            ${t.title ? `<div class="entry-sub" style="margin-left:0;font-size:12px">标题：${esc(t.title)}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px">
            <button class="mini ghost" data-tpl-edit="${t.id}">${icon('edit')} 编辑</button>
            <button class="mini danger" data-tpl-del="${t.id}">${icon('trash')} 删除</button>
          </div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-tpl-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openEditor(parseInt(btn.dataset.tplEdit)));
    });
    listEl.querySelectorAll('[data-tpl-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.tplDel);
        const t = templates.find((x) => x.id === id);
        if (!confirm(`确定删除模板「${t.name}」吗？`)) return;
        try {
          await api('/api/survey-template/' + id, { method: 'DELETE' });
          toast('已删除');
          loadList();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  function openEditor(id) {
    editingId = id;
    const t = id ? templates.find((x) => x.id === id) : { name: '', title: '', description: '', questions: [] };
    const editorEl = $('#tpl-editor');
    if (!editorEl) return;
    editorEl.style.display = 'block';
    editorEl.innerHTML = `
      <label>模板名称</label>
      <input id="tpl-edit-name" value="${esc(t.name)}" maxlength="40" placeholder="如：满意度调查">
      <div class="labrow" style="margin-top:8px"><label>默认标题（选填）</label></div>
      <input id="tpl-edit-title" value="${esc(t.title)}" maxlength="60" placeholder="套用模板时自动填入的问卷标题">
      <div class="labrow" style="margin-top:8px"><label>默认说明（选填）</label></div>
      <textarea id="tpl-edit-desc" rows="2" maxlength="1000" placeholder="套用模板时自动填入的问卷说明">${esc(t.description)}</textarea>
      <div class="labrow" style="margin-top:12px"><label>问题列表</label></div>
      <div id="tpl-edit-questions"></div>
      <button class="mini ghost" id="tpl-add-q" style="margin-top:8px">${icon('plus')} 添加问题</button>
      <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
        <button class="ghost" id="tpl-edit-cancel">取消</button>
        <button class="primary" id="tpl-edit-save">${icon('check')} 保存</button>
      </div>
    `;

    let questions = t.questions.map((q) => ({ ...q }));
    // 把 DOM 里的当前输入收回 questions 数组：删除/换题型/添加都会重渲染，先存再动
    function saveEdits() {
      const qEl = $('#tpl-edit-questions');
      if (!qEl) return;
      qEl.querySelectorAll('[data-q-text]').forEach((input) => {
        const idx = parseInt(input.dataset.qText);
        const q = questions[idx];
        if (!q) return;
        q.question = input.value.trim();
        const typeEl = qEl.querySelector(`[data-q-type="${idx}"]`);
        if (typeEl) q.qtype = typeEl.value;
        const reqEl = qEl.querySelector(`[data-q-req="${idx}"]`);
        if (reqEl) q.required = reqEl.checked;
        const optsEl = qEl.querySelector(`[data-q-opts="${idx}"]`);
        if (optsEl) q.options = optsEl.value.split('\n').map((o) => o.trim()).filter((o) => o);
      });
    }
    renderQuestions();

    function renderQuestions() {
      const qEl = $('#tpl-edit-questions');
      if (!qEl) return;
      if (questions.length === 0) {
        qEl.innerHTML = '<div class="hint">还没有问题，点「添加问题」开始</div>';
        return;
      }
      qEl.innerHTML = questions.map((q, idx) => `
        <div class="panel" style="margin-top:8px;padding:10px;background:#fafafa">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>问题 ${idx + 1}</strong>
            <button class="mini danger" data-q-del="${idx}">${icon('trash')}</button>
          </div>
          <input data-q-text="${idx}" value="${esc(q.question)}" maxlength="200" placeholder="问题内容">
          <div style="display:flex;gap:8px;margin-top:6px">
            <select data-q-type="${idx}" style="max-width:120px">
              <option value="single" ${q.qtype === 'single' ? 'selected' : ''}>单选</option>
              <option value="multiple" ${q.qtype === 'multiple' ? 'selected' : ''}>多选</option>
              <option value="rating" ${q.qtype === 'rating' ? 'selected' : ''}>评分</option>
              <option value="number" ${q.qtype === 'number' ? 'selected' : ''}>数字</option>
              <option value="date" ${q.qtype === 'date' ? 'selected' : ''}>日期</option>
              <option value="text" ${q.qtype === 'text' ? 'selected' : ''}>文本</option>
            </select>
            <label class="splitline" style="margin:0"><input type="checkbox" data-q-req="${idx}" ${q.required ? 'checked' : ''}> 必填</label>
          </div>
          ${['single', 'multiple', 'rating'].includes(q.qtype) ? `
            <textarea data-q-opts="${idx}" rows="2" style="margin-top:6px" placeholder="选项（每行一个）">${esc((q.options || []).join('\n'))}</textarea>
          ` : ''}
        </div>
      `).join('');

      qEl.querySelectorAll('[data-q-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          saveEdits();
          questions.splice(parseInt(btn.dataset.qDel), 1);
          renderQuestions();
        });
      });
      // 换题型要立刻重渲染：单选/多选/评分才有选项框，切到数字/日期要收掉、
      // 切回来要补上（此前不重渲染，改完题型保存会被「至少 2 个选项」卡死或残留选项）
      qEl.querySelectorAll('[data-q-type]').forEach((sel) => {
        sel.addEventListener('change', () => {
          saveEdits();
          const idx = parseInt(sel.dataset.qType);
          if (questions[idx]) questions[idx].qtype = sel.value;
          renderQuestions();
        });
      });
    }

    $('#tpl-add-q').addEventListener('click', () => {
      saveEdits();
      questions.push({ question: '', qtype: 'single', options: ['选项1', '选项2'], required: true });
      renderQuestions();
    });

    $('#tpl-edit-cancel').addEventListener('click', () => {
      editorEl.style.display = 'none';
      editingId = null;
    });

    $('#tpl-edit-save').addEventListener('click', async () => {
      const name = $('#tpl-edit-name').value.trim();
      if (!name) { toast('请填写模板名称', 'error'); return; }
      const title = $('#tpl-edit-title').value.trim();
      const description = $('#tpl-edit-desc').value.trim();

      // 收集问题：先收回 DOM 输入再校验（与删除/换题型/添加同一份收集逻辑）
      saveEdits();
      const qData = questions.filter((q) => q.question);

      if (qData.length === 0) { toast('至少需要一个问题', 'error'); return; }
      for (const q of qData) {
        if (['single', 'multiple', 'rating'].includes(q.qtype) && (!q.options || q.options.length < 2)) {
          toast(`问题「${q.question.slice(0, 20)}」至少需要 2 个选项`, 'error');
          return;
        }
      }

      const body = { name, title, description, questions: qData };
      try {
        if (editingId) {
          await api('/api/survey-template/' + editingId, { method: 'PUT', body });
          toast('模板已更新');
        } else {
          await api('/api/survey-template', { method: 'POST', body });
          toast('模板已创建');
        }
        editorEl.style.display = 'none';
        editingId = null;
        loadList();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  openModal(`
    <h2>${icon('settings')} 管理问卷模板</h2>
    <div class="form">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span class="hint" style="margin:0">发起问卷时可直接套用这里的模板；管理员和班委都能增删改</span>
        <button class="mini ghost" id="tpl-new">${icon('plus')} 新建模板</button>
      </div>
      <div id="tpl-list"></div>
      <div id="tpl-editor" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid var(--line)"></div>
    </div>
    <div class="modal-foot">
      <button class="primary" id="btn-close">完成</button>
    </div>
  `);

  $('#tpl-new').addEventListener('click', () => openEditor(null));
  $('#btn-close').addEventListener('click', () => {
    closeModal();
    if (onClose) onClose();
  });

  loadList();
}

function openSurveyModal(initial = null) {
  // initial：从「管理模板」回来时带回的草稿快照（openModal 单容器，模板管理会顶掉发起弹窗）
  let questionCount = initial && Array.isArray(initial.questions) ? initial.questions.length : 0;
  const questions = initial && Array.isArray(initial.questions)
    ? initial.questions.map((q) => ({ ...q, options: Array.isArray(q.options) ? [...q.options] : q.options }))
    : [];
  let templates = []; // 从 API 加载

  // 加载模板列表
  async function loadTemplates() {
    try {
      templates = await api('/api/survey-template');
      const sel = $('#sv-template');
      if (sel) {
        sel.innerHTML = '<option value="">— 从模板创建 —</option>' +
          templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('');
      }
    } catch (e) {
      console.error('加载模板失败:', e);
    }
  }

  function renderQuestions() {
    return questions.map((q, idx) => `
      <div class="panel" data-q-idx="${idx}" draggable="true" style="margin-top:8px;padding:12px;background:#fafafa;cursor:move;position:relative">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="hint" style="cursor:grab;font-size:16px" title="拖拽排序">⋮⋮</span>
            <h3 style="font-size:14px;margin:0">问题 ${idx + 1}</h3>
          </div>
          <button class="mini danger" data-q-del="${idx}">${icon('trash')} 删除</button>
        </div>
        <label>问题内容</label>
        <input data-q-text="${idx}" value="${esc(q.question)}" maxlength="200" placeholder="请输入问题">
        <div class="labrow" style="margin-top:8px"><label>问题描述（选填，帮助学生理解题目）</label></div>
        <textarea data-q-desc="${idx}" rows="2" maxlength="500" placeholder="补充说明，如：可多选、限选几项、填写要求等…">${esc(q.description || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <select data-q-type="${idx}" style="max-width:160px">
            <option value="single" ${q.qtype === 'single' ? 'selected' : ''}>单选题</option>
            <option value="multiple" ${q.qtype === 'multiple' ? 'selected' : ''}>多选题</option>
            <option value="rating" ${q.qtype === 'rating' ? 'selected' : ''}>评分题</option>
            <option value="number" ${q.qtype === 'number' ? 'selected' : ''}>数字题</option>
            <option value="date" ${q.qtype === 'date' ? 'selected' : ''}>日期题</option>
            <option value="text" ${q.qtype === 'text' ? 'selected' : ''}>文本题</option>
          </select>
          <label class="splitline" style="margin:0"><input type="checkbox" data-q-req="${idx}" ${q.required ? 'checked' : ''}> 必填</label>
        </div>
        ${['single', 'multiple', 'rating'].includes(q.qtype) ? `
          <div class="labrow" style="margin-top:8px"><label>选项（每行一个，至少 2 个）</label></div>
          <textarea data-q-opts="${idx}" rows="3" placeholder="选项1&#10;选项2&#10;选项3">${esc(q.options ? q.options.join('\n') : '')}</textarea>
        ` : ''}
      </div>
    `).join('');
  }

  openModal(`
    <h2>${icon('survey')} 发起问卷</h2>
    <div class="form">
      <label>问卷标题</label>
      <input id="sv-title" maxlength="60" placeholder="如：班级活动意向调查">
      <label>问卷说明（选填）</label>
      <textarea id="sv-desc" rows="2" maxlength="1000" placeholder="问卷背景、填写说明等…"></textarea>
      ${rosterFields({ prefix: 'sv', label: '答题名单（只有名单内的同学可以提交）' })}
      <label>截止时间（选填，到点自动结束）</label>
      <input id="sv-deadline" type="datetime-local">
      <label class="splitline" style="margin-top:12px"><input type="checkbox" id="sv-anonymous"> 匿名收集（回答不署名，同学之间互不可见）</label>
      <p class="hint" style="margin:6px 0 0">不勾 = 记名：每份回答直接带上姓名学号。勾选 = 匿名：回答不署名、同学之间互不可见；管理员仍可按名单核对每份回答是谁填的——适合想听真话、又需要跟进到人的摸底。</p>
      
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h3 id="sv-q-count" style="font-size:15px;margin:0">问题列表（${questionCount} 题）</h3>
          <div style="display:flex;gap:8px">
            <select id="sv-template" style="max-width:200px;font-size:13px">
              <option value="">— 从模板创建 —</option>
            </select>
            <button class="mini ghost" id="sv-manage-tpl" title="管理问卷模板">${icon('settings')} 管理模板</button>
            <button class="mini ghost" id="sv-add-q">${icon('plus')} 添加问题</button>
          </div>
        </div>
        <div id="sv-questions-list">${renderQuestions()}</div>
        ${questionCount === 0 ? '<div class="empty" style="margin-top:8px"><div class="big">' + icon('survey') + '</div>还没有添加问题<br>点「添加问题」自己写，或从上面的模板套一份</div>' : ''}
      </div>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="sv-save">${icon('check')} 发起问卷</button>
    </div>`);

  bindRosterFields({
    prefix: 'sv', mode: 'ref', sidFor: '提交',
    applyRoster: (r) => { if (r && r.refOnly) return; $('#sv-roster').value = r.roster; $('#sv-keepid').checked = !!r.keepId; },
  });

  // 加载模板列表
  loadTemplates();

  // 回填草稿（从模板管理回来时）
  if (initial) {
    $('#sv-title').value = initial.title || '';
    $('#sv-desc').value = initial.description || '';
    if (initial.deadline) $('#sv-deadline').value = initial.deadline;
    if (initial.anonymous) $('#sv-anonymous').checked = true;
    if (initial.rosterRaw) $('#sv-roster').value = initial.rosterRaw;
    if (initial.keepId) $('#sv-keepid').checked = true;
  }

  // 管理模板：openModal 单容器会顶掉本弹窗——先快照草稿，关闭后带着草稿原样重建
  $('#sv-manage-tpl').addEventListener('click', () => {
    saveCurrentInputs();
    const draft = {
      title: $('#sv-title').value,
      description: $('#sv-desc').value,
      deadline: $('#sv-deadline').value,
      anonymous: $('#sv-anonymous').checked,
      rosterRaw: $('#sv-roster') ? $('#sv-roster').value : '',
      keepId: $('#sv-keepid') ? $('#sv-keepid').checked : false,
      questions: questions.map((q) => ({ ...q, options: Array.isArray(q.options) ? [...q.options] : q.options })),
    };
    openTemplateManager(() => {
      // 关闭模板管理后带着草稿重建发起弹窗（模板列表在弹窗内重新加载）
      openSurveyModal(draft);
    });
  });

  // 添加问题
  $('#sv-add-q').addEventListener('click', () => {
    questions.push({ question: '', qtype: 'single', options: ['选项1', '选项2'], required: true });
    questionCount++;
    refreshModalContent();
  });

  // 从模板创建
  $('#sv-template').addEventListener('change', (e) => {
    const idx = e.target.value;
    if (idx === '') return;
    const template = templates[parseInt(idx)];
    if (!template) return;
    if (questions.length > 0 && !confirm('使用模板将覆盖当前所有问题，确定继续吗？')) {
      e.target.value = '';
      return;
    }
    // 应用模板
    $('#sv-title').value = template.title;
    $('#sv-desc').value = template.description;
    questions.length = 0;
    template.questions.forEach((q) => {
      questions.push({ ...q, description: q.description || '' });
    });
    questionCount = questions.length;
    refreshModalContent();
    e.target.value = '';
    toast('已从模板创建 ' + questionCount + ' 个问题');
  });

  // 保存当前输入框的值到 questions 数组（openModal 的结构是 .backdrop > .modal，没有 .modal-body）
  function saveCurrentInputs() {
    const modalBody = document.querySelector('#modal-root .modal');
    if (!modalBody) return;
    
    modalBody.querySelectorAll('[data-q-text]').forEach((input) => {
      const idx = parseInt(input.dataset.qText);
      if (questions[idx]) questions[idx].question = input.value;
    });
    modalBody.querySelectorAll('[data-q-desc]').forEach((textarea) => {
      const idx = parseInt(textarea.dataset.qDesc);
      if (questions[idx]) questions[idx].description = textarea.value;
    });
    modalBody.querySelectorAll('[data-q-opts]').forEach((textarea) => {
      const idx = parseInt(textarea.dataset.qOpts);
      if (questions[idx]) questions[idx].options = textarea.value.split('\n').map(o => o.trim()).filter(o => o);
    });
    modalBody.querySelectorAll('[data-q-req]').forEach((checkbox) => {
      const idx = parseInt(checkbox.dataset.qReq);
      if (questions[idx]) questions[idx].required = checkbox.checked;
    });
  }

  // 刷新弹窗内容
  function refreshModalContent() {
    // 先保存当前输入值到 questions 数组
    saveCurrentInputs();
    
    const listEl = $('#sv-questions-list');
    if (listEl) {
      listEl.innerHTML = renderQuestions();
      // 重新绑定事件
      listEl.querySelectorAll('[data-q-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          saveCurrentInputs(); // 保存当前输入
          const idx = parseInt(btn.dataset.qDel);
          questions.splice(idx, 1);
          questionCount--;
          refreshModalContent();
        });
      });
      listEl.querySelectorAll('[data-q-type]').forEach((sel) => {
        sel.addEventListener('change', () => {
          saveCurrentInputs(); // 保存当前输入
          const idx = parseInt(sel.dataset.qType);
          questions[idx].qtype = sel.value;
          refreshModalContent();
        });
      });
      // 绑定输入框的实时保存
      listEl.querySelectorAll('[data-q-text]').forEach((input) => {
        input.addEventListener('input', () => {
          const idx = parseInt(input.dataset.qText);
          questions[idx].question = input.value;
        });
      });
      listEl.querySelectorAll('[data-q-desc]').forEach((textarea) => {
        textarea.addEventListener('input', () => {
          const idx = parseInt(textarea.dataset.qDesc);
          questions[idx].description = textarea.value;
        });
      });
      listEl.querySelectorAll('[data-q-opts]').forEach((textarea) => {
        textarea.addEventListener('input', () => {
          const idx = parseInt(textarea.dataset.qOpts);
          questions[idx].options = textarea.value.split('\n').map(o => o.trim()).filter(o => o);
        });
      });
      listEl.querySelectorAll('[data-q-req]').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          const idx = parseInt(checkbox.dataset.qReq);
          questions[idx].required = checkbox.checked;
        });
      });
      
      // 拖拽排序事件
      let dragSrcEl = null;
      listEl.querySelectorAll('[data-q-idx]').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
          dragSrcEl = card;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.dataset.qIdx);
          setTimeout(() => card.style.opacity = '0.4', 0);
        });
        
        card.addEventListener('dragend', () => {
          card.style.opacity = '1';
          listEl.querySelectorAll('[data-q-idx]').forEach((c) => c.classList.remove('drop-above', 'drop-below'));
        });
        
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = card.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          listEl.querySelectorAll('[data-q-idx]').forEach((c) => c.classList.remove('drop-above', 'drop-below'));
          if (e.clientY < midY) card.classList.add('drop-above');
          else card.classList.add('drop-below');
        });
        
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dragSrcEl || dragSrcEl === card) return;

          // 先把 DOM 里的当前输入收进数组再移动：splice 之后 DOM 与数组下标错位，
          // refreshModalContent 里再 saveCurrentInputs 会把题面/选项写到别的题上
          saveCurrentInputs();
          const fromIdx = parseInt(dragSrcEl.dataset.qIdx);
          const toIdx = parseInt(card.dataset.qIdx);
          const rect = card.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          let insertIdx = e.clientY < midY ? toIdx : toIdx + 1;

          if (fromIdx < insertIdx) insertIdx--;

          const [moved] = questions.splice(fromIdx, 1);
          questions.splice(insertIdx, 0, moved);

          refreshModalContent();
        });
      });
    }
    // 更新计数
    const countEl = document.querySelector('#sv-q-count'); // #sv-add-q 的父级是按钮排，h3 在外层，原先按 parentElement 永远找不到
    if (countEl) countEl.textContent = `问题列表（${questionCount} 题）`;
  }

  // 保存问卷
  $('#sv-save').addEventListener('click', async () => {
    const title = $('#sv-title').value.trim();
    if (!title) { toast('请填写问卷标题', 'error'); return; }
    
    const ros = readRoster('sv', 'ref');
    if (!ros.libId && !ros.raw.trim()) { toast('请设置答题名单', 'error'); return; }

    // 先把 DOM 里的当前输入收回 questions 数组再校验：选项框只有选择题才渲染，
    // 按 NodeList 位置对位会在数字/日期题上取错甚至取到 undefined
    saveCurrentInputs();
    if (questions.length === 0) { toast('请至少添加一个问题', 'error'); return; }
    if (questions.length > 50) { toast('最多支持 50 个问题', 'error'); return; }

    const questionsData = [];
    for (let i = 0; i < questions.length; i++) {
      const item = questions[i];
      const question = String(item.question || '').trim();
      if (!question) { toast(`问题 ${i + 1} 的内容不能为空`, 'error'); return; }

      const qtype = item.qtype;
      let options = [];
      if (['single', 'multiple', 'rating'].includes(qtype)) {
        options = (item.options || []).map((o) => String(o).trim()).filter((o) => o);
        if (options.length < 2) { toast(`问题 ${i + 1} 至少需要 2 个选项`, 'error'); return; }
      }

      questionsData.push({ question, description: String(item.description || '').trim(), qtype, options, required: !!item.required });
    }

    try {
      const body = {
        title,
        description: $('#sv-desc').value.trim(),
        deadline: valToDt($('#sv-deadline').value),
        rosterId: ros.libId || null,
        rosterRaw: ros.raw,
        keepId: ros.keepId,
        anonymous: $('#sv-anonymous').checked,
        questions: questionsData
      };
      await api('/api/survey', { method: 'POST', body });
      closeModal();
      toast('问卷已发起', 'success');
      loadSurveys();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

async function loadBirthdays() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/birthdays');
  if (seq !== loadSeq) return;
  const wishes = {};
  const wishOf = (m) => { if (!wishes[m.id]) wishes[m.id] = bdWish(m); return wishes[m.id]; };
  const wk = (dateStr) => '周' + '日一二三四五六'[new Date(dateStr + 'T00:00:00').getDay()];
  const dstr = (m) => m.nextDate ? m.nextDate.slice(5, 10).replace('-', '/') : `${m.month}/${String(m.day).padStart(2, '0')}`;
  const admin = isSysAdmin();

  const todayCards = data.today.map((m) => `
    <div class="bd-hero">
      ${data.hasBadge ? `<div class="bd-mark" style="background-image:url('/api/class-badge?r=${Date.now()}')"></div>` : ''}
      <div class="bd-cake">🎂</div>
      <div class="bd-kicker">今 天 过 生 日 · ${m.month} 月 ${m.day} 日 · ${wk(m.nextDate.slice(0, 10))}</div>
      <div class="bd-name">${esc(m.name)}</div>
      ${m.turningAge != null ? `<div class="bd-badges"><span class="jl-badge on">将满 ${m.turningAge} 岁</span></div>` : ''}
      <div class="bd-wish">「${esc(wishOf(m))}」</div>
      <div class="bd-from">—— 全班同学 ——</div>
      <div class="bd-actions"><button class="ghost" data-bd-copy="${m.id}">${icon('copy')} 复制祝福发到班群</button></div>
    </div>`).join('');
  const nearest = data.items.find((x) => !x.pending && !x.isToday && x.daysUntil != null);
  const todayWrap = data.today.length
    ? `<div class="bd-todaygrid">${todayCards}</div>`
    : `<div class="bd-calm">${icon('birthday')} 今天没有寿星${nearest ? `，最近的是 <b>${esc(nearest.name)}</b>（${nearest.month} 月 ${nearest.day} 日，还有 ${nearest.daysUntil} 天）` : ''}，每一天都值得被温柔对待</div>`;

  // 倒计时列表：按月份分组，行式布局；7 天内高亮
  const upcoming = data.items.filter((m) => !m.isToday);
  let rows = '';
  let lastMonth = null;
  for (const m of upcoming) {
    if (m.month !== lastMonth) { lastMonth = m.month; rows += `<div class="bd-month">${m.month} 月</div>`; }
    const soon = !m.pending && m.daysUntil != null && m.daysUntil <= 7;
    const sub = m.pending ? '生日待填' : [m.turningAge != null ? '将满 ' + m.turningAge + ' 岁' : '', m.note ? esc(m.note) : ''].filter(Boolean).join(' · ');
    rows += `
      <div class="bd-row${soon ? ' soon' : ''}${m.pending ? ' pending' : ''}">
        <div class="bd-datebox">${m.pending ? '<span>—</span>' : `<b>${m.day}</b><span>${m.month} 月</span>`}</div>
        <div class="bd-who"><b>${esc(m.name)}</b><span>${sub || '&nbsp;'}</span></div>
        <div class="bd-count${soon ? ' hot' : ''}">${m.pending ? '待填' : m.daysUntil + ' 天后'}</div>
        ${admin ? `<div class="bd-acts"><button class="mini" data-bd-edit="${m.id}" title="编辑">${icon('edit')}</button><button class="mini danger" data-bd-del="${m.id}" title="删除">${icon('trash')}</button></div>` : ''}
      </div>`;
  }

  // 管理工具条：添加成员 / 名单导入 / 班徽背景，收进一行
  let adminBar = '';
  if (admin) {
    let lib = [];
    try { lib = (await api('/api/rosters')).items; } catch (e) { /* 忽略 */ }
    if (seq !== loadSeq) return; // 班级名单慢响应期间切走视图，不再覆盖
    adminBar = `
      <div class="jl-actions">
        <button class="primary" id="btn-bd-add">${icon('plus')} 添加成员</button>
        ${lib.length ? `
          <select id="bd-import-lib" class="bd-select">${lib.map((r) => `<option value="${r.id}">${esc(r.name)}（${r.count} 人）</option>`).join('')}</select>
          <button class="ghost" id="bd-import">${icon('download')} 导入名单</button>` : ''}
        <label class="ghost bd-upload">${icon('image')} 上传班徽<input id="bd-badge-file" type="file" accept="image/*" hidden></label>
        ${data.hasBadge ? '<button class="ghost" id="bd-badge-del">移除班徽</button>' : ''}
      </div>
      <p class="hint">${lib.length ? '导入名单后逐个补填生日即可；班徽作为祝福墙水印背景（半透明）。' : '先在「班级名单」保存名单，再从这里导入生日成员。'}</p>`;
  }

  view.innerHTML = `
    <div class="bd-page">
      <div class="jl-head"><h2>${icon('birthday')} 生日祝福</h2></div>
      <p class="hint">每一岁都值得庆祝，每一个人都值得被记得。生日当天这里会变成祝福墙，信息页和浏览器通知也会提醒。</p>
      ${todayWrap}
      <div class="panel">
        <div class="jl-head"><h3>${icon('birthday')} 生日倒计时（${upcoming.length} 人）</h3></div>
        ${upcoming.length ? `<div class="bd-list">${rows}</div>` : `<div class="empty"><div class="big">${icon('birthday')}</div>还没有成员${admin ? '，从下面导入名单开始' : ''}</div>`}
        ${adminBar}
      </div>
    </div>`;
  setNavBadge('birthday', data.todayCount, { bday: true });

  const addBtn = $('#btn-bd-add');
  if (addBtn) addBtn.addEventListener('click', () => openBdayModal(null));
  const badgeFile = $('#bd-badge-file');
  if (badgeFile) badgeFile.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('files', f, f.name);
    try {
      await api('/api/class-badge', { method: 'POST', body: fd });
      toast('班徽背景已上传 ✓');
      loadBirthdays();
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });
  const badgeDel = $('#bd-badge-del');
  if (badgeDel) badgeDel.addEventListener('click', async () => {
    if (!confirm('移除班徽背景？')) return;
    try { await api('/api/class-badge', { method: 'DELETE' }); toast('已移除'); loadBirthdays(); }
    catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-bd-copy]').forEach((copyBtn) => copyBtn.addEventListener('click', () => {
    const m = data.today.find((x) => String(x.id) === copyBtn.dataset.bdCopy);
    if (!m) return;
    jlCopy(`🎂 今天是 ${m.name} 的生日！${wishOf(m)}`, '祝福已复制，快发到班群吧');
  }));
  const importBtn = $('#bd-import');
  if (importBtn) importBtn.addEventListener('click', async () => {
    try {
      const r = await api('/api/birthdays/import', { method: 'POST', body: { rosterId: Number($('#bd-import-lib').value) } });
      toast(`导入 ${r.created} 人${r.skipped ? `、跳过 ${r.skipped} 人（已存在）` : ''} ✓`);
      loadBirthdays();
    } catch (e) { toast(e.message, 'error'); }
  });
  $$('[data-bd-edit]').forEach((b) => b.addEventListener('click', () => {
    const m = data.items.find((x) => String(x.id) === b.dataset.bdEdit);
    if (m) openBdayModal(m);
  }));
  $$('[data-bd-del]').forEach((b) => b.addEventListener('click', async () => {
    const m = data.items.find((x) => String(x.id) === b.dataset.bdDel);
    if (!m || !confirm(`删除「${m.name}」的生日记录？`)) return;
    try { await api('/api/birthdays/' + m.id, { method: 'DELETE' }); toast('已删除'); loadBirthdays(); }
    catch (e) { toast(e.message, 'error'); }
  }));
}

function openBdayModal(m) {
  openModal(`
    <h2>${m ? `${icon('edit')} 编辑成员` : `${icon('birthday')} 添加成员`}</h2>
    <div class="form">
      <label>姓名</label>
      <input id="bd-name" maxlength="60" value="${m ? esc(m.name) : ''}" placeholder="班级里的每一位成员">
      <div class="grid2">
        <div><label>生日月</label><input id="bd-month" type="number" min="1" max="12" value="${m ? m.month || '' : ''}" placeholder="1-12"></div>
        <div><label>生日日</label><input id="bd-day" type="number" min="1" max="31" value="${m ? m.day || '' : ''}" placeholder="1-31"></div>
        <div><label>出生年份（选填，填了会显示年龄）</label><input id="bd-year" type="number" min="1900" max="2100" value="${m && m.year ? m.year : ''}" placeholder="选填"></div>
      </div>
      <label>自定义祝福语（选填，留空则自动生成）</label>
      <textarea id="bd-note" rows="2" maxlength="200" placeholder="例如：生日快乐，蛋糕给你留最大的一块 🎂">${m ? esc(m.note || '') : ''}</textarea>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="bd-save">保存</button>
    </div>`);
  $('#bd-save').addEventListener('click', async () => {
    const body = {
      name: $('#bd-name').value.trim(),
      month: Number($('#bd-month').value) || 0,
      day: Number($('#bd-day').value) || 0,
      year: Number($('#bd-year').value) || 0,
      note: $('#bd-note').value.trim(),
    };
    if (!body.name) { toast('请填写姓名', 'error'); return; }
    if (!body.month || !body.day) { toast('请填写生日月和日', 'error'); return; }
    try {
      if (m) await api('/api/birthdays/' + m.id, { method: 'PUT', body });
      else await api('/api/birthdays', { method: 'POST', body });
      closeModal();
      toast('已保存 ✓');
      refreshBirthdaysToday();
      loadBirthdays();
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ========= 班费收支 ========= */
function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
async function loadFunds() {
  const seq = loadSeq;
  const view = $('#view');
  // 搜索框在 #view 内部，整页重绘会把它替换掉、焦点和光标跟着丢——记住焦点状态，渲染完还回去
  const hadSearchFocus = $('#fund-q') === document.activeElement;
  const caret = $('#fund-q') ? $('#fund-q').selectionStart : null;
  view.innerHTML = '<div class="loading">加载中…</div>';
  const p = new URLSearchParams();
  if (state.fund.type) p.set('type', state.fund.type);
  if (state.fund.q) p.set('q', state.fund.q);
  if (state.fund.from) p.set('from', state.fund.from);
  if (state.fund.to) p.set('to', state.fund.to);
  p.set('limit', '500');
  const data = await api('/api/funds?' + p);
  if (seq !== loadSeq) return;
  const s = data.summary;
  const isImg = (m) => /^image\/(png|jpeg|gif|webp|bmp)/.test(m || '');
  const fileChip = (r, a) => {
    const url = '/api/fund-attachments/' + a.id + '/file';
    const inner = isImg(a.mime)
      ? `<a class="fund-thumb" href="${url}" target="_blank" rel="noopener" title="${esc(a.orig_name)}"><img loading="lazy" src="${url}" alt="${esc(a.orig_name)}"></a>`
      : `<a class="fund-file" href="${url}" target="_blank" rel="noopener">${icon('paperclip')} ${esc(a.orig_name)}</a>`;
    const del = isSysAdmin() ? `<button class="fund-file-del" data-fatt-del="${a.id}" title="删除凭证">${icon('trash')}</button>` : '';
    return `<span class="fund-filewrap">${inner}${del}</span>`;
  };
  const rows = data.items.map((r) => {
    const files = r.attachments || [];
    const filesHtml = (isSysAdmin() || files.length)
      ? `<div class="fund-files">${files.map((a) => fileChip(r, a)).join('')}${isSysAdmin() ? `<label class="fund-upl">${icon('upload')} 上传凭证<input type="file" accept="image/*,.pdf" multiple hidden data-fund-upload="${r.id}"></label>` : ''}</div>` : '';
    return `<div class="fund-item">
      <div class="fund-row${isSysAdmin() ? ' has-acts' : ''}">
        <span class="fund-date">${esc(r.happened_at)}</span>
        <span class="fund-tag ${r.type}">${r.type === 'income' ? '收' : '支'}</span>
        <span class="fund-note" title="${esc(r.note || '')}">${esc(r.note || '')}${files.length ? ` <span class="fund-fcount">${icon('paperclip')}${files.length}</span>` : ''}</span>
        <span class="fund-amt ${r.type}">${r.type === 'income' ? '+' : '−'}¥${fmtMoney(r.amount)}</span>
        ${isSysAdmin() ? `<span class="fund-acts"><button class="mini" data-fund-edit="${r.id}" title="编辑">${icon('edit')}</button><button class="mini danger" data-fund-del="${r.id}" title="删除">${icon('trash')}</button></span>` : ''}
      </div>
      ${filesHtml}
    </div>`;
  }).join('');

  view.innerHTML = `
    <div class="fund-page">
      <div class="jl-head"><h2>${icon('fund')} 班费收支</h2></div>
      <p class="hint">记录班级班费的每一笔收入与支出，结余实时汇总，随时导出对账。透明公示，人人可看；记 / 改 / 删需管理员。</p>
      <div class="fund-sum">
        <div class="fund-card income"><span>收入合计</span><b>¥${fmtMoney(s.income)}</b></div>
        <div class="fund-card expense"><span>支出合计</span><b>¥${fmtMoney(s.expense)}</b></div>
        <div class="fund-card balance${s.balance < 0 ? ' neg' : ''}"><span>当前结余</span><b>¥${fmtMoney(s.balance)}</b></div>
      </div>
      <div class="fund-toolbar">
        <select id="fund-type" aria-label="按类型筛选">
          <option value="">全部类型</option>
          <option value="income"${state.fund.type === 'income' ? ' selected' : ''}>只看收入</option>
          <option value="expense"${state.fund.type === 'expense' ? ' selected' : ''}>只看支出</option>
        </select>
        <input id="fund-q" type="search" placeholder="搜索用途…" value="${esc(state.fund.q)}" aria-label="搜索班费记录">
        <input id="fund-from" type="date" value="${esc(state.fund.from)}" aria-label="起始日期" title="起始日期">
        <span class="fund-dash">→</span>
        <input id="fund-to" type="date" value="${esc(state.fund.to)}" aria-label="截止日期" title="截止日期">
        <button class="ghost" id="fund-export">${icon('download')} 导出 CSV</button>
        ${isSysAdmin() ? `<button class="primary" id="btn-fund-add">${icon('plus')} 记一笔</button>` : ''}
      </div>
      <div class="panel">
        <div class="jl-head" style="margin:0 0 6px"><h3 style="margin:0">${icon('fund')} 收支明细（${s.count} 笔${state.fund.type || state.fund.q || state.fund.from || state.fund.to ? '，已筛选' : ''}）</h3></div>
        ${rows || `<div class="empty"><div class="big">${icon('fund')}</div>还没有记账记录<br>${isSysAdmin() ? '点右上角「记一笔」，把第一笔班费收支记进来' : '管理员记录后会出现在这里'}</div>`}
      </div>
    </div>`;

  const bind = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  bind('#fund-type', 'change', (e) => { state.fund.type = e.target.value; renderView().catch(() => {}); });
  bind('#btn-fund-add', 'click', () => openFundModal(null));
  bind('#fund-export', 'click', () => window.open('/api/funds/export?' + p, '_blank'));
  let qt = null;
  bind('#fund-q', 'input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.fund.q = e.target.value.trim(); loadFunds().catch((x) => toast(x.message, 'error')); }, 350); });
  // 搜索触发的重绘把输入框换了个新元素，把焦点和光标位置接回去，打字才不会断
  if (hadSearchFocus) {
    const q = $('#fund-q');
    if (q) { q.focus(); try { q.setSelectionRange(caret, caret); } catch (e) { /* type=search 个别浏览器可能拒绝 */ } }
  }
  bind('#fund-from', 'change', (e) => { state.fund.from = e.target.value; renderView().catch(() => {}); });
  bind('#fund-to', 'change', (e) => { state.fund.to = e.target.value; renderView().catch(() => {}); });
  $$('[data-fund-edit]').forEach((b) => b.addEventListener('click', () => {
    const r = data.items.find((x) => String(x.id) === b.dataset.fundEdit);
    if (r) openFundModal(r);
  }));
  $$('[data-fund-del]').forEach((b) => b.addEventListener('click', async () => {
    const r = data.items.find((x) => String(x.id) === b.dataset.fundDel);
    if (!r || !confirm(`删除这笔${r.type === 'income' ? '收入' : '支出'}（¥${fmtMoney(r.amount)}${r.note ? '：' + r.note : ''}）？其凭证一并删除。`)) return;
    try { await api('/api/funds/' + r.id, { method: 'DELETE' }); toast('已删除'); renderView().catch(() => {}); }
    catch (e) { toast(e.message, 'error'); }
  }));
  $$('[data-fund-upload]').forEach((inp) => inp.addEventListener('change', async (e) => {
    const fid = e.target.dataset.fundUpload;
    const files = [...e.target.files];
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f, f.name));
    try { await api('/api/funds/' + fid + '/attachment', { method: 'POST', body: fd }); toast('凭证已上传 ✓'); renderView().catch(() => {}); }
    catch (err) { toast(err.message, 'error'); }
  }));
  $$('[data-fatt-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('删除这个凭证文件？')) return;
    try { await api('/api/fund-attachments/' + b.dataset.fattDel, { method: 'DELETE' }); toast('已删除'); renderView().catch(() => {}); }
    catch (e) { toast(e.message, 'error'); }
  }));
}

function openFundModal(r) {
  const type = r ? r.type : (state.fund.type === 'income' ? 'income' : 'expense');
  openModal(`
    <h2>${r ? `${icon('edit')} 编辑记录` : `${icon('fund')} 记一笔`}</h2>
    <div class="form">
      <div class="fund-seg">
        <label class="${type === 'expense' ? 'on' : ''}"><input type="radio" name="fund-type" value="expense"${type === 'expense' ? ' checked' : ''}> 支出</label>
        <label class="${type === 'income' ? 'on' : ''}"><input type="radio" name="fund-type" value="income"${type === 'income' ? ' checked' : ''}> 收入</label>
      </div>
      <div class="grid2">
        <div><label>金额（元）</label><input id="fund-amount" type="number" step="0.01" min="0" value="${r ? r.amount : ''}" placeholder="0.00"></div>
        <div><label>日期</label><input id="fund-date" type="date" value="${r ? esc(String(r.happened_at).slice(0, 10)) : ymd(new Date())}"></div>
      </div>
      <label>用途 / 备注</label>
      <input id="fund-note" maxlength="200" value="${r ? esc(r.note) : ''}" placeholder="这笔钱花在哪 / 谁交的（如 36人×10元、购买晚自习手机袋）">
      <label>凭证 / 附件（选填，支出证明等）</label>
      <input id="fund-files" type="file" accept="image/*,.pdf" multiple>
      <div class="fund-modal-files" id="fund-modal-files"></div>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="fund-save">保存</button>
    </div>`);
  const segLabels = $$('#modal-root .fund-seg label');
  segLabels.forEach((lb) => lb.addEventListener('change', () => {
    segLabels.forEach((x) => x.classList.toggle('on', $('input', x).checked));
  }));
  const filesInp = $('#fund-files');
  const preview = $('#fund-modal-files');
  filesInp.addEventListener('change', () => {
    const n = filesInp.files.length;
    preview.innerHTML = n ? `<span class="ok-t">${icon('paperclip')} 已选 ${n} 个文件，保存后自动上传</span>` : '';
  });
  let created = null; // 新建成功后记住 id：凭证上传失败重试时走 PUT 补传，不再重复 POST 记一笔
  $('#fund-save').addEventListener('click', async () => {
    const body = {
      type: ($('#modal-root input[name="fund-type"]:checked') || {}).value || 'expense',
      amount: Number($('#fund-amount').value),
      note: $('#fund-note').value.trim(),
      happened_at: $('#fund-date').value,
    };
    if (!(body.amount > 0)) { toast('请填写大于 0 的金额', 'error'); return; }
    if (!body.happened_at) { toast('请选择日期', 'error'); return; }
    try {
      const rec = r ? await api('/api/funds/' + r.id, { method: 'PUT', body })
        : (created ? await api('/api/funds/' + created, { method: 'PUT', body }) : await api('/api/funds', { method: 'POST', body }));
      if (rec && rec.id) created = rec.id;
      const chosen = [...filesInp.files];
      if (rec && rec.id && chosen.length) {
        const fd = new FormData();
        chosen.forEach((f) => fd.append('files', f, f.name));
        await api('/api/funds/' + rec.id + '/attachment', { method: 'POST', body: fd });
        filesInp.value = ''; // 上传成功就清掉：失败重试只补记录，不重复传同一批凭证
      }
      closeModal();
      toast('已保存 ✓');
      renderView().catch(() => {});
    } catch (e) {
      if (created) toast('记录已保存，但凭证没传上：' + e.message + '（再点一次保存只补传凭证）', 'error');
      else toast(e.message, 'error');
    }
  });
}

/* ========= 思维碰撞（点子 / 留言两个标签；点子带状态与回复，留言保留点赞与弹幕） ========= */
const IDEA_STATUS = { open: '待看', accepted: '采纳', done: '已实现', dropped: '搁置' };
function gbStopTimer() { if (gbTimer) { clearInterval(gbTimer); gbTimer = null; } }
const GB_DAN_COLORS = ['rgba(79,110,242,.85)', 'rgba(7,193,96,.85)', 'rgba(249,115,22,.85)', 'rgba(139,92,246,.85)', 'rgba(239,68,68,.85)', 'rgba(14,165,233,.85)'];
let gbDanStage = null, gbDanList = [], gbDanInited = false;
function gbLiked() { try { return new Set(JSON.parse(localStorage.getItem('infohub-gb-liked') || '[]')); } catch (e) { return new Set(); } }
function gbMarkLiked(id) { const s = gbLiked(); s.add(id); try { localStorage.setItem('infohub-gb-liked', JSON.stringify([...s])); } catch (e) { /* 忽略 */ } }
function gbSpawnDan() {
  if (!gbDanStage || !gbDanList.length) return;
  const m = gbDanList[state.gb.idx = ((state.gb.idx || 0) + 1) % gbDanList.length];
  const el = document.createElement('span');
  el.className = 'gb-dan';
  el.textContent = (m.nickname ? m.nickname + '：' : '') + m.content; // textContent：弹幕天然免疫 XSS
  el.style.background = GB_DAN_COLORS[(state.gb.ci = ((state.gb.ci || 0) + 1) % GB_DAN_COLORS.length)];
  el.style.top = (Math.floor(Math.random() * 4) * 28) + 'px';
  el.style.animationDuration = (8 + Math.random() * 6).toFixed(1) + 's';
  gbDanStage.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  while (gbDanStage.childElementCount > 24) gbDanStage.removeChild(gbDanStage.firstChild);
}
function gbApplyDanmaku() {
  gbStopTimer();
  const wrap = $('#gb-stage-wrap');
  const btn = $('#gb-dan-toggle');
  const enough = gbDanList.length >= 3; // 留言太少时整块舞台收起，不放空场
  if (wrap) wrap.style.display = enough ? '' : 'none';
  if (btn) btn.textContent = state.gb.danmaku ? '弹幕 开' : '弹幕 关';
  if (gbDanStage) gbDanStage.innerHTML = '';
  if (state.gb.danmaku && enough) {
    for (let i = 0; i < 3; i++) gbSpawnDan();
    gbTimer = setInterval(gbSpawnDan, 2600);
  }
}
// 模块入口：征集列表 / 留言墙 / 某个征集的详情
async function loadGuestbook() {
  if (state.gb.campaign) return loadCampaignDetail();
  if (state.gb.tab === 'note') return loadNoteWall();
  return loadCampaignList();
}
// 「征集活动 / 留言」两个标签（详情页不显示，靠返回按钮）
function gbTabsHtml(active) {
  return `<div class="gb-tabs">
    <button data-gb-tab="campaign" class="${active === 'campaign' ? 'on' : ''}">${icon('bulb')} 征集活动</button>
    <button data-gb-tab="note" class="${active === 'note' ? 'on' : ''}">${icon('guestbook')} 留言</button>
  </div>`;
}
function gbBindTabs() {
  $$('[data-gb-tab]').forEach((b) => b.addEventListener('click', () => {
    if (state.gb.tab === b.dataset.gbTab) return;
    state.gb.tab = b.dataset.gbTab;
    state.gb.campaign = null;
    state.gb.files = [];
    state.gb.topic = ''; state.gb.status = '';
    renderView().catch(() => {});
  }));
}
function openCampaign(id) {
  state.gb.campaign = id;
  state.gb.status = '';
  state.gb.files = [];
  renderView().catch((e) => toast(e.message, 'error'));
}

/* ---------- 征集列表 ---------- */
async function loadCampaignList() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/campaigns');
  if (seq !== loadSeq) return;
  const admin = isSysAdmin();
  const items = data.items || [];
  const cards = items.map((c) => {
    const closed = c.closed || c.closedNow;
    return `<div class="panel camp-card">
      <div class="jl-head"><h2>${esc(c.title)}</h2>${closed ? '<span class="jl-badge off">已结束</span>' : '<span class="jl-badge on">收集中</span>'}
        <span class="camp-vis${c.visibility === 'private' ? ' private' : ''}">${c.visibility === 'private' ? icon('lock') + ' 仅我与提交人可见' : icon('users') + ' 全班可见'}</span></div>
      ${c.description ? `<p class="jl-desc">${esc(c.description.length > 120 ? c.description.slice(0, 120) + '…' : c.description)}</p>` : ''}
      <div class="jl-meta">
        <span>${c.deadline ? '截止 ' + esc(c.deadline) : '不限截止'}</span>
        <span>已收到 ${c.count} 份</span>
        ${c.myCount ? `<span>我提交了 ${c.myCount} 份</span>` : ''}
      </div>
      <div class="jl-actions">
        <button class="primary" data-camp-open="${c.id}">${closed ? '查看' : '进入征集'}</button>
        <button class="ghost" data-camp-copy="${c.id}">${icon('link')} 复制链接</button>
        ${admin ? `<button class="ghost" data-camp-edit="${c.id}">${icon('edit')} 编辑</button>
        <button class="ghost danger" data-camp-del="${c.id}">${icon('trash')} 删除</button>` : ''}
      </div>
    </div>`;
  }).join('');
  view.innerHTML = `
    <div class="gb-page">
      <div class="jl-head"><h2>${icon('bulb')} 思维碰撞</h2></div>
      <p class="hint">发起一次征集（比如「下周活动想做什么」「有什么问题值得我反思」），同学把点子和文件交上来；公开征集大家能互相看，私密征集只有发起人与提交人看得到内容。</p>
      ${gbTabsHtml('campaign')}
      ${admin ? `<div class="jl-actions"><button class="primary" id="btn-camp-new">${icon('plus')} 发起征集</button></div>` : ''}
      ${items.length ? cards : `<div class="empty"><div class="big">${icon('bulb')}</div>还没有征集<br>${admin ? '点上面「发起征集」，把想听的问题发出去' : '发起后会出现在这里'}</div>`}
    </div>`;
  const nb = $('#btn-camp-new');
  if (nb) nb.addEventListener('click', () => openCampaignModal(null));
  $$('[data-camp-open]').forEach((b) => b.addEventListener('click', () => openCampaign(b.dataset.campOpen)));
  $$('[data-camp-copy]').forEach((b) => b.addEventListener('click', () => {
    const c = items.find((x) => x.id === b.dataset.campCopy);
    jlCopy(location.origin + '/c/' + b.dataset.campCopy, '征集链接已复制，发到班群即可'
      + (c && c.visibility === 'private' ? '（私密征集：内容只有发起人与提交人看得到）' : ''));
  }));
  $$('[data-camp-edit]').forEach((b) => b.addEventListener('click', () => {
    const c = items.find((x) => x.id === b.dataset.campEdit);
    if (c) openCampaignModal(c);
  }));
  $$('[data-camp-del]').forEach((b) => b.addEventListener('click', async () => {
    const c = items.find((x) => x.id === b.dataset.campDel);
    if (!confirm(`确定删除征集「${c ? c.title : ''}」？已收到的 ${c ? c.count : 0} 份提交会一起删掉，不可恢复！`)) return;
    try { await api('/api/campaigns/' + b.dataset.campDel, { method: 'DELETE' }); toast('征集已删除'); renderView().catch(() => {}); }
    catch (e) { toast(e.message, 'error'); }
  }));
  gbBindTabs();
}

/* ---------- 征集详情：提交 + 已收到的点子 ---------- */
async function loadCampaignDetail() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  let d;
  try { d = await api('/api/campaigns/' + state.gb.campaign); }
  catch (e) {
    if (seq !== loadSeq) return;
    state.gb.campaign = null;
    toast(e.message, 'error');
    return loadGuestbook();
  }
  if (seq !== loadSeq) return;
  const closed = d.closed || d.closedNow;
  const link = location.origin + '/c/' + d.id;
  const liked = gbLiked();
  const items = d.items || [];
  const byId = new Map(items.map((m) => [m.id, m]));
  const shown = state.gb.status ? items.filter((m) => (m.status || 'open') === state.gb.status) : items;
  view.innerHTML = `
    <div class="gb-page">
      <button class="ghost jl-back" id="camp-back">← 返回征集列表</button>
      <div class="jl-head"><h2>${esc(d.title)}</h2>${closed ? '<span class="jl-badge off">已结束</span>' : '<span class="jl-badge on">收集中</span>'}
        <span class="camp-vis${d.visibility === 'private' ? ' private' : ''}">${d.visibility === 'private' ? icon('lock') + ' 仅我与提交人可见' : icon('users') + ' 全班可见'}</span></div>
      ${d.description ? `<p class="jl-desc">${esc(d.description)}</p>` : ''}
      <div class="jl-meta">
        ${d.deadline ? `<span>截止：${esc(d.deadline)}</span>` : '<span>不限截止</span>'}
        <span>已收到 ${d.count} 份${d.visibility === 'private' && !d.canManage ? '（这里只显示你自己的与匿名公开的）' : ''}</span>
        ${d.myCount ? `<span>我提交了 ${d.myCount} 份</span>` : ''}
      </div>
      <div class="jl-linkrow"><input readonly value="${esc(link)}"><button class="ghost" id="camp-copy">${icon('link')} 复制链接</button></div>
      ${closed
        ? `<div class="jl-banner">这次征集已经结束，不能再提交。${d.canManage ? '要重新收的话，去列表里编辑并「重新开放」。' : ''}</div>`
        : `<div class="panel gb-composer">
        <textarea id="gb-content" rows="4" maxlength="500" placeholder="写下你的点子或问题（最多 500 字；也可以只传附件）"></textarea>
        <div class="gb-composer-foot">
          ${d.visibility === 'private'
            ? '<label class="gb-anon" title="勾上后这一条会匿名出现在全班同学看到的征集里，附件也能被下载"><input type="checkbox" id="gb-share" style="width:auto"> 匿名展示给全班</label>'
            : '<label class="gb-anon"><input type="checkbox" id="gb-anon" style="width:auto"> 匿名</label>'}
          <label class="gb-filepick" title="添加附件（单个 ≤ 20MB，最多 5 个）">${icon('paperclip')} 附件<input type="file" id="gb-files" multiple hidden></label>
          <div class="gb-composer-right">
            <span class="gb-count"><span id="gb-len">0</span>/500</span>
            <button class="primary" id="gb-send">${icon('plus')} 提交</button>
          </div>
        </div>
        <div id="gb-filelist" class="gb-filelist"></div>
      </div>`}
      ${d.canManage ? `<div class="gb-topics gb-statuschips">
        <button class="gb-topic-chip${state.gb.status === '' ? ' on' : ''}" data-camp-status="">全部 <b>${items.length}</b></button>
        ${Object.keys(IDEA_STATUS).map((k) => `<button class="gb-topic-chip${state.gb.status === k ? ' on' : ''}" data-camp-status="${k}">${IDEA_STATUS[k]} <b>${(d.statusCounts || {})[k] || 0}</b></button>`).join('')}
      </div>` : ''}
      <div class="gb-toolbar"><span class="gb-total">${d.canManage ? `共 ${items.length} 份` : `我的提交（${items.length} 份）`}</span></div>
      <div id="gb-list">${shown.length ? `<div class="gb-wall">${shown.map((m) => ideaCard(m, liked, d.canManage, d.visibility === 'private')).join('')}</div>`
        : `<div class="empty"><div class="big">${icon('bulb')}</div>${d.canManage ? '还没有人提交' : '你还没有提交过'}</div>`}</div>
    </div>`;
  $('#camp-back').addEventListener('click', () => { state.gb.campaign = null; renderView().catch(() => {}); });
  $('#camp-copy').addEventListener('click', () => jlCopy(link, '征集链接已复制，发到班群即可'));
  $$('[data-camp-status]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset.campStatus || '';
    if (state.gb.status === s) return;
    state.gb.status = s;
    renderView().catch(() => {});
  }));
  const contentEl = $('#gb-content');
  const lenEl = $('#gb-len');
  if (contentEl) contentEl.addEventListener('input', () => { if (lenEl) lenEl.textContent = String(contentEl.value.length); });
  // 待传附件先存 state（切换筛选 / 重渲染不丢），提交时和正文一起走 multipart
  const fileListEl = $('#gb-filelist');
  const renderFiles = () => {
    if (!fileListEl) return;
    fileListEl.innerHTML = (state.gb.files || []).map((f, i) =>
      `<span class="gb-file">${icon('paperclip')} ${esc(f.name)} <i>${fmtSize(f.size)}</i><button type="button" data-gb-file-del="${i}" title="移除">×</button></span>`).join('');
    $$('[data-gb-file-del]').forEach((b) => b.addEventListener('click', () => {
      state.gb.files.splice(Number(b.dataset.gbFileDel), 1);
      renderFiles();
    }));
  };
  const fileInput = $('#gb-files');
  if (fileInput) fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) {
      if (state.gb.files.length >= 5) { toast('最多 5 个附件', 'error'); break; }
      if (f.size > 20 * 1024 * 1024) { toast('「' + f.name + '」超过 20MB', 'error'); continue; }
      state.gb.files.push(f);
    }
    fileInput.value = '';
    renderFiles();
  });
  renderFiles();
  const send = async () => {
    const content = contentEl.value.trim();
    const files = state.gb.files;
    if (!content && !files.length) { toast('写点什么，或者选一个文件', 'error'); return; }
    // 公开征集：匿名只管名字；私密征集：勾「匿名展示给全班」这一条才会放给全班看（仍是匿名）
    const anon = !!($('#gb-anon') && $('#gb-anon').checked);
    const share = !!($('#gb-share') && $('#gb-share').checked);
    let body;
    if (files.length) {
      // 有附件走 multipart：提交与文件在服务端同一个事务里落库，不会留下半截
      body = new FormData();
      body.append('kind', 'idea');
      body.append('campaign', d.id);
      body.append('content', content);
      body.append('anonymous', anon ? 'true' : 'false');
      body.append('public_share', share ? 'true' : 'false');
      files.forEach((f) => body.append('files', f, f.name));
    } else {
      body = { kind: 'idea', campaign: d.id, content, anonymous: anon, public_share: share };
    }
    const btn = $('#gb-send'); if (btn) btn.disabled = true;
    try {
      await api('/api/guestbook', { method: 'POST', body });
      state.gb.files = [];
      toast(files.length ? '已提交，附件也传上去了 ✓' : '已提交 ✓');
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  };
  const sendBtn = $('#gb-send'); if (sendBtn) sendBtn.addEventListener('click', send);
  if (contentEl) contentEl.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); });
  function bindIdea() {
    $$('[data-idea-edit]').forEach((b) => {
      if (b._ibound) return; b._ibound = true;
      b.addEventListener('click', () => { const m = byId.get(Number(b.dataset.ideaEdit)); if (m) openIdeaModal(m); });
    });
  }
  function bindLike() {
    $$('[data-gb-like]').forEach((b) => {
      if (b._bound) return; b._bound = true;
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.gbLike);
        if (gbLiked().has(id)) { toast('已经赞过啦'); return; }
        b.disabled = true;
        try {
          const r = await api('/api/guestbook/' + id + '/like', { method: 'POST' });
          gbMarkLiked(id);
          b.classList.add('on');
          const sp = b.querySelector('span'); if (sp) sp.textContent = r.likes;
        } catch (e) { b.disabled = false; toast(e.message, 'error'); }
      });
    });
  }
  function bindDel() {
    $$('[data-gb-del]').forEach((b) => {
      if (b._dbound) return; b._dbound = true;
      b.addEventListener('click', async () => {
        if (!confirm('删除这条提交？')) return;
        try { await api('/api/guestbook/' + b.dataset.gbDel, { method: 'DELETE' }); toast('已删除'); renderView().catch(() => {}); }
        catch (e) { toast(e.message, 'error'); }
      });
    });
  }
  function bindAttDel() {
    $$('[data-gb-att-del]').forEach((b) => {
      if (b._atbound) return; b._atbound = true;
      b.addEventListener('click', async () => {
        if (!confirm('移除这个附件？')) return;
        try { await api('/api/idea-attachments/' + b.dataset.gbAttDel, { method: 'DELETE' }); toast('附件已移除'); renderView().catch(() => {}); }
        catch (e) { toast(e.message, 'error'); }
      });
    });
  }
  bindIdea(); bindAttDel(); bindLike(); bindDel();
}

/* ---------- 留言墙（原来的寄语墙：昵称 / 点赞 / 主题 / 弹幕） ---------- */
async function loadNoteWall() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  gbStopTimer();
  const gbq = (off) => '/api/guestbook?limit=30&offset=' + off + '&sort=' + state.gb.sort
    + (state.gb.topic ? '&topic=' + encodeURIComponent(state.gb.topic) : '');
  const data = await api(gbq(0));
  if (seq !== loadSeq) return;
  state.gb.total = data.total; state.gb.loaded = data.items.length;
  state.gb.shown = new Set(data.items.map((m) => m.id));
  gbDanList = data.items;
  if (!gbDanInited) { // 尊重系统「减少动态效果」偏好，仅首次决定默认开关
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) state.gb.danmaku = false;
    gbDanInited = true;
  }
  const liked = gbLiked();
  const gbCard = (m) => {
    const tint = 'gb-t' + (m.id % 6);
    const initial = esc(Array.from(m.nickname || '匿名')[0] || '?');
    return `<div class="gb-card ${tint}">
      ${(m.mine || canPost()) ? `<button class="gb-del" data-gb-del="${m.id}" title="${m.mine ? '删除我发的' : '删除'}">${icon('trash')}</button>` : ''}
      <div class="gb-head"><span class="gb-ava">${initial}</span>
        <div class="gb-who"><span class="gb-nick">${esc(m.nickname || '匿名')}</span><span class="gb-time">${esc(fmtReceived(m.created_at))}</span></div>
      </div>
      ${m.topic ? `<button class="gb-badge" data-gb-topic="${esc(m.topic)}" title="只看这个主题">#${esc(m.topic)}</button>` : ''}
      <div class="gb-text">${esc(m.content)}</div>
      <button class="gb-like${liked.has(m.id) ? ' on' : ''}" data-gb-like="${m.id}" ${liked.has(m.id) ? 'disabled' : ''}>${icon('heart')}<span>${m.likes || 0}</span></button>
    </div>`;
  };
  const wallHtml = data.items.length
    ? `<div class="gb-wall" id="gb-wall">${data.items.map(gbCard).join('')}</div>`
    : `<div class="empty"><div class="big">${icon('guestbook')}</div>还没有留言<br>写下第一句寄语，或给这堂课留个评价吧</div>`;
  view.innerHTML = `
    <div class="gb-page">
      <div class="jl-head"><h2>${icon('bulb')} 思维碰撞</h2></div>
      <p class="hint">想随便说两句、留个寄语，就写在这面墙上；想提活动建议或值得我反思的问题，去「征集活动」交给对应的那次征集。</p>
      ${gbTabsHtml('note')}
      <div class="gb-stage-wrap" id="gb-stage-wrap">
        <div class="gb-stage" id="gb-stage" aria-hidden="true"></div>
        <button class="mini gb-dan-toggle" id="gb-dan-toggle" title="开关弹幕">${state.gb.danmaku ? '弹幕 开' : '弹幕 关'}</button>
      </div>
      <div class="panel gb-composer">
        <textarea id="gb-content" rows="4" maxlength="500" placeholder="说点什么…（最多 500 字）" aria-label="留言内容"></textarea>
        <div class="gb-composer-foot">
          <input id="gb-nick" maxlength="20" placeholder="昵称（选填，默认匿名）" aria-label="昵称">
          <input id="gb-topic" list="gb-topic-list" maxlength="20" placeholder="主题（选填，如 AI课反馈 / 给张三）" aria-label="主题">
          <datalist id="gb-topic-list">${(data.topics || []).map((t) => `<option value="${esc(t.topic)}"></option>`).join('')}</datalist>
          <div class="gb-composer-right">
            <span class="gb-count"><span id="gb-len">0</span>/500</span>
            <button class="primary" id="gb-send">${icon('plus')} 发布</button>
          </div>
        </div>
      </div>
      ${(data.topics && data.topics.length) ? `<div class="gb-topics">
        <button class="gb-topic-chip${state.gb.topic === '' ? ' on' : ''}" data-gb-topic="">全部</button>
        ${data.topics.map((t) => `<button class="gb-topic-chip${state.gb.topic === t.topic ? ' on' : ''}" data-gb-topic="${esc(t.topic)}">#${esc(t.topic)} <b>${t.count}</b></button>`).join('')}
      </div>` : ''}
      <div class="gb-toolbar">
        <div class="gb-sort">
          <button class="${state.gb.sort === 'new' ? 'on' : ''}" data-gb-sort="new">最新</button>
          <button class="${state.gb.sort === 'hot' ? 'on' : ''}" data-gb-sort="hot">最热</button>
        </div>
        <span class="gb-total">共 ${data.total} 条${state.gb.topic ? ' · 主题 #' + esc(state.gb.topic) : ''}</span>
      </div>
      <div id="gb-list">${wallHtml}</div>
      ${data.total > data.items.length ? `<div class="morebar"><button class="mini" id="gb-more">加载更多</button></div>` : ''}
    </div>`;
  gbDanStage = $('#gb-stage');
  gbApplyDanmaku();

  const contentEl = $('#gb-content');
  const lenEl = $('#gb-len');
  if (contentEl) contentEl.addEventListener('input', () => { if (lenEl) lenEl.textContent = String(contentEl.value.length); });
  const send = async () => {
    const content = contentEl.value.trim();
    const topic = ($('#gb-topic').value || '').trim();
    if (!content) { toast('写点什么再发吧', 'error'); return; }
    const body = { kind: 'note', content, topic, nickname: ($('#gb-nick').value || '').trim() };
    const btn = $('#gb-send'); if (btn) btn.disabled = true;
    try {
      await api('/api/guestbook', { method: 'POST', body });
      toast('已发布 ✓');
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  };
  const sendBtn = $('#gb-send'); if (sendBtn) sendBtn.addEventListener('click', send);
  if (contentEl) contentEl.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); });
  const danBtn = $('#gb-dan-toggle'); if (danBtn) danBtn.addEventListener('click', () => { state.gb.danmaku = !state.gb.danmaku; gbApplyDanmaku(); });
  $$('[data-gb-sort]').forEach((b) => b.addEventListener('click', () => {
    if (state.gb.sort === b.dataset.gbSort) return;
    state.gb.sort = b.dataset.gbSort;
    renderView().catch(() => {});
  }));
  const moreBtn = $('#gb-more');
  if (moreBtn) moreBtn.addEventListener('click', async () => {
    moreBtn.disabled = true;
    try {
      const d = await api(gbq(state.gb.loaded));
      if (seq !== loadSeq) return;
      // 热度排序下两次请求之间有人被点赞，页边界会移动 → 同一条可能再翻出来一次；按 id 去重
      const fresh = d.items.filter((m) => !state.gb.shown.has(m.id));
      fresh.forEach((m) => state.gb.shown.add(m.id));
      state.gb.loaded += d.items.length;
      $('#gb-wall').insertAdjacentHTML('beforeend', fresh.map(gbCard).join(''));
      bindLike(); bindTopicBadge(); bindDel();
      if (state.gb.loaded >= state.gb.total || !d.items.length) moreBtn.closest('.morebar').remove();
    } catch (e) { toast(e.message, 'error'); }
    finally { moreBtn.disabled = false; }
  });
  function bindTopicBadge() {
    $$('[data-gb-topic]').forEach((b) => {
      if (b._tbound) return; b._tbound = true;
      b.addEventListener('click', () => {
        const t = b.dataset.gbTopic || '';
        if (state.gb.topic === t) return;
        state.gb.topic = t;
        renderView().catch(() => {});
      });
    });
  }
  function bindLike() {
    $$('[data-gb-like]').forEach((b) => {
      if (b._bound) return; b._bound = true;
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.gbLike);
        if (gbLiked().has(id)) { toast('已经赞过啦'); return; }
        b.disabled = true; // 先禁用防双击连发两次 POST（服务端仅 IP 频控，不去重）
        try {
          const r = await api('/api/guestbook/' + id + '/like', { method: 'POST' });
          gbMarkLiked(id);
          b.classList.add('on');
          const sp = b.querySelector('span'); if (sp) sp.textContent = r.likes;
        } catch (e) { b.disabled = false; toast(e.message, 'error'); }
      });
    });
  }
  function bindDel() {
    $$('[data-gb-del]').forEach((b) => {
      if (b._dbound) return; b._dbound = true;
      b.addEventListener('click', async () => {
        if (!confirm('删除这条留言？')) return;
        try { await api('/api/guestbook/' + b.dataset.gbDel, { method: 'DELETE' }); toast('已删除'); renderView().catch(() => {}); }
        catch (e) { toast(e.message, 'error'); }
      });
    });
  }
  bindTopicBadge(); bindLike(); bindDel();
  gbBindTabs();
}

// 一条提交的卡片：状态徽章、附件、回复、点赞；处理按钮只在有管理权时出现
function ideaCard(m, liked, canManage, privateCampaign) {
  return `<article class="gb-card idea s-${esc(m.status || 'open')}">
    ${(canManage || m.mine) ? `<button class="gb-del" data-gb-del="${m.id}" title="${canManage ? '删除' : '删除我提交的'}">${icon('trash')}</button>` : ''}
    <div class="gb-head">
      <span class="gb-ava">${esc(Array.from(m.nickname || '匿名')[0] || '?')}</span>
      <div class="gb-who"><span class="gb-nick">${esc(m.nickname || '匿名')}${m.mine ? ' <b class="idea-mine">我提的</b>' : ''}</span><span class="gb-time">${esc(fmtReceived(m.created_at))}</span></div>
      <span class="idea-badge">${IDEA_STATUS[m.status] || '待看'}</span>${(privateCampaign && m.public_share) ? '<span class="idea-share" title="提交人选择匿名公开给全班">匿名公开</span>' : ''}
    </div>
    ${m.content ? `<div class="gb-text">${esc(m.content)}</div>` : ''}
    ${(m.attachments || []).length ? `<div class="gb-atts">${m.attachments.map((a) => `
      <span class="gb-att"><a href="/api/idea-attachments/${a.id}/download" target="_blank" rel="noopener">${icon('file')} <span>${esc(a.orig_name)}</span> <i>${fmtSize(a.size)}</i></a>${(canManage || m.mine) ? `<button class="gb-att-del" data-gb-att-del="${a.id}" title="移除附件">×</button>` : ''}</span>`).join('')}</div>` : ''}
    ${m.reply ? `<div class="idea-reply"><b>回复</b><span>${esc(m.reply)}</span>${m.reply_at ? `<i>${esc(fmtReceived(m.reply_at))}</i>` : ''}</div>` : ''}
    <div class="idea-foot">
      <button class="gb-like${liked.has(m.id) ? ' on' : ''}" data-gb-like="${m.id}" ${liked.has(m.id) ? 'disabled' : ''}>${icon('heart')}<span>${m.likes || 0}</span></button>
      ${canManage ? `<button class="mini" data-idea-edit="${m.id}">${icon('edit')} 状态 / 回复</button>` : ''}
    </div>
  </article>`;
}


/* 处理一条点子：改状态 + 写公开回复。点名看到的提交人只有系统管理员拿得到（匿名点子的真名不下发给别人） */
function openIdeaModal(m) {
  const opts = Object.keys(IDEA_STATUS).map((k) =>
    `<option value="${k}"${(m.status || 'open') === k ? ' selected' : ''}>${IDEA_STATUS[k]}</option>`).join('');
  openModal(`
    <h2>${icon('bulb')} 处理点子</h2>
    ${m.content ? `<div class="idea-quote">${esc(m.content)}</div>` : ''}
    ${(m.attachments || []).length ? `<div class="gb-atts">${m.attachments.map((a) => `<a class="gb-att" href="/api/idea-attachments/${a.id}/download" target="_blank" rel="noopener">${icon('file')} <span>${esc(a.orig_name)}</span> <i>${fmtSize(a.size)}</i></a>`).join('')}</div>` : ''}
    <div class="hint" style="margin:6px 0 10px">${esc(m.nickname || '匿名')}${m.sid ? '（' + esc(m.sid) + '）' : ''} · ${esc(fmtReceived(m.created_at))}</div>
    <div class="form">
      <label>状态</label>
      <select id="idea-status">${opts}</select>
      <label>公开回复（同学都看得到）</label>
      <textarea id="idea-reply" rows="3" maxlength="500" placeholder="比如：这个主意好，下周班会上定；或：记下了，我先想想怎么落地">${esc(m.reply || '')}</textarea>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="idea-save">${icon('check')} 保存</button>
    </div>`);
  $('#idea-save').addEventListener('click', async () => {
    try {
      await api('/api/guestbook/' + m.id, { method: 'PUT', body: { status: $('#idea-status').value, reply: $('#idea-reply').value } });
      closeModal();
      toast('已更新 ✓');
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* 发起 / 编辑一次征集：标题、说明、截止、公开或私密 */
function openCampaignModal(c) {
  const vis = c && c.visibility === 'private' ? 'private' : 'public';
  openModal(`
    <h2>${icon('bulb')} ${c ? '编辑征集' : '发起征集'}</h2>
    <div class="form">
      <label>征集标题</label>
      <input id="camp-title" maxlength="60" value="${c ? esc(c.title) : ''}" placeholder="如：下周班级活动想做什么？">
      <label>说明（选填）</label>
      <textarea id="camp-desc" rows="3" maxlength="1000" placeholder="想听哪方面的意见、有什么背景或要求…">${c ? esc(c.description || '') : ''}</textarea>
      <label>截止时间（选填，到点自动停止收集）</label>
      <input id="camp-deadline" type="datetime-local" value="${c ? dtToVal(c.deadline) : ''}">
      <label>谁能看到提交内容</label>
      <select id="camp-vis">
        <option value="public"${vis === 'public' ? ' selected' : ''}>全班可见（大家能互相看、点赞）</option>
        <option value="private"${vis === 'private' ? ' selected' : ''}>仅我与提交人可见（适合反思类问题）</option>
      </select>
      ${c ? `<label class="splitline"><input type="checkbox" id="camp-closed"${c.closed ? ' checked' : ''}> 停止收集（不再接收提交）</label>` : ''}
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="camp-save">${c ? '保存修改' : '发起征集'}</button>
    </div>`);
  $('#camp-save').addEventListener('click', async () => {
    const title = $('#camp-title').value.trim();
    if (!title) { toast('请填写征集标题', 'error'); return; }
    const body = {
      title, description: $('#camp-desc').value, deadline: valToDt($('#camp-deadline').value) || '',
      visibility: $('#camp-vis').value,
    };
    if (c) body.closed = $('#camp-closed').checked;
    try {
      if (c) {
        await api('/api/campaigns/' + c.id, { method: 'PUT', body });
        toast('已保存');
      } else {
        const r = await api('/api/campaigns', { method: 'POST', body });
        state.gb.tab = 'campaign';
        state.gb.campaign = r.id;
        toast('征集已发起 ✓');
      }
      closeModal();
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ========= 命令面板（Ctrl/⌘+K，参考 Linear 的 cmdk 交互） ========= */
const CMDK_VIEWS = [
  ['feed', '信息中心', 'feed'], ['tasks', '待办任务', 'check'], ['inbox', '等待审核', 'inbox'],
  ['files', '文件中心', 'file'], ['stats', '统计', 'chart'],
  ['jielong', '活动接龙', 'jielong'], ['draw', '抽签点名', 'draw'], ['vote', '投票表决', 'vote'], ['birthday', '生日祝福', 'birthday'],
  ['funds', '班费收支', 'fund'],
  ['guestbook', '思维碰撞', 'bulb'],
  ['rosters', '账号名单', 'users'], ['audit', '操作记录', 'clock'], ['settings', '设置', 'settings'],
];
let cmdkItems = [], cmdkIndex = 0, cmdkSearchTimer = null, cmdkSeq = 0;

function cmdkOpen() {
  closeModal(); // 已有弹窗（含面板）先关，避免叠层
  lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $('#modal-root').innerHTML = `
    <div class="backdrop cmdk-backdrop"><div class="cmdk" role="dialog" aria-modal="true" aria-label="命令面板">
      <div class="cmdk-head">${icon('search')}<input id="cmdk-q" type="text" placeholder="搜索信息，或输入命令…" autocomplete="off" aria-label="搜索或输入命令"><kbd class="kbd">Esc</kbd></div>
      <div class="cmdk-list" id="cmdk-list" role="listbox" aria-label="命令与结果"></div>
    </div></div>`;
  const bd = $('#modal-root .backdrop');
  let down = false;
  bd.addEventListener('mousedown', (e) => { down = e.target === bd; });
  bd.addEventListener('click', (e) => { if (e.target === bd && down) closeModal(); });
  const q = $('#cmdk-q');
  q.addEventListener('input', () => { clearTimeout(cmdkSearchTimer); cmdkSearchTimer = setTimeout(cmdkRender, 180); });
  q.addEventListener('keydown', cmdkKeys);
  cmdkIndex = 0;
  cmdkRender();
  setTimeout(() => q.focus(), 30);
}

// 当前身份能去的视图：命令面板与 1–9 快捷键共用，别让同学跳到只有管理员 / 班委能看的页
function visibleViews() {
  return CMDK_VIEWS.filter(([v]) => {
    if (['rosters', 'audit', 'settings'].includes(v) && !isSysAdmin()) return false;
    if (v === 'inbox' && !canPost()) return false;
    return true;
  });
}
function cmdkCommands() {
  // 班级管理（账号名单 / 操作记录 / 设置）与待审核按身份过滤
  const views = visibleViews();
  const cmds = views.map(([v, label, ic]) => ({
    iconHtml: icon(ic), label: '转到：' + label, hint: '视图',
    run: () => { state.view = v; renderView().catch((e) => toast(e.message, 'error')); },
  }));
  if (canPost()) {
    cmds.push(
      { iconHtml: icon('plus'), label: '添加信息', hint: '操作', run: () => openMessageModal(null) },
      { iconHtml: icon('jielong'), label: '发起接龙', hint: '操作', run: () => { state.view = 'jielong'; renderView().catch(() => {}); setTimeout(openJielongCreateModal, 80); } },
      { iconHtml: icon('draw'), label: '新建签箱', hint: '操作', run: () => { state.view = 'draw'; renderView().catch(() => {}); setTimeout(openDrawCreateModal, 80); } },
    );
  }
  if (isSysAdmin()) {
    cmds.push(
      { iconHtml: icon('birthday'), label: '添加生日成员', hint: '操作', run: () => { state.view = 'birthday'; renderView().catch(() => {}); setTimeout(() => openBdayModal(null), 80); } },
      { iconHtml: icon('download'), label: '导出 JSON 备份', hint: '操作', run: () => window.open('/api/export') },
      { iconHtml: icon('calendar'), label: '导出日历（.ics）', hint: '操作', run: () => window.open('/api/calendar.ics') },
    );
  }
  cmds.push(
    { iconHtml: icon('clock'), label: '切换外观（浅色 / 深色 / 自动）', hint: '操作', run: () => $('#btn-theme').click() },
    { iconHtml: icon('search'), label: '聚焦搜索框', hint: '操作', run: () => {
      const sw = $('.searchwrap');
      if (sw && sw.style.display === 'none') {
        state.view = 'feed';
        renderView().catch(() => {});
      }
      setTimeout(() => $('#search').focus(), 60);
    } },
  );
  return cmds;
}

function cmdkRender() {
  const q = ($('#cmdk-q')?.value || '').trim();
  const ql = q.toLowerCase();
  const cmds = cmdkCommands().filter((c) => !q || c.label.toLowerCase().includes(ql));
  cmdkItems = cmds.map((c) => ({ ...c, type: 'cmd' }));
  // 输入 ≥ 2 个字符时异步搜信息（序号防竞态：慢的旧请求不覆盖新结果）
  if (q.length >= 2) {
    const seq = ++cmdkSeq;
    api('/api/messages?q=' + encodeURIComponent(q) + '&limit=8').then((d) => {
      if (seq !== cmdkSeq || !$('#cmdk-list')) return;
      const items = d.items.map((it) => ({
        type: 'msg', it,
        iconHtml: (CATS[it.category] || CATS.other).icon,
        label: it.title || (it.content || '').slice(0, 40) || '(无标题)',
        hint: fmtReceived(it.received_at),
      }));
      cmdkItems = cmds.concat(items);
      cmdkPaint();
    }).catch(() => { /* 搜索失败时仅显示命令 */ });
  }
  cmdkPaint();
}

function cmdkPaint() {
  const list = $('#cmdk-list');
  if (!list) return;
  if (!cmdkItems.length) {
    list.innerHTML = '<p class="empty-mini" style="padding:14px;text-align:center">没有匹配的命令或信息</p>';
    return;
  }
  if (cmdkIndex >= cmdkItems.length) cmdkIndex = cmdkItems.length - 1;
  if (cmdkIndex < 0) cmdkIndex = 0;
  list.innerHTML = cmdkItems.map((it, i) => `
    <div class="cmdk-item ${i === cmdkIndex ? 'sel' : ''}" role="option" aria-selected="${i === cmdkIndex}" data-i="${i}">
      <span class="cmdk-ic">${it.iconHtml}</span>
      <span class="cmdk-label">${esc(it.label)}</span>
      <span class="spacer"></span>
      <span class="cmdk-hint">${esc(it.hint)}</span>
    </div>`).join('');
  $$('.cmdk-item', list).forEach((el) => {
    el.addEventListener('click', () => cmdkRun(+el.dataset.i));
    el.addEventListener('mousemove', () => {
      const i = +el.dataset.i;
      if (cmdkIndex !== i) { cmdkIndex = i; $$('.cmdk-item', list).forEach((x) => { x.classList.toggle('sel', +x.dataset.i === i); x.setAttribute('aria-selected', String(+x.dataset.i === i)); }); }
    });
  });
  const sel = $('.cmdk-item.sel', list);
  if (sel && sel.scrollIntoView) { try { sel.scrollIntoView({ block: 'nearest' }); } catch (e) { /* 忽略 */ } }
}

function cmdkKeys(e) {
  const n = cmdkItems.length;
  if (e.key === 'Tab') { e.preventDefault(); return; } // 面板只有一个交互元素，Tab 留在输入框里
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); cmdkIndex = (cmdkIndex + 1) % n; cmdkPaint(); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); cmdkIndex = (cmdkIndex - 1 + n) % n; cmdkPaint(); }
  else if (e.key === 'Enter') { e.preventDefault(); cmdkRun(cmdkIndex); }
}

function cmdkRun(i) {
  const it = cmdkItems[i];
  if (!it) return;
  closeModal();
  if (it.type === 'msg') {
    if (isSysAdmin()) api('/api/messages/' + it.it.id).then(openMessageModal).catch((e) => toast(e.message, 'error'));
    else toast('访客只读，登录后可编辑信息');
  } else it.run();
}

/* 快捷键帮助（按 ? 打开） */
function openHelpModal() {
  openModal(`
    <h2>${icon('book')} 键盘快捷键</h2>
    <div class="help-grid">
      <kbd class="kbd">/</kbd><span>聚焦搜索框</span>
      <kbd class="kbd">Ctrl / ⌘ + K</kbd><span>打开命令面板（跳转、操作、搜信息）</span>
      <kbd class="kbd">N</kbd><span>添加信息（管理员）</span>
      <kbd class="kbd">1 – 9</kbd><span>切换视图（信息 / 待办 / 待审核 / 文件 / 统计 / 接龙 / 抽签 / 投票 / 生日）</span>
      <kbd class="kbd">Esc</kbd><span>关闭弹窗或面板</span>
      <kbd class="kbd">Ctrl / ⌘ + Enter</kbd><span>保存正在编辑的信息</span>
    </div>
    <div class="modal-foot"><button class="primary" id="btn-cancel">知道了</button></div>`);
}

/* ========= 视图切换 ========= */
// 顶栏控件只在适用的页面显示：排序只在信息流有用；统计页不响应群筛选
function syncTopbar() {
  // 搜索、群筛选、排序都只作用于信息中心（信息流 / 待办 / 待审核 / 文件），其他模块不显示
  const info = ['feed', 'tasks', 'files', 'inbox'].includes(state.view);
  const sw = $('.searchwrap');
  if (sw) sw.style.display = info ? '' : 'none';
  $('#group-sel').style.display = info ? '' : 'none';
  $('#sortsel').style.display = state.view === 'feed' ? '' : 'none';
}
/* ========= 合并后的导航：信息中心 / 班级管理 ========= */
// 信息中心装 信息流 / 待办 / 待审核 / 文件 / 统计；班级管理装 账号名单 / 操作记录 / 设置。
// state.view 仍然用原来的子视图名，只是导航与标签把它们归了组。
const FEED_VIEWS = ['feed', 'tasks', 'inbox', 'files', 'stats'];
const ADMIN_VIEWS = ['rosters', 'audit', 'settings'];
const NAV_ALIAS = { tasks: 'feed', inbox: 'feed', files: 'feed', stats: 'feed', audit: 'rosters', settings: 'rosters' };
const FEED_TABS = [['feed', '信息流'], ['tasks', '待办'], ['inbox', '待审核'], ['files', '文件'], ['stats', '统计']];
const ADMIN_TABS = [['rosters', '账号名单'], ['audit', '操作记录'], ['settings', '设置']];
function hubTabsHtml(active, tabs) {
  return `<div class="hub-tabs">${tabs.filter(([v]) => v !== 'inbox' || canPost()).map(([v, label]) =>
    `<button data-hub-tab="${v}" class="${active === v ? 'on' : ''}">${label}${v === 'inbox' && state.inboxTotal ? ` <b>${state.inboxTotal > 99 ? '99+' : state.inboxTotal}</b>` : ''}</button>`).join('')}</div>`;
}
function renderHubBar() {
  const bar = $('#hub-bar');
  if (!bar) return;
  if (FEED_VIEWS.includes(state.view)) bar.innerHTML = hubTabsHtml(state.view, FEED_TABS);
  else if (ADMIN_VIEWS.includes(state.view)) bar.innerHTML = hubTabsHtml(state.view, ADMIN_TABS);
  else { bar.innerHTML = ''; return; }
  $$('[data-hub-tab]', bar).forEach((b) => b.addEventListener('click', () => {
    if (state.view === b.dataset.hubTab) return;
    state.view = b.dataset.hubTab;
    renderView().catch((e) => toast(e.message, 'error'));
  }));
}
// 视图加载代次：renderView 每次自增并传给视图加载器。加载器的响应回来时若代次已变
// （用户已切换视图 / 改了筛选），直接丢弃，防止慢的旧请求覆盖新界面
let loadSeq = 0;
async function renderView() {
  jlStopTimer();
  vStopTimer();
  gbStopTimer();
  const seq = ++loadSeq;
  saveFilters();
  syncNavActive();
  renderHubBar();
  syncTopbar();
  renderChips();
  const view = $('#view');
  try {
    if (state.view === 'feed') await loadFeed();
    else if (state.view === 'inbox') await loadInbox();
    else if (state.view === 'tasks') await loadTasks();
    else if (state.view === 'jielong') await loadJielong();
    else if (state.view === 'draw') await loadDraw();
    else if (state.view === 'vote') await loadVotes();
    else if (state.view === 'survey') await loadSurveys();
    else if (state.view === 'birthday') await loadBirthdays();
    else if (state.view === 'funds') await loadFunds();
    else if (state.view === 'guestbook') await loadGuestbook();
    else if (state.view === 'files') await loadFiles();
    else if (state.view === 'rosters') await loadRosters();
    else if (state.view === 'audit') await loadAudit();
    else if (state.view === 'settings') await loadSettings();
    else await loadStats();
    window.scrollTo(0, 0);
  } catch (e) {
    // 旧视图的迟到错误不覆盖新视图；只有仍是当前视图时才显示错误页
    if (seq !== loadSeq) return;
    // 加载失败给出重试入口，而不是卡在"加载中"
    view.innerHTML = `<div class="empty"><div class="big">${icon('alert')}</div>加载失败：${esc(e.message || '网络错误')}<br>
      <button class="ghost" id="btn-retry" style="margin-top:12px">${icon('refresh')} 重试</button></div>`;
    const btn = $('#btn-retry');
    if (btn) btn.addEventListener('click', () => renderView().catch(() => {}));
  }
}
async function refresh() {
  try {
    await loadGroups();
    await renderView();
    updateBadge();
    updateInboxBadge();
  } catch (e) { toast(e.message, 'error'); }
}

/* ========= 事件绑定 ========= */
// 所有导航按钮（侧栏 + 底栏 + 更多面板）统一同步活动态；
// 「更多」按钮在当前视图属于低频视图时也点亮
const NAV_SEL = '#mainnav button, #tabbar button, #tabsheet button';
// 「更多」面板里的条目（手机底栏放不下的模块）
const MORE_VIEWS = ['funds', 'guestbook', 'rosters', 'audit', 'settings'];
function syncNavActive() {
  // 合并后：待办 / 待审核 / 文件 / 统计 都归到「信息中心」，操作记录 / 设置 归到「班级管理」
  const navView = NAV_ALIAS[state.view] || state.view;
  $$(NAV_SEL).forEach((b) => {
    const on = !!b.dataset.view && b.dataset.view === navView;
    b.classList.toggle('active', on);
    if (b.dataset.view) {
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
  });
  const moreBtn = $('#tab-more');
  if (moreBtn) moreBtn.classList.toggle('active', MORE_VIEWS.includes(state.view));
  const sheet = $('#tabsheet');
  if (sheet) sheet.hidden = true;
}
function bindEvents() {
  $$(NAV_SEL).forEach((b) => b.addEventListener('click', () => {
    if (!b.dataset.view) return; // 「更多」按钮没有 data-view，只负责开合面板（有自己的监听）
    state.view = b.dataset.view;
    renderView().catch((e) => toast(e.message, 'error'));
  }));
  const moreBtn = $('#tab-more');
  if (moreBtn) moreBtn.addEventListener('click', () => {
    const sheet = $('#tabsheet');
    if (sheet) sheet.hidden = !sheet.hidden;
  });

  $('#chips').addEventListener('click', (e) => {
    // 点群筛选小标签 → 清除群筛选
    const cg = e.target.closest('[data-clear-group]');
    if (cg) {
      state.group = null;
      renderSidebar();
      renderView().catch((e2) => toast(e2.message, 'error'));
      return;
    }
    const btn = e.target.closest('[data-cat]');
    if (btn) {
      state.category = btn.dataset.cat;
      state.view = 'feed';
      renderView().catch((e2) => toast(e2.message, 'error'));
    }
  });
  $('#chips').addEventListener('change', (e) => {
    if (e.target.id === 'showdone') {
      state.showDone = e.target.checked;
      renderView().catch((e2) => toast(e2.message, 'error'));
    }
  });

  let searchTimer = null;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      // 只有用得上搜索词的视图才重画；统计 / 设置 / 账号 / 记录不吃搜索
      if (['feed', 'tasks', 'files', 'inbox'].includes(state.view)) renderView().catch((e2) => toast(e2.message, 'error'));
    }, 250);
  });

  $('#sortsel').addEventListener('change', (e) => {
    state.sort = e.target.value;
    if (state.view === 'feed') renderView().catch((e2) => toast(e2.message, 'error'));
  });

  $('#group-sel').addEventListener('change', (e) => {
    state.group = e.target.value || null;
    renderSidebar();
    renderView().catch((e2) => toast(e2.message, 'error'));
  });

  $('#grouplist').addEventListener('click', (e) => {
    const gi = e.target.closest('.gitem');
    if (!gi) return;
    state.group = gi.dataset.gid || null;
    renderSidebar();
    if (state.view === 'stats') state.view = 'feed';
    renderView().catch((e2) => toast(e2.message, 'error'));
  });
  $('#grouplist').addEventListener('dblclick', (e) => {
    if (!isSysAdmin()) return;
    const gi = e.target.closest('.gitem');
    if (!gi || !gi.dataset.gid) return;
    const g = state.groups.find((x) => String(x.id) === gi.dataset.gid);
    if (g) openGroupModal(g);
  });

  if (canPost()) {
    $('#btn-add').addEventListener('click', () => openMessageModal(null));
    $('#fab').addEventListener('click', () => openMessageModal(null));
  }
  if (isSysAdmin()) $('#btn-add-group').addEventListener('click', () => openGroupModal(null));
  const loginBtn = $('#btn-login');
  if (loginBtn) loginBtn.addEventListener('click', () => { location.href = '/login'; });

  // PWA 安装入口：仅 Android / 桌面 Chrome 等会触发安装事件（需 HTTPS），
  // iOS 没有该事件，用 Safari 分享菜单「添加到主屏幕」，HTTP 局域网下两者都退化为普通快捷方式
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    const b = $('#btn-install');
    if (b) b.style.display = '';
  });
  window.addEventListener('appinstalled', () => {
    installEvt = null;
    const b = $('#btn-install');
    if (b) b.style.display = 'none';
    toast('已安装到桌面 ✓');
  });
  const installBtn = $('#btn-install');
  if (installBtn) installBtn.addEventListener('click', async () => {
    if (!installEvt) return;
    try { await installEvt.prompt(); } catch (e) { /* 用户环境不支持 */ }
    installEvt = null;
    installBtn.style.display = 'none';
  });

  // 全局键盘快捷键：/ 搜索、Ctrl+K 命令面板、n 新建、1-9 切视图、? 帮助
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
    const modalOpen = !!$('#modal-root').children.length;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      cmdkOpen();
      return;
    }
    if (typing || modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === '/') {
      e.preventDefault();
      const sw = $('.searchwrap');
      if (sw && sw.style.display !== 'none') { $('#search').focus(); return; }
      state.view = 'feed';
      renderView().catch(() => {}).then(() => $('#search').focus());
    } else if (e.key === '?') {
      e.preventDefault();
      openHelpModal();
    } else if ((e.key === 'n' || e.key === 'N') && canPost()) {
      e.preventDefault();
      openMessageModal(null);
    } else if (/^[1-9]$/.test(e.key)) {
      const v = visibleViews()[Number(e.key) - 1];
      if (v && v[0] !== state.view) {
        state.view = v[0];
        renderView().catch((e2) => toast(e2.message, 'error'));
      }
    }
  });

  $('#view').addEventListener('click', async (e) => {
    // 空结果页：一键清除全部筛选
    if (e.target.closest('#btn-clear-filter')) {
      state.q = '';
      state.category = '';
      state.group = null;
      $('#search').value = '';
      renderSidebar();
      renderView().catch((e2) => toast(e2.message, 'error'));
      return;
    }
    // 点标签 → 直接按该标签搜索
    const tag = e.target.closest('.tag');
    if (tag) {
      const q = tag.textContent.replace(/^#/, '').trim();
      if (q) {
        state.q = q;
        $('#search').value = q;
        state.category = '';
        state.view = 'feed';
        renderView().catch((e2) => toast(e2.message, 'error'));
      }
      return;
    }
    // 「已完成」区 / 文件中心（主列表与已完成区）的加载与显示更多（分页条不在卡片里，单独接住）
    const moreBtn = e.target.closest('[data-act="donemore"], [data-act="filemore"], [data-act="filedone"]');
    if (moreBtn) {
      const handlers = { donemore: loadMoreDone, filemore: loadMoreFiles, filedone: loadMoreDoneFiles };
      (handlers[moreBtn.dataset.act] || loadMoreFiles)().catch((e2) => toast(e2.message, 'error'));
      return;
    }
    // 文件中心：点"来自：xxx"打开对应信息编辑
    const fmsg = e.target.closest('.fmsg');
    if (fmsg && fmsg.dataset.msg) {
      if (!isSysAdmin()) return;
      try {
        const item = await api('/api/messages/' + fmsg.dataset.msg);
        openMessageModal(item);
      } catch (e2) { toast(e2.message, 'error'); }
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('[data-id]');
    if (!card) return;
    const id = Number(card.dataset.id);
    const act = btn.dataset.act;
    if (act === 'bodymore') {
      // 展开/收起长正文：全文已在卡片里，只切换折叠样式，不用重新渲染
      const p = card.querySelector('.card-body');
      const clamped = p.classList.toggle('clamped');
      btn.classList.toggle('open', !clamped);
      btn.setAttribute('aria-expanded', String(!clamped));
      btn.innerHTML = icon('chev-down') + (clamped ? ' 展开全文' : ' 收起');
      return;
    }
    try {
      if (act === 'toggle') { const it = await api(`/api/messages/${id}/toggle`, { method: 'POST' }); toast(it.status === 'done' ? '已完成 ✓' : '已取消完成'); refresh(); }
      else if (act === 'pin') { await api(`/api/messages/${id}/pin`, { method: 'POST' }); refresh(); }
      else if (act === 'edit') { const item = await api('/api/messages/' + id); openMessageModal(item); }
      else if (act === 'del') {
        if (confirm('确定删除这条信息吗？\n附件文件也会一并删除，删除后不可恢复。')) {
          await api('/api/messages/' + id, { method: 'DELETE' });
          toast('已删除');
          refresh();
        }
      }
    } catch (e2) { toast(e2.message, 'error'); }
  });
}

/* ========= 筛选条件持久化 ========= */
function saveFilters() {
  try {
    localStorage.setItem('infohub-filters', JSON.stringify({
      category: state.category, group: state.group, sort: state.sort, showDone: state.showDone,
    }));
  } catch (e) { /* 忽略 */ }
}
function restoreFilters() {
  try {
    const f = JSON.parse(localStorage.getItem('infohub-filters') || '{}');
    if (f.category) state.category = f.category;
    if (f.group) state.group = f.group;
    if (f.sort) state.sort = f.sort;
    if (f.showDone) state.showDone = !!f.showDone;
    const sel = $('#sortsel');
    if (sel) sel.value = state.sort;
  } catch (e) { /* 忽略 */ }
}

/* ========= 主题 / 截止提醒 / 标题角标 ========= */
// 三档外观：浅色 / 深色 / 自动（19:00–次日 7:00 深色，其余浅色）
const THEME_DARK_FROM = 19, THEME_DARK_TO = 7;
function themeAutoResolved() {
  const h = new Date().getHours();
  return (h >= THEME_DARK_FROM || h < THEME_DARK_TO) ? 'dark' : 'light';
}
function applyTheme(mode) {
  const t = mode === 'auto' ? themeAutoResolved() : mode;
  document.documentElement.dataset.theme = t;
  localStorage.setItem('infohub-theme', mode);
  const btn = $('#btn-theme');
  if (btn) {
    const ic = mode === 'auto' ? icon('clock') : t === 'dark' ? icon('moon') : icon('sun');
    btn.innerHTML = ic;
    btn.title = '外观：' + (mode === 'auto' ? '自动（19:00–次日 7:00 深色，当前' + (t === 'dark' ? '深色' : '浅色') + '）' : mode === 'dark' ? '深色' : '浅色') + '，点击切换';
  }
  // 手机状态栏 / 浏览器标签框颜色跟随主题。
  // 从令牌现取而不是再抄一份字面色：抄的那份在 --bg 改成 #11161f 后没跟上，手机上状态栏和页面顶边会有一条色差
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) {
    const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    mt.content = (t === 'dark' ? v('--bg') : v('--primary')) || (t === 'dark' ? '#11161f' : '#4f6ef2');
  }
}
function onBellClick() {
  localStorage.setItem('infohub-notif-dismissed', '1');
  if (!('Notification' in window)) { toast('此浏览器不支持通知', 'error'); return; }
  if (Notification.permission === 'granted') {
    toast('截止提醒已开启 ✓（信息页开着时生效）');
    checkNotifs();
    return;
  }
  Notification.requestPermission().then((p) => {
    if (p === 'granted') {
      toast('已开启截止提醒 ✓');
      try {
        new Notification('信息汇总', { body: '截止提醒已开启：逾期或 24 小时内到期的任务会提醒你' });
      } catch (e) { /* 忽略 */ }
      checkNotifs();
    } else {
      toast('浏览器未授权通知，可在地址栏锁图标里重新允许', 'error');
    }
    setupBellState();
  });
}
function setupBellState() {
  const btn = $('#btn-bell');
  if (!btn) return;
  const dot = $('#bell-badge'); // updateBadge 挂的角标在按钮里，换图标时先摘下再还回
  btn.innerHTML = ('Notification' in window && Notification.permission === 'granted') ? icon('bell') : icon('bell-off');
  if (dot) btn.appendChild(dot);
}
const BASE_TITLE = document.title; // 页面原始标题
async function updateBadge() {
  try {
    const st = await api('/api/stats');
    const today = ymd(new Date());
    const n = (st.overdue || 0) + ((st.upcoming || []).filter((it) => String(it.deadline).slice(0, 10) === today).length);
    // 逾期 + 今日截止的数量：同时体现在浏览器标签页标题和铃铛角标上
    document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
    const bell = $('#btn-bell');
    if (bell) {
      let dot = $('#bell-badge');
      if (n > 0) {
        if (!dot) { dot = document.createElement('span'); dot.id = 'bell-badge'; bell.appendChild(dot); }
        dot.textContent = n > 99 ? '99+' : String(n);
      } else if (dot) dot.remove();
    }
  } catch (e) { /* 忽略 */ }
}
async function checkNotifs() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    // 大数据量下只看：24 小时内到期的未逾期事项 + 最近逾期的 20 条（更久远的逾期不再提醒）
    const [up, od] = await Promise.all([
      api('/api/messages?status=open&sort=deadline&due=after&limit=100'),
      api('/api/messages?status=open&sort=deadline_desc&due=overdue&limit=20'),
    ]);
    const data = { items: od.items.concat(up.items) };
    const now = new Date();
    const key = 'infohub-notified-' + ymd(now);
    // 只保留当天的提醒记录，历史 key 会一直占着 localStorage
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('infohub-notified-') && k !== key)
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* 忽略 */ }
    const done = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    for (const it of data.items) {
      if (!it.deadline) continue;
      const end = it.deadline.length > 10 ? it.deadline.replace(' ', 'T') : it.deadline + 'T23:59';
      const diffH = (new Date(end) - now) / 3600000;
      if (diffH > 24 || diffH < -24) continue;
      if (done.has(String(it.id))) continue;
      done.add(String(it.id));
      const label = diffH < 0 ? '已逾期' : `还有约 ${Math.max(1, Math.round(diffH))} 小时截止`;
      try {
        new Notification(`⏰ ${label}`, {
          body: `${it.title || (it.content || '').slice(0, 40)}\n截止：${it.deadline}`,
          tag: 'infohub-' + it.id,
        });
      } catch (e) { /* 忽略 */ }
    }
    localStorage.setItem(key, JSON.stringify([...done]));
  } catch (e) { /* 忽略 */ }
}
function initExtras() {
  applyTheme(localStorage.getItem('infohub-theme') || 'auto');
  // 点 🌙 按钮三档循环：浅色 → 深色 → 自动
  $('#btn-theme').addEventListener('click', () => {
    const cur = localStorage.getItem('infohub-theme') || 'auto';
    const order = ['light', 'dark', 'auto'];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    applyTheme(next);
    toast('外观：' + (next === 'auto' ? '自动（19:00–次日 7:00 深色）' : next === 'dark' ? '深色' : '浅色'));
  });
  // 自动模式下每 10 分钟复查一次，跨过 19:00 / 7:00 时页面自动变色
  setInterval(() => {
    if ((localStorage.getItem('infohub-theme') || 'auto') === 'auto') applyTheme('auto');
  }, 10 * 60 * 1000);
  // 弹窗里有没保存的内容时，关闭/刷新页面先提醒（覆盖信息、接龙、签箱、生日等所有表单弹窗）
  window.addEventListener('beforeunload', (e) => {
    const modal = $('.modal');
    // input[type=text] 是属性选择器，匹配不到省略 type 的输入框（弹窗里的标题/备注大多没写 type）；
    // 反向排除法才能全覆盖
    const dirtyFields = modal && $$('.modal input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=submit]):not([type=button]), .modal textarea, .modal select', modal)
      .some((el) => String(el.value || '').trim());
    if (state.pendingFiles.length > 0 || dirtyFields) { e.preventDefault(); e.returnValue = ''; }
  });
  $('#btn-bell').addEventListener('click', onBellClick);
  setupBellState();
  updateBadge();
  updateInboxBadge();
  refreshBirthdaysToday(); // 生日横幅数据（有无通知权限都加载）
  if ('Notification' in window && Notification.permission === 'granted') { checkNotifs(); checkBirthdayNotifs(); }
  setInterval(() => { updateBadge(); updateInboxBadge(); checkNotifs(); checkBirthdayNotifs(); }, 5 * 60 * 1000);
}
/* 角标：普通视图显示数字；生日视图显示弹跳的 🎂（庆祝，不是待办） */
function setNavBadge(viewName, n, opts = {}) {
  $$('#mainnav button[data-view="' + viewName + '"], #tabbar button[data-view="' + viewName + '"]').forEach((btn) => {
    let b = btn.querySelector('.navbadge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'navbadge'; btn.appendChild(b); }
      b.classList.toggle('bday', !!opts.bday);
      b.textContent = opts.bday ? '🎂' : (n > 99 ? '99+' : String(n));
    } else if (b) b.remove();
  });
}
async function updateInboxBadge() {
  if (!canPost()) return;   // 待审核入口对班委也开着，所以他们同样要看到数字
  try {
    const d = await api('/api/inbox?limit=1');
    state.inboxTotal = d.total || 0;
    // 角标现在长在信息中心的「待审核」标签上：在这个合并页里就直接重画标签
    if (FEED_VIEWS.includes(state.view)) renderHubBar();
  } catch (e) { /* 只读访客无权限，静默 */ }
}

/* ========= 启动 ========= */
bindEvents();
initExtras();
restoreFilters();
// 直达某条接龙的管理页：/?jl=接龙ID（历史 ?t= 管理令牌已随账号体系退役，能否管理只看登录身份）
(function jlInitFromUrl() {
  try {
    const q = new URLSearchParams(location.search);
    const id = (q.get('jl') || '').toLowerCase();
    const t = q.get('t') || '';
    if (/^[a-z0-9]+$/.test(id)) {
      state.view = 'jielong';
      state.jl = { id, token: t };
      history.replaceState(null, '', location.pathname);
    }
  } catch (e) { /* 忽略 */ }
})();
// 征集链接入口：/c/征集ID → 打开这次征集（未登录会先跳登录页，登录后回到这个地址）
(function ideaInitFromUrl() {
  try {
    const m = /^\/c\/([a-z0-9]+)\/?$/.exec(location.pathname);
    if (m) {
      state.view = 'guestbook';
      state.gb.tab = 'campaign';
      state.gb.campaign = m[1];
      history.replaceState(null, '', '/');
    }
  } catch (e) { /* 忽略 */ }
})();
// 先取会话状态（决定只读模式），再渲染首屏
loadMe().finally(() => refresh());
