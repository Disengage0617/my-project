# CloudBase 确定性部署重复失败根因与防复发（2026-07-13）

状态：`blocked_defect`，只有 QA 与验收官均确认 `P0=0 / P1=0` 后才能改为已关闭。

适用范围：`scripts/cloudbase/deterministic-api-deploy-runner.js`、对应测试、CloudBase `api` 单次受限部署及其授权消费状态。

## 为什么会连续失败

本轮连续失败并不是同一个云函数业务 bug 一直修不好，而是部署前控制面过去采用临场命令和逐点补丁，检查范围一次只覆盖上一处失败，缺少完整的威胁模型与不变量矩阵。历史上依次暴露：

1. manifest 排序受 PowerShell/区域设置影响；
2. 依赖 PATH 寻找 `tcb`；
3. PowerShell JSON 解析不稳定；
4. 授权别名可通过更换 runId 重放；
5. runner/Node/tcb/cmd/微信 CLI 实际内容未全部绑定；
6. stateDir、summary、token、replay lock 的路径身份与内容身份未形成统一模型；
7. 最终快照与 deploy spawn 之间仍有可插入回调；
8. replay lock 被删除后可重建；
9. token 单账本可篡改，且普通 `JSON.parse` 未拒绝重复键或畸形 schema。
10. summary 虽通过字段/类型校验，但未校验 writer 可达状态机与跨字段语义，可能接受步骤顺序、evidence、manifest、filesCount、环境摘要或 exitCode 自相矛盾的账本。
11. summary 内部可自洽仍不等于真实：expectedContract 与环境摘要若未绑定当前 canonical authorization/config，单独改写一份 summary 即可伪造另一套自洽审计。
12. strict parser 只覆盖 prior ledger 仍不够：production authorization-file 入口和固定 CLI `package.json` 若继续使用普通 `JSON.parse`，重复键、额外字段或嵌套覆盖仍可在最外层安全边界被接受。

因此，后续禁止再以“修一个报错、马上申请部署”的方式推进。每次实现变化必须先证明完整不变量矩阵，再进入授权和远端阶段。

## 永久禁止重复的做法

- 禁止在获得部署授权后临场拼 PowerShell、PATH、`npx`、备用 CLI 或临时解析器。
- 禁止把开发者自己的测试通过当成准入；必须由独立 QA 复现历史攻击矩阵，再由 reviewer 终审。
- 禁止只重跑 happy path 或最近一个失败用例；全部历史 P0/P1 必须作为永久回归用例保留。
- 禁止把 token、summary 或任一 lock 当作单一可信账本；所有消费证据必须严格解析并交叉一致，任何缺失、畸形、冲突或内容漂移均 fail closed。
- 禁止使用普通 `JSON.parse` 读取安全边界 JSON；必须拒绝重复键、额外字段、缺失字段、错误类型、错误版本和错误格式。
- 禁止把 exact schema 等同于字段/类型校验；还必须按 writer truth table 校验步骤前缀、attempted/completed/passed/exitCode、root evidence 及 expectedContract/localGuard/deploy/env/remote 的跨字段一致性。
- 禁止只验证 summary 内部自洽；expectedContract 和 expectedEnvironment 必须逐字段绑定当前 canonical authorization/config，所有派生 evidence 再从该外部锚机械校验。
- 禁止只在账本回放阶段使用 strict parser；authorization-file、固定工具 package.json、远端/CLI JSON 和所有外部安全输入必须从 raw text 开始拒绝重复键，并按各自 schema 校验必需字段、额外字段、类型、版本与格式。
- 禁止在最终授权内容快照与真实 deploy spawn 之间插入 state、日志、时间、hook、getter、adapter override 或其它可执行回调。
- 禁止因换 Agent、换 request_id、换 runId、换对话或模型失败重置失败历史、重试预算或授权消费状态。
- 未经新的精确授权，禁止 execute、真实 CLI、环境变量读取/修改、部署、下载、action、log、DB、角色、托管、小程序上传、审核或 git push。

## 强制执行前检查矩阵

以下全部为准入必检，任何一项缺证即 `unverified/blocked`：

| 类别 | 必须证明的结果 |
| --- | --- |
| 本地确定性 | 固定绝对路径、固定候选/staging、固定文件数/字节/逐文件摘要、固定工具实际内容 SHA |
| 授权不可重放 | run alias、authorization alias、scope digest、authorization text digest 任一复用均在 adapter 前拒绝 |
| 状态身份 | stateRoot、父目录、token、summary、全部 replay lock 的 path/fd/content identity 漂移均 fail closed |
| 双账本 | token 与同 runAlias summary 成对、严格 schema、元数据交叉一致；任一缺失/损坏/冲突均 adapter=0 |
| 严格解析 | 重复 JSON 键、额外/缺失字段、错误类型/版本/格式全部拒绝 |
| 语义状态机 | sealed/failed/passed 只能接受 writer 可达状态；步骤顺序、结果、evidence、manifest、filesCount、bytes、环境摘要必须交叉一致 |
| 外部授权锚 | summary 的 expectedContract/expectedEnvironment 必须等于当前 canonical authorization/config；单 summary 整组自洽改写也必须拒绝 |
| 入口严格解析 | authorization-file 根级/嵌套对象与固定 CLI package.json 根级/bin 等外部输入均从 raw text 严格解析；不得先普通 `JSON.parse` 再校验 |
| 最终完整性 | runner/tool/candidate/staging 在最终 gate 漂移时 deploy=0 |
| Windows 参数 | 中文与空格路径通过；未知参数、重复参数、短参数、`/flag`、参数注入全部拒绝 |
| 旧缺陷回归 | 本文列出的全部历史 P0/P1 fixture 全绿，不得删除或跳过 |
| 分层结论 | local pass 不等于 real cloud pass；远端仍需一次精确授权和独立证据 |

## 固定闭环顺序

`backend 修复 → QA 独立攻击矩阵 → reviewer 终审与指纹重算 → coordinator 更新 canonical/dispatch → 用户一次精确授权 → backend 单次执行 → QA/reviewer 分层收口`。

任何环节发现 P0/P1，立即退回 backend；不得继续申请授权，也不得触碰云端。

## 对话换代规则

- 当上下文过长、发生压缩或可能混淆边界时，中枢必须先更新 canonical、`docs/agent-dispatch-state.md`、`docs/worklog.md` 和本文件状态，再新开中枢对话。
- 新对话必须直接读取上述真源接任同一 `active_closure_id`；用户无需复制旧提示词。
- 换对话不改变授权、重试计数、blocker、证据指纹或未完成目标。

## Git 边界

本记录已写入工作区作为永久真源。用户已于 2026-07-13 明确允许 `git push`，但只允许在当前本地修复经独立 QA 与 reviewer 收口、完成 diff/敏感信息/分支/remote 只读预检后执行一次普通非强制 push。禁止 force push、覆盖远端历史、删除远端分支，也不得把本次 Git 授权扩大为部署、环境变量、DB、角色、托管、小程序上传或审核授权。
