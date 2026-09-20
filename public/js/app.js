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
  'jielong': '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="4" cy="18" r="1.6"/>',
  'draw': '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M9 3v6M15 3v6"/><path d="m9 14 2 2 4-4"/>',
  'birthday': '<path d="M4 21h16"/><path d="M6 21v-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M12 14v-4"/><path d="M10.5 7.5C10.5 6.5 12 5 12 5s1.5 1.5 1.5 2.5a1.5 1.5 0 0 1-3 0z"/>',
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
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  'sparkles': '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
  'undo': '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  'dots': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
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
    throw new Error(msg);
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
  groups: [],
  editingId: null,
  pendingFiles: [],
  existingAtts: [],
  me: { authRequired: false, loggedIn: true, readOnly: false }, // 会话状态（启动时从 /api/me 拉取）
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
  calByDay: {},
  dividerShown: false,
  jl: null,        // 接龙详情状态 {id, token}；null = 列表
  jlBanner: false, // 创建成功横幅（只显示一次）
  jlQuiet: false,  // 定时刷新中（不滚动）
  draw: null,      // 抽签详情的签箱 id；null = 列表
};

/* ========= 只读访客 ========= */
// 管理密码开启且未登录 → 只读模式：可浏览，隐藏一切编辑入口
function canEdit() { return !state.me.authRequired || state.me.loggedIn; }
async function loadMe() {
  try { state.me = await api('/api/me'); } catch (e) { /* 拉取失败按可编辑处理 */ }
  document.body.classList.toggle('readonly', !canEdit());
  const lb = $('#btn-login');
  if (lb) lb.style.display = canEdit() ? 'none' : '';
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
    <h3 class="card-title">${hl(it.title || '(无标题)', state.q)}</h3>
    ${body ? `<p class="card-body${folded ? ' clamped' : ''}">${hl(body, state.q)}</p>${folded ? `<button class="bodymore" data-act="bodymore" aria-expanded="${!folded}">${icon('chev-down')} 展开全文</button>` : ''}` : ''}
    <div>${dlChip(it.deadline)}</div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    ${atts ? `<div class="atts">${atts}</div>` : ''}
    ${canEdit() ? `<div class="card-actions">
      <button data-act="toggle" class="ghost">${done ? icon('undo') + ' 取消完成' : icon('check') + ' 完成'}</button>
      <button data-act="pin" class="ghost">${icon('pin')} ${it.pinned ? '取消置顶' : '置顶'}</button>
      <button data-act="edit" class="ghost">${icon('edit')} 编辑</button>
      <button data-act="del" class="ghost danger">${icon('trash')} 删除</button>
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
      : canEdit()
        ? `<div class="empty"><div class="big">${icon('inbox')}</div>还没有记录<br>点右上角「＋ 添加信息」，把老师发的通知粘贴进来试试</div>`
        : `<div class="empty"><div class="big">${icon('inbox')}</div>还没有记录<br>老师发布通知后会出现在这里</div>`;
    if (doneSection) {
      view.insertAdjacentHTML('beforeend', doneSection);
      if (autoDone) loadMoreDone().catch(() => {});
    }
    addBdBanner();
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
  if (!append) addBdBanner();
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
  setNavBadge('inbox', data.total);
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
    ${canEdit() ? '<button class="tcheck" data-act="toggle" title="标记完成">' + icon('check') + '</button>' : ''}
    <div class="tmain">
      <div class="ttitle"${canEdit() ? ' data-act="edit"' : ''}>${hl(it.title || (it.content || '').slice(0, 30), state.q)}</div>
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

/* ========= 日历视图 ========= */
async function loadCalendar() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  // 只取未逾期事项（due=after）。服务端单页上限 200，事项更多时按 offset 分页取全，
  // 否则往后翻的月份会整体无数据且无提示（上限 1000 条兜底，正常班级远到不了）
  const base = new URLSearchParams({ status: 'open', sort: 'deadline', due: 'after' });
  if (state.group) base.set('group_id', state.group);
  const items = [];
  let total = Infinity;
  while (items.length < total && items.length < 1000) {
    const p = new URLSearchParams(base);
    p.set('limit', '200');
    p.set('offset', String(items.length));
    const data = await api('/api/messages?' + p);
    if (seq !== loadSeq) return;
    total = data.total;
    items.push(...data.items);
    if (!data.items.length) break;
  }
  state.calByDay = {};
  for (const it of items) {
    if (!it.deadline) continue;
    (state.calByDay[it.deadline.slice(0, 10)] ||= []).push(it);
  }
  renderCalendar();
}

function renderCalendar() {
  const view = $('#view');
  const { y, m } = state.cal;
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 周一开头
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = ymd(new Date());
  const prefix = `${y}-${pad(m)}-`;
  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="calcell blank"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = prefix + pad(d);
    const list = state.calByDay[ds] || [];
    const chips = list.slice(0, 2).map((it) =>
      `<button class="calchip cat-${it.category}" data-cal="${it.id}" title="${esc(it.title || '')}">${esc(Array.from(it.title || '无标题').slice(0, 9).join(''))}</button>`).join('');
    const more = list.length > 2 ? `<span class="calmore">还有 ${list.length - 2} 项</span>` : '';
    const count = list.length ? `<span class="calcount">${list.length}</span>` : '';
    cells += `<div class="calcell${ds === today ? ' today' : ''}" data-day="${ds}">
      <div class="calday">${d}${count}</div>${chips}${more}</div>`;
  }
  view.innerHTML = `
    <div class="calhead">
      <button class="ghost" id="cal-prev">← 上月</button>
      <h3>${y} 年 ${m} 月</h3>
      <button class="ghost" id="cal-next">下月 →</button>
      <button class="ghost" id="cal-today">回到本月</button>
      <span class="spacer"></span>
      <button class="ghost" id="btn-ics-cal">${icon('calendar')} 导出到手机日历</button>
    </div>
    <div class="calgrid calweekrow">
      ${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((d) => `<div class="calwlabel">${d}</div>`).join('')}
    </div>
    <div class="calgrid">${cells}</div>
    <div id="cal-panel"></div>
    <p class="hint" style="text-align:center">显示未完成信息的截止时间（跟随顶部群筛选）；点日期看当天全部事项，点事项可直接编辑</p>`;
  $('#cal-prev').addEventListener('click', () => { state.cal.m--; if (state.cal.m < 1) { state.cal.m = 12; state.cal.y--; } renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { state.cal.m++; if (state.cal.m > 12) { state.cal.m = 1; state.cal.y++; } renderCalendar(); });
  $('#cal-today').addEventListener('click', () => { const n = new Date(); state.cal = { y: n.getFullYear(), m: n.getMonth() + 1 }; renderCalendar(); });
  $('#btn-ics-cal').addEventListener('click', () => window.open('/api/calendar.ics'));
  $$('.calcell[data-day]').forEach((cell) => cell.addEventListener('click', (e) => {
    if (e.target.closest('[data-cal]')) return;
    showDayPanel(cell.dataset.day);
  }));
  $$('[data-cal]').forEach((chip) => chip.addEventListener('click', async () => {
    if (!canEdit()) return;
    const it = await api('/api/messages/' + chip.dataset.cal);
    openMessageModal(it);
  }));
}

function showDayPanel(ds) {
  const list = state.calByDay[ds] || [];
  const panel = $('#cal-panel');
  if (!panel) return;
  if (!list.length) { panel.innerHTML = ''; return; }
  panel.innerHTML = `<div class="panel"><h3>${icon('calendar')} ${esc(friendlyDate(ds))} 截止（${list.length}）</h3>
    ${list.map((it) => `
      <div class="uprow" data-day-id="${it.id}">
        <span class="badge cat-${it.category}">${(CATS[it.category] || CATS.other).label}</span>
        <b>${esc(it.title || (it.content || '').slice(0, 24))}</b>
        ${it.deadline.length > 10 ? `<span class="time">${esc(it.deadline.slice(11))}</span>` : ''}
        <span class="spacer"></span>${dlChip(it.deadline)}
      </div>`).join('')}
  </div>`;
  $$('#cal-panel [data-day-id]').forEach((row) => row.addEventListener('click', async () => {
    if (!canEdit()) return;
    const it = await api('/api/messages/' + row.dataset.dayId);
    openMessageModal(it);
  }));
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

/* ========= 名单库（独立视图：随时新建 / 编辑 / 删除，接龙、抽签、生日导处复用） ========= */
function rosterPreviewChips(raw, keepId) {
  const parsed = jlParseRoster(raw, keepId);
  if (!parsed.list.length) return '<span class="hint">（名单内容为空）</span>';
  return `识别到 <b>${parsed.list.length}</b> 人${keepId ? '（含学号）' : ''}：` +
    parsed.list.slice(0, 50).map((m) => `<span class="jl-chip plain">${esc(jlSlotLabel(m))}</span>`).join('') +
    (parsed.list.length > 50 ? `<span class="jl-chip plain">…共 ${parsed.list.length} 人</span>` : '');
}
async function loadRosters() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/rosters');
  if (seq !== loadSeq) return;
  const items = data.items || [];
  const emptyHint = items.length ? '' : `<div class="empty"><div class="big">${icon('users')}</div>还没有保存的名单<br>点「新建名单」，或在发起接龙时勾选「保存到名单库」</div>`;
  view.innerHTML = `
    <div class="inboxhead"><h3>${icon('users')} 名单库（${items.length}）</h3>
      <span class="hint">名单存一份，发起接龙、抽签点名、生日导入时直接复用</span>
      ${canEdit() ? `<button class="ghost" id="btn-roster-new">${icon('plus')} 新建名单</button>` : ''}</div>
    ${items.map((r) => `
      <div class="panel" data-rid="${r.id}">
        <div class="jl-head"><h2>${esc(r.name)}</h2><span class="hint">${r.count} 人${r.keepId ? ' · 含学号' : ''} · ${esc(fmtReceived(r.updated_at))}</span></div>
        <div class="roster-pv" hidden>${rosterPreviewChips(r.roster, r.keepId)}</div>
        <div class="card-actions">
          <button class="ghost" data-ract="toggle">${icon('eye')} 成员</button>
          <button class="ghost" data-ract="copy">${icon('copy')} 复制全文</button>
          ${canEdit() ? `<button class="ghost" data-ract="edit">${icon('edit')} 编辑</button>
          <button class="ghost danger" data-ract="del">${icon('trash')} 删除</button>` : ''}
        </div>
      </div>`).join('')}
    ${emptyHint}`;
  const newBtn = $('#btn-roster-new');
  if (newBtn) newBtn.addEventListener('click', () => openRosterModal(null));
  view.querySelectorAll('.panel[data-rid]').forEach((card) => {
    const r = items.find((x) => String(x.id) === card.dataset.rid);
    if (!r) return;
    const pv = card.querySelector('.roster-pv');
    const tbtn = card.querySelector('[data-ract="toggle"]');
    if (tbtn) tbtn.addEventListener('click', () => {
      pv.hidden = !pv.hidden;
      tbtn.innerHTML = icon('eye') + (pv.hidden ? ' 成员' : ' 收起');
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
      <div class="labrow"><label>名单名称</label></div>
      <input id="rs-name" maxlength="60" value="${esc(item ? item.name : '')}" placeholder="如：计科2603班">
      <div class="labrow"><label>名单内容（每行一个，支持「学号 姓名」，Excel 整列直接粘贴）</label></div>
      <textarea id="rs-raw" rows="10" placeholder="2023001 张三&#10;李四">${esc(item ? item.roster : '')}</textarea>
      <label class="splitline"><input type="checkbox" id="rs-keepid" ${item && item.keepId ? 'checked' : ''}> 保留学号（重名时按学号区分）</label>
      <div id="rs-pv" class="hint"></div>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="rs-save">${icon('check')} 保存</button>
    </div>`);
  const pv = () => { $('#rs-pv').innerHTML = rosterPreviewChips($('#rs-raw').value, $('#rs-keepid').checked); };
  $('#rs-raw').addEventListener('input', pv);
  $('#rs-keepid').addEventListener('change', pv);
  pv();
  $('#rs-save').addEventListener('click', async () => {
    const body = { name: $('#rs-name').value.trim(), rosterRaw: $('#rs-raw').value, keepId: $('#rs-keepid').checked };
    if (!body.name) { toast('请填写名单名称', 'error'); return; }
    try {
      if (item) await api('/api/rosters/' + item.id, { method: 'PUT', body });
      else await api('/api/rosters', { method: 'POST', body });
      toast(item ? '名单已更新 ✓' : '名单已保存 ✓');
      closeModal();
      renderView().catch((e2) => toast(e2.message, 'error'));
    } catch (e) { toast(e.message, 'error'); }
  });
}

