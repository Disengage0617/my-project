# api 运行时缺 src/handlers 修复 - 2026-06-20

message_type: handoff
request_id: REQ-20260620-api运行时缺src-handlers修复
from_lane: backend
to_lane: coordinator
created_at: 2026-06-20T当前时间+08:00
recorded_in: 当前对话 / docs/backend/api运行时缺src-handlers修复-20260620.md / docs/worklog.md

消息内容：
- 根因：
  - 用户 DevTools 报错为 `Cannot find module './src/handlers'`，说明云端运行时入口已加载到根级 `handlers.js`，但运行包启动时没有成功解析二级路径 `./src/handlers`。
  - 部署后下载包虽然能看到 `src/handlers.js`，但运行时错误优先级更高；根级 `handlers.js` 只有 `module.exports = require("./src/handlers")` 的二跳转发，导致一旦云端实例/打包/缓存对 `src/` 目录解析异常，函数启动直接失败。
  - 这是云函数运行包入口结构兼容问题，不是数据库数据问题；也不是小程序 UI 问题。
- 修复动作：
  - 将 `cloudfunctions/api/src/handlers.js` 同步到根级 `cloudfunctions/api/handlers.js`。
  - 将 `cloudfunctions/api/src/constants.js` 同步到根级 `cloudfunctions/api/constants.js`。
  - 将 `cloudfunctions/api/src/rules.js` 同步到根级 `cloudfunctions/api/rules.js`。
  - 保持 `cloudfunctions/api/index.js` 不变：`const handlers = require("./handlers")`。
  - 重新部署云环境 `cloud1-d2gp2ayiwab8f8a94` 的云函数 `api`：

```text
& 'E:\微信web开发者工具\cli.bat' cloud functions deploy --project 'C:\Users\宋\Documents\桌球小程序' --appid wx6a196f6ebfb27596 --env cloud1-d2gp2ayiwab8f8a94 --paths 'C:\Users\宋\Documents\桌球小程序\cloudfunctions\api' --remote-npm-install --lang zh
```

  - 部署结果：成功，`api success=true`、`filesCount=11`、`packSize='47.6 KB'`。包体从上一轮 `30.5 KB` 增至 `47.6 KB`，符合根级 `handlers/constants/rules` 从转发文件变为完整实现的预期。
- 运行时验证结果：
  - 微信开发者工具 CLI 没有提供直接 invoke 云函数 action 的子命令。
  - 本地 `wx-server-sdk` 直连云函数需要腾讯云 `secretId/secretKey`，本轮无密钥且不要求用户提供密钥。
  - 已执行等价函数包启动 smoke：从重新部署后隔离下载包 `.tmp_cloud_download_runtime_fix_api_20260620/index.js` 加载入口，mock `wx-server-sdk` 与只读 mock DB，调用 `getAvailableTables({ table_type: "duya" })`。
  - smoke 结果：返回 `{"ok":true,"data":{"total":1,...}}`，未出现 `Cannot find module './src/handlers'`，说明部署包根级入口链路已能加载并执行 `getAvailableTables`。
  - `cloud functions info --env cloud1-d2gp2ayiwab8f8a94 --names api`：`api` 为 `Active / Nodejs16.13 / timeout 3`。
- 部署包核对：
  - 已隔离下载重新部署后的云端包到 `.tmp_cloud_download_runtime_fix_api_20260620/`。
  - 下载包根目录包含 `index.js`、`handlers.js`、`constants.js`、`rules.js`、`src/`、`scripts/`、`test/`、`node_modules/`。
  - 根级 `index.js` 仍为 `require("./handlers")`。
  - 根级 `handlers.js` 长度为 `84583`，不再是 44 字节转发文件；关键字核对命中 `duya`、`bootstrapMvp`、`getAvailableTables`，未命中 `./src/handlers`。
  - 根级 `handlers.js` 包含 C 组 `count: 8`、`table_type: "duya"`、`table_type_name: "独牙"`，以及 `getAvailableTables` 的 `table_type/tableType` 服务端过滤。
  - `node --check .tmp_cloud_download_runtime_fix_api_20260620\handlers.js`：通过，无输出。
- 是否仍需 DB 检查：
  - 是。当前修复的是云函数运行时模块加载问题。
  - 若用户页面不再报 `Cannot find module './src/handlers'` 但独牙仍为 0 张，则下一步必须只读检查真实 `billiard_table` 是否已有 C01-C08、`table_type=duya`、`enabled=true` 和可用状态。
  - 若真实 DB 缺数据，再单独申请 DB 写入/初始化/迁移授权。本轮未写数据库。
