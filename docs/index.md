# Project Knowledge Index

更新时间：2026-06-24

本文件是桌球小程序项目的知识总入口。任何 agent 在修改项目行为、接口、页面、规则或测试前，必须先阅读本文件；如果变更涉及 docs 目录语义，还必须继续阅读 `docs/registry.md`。

## 项目简介

本项目是台球厅私域运营小程序，当前按单店 MVP 推进，保留 `store_id` / `storeId` 数据隔离能力。项目包含微信小程序端、云函数后端、商家后台本地原型、项目真源文档和多 agent 协作规则。

## 系统入口

- 小程序端：`miniprogram/app.json`、`miniprogram/app.js`、`miniprogram/pages/`
- 小程序 API 层：`miniprogram/services/api.js`
- 小程序常量：`miniprogram/utils/constants.js`
- 小程序 mock：`miniprogram/utils/mock.js`
- 云函数入口：`cloudfunctions/api/index.js`
- 云函数业务：`cloudfunctions/api/handlers.js`、`cloudfunctions/api/src/handlers.js`
- 云函数规则：`cloudfunctions/api/rules.js`、`cloudfunctions/api/src/rules.js`
- 云函数常量：`cloudfunctions/api/constants.js`、`cloudfunctions/api/src/constants.js`
- 云函数测试：`cloudfunctions/api/test/`
- 商家后台入口：`web-admin/src/App.jsx`、`web-admin/src/main.jsx`
- 商家后台 API 接缝：`web-admin/src/api.js`
- 项目规则：`AGENTS.md`
- 固定线程：`docs/agent-thread-map.md`
- 中枢调度状态：`docs/agent-dispatch-state.md`
- 工作日志：`docs/worklog.md`

## 文档优先级

1. `AGENTS.md`：agent 行为规则、暂停条件、文件范围和验证边界。
2. `docs/index.md`：项目知识入口和修改前导航。
3. `docs/registry.md`：docs 目录说明书，解释各类文档应该写到哪里。
4. 业务真源：PRD、接口协议、业务规则、数据模型、云数据库初始化说明。
5. lane 文档：产品、设计、前端、后端、测试、验收报告和交接记录。
6. 历史约束：`docs/bugs/`、`docs/decisions/`、`docs/changelog/`、`docs/incidents/`。

## 真实已知能力

- 小程序端已有首页、预约、预约详情、我的预约、活动、助教、商家配置、员工工作台、桌台状态、爽约限制、到店审核等页面骨架和交互实现。
- 云函数后端已有统一 `{ action, payload }` 入口、业务 handler、规则校验、常量枚举和测试目录。
- 商家后台已有本地原型与 `web-admin/src/api.js` 数据接缝。
- 文档系统已有产品、前端、后端、设计、测试、验收、部署前清单和多 agent 调度记录。
- 微信开发者工具和真实云端验收必须单独说明，不能用本地静态检查替代。

## 修改代码前必须检查

1. 先读 `AGENTS.md` 和本文件。
2. 如涉及 docs 分类、同步或规则维护，继续读 `docs/registry.md`。
3. 按任务类型读取对应真源：
   - 产品范围：`docs/product/`、`docs/PRD-台球行业小程序.md`
   - 业务规则：`docs/业务规则确认表-台球厅私域运营小程序.md`
   - 接口和数据：`docs/MVP数据模型与接口协议-台球厅私域运营小程序.md`、`docs/backend/api.md`、`docs/backend/schema.md`
   - 云数据库：`docs/MVP云数据库初始化说明-台球厅私域运营小程序.md`
   - 前端路由状态：`docs/frontend/routes.md`、`docs/frontend/states.md`
   - 测试验收：`docs/testing/`、`docs/review/`
4. 搜索 `docs/bugs/` 是否有同类已知问题。
5. 搜索 `docs/decisions/` 是否有相关架构决策。
6. 搜索 `docs/changelog/` 是否有近期变更。
7. 修改前输出或内部形成最小计划；高风险操作必须暂停等待用户授权。

## 风险等级

- 低风险：单文件文档补充、只读检查、局部样式或文案调整，不影响业务规则和数据。
- 中风险：跨页面、跨模块、接口字段、状态枚举、测试口径和多 agent 规则调整，需要同步相关 docs。
- 高风险：云函数核心逻辑、数据库写入、权限、状态机、真实云环境、部署、删除/覆盖线上配置。必须先输出计划并等待用户授权。

## 文档同步规则

- bug 修复：同步 `docs/bugs/` 或测试报告，并在 `docs/changelog/YYYY-MM.md` 留记录。
- 架构调整：同步 `docs/decisions/`。
- 功能变更：同步业务真源、对应 lane 文档和 `docs/changelog/YYYY-MM.md`。
- 线上事故或真实环境问题：同步 `docs/incidents/`。
- 多 agent 调度：同步 `docs/worklog.md`、`docs/agent-dispatch-state.md`，必要时同步 `lanes/<lane>/worklog.md`。

## 禁止行为

- 禁止跳过 docs 和源码分析直接重构。
- 禁止编造项目不存在的功能、接口、部署状态或验收结论。
- 禁止忽略 `docs/bugs/` 中已记录的问题。
- 禁止把本地 mock、本地静态检查或欢迎页截图说成真实微信/真实云端验收通过。
- 禁止未经授权执行部署、写真实数据库、删除数据、覆盖线上配置或推送代码。

