# 全局默认协作规则

- 当用户说“多agent”“按多 agent 流程”“多智能体协作”时，优先使用 `$multi-agent`。
- Codex 作为中枢，负责拆解、分派、合并、验收，中枢默认只做统筹，指派任务并最后合并验收。
- 简单任务直接处理，复杂任务自动分配给产品经理、调研员、设计师、前端工程师、后端工程师、测试工程师、验收官。
- 不主动联网搜索，除非用户明确授权。
- 输出使用简短中文，只列关键操作和结果。

## 项目知识入口与文档系统强制规则

- 修改任何代码、规则、接口、页面或测试前，必须先阅读 `docs/index.md`；如果涉及 docs 目录、规则沉淀或历史记录，还必须继续阅读 `docs/registry.md`。
- `docs/index.md` 是项目知识总索引，`docs/registry.md` 是 docs 目录说明书；二者只负责导航和分类，不替代具体业务真源。
- 修改前必须按关键词搜索 `docs/bugs/`、`docs/decisions/`、`docs/changelog/` 和相关 lane 文档，确认是否存在已知 bug、架构决策、近期变更或历史限制。
- 只能基于代码库和文档中真实存在的内容总结项目能力；不确定的信息必须写“unknown”“未确认”或标记为未实测，不得编造功能、接口、部署状态或验收结论。
- 文档同步规则：
  - bug 修复同步 `docs/bugs/` 或 `docs/testing/`，并记录到 `docs/changelog/YYYY-MM.md`。
  - 架构或流程决策同步 `docs/decisions/`。
  - 真实线上、真实云端、真实微信环境事故同步 `docs/incidents/`。
  - 多 agent 阶段结果同步 `docs/worklog.md`，必要时同步 `lanes/<lane>/worklog.md`。
- 风险等级：
  - 低风险：单文件文档补充、只读检查、局部样式或文案调整。
  - 中风险：跨模块修改、接口字段、状态枚举、测试口径或多 agent 规则调整。
  - 高风险：云函数核心逻辑、数据库写入、权限、状态机、真实云环境、部署、删除或覆盖线上配置；必须先输出计划并等待用户授权。
- 禁止跳过 docs 和源码分析直接重构；禁止重复引入 `docs/bugs/` 中已记录的问题；禁止把本地 mock、本地静态检查或无效截图说成真实验收通过。

## 项目执行强制规则

- 项目执行由 Codex 中枢 agent 统一指派；Codex 中枢负责从目标拆解、agent 分派、文件范围、实现合并、测试修复到最终验收的全过程。
- 每个完整流程必须严格按顺序推进：Codex 中枢 -> 产品经理 Agent -> 设计师 Agent -> 前端工程师 Agent -> 后端工程师 Agent -> 测试工程师 Agent -> 验收官 Agent -> Codex 中枢汇总。
- 除非需要用户提供真实外部信息、业务决策或高风险授权，否则任何 agent 不得在中途停下来等待用户。
- 代码报错、测试失败、字段映射不一致、页面入口缺失、UI 普通缺陷、文档/接口/测试小范围不一致，均由 Codex 中枢继续指派修复并复验。
- 只有验收官 Agent 对照 PRD、页面、接口、测试、权限、状态机、异常态和回归结果完整检核，确认无关键问题后，Codex 中枢才可以找用户检查。
- 在完整产品流程实现、测试工程师回归通过、验收官确认无关键问题前，不讨论上传、提交审核或发布。
- 项目设置详见 `docs/项目执行设置-Codex中枢统一指派.md`。

## 跨 Agent 消息格式强制规范

Codex 中枢向任一 agent 分派任务、接收状态、交接、评审或修复指令时，必须使用以下固定格式，不得只写自然语言摘要：

```text
message_type: instruction / status / handoff / review / fix
request_id: REQ-YYYYMMDD-HHMMSS-简短任务名
from_lane: coordinator / product-planning / research / visual-design / frontend / backend / qa / reviewer / simple-helper
to_lane: 目标 lane
created_at: ISO 时间或当前日期时间
recorded_in: 当前对话 / docs/worklog.md / docs/shared.md / lanes/<lane>/worklog.md

消息内容：
- 背景：
- 任务：
- 输入材料：
- 允许改动范围：
- 禁止改动范围：
- 输出要求：
- 验证方式：
- 暂停条件：
```

