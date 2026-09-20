'use strict';

/*
 * 中文通知/任务文本智能解析
 * 从老师发的消息原文里识别：标题、分类、发送人、截止时间、重要程度、标签
 * 全部是启发式规则，识别结果永远可以在界面上手工修改。
 */

const WEEKDAY = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

const RE_TASK = /(作业|练习|打卡|背诵|默写|预习|订正|提交|上传|填表|问卷|回执|缴费|交费|拍照|截图|录视频|签字|收到请回复|阅读并回复)/;
const RE_ACTIVITY = /(运动会|家长会|春游|秋游|研学|活动|比赛|汇演|典礼|升旗|义卖|联欢|晚会|参观|讲座|志愿者)/;
const RE_FILE = /(附件|文件|表格|链接|网址|文档|\.(docx?|xlsx?|pptx?|pdf|zip|rar)\b)/i;
const RE_NOTICE = /(通知|请注意|温馨提示|提醒|放假|调休|安排|停课|校服|体检)/;
const RE_PRIORITY = /(务必|必须|紧急|重要|尽快|立即|准时|不得|严禁|逾期不候)/;
const RE_DEADLINE_KW = /(截止|上交|提交|交到|报送|带回|前交|之前|以前|如期|逾期|举行|召开|开始|集合|到校|考试|测试|体检|安排在|安排于)/;
// 日期后面紧挨着这些字样时，该日期大概率就是截止时间
const RE_NEAR = /(之前|以前|截止|点前|时前|分前|前交|前发|前给|前完成|前上传|前提交|前发给|前上交)|^[，,。；;\s]*(前|交|晚)/;

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function valid(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

// 在一段文字里找时间 "下午4点30 / 16:30 / 晚上八点"；defTag 是日期词携带的时段（如"今晚"→晚上）
function parseTime(seg, defTag = '') {
  // 分钟的"分"字可省略（"4点30"）；"半"表示 30 分（"4点半"）
  const m = seg.match(/(上午|早上|中午|下午|晚上)?\s*(\d{1,2})\s*[点时:：]\s*(?:(\d{1,2})\s*分?|半)?/);
  if (!m) return null;
  let h = +m[2];
  const mi = m[3] ? +m[3] : (m[0].includes('半') ? 30 : 0);
  const tag = m[1] || defTag;
  if (mi > 59 || h > 24) return null;
  if ((tag === '下午' || tag === '晚上') && h >= 1 && h < 12) h += 12;
  if ((tag === '晚上' || tag === '上午') && h === 12) h = 0; // 晚上12点 / 上午12点 都指午夜而非正午
  if (tag === '中午' && h < 11) h += 12;
  if (!tag && h >= 1 && h <= 6) h += 12; // 学校语境里 "5点前" 一般指下午
  if (h > 23) return null;
  return `${pad(h)}:${pad(mi)}`;
}

// 找出文中所有日期（绝对日期、斜杠日期、今天/明天、周几）
function findDates(text, base) {
  const y0 = base.getFullYear(), m0 = base.getMonth() + 1, d0 = base.getDate();
  const out = [];
  let m, re;

  re = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g;
  while ((m = re.exec(text))) {
    if (valid(+m[1], +m[2], +m[3])) out.push({ y: +m[1], mo: +m[2], d: +m[3], pos: m.index, len: m[0].length });
  }
  re = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/g;
  while ((m = re.exec(text))) {
    const mo = +m[1], d = +m[2];
    // 已过的日期顺延一年（"本月已过的日子"和"明年X月X日"都按下一次出现算）
    if (valid(y0, mo, d)) out.push({ y: (mo < m0 || (mo === m0 && d < d0)) ? y0 + 1 : y0, mo, d, pos: m.index, len: m[0].length });
  }
  re = /(?<!\d)(\d{1,2})\s*[\/.]\s*(\d{1,2})(?!\d)/g;
  while ((m = re.exec(text))) {
    const mo = +m[1], d = +m[2];
    // 与"X月X日"分支同一口径：已过的斜杠日期顺延一年（12月说"1/5 前交"指的是明年1月5日）
    if (valid(y0, mo, d)) out.push({ y: (mo < m0 || (mo === m0 && d < d0)) ? y0 + 1 : y0, mo, d, pos: m.index, len: m[0].length, weak: true });
  }
  const rel = [['大后天', 3], ['后天', 2], ['明天', 1], ['明日', 1], ['今晚', 0, '晚上'], ['今天', 0]];
  for (const [w, off, evetag] of rel) {
    const idx = text.indexOf(w);
    if (idx >= 0) {
      const dt = new Date(y0, m0 - 1, d0 + off);
      out.push({ y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), pos: idx, len: w.length, ...(evetag ? { evetag } : {}) });
    }
  }
  re = /(下下|下)?(?:周|星期)([一二三四五六日天])/g;
  while ((m = re.exec(text))) {
    const target = WEEKDAY[m[2]];
    const mondayOffset = (base.getDay() + 6) % 7; // 周一为一周开始
    const weekStart = d0 - mondayOffset;
    let day;
    if (m[1]) {
      // 下周X / 下下周X：从本周周一起算
      const mon0 = (target + 6) % 7; // 周一=0
      day = weekStart + (m[1] === '下下' ? 14 : 7) + mon0;
    } else {
      // 周X：下一个 occurrence（今天当天算下周）
      let delta = (target - base.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      day = d0 + delta;
    }
    const dt = new Date(y0, m0 - 1, day);
    out.push({ y: dt.getFullYear(), mo: dt.getMonth() + 1, d: dt.getDate(), pos: m.index, len: m[0].length });
  }

  out.sort((a, b) => a.pos - b.pos || (a.weak ? 1 : 0) - (b.weak ? 1 : 0));
  const res = [];
  let end = -1;
  for (const d of out) {
    if (d.pos < end) continue;
    res.push(d);
    end = d.pos + d.len;
  }
  return res;
}

// 判断哪个日期是截止时间：优先 "日期+之前/前/截止/交" 紧挨着的；否则需要有截止类关键词
function extractDeadline(text, dates) {
  if (!dates.length) return null;
  const scored = dates.map((d) => {
    const window = text.slice(d.pos + d.len, d.pos + d.len + 12);
    return { d, near: RE_NEAR.test(window) };
  });
  const strong = scored.find((s) => s.near && !s.d.weak) || scored.find((s) => s.near);
  const pick = strong || (RE_DEADLINE_KW.test(text) ? (scored.find((s) => !s.d.weak) || scored[0]) : null);
  if (!pick) return null;
  const d = pick.d;
  const t = parseTime(text.slice(d.pos + d.len, d.pos + d.len + 14), d.evetag || '');
  return t ? `${fmt(d.y, d.mo, d.d)} ${t}` : `${fmt(d.y, d.mo, d.d)}`;
}

function extractSender(text) {
  const m = text.match(/([\u4e00-\u9fa5A-Za-z·0-9]{1,8}?(?:老师|班主任|辅导员|校长|主任|教练))\s*[:：]/);
  if (m) return m[1];
  const m2 = text.match(/([\u4e00-\u9fa5A-Za-z·0-9]{1,8}?(?:老师|班主任))\s*$/);
  return m2 ? m2[1] : '';
}

function smartParse(text, base = new Date()) {
  text = String(text || '');
  const tags = [];
  const cleaned = text.replace(/【([^【】]{2,12})】/g, (s, inner) => {
    if (tags.length < 3 && !/回复|收到|接龙/.test(inner)) tags.push(inner.trim());
    return ' ';
  });

  let first = cleaned.split(/\n/).map((s) => s.trim()).find(Boolean) || '';
  first = first.replace(/^[@＠【\[]?(全体?(?:家长|成员)|各位?(?:家长|同学))[\]】]?[:：,，、]?\s*/, '');
  first = first.replace(/^([\u4e00-\u9fa5A-Za-z·0-9]{1,8}?(?:老师|班主任|校长|主任|教练))\s*[:：]\s*/, '');
  first = first.replace(/^(请各位家长注意|各位家长注意|温馨提示|请注意|温馨提醒)[：:，,]?\s*/, '');
  first = first.replace(/^[#>*\-\s]+/, '');
  // 只剥"序号+分隔符"，保住"9月20日""2026年"这类日期开头的标题；
  // 点号后紧跟数字时是"9.10"式日期而非序号，同样保留
  first = first.replace(/^\d{1,4}\s*(?:[、)）：:]|\.(?!\d))\s*/, '');
  first = first.replace(/[\s，。,.;；!！?？]+$/, '');
  const title = first.length > 40 ? first.slice(0, 40) : first;

  const category = RE_TASK.test(text) ? 'task'
    : RE_ACTIVITY.test(text) ? 'activity'
    : RE_FILE.test(text) ? 'file'
    : RE_NOTICE.test(text) ? 'notice'
    : 'notice';

  const dates = findDates(cleaned, base);
  let deadline = extractDeadline(cleaned, dates);
  // 活动类消息即使没有"截止"字眼，也把活动日期当作提醒时间
  if (!deadline && category === 'activity' && dates.length) {
    const d = dates.find((x) => !x.weak) || dates[0];
    const t = parseTime(cleaned.slice(d.pos + d.len, d.pos + d.len + 14), d.evetag || '');
    deadline = t ? `${fmt(d.y, d.mo, d.d)} ${t}` : `${fmt(d.y, d.mo, d.d)}`;
  }
  const priority = RE_PRIORITY.test(text) ? 1 : 0;
  const sender = extractSender(text);

  return { title, category, deadline, priority, sender, tags };
}

// 判断一段文字是否带有"通知/任务"信号（供机器人接入时过滤群闲聊用）
// 命中分类关键词、重要词、截止类词、面向全班的组织性发言，或能解析出截止时间，就算有信号
// 设计取向：宁可放进来一条闲聊（可在界面删），也不要漏掉一条真通知
function hasNoticeSignal(text) {
  text = String(text || '');
  if (RE_TASK.test(text) || RE_ACTIVITY.test(text) || RE_FILE.test(text) || RE_NOTICE.test(text) || RE_PRIORITY.test(text)) return true;
  if (RE_DEADLINE_KW.test(text)) return true;
  if (/(全体同学|各位同学|请同学们|全体成员|请大家|同学们)/.test(text)) return true;
  return !!extractDeadline(text, findDates(text, new Date()));
}

module.exports = { smartParse, hasNoticeSignal };
