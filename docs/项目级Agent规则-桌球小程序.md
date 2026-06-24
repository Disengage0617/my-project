# 项目级 Agent 规则：桌球小程序

更新时间：2026-06-20  
适用项目：`C:\Users\宋\Documents\桌球小程序`  
适用范围：小程序端、云函数后端、商家后台原型、测试验收、多 Agent 协作。

## 1. 项目边界

- 小程序端：`miniprogram/`
- 云函数后端：`cloudfunctions/api/`
- 商家后台本地原型：`web-admin/`
- 项目真源文档：`docs/`

当前阶段默认先完成本地实现、mock/云函数接缝、构建和可验证验收。完整验收通过前，不讨论上传、提交审核或发布。

## 1.1 文档系统入口

- 修改任何项目文件前，必须先读 `docs/index.md`。
- 涉及文档分类、规则沉淀、历史问题或目录职责时，必须继续读 `docs/registry.md`。
- 修改前必须搜索 `docs/bugs/`、`docs/decisions/`、`docs/changelog/` 和对应 lane 文档，确认是否存在已知问题、架构决策、近期变更或历史限制。
- 新增 bug、架构决策、真实事故和功能变更时，分别写入 `docs/bugs/`、`docs/decisions/`、`docs/incidents/`、`docs/changelog/`。
- 多 agent 阶段结果优先归档到 `docs/worklog.md`，必要时同步 `lanes/<lane>/worklog.md`。
- 不确定或未实测内容必须明确写“未确认”“未实测”或“unknown”，不得用推测补全项目能力。

## 2. 已确认业务规则

- MVP 按单店实现，但所有业务表和接口必须保留 `store_id` / `storeId` 隔离。
- 门店营业时间固定为 `24小时营业`。
- 桌台总数 40 张：
  - 普台区 A01-A12，12 张。
  - 银腿区 B01-B10，10 张。
  - 独牙区 C01-C08，8 张。
  - 金腿区 D01-D06，6 张。
  - 玫瑰金区 E01-E04，4 张。
- 用户预约至少提前 30 分钟。
- 未到店限制 3 天。
- 一期不接支付、灯控、收银硬件、桌台二维码。
- 到店流程：用户提交“我已到店”，员工核实后才能开台。
- “我的”页按标准个人中心处理，保留助教入口；储值、优惠券、订单只读，不做支付。
- 页面验收通过后，默认移除明显验收区、调试入口和测试按钮。

## 3. 后端真源约束

涉及云函数、接口、数据库、权限、预约状态机、活动报名、助教预约、商家后台真实接入时，必须先更新或引用后端真源，再改代码。

优先引用：

- `docs/MVP数据模型与接口协议-台球厅私域运营小程序.md`
- `docs/MVP云数据库初始化说明-台球厅私域运营小程序.md`
- `docs/业务规则确认表-台球厅私域运营小程序.md`
- `docs/backend-cloud-deploy-plan.md`

后端固定框架：

- 统一入口：`cloudfunctions/api/index.js`
- handler：`cloudfunctions/api/handlers.js` 或 `cloudfunctions/api/src/handlers.js`
- rules：`cloudfunctions/api/rules.js` 或 `cloudfunctions/api/src/rules.js`
- constants：`cloudfunctions/api/constants.js` 或 `cloudfunctions/api/src/constants.js`
- 测试：`cloudfunctions/api/test/`
- 入参：`{ action, payload }`
- 成功返回：`{ ok: true, data }`
- 失败返回：`{ ok: false, code, message }`
- 内部字段优先 `snake_case`，前端入参可兼容 `camelCase`
- 所有业务读写必须带 `store_id`
- 写接口必须校验身份、权限、参数、状态机和必要审计
- 不信任前端传入的 `openid`、`userId`、`role`、`price`、`status`、`storeId`
- 时间冲突统一使用：`new_start < existing_end && new_end > existing_start`

## 4. 前端小程序约束