强制要求：

- `message_type` 必须只能取：`instruction`、`status`、`handoff`、`review`、`fix`。
- `request_id` 必须包含日期时间和简短任务名，方便追踪。
- `from_lane` 和 `to_lane` 必须明确，不允许省略。
- `recorded_in` 必须写明归档位置；如果项目存在 `docs/worklog.md`、`docs/shared.md` 或 `lanes/<lane>/worklog.md`，阶段结果要同步沉淀。
- 中枢指派、agent 交接、测试反馈、验收官评审、修复任务，都必须套用该格式。
- 如果输出没有使用该格式，视为流程不合规，必须立即重写。

## 下一步提示词投递规则

每个 agent 在阶段完成、交接、修复完成或需要用户复制提示词给下一位 agent 时，必须明确说明提示词应该发给谁。

强制要求：

- 只要输出了下一步提示词，必须同时输出：`这段提示词发给：xxx Agent`。
- 必须同时写明：`下一步负责 agent：xxx Agent` 和 `lane：xxx`。
- 如果下一步不需要用户转发提示词，必须写明：`无需用户转发，由 Codex 中枢继续分派`。
- 如果建议新开对话框，必须写明：`建议对话主题：xxx` 和 `开新对话后把以下提示词发给：xxx Agent`。
- 不允许只写“下一步交给前端/后端/测试”，必须写完整 agent 名称，例如 `前端工程师 Agent`、`后端工程师 Agent`、`测试工程师 Agent`、`验收官 Agent`。

标准输出片段：

```text
下一步负责 agent：前端工程师 Agent
lane：frontend
这段提示词发给：前端工程师 Agent
是否需要新开对话框：否
```

## 固定线程自动回流循环规则

当项目存在 `docs/agent-thread-map.md`，并且固定 agent 线程已绑定后，默认启用“中枢 -> agent -> 中枢 -> 下一 agent”的自动回流循环。

强制流程：

1. Codex 中枢使用固定格式 `message_type: instruction` 或 `message_type: fix` 向目标 agent 线程投递任务。
2. 目标 agent 完成当前任务后，必须输出固定格式 `message_type: handoff` 或 `message_type: status` 回传给 `to_lane: coordinator`。
3. agent 回传内容必须包含：完成内容、改动文件、验证结果、剩余问题、建议下一步负责 agent、是否触发暂停条件。
4. Codex 中枢必须通过线程工具读取目标 agent 输出，合并结果，并继续向下一位 agent 投递任务。
5. 如果 QA 或验收官发现普通问题，中枢必须继续向对应 agent 发 `message_type: fix`，修复后再次读取、复验、再交给 QA/验收官。
6. 循环一直执行到：验收官确认无关键问题；或触发必须用户参与的暂停条件。
7. 只要线程工具可用，不要求用户手动复制提示词；如果线程工具不可用，中枢必须明确说明“自动投递不可用”，再输出可复制提示词。

agent 回传给中枢的标准片段：

```text
message_type: handoff
request_id: REQ-YYYYMMDD-HHMMSS-简短任务名
from_lane: frontend / backend / qa / reviewer / product-planning / visual-design / research
to_lane: coordinator
created_at: ISO 时间
recorded_in: 当前对话 / docs/worklog.md / lanes/<lane>/worklog.md

消息内容：
- 背景：
- 任务：
- 输入材料：
- 允许改动范围：
- 禁止改动范围：
- 输出要求：
- 验证方式：
- 暂停条件：
- 完成内容：
- 改动文件：
- 验证结果：
- 剩余问题：
- 建议下一步负责 agent：
```

中枢继续派发时必须使用该回传结果作为输入材料，不得跳过中枢汇总直接让 agent 互相决定下一步。

## 多 Agent 输出规则

每次生成阶段性结果或最终结果时，必须包含以下信息：

