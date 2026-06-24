# Docs Registry

更新时间：2026-06-24

本文件是 docs 目录说明书。它只说明文档放置规则和阅读顺序，不承载具体业务逻辑。

## 核心入口

- `docs/index.md`：项目知识总索引，修改前第一入口。
- `AGENTS.md`：agent 行为规则、文件边界、暂停条件和验证要求。
- `docs/worklog.md`：阶段性工作记录和中枢交接归档。
- `docs/agent-thread-map.md`：固定 agent 线程映射。
- `docs/agent-dispatch-state.md`：当前调度状态。

## 业务真源

- `docs/PRD-台球行业小程序.md`：产品目标、范围和核心需求。
- `docs/业务规则确认表-台球厅私域运营小程序.md`：已确认业务规则。
- `docs/MVP数据模型与接口协议-台球厅私域运营小程序.md`：MVP 数据模型和接口协议。
- `docs/MVP云数据库初始化说明-台球厅私域运营小程序.md`：云数据库初始化说明。
- `docs/backend-cloud-deploy-plan.md`：真实云函数联调和部署前计划。

## Lane 目录

- `docs/product/`：产品规划、功能清单、验收标准。
- `docs/design/`：视觉规范、页面结构、交互状态和参考图。
- `docs/frontend/`：前端路由、状态、页面实现和接入缺口。
- `docs/backend/`：接口、schema、规则、后端真源、部署前清单。
- `docs/testing/`：QA 计划、复测、截图证据和未实测范围。
- `docs/review/`：验收结论、阻塞项、非阻塞建议和交付判断。

## 历史约束目录

- `docs/bugs/`：已知 bug 和修复记录。每个文件对应一个问题或问题族。
- `docs/decisions/`：架构或流程决策。每个文件对应一次决策。
- `docs/changelog/`：按月记录功能、规则、文档和验证口径变化。
- `docs/incidents/`：真实线上、真实云端、真实微信环境或系统级事故记录。
- `docs/templates/`：文档模板，不记录业务事实。

## 写入规则

- 需求、范围、验收标准写入 `docs/product/`。
- UI 风格、组件、布局、交互状态写入 `docs/design/`。
- 前端页面、路由、状态、API 接入问题写入 `docs/frontend/`。
- 云函数、接口、数据库、权限、状态机写入 `docs/backend/`。
- 测试计划、复测结果、截图证据写入 `docs/testing/`。
- 是否可交付、阻塞项、未实测范围写入 `docs/review/`。
- 跨 lane 阶段结果同步到 `docs/worklog.md`。

## 命名建议

- bug：`docs/bugs/<简短问题名>-YYYYMMDD.md`
- decision：`docs/decisions/<简短决策名>-YYYYMMDD.md`
- incident：`docs/incidents/<事故名>-YYYYMMDD.md`
- changelog：`docs/changelog/YYYY-MM.md`
- lane worklog：`lanes/<lane>/worklog.md`