- 页面统一采用 `pages/name/index.{js,wxml,wxss,json}`。
- API 调用必须走 `miniprogram/services/api.js`。
- 状态枚举、文案、状态色集中维护在 `miniprogram/utils/constants.js`。
- mock 数据集中维护在 `miniprogram/utils/mock.js`。
- 列表数据进入页面前必须 normalize，兼容 `_id/id`、`snake_case/camelCase`。
- 页面状态字段统一：`loading`、`errorMessage`、`submitting`、`actioning`、`actioningId`。
- tabBar 页面跳转使用 `wx.switchTab`；普通页使用 `wx.navigateTo`。
- picker-view 使用 pending 值，滚动结束后提交，避免回弹。
- 提交、取消、确认、开台、关台等动作必须有防重复提交、错误提示、成功反馈和刷新逻辑。
- 中文文件统一 UTF-8；排查乱码优先使用 Node 读取、JSON 解析和 WXML 标签检查。

## 5. web-admin 约束

- `web-admin` 是商家后台本地原型和真实接口接入接缝。
- 数据接缝固定在 `web-admin/src/api.js`。
- mock action 名尽量对齐云函数 action。
- 后续接真实后端时优先替换 `src/api.js`，不大改页面。
- 本地验证优先跑 `npm run build` 和 `npm audit --audit-level=high`。
- Windows PowerShell 启动 dev server 优先使用 `npm.cmd`。
- `dist`、`node_modules`、日志文件、临时目录不得作为业务改动提交。

## 6. 负责 Agent 文件范围

### Codex 中枢

- 拆解、分派、合并、复验、阶段汇报和风险控制。
- 更新项目级规则、任务拆解、工作日志、最终交付说明。
- 避免多个 worker 同时修改同一文件或同一业务模块。
- 阶段完成后同步 `docs/worklog.md`。

### 产品经理 Agent

- 只改 `docs/product/`、PRD、业务规则、功能清单、验收标准相关文档。
- 明确 MVP 范围、非目标、待确认项和业务状态机。
- 不改代码。

### 设计师 Agent

- 只改设计说明、页面结构、组件规范、小程序样式或前端视觉相关文件。
- 不改后端接口、数据库模型、权限规则、状态机。
- 设计必须适配台球厅业务，不做营销空页。

### 前端工程师 Agent

- 允许改 `miniprogram/pages/`、`miniprogram/services/`、`miniprogram/utils/`、`miniprogram/app.*`、`web-admin/src/`。
- 不擅自改云函数数据模型、权限规则、状态机。
- 字段不一致时反馈给 Codex 中枢和后端工程师 Agent。

### 后端工程师 Agent

- 允许改 `cloudfunctions/api/`、后端相关 docs、必要测试脚本。
- 不改小程序 UI、web-admin 页面样式。
- 编码前确认 action、payload、返回结构、权限、状态机、错误码。
- 交付必须说明改动文件、接口变化、数据模型变化、权限变化、验证结果、未实测范围。

### 测试工程师 Agent

- 默认只读；允许改 `cloudfunctions/api/test/` 和测试报告。
- 必测预约闭环、权限、时间冲突、提前量不足、资源停用、重复提交、非法状态流转。
- 测试报告必须区分本地 mock、云函数测试、真实微信环境、未实测范围。

### 验收官 Agent

- 对照 PRD、接口协议、业务规则、页面路由、测试报告验收。
- 明确已通过范围、未实测范围、阻塞问题、非阻塞建议。
- 不得把局部通过说成整体验收完成。

## 7. 验证命令

云函数：

```powershell
cd cloudfunctions/api
npm test
node --check index.js
node --check handlers.js
node --check rules.js
```

web-admin：

```powershell
cd web-admin
npm run build
npm audit --audit-level=high
```

小程序静态检查：

- 用 Node `JSON.parse` 所有 `.json`。
- 用 Node `readFileSync(..., 'utf8')` 检查中文。
- 检查 WXML 标签闭合和页面入口是否在 `miniprogram/app.json`。

工作区卫生：

```powershell
git status --short
git diff --check
```

禁止提交 `.env`、密钥、`node_modules`、`dist`、`.tmp_cloud_download*`、日志文件。

## 8. 暂停条件

只有以下情况暂停问用户：

- 需要真实云环境 ID、账号、密钥、真实门店资料、真实价格、真实桌台编号、真实助教资料。
- 需要微信开发者工具、上传、提交审核、部署、推送代码、覆盖线上配置。
- 需要删除数据、重置数据库、迁移生产数据、覆盖线上数据。
- 业务规则冲突会影响 MVP 范围、成本、上线节奏或门店运营。
- 当前对话任务边界明显扩大，需要建议新开对话框。
