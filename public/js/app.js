'use strict';

/* ========= 工具 ========= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

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
  return (friendlyDate(date) + (time ? ' ' + time.slice(0, 5) : ''));
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
  return `<span class="dlchip ${cls}">${esc(label)}</span>`;
}

const CATS = {
  notice: { label: '通知', icon: '📢' },
  task: { label: '任务', icon: '📝' },
  activity: { label: '活动', icon: '🎪' },
  file: { label: '文件', icon: '📎' },
  other: { label: '其他', icon: '💬' },
};
const PLATS = {
  qq: { label: 'QQ', cls: 'plat-qq', emoji: '🐧' },
  wechat: { label: '微信', cls: 'plat-wx', emoji: '💬' },
  other: { label: '其他', cls: 'plat-ot', emoji: '📂' },
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
    // 管理员会话过期：提示后回登录页（只读访客只提示，不跳转）
    if (r.status === 401 && state.me && state.me.loggedIn) {
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
  el.textContent = msg;
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
  cache: {},
  editingId: null,
  pendingFiles: [],
  existingAtts: [],
  me: { authRequired: false, loggedIn: true, readOnly: false }, // 会话状态（启动时从 /api/me 拉取）
  cal: { y: new Date().getFullYear(), m: new Date().getMonth() + 1 },
  calByDay: {},
  dividerShown: false,
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
function openModal(html) {
  $('#modal-root').innerHTML = `<div class="backdrop"><div class="modal">${html}</div></div>`;
  const bd = $('#modal-root .backdrop');
  // 只有"按下"和"松开"都在遮罩上才关闭——在弹窗里选中文字拖到遮罩上不会误关
  let downOnBackdrop = false;
  bd.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === bd; });
  bd.addEventListener('click', (e) => { if (e.target === bd && downOnBackdrop) closeModal(); });
  const cancel = $('#btn-cancel');
  if (cancel) cancel.addEventListener('click', closeModal);
}
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ========= 侧栏 / 顶栏 ========= */
function platEmoji(p) { return (PLATS[p] || PLATS.other).emoji; }