- 改动文件：
  - `cloudfunctions/api/handlers.js`
  - `cloudfunctions/api/constants.js`
  - `cloudfunctions/api/rules.js`
  - `docs/backend/api运行时缺src-handlers修复-20260620.md`
  - `docs/worklog.md`
  - 新增隔离下载目录：`.tmp_cloud_download_runtime_fix_api_20260620/`
- 验证结果：
  - `node --check cloudfunctions\api\handlers.js`：通过。
  - `node --check cloudfunctions\api\constants.js`：通过。
  - `node --check cloudfunctions\api\rules.js`：通过。
  - `npm test` in `cloudfunctions/api`：通过，29/29。
  - 重新部署 `api`：成功，`api success=true`。
  - 部署后隔离下载：成功。
  - 部署后包核对：根级 `handlers.js` 已是完整实现，不依赖 `./src/handlers`。
  - 等价运行时 smoke：通过，入口可加载并返回 `getAvailableTables` 的 `ok:true,total:1`。
  - 待执行：`git diff --check -- docs/backend/api运行时缺src-handlers修复-20260620.md docs/worklog.md`。
- 未实测范围：
  - 未通过真实小程序页面复核。
  - 未通过真实云函数 invoke 直接调用 action；当前 CLI 不提供 invoke，本地 SDK 直连缺腾讯云密钥。
  - 未查询真实云数据库。
  - 未写库、未初始化/迁移数据、未删除/重置/覆盖数据。
- 建议下一步负责 agent：
  - 测试工程师 Agent：请用户重新编译/刷新 DevTools 后复测预约页，先确认 `Cannot find module './src/handlers'` 是否消失。
  - 后端工程师 Agent：若报错消失但独牙仍 0 张，继续做 DB 只读核对。
  - Codex 中枢：若 DB 缺 C01-C08，再申请 DB 写入/初始化/迁移授权。
- 是否触发暂停条件：
  - 是。运行时模块加载问题已做部署包兼容修复；继续到真实数据补齐需要 DB 只读或写入/初始化授权。本轮未执行任何数据库写入。

## Handoff 回传

message_type: handoff
request_id: REQ-20260620-api运行时缺src-handlers修复
from_lane: backend
to_lane: coordinator
created_at: 2026-06-20T当前时间+08:00
recorded_in: 当前对话 / docs/backend/api运行时缺src-handlers修复-20260620.md / docs/worklog.md

消息内容：
- 根因：云函数根级 `handlers.js` 仅转发 `require("./src/handlers")`，用户运行时实例未能解析 `src/handlers`，导致 `api` 启动失败；这是运行包入口结构兼容问题。
- 修复动作：根级 `handlers.js/constants.js/rules.js` 同步为 `src/` 下完整实现，重新部署 `api`，部署成功 `api success=true`、`packSize='47.6 KB'`。
- 运行时验证结果：重新下载部署包后，根级 `index.js -> ./handlers` 可加载完整 handler；等价函数包启动 smoke 调用 `getAvailableTables({ table_type:"duya" })` 返回 `ok:true,total:1`，未再出现 `Cannot find module './src/handlers'`。
- 部署包核对：`.tmp_cloud_download_runtime_fix_api_20260620/` 根级 `handlers.js` 已包含 `duya`、`bootstrapMvp`、`getAvailableTables`，不再依赖 `./src/handlers`；`api` 元信息仍为 `Active / Nodejs16.13 / timeout 3`。
- 是否仍需 DB 检查：是。若用户页面不再报模块错误但独牙仍 0 张，需要只读核对真实 `billiard_table`。
- 改动文件：`cloudfunctions/api/handlers.js`、`cloudfunctions/api/constants.js`、`cloudfunctions/api/rules.js`、`docs/backend/api运行时缺src-handlers修复-20260620.md`、`docs/worklog.md`、`.tmp_cloud_download_runtime_fix_api_20260620/`。
- 验证结果：根级 JS 语法检查通过；`cloudfunctions/api npm test` 29/29 通过；重新部署成功；部署后下载核对通过；等价运行时 smoke 通过；`git diff --check` 待最终命令确认。
- 未实测范围：未真实页面复核、未真实 invoke action、未查真实 DB、未写库。
- 建议下一步负责 agent：测试工程师 Agent 组织用户 DevTools 复测模块错误是否消失；后端工程师 Agent 视结果继续 DB 只读核对。
- 是否触发暂停条件：是。继续到数据补齐仍需 DB 只读或写入/初始化授权。
