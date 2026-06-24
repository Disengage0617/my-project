# 首页 services/api 路径错误修复 - 2026-06-21

message_type: handoff
request_id: REQ-20260621-首页services-api路径错误-新前端迁移
from_lane: frontend
to_lane: coordinator
created_at: 2026-06-21T11:15:00+08:00
recorded_in: 当前对话 / docs/agent-dispatch-state.md / docs/worklog.md / docs/frontend/首页services-api路径错误修复-20260621.md

## 根因判断

用户微信开发者工具真实截图显示首页空白，Console 报 `module 'services/api.js' is not defined, require args is '../../services/api'`，并连带出现 `Page "pages/reservation/index" has not been registered yet`。

本地只读检查确认：

- `miniprogram/services/api.js` 文件存在。
- `miniprogram/app.json` 已注册 `pages/reservation/index`。
- `miniprogram/pages/reservation/index.*` 文件齐全。

因此本轮判断根因不是页面缺失或 `app.json` 未注册，而是首页/预约页顶层 `require("../../services/api.js")` 在微信开发者工具运行层解析失败，导致页面 JS 顶层异常，`Page(...)` 没有执行，进而表现为页面未注册。

## 修复内容

- 将首页 API 引用从相对路径改为小程序根路径绝对引用：`require("/services/api.js")`。
- 将预约页 API、mock、constants 引用改为根路径绝对引用，避免同类启动级解析问题。

## 改动文件

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/reservation/index.js`
- `docs/frontend/首页services-api路径错误修复-20260621.md`

## 验证结果

- JS 语法检查：`node --check miniprogram/pages/home/index.js`、`node --check miniprogram/pages/reservation/index.js`、`node --check miniprogram/services/api.js`、`node --check miniprogram/utils/mock.js`、`node --check miniprogram/utils/constants.js` 均通过，无输出。
- JSON parse 检查：Node 读取并 `JSON.parse` `miniprogram/` 下 20 个 `.json` 文件，通过，输出 `json_ok=20`。
- WXML 基础标签检查：`home/index.wxml` 的 `view` 为 `67/67`；`reservation/index.wxml` 的 `view` 为 `72/72`、`block` 为 `6/6`、`picker-view-column` 为 `2/2`。
- 页面注册与引用目标检查：`pages/home/index`、`pages/reservation/index` 均存在于 `app.json`，两个页面 `.js/.wxml/.wxss/.json` 文件齐全，`/services/api.js`、`/utils/mock.js`、`/utils/constants.js` 目标文件存在，输出 `page_registration_and_absolute_require_targets_ok=true`。

## 未实测范围

- 未在微信开发者工具真实页面重新编译验证。
- 未真机、体验版、多账号验证。
- 未验证真实预约提交链路。
