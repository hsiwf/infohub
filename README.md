<div align="center">

<img src="public/icon.svg" width="96" alt="InfoHub 图标">

# 信息汇总 InfoHub

**把 QQ / 微信群里老师发的通知、任务、文件，汇总到一个页面。**

零依赖 · 本地运行 · 数据完全自持 · 手机电脑都能用

[功能特性](#-功能特性) · [安装部署](#-安装部署) · [Webhook 接入](#-webhook-接入) · [FAQ](#-faq)

![Node.js](https://img.shields.io/badge/node.js-%E2%89%A5%2022.5-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)

</div>

---

把班级群里混在一起的通知、作业、活动、文件统一收进一个看板：自动识别**分类**和**截止时间**，支持机器人自动录入、附件预览、日历导出。所有数据保存在自己的机器上（SQLite），不经过任何第三方。

适合：家长帮孩子管理班级群消息、班委汇总通知、小团队收集信息——任何"群里信息太多怕漏看"的场景。

## ✨ 功能特性

- **看板管理**：通知 / 任务 / 活动 / 文件 / 其他五类，置顶、完成勾选、优先级、全文搜索、按截止时间排序
- **智能识别**：粘贴消息原文，自动解析标题、分类、发送人、截止时间、重要程度和标签（纯本地启发式规则，结果可手工修改）
- **自动录入**：Webhook 接口配合 QQ / 微信机器人或手机快捷指令，消息自动进库、自动建群；手机还有 `/quick` 快捷录入页
- **文件与提醒**：图片 / PDF 在线预览，附件一键下载；截止提醒一键导出 `.ics` 进手机系统日历；重复信息自动提示
- **共享安全**：可选管理密码——所有人可浏览，增删改需管理员登录（适合班级共享）
- **省心运维**：每天自动备份数据库（保留 14 份）、JSON 导出 / 导入、统计面板、PWA 可安装到手机桌面

## 📦 安装部署

按使用场景三选一：

| 方式 | 适合场景 |
| --- | --- |
| [方式一：本地源码直接运行](#方式一本地源码直接运行) | 自己电脑 / 家里的旧电脑，家用局域网 |
| [方式二：服务器部署](#方式二服务器部署linux-命令行) | 有云服务器，习惯命令行操作 |
| [方式三：宝塔面板部署](#方式三宝塔面板部署) | 服务器装了宝塔面板，想全程图形界面操作 |

三种方式都一样简单：**项目零依赖，装好 Node.js 后不需要 `npm install`，数据全部存在各自的 `data/` 目录**。唯一的前提：**Node.js ≥ 22.5**（使用内置 SQLite 模块）。

### 方式一：本地源码直接运行

```bash
git clone https://github.com/hsiwf/infohub.git
cd infohub
node server.js
```

打开 <http://localhost:5757> 即可使用。首次启动会自动创建 `data/` 目录和配置文件。

手机访问启动日志里打印的局域网地址（如 `http://192.168.x.x:5757`），需与电脑同一 Wi-Fi；
Windows 首次启动时在防火墙弹窗里勾选"允许访问专用网络"。

<details>
<summary><b>想让电脑开机就运行？（后台常驻）</b></summary>

```bash
# pm2（Windows / macOS / Linux 通用）
npm install -g pm2
pm2 start server.js --name infohub
pm2 save && pm2 startup        # 开机自启
```

**Windows**：也可以用 [NSSM](https://nssm.cc/) 把 `node server.js` 注册为系统服务，Startup directory 填项目目录。

</details>

### 方式二：服务器部署（Linux 命令行）

1 核 1G 的最低配云服务器即可。以 Ubuntu 为例，从零到公网可访问约 10 分钟：

**1. 安装 Node.js 22.5+**

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS / RHEL
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo yum install -y nodejs

node -v   # 应输出 v22.x
```

**2. 获取代码**

```bash
sudo mkdir -p /opt/infohub && sudo chown $USER /opt/infohub
git clone https://github.com/hsiwf/infohub.git /opt/infohub
cd /opt/infohub
```

服务器不便用 git 时，把 `server.js`、`db.js`、`package.json` 和 `lib/`、`public/` 两个目录用 scp / SFTP 按原目录结构上传即可。

**3. 试运行并放行端口**

```bash
node server.js
```

在云厂商控制台的**安全组**里放行 TCP `5757`（本机防火墙：`sudo ufw allow 5757/tcp`），浏览器访问 `http://服务器IP:5757` 确认能打开，然后 `Ctrl+C` 停止。

**4. 设置管理密码（公网必做）**

试运行后项目目录下已生成 `data/config.json`，设置 `password` 字段（见[首次配置](#首次配置三种方式通用)），公网裸奔不设密码非常危险。

**5. 注册系统服务（开机自启）**

```ini
# /etc/systemd/system/infohub.service
[Unit]
Description=InfoHub 信息汇总
After=network.target

[Service]
WorkingDirectory=/opt/infohub
ExecStart=/usr/bin/node server.js
Environment=PORT=5757
Restart=on-failure
RestartSec=5
User=www-data            # 或专门创建的用户；该用户需对 data/ 有写权限

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data /opt/infohub/data
sudo systemctl daemon-reload
sudo systemctl enable --now infohub   # 启动并设为开机自启
systemctl status infohub              # 确认显示 active (running)
```

**日常维护**

| 操作 | 命令 / 位置 |
| --- | --- |
| 查看日志 | `journalctl -u infohub -f`，或项目内 `data/logs/server.log` |
| 升级版本 | `cd /opt/infohub && git pull && sudo systemctl restart infohub`（`data/` 与代码分离，不影响数据） |
| 修改配置 | 编辑 `data/config.json` 后重启服务 |
| 备份 | 自动备份在 `data/backups/`（保留 14 份）；重要数据建议定期打包 `data/` 异地存放 |
| 迁移 | 停止服务 → 拷贝整个 `data/` 目录到新机器同一位置 → 启动 |

### 方式三：宝塔面板部署

全程图形界面，无需敲命令（面板需 7.9+，自带 Node 项目功能）：

**1. 安装 Node.js**
软件商店 → 搜索安装「**Node.js版本管理器**」→ 在其中安装 **22.x** 版本（必须 ≥ 22.5；列表没有该版本时，先按方式二的第 1 步用命令行装好）。

**2. 上传源码**
文件 → 新建目录 `/www/wwwroot/infohub` → 把源码上传解压（可在终端里 `git clone`，或本机打包后上传）。
⚠️ 只传代码，**不要把本地电脑的 `data/` 目录传上去**。

**3. 添加 Node 项目**
网站 → **Node 项目** → 添加 Node 项目：

- 项目目录：`/www/wwwroot/infohub`
- 启动文件：`server.js`（Node 版本选 22.x）
- 端口：`5757`，运行用户：`www`
- 勾选**守护进程 / 开机自启**，提交后面板会用 PM2 自动拉起并守护项目

**4. 放行端口**
面板"安全 → 添加端口规则"放行 TCP `5757`；云厂商安全组同样需要放行。访问 `http://服务器IP:5757` 验证。

**5.（可选）绑定域名 + HTTPS**
Node 项目设置 → 域名管理绑定域名 → SSL 里申请 Let's Encrypt 证书、开启强制 HTTPS。之后可在安全规则里关掉 `5757`，只走 80 / 443。
> PWA"安装到桌面"等浏览器能力要求 HTTPS，用域名访问建议按此步配置。

**6. 修改配置**
编辑 `/www/wwwroot/infohub/data/config.json`（如设置管理密码），保存后在项目列表点"重启"生效。

### 首次配置（三种方式通用）

首次启动自动生成 `data/config.json`：

| 字段 | 说明 |
| --- | --- |
| `password` | 管理密码。**留空** = 不启用访问控制；设置后重启生效：所有人可浏览，写入操作需在 `/login` 登录（自带限速：同一 IP 每分钟最多 10 次）。局域网自用可不设，**公网部署务必设置** |
| `ingestToken` | 外部接入令牌，供机器人 / 快捷指令调用 Webhook；泄露后改掉重启即可作废旧令牌 |

可通过环境变量调整的行为（加在启动命令前，或写入 systemd 的 `Environment=`）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `5757` | HTTP 监听端口 |
| `INFOHUB_DEBUG=1` | 未启用 | 打印每条 API 请求，便于排查机器人接入问题 |
| `INFOHUB_OPEN=1` | 未启用 | 启动后自动打开浏览器（仅桌面场景有意义） |

> 备份 `data/` 目录（数据库 + 附件 + 配置）即等于备份全部数据。

## 🤖 Webhook 接入

机器人或手机快捷指令向 `/api/ingest` POST 一条 JSON，即可自动录入：

```bash
curl -X POST "http://localhost:5757/api/ingest?token=你的令牌" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "张老师：下周一下午4点前交自学计划表，务必按时",
    "group": "三年级二班",
    "platform": "wechat",
    "sender": "张老师"
  }'
```

| 参数 | 必填 | 说明 |
| --- | :---: | --- |
| `text` | ✅ | 消息原文，自动解析标题 / 分类 / 截止时间 / 标签 |
| `group` | | 群名称，不存在时自动创建 |
| `platform` | | `qq` / `wechat` / `other`，默认 `other` |
| `sender` | | 发送人 |
| `received_at` | | 接收时间，`YYYY-MM-DD HH:mm`，默认当前时间 |

<details>
<summary><b>iOS 快捷指令示例</b></summary>

1. 新建快捷指令 → 添加"**接收**共享表单/剪贴板"输入
2. 添加"**获取 URL 内容**"：`POST` 到 `http://你的服务器地址:5757/api/ingest?token=你的令牌`
3. 请求体（JSON）：`{"text": "快捷指令输入", "group": "班级群名"}`

在微信里选中消息 → 分享 → 运行此快捷指令，即可完成录入。

</details>

## 🧪 自检测试

先启动服务，另开一个终端运行：

```bash
node test.js
```

脚本对全部 API 做端到端检查：全部通过输出 PASS 汇总，任何一项失败输出 FAIL 并以非零码退出（可用于 CI）。

## 📁 项目结构

```
infohub/
├── server.js            # HTTP 服务与全部 API（零依赖）
├── db.js                # SQLite 初始化与表结构（node:sqlite）
├── lib/
│   ├── smartparse.js    # 中文通知智能解析（启发式规则）
│   └── multipart.js     # multipart/form-data 解析
├── public/              # 前端（原生 HTML / CSS / JS + PWA）
│   ├── index.html       # 主界面
│   ├── quick.html       # 快捷录入页
│   ├── login.html       # 管理员登录页
│   └── js/app.js        # 前端逻辑
├── test.js              # 端到端自检脚本
├── Dockerfile           # Docker 部署（可选）
└── data/                # 运行时生成：数据库、附件、备份、日志、config.json（不入库）
```

## 🔌 API

<details>
<summary><b>查看完整 API 列表</b></summary>

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET / POST | `/api/messages` | 信息列表（支持 `q` / `group_id` / `category` / `status` / `sort` / 分页）/ 新增 |
| GET / PUT / DELETE | `/api/messages/:id` | 详情 / 修改 / 删除（含附件文件） |
| POST | `/api/messages/:id/toggle` | 切换完成状态 |
| POST | `/api/messages/:id/pin` | 切换置顶 |
| GET / POST | `/api/groups` | 群列表（`withCounts=1` 带数量）/ 新增 |
| PUT / DELETE | `/api/groups/:id` | 修改 / 删除群（群下信息保留） |
| POST | `/api/upload` | 上传附件（multipart/form-data，需 `message_id`） |
| GET | `/api/attachments/:id/download` | 下载附件（图片 / PDF 内联预览） |
| DELETE | `/api/attachments/:id` | 删除附件 |
| GET | `/api/files` | 附件列表（支持 `q` / `group_id`） |
| POST | `/api/parse` | 智能解析文本（不落库） |
| POST | `/api/similar` | 相似信息检测（防重复录入） |
| POST | `/api/ingest?token=` | 外部接入 Webhook |
| GET | `/api/calendar.ics` | 导出截止提醒日历 |
| GET | `/api/export` | 导出 JSON 备份（仅管理员） |
| POST | `/api/import?force=1` | 导入 JSON 备份（仅空库时允许） |
| GET | `/api/stats` | 统计数据 |
| POST | `/api/login` / `/api/logout` | 管理员登录 / 登出（设置了密码时） |

所有响应均为 JSON；写入类接口在设置了管理密码后需要登录会话或 `X-Token` 请求头。

</details>

## ❓ FAQ

**端口被占用？**
大概率服务已经在运行，直接打开 <http://localhost:5757> 即可；或用 `PORT=8080 node server.js` 换端口。

**手机 / 外网打不开？**
检查三处：同一 Wi-Fi（局域网访问）、防火墙已放行端口、云服务器安全组已放行端口。

**忘记管理密码？**
编辑 `data/config.json`，将 `password` 改为 `""`（或新密码）后重启服务。

**如何彻底重置？**
停止服务后删除 `data/` 目录，重启即回到初始状态（注意先备份需要保留的内容）。

**智能解析不准？**
解析是纯启发式规则，识别结果永远可以在界面上手工修改；欢迎在 Issue 中贴出解析失败的例子。

## 🤝 参与贡献

欢迎 Issue 和 Pull Request：

1. Fork 本仓库并新建分支
2. 保持零依赖原则——不要引入 `npm` 运行时依赖
3. 提交前运行 `node test.js` 确保自检通过

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。