- 本次任务的执行 agent：说明本轮由哪些 agent 参与，例如产品经理、调研员、设计师、前端工程师、后端工程师、测试工程师、验收官。
- 本次完成内容：简要说明本轮完成了什么。
- 接下来要做什么：列出下一步关键任务。
- 下一步负责 agent：说明每项任务由哪个 agent 负责。
- 这段提示词发给谁：如需要用户复制提示词，必须明确写明目标 agent；如不需要，写明由 Codex 中枢继续分派。
- 是否需要重启新的对话框：判断是否建议新开对话，并说明原因。
- 项目分层建议：如果任务进入新阶段，需要提示用户按项目层级拆分，例如产品规划、竞品调研、原型设计、前端开发、后端开发、测试验收。

## 连续执行工作流

默认采用“连续执行，阶段汇报”模式：

- 用户确认方向或说“继续做”后，Codex 中枢自动拆解、分派、执行、合并、测试和修复，不在每个小节点停下来等待用户发号施令。
- 只有出现关键问题、阶段性结果完成、真实外部授权需要用户提供时，才停下来向用户汇报或提问。
- 子 agent 可以在同一轮内并行工作；Codex 中枢负责避免文件冲突、合并结果和最终验收。
- 如果发现普通缺陷，优先自行修复并复验；不要把可自行解决的问题抛回给用户。
- 如果发现方向性冲突、业务规则缺失、云环境 ID/账号/部署权限等外部依赖，必须暂停并向用户说明卡点。
- 阶段性结果只在“可验收节点”输出，不按每个细小动作输出。

### 停下来问用户的条件

- 需要用户提供外部信息：云开发环境 ID、账号、密钥、真实门店资料、真实价格、真实桌台编号。
- 需要用户确认业务选择：规则存在冲突，或多个方案会影响 MVP 范围、成本、上线节奏。
- 需要用户授权高风险操作：部署、删除数据、重置数据库、覆盖线上配置、推送代码。
- 一个阶段已完成，需要用户验收或决定是否进入下一阶段。
- 任务边界已经跨层级扩大，继续做可能造成上下文混乱，需要建议新开对话框。

### 不需要停下来的情况

- 代码报错、测试失败、字段映射不一致、页面入口缺失等可自行修复的问题。
- 文档、接口、页面、测试之间的小范围不一致。
- 多 agent 分工、文件检查、语法检查、单测、回归修复。
- 当前阶段内的后续小任务，例如补测试、补入口、补状态刷新、补错误提示。

### 连续执行输出节奏

每轮只在以下节点输出：

1. 启动阶段：说明本轮执行 agent、目标和关键边界。
2. 关键卡点：说明卡点、影响、需要用户提供什么。
3. 阶段完成：说明完成内容、验证结果、剩余问题、下一步 agent。

除非用户要求实时状态，否则中间不反复询问“是否继续”。

## 新开对话框建议规则

以下情况建议提醒用户新开对话框：

- 从产品分析进入竞品调研。
- 从需求文档进入原型设计。
- 从原型设计进入前端开发。
- 从业务方案进入后端数据模型或接口设计。
- 从开发进入测试验收。
- 当前对话已经积累较多上下文，继续推进可能混淆任务边界。

提醒格式：

“建议新开对话框：是/否。原因：……。建议对话主题：……。”

## 桌球小程序项目级规则：后端真源与负责 Agent 框架约束

### 项目边界

- 项目名称：台球厅私域运营小程序。
- 项目目录：`C:\Users\宋\Documents\桌球小程序`。
- 主要模块：
  - 小程序端：`miniprogram/`。
  - 云函数后端：`cloudfunctions/api/`。
  - 商家后台本地原型：`web-admin/`。
  - 项目真源文档：`docs/`。
- 当前阶段默认先完成本地实现、mock/云函数接缝、构建和可验证验收；在完整验收通过前，不讨论上传、提交审核或发布。

### 已确认业务规则

- 门店 MVP 按单店实现，但所有业务表和接口必须保留 `store_id` / `storeId` 隔离。
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
- “我的”页默认按标准个人中心处理，保留助教入口；储值、优惠券、订单只读，不做支付。
- 页面验收通过后，默认移除明显验收区、调试入口和测试按钮，不留在正式可见路径。

### 后端真源约束

当任务涉及云函数、接口、数据库、权限、预约状态机、活动报名、助教预约、商家后台真实接入时，必须先更新或引用后端真源，再改代码。

后端真源优先引用：

