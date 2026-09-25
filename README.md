<div align="center">

<img src="public/icon.svg" width="100" alt="InfoHub">

# 信息汇总 InfoHub

把班级群里的通知、任务、接龙、抽签、生日汇到一个本地页面，数据存在自己的电脑上。

零依赖 · 手机电脑都能用 · 一条命令启动

[功能一览](#功能一览) · [快速开始](#快速开始) · [部署](#部署) · [QQ 机器人](#qq-机器人接入onebot-11) · [API](#api-一览) · [自检与开发](#自检与开发) · [FAQ](#faq)

[![CI](https://github.com/hsiwf/infohub/actions/workflows/ci.yml/badge.svg)](https://github.com/hsiwf/infohub/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/hsiwf/infohub)](https://github.com/hsiwf/infohub/releases/latest)
![Node.js](https://img.shields.io/badge/node.js-%E2%89%A5%2022.5-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4.svg)](https://github.com/hsiwf/infohub/pulls)

[下载最新版](https://github.com/hsiwf/infohub/releases/latest) · [问题反馈](https://github.com/hsiwf/infohub/issues)

**为什么做它？** 班级群消息刷屏，重要通知被淹没，活动报名靠刷屏接龙，生日没人记得。
InfoHub 把这些搬到一个本地网页：老师发通知，同学点链接报名，生日自动提醒。

| 信息中心（浅色） | 命令面板 `Ctrl/⌘+K`（深色） |
| --- | --- |
| <img src="docs/screenshots/feed-light.png" width="480" alt="信息中心"> | <img src="docs/screenshots/cmdk.png" width="480" alt="命令面板"> |
| 活动接龙：自动统计谁还没接 | 生日祝福：生日当天的祝福墙 |
| <img src="docs/screenshots/jielong.png" width="480" alt="活动接龙"> | <img src="docs/screenshots/birthday.png" width="480" alt="生日祝福"> |

</div>

---

## 功能一览

| 模块 | 亮点 |
| --- | --- |
| **信息中心** | 通知 / 任务 / 活动分色看板，置顶、完成勾选、优先级、全文搜索、按截止时间排序 |
| **待办任务** | 按"已逾期 / 今天 / 未来 7 天"自动分桶，一键导出手机日历（.ics）、打印清单 |
| **活动接龙** | 生成链接发到班群，同学点开即填即交（无需注册）；粘贴班级名单自动比对，没接的直接列出来；重名按学号区分、名单外标记、专属链接防代填、未接名单一键提醒、导出 CSV、扫码接龙、管理权可委托给班委 |
| **抽签点名** | 按班级名单抽 N 人：抽过的自动排除、下次不再被抽到，箱内抽空自动开新一轮；自定义人数、撤销、重置、历史留痕 |
| **生日祝福** | 全班生日倒计时；生日当天祝福卡、信息页横幅、浏览器通知；祝福一键复制发班群；可上传班徽水印 |
| **班级名单** | 独立视图随时管理：新建 / 编辑 / 删除 / 复制，成员实时预览；接龙、抽签、生日到处复用；支持"学号 姓名"解析（名单含学生信息，访客不可见） |
| **QQ 机器人** | OneBot 11 接入（NapCat / LLOneBot 等），群消息自动进站；人工审核 / 自动收录两种模式，防闲聊过滤、群白名单、HMAC 签名校验 |
| **命令面板** | `Ctrl/⌘+K` 唤起：视图跳转、常用操作、信息实时搜索；配套全套键盘快捷键（按 `?` 查看） |
| **文件中心** | 图片 / PDF 在线预览，附件阅读 / 下载次数统计 |
| **统计接入** | 信息看板、即将截止提醒、分类与群信息量统计、Webhook 接入地址 |
| **自动备份** | 每天备份数据库（保留 14 份）、JSON 一键导出 / 导入；数据全部存在本机 `data/` 文件夹 |
| **三档外观** | 浅色 / 深色 / **按时间自动**（19:00–次日 7:00 深色），全站适配深色模式 |

**安全模型**：所有人可浏览，增删改需管理员登录（可选密码）；机器人凭令牌接入。公网部署务必设置密码。

---

## 快速开始

唯一的前置条件：**Node.js ≥ 22.5**（使用内置 SQLite，无需 `npm install`）。

```bash
git clone https://github.com/hsiwf/infohub.git
cd infohub
node server.js
```

打开 <http://localhost:5757> 即可使用。首次启动自动创建 `data/` 目录与配置文件。

**局域网访问**：启动日志会打印局域网地址（如 `http://192.168.x.x:5757`），手机连同一 Wi-Fi 直接打开；Windows 首次启动在防火墙弹窗勾选"允许访问专用网络"。

**可选配置**（`data/config.json`，改后重启生效）：

| 字段 | 说明 |
| --- | --- |
| `password` | 管理密码。留空 = 不启用；设置后所有人可浏览，增删改需登录（自带限速） |
| `ingestToken` | 投递令牌，仅供机器人 / 快捷指令调 Webhook 投递通知；泄露后改掉重启即可作废 |
| `apiToken` | 管理接口令牌（自动生成），脚本以 `X-Token` 头调用管理接口时使用；与投递令牌分离，泄露互不波及 |

<details>
<summary><b>让电脑开机就运行？</b></summary>

```bash
# pm2（Windows / macOS / Linux 通用）
npm install -g pm2
pm2 start server.js --name infohub
pm2 save && pm2 startup        # 开机自启
```

**Windows** 也可以用 [NSSM](https://nssm.cc/) 把 `node server.js` 注册为系统服务。

升级版本：`git pull && pm2 restart infohub`——数据都在 `data/` 目录，升级不受影响。

</details>

---

## 部署

三种方式按场景三选一，1 核 1G 最低配云服务器即可，全程约 10 分钟。

性能：50 人并发混合浏览实测 1000+ req/s，50 人同时提交接龙 40ms 内全部写入。日常使用离这个量级很远，选服务器时主要考虑宝塔面板、反向代理和 NapCat 的开销（见 [FAQ](#faq)）。

<details open>
<summary><b>方式一：Linux 服务器 + systemd（推荐）</b></summary>

```bash
# 1. 安装 Node.js 22.5+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 获取代码
sudo mkdir -p /opt/infohub && sudo chown $USER /opt/infohub
git clone https://github.com/hsiwf/infohub.git /opt/infohub

# 3. 试运行并放行端口（云厂商安全组 + 本机防火墙均需放行 5757）
cd /opt/infohub && node server.js

# 4. 设置管理密码后注册系统服务
sudo tee /etc/systemd/system/infohub.service <<'UNIT'
[Unit]
Description=InfoHub 信息汇总
After=network.target

[Service]
WorkingDirectory=/opt/infohub
ExecStart=/usr/bin/node server.js
Environment=PORT=5757
Restart=on-failure
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
UNIT
sudo chown -R www-data /opt/infohub/data
sudo systemctl daemon-reload
sudo systemctl enable --now infohub
```

**日常维护**：日志 `journalctl -u infohub -f` 或 `data/logs/server.log`；升级 `git pull && sudo systemctl restart infohub`；备份直接拷 `data/` 文件夹。

</details>

<details>
<summary><b>方式二：宝塔面板（图形界面）</b></summary>

1. 软件商店安装 **Node.js 版本管理器** → 安装 22.x（须 ≥ 22.5）
2. 文件 → 新建 `/www/wwwroot/infohub` → 上传源码（**不要上传本地 data/ 目录**）
3. 网站 → Node 项目 → 添加：项目目录 `/www/wwwroot/infohub`、启动文件 `server.js`、端口 `5757`，勾选守护进程
4. 放行端口 5757（面板 + 云厂商安全组），访问 `http://服务器IP:5757` 验证
5. 可选：绑定域名 + Let's Encrypt 证书（PWA 安装等浏览器能力要求 HTTPS）

</details>

<details>
<summary><b>方式三：Docker</b></summary>

```bash
docker build -t infohub .
docker run -d --name infohub -p 5757:5757 -v infohub-data:/app/data infohub
```

</details>

**Webhook 接入**（快捷指令 / 自动化程序）：

```bash
curl -X POST "http://localhost:5757/api/ingest?token=你的令牌" \
  -H "Content-Type: application/json" \
  -d '{"text":"张老师：下周一下午4点前交自学计划表","group":"三年级二班","sender":"张老师"}'
```

---

## 添加到手机桌面（PWA）

信息中心可以像 App 一样装到手机桌面，点图标直接打开：

**Android（Chrome / Edge）**
1. 手机连同一 Wi-Fi，打开启动日志里的局域网地址（如 `http://192.168.x.x:5757`）
2. 浏览器菜单（右上角 ⋮）→「添加到主屏幕」
3. 未配置 HTTPS 时装的是网页快捷方式；绑域名 + HTTPS 后可独立窗口运行、支持离线缓存，条件满足时顶栏还会出现「安装到桌面」按钮

**iPhone / iPad（Safari）**
1. 用 Safari 打开站点
2. 点底部分享按钮 →「添加到主屏幕」
3. 添加后全屏运行，桌面显示班级图标

> 完整的 App 体验（独立窗口、离线缓存、安装提示）依赖 HTTPS，公网部署绑定域名 + 证书即可获得，见 [部署](#部署)。

---

## QQ 机器人接入（OneBot 11）

在电脑上用 [NapCat](https://napneko.github.io/) / LLOneBot / Lagrange / go-cqhttp 等 OneBot 11 框架登录一个 QQ 小号拉进班级群，网络配置里添加 **HTTP POST 上报**，群消息就会自动进站。

| 配置项 | 值 |
| --- | --- |
| 上报地址 | `http://你的服务器地址:5757/api/onebot/report` |
| access_token | `data/config.json` 的 `onebot.token`（默认与 `ingestToken` 相同） |

统计页「QQ 自动接入（OneBot 机器人）」面板会直接生成上报地址与 NapCat / LLOneBot 配置示例，一键复制。

- **两种收录模式**（`onebot.mode`）：`review` 人工审核（默认，先进「待审核」挑着收录）/ `auto` 自动收录
- **防闲聊过滤**（`onebot.filter`）：最短长度、水词屏蔽（内置"收到""好的"等）、关键词白名单、仅群主/管理员发言、智能过滤；后三项仅 auto 模式参与
- 群白名单按 `ext_key` 绑定站内群，改群名不丢关联；群文件上传自动记录；纯图片/表情不收录；5 分钟内重复上报自动去重
- 可启用 `onebot.secret` 改用 HMAC 签名校验

---

## 活动接龙

侧栏「活动接龙」发起接龙：填标题、粘贴班级名单（Excel / QQ 名单直接粘贴，自动识别"学号 姓名"），生成链接发到班群。

- **同学端**：打开链接或扫二维码 → 输入学号或姓名（联想匹配，重名从下拉选择）→ 填写提交。无需注册，重新提交即覆盖；页面实时显示已接 / 未接与截止倒计时
- **自动统计**：按名单"槽位"统计（学号+姓名唯一确定一人，重名各归各的）；名单外提交单独标记；编辑名单后已接记录自动重新匹配
- **管理台**：未接名单一键复制提醒文案、复制仿群接龙全文、导出 CSV（Excel 直接打开）、每人一条专属链接（打开后姓名锁定，防代填）、随时编辑 / 停止 / 删除
- **委托管理**：复制管理链接发给班委，无需管理员密码即可代管这一个接龙

---

## 抽签点名

按班级名单建签箱，每次抽 N 人：

- 抽过的人自动排除，箱内抽空后自动开新一轮
- 人数随时可改；每轮结果留痕，可撤销上一轮或整箱重置
- Fisher-Yates 洗牌 + `crypto.randomInt` 无偏随机；抽签是管理操作，同学可在页面看到结果

---

## 投票表决

班委选举、评优表决、事项表决：发起人设置候选选项与资格名单，同学打开链接即可投票。

- **资格名单控制**：从班级名单选择（或直接粘贴）有资格投票的名单，名单外的同学无法提交
- **匿名可选**：匿名投票下同学之间看不到彼此投给谁，选票明细仅发起人可查；也可设为记名投票对所有人公开
- **一人一票**：同一同学重复提交即改票（截止前），不会重复计票；到截止时间或手动停止后锁定
- **完成统计**：实时显示已投 / 未投人数与未投名单，一键复制提醒文案，防止漏票与冒票
- **多选支持**：评优选多人时设置「每人最多可选 N 项」
- 结果实时统计票数与占比；学生投票页 `​/v/投票ID`，免登录、手机适配

---

## 生日祝福

班级成员的生日倒计时和当天祝福。不分老师、同学，都一样记录、一样提醒。

- **生日倒计时**：按天数排序的贺卡列表，7 天内高亮
- **当天祝福墙**：祝福语自动生成或自定义，一键复制发到班群
- **提醒**：信息页顶部横幅、浏览器通知（当天一次）、导航角标
- **班徽背景**：可上传班级徽章作祝福墙水印
- 生日只存月日，年份选填（填了显示"将满 N 岁"）；2 月 29 日平年按 2 月 28 日庆祝

侧栏「生日祝福」→ 从班级名单导入 → 补填生日。

---

## 外观主题

顶栏「深色 / 浅色模式」按钮三档循环：**浅色 → 深色 → 自动**。

- **自动**（默认）：19:00–次日 7:00 自动使用深色，其余浅色，页面开着跨过时间点也会自动切换
- 手动选择浅色 / 深色后固定不变；选择保存在本浏览器
- 学生接龙页、快捷录入页跟随同一主题设置

---

## API 一览

<details>
<summary><b>查看完整 API 列表</b></summary>

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（版本号、运行时长） |
| GET | `/api/me` | 会话状态（是否需要登录 / 是否已登录 / 访客只读） |
| GET | `/api/config` | 端口、接入令牌、局域网地址、OneBot 配置（仅管理员） |
| GET / POST | `/api/messages` | 信息列表（`q` / `group_id` / `category` / `status` / `sort` / `due` / 分页）/ 新增 |
| GET / PUT / DELETE | `/api/messages/:id` | 详情 / 修改 / 删除（含附件文件） |
| POST | `/api/messages/:id/toggle` · `/pin` | 切换完成 / 置顶 |
| GET / POST | `/api/groups` | 群列表（`withCounts=1` 带数量）/ 新增（同名 409） |
| PUT / DELETE | `/api/groups/:id` | 修改 / 删除群（群下信息保留） |
| POST | `/api/upload` | 上传附件（multipart/form-data，需 `message_id`） |
| GET | `/api/attachments/:id/download` · `:raw` | 下载附件（`?dl=1` 强制下载；阅读/下载计数） |
| DELETE | `/api/attachments/:id` | 删除附件 |
| GET | `/api/files` | 附件列表（含阅读 / 下载统计；`status=open/done` 按信息完成状态过滤，`limit`/`offset` 分页） |
| POST | `/api/parse` | 智能解析文本（不落库） |
| POST | `/api/similar` | 相似信息检测（防重复录入） |
| POST | `/api/ingest?token=` | 外部接入 Webhook |
| POST | `/api/onebot/report` | OneBot 11 HTTP POST 上报（QQ 机器人） |
| GET / POST / PUT / DELETE | `/api/jielong*` | 接龙 CRUD / 学生提交 / 停止 / 记录删除 / CSV 导出 |
| GET / POST / PUT / DELETE | `/api/draw*` | 抽签签箱 CRUD / 抽签 / 撤销 / 重置 |
| GET / POST / PUT / DELETE | `/api/rosters*` | 班级名单（GET 需管理员——名单含学生学号姓名；PUT 用于改名 / 改内容） |
| GET / POST / PUT / DELETE | `/api/vote*` | 投票表决（创建 / 编辑 / 停止 / 删除需管理员或 `?t=` 管理令牌；投票按资格名单免登录提交，明细按匿名设置可见） |
| GET / POST / PUT / DELETE | `/api/birthdays*` | 生日成员 CRUD / 名单导入 |
| GET / POST / DELETE | `/api/class-badge` | 班徽背景（上传 / 访问 / 移除） |
| GET | `/api/inbox` | 待审核收件箱列表（仅管理员） |
| POST | `/api/inbox/:id/accept`、`/api/inbox/accept-all` | 收录待审核消息 |
| DELETE | `/api/inbox/:id`、`/api/inbox` | 忽略待审核消息 |
| GET | `/api/calendar.ics` | 导出截止提醒日历（只含未逾期事项） |
| GET | `/api/export` | 导出 JSON 备份（含附件记录、接龙、抽签、班级名单、生日） |
| POST | `/api/import?force=1` | 导入 JSON 备份（事务保护；`force=1` 为合并导入：接龙/抽签按原 id 替换、群按 ext_key 合并、名单同名覆盖、生日同名同日跳过） |
| GET | `/api/stats` | 统计数据 |
| POST | `/api/login` / `/api/logout` | 管理员登录 / 登出 |

所有响应均为 JSON；写入类接口在设置了管理密码后需要登录会话或 `X-Token` 请求头。例外：接龙的学生提交、机器人上报永远开放；接龙管理凭该接龙的管理令牌 `?t=` 也可通行。

</details>

**环境变量**：`PORT`（默认 5757）· `INFOHUB_DEBUG=1`（打印 API 请求）· `INFOHUB_OPEN=1`（启动自动打开浏览器）

---

## 自检与开发

```bash
node test.js
```

脚本对全部 API 做端到端检查（支持无密码 / 密码两种部署形态），全部通过输出 PASS 汇总，任何一项失败以非零码退出，可用于 CI。

```
infohub/
├── server.js            # HTTP 服务与全部 API（零依赖）
├── db.js                # SQLite 初始化与表结构（node:sqlite）+ 老库迁移
├── lib/
│   ├── smartparse.js    # 中文通知智能解析（启发式规则）
│   ├── jielong.js       # 活动接龙：名单解析 / 身份匹配 / 进度 / CSV
│   └── multipart.js     # multipart/form-data 解析
├── public/              # 前端（原生 HTML / CSS / JS + PWA）
│   ├── index.html       # 主界面（信息 / 待审核 / 接龙 / 抽签 / 投票 / 生日 / 班级名单 / 日历 / 文件 / 统计）
│   ├── jielong-join.html# 学生接龙页（/j/:id）
│   ├── vote.html        # 学生投票页（/v/:id）
│   ├── quick.html       # 快捷录入页
│   ├── login.html       # 管理员登录页
│   └── js/app.js        # 前端逻辑
├── test.js              # 端到端自检脚本
└── data/                # 运行时生成：数据库、附件、备份、日志、config.json（不入库）
```

---

## FAQ

**端口被占用？** 大概率服务已在运行，直接打开 <http://localhost:5757>；或换端口启动：Linux / macOS `PORT=8080 node server.js`，Windows CMD `set PORT=8080 && node server.js`，Windows PowerShell `$env:PORT=8080; node server.js`。

**能带多少用户？** 50 人并发混合浏览实测 1000+ req/s，50 人同时提交接龙 40ms 内完成（开发机实测）。日常每人几秒到十几秒刷一次，50 人的班级只用到服务端能力的一两个百分点，百人的年级活动也够。瓶颈一般在网络带宽，不在应用。

**备份怎么清理？** 自动备份每天一份，保留最近 14 份，每份通常只有几 MB，一般不用管。要清空就停掉服务，删掉 `data/backups/` 下的文件，下次启动会自动生成当天的备份。`data/` 不进 git，删了不影响仓库。

**手机 / 外网打不开？** 检查三处：同一 Wi-Fi、防火墙已放行端口、云服务器安全组已放行端口。

**忘记管理密码？** 编辑 `data/config.json`，将 `password` 改为 `""`（或新密码）后重启服务。

**如何彻底重置？** 停止服务后删除 `data/` 目录，重启即回到初始状态（先备份需要保留的内容）。

**智能解析不准？** 解析是纯启发式规则，识别结果永远可以在界面上手工修改；欢迎在 Issue 中贴出解析失败的例子。

---

## 数据与安全

- 所有数据都在本机 `data/` 文件夹——**复制整个文件夹即完整备份**（含数据库、附件、配置）
- 每天自动备份数据库到 `data/backups/`（保留 14 份）；JSON 导出 / 导入适合跨机器迁移
- **学生名单、生日属于敏感信息**：请勿公开 `data/` 目录；公网部署务必设置管理密码
- 机器人令牌（`ingestToken`）泄露后改掉重启即可作废旧令牌

---

## 参与贡献

欢迎 Issue 和 Pull Request：Fork 本仓库并新建分支；**保持零依赖原则**——不引入 npm 运行时依赖；提交前运行 `node test.js` 确保自检通过。

| 文档 | 说明 |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Issue / PR 详细流程、提交信息与兼容性约定 |
| [CHANGELOG.md](CHANGELOG.md) | 版本更新记录 |
| [SECURITY.md](SECURITY.md) | 安全策略、漏洞私下报告流程 |

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
