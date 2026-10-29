'use strict';

const path = require('path');
const fs = require('fs');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('本程序需要 Node.js 22.5 及以上版本（内置 SQLite）。当前版本：', process.version);
  console.error('请到 https://nodejs.org/ 下载安装最新 LTS 版本后重试。');
  process.exit(1);
}

// 默认就是仓库里的 data/。selftest.js 会把这三个路径改指一份临时快照：一次自检要写
// 上千条记录、建几百条信息，还会跑备份导入——这些都只能碰快照，不能碰真实库。
const DATA_DIR = process.env.INFOHUB_DATA_DIR ? path.resolve(process.env.INFOHUB_DATA_DIR) : path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'infohub.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  platform TEXT DEFAULT 'other',
  color TEXT DEFAULT '#4f6ef2',
  remark TEXT DEFAULT '',
  ext_key TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  category TEXT DEFAULT 'notice',
  group_id INTEGER,
  sender_name TEXT DEFAULT '',
  received_at TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  pinned INTEGER DEFAULT 0,
  tags TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  orig_name TEXT DEFAULT '',
  stored_name TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  mime TEXT DEFAULT '',
  views INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT DEFAULT '',
  sender_name TEXT DEFAULT '',
  group_name TEXT DEFAULT '',
  qq_gid TEXT DEFAULT '',
  received_at TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS jielongs (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  roster TEXT DEFAULT '[]',
  fields TEXT DEFAULT '[]',
  allow_outside INTEGER DEFAULT 1,
  closed INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS jielong_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jielong_id TEXT NOT NULL,
  rid INTEGER,
  sid TEXT DEFAULT '',
  name TEXT DEFAULT '',
  values_json TEXT DEFAULT '{}',
  remark TEXT DEFAULT '',
  outside INTEGER DEFAULT 0,
  time INTEGER DEFAULT 0,
  seq INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS draws (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  roster TEXT DEFAULT '[]',
  per_draw INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS draw_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_id TEXT NOT NULL,
  picked TEXT DEFAULT '[]',
  count INTEGER DEFAULT 0,
  time INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rosters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  roster TEXT DEFAULT '',
  keep_id INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS birthdays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  month INTEGER DEFAULT 0,
  day INTEGER DEFAULT 0,
  year INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  closed INTEGER DEFAULT 0,
  anonymous INTEGER DEFAULT 1,
  roster TEXT DEFAULT '[]',
  options TEXT DEFAULT '[]',
  max_select INTEGER DEFAULT 1,
  reveal TEXT DEFAULT 'always',
  allow_change INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vote_ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vote_id TEXT NOT NULL,
  rid INTEGER,
  sid TEXT DEFAULT '',
  name TEXT DEFAULT '',
  choices TEXT DEFAULT '[]',
  time INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT DEFAULT 'expense',
  amount INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  happened_at TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS fund_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id INTEGER NOT NULL,
  orig_name TEXT DEFAULT '',
  stored_name TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  mime TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS guestbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT DEFAULT '',
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  topic TEXT DEFAULT '',
  kind TEXT DEFAULT 'note',
  status TEXT DEFAULT '',
  reply TEXT DEFAULT '',
  reply_at TEXT DEFAULT '',
  sid TEXT DEFAULT '',
  anonymous INTEGER DEFAULT 0,
  campaign_id TEXT DEFAULT '',
  public_share INTEGER DEFAULT 0,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS idea_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  closed INTEGER DEFAULT 0,
  visibility TEXT DEFAULT 'public',
  created_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS idea_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  orig_name TEXT DEFAULT '',
  stored_name TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  mime TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
/* ---------- 问卷调查（多题组合，题型丰富） ---------- */
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  closed INTEGER DEFAULT 0,
  roster TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS survey_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id TEXT NOT NULL,
  qtype TEXT DEFAULT 'single',
  question TEXT NOT NULL,
  options TEXT DEFAULT '[]',
  required INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id TEXT NOT NULL,
  sid TEXT DEFAULT '',
  name TEXT DEFAULT '',
  answers TEXT DEFAULT '{}',
  submitted_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS survey_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  questions TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  sid TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  pw_hash TEXT DEFAULT '',
  salt TEXT DEFAULT '',
  role TEXT DEFAULT 'student',
  must_change INTEGER DEFAULT 1,
  disabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  last_login TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sid TEXT DEFAULT '',
  name TEXT DEFAULT '',
  role TEXT DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  tag TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_funds_happened ON funds(happened_at);
CREATE INDEX IF NOT EXISTS idx_funds_type ON funds(type);
CREATE INDEX IF NOT EXISTS idx_fatt_fund ON fund_attachments(fund_id);
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_audit_sid ON audit_log(sid, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_deadline ON messages(deadline);
CREATE INDEX IF NOT EXISTS idx_att_message ON attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_jl_entries ON jielong_entries(jielong_id);
CREATE INDEX IF NOT EXISTS idx_draw_rounds ON draw_rounds(draw_id);
CREATE INDEX IF NOT EXISTS idx_vote_ballots ON vote_ballots(vote_id);
`);
// 一人一票：同一投票里名单槽位唯一（重投=覆盖），部分唯一索引不动名单外的历史数据。
// 防御：历史脏数据已有重复槽位时建索引会失败——先按最早一条去重再重建，保证启动不崩
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_ballots_slot ON vote_ballots(vote_id, rid) WHERE rid IS NOT NULL;`);
} catch (e) {
  console.error('选票存在重复槽位，已按最早一条去重后重建索引');
  db.exec(`DELETE FROM vote_ballots WHERE id NOT IN (SELECT MIN(id) FROM vote_ballots GROUP BY vote_id, rid) AND rid IS NOT NULL;`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_ballots_slot ON vote_ballots(vote_id, rid) WHERE rid IS NOT NULL;`);
}
// 轻量迁移：账号体系上线后，"没账号时凑身份"的三列一并退役——
// require_sid（学号强验证）由登录账号取代，两张表的 admin_token（?t= 委托令牌）随委托通道一起删
const voteCols = db.prepare('PRAGMA table_info(votes)').all();
for (const col of ['require_sid', 'admin_token']) {
  if (voteCols.length && voteCols.some((c) => c.name === col)) db.exec(`ALTER TABLE votes DROP COLUMN ${col}`);
}
const jlCols = db.prepare('PRAGMA table_info(jielongs)').all();
if (jlCols.length && jlCols.some((c) => c.name === 'admin_token')) db.exec('ALTER TABLE jielongs DROP COLUMN admin_token');
// 轻量迁移：投票表补 reveal（结果可见时机 always/after_vote/after_close）与 allow_change（是否允许改票）
if (voteCols.length && !voteCols.some((c) => c.name === 'reveal')) {
  db.exec("ALTER TABLE votes ADD COLUMN reveal TEXT DEFAULT 'always'");
}
if (voteCols.length && !voteCols.some((c) => c.name === 'allow_change')) {
  db.exec('ALTER TABLE votes ADD COLUMN allow_change INTEGER DEFAULT 1');
}

// 轻量迁移：老库补 ext_key 列（QQ 群号等外部标识，机器人上报自动归群用）
const gcols = db.prepare('PRAGMA table_info(groups)').all();
if (!gcols.some((c) => c.name === 'ext_key')) {
  db.exec("ALTER TABLE groups ADD COLUMN ext_key TEXT DEFAULT ''");
}
// 老库里若已有两行相同的非空 ext_key（该索引上线前机器人归群 / 手工改群都可能造出来），
// 直接建唯一索引会在 require 阶段抛错、服务启动即崩且无自愈——与 vote_ballots 同一处理：先去重再建
try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_ext ON groups(ext_key) WHERE ext_key <> ''`);
} catch (e) {
  console.error('群外部标识存在重复，已保留每组最早一行的群号后重建索引');
  db.exec(`UPDATE groups SET ext_key = '' WHERE id NOT IN (
      SELECT MIN(id) FROM groups WHERE ext_key <> '' GROUP BY ext_key) AND ext_key <> ''`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_ext ON groups(ext_key) WHERE ext_key <> ''`);
}
// 轻量迁移：老库补附件阅读/下载计数列
const acols = db.prepare('PRAGMA table_info(attachments)').all();
if (!acols.some((c) => c.name === 'views')) db.exec('ALTER TABLE attachments ADD COLUMN views INTEGER DEFAULT 0');
if (!acols.some((c) => c.name === 'downloads')) db.exec('ALTER TABLE attachments ADD COLUMN downloads INTEGER DEFAULT 0');
// 轻量迁移：接龙记录补 seq 列（保持首次提交顺序，修改后不重排）
const jecols = db.prepare('PRAGMA table_info(jielong_entries)').all();
if (!jecols.some((c) => c.name === 'seq')) db.exec('ALTER TABLE jielong_entries ADD COLUMN seq INTEGER DEFAULT 0');
// 轻量迁移：生日成员去掉 role 列（生日面前人人平等，不再划分身份）
const bdcols = db.prepare('PRAGMA table_info(birthdays)').all();
if (bdcols.length && bdcols.some((c) => c.name === 'role')) db.exec('ALTER TABLE birthdays DROP COLUMN role');
// 轻量迁移：班费去掉 category 列（用途备注已足够表达，去掉冗余的分类字段）
const fcols = db.prepare('PRAGMA table_info(funds)').all();
if (fcols.length && fcols.some((c) => c.name === 'category')) db.exec('ALTER TABLE funds DROP COLUMN category');
// 轻量迁移：班费去掉 operator（经手人）列（班费本就大家看着，谁经手意义不大，简化录入）
if (fcols.length && fcols.some((c) => c.name === 'operator')) db.exec('ALTER TABLE funds DROP COLUMN operator');
// 轻量迁移：留言板补 likes 列（点赞热度；新库建表已含，老库 ALTER 补上）
const gbcols = db.prepare('PRAGMA table_info(guestbook)').all();
if (gbcols.length && !gbcols.some((c) => c.name === 'likes')) db.exec('ALTER TABLE guestbook ADD COLUMN likes INTEGER DEFAULT 0');
// 轻量迁移：留言板补 topic 列（主题/标签，如「AI课反馈」「给张三」，一面墙按主题筛选）
if (gbcols.length && !gbcols.some((c) => c.name === 'topic')) db.exec("ALTER TABLE guestbook ADD COLUMN topic TEXT DEFAULT ''");
// 轻量迁移：留言板升级成「思维碰撞」——同一面墙按 kind 分「点子」与「留言」：
// 点子有状态（open 待看 / accepted 采纳 / done 已实现 / dropped 搁置）与我的公开回复；
// sid 记提交人学号，匿名只影响墙上显示谁（老留言一律 kind='note'，不补状态）
for (const [col, ddl] of [
  ['kind', "kind TEXT DEFAULT 'note'"],
  ['status', "status TEXT DEFAULT ''"],
  ['reply', "reply TEXT DEFAULT ''"],
  ['reply_at', "reply_at TEXT DEFAULT ''"],
  ['sid', "sid TEXT DEFAULT ''"],
  ['anonymous', 'anonymous INTEGER DEFAULT 0'],
  ['campaign_id', "campaign_id TEXT DEFAULT ''"],
  ['public_share', 'public_share INTEGER DEFAULT 0'],
]) {
  if (gbcols.length && !gbcols.some((c) => c.name === col)) db.exec(`ALTER TABLE guestbook ADD COLUMN ${ddl}`);
}
// 轻量迁移：删掉留言板早先建的 idx_gb_created——guestbook.id 就是 rowid 主键，
// ORDER BY id DESC 直接走主键，这个索引只多付写入成本
db.exec('DROP INDEX IF EXISTS idx_gb_created');
// 轻量迁移：操作记录补 tag 列（自检脚本跑出来的记录打 selftest，跑完自清，不埋真实操作）
const alcols = db.prepare('PRAGMA table_info(audit_log)').all();
if (alcols.length && !alcols.some((c) => c.name === 'tag')) db.exec("ALTER TABLE audit_log ADD COLUMN tag TEXT DEFAULT ''");

// 轻量迁移：问卷问题补 description 列（每题可添加说明文字）
const sqcols = db.prepare('PRAGMA table_info(survey_questions)').all();
if (sqcols.length && !sqcols.some((c) => c.name === 'description')) db.exec("ALTER TABLE survey_questions ADD COLUMN description TEXT DEFAULT ''");

// 轻量迁移：问卷补 anonymous 列（支持匿名问卷，不收集学号姓名）
const svcols = db.prepare('PRAGMA table_info(surveys)').all();
if (svcols.length && !svcols.some((c) => c.name === 'anonymous')) db.exec('ALTER TABLE surveys ADD COLUMN anonymous INTEGER DEFAULT 0');

// 轻量迁移：问卷分组（section）支持
db.exec(`CREATE TABLE IF NOT EXISTS survey_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
)`);
if (sqcols.length && !sqcols.some((c) => c.name === 'section_id')) db.exec('ALTER TABLE survey_questions ADD COLUMN section_id INTEGER DEFAULT NULL');

// 轻量迁移：匿名问卷去重（用 sid_hash 代替明文 sid，保证一人一份但不暴露身份）
const srcols = db.prepare('PRAGMA table_info(survey_responses)').all();
if (srcols.length && !srcols.some((c) => c.name === 'sid_hash')) db.exec("ALTER TABLE survey_responses ADD COLUMN sid_hash TEXT DEFAULT ''");
if (svcols.length && !svcols.some((c) => c.name === 'dedup_salt')) db.exec("ALTER TABLE surveys ADD COLUMN dedup_salt TEXT DEFAULT ''");

// 轻量迁移：问卷模板（管理员/班委可自定义模板，发起问卷时快速套用）
db.exec(`CREATE TABLE IF NOT EXISTS survey_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  description TEXT DEFAULT '',
  questions TEXT DEFAULT '[]',
  created_at INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT 0
)`);

module.exports = { db, DATA_DIR, UPLOAD_DIR };