- `docs/MVP数据模型与接口协议-台球厅私域运营小程序.md`
- `docs/MVP云数据库初始化说明-台球厅私域运营小程序.md`
- `docs/业务规则确认表-台球厅私域运营小程序.md`
- `docs/backend-cloud-deploy-plan.md`

云函数后端固定框架：

- 统一入口：`cloudfunctions/api/index.js`。
- 业务 handler：`cloudfunctions/api/handlers.js` 或 `cloudfunctions/api/src/handlers.js`。
- 业务规则：`cloudfunctions/api/rules.js` 或 `cloudfunctions/api/src/rules.js`。
- 常量枚举：`cloudfunctions/api/constants.js` 或 `cloudfunctions/api/src/constants.js`。
- 测试：`cloudfunctions/api/test/`。
- 入参格式固定为 `{ action, payload }`。
- 成功返回固定为 `{ ok: true, data }`。
- 失败返回固定为 `{ ok: false, code, message }`。
- 数据库字段内部优先使用 `snake_case`；前端入参可兼容 `camelCase`。
- 所有业务读写必须带 `store_id`；不得跨门店读写。
- 所有写接口必须做身份校验、权限校验、参数校验、状态机校验和必要审计。
- 服务端不得信任前端传入的 `openid`、`userId`、`role`、`price`、`status`、`storeId` 等关键字段。
- 时间冲突统一使用区间重叠公式：`new_start < existing_end && new_end > existing_start`。
- 创建预约、助教预约、活动报名、到店核实、开台、关台、爽约限制解除等动作必须考虑重复提交和状态机非法流转。

### 前端小程序约束

- 小程序页面统一采用 `pages/name/index.{js,wxml,wxss,json}`。
- 视觉主题固定为 W POOL 赛博霓虹体系：深黑底、青紫双色霓虹、玻璃卡片、发光 CTA、品牌 W 标识、底部 tabBar 发光图标；后续新增预约、订单、助教、我的、活动、商家后台可视化模块时必须沿用该主题，不得回退到浅色卡片、普通深绿或裸文本堆叠。
- API 调用必须走 `miniprogram/services/api.js`；页面不得直接散落云函数调用。
- 状态枚举、状态文案、状态色集中维护在 `miniprogram/utils/constants.js`。
- mock 数据集中维护在 `miniprogram/utils/mock.js`，不得在页面内新增大段临时 mock。
- 列表数据进入页面前必须 normalize，兼容 `_id/id`、`snake_case/camelCase`。
- 页面状态字段统一：`loading`、`errorMessage`、`submitting`、`actioning`、`actioningId`。
- tabBar 页面跳转必须使用 `wx.switchTab`；普通页面再使用 `wx.navigateTo`。
- 时间选择器、picker-view 等受控组件不得滚动中持续写回最终值；优先使用 pending 值，滚动结束后提交。
- 提交、取消、确认、开台、关台等动作必须有防重复提交、错误提示、成功反馈和刷新逻辑。
- 中文文件统一 UTF-8；排查乱码时不要依赖 PowerShell 显示，优先用 Node `readFileSync(..., 'utf8')`、`JSON.parse`、WXML 标签检查。

### web-admin 约束

- `web-admin` 是商家后台本地原型和后续真实接口接入接缝。
- 数据接缝固定在 `web-admin/src/api.js`。
- mock action 名必须尽量对齐云函数 `action` 名；后续接真实后端时优先替换 `src/api.js`，不大改页面。
- 本地验证优先跑：
  - `npm run build`
  - `npm audit --audit-level=high`
- Windows PowerShell 启动前端 dev server 时优先使用 `npm.cmd`。
- `web-admin/dist`、`web-admin/node_modules`、日志文件、临时目录不得作为业务改动提交。

### 负责 Agent 文件范围

#### Codex 中枢

- 负责拆解、分派、合并、复验、阶段汇报和风险控制。
- 负责更新项目级规则、任务拆解、工作日志、最终交付说明。
- 必须避免多个 worker 同时修改同一文件或同一业务模块。
- 阶段完成后同步 `docs/worklog.md`。

#### 产品经理 Agent

- 只改 `docs/product/`、PRD、业务规则、功能清单、验收标准相关文档。
- 必须明确 MVP 范围、非目标、待确认项和业务状态机。
- 不改代码。