function renderSidebar() {
  $('#grouplist').innerHTML =
    `<div class="gitem ${state.group ? '' : 'active'}" data-gid="">🗂 全部群</div>` +
    state.groups.map((g) => `
      <div class="gitem ${String(state.group) === String(g.id) ? 'active' : ''}" data-gid="${g.id}">
        <span class="dot" style="background:${esc(g.color)}"></span>
        ${platEmoji(g.platform)} ${esc(g.name)}
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
  const chips = [['', '全部'], ['notice', '📢 通知'], ['task', '📝 任务'], ['activity', '🎪 活动'], ['file', '📎 文件'], ['other', '💬 其他']];
  // 手机上没有侧栏：群筛选激活时在这里显示可关闭的小标签
  const g = state.groups.find((x) => String(x.id) === String(state.group));
  const groupChip = g ? `<button class="chipbtn active" data-clear-group="1" title="清除群筛选">👥 ${esc(g.name)} ✕</button>` : '';
  $('#chips').innerHTML = groupChip + chips.map(([k, l]) =>
    `<button class="chipbtn ${state.category === k ? 'active' : ''}" data-cat="${k}">${l}</button>`).join('') +
    `<label class="showdone"><input type="checkbox" id="showdone" ${state.showDone ? 'checked' : ''}> 显示已完成</label>`;
  $('#chips').style.display = state.view === 'feed' ? 'flex' : 'none';
  // 让选中的分类滚进视野（手机上点后面的标签时不会弹回最左）
  const act = $('#chips .chipbtn.active');
  if (act && act.scrollIntoView) {
    try { act.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* 老浏览器忽略 */ }
  }
}

/* ========= 信息流 ========= */
function cardHTML(it) {
  const cat = CATS[it.category] || CATS.other;
  const plat = it.group_platform ? (PLATS[it.group_platform] || PLATS.other) : null;
  const done = it.status === 'done';
  const tags = (it.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const body = (it.content || '').replace(/\r/g, '').trim();
  const short = body.length > 150 ? body.slice(0, 150) + '…' : body;
  const atts = (it.attachments || []).map((a) => {
    // 图片附件直接显示缩略图（/raw 不计阅读数），点击看大图才算一次阅读
    if (/^image\//.test(a.mime || '')) {
      return `<a class="att-thumb" href="/api/attachments/${a.id}/download" target="_blank" title="${esc(a.orig_name)}"><img loading="lazy" src="/api/attachments/${a.id}/raw" alt="${esc(a.orig_name)}"></a>`;
    }
    return `<a class="att" href="/api/attachments/${a.id}/download" target="_blank">📄 ${esc(a.orig_name)} <span class="att-size">${fmtSize(a.size)}</span></a>`;
  }).join('');
  return `<article class="card cat-${it.category}${done ? ' done' : ''}${it.pinned ? ' pinned' : ''}" data-id="${it.id}">
    <div class="card-top">
      <span class="badge cat-${it.category}">${cat.icon} ${cat.label}</span>
      ${it.pinned ? '<span class="pintag">📍</span>' : ''}
      ${it.group_name ? `<span class="chip ${plat ? plat.cls : ''}">${plat ? plat.label : ''}·${esc(it.group_name)}</span>` : ''}
      ${it.sender_name ? `<span class="sender">👤 ${esc(it.sender_name)}</span>` : ''}
      <span class="spacer"></span>
      <span class="time">${esc(fmtReceived(it.received_at))}</span>
    </div>
    <h3 class="card-title">${hl(it.title || '(无标题)', state.q)}</h3>
    ${short ? `<p class="card-body">${hl(short, state.q)}</p>` : ''}
    <div>${dlChip(it.deadline)}</div>
    ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    ${atts ? `<div class="atts">${atts}</div>` : ''}
    ${canEdit() ? `<div class="card-actions">
      <button data-act="toggle" class="ghost">${done ? '↩ 取消完成' : '✓ 完成'}</button>
      <button data-act="pin" class="ghost">${it.pinned ? '📍 取消置顶' : '📍 置顶'}</button>
      <button data-act="edit" class="ghost">✏️ 编辑</button>
      <button data-act="del" class="ghost danger">🗑 删除</button>
    </div>` : ''}
  </article>`;
}

async function loadFeed(append = false) {
  const view = $('#view');
  if (!append) view.innerHTML = '<div class="loading">加载中…</div>';
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
  state.total = data.total;
  data.items.forEach((it) => { state.cache[it.id] = it; });
  const more = $('#btn-more');
  if (more) more.closest('.morewrap').remove();

  // 已完成区：勾选“显示已完成”时一次性取最近 100 条，永远固定在最底部
  let doneSection = '';
  if (state.showDone && offset === 0) {
    const dp = new URLSearchParams(params);
    dp.set('status', 'done');
    dp.set('sort', 'time');
    dp.set('limit', '100');
    dp.delete('offset');
    try {
      const d = await api('/api/messages?' + dp);
      d.items.forEach((it) => { state.cache[it.id] = it; });
      if (d.items.length) {
        doneSection = `<div id="done-sec"><div class="feeddivider">✅ 已完成（${d.total}${d.total > d.items.length ? '，显示最近 ' + d.items.length + ' 条' : ''}）</div>${d.items.map(cardHTML).join('')}</div>`;
      }
    } catch (e) { /* 已完成区加载失败不影响主列表 */ }
  }

  if (offset === 0) view.innerHTML = '';
  if (state.total === 0) {
    const filtered = !!(state.q || state.category || state.group);
    view.innerHTML = filtered
      ? `<div class="empty"><div class="big">🔍</div>当前筛选条件下没有信息<br>
         <button id="btn-clear-filter" class="ghost" style="margin-top:12px">✕ 清除筛选，查看全部信息</button></div>`
      : canEdit()
        ? `<div class="empty"><div class="big">📭</div>还没有记录<br>点右上角「＋ 添加信息」，把老师发的通知粘贴进来试试</div>`
        : `<div class="empty"><div class="big">📭</div>还没有记录<br>老师发布通知后会出现在这里</div>`;
    if (doneSection) view.insertAdjacentHTML('beforeend', doneSection);
    return;
  }
  // 提醒功能一次性引导（仅在通知权限未决定时出现）
  if (!append && 'Notification' in window && Notification.permission === 'default' && !localStorage.getItem('infohub-notif-dismissed')) {
    view.insertAdjacentHTML('afterbegin', `<div class="notifbar">🔔 建议开启截止提醒：逾期和 24 小时内截止的任务会自动弹窗通知
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
  const newMore = $('#btn-more');
  if (newMore) newMore.addEventListener('click', () => { loadFeed(true).catch((e) => toast(e.message, 'error')); });
}

/* ========= 待审核收件箱（QQ review 模式） ========= */
function inboxRow(it) {
  return `<div class="irow" data-iid="${it.id}">
    <div class="imain">
      <div class="itext">${hl(it.content, state.q)}</div>
      <div class="imeta">
        ${it.group_name ? `<span class="chip plat-qq">🐧 ${esc(it.group_name)}</span>` : ''}
        ${it.sender_name ? `<span>👤 ${esc(it.sender_name)}</span>` : ''}
        <span>⏰ ${esc(fmtReceived(it.received_at))}</span>
      </div>
    </div>
    <span class="spacer"></span>
    <div class="ibtns">
      <button class="ghost" data-iact="accept" data-iid="${it.id}">✓ 收录</button>
      <button class="ghost danger" data-iact="dismiss" data-iid="${it.id}">忽略</button>
    </div>
  </div>`;
}
async function loadInbox() {
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const data = await api('/api/inbox');
  setNavBadge('inbox', data.total);
  const items = !state.q ? data.items : data.items.filter((it) =>
    ((it.content || '') + (it.sender_name || '') + (it.group_name || '')).toLowerCase().includes(state.q.toLowerCase()));
  if (!data.items.length) {
    view.innerHTML = `<div class="empty"><div class="big">🎉</div>没有待审核的消息<br>QQ 机器人的消息会先进到这里，收录后才会出现在信息流</div>`;
    return;
  }
  view.innerHTML = `
    <div class="inboxhead">
      <h3>📥 待审核（${items.length}${items.length !== data.total ? '/' + data.total : ''}）</h3>
      <span class="hint">收录后自动识别分类和截止时间；与已有信息重复的可以直接忽略</span>
      <span class="spacer"></span>
      <button class="ghost" id="btn-inbox-accept-all">✓ 全部收录</button>
      <button class="ghost danger" id="btn-inbox-clear">🗑 全部忽略</button>
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
    ${canEdit() ? '<button class="tcheck" data-act="toggle" title="标记完成">✓</button>' : ''}
    <div class="tmain">
      <div class="ttitle"${canEdit() ? ' data-act="edit"' : ''}>${hl(it.title || (it.content || '').slice(0, 30), state.q)}</div>
      <div class="tmeta">
        ${it.group_name ? `<span class="chip ${plat ? plat.cls : ''}">${plat ? plat.label : ''}·${esc(it.group_name)}</span>` : ''}
        ${it.sender_name ? `<span>👤 ${esc(it.sender_name)}</span>` : ''}
        ${dlChip(it.deadline)}
        ${attN ? `<span>📎 ${attN} 个附件</span>` : ''}
      </div>
    </div>
  </div>`;
}

async function loadTasks() {
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
  const overdueTotal = odRes.total || 0;
  const items = odRes.items.concat(upRes.items, tdRes.items.filter((it) => !it.deadline));
  items.forEach((it) => { state.cache[it.id] = it; });
  if (!items.length) {
    view.innerHTML = `<div class="empty"><div class="big">🎉</div>没有待办任务，太棒了！<br>任务类信息或带截止时间的信息会出现在这里</div>`;
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
    ? `⏰ 已逾期（共 ${overdueTotal} 条，显示最近 ${buckets.overdue.length} 条）`
    : `⏰ 已逾期（${buckets.overdue.length}）`;
  view.innerHTML =
    `<div class="taskhead"><span class="hint">按截止时间排列，点圆圈打勾完成，点标题可编辑</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="ghost" id="btn-ics">📅 导出到手机日历（.ics）</button>
        <button class="ghost" id="btn-print">🖨 打印清单</button>
      </span></div>` +
    sec('overdue', overdueTitle, buckets.overdue) +
    sec('today', '🔥 今天要完成', buckets.today) +
    sec('week', '📅 未来 7 天', buckets.week) +
    sec('later', '🗓 以后 / 无截止', buckets.later);
  $('#btn-ics').addEventListener('click', () => window.open('/api/calendar.ics'));
  $('#btn-print').addEventListener('click', () => window.print());
}

/* ========= 日历视图 ========= */
async function loadCalendar() {
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  // 只取未逾期事项（due=after）：大数据量下按截止升序的前 200 条全是历史逾期，当月事项会被挤出
  const params = new URLSearchParams({ status: 'open', sort: 'deadline', due: 'after', limit: '300' });
  if (state.group) params.set('group_id', state.group);
  const data = await api('/api/messages?' + params);
  state.calByDay = {};
  for (const it of data.items) {
    if (!it.deadline) continue;
    (state.calByDay[it.deadline.slice(0, 10)] ||= []).push(it);
    state.cache[it.id] = it;
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
      `<button class="calchip cat-${it.category}" data-cal="${it.id}" title="${esc(it.title || '')}">${esc((it.title || '无标题').slice(0, 9))}</button>`).join('');
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
      <button class="ghost" id="btn-ics-cal">📅 导出到手机日历</button>
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
  const [date] = ds.split(' ');
  panel.innerHTML = `<div class="panel"><h3>🗓 ${esc(friendlyDate(ds))} 截止（${list.length}）</h3>
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
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(e)) return ['🖼️', '图片'];
  if (['doc', 'docx'].includes(e)) return ['📄', 'Word'];
  if (['xls', 'xlsx', 'csv'].includes(e)) return ['📊', 'Excel'];
  if (e === 'pdf') return ['📕', 'PDF'];
  if (['ppt', 'pptx'].includes(e)) return ['📽️', 'PPT'];
  if (['zip', 'rar', '7z'].includes(e)) return ['🗜️', '压缩包'];
  if (['mp4', 'mov', 'avi', 'mkv'].includes(e)) return ['🎬', '视频'];
  if (['mp3', 'wav', 'm4a'].includes(e)) return ['🎵', '音频'];
  return ['📁', '文件'];
}
async function loadFiles() {
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.group) params.set('group_id', state.group);
  const data = await api('/api/files?' + params);
  if (!data.items.length) {
    view.innerHTML = `<div class="empty"><div class="big">📂</div>还没有文件<br>在添加/编辑信息时可以上传附件</div>`;
    return;
  }
  // 「累计」用服务端的全量统计（跟随当前筛选）；老接口无此字段时退回当前页求和
  const totViews = data.totalViews != null ? data.totalViews : data.items.reduce((s, a) => s + (a.views || 0), 0);
  const totDls = data.totalDownloads != null ? data.totalDownloads : data.items.reduce((s, a) => s + (a.downloads || 0), 0);
  view.innerHTML = `
    <div class="inboxhead"><h3>📁 文件（${data.items.length}）</h3>
      <span class="hint">📖 累计阅读 ${totViews} 次 · ⬇️ 累计下载 ${totDls} 次</span></div>
    ` + data.items.map((a) => {
    const [icon, typeName] = extIcon(a.orig_name);
    const plat = a.group_platform ? (PLATS[a.group_platform] || PLATS.other) : null;
    return `<div class="frow">
      <div class="ficon">${icon}</div>
      <div class="fmain">
        <div class="fname">${hl(a.orig_name, state.q)} <span class="att-size">${fmtSize(a.size)}</span></div>
        <div class="fmeta">
          <span>${typeName}</span>
          <span title="打开预览次数">📖 ${a.views || 0}</span>
          <span title="下载次数">⬇️ ${a.downloads || 0}</span>
          ${a.group_name ? `<span class="chip ${plat ? plat.cls : ''}">${plat ? plat.label : ''}·${esc(a.group_name)}</span>` : ''}
          <span class="fmsg" data-msg="${a.message_id}">来自：${hl(a.message_title || '(无标题)', state.q)}</span>
          <span>${esc(fmtReceived(a.created_at))}</span>
        </div>
      </div>
      <a class="ghost" href="/api/attachments/${a.id}/download" target="_blank">打开</a>
      <a class="ghost" href="/api/attachments/${a.id}/download?dl=1">下载</a>
    </div>`;
  }).join('');
}

/* ========= 统计与接入 ========= */
function statCard(lab, num, cls = '') {
  return `<div class="statcard ${cls}"><div class="num">${num}</div><div class="lab">${lab}</div></div>`;
}
async function loadStats() {
  const view = $('#view');
  view.innerHTML = '<div class="loading">加载中…</div>';
  const [st, me] = await Promise.all([api('/api/stats'), api('/api/me').catch(() => ({ authRequired: false, loggedIn: true }))]);
  state.me = me;
  const editable = canEdit();
  const cfg = editable ? await api('/api/config').catch(() => null) : null;
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
      ${statCard('📨 信息总数', st.total)}
      ${statCard('🆕 近 7 天新增', st.week)}
      ${statCard('📝 待完成任务', st.openTasks)}
      ${statCard('⏰ 已逾期', st.overdue, st.overdue ? 'danger' : '')}
    </div>
    <div class="panel">
      <h3>⏰ 即将截止（7 天内）</h3>
      ${st.upcoming.length ? st.upcoming.map((it) => `
        <div class="uprow" data-id="${it.id}">
          <span class="badge cat-${it.category}">${(CATS[it.category] || CATS.other).label}</span>
          <b>${esc(it.title || (it.content || '').slice(0, 24))}</b>
          <span class="spacer"></span>${dlChip(it.deadline)}
        </div>`).join('') : '<p class="empty-mini">7 天内没有要截止的事</p>'}
    </div>
    <div class="panel">
      <h3>📂 分类统计</h3>
      ${st.byCategory.length ? st.byCategory.map((c) => `
        <div class="barrow">
          <span class="barname">${(CATS[c.category] || CATS.other).icon} ${(CATS[c.category] || CATS.other).label}</span>
          <div class="bar"><i style="width:${Math.round(c.c / maxC * 100)}%"></i></div>
          <span class="barnum">${c.c}</span>
        </div>`).join('') : '<p class="empty-mini">暂无数据</p>'}
    </div>
    <div class="panel">
      <h3>👥 各群信息量</h3>
      ${st.byGroup.length ? st.byGroup.map((g) => `
        <div class="barrow">
          <span class="barname">${platEmoji(g.platform)} ${esc(g.name)}</span>
          <div class="bar"><i style="width:${Math.round(g.count / maxG * 100)}%;background:${esc(g.color)}"></i></div>
          <span class="barnum">${g.count}</span>
        </div>`).join('') : '<p class="empty-mini">还没有添加群</p>'}
    </div>
    ${cfg ? `<div class="panel">
      <h3>📥 自动接入（进阶）</h3>
      <p class="hint">把这个接口地址给自动化程序（手机快捷指令等）使用，新消息会自动进入信息流，
      并自动识别分类和截止时间。</p>
      <div class="codebox">${esc(ingestUrl)}</div>
      <button class="ghost" id="btn-copy-ingest">📋 复制接口地址</button>
      <p class="hint">请求体示例：<code>{"text":"消息原文","group":"班级通知群","sender":"王老师","platform":"wechat"}</code></p>
    </div>` : ''}
    ${cfg ? `<div class="panel">
      <h3>🐧 QQ 自动接入（OneBot 机器人）</h3>
      ${obMode === 'auto'
        ? `<p class="hint">当前为 <b>自动收录</b> 模式：消息通过防闲聊过滤后直接进入信息流。想改成先人工挑一遍，在 data/config.json 里把 onebot.mode 改为 <code>"review"</code>。</p>`
        : `<p class="hint">当前为 <b>人工审核</b> 模式（默认）：群消息先进侧栏的「📥 待审核」，由你挑哪些收录进信息流，收录时自动识别分类和截止时间。想全自动收录，在 data/config.json 里把 onebot.mode 改为 <code>"auto"</code>。</p>`}
      <p class="hint">在电脑上用 <b>NapCat / LLOneBot / Lagrange / go-cqhttp</b> 等 OneBot 11 框架登录一个 QQ 小号并拉进班级群，
      在它的网络配置里添加 <b>HTTP POST 上报</b>，地址和令牌填下面两项。群文件上传也会记录（纯图片/表情消息不收录，避免刷屏）。</p>
      <div class="codebox">${esc(onebotUrl)}</div>
      <button class="ghost" id="btn-copy-onebot">📋 复制上报地址</button>
      <p class="hint">令牌 access_token：<code>${esc(ob.token)}</code>${ob.secretOn ? '（已在 config 里启用签名校验，框架 secret 填同一段密钥）' : '（与接入令牌相同；可在 data/config.json 的 onebot.token 单独设置，或设 onebot.secret 启用签名校验）'}</p>
      <p class="hint">NapCat / LLOneBot 配置示例（其他框架按各自文档填同样两项）：</p>
      <div class="codebox">${esc(napcatExample)}</div>
      <button class="ghost" id="btn-copy-onebot-json">📋 复制配置示例</button>
      <p class="hint">🛡 防闲聊过滤：${fparts.length
        ? `${esc(fparts.join('；'))}。在 data/config.json 的 onebot.filter 里调整${obMode === 'review' ? '（关键词、仅管理员、智能过滤仅在 auto 模式参与）' : ''}。`
        : '当前未启用，群里所有文字消息都会收录。可在 data/config.json 的 onebot.filter 里开启：最短长度、水词屏蔽、关键词白名单、仅群主/管理员、智能过滤（像通知/任务的才收录）。'}</p>
      ${obKeys.length
        ? `<p class="hint">已设群白名单，只收录：<code>${obKeys.map((k) => esc(k)).join('</code>、<code>')}</code>（显示名：${obKeys.map((k) => esc(ob.groups[k] || `QQ群 ${k}`)).join('、')}）</p>`
        : '<p class="hint">未设白名单：机器人所在<b>所有群</b>的消息都会收录。只想收录部分群，在 data/config.json 的 onebot.groups 里配置（如 <code>"groups": {"123456789": "班级通知群"}</code>），保存后重启生效。</p>'}
    </div>` : ''}
    <div class="panel">
      <h3>👥 群管理</h3>
      ${st.byGroup.map((g) => `
        <div class="gmrow">
          <span class="dot" style="background:${esc(g.color)}"></span>
          <span class="gmname">${platEmoji(g.platform)} ${esc(g.name)}</span>
          <span class="spacer"></span><b class="gmnum">${g.count}</b>
          ${editable ? `<button class="mini" data-editgroup="${g.id}">编辑</button>` : ''}
        </div>`).join('') || `<p class="empty-mini">${editable ? '还没有群，点下面按钮添加' : '还没有群'}</p>`}
      ${editable ? '<button class="ghost" id="btn-add-group2" style="margin-top:10px">➕ 添加群</button>' : ''}
      ${editable ? '<p class="hint">手机上在这里就能加群、改群名、删群，不用连电脑。</p>' : ''}
    </div>
    <div class="panel">
      <h3>🔔 截止提醒</h3>
      <p class="hint">点顶栏铃铛开启浏览器通知：只要信息页开着，<b>已逾期</b>或 <b>24 小时内截止</b>的任务会弹窗提醒
      （同一条每天只提醒一次，每 5 分钟检查一次）。手机上把本页"添加到主屏幕"后同样有效。</p>
      <button class="ghost" id="btn-bell-2">🔔 开启 / 检查提醒</button>
    </div>
    <div class="panel">
      <h3>💾 数据备份</h3>
      <p class="hint">所有数据都在本机 data/ 文件夹——<b>复制整个文件夹即完整备份</b>（含附件）。
      每次启动和跨天时会自动备份到 data/backups/（保留最近 14 份）；也可以导出 JSON。</p>
      ${editable ? `<button class="ghost" id="btn-export">⬇️ 导出 JSON 备份</button>
      <label class="importwrap">⬆️ 导入 JSON 备份<input id="import-file" type="file" accept=".json,application/json"></label>` : ''}
      ${me.authRequired ? (me.loggedIn
        ? '<button class="ghost" id="btn-logout" style="margin-left:10px">🚪 退出登录</button>'
        : '<a class="ghost" href="/login" style="margin-left:10px;text-decoration:none;display:inline-block">🔐 管理员登录</a>') : ''}
      <p class="hint">导入建议只在空数据时使用（已有数据时服务器会拒绝，防止重复）。JSON 备份会恢复附件记录，但不含附件文件本身——完整备份请复制整个 data/ 文件夹。</p>
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
      toast(`导入成功：${r.groups} 个群、${r.imported} 条信息${r.attachments ? `、${r.attachments} 条附件` : ''} ✓`);
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
    `<span class="att-edit">📄 ${esc(f.name)} <button type="button" class="mini danger" data-rm="${i}">✕</button></span>`).join('');
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
    `<option value="${k}" ${item && item.category === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('');
  openModal(`
    <h2>${item ? '✏️ 编辑信息' : '📥 添加信息'}</h2>
    <div class="form">
      <div class="labrow"><label>消息原文（粘贴老师发的通知/任务）</label>
        <button id="btn-smart" type="button" class="mini">🪄 智能识别</button></div>
      <textarea id="f-content" placeholder="把老师发的通知、任务原文粘贴到这里，再点「智能识别」自动填标题、分类和截止时间…">${item ? esc(item.content || '') : ''}</textarea>
      <label class="splitline"><input type="checkbox" id="f-split"> ✂️ 按空行拆分为多条（一次粘贴多条通知时勾选，每条自动识别截止时间）</label>
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
          <label><input type="checkbox" id="f-priority" ${item && item.priority ? 'checked' : ''}> ⭐ 重要</label>
          <label><input type="checkbox" id="f-done" ${item && item.status === 'done' ? 'checked' : ''}> ✅ 已完成</label>
        </div>
      </div>
      <label>附件（可多选）</label>
      <input id="f-files" type="file" multiple>
      ${state.existingAtts.length ? `<label>已有附件</label><div class="filelist">${state.existingAtts.map((a) =>
        `<span class="att-edit">📄 ${esc(a.orig_name)} <button type="button" class="mini danger" data-delatt="${a.id}">✕</button></span>`).join('')}</div>` : ''}
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
      toast(`已识别：${CATS[parsed.category].label}${parsed.deadline ? ' · 截止 ' + parsed.deadline : ''}${parsed.priority ? ' · ⭐重要' : ''}`);
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
  let dupTimer = null;
  $('#f-content').addEventListener('input', () => {
    clearTimeout(dupTimer);
    dupTimer = setTimeout(async () => {
      const box = $('#f-dup');
      if (!box) return;
      const text = $('#f-content').value.trim();
      if (text.length < 8) { box.style.display = 'none'; return; }
      try {
        const { items } = await api('/api/similar', { method: 'POST', body: { text, excludeId: state.editingId } });
        if (!items.length) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        box.innerHTML = `⚠️ 可能已录入过相似信息（避免重复记录，可点击查看）：<br>` +
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
    <h2>${group ? '✏️ 编辑群' : '➕ 添加群'}</h2>
    <div class="form">
      <label>群名称</label>
      <input id="g-name" value="${group ? esc(group.name) : ''}" placeholder="如：班级通知群">
      <div class="grid2">
        <div><label>平台</label>
          <select id="g-platform">
            <option value="wechat" ${group && group.platform === 'wechat' ? 'selected' : ''}>💬 微信</option>
            <option value="qq" ${group && group.platform === 'qq' ? 'selected' : ''}>🐧 QQ</option>
            <option value="other" ${group && group.platform === 'other' ? 'selected' : ''}>📂 其他</option>
          </select></div>
        <div><label>标记颜色</label><input id="g-color" type="color" value="${group ? esc(group.color) : '#4f6ef2'}"></div>
      </div>
      ${group ? '<button id="g-del" class="ghost danger" style="margin-top:14px">🗑 删除该群（群里的信息会保留）</button>' : ''}
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

/* ========= 视图切换 ========= */
// 顶栏控件只在适用的页面显示：排序只在信息流有用；统计页不响应群筛选
function syncTopbar() {
  $('#group-sel').style.display = state.view === 'stats' ? 'none' : '';
  $('#sortsel').style.display = state.view === 'feed' ? '' : 'none';
}
async function renderView() {
  saveFilters();
  $$('#mainnav button, #tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  syncTopbar();
  renderChips();
  const view = $('#view');
  try {
    if (state.view === 'feed') await loadFeed();
    else if (state.view === 'inbox') await loadInbox();
    else if (state.view === 'tasks') await loadTasks();
    else if (state.view === 'calendar') await loadCalendar();
    else if (state.view === 'files') await loadFiles();
    else await loadStats();
    window.scrollTo(0, 0);
  } catch (e) {
    // 加载失败给出重试入口，而不是卡在"加载中"
    view.innerHTML = `<div class="empty"><div class="big">😵</div>加载失败：${esc(e.message || '网络错误')}<br>
      <button class="ghost" id="btn-retry" style="margin-top:12px">🔄 重试</button></div>`;
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
function bindEvents() {
  $$('#mainnav button, #tabbar button').forEach((b) => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    renderView().catch((e) => toast(e.message, 'error'));
  }));

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

  // 按 / 快速聚焦搜索框
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    e.preventDefault();
    $('#search').focus();
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
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('infohub-theme', t);
  const btn = $('#btn-theme');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
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
  if (btn) btn.textContent = ('Notification' in window && Notification.permission === 'granted') ? '🔔' : '🔕';
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
  applyTheme(localStorage.getItem('infohub-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#btn-theme').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  // 弹窗里有没保存的内容时，关闭/刷新页面先提醒
  window.addEventListener('beforeunload', (e) => {
    const c = $('#f-content');
    if (c && c.value.trim().length > 3) { e.preventDefault(); e.returnValue = ''; }
  });
  $('#btn-bell').addEventListener('click', onBellClick);
  setupBellState();
  updateBadge();
  if ('Notification' in window && Notification.permission === 'granted') checkNotifs();
  setInterval(() => { updateBadge(); updateInboxBadge(); checkNotifs(); }, 5 * 60 * 1000);
}
/* 待审核数量角标：显示在侧栏和底部导航的「待审核」按钮上 */
function setNavBadge(viewName, n) {
  $$('#mainnav button[data-view="' + viewName + '"], #tabbar button[data-view="' + viewName + '"]').forEach((btn) => {
    let b = btn.querySelector('.navbadge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'navbadge'; btn.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
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
// 先取会话状态（决定只读模式），再渲染首屏
loadMe().finally(() => refresh());