/* ========= 统计与接入 ========= */
function statCard(lab, num, cls = '') {
  return `<div class="statcard ${cls}"><div class="num">${num}</div><div class="lab">${lab}</div></div>`;
}
async function loadStats() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const st = await api('/api/stats'); // 会话状态由启动时的 loadMe 提供，这里不重复请求
  if (seq !== loadSeq) return;
  const editable = canEdit();
  const cfg = editable ? await api('/api/config').catch(() => null) : null;
  if (seq !== loadSeq) return;
  const maxG = Math.max(1, ...st.byGroup.map((g) => g.count));
  const maxC = Math.max(1, ...st.byCategory.map((c) => c.c));
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
  if (obFilter.smart) fparts.push('智能过滤，像通知/任务的才收录');
  const napcatExample = cfg ? JSON.stringify({ network: { httpClients: [{
    name: 'infohub', enable: true, url: onebotUrl, messagePostFormat: 'array', reportSelfMessage: false, token: ob.token,
  }] } }, null, 2) : '';
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
        : `<p class="hint">当前为 <b>人工审核</b> 模式（默认）：群消息先进侧栏的「${icon('inbox')} 待审核」，由你挑哪些收录进信息流，收录时自动识别分类和截止时间。想全自动收录，在 data/config.json 里把 onebot.mode 改为 <code>"auto"</code>。</p>`}
      <p class="hint">在电脑上用 <b>NapCat / LLOneBot / Lagrange / go-cqhttp</b> 等 OneBot 11 框架登录一个 QQ 小号并拉进班级群，
      在它的网络配置里添加 <b>HTTP POST 上报</b>，地址和令牌填下面两项。群文件上传也会记录（纯图片/表情消息不收录，避免刷屏）。</p>
      <div class="codebox">${esc(onebotUrl)}</div>
      <button class="ghost" id="btn-copy-onebot">${icon('copy')} 复制上报地址</button>
      <p class="hint">令牌 access_token：<code>${esc(ob.token)}</code>${ob.secretOn ? '（已在 config 里启用签名校验，框架 secret 填同一段密钥）' : '（与接入令牌相同；可在 data/config.json 的 onebot.token 单独设置，或设 onebot.secret 启用签名校验）'}</p>
      <p class="hint">NapCat / LLOneBot 配置示例（其他框架按各自文档填同样两项）：</p>
      <div class="codebox">${esc(napcatExample)}</div>
      <button class="ghost" id="btn-copy-onebot-json">${icon('copy')} 复制配置示例</button>
      <p class="hint">${icon('lock')} 防闲聊过滤：${fparts.length
        ? `${esc(fparts.join('；'))}。在 data/config.json 的 onebot.filter 里调整${obMode === 'review' ? '（关键词、仅管理员、智能过滤仅在 auto 模式参与）' : ''}。`
        : '当前未启用，群里所有文字消息都会收录。可在 data/config.json 的 onebot.filter 里开启：最短长度、水词屏蔽、关键词白名单、仅群主/管理员、智能过滤（像通知/任务的才收录）。'}</p>
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
      <h3>${icon('bell')} 截止提醒</h3>
      <p class="hint">点顶栏铃铛开启浏览器通知：只要信息页开着，<b>已逾期</b>或 <b>24 小时内截止</b>的任务会弹窗提醒
      （同一条每天只提醒一次，每 5 分钟检查一次）。手机上把本页"添加到主屏幕"后同样有效。</p>
      <button class="ghost" id="btn-bell-2">${icon('bell')} 开启 / 检查提醒</button>
    </div>
    <div class="panel">
      <h3>${icon('archive')} 数据备份</h3>
      <p class="hint">所有数据都在本机 data/ 文件夹——<b>复制整个文件夹即完整备份</b>（含附件）。
      每次启动和跨天时会自动备份到 data/backups/（保留最近 14 份）；也可以导出 JSON。</p>
      ${editable ? `<button class="ghost" id="btn-export">${icon('download')} 导出 JSON 备份</button>
      <label class="importwrap">${icon('upload')} 导入 JSON 备份<input id="import-file" type="file" accept=".json,application/json"></label>` : ''}
      ${state.me.authRequired ? (state.me.loggedIn
        ? '<button class="ghost" id="btn-logout" style="margin-left:10px">' + icon('logout') + ' 退出登录</button>'
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
  const exportBtn = $('#btn-export');
  if (exportBtn) exportBtn.addEventListener('click', () => { window.open('/api/export'); });
  $('#btn-bell-2').addEventListener('click', onBellClick);
  const logoutBtn = $('#btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    if (!confirm('退出登录后需要重新输入密码。确定吗？')) return;
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) { /* 忽略 */ }
    location.href = '/';
  });
  const addGroup2 = $('#btn-add-group2');
  if (addGroup2) addGroup2.addEventListener('click', () => openGroupModal(null));
  $$('[data-editgroup]').forEach((b) => b.addEventListener('click', () => {
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
  if (editable) $$('.uprow', view).forEach((row) => row.addEventListener('click', async () => {
    const it = await api('/api/messages/' + row.dataset.id);
    openMessageModal(it);
  }));
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
        <button id="btn-smart" type="button" class="mini">${icon('sparkles')} 智能识别</button></div>
      <textarea id="f-content" placeholder="把老师发的通知、任务原文粘贴到这里，再点「智能识别」自动填标题、分类和截止时间…">${item ? esc(item.content || '') : ''}</textarea>
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
      // 批量模式：按空行拆分为多条，每段各自智能识别（附件会挂到第一条）
      const splitBox = $('#f-split');
      if (splitBox && splitBox.checked && !state.editingId) {
        const parts = payload.content.split(/\n\s*\n+/).map((s) => s.trim()).filter((s) => s.length >= 2);
        if (parts.length > 1) {
          let n = 0;
          for (const part of parts) {
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

/* ========= 班级名单库（创建接龙 / 签箱时复用名单） ========= */
// 在弹窗里绑定"从名单库选择 + 删除"控件；applyRoster(选中项) 由调用方填充表单
async function setupRosterLib(prefix, applyRoster) {
  const sel = $('#' + prefix + '-roster-lib');
  const delBtn = $('#' + prefix + '-roster-lib-del');
  if (!sel) return;
  let lib = [];
  try { lib = (await api('/api/rosters')).items; } catch (e) { /* 拉取失败按空处理 */ }
  const renderOptions = () => {
    sel.innerHTML = '<option value="">— 手动粘贴名单 —</option>' +
      lib.map((r) => `<option value="${r.id}">${esc(r.name)}（${r.count} 人）</option>`).join('');
  };
  renderOptions();
  sel.addEventListener('change', () => {
    const r = lib.find((x) => String(x.id) === sel.value);
    delBtn.style.display = r ? '' : 'none';
    if (r) applyRoster(r);
  });
  delBtn.addEventListener('click', async () => {
    const r = lib.find((x) => String(x.id) === sel.value);
    if (!r || !confirm(`从名单库删除「${r.name}」？`)) return;
    try {
      await api('/api/rosters/' + r.id, { method: 'DELETE' });
      lib = lib.filter((x) => x.id !== r.id);
      renderOptions();
      sel.value = '';
      delBtn.style.display = 'none';
      toast('已从名单库删除');
    } catch (e) { toast(e.message, 'error'); }
  });
}
// 保存到名单库（名称留空则跳过）；失败抛错由调用方提示
async function saveRosterToLib(prefix, name, rosterRaw, keepId) {
  return api('/api/rosters', { method: 'POST', body: { name, rosterRaw, keepId } });
}

/* ========= 班级接龙（自「接龙小助手」并入） ========= */
let jlTimer = null;
function jlStopTimer() { if (jlTimer) { clearInterval(jlTimer); jlTimer = null; } }

function jlMine() {
  try { return JSON.parse(localStorage.getItem('infohub-jielong-mine') || '[]'); } catch (e) { return []; }
}
function jlMineSave(list) {
  try { localStorage.setItem('infohub-jielong-mine', JSON.stringify(list.slice(0, 50))); } catch (e) { /* 忽略 */ }
}
function jlMineRemember(id, token, title) {
  jlMineSave([{ id, token, title, ts: Date.now() }, ...jlMine().filter((x) => x.id !== id)]);
}
function jlTokenOf(id) {
  const it = jlMine().find((x) => x.id === id);
  return it ? it.token : '';
}
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
  // 清理已失效的本地入口（接龙被删除后）
  const known = new Set(data.items.map((x) => x.id));
  const mine = jlMine();
  if (mine.some((x) => !known.has(x.id))) jlMineSave(mine.filter((x) => known.has(x.id)));

  const items = data.items.map((a) => {
    const hasToken = canEdit() || jlTokenOf(a.id);
    return `<div class="panel">
      <div class="jl-head"><h2>${esc(a.title)}</h2>${jlStatusBadge(a)}</div>
      ${a.description ? `<p class="jl-desc">${esc(a.description.length > 80 ? a.description.slice(0, 80) + '…' : a.description)}</p>` : ''}
      <div class="jl-meta">${a.deadline ? `${icon('clock')} 截止 ${esc(a.deadline)}` : ''}
        <span>${a.hasRoster ? `${icon('check')} ${a.done}/${a.total} 已接` : `${icon('users')} ${a.count} 人已接`}</span>
        <span>发起于 ${jlFmtTime(a.createdAt)}</span></div>
      <div class="jl-actions">
        <button class="ghost" data-jl-open="${a.id}">${icon('external')} 打开接龙页</button>
        <button class="ghost" data-jl-copy="${a.id}">${icon('copy')} 复制学生链接</button>
        ${hasToken ? `<button class="ghost" data-jl-manage="${a.id}">${icon('settings')} 管理</button>` : ''}
      </div>
    </div>`;
  }).join('');

  view.innerHTML =
    `<div class="jl-head"><h2>${icon('jielong')} 活动接龙</h2></div>
    <p class="hint">接龙链接发到班群，同学点开即填即交；自动比对名单，谁没接龙一目了然。</p>
    ${canEdit() ? `<div class="jl-actions"><button class="primary" id="btn-jl-create">${icon('plus')} 发起接龙</button></div>` : ''}
    ${items || `<div class="empty"><div class="big">${icon('jielong')}</div>还没有接龙` +
      (canEdit() ? '<br>点上面「发起接龙」，把班群里的接龙搬到这里' : '<br>发起后接龙会出现在这里') + '</div>'}`;
  const createBtn = $('#btn-jl-create');
  if (createBtn) createBtn.addEventListener('click', openJielongCreateModal);
  $$('[data-jl-manage]').forEach((b) => b.addEventListener('click', () => {
    state.jl = { id: b.dataset.jlManage, token: jlTokenOf(b.dataset.jlManage) };
    renderView().catch((e) => toast(e.message, 'error'));
  }));
  $$('[data-jl-open]').forEach((b) => b.addEventListener('click', () => window.open('/j/' + b.dataset.jlOpen)));
  $$('[data-jl-copy]').forEach((b) => jlCopy(location.origin + '/j/' + b.dataset.jlCopy, '学生链接已复制，可发到班群'));
}

/* ---------- 接龙详情（管理台） ---------- */
async function loadJielongDetail() {
  if (!state.jl) return; // 轮询回调可能在用户退出详情后才回来，此时不能再覆盖视图
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  let a;
  try { a = await api('/api/jielong/' + state.jl.id); }
  catch (e) {
    if (seq !== loadSeq) return;
    state.jl = null;
    toast(e.message, 'error');
    return loadJielong();
  }
  if (seq !== loadSeq) return; // 等待期间已切换视图，丢弃旧响应
  const token = state.jl.token || jlTokenOf(a.id) || (a.adminToken || ''); // 管理员可从详情取回令牌
  const canManage = canEdit() || !!token;
  if (token && !jlTokenOf(a.id)) jlMineRemember(a.id, token, a.title); // 委托链接：保存入口
  const tArg = token ? '?t=' + encodeURIComponent(token) : '';
  const stuLink = location.origin + '/j/' + a.id;

  const withId = (a.roster || []).some((r) => r.id) || a.entries.some((e) => e.id);
  const jlFullText = () => {
    const lines = ['【' + a.title + '】'];
    if (a.description) lines.push(a.description);
    lines.push('— 已接龙 ' + (a.hasRoster ? a.done + '/' + a.total + ' 人' : a.count + ' 人') + ' —');
    a.entries.forEach((e, i) => {
      const parts = a.fields.map((f) => e.values[f.key]).filter(Boolean);
      let txt = parts.join('，');
      if (e.remark) txt += (txt ? '，' : '') + '备注：' + e.remark;
      lines.push((i + 1) + '. ' + jlSlotLabel(e) + (e.outside ? '（名单外）' : '') + (txt ? '：' + txt : ''));
    });
    if (a.hasRoster && (a.missing || []).length) {
      lines.push('— 未接龙 ' + a.missing.length + ' 人 —');
      lines.push(a.missing.map(jlSlotLabel).join('、'));
    }
    return lines.join('\n');
  };

  view.innerHTML = `
    <button class="ghost jl-back" id="jl-back">← 返回接龙列表</button>
    ${state.jlBanner ? `<div class="jl-banner">${icon('check')} 接龙创建成功！把「学生链接」发到班群即可；本页可随时查看进度、复制提醒文案。<b>管理入口保存在本浏览器</b>，换设备请收藏带令牌的管理链接。</div>` : ''}
    <div class="panel">
      <div class="jl-head"><h2>${esc(a.title)}</h2>${jlStatusBadge(a)}</div>
      ${a.description ? `<p class="jl-desc">${esc(a.description)}</p>` : ''}
      <div class="jl-meta">${a.deadline ? `${icon('clock')} 截止 ${esc(a.deadline)}` : '不限截止时间'}<span>发起于 ${jlFmtTime(a.createdAt)}</span>
        ${a.closedNow ? '<span class="jl-badge warn">已截止，不能再提交</span>' : ''}</div>
      <div class="jl-prog">${jlProgressHtml(a)}</div>
    </div>
    ${canManage ? `<div class="panel">
      <div class="jl-linkrow"><input readonly value="${esc(stuLink)}"><button class="ghost" id="jl-copy-stu">复制学生链接</button>
        <button class="ghost" id="jl-show-qr">二维码</button></div>
      <div class="jl-actions">
        <button class="ghost" id="jl-copy-miss">${icon('copy')} 复制未接名单</button>
        <button class="ghost" id="jl-copy-full">${icon('doc')} 复制接龙全文</button>
        <a class="ghost" id="jl-export" href="/api/jielong/${a.id}/export${tArg}" download>${icon('download')} 导出 CSV</a>
        <button class="ghost" id="jl-per">${icon('link')} 专属链接</button>
        ${canEdit() && token ? `<button class="ghost" id="jl-copy-admin">${icon('users')} 复制管理链接</button>` : ''}
        <button class="ghost" id="jl-edit">${icon('edit')} 编辑</button>
        <button class="ghost" id="jl-close">${a.closed ? `${icon('refresh')} 重新开启` : `${icon('clock')} 停止接龙`}</button>
        <button class="ghost danger" id="jl-del">${icon('trash')} 删除接龙</button>
      </div>
      <div id="jl-per-box" style="display:none">
        <p class="jl-sec">${icon('link')} 专属链接（打开后姓名锁定，防代填；适合私发个人）</p>
        <textarea id="jl-per-list" class="form-like" rows="6" readonly style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font-size:12.5px;resize:vertical"></textarea>
        <div class="jl-actions"><button class="ghost" id="jl-per-copy">复制全部</button></div>
      </div>
    </div>` : ''}
    <div class="panel">
      <h3>${icon('users')} 已接龙（${a.entries.length} 人）</h3>
      ${a.entries.length ? `<div class="jl-tblwrap"><table class="jl-table">
        <thead><tr><th>#</th>${withId ? '<th>学号</th>' : ''}<th>姓名</th>
        ${a.fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>备注</th><th>时间</th>${canManage ? '<th></th>' : ''}</tr></thead>
        <tbody>${a.entries.map((e, i) => `
          <tr><td>${i + 1}</td>
          ${withId ? `<td>${esc(e.id || '—')}</td>` : ''}
          <td><b>${esc(e.name)}</b>${e.outside ? ' <span class="jl-badge warn">名单外</span>' : ''}</td>
          ${a.fields.map((f) => `<td>${esc(e.values[f.key] || '—')}</td>`).join('')}
          <td>${esc(e.remark || '—')}</td>
          <td class="dim">${jlFmtTime(e.time)}</td>
          ${canManage ? `<td><button class="mini danger" data-jl-del-entry="${e.outside || e.rid == null ? 'n:' + esc(e.name) : 'r:' + e.rid}">删除</button></td>` : ''}</tr>`).join('')}</tbody>
      </table></div>` : '<p class="empty-mini">还没有人接龙，快把学生链接发到班群吧</p>'}
    </div>
    ${a.hasRoster ? `<div class="panel">
      <h3>${icon('clock')} 未接龙（${(a.missing || []).length} 人）</h3>
      ${(a.missing || []).length
        ? `<div>${a.missing.map((m) => `<span class="jl-chip" data-jl-per="${m.i}" title="点击复制该同学的专属链接">${esc(jlSlotLabel(m))}</span>`).join('')}</div>`
        : '<p class="empty-mini">全部完成！</p>'}
    </div>` : ''}`;

  state.jlBanner = false;
  $('#jl-back').addEventListener('click', () => { state.jl = null; renderView().catch(() => {}); });

  // 每 5 秒原地刷新（弹窗打开或正在输入时不打扰）
  jlStopTimer();
  jlTimer = setInterval(async () => {
    if ($('#modal-root').children.length) return;
    const el = document.activeElement;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    try {
      await api('/api/jielong/' + state.jl.id); // 先探活，接口挂了就静默跳过本轮
    } catch (e) { /* 静默 */ return; }
    if (!state.jl || state.view !== 'jielong') return; // 探活期间已退出详情页，别再覆盖视图
    const y = window.scrollY; // 在替换 DOM 前捕获，替换后内容高度变化可能重置滚动
    const cur = view.innerHTML;
    state.jlQuiet = true;
    try {
      await loadJielongDetail();
    } catch (e) { /* 静默 */ } finally { state.jlQuiet = false; }
    if (view.innerHTML !== cur) window.scrollTo(0, y);
  }, 5000);
  if (!state.jlQuiet) window.scrollTo(0, 0);

  if (!canManage) return;

  $('#jl-copy-stu').addEventListener('click', () => jlCopy(stuLink, '学生链接已复制'));
  $('#jl-show-qr').addEventListener('click', () => openJlQrModal(stuLink));
  $('#jl-copy-miss').addEventListener('click', () => {
    const missing = a.missing || [];
    if (!a.hasRoster) { toast('本次接龙未设置名单'); return; }
    if (!missing.length) { toast('全部都已接龙'); return; }
    jlCopy('【' + a.title + '】还没有接龙的同学（' + missing.length + '人）：\n' +
      missing.map(jlSlotLabel).join('、') + '\n请点击链接完成接龙：' + stuLink, '已复制，可粘贴到班群提醒大家');
  });
  $('#jl-copy-full').addEventListener('click', () => jlCopy(jlFullText(), '接龙全文已复制，可粘贴到班群'));
  const copyAdmin = $('#jl-copy-admin');
  if (copyAdmin) copyAdmin.addEventListener('click', () => jlCopy(location.origin + '/?jl=' + a.id + '&t=' + encodeURIComponent(token), '管理链接已复制，发给班委即可代管本次接龙'));
  $('#jl-edit').addEventListener('click', () => openJielongEditModal(a, token));
  $('#jl-close').addEventListener('click', async () => {
    const target = !a.closed;
    if (target && !confirm('确定停止接龙？停止后同学将无法再提交（可重新开启）。')) return;
    try {
      await api(`/api/jielong/${a.id}/close${tArg}`, { method: 'POST', body: { closed: target } });
      toast(target ? '已停止接龙' : '已重新开启接龙');
      loadJielongDetail();
    } catch (e) { toast(e.message, 'error'); }
  });
  $('#jl-del').addEventListener('click', async () => {
    if (!confirm(`确定删除整个接龙？「${a.title}」的全部数据（含 ${a.entries.length} 条记录）将被清除，不可恢复！`)) return;
    if (!confirm('再次确认：真的要删除吗？')) return;
    try {
      await api(`/api/jielong/${a.id}${tArg}`, { method: 'DELETE' });
      jlMineSave(jlMine().filter((x) => x.id !== a.id));
      state.jl = null;
      toast('接龙已删除');
      renderView().catch(() => {});
    } catch (e) { toast(e.message, 'error'); }
  });
  const perBtn = $('#jl-per');
  if (perBtn) perBtn.addEventListener('click', () => {
    const box = $('#jl-per-box');
    if (!a.roster.length) { toast('本次接龙未设置名单，没有专属链接'); return; }
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    $('#jl-per-list').value = a.roster.map((r, i) => jlSlotLabel(r) + '：' + stuLink + '?u=' + i).join('\n');
    box.style.display = '';
  });
  const perCopy = $('#jl-per-copy');
  if (perCopy) perCopy.addEventListener('click', () => jlCopy($('#jl-per-list').value, '专属链接已全部复制'));
  $$('[data-jl-per]').forEach((chip) => chip.addEventListener('click', () => {
    const i = +chip.dataset.jlPer;
    if (!(a.roster || [])[i]) return;
    jlCopy(stuLink + '?u=' + i, '已复制 ' + jlSlotLabel(a.roster[i]) + ' 的专属链接');
  }));
  $$('[data-jl-del-entry]').forEach((btn) => btn.addEventListener('click', async () => {
    const key = btn.dataset.jlDelEntry;
    const label = key.startsWith('r:') ? '该同学的' : `「${key.slice(2)}」的`;
    if (!confirm(`确定删除${label}接龙记录？`)) return;
    try {
      await api(`/api/jielong/${a.id}/entry${tArg}${tArg ? '&' : '?'}${key.startsWith('r:') ? 'rid=' + key.slice(2) : 'name=' + encodeURIComponent(key.slice(2))}`, { method: 'DELETE' });
      loadJielongDetail();
    } catch (e) { toast(e.message, 'error'); }
  }));
}

/* ---------- 发起 / 编辑接龙 ---------- */
function openJielongCreateModal() {
  const fields = [{ label: '接龙内容', type: 'text', required: true, options: [] }];
  let withIdTouched = false;

  const rosterPreview = () => {
    const raw = $('#jl-roster').value;
    if (!withIdTouched) $('#jl-withid').checked = jlParseRoster(raw, true).hasIds;
    const parsed = jlParseRoster(raw, $('#jl-withid').checked);
    const pv = $('#jl-roster-pv');
    if (!parsed.list.length) { pv.innerHTML = ''; return; }
    pv.innerHTML = `<div>识别到 <b>${parsed.list.length}</b> 人${$('#jl-withid').checked ? '（含学号）' : ''}：</div>` +
      parsed.list.slice(0, 50).map((r) => `<span class="jl-chip plain">${esc(jlSlotLabel(r))}</span>`).join('') +
      (parsed.list.length > 50 ? `<span class="jl-chip plain">…共 ${parsed.list.length} 人</span>` : '');
  };
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
      <label>从名单库选择（可选）</label>
      <div class="labrow">
        <select id="jl-roster-lib" style="flex:1;min-width:0"><option value="">— 手动粘贴名单 —</option></select>
        <button type="button" class="mini danger" id="jl-roster-lib-del" style="display:none;white-space:nowrap">${icon('trash')} 删除</button>
      </div>
      <label>班级名单（选填，用于自动统计谁没接龙；支持直接粘贴 Excel / QQ 名单）</label>
      <textarea id="jl-roster" rows="5" placeholder="每行一个，支持“学号 姓名”&#10;例如：&#10;2023001 张三&#10;2. 李四&#10;王五"></textarea>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer"><input type="checkbox" id="jl-withid" style="width:auto"> 名单包含学号（输入学号或姓名都能匹配）</label>
      <div id="jl-roster-pv" class="jl-roster-pv"></div>
      <label>保存到名单库（选填，同名覆盖，下次创建时可直接选用）</label>
      <input id="jl-roster-libname" maxlength="60" placeholder="例如：三年二班名单">
      <label>截止时间（选填）</label>
      <input id="jl-deadline" type="datetime-local">
      <label>接龙内容（同学需要填写的项目，可增减）</label>
      <div id="jl-fields"></div>
      <button class="ghost" id="jl-addfield" type="button">${icon('plus')} 添加填写项</button>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer;margin-top:12px"><input type="checkbox" id="jl-outside" checked style="width:auto"> 允许名单外的同学接龙（会标记“名单外”）</label>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="jl-save">创建接龙</button>
    </div>`);

  renderFields();
  $('#jl-roster').addEventListener('input', rosterPreview);
  $('#jl-withid').addEventListener('change', () => { withIdTouched = true; rosterPreview(); });
  $('#jl-addfield').addEventListener('click', () => {
    if (fields.length >= 8) { toast('最多 8 个填写项', 'error'); return; }
    fields.push({ label: '', type: 'text', required: true, options: [] });
    renderFields();
  });
  rosterPreview();
  setupRosterLib('jl', (r) => {
    $('#jl-roster').value = r.roster;
    $('#jl-withid').checked = !!r.keepId;
    withIdTouched = true;
    rosterPreview();
  });

  $('#jl-save').addEventListener('click', async () => {
    const title = $('#jl-title').value.trim();
    if (!title) { toast('请填写接龙标题', 'error'); return; }
    try {
      const libName = $('#jl-roster-libname').value.trim();
      if (libName) await saveRosterToLib('jl', libName, $('#jl-roster').value, $('#jl-withid').checked);
      const r = await api('/api/jielong', { method: 'POST', body: {
        title,
        description: $('#jl-desc').value.trim(),
        rosterRaw: $('#jl-roster').value,
        keepId: $('#jl-withid').checked,
        deadline: valToDt($('#jl-deadline').value) || null,
        allowOutside: $('#jl-outside').checked,
        fields: fields.filter((f) => f.label.trim()).map((f) => ({ label: f.label.trim(), type: f.type, required: f.required, options: f.options || [] })),
      } });
      jlMineRemember(r.id, r.adminToken, title);
      closeModal();
      state.jl = { id: r.id, token: r.adminToken };
      state.jlBanner = true;
      if (state.view !== 'jielong') state.view = 'jielong';
      syncNavActive();
      renderView().catch(() => {});
      toast('接龙创建成功 ✓');
    } catch (e) { toast(e.message, 'error'); }
  });
}

function openJielongEditModal(a, token) {
  const tArg = token ? '?t=' + encodeURIComponent(token) : '';
  openModal(`
    <h2>${icon('edit')} 编辑接龙</h2>
    <div class="form">
      <label>标题</label><input id="jl-e-title" maxlength="60" value="${esc(a.title)}">
      <label>说明</label><textarea id="jl-e-desc" rows="2" maxlength="1000">${esc(a.description || '')}</textarea>
      <label>截止时间（留空表示不设截止）</label><input id="jl-e-deadline" type="datetime-local" value="${dtToVal(a.deadline)}">
      <label>名单（保存后已接记录自动重新匹配；不在新名单中的已接记录会转为“名单外”）</label>
      <textarea id="jl-e-roster" rows="5">${esc((a.roster || []).map(jlSlotLabel).join('\n'))}</textarea>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer"><input type="checkbox" id="jl-e-withid" style="width:auto"${(a.roster || []).some((r) => r.id) ? ' checked' : ''}> 名单包含学号</label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer"><input type="checkbox" id="jl-e-outside" style="width:auto"${a.allowOutside ? ' checked' : ''}> 允许名单外的同学接龙</label>
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="jl-e-save">保存修改</button>
    </div>`);
  $('#jl-e-save').addEventListener('click', async () => {
    if (!$('#jl-e-title').value.trim()) { toast('标题不能为空', 'error'); return; }
    try {
      await api(`/api/jielong/${a.id}${tArg}`, { method: 'PUT', body: {
        title: $('#jl-e-title').value,
        description: $('#jl-e-desc').value,
        deadline: valToDt($('#jl-e-deadline').value) || null,
        rosterRaw: $('#jl-e-roster').value,
        keepId: $('#jl-e-withid').checked,
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
        ${canEdit() ? `<button class="ghost danger" data-dw-del="${d.id}">${icon('trash')} 删除</button>` : ''}
      </div>
    </div>`).join('');
  view.innerHTML = `
    <div class="jl-head"><h2>${icon('draw')} 抽签点名</h2></div>
    <p class="hint">按班级名单建签箱：抽过的人自动排除，下次不会被抽到；箱内抽空后自动开始新一轮，保证大家轮流参加。</p>
    ${canEdit() ? `<div class="jl-actions"><button class="primary" id="btn-dw-create">${icon('plus')} 新建签箱</button></div>` : ''}
    ${items || `<div class="empty"><div class="big">${icon('draw')}</div>还没有签箱<br>${canEdit() ? '点上面「新建签箱」，粘贴班级名单就能开始抽签' : '发起后签箱会出现在这里'}</div>`}`;
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
      ${canEdit() ? `
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
    ${canEdit() ? `<div class="jl-actions">
      <button class="ghost" id="dw-edit">${icon('edit')} 编辑签箱</button>
      <button class="ghost danger" id="dw-del">${icon('trash')} 删除签箱</button>
    </div>` : ''}`;
  $('#dw-back').addEventListener('click', () => { state.draw = null; renderView().catch(() => {}); });
  if (!canEdit()) return;

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
  let withIdTouched = false;
  const rosterPreview = () => {
    const raw = $('#dw-roster').value;
    if (!withIdTouched) $('#dw-withid').checked = jlParseRoster(raw, true).hasIds;
    const parsed = jlParseRoster(raw, $('#dw-withid').checked);
    const pv = $('#dw-roster-pv');
    if (!parsed.list.length) { pv.innerHTML = ''; return; }
    pv.innerHTML = `<div>识别到 <b>${parsed.list.length}</b> 人${$('#dw-withid').checked ? '（含学号）' : ''}：</div>` +
      parsed.list.slice(0, 50).map((r) => `<span class="jl-chip plain">${esc(jlSlotLabel(r))}</span>`).join('') +
      (parsed.list.length > 50 ? `<span class="jl-chip plain">…共 ${parsed.list.length} 人</span>` : '');
  };
  openModal(`
    <h2>${icon('draw')} 新建签箱</h2>
    <div class="form">
      <label>抽签标题</label>
      <input id="dw-title" maxlength="60" placeholder="例如：运动会志愿者抽签">
      <label>从名单库选择（可选）</label>
      <div class="labrow">
        <select id="dw-roster-lib" style="flex:1;min-width:0"><option value="">— 手动粘贴名单 —</option></select>
        <button type="button" class="mini danger" id="dw-roster-lib-del" style="display:none;white-space:nowrap">${icon('trash')} 删除</button>
      </div>
      <label>班级名单（支持直接粘贴 Excel / QQ 名单）</label>
      <textarea id="dw-roster" rows="5" placeholder="每行一个，支持“学号 姓名”&#10;例如：&#10;2023001 张三&#10;2. 李四&#10;王五"></textarea>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer"><input type="checkbox" id="dw-withid" style="width:auto"> 名单包含学号（重名班级建议保留，按学号区分）</label>
      <div id="dw-roster-pv" class="jl-roster-pv"></div>
      <label>保存到名单库（选填，同名覆盖，下次创建时可直接选用）</label>
      <input id="dw-roster-libname" maxlength="60" placeholder="例如：三年二班名单">
      <label>每次抽几人（抽签时还可以临时改）</label>
      <input id="dw-perdraw" type="number" min="1" value="1">
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="dw-save">创建签箱</button>
    </div>`);
  rosterPreview();
  setupRosterLib('dw', (r) => {
    $('#dw-roster').value = r.roster;
    $('#dw-withid').checked = !!r.keepId;
    withIdTouched = true;
    rosterPreview();
  });
  $('#dw-roster').addEventListener('input', rosterPreview);
  $('#dw-withid').addEventListener('change', () => { withIdTouched = true; rosterPreview(); });
  $('#dw-save').addEventListener('click', async () => {
    const title = $('#dw-title').value.trim();
    if (!title) { toast('请填写抽签标题', 'error'); return; }
    try {
      const libName = $('#dw-roster-libname').value.trim();
      if (libName) await saveRosterToLib('dw', libName, $('#dw-roster').value, $('#dw-withid').checked);
      const r = await api('/api/draw', { method: 'POST', body: {
        title,
        rosterRaw: $('#dw-roster').value,
        keepId: $('#dw-withid').checked,
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
  let withIdTouched = true;
  const rosterPreview = () => {
    const parsed = jlParseRoster($('#dw-e-roster').value, $('#dw-e-withid').checked);
    const pv = $('#dw-e-roster-pv');
    if (!parsed.list.length) { pv.innerHTML = ''; return; }
    pv.innerHTML = `<div>识别到 <b>${parsed.list.length}</b> 人${$('#dw-e-withid').checked ? '（含学号）' : ''}</div>`;
  };
  openModal(`
    <h2>${icon('edit')} 编辑签箱</h2>
    <div class="form">
      <label>标题</label><input id="dw-e-title" maxlength="60" value="${esc(d.title)}">
      <label>名单（保存后按“学号+姓名”匹配已抽记录；不在新名单中的已抽记录自动失效）</label>
      <textarea id="dw-e-roster" rows="5">${esc(d.roster ? d.roster.map(jlSlotLabel).join('\n') : '')}</textarea>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);cursor:pointer"><input type="checkbox" id="dw-e-withid" style="width:auto"${(d.roster || []).some((r) => r.id) ? ' checked' : ''}> 名单包含学号</label>
      <div id="dw-e-roster-pv" class="jl-roster-pv"></div>
      <label>每次抽几人</label>
      <input id="dw-e-perdraw" type="number" min="1" value="${d.perDraw}">
    </div>
    <div class="modal-foot">
      <button class="ghost" id="btn-cancel">取消</button>
      <button class="primary" id="dw-e-save">保存修改</button>
    </div>`);
  rosterPreview();
  $('#dw-e-roster').addEventListener('input', rosterPreview);
  $('#dw-e-withid').addEventListener('change', rosterPreview);
  $('#dw-e-save').addEventListener('click', async () => {
    if (!$('#dw-e-title').value.trim()) { toast('标题不能为空', 'error'); return; }
    try {
      await api('/api/draw/' + d.id, { method: 'PUT', body: {
        title: $('#dw-e-title').value,
        rosterRaw: $('#dw-e-roster').value,
        keepId: $('#dw-e-withid').checked,
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
const bdChip = (m) => {
  if (m.pending) return '<span class="bd-chip pending">生日待填</span>';
  if (m.isToday) return '<span class="bd-chip today">今天生日</span>';
  if (m.daysUntil === 1) return '<span class="bd-chip soon">明天生日</span>';
  if (m.daysUntil <= 7) return `<span class="bd-chip soon">还有 ${m.daysUntil} 天</span>`;
  return `<span class="bd-chip later">${m.month} 月 ${m.day} 日 · 还有 ${m.daysUntil} 天</span>`;
};

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

async function loadBirthdays() {
  const seq = loadSeq;
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/birthdays');
  if (seq !== loadSeq) return;
  const wishes = {};
  const wishOf = (m) => { if (!wishes[m.id]) wishes[m.id] = bdWish(m); return wishes[m.id]; };
  const bdAvaColor = (m) => ['linear-gradient(135deg,#f783ac,#f9c74f)', 'linear-gradient(135deg,#a78bfa,#60a5fa)', 'linear-gradient(135deg,#4ade80,#38bdf8)', 'linear-gradient(135deg,#fb923c,#f472b6)'][(m.name || '?').charCodeAt(0) % 4];
  const bdWeek = (d) => '周' + '日一二三四五六'[new Date(d + 'T00:00:00').getDay()];

  const todayCards = data.today.map((m) => `
    <div class="bd-hero">
      <div class="bd-bunting"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      ${data.today.length === 1 ? `<div class="bd-date">${bdWeek(m.nextDate.slice(0, 10))} · ${esc(m.nextDate.slice(0, 10))}</div>` : ''}
      ${data.hasBadge ? `<div class="bd-mark" style="background-image:url('/api/class-badge?r=${Date.now()}')"></div>` : ''}
      <span class="bd-balloon" style="left:5%;animation-delay:0s">🎈</span>
      <span class="bd-balloon" style="left:15%;animation-delay:2.6s;font-size:16px">🎈</span>
      <span class="bd-balloon" style="left:88%;animation-delay:1.2s">🎈</span>
      <span class="bd-balloon" style="left:78%;animation-delay:3.4s;font-size:15px">🎈</span>
      <span class="bd-spark" style="left:12%;top:18%">✨</span>
      <span class="bd-spark" style="left:85%;top:26%;animation-delay:1.1s">✨</span>
      <span class="bd-spark" style="left:70%;top:12%;animation-delay:1.8s;font-size:13px">✨</span>
      ${['#f9a8d4', '#fcd34d', '#a5b4fc', '#86efac'].map((c, i) => `<i class="bd-cf" style="left:${8 + i * 22}%;background:${c};animation-delay:${i * 0.9}s"></i>`).join('')}
      <div class="bd-cake">🎂</div>
      <div class="bd-todaylabel">今 天 过 生 日</div>
      <div class="bd-name">${esc(m.name)}</div>
      ${m.turningAge != null ? `<div class="bd-role"><span class="jl-badge on">将满 ${m.turningAge} 岁的生日</span></div>` : ''}
      <div class="bd-wish">「${esc(wishOf(m))}」</div>
      <div class="bd-from">—— 全班同学 ——</div>
      <div class="bd-actions"><button class="ghost" data-bd-copy="${m.id}">${icon('copy')} 复制祝福发到班群</button></div>
    </div>`).join('');
  const nearest = data.items.find((x) => !x.pending && !x.isToday && x.daysUntil != null);
  const todayWrap = data.today.length
    ? `<div class="bd-todaygrid">${todayCards}</div>`
    : `<div class="bd-calm">${icon('birthday')} 今天没有寿星${nearest ? `，最近的是 <b>${esc(nearest.name)}</b>（${nearest.month} 月 ${nearest.day} 日，还有 ${nearest.daysUntil} 天）` : ''}，每一天都值得被温柔对待</div>`;

  const upCards = data.items.filter((m) => !m.isToday).map((m, i) => `
    <div class="bd-card${m.pending ? ' pending' : (m.daysUntil <= 7 ? ' soon' : '')}${canEdit() ? ' has-acts' : ''}" style="animation-delay:${Math.min(i * 45, 600)}ms">
      <div class="bd-ava" style="background:${m.pending ? 'var(--hover)' : bdAvaColor(m)}">${m.pending ? '?' : esc(Array.from(m.name || '?')[0])}</div>
      <div class="bd-uinfo">
        <div class="bd-uname">${esc(m.name)}</div>
        <div class="bd-usub">${m.pending ? '生日待填' : `${icon('birthday')} ${m.month} 月 ${m.day} 日${m.turningAge != null ? ' · 将满 ' + m.turningAge + ' 岁' : ''}`}</div>
      </div>
      <div class="bd-dayspill">${m.pending ? '<span style="font-size:12px">待填</span>' : `<b>${m.daysUntil}</b><span>天后</span>`}</div>
      ${canEdit() ? `<div class="bd-acts"><button class="mini" data-bd-edit="${m.id}" title="编辑">${icon('edit')}</button><button class="mini danger" data-bd-del="${m.id}" title="删除">${icon('trash')}</button></div>` : ''}
    </div>`).join('');

  // 名单库导入控件
  let libHtml = '';
  if (canEdit()) {
    let lib = [];
    try { lib = (await api('/api/rosters')).items; } catch (e) { /* 忽略 */ }
    if (seq !== loadSeq) return; // 名单库慢响应期间切走视图，不再覆盖
    if (lib.length) {
      libHtml = `
      <div class="jl-actions">
        <select id="bd-import-lib" style="max-width:260px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)">
          ${lib.map((r) => `<option value="${r.id}">${esc(r.name)}（${r.count} 人）</option>`).join('')}
        </select>
        <button class="ghost" id="bd-import">${icon('download')} 导入名单</button>
        <span class="hint" style="margin:0">导入后逐个补填生日即可</span>
      </div>`;
    }
  }
  // 班徽背景管理
  const badgeHtml = canEdit() ? `
    <div class="jl-actions" style="margin-top:6px">
      <label class="ghost" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px">${icon('image')} 上传班徽背景<input id="bd-badge-file" type="file" accept="image/*" style="display:none"></label>
      ${data.hasBadge ? '<button class="ghost" id="bd-badge-del">移除班徽</button>' : ''}
      <span class="hint" style="margin:0">上传后作为生日祝福墙的水印背景（半透明，不挡文字）</span>
    </div>` : '';

  view.innerHTML = `
    <div class="bd-page">
    <div class="jl-head"><h2>${icon('birthday')} 生日祝福</h2></div>
    <p class="hint">每一岁都值得庆祝，每一个人都值得被记得。生日当天这里会变成祝福墙，信息页和浏览器通知也会提醒。</p>
    ${todayWrap}
    <div class="panel">
      <div class="jl-head" style="margin:0 0 4px"><h3 style="margin:0">${icon('birthday')} 生日倒计时（${data.items.filter((x) => !x.isToday).length} 人）</h3></div>
      ${upCards ? `<div class="bd-grid">${upCards}</div>` : `<div class="empty"><div class="big">${icon('birthday')}</div>还没有成员<br>${canEdit() ? '先在名单库保存班级名单，再从下面一键导入' : '等老师添加成员后，这里就会热闹起来'}</div>`}
      ${libHtml}
      ${badgeHtml}
      ${canEdit() ? `<div class="jl-actions"><button class="primary" id="btn-bd-add">${icon('plus')} 添加成员</button></div>` : ''}
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

/* ========= 命令面板（Ctrl/⌘+K，参考 Linear 的 cmdk 交互） ========= */
const CMDK_VIEWS = [
  ['feed', '信息中心', 'feed'], ['inbox', '等待审核', 'inbox'], ['tasks', '待办任务', 'check'],
  ['jielong', '活动接龙', 'jielong'], ['draw', '抽签点名', 'draw'], ['birthday', '生日祝福', 'birthday'],
  ['calendar', '日历详情', 'calendar'], ['files', '文件中心', 'file'], ['stats', '统计接入', 'chart'],
  ['rosters', '名单库', 'users'],
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

function cmdkCommands() {
  // 名单库是管理功能（访客隐藏入口），命令面板同步按权限过滤
  const views = canEdit() ? CMDK_VIEWS : CMDK_VIEWS.filter(([v]) => v !== 'rosters');
  const cmds = views.map(([v, label, ic]) => ({
    iconHtml: icon(ic), label: '转到：' + label, hint: '视图',
    run: () => { state.view = v; renderView().catch((e) => toast(e.message, 'error')); },
  }));
  if (canEdit()) {
    cmds.push(
      { iconHtml: icon('plus'), label: '添加信息', hint: '操作', run: () => openMessageModal(null) },
      { iconHtml: icon('jielong'), label: '发起接龙', hint: '操作', run: () => { state.view = 'jielong'; renderView().catch(() => {}); setTimeout(openJielongCreateModal, 80); } },
      { iconHtml: icon('draw'), label: '新建签箱', hint: '操作', run: () => { state.view = 'draw'; renderView().catch(() => {}); setTimeout(openDrawCreateModal, 80); } },
      { iconHtml: icon('birthday'), label: '添加生日成员', hint: '操作', run: () => { state.view = 'birthday'; renderView().catch(() => {}); setTimeout(() => openBdayModal(null), 80); } },
      { iconHtml: icon('download'), label: '导出 JSON 备份', hint: '操作', run: () => window.open('/api/export') },
      { iconHtml: icon('calendar'), label: '导出日历（.ics）', hint: '操作', run: () => window.open('/api/calendar.ics') },
    );
  }
  cmds.push(
    { iconHtml: icon('clock'), label: '切换外观（浅色 / 深色 / 自动）', hint: '操作', run: () => $('#btn-theme').click() },
    { iconHtml: icon('search'), label: '聚焦搜索框', hint: '操作', run: () => $('#search').focus() },
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
    if (canEdit()) api('/api/messages/' + it.it.id).then(openMessageModal).catch((e) => toast(e.message, 'error'));
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
      <kbd class="kbd">1 – 9</kbd><span>切换视图（信息 / 待审 / 待办 / 接龙 / 抽签 / 生日 / 日历 / 文件 / 统计）</span>
      <kbd class="kbd">Esc</kbd><span>关闭弹窗或面板</span>
      <kbd class="kbd">Ctrl / ⌘ + Enter</kbd><span>保存正在编辑的信息</span>
    </div>
    <div class="modal-foot"><button class="primary" id="btn-cancel">知道了</button></div>`);
}

/* ========= 视图切换 ========= */
// 顶栏控件只在适用的页面显示：排序只在信息流有用；统计页不响应群筛选
function syncTopbar() {
  $('#group-sel').style.display = (state.view === 'stats' || state.view === 'jielong' || state.view === 'draw' || state.view === 'birthday' || state.view === 'rosters') ? 'none' : '';
  $('#sortsel').style.display = state.view === 'feed' ? '' : 'none';
}
// 视图加载代次：renderView 每次自增并传给视图加载器。加载器的响应回来时若代次已变
// （用户已切换视图 / 改了筛选），直接丢弃，防止慢的旧请求覆盖新界面
let loadSeq = 0;
async function renderView() {
  jlStopTimer();
  const seq = ++loadSeq;
  saveFilters();
  syncNavActive();
  syncTopbar();
  renderChips();
  const view = $('#view');
  try {
    if (state.view === 'feed') await loadFeed();
    else if (state.view === 'inbox') await loadInbox();
    else if (state.view === 'tasks') await loadTasks();
    else if (state.view === 'jielong') await loadJielong();
    else if (state.view === 'draw') await loadDraw();
    else if (state.view === 'birthday') await loadBirthdays();
    else if (state.view === 'calendar') await loadCalendar();
    else if (state.view === 'files') await loadFiles();
    else if (state.view === 'rosters') await loadRosters();
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
const MORE_VIEWS = ['inbox', 'calendar', 'files', 'stats', 'rosters'];
function syncNavActive() {
  $$(NAV_SEL).forEach((b) => {
    b.classList.toggle('active', b.dataset.view === state.view);
    if (b.dataset.view) {
      if (b.dataset.view === state.view) b.setAttribute('aria-current', 'page');
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
      if (state.view !== 'stats') renderView().catch((e2) => toast(e2.message, 'error'));
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
    if (!canEdit()) return;
    const gi = e.target.closest('.gitem');
    if (!gi || !gi.dataset.gid) return;
    const g = state.groups.find((x) => String(x.id) === gi.dataset.gid);
    if (g) openGroupModal(g);
  });

  if (canEdit()) {
    $('#btn-add').addEventListener('click', () => openMessageModal(null));
    $('#fab').addEventListener('click', () => openMessageModal(null));
    $('#btn-add-group').addEventListener('click', () => openGroupModal(null));
  }
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
      $('#search').focus();
    } else if (e.key === '?') {
      e.preventDefault();
      openHelpModal();
    } else if ((e.key === 'n' || e.key === 'N') && canEdit()) {
      e.preventDefault();
      openMessageModal(null);
    } else if (/^[1-9]$/.test(e.key)) {
      const v = CMDK_VIEWS[Number(e.key) - 1];
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
      if (!canEdit()) return;
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
  // 手机状态栏 / 浏览器标签框颜色跟随主题
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.content = t === 'dark' ? '#141922' : '#4f6ef2';
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
    const dirtyFields = modal && $$('.modal input[type=text], .modal input[type=number], .modal input[type=datetime-local], .modal input[type=password], .modal textarea', modal)
      .some((el) => el.value.trim());
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
  if (!canEdit()) return;
  try {
    const d = await api('/api/inbox?limit=1');
    setNavBadge('inbox', d.total || 0);
  } catch (e) { /* 只读访客无权限，静默 */ }
}

/* ========= 启动 ========= */
bindEvents();
initExtras();
restoreFilters();
// 管理链接委托入口：/?jl=接龙ID&t=管理令牌 → 直接打开该接龙的管理页（班委无需登录）
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
// 先取会话状态（决定只读模式），再渲染首屏
loadMe().finally(() => refresh());