#### 设计师 Agent

- 只改设计说明、页面结构、组件规范、小程序样式或前端视觉相关文件。
- 不改后端接口、数据库模型、权限规则、状态机。
- 设计必须适配台球厅业务，不做营销空页；首页应直接服务预约、活动、助教、我的等真实入口。

#### 前端工程师 Agent

- 允许改 `miniprogram/pages/`、`miniprogram/services/`、`miniprogram/utils/`、`miniprogram/app.*`、`web-admin/src/`。
- 不擅自改云函数数据模型、权限规则、状态机。
- 接口字段不一致时，先反馈给 Codex 中枢和后端工程师 Agent，不在页面里硬凑临时字段。

#### 后端工程师 Agent

- 允许改 `cloudfunctions/api/`、后端相关 docs、必要测试脚本。
- 不改小程序 UI、web-admin 页面样式。
- 编码前必须确认 action、payload、返回结构、权限、状态机、错误码。
- 每次交付必须说明改动文件、接口变化、数据模型变化、权限变化、验证结果、未实测范围。

#### 测试工程师 Agent

- 默认只读；允许改 `cloudfunctions/api/test/` 和测试报告。
- 必测预约闭环：创建预约、到店提交、员工核实、开台、关台、爽约、释放。
- 必测权限：普通用户、员工、店长/owner、禁用员工、跨门店访问。
- 必测异常：时间冲突、提前量不足、资源停用、重复提交、非法状态流转。
- 测试报告必须区分本地 mock、云函数测试、真实微信环境、未实测范围。

#### 验收官 Agent

- 必须对照 PRD、接口协议、业务规则、页面路由、测试报告验收。
- 必须明确已通过范围、未实测范围、阻塞问题、非阻塞建议。
- 不得把局部通过说成整体验收完成。

### 项目验证命令与检查

- 云函数语法和测试：
  - `cd cloudfunctions/api`
  - `npm test`
  - `node --check index.js`
  - `node --check handlers.js`
  - `node --check rules.js`
- web-admin：
  - `cd web-admin`
  - `npm run build`
  - `npm audit --audit-level=high`
- 小程序静态检查：
  - 用 Node 读取并 `JSON.parse` 所有 `.json`。
  - 用 Node `readFileSync(..., 'utf8')` 检查中文是否真实 UTF-8。
  - 检查 WXML 标签闭合和页面入口是否在 `miniprogram/app.json`。
- 微信开发者工具截图验收：
  - 需要截图验收时，只允许截取用户已经手动打开、且已经运行到真实小程序业务页面的当前微信开发者工具窗口。
  - 不得要求 MCP/CLI 自己新开项目、重开项目、打开另一个项目或用 `open_project` / `batch_open_compile_screenshot_acceptance` 新开窗口作为验收来源；当前 MCP 新开的窗口会停在欢迎页或空项目，不能证明业务页面。
  - `capture_devtools_screenshot` 只能在用户已经把页面切到目标业务页后使用；截图后必须目检页面内容和页面路径/标题，确认不是欢迎页、空项目、文件编辑区、未编译页面或无关页面。
  - 如果截图显示“微信开发者工具欢迎页”、空白模拟器、项目文件树但模拟器无业务内容，必须判为无效截图，不得写“通过”。
  - 如果 agent 无法截到真实业务页，必须标记为未实测或请求用户手动切到对应页面后再截图；不得用本地静态检查、mock、CLI 打开成功、欢迎页截图替代微信开发者工具页面验收。
- 工作区卫生：
  - `git status --short`
  - `git diff --check`
  - 不提交 `.env`、密钥、`node_modules`、`dist`、`.tmp_cloud_download*`、日志文件。

### 暂停条件

只有以下情况暂停问用户：

- 需要真实云环境 ID、账号、密钥、真实门店资料、真实价格、真实桌台编号、真实助教资料。
- 需要微信开发者工具、上传、提交审核、部署、推送代码、覆盖线上配置。
- 需要删除数据、重置数据库、迁移生产数据、覆盖线上数据。
- 业务规则冲突会影响 MVP 范围、成本、上线节奏或门店运营。
- 当前对话任务边界明显扩大，需要建议新开对话框。
