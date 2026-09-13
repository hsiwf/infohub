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

const DATA_DIR = path.join(__dirname, 'data');
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
CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_deadline ON messages(deadline);
CREATE INDEX IF NOT EXISTS idx_att_message ON attachments(message_id);
`);

// 轻量迁移：老库补 ext_key 列（QQ 群号等外部标识，机器人上报自动归群用）
const gcols = db.prepare('PRAGMA table_info(groups)').all();
if (!gcols.some((c) => c.name === 'ext_key')) {
  db.exec("ALTER TABLE groups ADD COLUMN ext_key TEXT DEFAULT ''");
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_ext ON groups(ext_key) WHERE ext_key <> ''`);
// 轻量迁移：老库补附件阅读/下载计数列
const acols = db.prepare('PRAGMA table_info(attachments)').all();
if (!acols.some((c) => c.name === 'views')) db.exec('ALTER TABLE attachments ADD COLUMN views INTEGER DEFAULT 0');
if (!acols.some((c) => c.name === 'downloads')) db.exec('ALTER TABLE attachments ADD COLUMN downloads INTEGER DEFAULT 0');

module.exports = { db, DATA_DIR, UPLOAD_DIR };
