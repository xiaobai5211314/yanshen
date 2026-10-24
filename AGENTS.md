# AGENTS.md · 《纯净盐神》项目规则

本项目为《纯净盐神》（YanShen Pure）开源在线小说阅读站与离线归档工具，旨在彻底去除第三方搬运站的弹窗广告与商业骚扰，提供极简、沉浸式的知乎盐选小说阅读体验。

## 1. 项目定位与业务边界
- **业务定位**：面向知乎盐选小说、爽文专栏与脑洞故事的纯净免广告阅读端。
- **核心特色**：
  - **100% 纯净无广告**：彻底移除第三方搬运站所有 Google AdSense 弹窗、全屏插屏与外链引流。
  - **海量全量检索**：收录 8,300+ 篇专栏小说，支持实时秒级模糊检索。
  - **离线与本地持久化**：预置高赞离线小说，支持 IndexedDB 自动缓存。
  - **微信读书级排版**：提供羊皮纸/极夜黑/纯白/浅草绿 4 套主题、字号缩放与字体切换。
- **独立域名**：主域名 `https://yan.21212121.xyz`（备用别名 `https://yanshen.21212121.xyz`）。
- **独立开源仓库**：`https://github.com/xiaobai5211314/yanshen`。

## 2. 界面与交互规范
- 前端采用轻量现代化原生 SPA 架构，无庞大前端框架打包黑盒，双击本地 `index.html` 即可离线运行。
- 阅读进度自动持久化存储至 `localStorage`，正文缓存至浏览器 `IndexedDB`。
- 遵循工作区整体设计规范，保持纯粹沉浸与极速响应。

## 3. 部署与运维
- **服务器目标目录**：`/www/wwwroot/yan.21212121.xyz`（腾讯云 Ubuntu + 宝塔 Nginx 静态站点）。
- **CI/CD 自动化部署**：
  - 推送代码至 GitHub `main` 分支时，通过 GitHub Actions（`.github/workflows/deploy.yml`）自动将代码同步至腾讯云生产服务器并平滑重载 Nginx。
  - 依赖 GitHub Secrets：`SERVER_HOST`、`SERVER_PORT`、`SERVER_USER`、`SERVER_SSH_KEY`。
- **手动部署脚本**：运行 `python tools/deploy_server.py` 亦可一键将最新前端代码和离线数据打包上传至生产服务器。
- **数据更新与增量同步**：
  - **一键全自动增量更新**：运行 `python tools/auto_update.py`（自动对比源站增量、剥离广告、追加离线预置、推送到又拍云 CDN 并自动触发 GitHub Actions 发布上线）。
  - **云端定时无人值守更新**：GitHub Actions（`.github/workflows/deploy.yml`）已配置每天中午 12:00（UTC 04:00）自动检查源站新小说并全自动增量更新部署。
  - **又拍云 CDN 单独推送**：`python tools/sync_upyun.py`。
  - 手动底层工具：`python tools/fetch_index.py`（拉取全量索引）、`python tools/sync_articles.py`（批量清洗离线小说）。
