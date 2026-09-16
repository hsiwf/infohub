# 贡献指南

感谢关注信息汇总（InfoHub）！欢迎通过 Issue 反馈问题、通过 Pull Request 贡献代码。

## 提交 Issue

- **Bug 反馈**：请说明操作步骤、预期行为、实际行为，附上运行环境（操作系统、Node 版本）。如与界面相关，欢迎附截图。
- **功能建议**：请描述使用场景和期望效果。本项目面向班级场景，功能取舍以"老师用得顺手、家长学生看得明白"为准。

## 提交 Pull Request

1. Fork 本仓库，从 `main` 新建分支（如 `feat/xxx`、`fix/xxx`）。
2. 开发前请先阅读下方"贡献约定"，避免方向性返工。
3. 提交前在本地跑通自检：

   ```bash
   node server.js    # 终端 1：启动服务
   node test.js      # 终端 2：端到端自检，需全部通过
   ```

4. Push 后发起 PR，说明改了什么、为什么改。CI（GitHub Actions）会对 Node 22 / 24 各跑一遍自检。

## 贡献约定

- **保持零依赖**：不引入任何 npm 运行时依赖。能用手写几十行解决的，就不引入库；这是本项目能"一条命令启动"的根基。
- **数据优先**：任何涉及读写的改动都要考虑旧数据兼容，表结构变更走 `db.js` 的轻量迁移（补列 / 删列）。
- **前端保持原生**：不引入框架和构建步骤，`public/` 下原生 HTML / CSS / JS 直接可读可改。
- **接口改动同步更新 `test.js` 与 `README.md` 的 API 一览**；面向用户的功能更新 `CHANGELOG.md`（Unreleased 段）。
- **提交信息用中文**，一句话说清目的，如 `修复接龙名单重名匹配抢占已认领槽位的问题`。

## 本地开发

```bash
git clone https://github.com/hsiwf/infohub.git
cd infohub
node server.js     # http://localhost:5757，首次启动自动创建 data/
INFOHUB_DEBUG=1 node server.js   # 打印 API 请求日志
```

目录结构与模块说明见 [README](README.md#-自检与开发)。
