# 首页 services/api 路径二次修复 - 2026-06-21

message_type: handoff
request_id: REQ-20260621-首页services-api路径二次修复-新前端
from_lane: frontend
to_lane: coordinator
created_at: 2026-06-21T11:24:00+08:00
recorded_in: 当前对话 / docs/agent-dispatch-state.md / docs/worklog.md / docs/frontend/首页services-api路径二次修复-20260621.md

## 背景

QA 已在微信开发者工具真实窗口复测上一轮修复，结论不通过。DevTools 真实 Console 报：

- `module 'pages/home/services/api.js' is not defined, require args is '/services/api.js'`

这说明上一轮使用的 `require("/services/api.js")` 没有被微信小程序 JS 模块系统按小程序根目录解析，而是被归到当前页面目录下的 `pages/home/services/api.js`。

## 本轮策略

不再使用 `/services/api.js` 绝对路径。页面启动文件只引用当前页面目录下的小范围中转模块：

- 首页：`require("./services/api.js")`
- 预约页：`require("./services/api.js")`、`require("./utils/mock.js")`、`require("./utils/constants.js")`

中转模块再转发到公共实现，避免改动公共 API、mock、constants 逻辑，也避免页面顶层继续触发 DevTools 不识别的绝对路径解析。

## 改动文件

- `miniprogram/pages/home/index.js`
- `miniprogram/pages/home/services/api.js`
- `miniprogram/pages/reservation/index.js`
- `miniprogram/pages/reservation/services/api.js`
- `miniprogram/pages/reservation/utils/mock.js`
- `miniprogram/pages/reservation/utils/constants.js`
- `docs/frontend/首页services-api路径二次修复-20260621.md`
- `docs/worklog.md`

## 验证结果

- JS 语法检查：`node --check` 覆盖首页、首页中转 API、预约页、预约页中转 API、预约页中转 mock、预约页中转 constants、公共 `services/api.js`、公共 `utils/mock.js`、公共 `utils/constants.js`，均通过，无输出。
- JSON parse 检查：Node 读取并 `JSON.parse` `miniprogram/` 下 20 个 `.json` 文件，通过，输出 `json_ok=20`。
- WXML 基础标签检查：`home/index.wxml` 的 `view` 为 `67/67`；`reservation/index.wxml` 的 `view` 为 `72/72`、`block` 为 `6/6`、`picker-view-column` 为 `2/2`。
- 页面注册与中转目标检查：`pages/home/index`、`pages/reservation/index` 均存在于 `app.json`；两个页面 `.js/.wxml/.wxss/.json` 文件齐全；页面本地 `./services/api.js`、`./utils/mock.js`、`./utils/constants.js` 中转文件存在；中转目标公共 `services/api.js`、`utils/mock.js`、`utils/constants.js` 存在，输出 `startup_bridge_require_targets_ok=true`。
- 微信开发者工具 CLI：执行 `cache --clean compile --project C:\Users\宋\Documents\桌球小程序` 成功，输出 `cleancache`；执行 `open --project C:\Users\宋\Documents\桌球小程序` 成功，输出 `open`。本轮未上传、未预览、未部署。
- 空白检查：未在本线程取得真实模拟器截图，不能写成 DevTools 页面已通过。

## 未实测范围

- 本线程未在微信开发者工具真实窗口重新编译截图验证。
- 未验证真实预约提交链路、真机、体验版、多账号。
