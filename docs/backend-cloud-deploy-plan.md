# 云函数部署联调准备计划

request_id: REQ-20260615-000000-云函数部署联调预检查

## 当前检查结论

- 项目 AppID 已在 `project.config.json` 中配置：`wx6a196f6ebfb27596`。
- 小程序云环境已在 `miniprogram/app.js` 中配置：`cloud1-d2gp2ayiwab8f8a94`。
- 云函数根目录：`cloudfunctions/`。
- 待部署云函数：`cloudfunctions/api`。
- 云函数入口：`cloudfunctions/api/index.js`。
- 入口逻辑：读取 `event.action`，从 `handlers[action]` 分发，统一返回 `{ ok, data }` 或 `{ ok:false, code, message }`。
- 根级 `handlers.js`、`constants.js`、`rules.js` 已转发到 `src/`，部署包需要包含 `src/` 目录。
- 本地后端测试：`npm test`，25/25 通过。
- 本文档只记录部署预检查和建议步骤，不代表已部署。

## 重点接口状态

- `getMineCenter`
- `getPageConfig`
- `managePageConfig`
- `getAssets`
- `manageAssets`
- `getAdminDashboard`
- `getAdminReservations`
- `getAuditLogs`
- `manageStore`
- `manageTables`
- `managePriceRules`
- `manageAssistants`
- `manageCampaigns`

## 本地验证命令

```bash
cd cloudfunctions/api
npm test
```

预期：25/25 通过。

## 部署前必须确认

- 云开发环境 ID：已发现 `cloud1-d2gp2ayiwab8f8a94`，部署前仍需用户确认是否使用该环境。
- 当前微信开发者工具是否已登录目标小程序账号。
- 是否允许上传并覆盖云函数 `api`。
- 是否允许安装/上传云函数依赖。
- 是否允许执行真实云端 smoke test。
- 是否允许执行 `seed` 或 `bootstrapMvp` 写入测试数据。

## 建议部署步骤

方式 A：微信开发者工具

1. 打开项目 `C:\Users\宋\Documents\桌球小程序`。
2. 确认顶部云环境为 `cloud1-d2gp2ayiwab8f8a94`。
3. 右键 `cloudfunctions/api`。
4. 选择“上传并部署：云端安装依赖”。
5. 部署完成后在云开发控制台确认 `api` 云函数更新时间。

方式 B：CLI，仅在中枢明确授权后执行

```bash
cd cloudfunctions/api
npm test
```

部署命令需根据当前可用 CLI 决定，例如微信开发者工具 CLI 或云开发 CLI。执行前必须确认云环境 ID 和账号登录态。

## 云端 smoke test 清单

只读优先：

- `getPageConfig`
- `getAssets`
- `getAdminDashboard`
- `getAdminReservations`
- `getAuditLogs`
- `getMineCenter`

写操作需单独授权：

- `managePageConfig`
- `manageAssets`
- `manageStore`
- `manageTables`
- `managePriceRules`
- `manageAssistants`
- `manageCampaigns`

## 风险与限制

- 未获得用户确认使用 `cloud1-d2gp2ayiwab8f8a94` 前不能部署。
- 未获得用户授权前不能覆盖云函数。
- 未获得真实数据授权前不能执行 `seed`、`bootstrapMvp` 或任何写接口。
- 本阶段不接微信支付。
- 本阶段不发布上线。
