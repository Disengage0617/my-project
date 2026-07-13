# CloudBase api 确定性单次部署运行器 QA（2026-07-13）

## 严格双账本最终独立复测（2026-07-13 16:31 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-161300-runner-strict-ledger-final-qa
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T16:31:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

### 结论

- QA 结论：`FAIL_BLOCKED_DEFECT`；当前 `P0=0 / P1=1 / P2=0`，不得交 reviewer、申请远端授权、执行 `execute` 或 git push。
- 既有两项缺陷已关闭：token 消费元数据单边改写不能恢复授权；token duplicate-key 不能 fail open。主离线回归 `68/68`、原独立 integrity fixture `10/10` 均通过。
- 新 P1：prior summary 的严格 schema 校验不完整。summary 增加额外字段、把 `scopeVersion` 从整数改为字符串、把 `startedAt` 改为非 ISO 时间后，fresh run 均未返回 `AUTHORIZATION_LEDGER_UNREADABLE`，而是错误地把已漂移 summary 当成可信消费证据并返回 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`。
- 三个复现中 adapter 调用均为 `[]`，没有到达任何远端步骤，因此按 P1 而非 P0 分级；但这违反 bug 真源中“summary 额外/缺失/错误类型/格式必须严格拒绝”的准入不变量，不能以“最终仍拒绝重放”代替账本完整性证明。

### 实际结果

| 检查 | 结果 |
| --- | --- |
| 主测试 | `68/68 pass` |
| 原独立 integrity fixture | `10/10 pass` |
| 扩展严格 summary 矩阵 | `14 total / 11 pass / 3 fail` |
| runner / 主测试 / QA fixture `node --check` | 均 exit 0 |
| `validate` | exit 0；`remoteExecuted=false`、`writes=0`；contract SHA-256=`e6faa0d112851893444e2dfeb43f69a4cc1cfc3cfc81c822851da0c9e5314e4a` |
| `mock` | exit 0；`remoteExecuted=false` |
| seal SHA 冲突 | pass；返回 `AUTHORIZATION_LEDGER_UNREADABLE`、adapter=`[]` |
| summary 额外字段 | fail；实际 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`、adapter=`[]` |
| summary 错误字段类型 | fail；实际 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`、adapter=`[]` |
| summary 错误时间格式 | fail；实际 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`、adapter=`[]` |

### 根因与修复门

- `findPriorAuthorizationConsumption()` 只检查 summary 的 `schemaVersion/ledgerVersion/runAlias/result/tokenSealSha256` 和四项交叉元数据；没有验证 summary 的精确字段集合，也没有校验 `scopeVersion`、`startedAt/finishedAt` 及其余 canonical 字段的存在、类型和格式。
- `schemaVersion/ledgerVersion` 当前有显式精确值检查；`runAlias/result/tokenSealSha256` 也有基本格式检查。summary 文件缺失与 seal SHA 冲突已有 fail-closed 证据；但任意非当前白名单字段的“缺失/类型/格式”没有形成完整 schema，故不能宣布“summary 全字段严格解析”。
- 后端修复必须定义按 `sealed/failed/passed` 结果分支的 canonical summary schema：精确允许字段、必需字段、类型、枚举、SHA/alias/ISO 时间格式及嵌套对象字段；任何额外、缺失、重复、错误类型/版本/格式或 token/summary 冲突均须在 replay lock 创建与 adapter 前返回 `AUTHORIZATION_LEDGER_UNREADABLE`。
- 必须保留本轮新增的 4 个 QA fixture；修复后重新跑主测试、全部历史攻击 fixture、严格 summary 矩阵、node check、validate/mock、diff 与敏感信息检查。

### 历史 P0/P1 回归与残余风险

- 已覆盖并保持通过：candidate/staging exact、Windows 中文空格 batch 参数、授权 alias/scope/text/run 重放、工具内容 SHA、stateDir junction、summary path/fd/content identity、最终 deploy gate、replay lock 删除/替换/内容漂移、token duplicate/extra/missing/malformed、token/summary 单边删除或冲突、parser/env duplicate-key、CLI 参数注入。
- 未消除且不得误报：同一 OS 用户删除或一致改写整个可信 stateRoot 的全部相关证据，纯项目内无密钥文件无法提供不可伪造账本；仍需 ACL/外部可信存储或原生句柄方案。该残余风险不降低本轮新 P1 的修复要求。
- production `spawnSync` 后到微信 CLI 按 pathname 打开 staging 的 OS 级竞态仍是已记录残余边界；runner-controlled 同步窗口现有 fixture 保持 deploy=0。

### 真实操作计数

本轮 `execute=0`、真实 `tcb=0`、微信 CLI=`0`、`npx=0`、env read/write=`0/0`、deploy/status/download=`0/0/0`、action/probe/log=`0`、DB/role/seed/delete/migration=`0`、hosting/miniprogram/review/git push=`0`。

### 下一步

- 下一步负责 agent：后端工程师 Agent；lane：`backend`。
- 只修严格 summary schema validator 与对应回归，不得触碰真实云端。修复后回派全新测试工程师 Agent。
- 是否触发暂停条件：`blocked_defect`；不需要用户操作。
- 无需用户转发，由 Codex 中枢继续分派。

# 当前授权外部锚定最终独立复测（2026-07-13 17:59 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-174900-runner-anchor-closure-qa
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T17:59:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 结论

- QA 结论：`PASS_FOR_REVIEWER`；当前 `P0=0 / P1=0 / P2=0`。
- 主测试 `78/78`、独立 QA 完整性矩阵 `23/23`，均无失败、跳过或待办。
- package contract 与 environment 摘要两项“单 summary 整组自洽改写”均在 replay lock 与 adapter 前返回 `AUTHORIZATION_LEDGER_UNREADABLE`；两项 fixture 均明确断言 `adapter.calls=[]`。
- 当前 contract SHA-256=`c02ef65b8cdc34a0d5203ada7decb2c2dfc4305c6d84eb55b86c16bbe5f4b1e2`，与后端交接一致。
- 本结论只准入验收官只读终审，不代表准入 `execute` 或真实部署。

## 独立命令与结果

| 检查 | 结果 |
| --- | --- |
| `E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.test.js` | `78/78 pass`，`fail=0 / skipped=0 / todo=0` |
| `E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.qa-integrity.test.js` | `23/23 pass`，`fail=0 / skipped=0 / todo=0` |
| runner、主测试、QA fixture 三文件 `node --check` | 均 exit 0 |
| runner `validate` | exit 0；`ok=true / remoteExecuted=false / writes=0`；contract SHA 与上文一致 |
| runner `mock` | exit 0；`ok=true / remoteExecuted=false` |
| `git diff --check` | exit 0；仅既有工作区 LF/CRLF 提示，无 whitespace error |
| 目标文件尾随空白检查 | 0 命中 |
| 私钥、client secret、access token、password 赋值模式扫描 | 0 命中 |

## 永久回归覆盖

- 历史 manifest/PATH/PowerShell JSON、固定工具与 package 绑定、Windows Unicode+空格 argv、Namespace、parser duplicate/ambiguous、remote exact、失败即停、单次授权消费全部保留并通过。
- authorization/scope/text replay lock 删除、替换、内容漂移，以及 token/summary 删除、篡改、重复键、错误 schema/时间/类型和双账本冲突全部 fail closed。
- summary path identity、final finish replacement、runner/tool/candidate/staging 最终同步完整性窗口全部回归通过，deploy 保持 0。
- writer 可达状态机、root evidence、candidate/staging/expected/deploy/remote/environment 跨字段一致性全部通过；本轮新增的当前 canonical package/environment 外部锚定两项均关闭。

## 残余系统边界

- 同一 OS 用户一致删除或改写整个 stateRoot 的全部证据仍需本机 ACL、运维保护或外部可信账本；纯项目内 Node 文件账本不声称硬件级不可篡改。
- `spawnSync` 之后外部 CLI 按 pathname 打开 staging 前的 OS 级竞态仍需 native share-lock 或不可变副本方案；当前 runner 已关闭自身可控同步窗口。
- 上述两项是已声明且未扩大的系统边界，不把它们误报为本轮 runner 范围内 P0/P1。

## 真实操作计数与分层结论

- 真实 `execute/tcb/微信 CLI/npx/env read/env write/deploy/status/download/action/probe/log/DB/role/hosting/miniprogram/review/git push` 全部为 0。

```yaml
evidence_layers:
  local_static:
    status: pass
    note: 三文件语法、固定契约、历史安全矩阵、diff 与敏感模式检查通过，P0/P1/P2均为0。
  local_mock:
    status: pass
    note: 主测试78/78、独立QA 23/23全部通过；两项整组自洽伪造均AUTHORIZATION_LEDGER_UNREADABLE且adapter=0。
  local_cloud_function:
    status: unverified
    note: 本任务只验证部署控制面，未执行云函数业务测试。
  gui_devtools:
    status: unverified
    note: 本轮未操作GUI。
  real_cloud_readonly:
    status: unverified
    note: 真实CLI与远端操作均为0。
  real_write:
    status: blocked
    note: QA只准入reviewer；execute和真实部署仍需终审、治理更新及新的精确授权。
```

## 下一步

- 下一步负责 agent：验收官 Agent；lane：`reviewer`。
- 验收官只读终审 runner、永久回归、QA 报告和授权边界，重算指纹并判断是否准入中枢治理与一次精确授权请求。
- 是否触发暂停条件：否。
- 无需用户转发，由 Codex 中枢继续分派。

---

# Summary 外部契约锚定最终语义复测（2026-07-13 17:36 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-172200-runner-semantic-final-qa
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T17:36:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md
```

## 结论

- QA 结论：`FAIL_BLOCKED_DEFECT`；`P0=0 / P1=2 / P2=0`。第三 QA 已列出的 7 类 writer 状态机/跨字段语义缺口均已关闭，但仍有两类只改一个 prior summary 文件即可完成的自洽伪造被当作合法消费账本。
- 两项复现均未改 token、`tokenSealSha256`、`scopeDigest`、alias 或任一 replay lock，不需要一致重写整棵 `stateRoot`，因此属于 runner 声明的审计完整性范围，不属于已声明的 ACL/运维残余边界。
- 两项伪造均没有恢复授权或到达 adapter；fresh run 在接受伪造 summary 后由现存 authorization lock 返回 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`。所以定级为 P1，不是 P0。
- 不准入 reviewer、授权申请、`execute` 或任何真实远端操作。

## 独立执行结果

| 检查 | 结果 |
| --- | --- |
| 主测试 | `76/76 pass` |
| 原独立 QA fixture | 原 21 项全部 pass |
| 扩展 QA fixture | `21/23 pass / 2 fail`；两个失败即本文两项 P1 的 fail-closed 断言 |
| runner/主测试/QA fixture `node --check` | 均 exit 0 |
| runner `validate` | exit 0；`remoteExecuted=false`、`writes=0`；contract SHA-256=`58a845eb75aca14118cb3b144418ba4ea9e78a4c07f4783014f5145f94314df8` |
| runner `mock` | exit 0；`remoteExecuted=false` |
| 目标文件 `git diff --check` | exit 0 |
| 固定命令面/敏感面 | 唯一 `spawnSync` 仍在固定 `RealAdapter`；持久化只保存 run/授权摘要与环境值摘要，未新增 action/log/DB/role/hosting/miniprogram/git push 命令或明文持久化面 |

## P1-1：整组 package contract 证据可在单 summary 内自洽改写

1. 先用 writer 生成合法 `passed` summary。
2. 只修改该 summary：把 `expectedContract.files/bytes/manifest` 换成另一组值，同时同步修改 `localGuard.candidate`、`localGuard.staging`、`deploy.filesCount` 与 `remotePackage`。
3. 保留 summary/token 的 `scopeDigest`、`tokenSealSha256`、alias 及全部 replay lock 不变。
4. fresh run 没有返回 `AUTHORIZATION_LEDGER_UNREADABLE`，而是进入现存 replay lock 的 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`，证明伪造证据被 validator 当作合法 writer 产物。

当前 validator 只证明 package 证据彼此一致，没有把 `expectedContract` 锚定到当前 `config`/authorization scope 中的固定 files/bytes/manifest。

## P1-2：环境证据可在单 summary 内同步改写

1. 只把同一合法 `passed` summary 的 `environmentBefore.keys/valueDigest` 与 `environmentAfter.keys/valueDigest` 同步改成同一组伪造值。
2. token、scope、seal、alias 与 locks 均保持不变。
3. fresh run 同样进入 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED` 而不是 `AUTHORIZATION_LEDGER_UNREADABLE`。

当前 validator 只校验 before/after 彼此相等，没有把 keys 和 value digest 锚定到 authorization scope 的 `expectedEnvironment.keys/valueSha256` 或按 writer 固定算法生成的环境摘要。

## 已关闭矩阵与边界

- 已关闭并继续全绿：step 连续前缀、failed 终止、passed step `exitCode=0`、root evidence 生产条件、candidate/staging、deploy count、remote contract、before/after 互相一致、summary path/fd/content、final pre-deploy integrity、replay lock、token+summary 双账本、strict JSON/parser、Windows argv。
- 仍接受的系统边界：同一 OS 用户一致删除或重写整棵 `stateRoot` 的所有证据依赖 ACL/运维保护；`spawnSync` 后外部进程按 pathname 打开 staging 前的 OS 级竞态需要 native handle/不可变副本。本次没有把这些已声明边界扩展为 runner P1。
- 本轮真实 `execute/tcb/微信 CLI/npx/env read-write/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push` 全部为 0。

## 下一步

- 下一步负责 agent：后端工程师 Agent；lane：`backend`。
- 最小修复：prior summary 验证必须接收当前固定 config/authorization scope，并把 package contract 及环境摘要分别精确锚定；保留新增 2 项 fixture，修后回派全新测试工程师 Agent 重跑主测与 QA23。
- 是否触发暂停条件：`blocked_defect`；不需要用户操作。
- 无需用户转发，由 Codex 中枢继续分派。

---

# Authorization/package 严格输入最终独立 QA（2026-07-13 23:15 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-225100-runner-strict-input-final-qa
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T23:15:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 结论

- QA 结论：`PASS_FOR_REVIEWER`；`P0=0 / P1=0 / P2=0`。
- 主测试 `89/89`，独立 QA 永久矩阵由 `23` 项扩展为 `34/34`；新增 11 项覆盖 production main 的 7 类 authorization 输入、package 的 3 类输入以及 runner 直接 `JSON.parse` 边界盘点。
- contract SHA-256=`1bb909bdb1e28723849cf2dcf59424f19294a1f058e767c135fa7ee50f2f0d61`。

## 严格输入证据

- production `main()`：authorization 根重复键、嵌套重复键、额外字段、缺失字段、错误类型、错误版本、错误格式 7/7 均返回预期 fail-closed 错误。
- 每个 production main 负例均对 `CONFIG.stateDir` 做全树路径、类型、字节和文件 SHA 快照；前后完全一致。合计：state write=0、new token=0、new replay lock=0、adapter setup/call=0。
- 固定 CLI package：根 `version` 重复、`bin.tcb` 重复 2/2 均在 state 前返回 `FIXED_CLI_PACKAGE_DUPLICATE_KEY`；普通 npm root metadata 与合法额外 bin 被接受，但 package raw bytes SHA 精确进入 `fixedIntegrity.cloudbaseCliPackage.sha256`。三类均 state=0、lock=0、adapter=0。
- runner 源码仅余 2 个直接 `JSON.parse`：一个解析已切分 JSON string token，一个在递归 duplicate-key scanner 通过后解析完整文本。authorization/package/env/token/summary 外部边界均从 `parseJsonStrict` 进入。

## 完整回归与卫生

| 检查 | 结果 |
| --- | --- |
| 主测试 | `89/89 pass` |
| 独立 QA 永久矩阵 | `34/34 pass` |
| runner、主测试、QA fixture `node --check` | 三项 exit 0 |
| `validate` | `ok=true / remoteExecuted=false / writes=0` |
| `mock` | `ok=true / remoteExecuted=false` |
| scoped `git diff --check` | exit 0；仅换行提示，无 whitespace error |
| 敏感模式扫描 | 无命中；`rg` exit 1 |

- 本轮真实 execute/tcb/微信 CLI/npx/env read/write/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 全部为 0。
- 残余边界未改变：整棵 stateRoot 被同用户一致删除/重写依赖本机 ACL/运维保护；`spawnSync` 后外部进程按 pathname 打开 staging 的 OS 级竞态需 native handle 或不可变部署副本才能消除。两者均已明确排除在纯 Node 文件 runner 的声明范围外。

## 下一步

- 下一步负责 agent：验收官 Agent；lane：`reviewer`。
- 验收官应独立复跑并重算 runner/test/README/changed-files/contract/source/evidence 指纹，确认 `P0=0 / P1=0` 后再交中枢更新 canonical/dispatch。
- 是否触发暂停条件：否；本轮本地 QA 已具备 reviewer 准入条件。
- 无需用户转发，由 Codex 中枢继续分派。

```text
message_type: handoff
request_id: REQ-20260713-deterministic-deploy-runner-qa
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T13:45:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 结论

- QA 结论：`FAIL_BLOCKED_DEFECT`，当前 **不得交 reviewer，也不得申请或执行真实部署授权**。
- 独立复跑的既有 fake-adapter 测试为 `22/22`，`node --check`、`validate`、`mock` 均 exit 0；这些结果证明一次性状态机、失败即停和现有测试覆盖内的脱敏成立，但没有覆盖实际 candidate/staging 或真实 Windows `.bat` 启动语义。
- 独立 QA 发现 `P0=2 / P1=4 / P2=2`。两个 P0 均可在纯本地、零真实 CLI 的条件下稳定复现：
  1. `runDeployment()` 完全不读取 candidate/staging。candidate 与 staging 均不存在时，fake adapter 仍依次收到五步并返回 `passed`；因此运行器可能把漂移或缺失的 staging 直接交给真实部署命令。
  2. 当前 `cmd.exe /d /s /c` + 单一内嵌引号字符串的构造不能在 Node `spawnSync(shell=false)` 下正确启动带空格/中文路径的本地假 `.cmd`。复现返回 exit 1，stderr 表示带转义引号的命令名无法识别；若直接用于真实流程，会在 deploy 步再次本地失败。
- 本轮未运行 `execute`、`tcb`、微信开发者工具 CLI、`npx` 或任何真实远端命令；env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 均为 0。

## 独立执行结果

| 检查 | 实际结果 |
| --- | --- |
| `E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.test.js` | 22/22 pass |
| runner `node --check` | exit 0 |
| test `node --check` | exit 0 |
| runner `validate` | exit 0；`remoteExecuted=false`、`writes=0`、contract SHA-256=`d1337cf8373cab742715e22ec039382e1935499d7cf7454092e484b2c0080100` |
| runner `mock` | exit 0；`remoteExecuted=false` |
| 目标文件 `git diff --check` | exit 0 |
| fake adapter 缺失包复现 | `candidateExists=false`、`stagingExists=false`，但 `result=passed` 且五步全部被调用 |
| 本地假 `.cmd` 中文/空格路径引用复现 | exit 1；假 CLI 未启动 |
| 无 `scopeDigest` 授权复现 | `validateAuthorization()` 返回 true |
| 错误 `Namespace` env 复现 | `parseEnvironmentDetail()+validateEnvironment()` 接受并返回摘要 |

## P0

### P0-1：执行时没有核对实际 candidate/staging

- 代码证据：`runDeployment()` 在 `validateStaticConfig()`、确认词和授权 JSON 检查后，直接 `state.begin()`，随后立刻执行 `environment_before`；全流程没有 `stat/readdir/readFile/manifest/raw compare` candidate 或 staging。
- `CONFIG.expectedFiles/expectedTotalBytes/expectedManifest` 只是内存中的期望常量；authorization 也只是把同一常量回填到 JSON，不能证明磁盘上实际部署源等于该常量。
- 最小复现使用 fake adapter，candidate/staging 两个绝对路径均不存在，结果仍为 `passed`，调用顺序为完整五步。
- 风险：线上可能被更新为错误、漂移或污染的 staging，而 summary 仍记录期望 manifest；这直接破坏“9 files / 157533 bytes / a052... / raw 9/9”的授权边界。

修复验收条件：run id 先以 `wx` 封存；任何远端 step 前，在同一 runner 内只读核对 candidate 与 staging 均为精确 9 根文件、0 目录、157533 bytes、同一 manifest，且 staging/candidate 逐文件 `Buffer.equals` 9/9；任一缺失、额外项、目录、字节/hash/manifest/raw 差异时 adapter calls 必须为 0，run id 保持已消费且 summary 仅记录安全错误码。

### P0-2：Windows `.bat` 命令引用未通过真实本地进程语义

- `buildCmdLine()` 把每个 token 包成双引号，再把整串作为 `cmd.exe /d /s /c` 的一个参数交给 `spawnSync(shell=false)`。
- 独立 QA 将 `wechatCliScript` 替换为 OS 临时目录内带中文和空格的无副作用假 `.cmd`，使用 `buildCommands(config).deploy` 原样启动；结果 exit 1，假脚本未运行。
- 现有测试只断言字符串 `startsWith()`，没有实际通过 Windows `cmd.exe` 启动本地假 batch，因此 22/22 未覆盖该缺口。

修复验收条件：新增无网络、无真实 CLI 的 Windows integration test，用带中文和空格的假 `.cmd` 回显逐个参数；deploy/status/download 三模板均须 exit 0，`--project`、`--paths/--path`、AppID、env、function 必须逐 token 精确；不得使用 `shell=true`、拼入用户 token 或放宽危险字符白名单。

## P1

1. **授权 scope 未闭合。** `validateAuthorization()` 只要求任意 64 位 `userAuthorizationTextSha256`，没有独立 `scopeDigest`，bindings 也未包含 AppID、expected env key/value digest、contract SHA-256、CLI 版本/入口摘要；纯本地复现中无 `scopeDigest` 仍返回 true。应由 coordinator 生成 canonical authorization JSON，并让 runner 重算 scope digest 后与明确字段精确匹配。
2. **环境命名空间未核对。** env JSON 即使 `Namespace='WRONG-ENV'`，只要 `FunctionName/status/AvailableStatus/Variables` 合法就会通过。应要求唯一目标对象的 Namespace/环境 ID 精确等于 `cloud1-d2gp2ayiwab8f8a94`。
3. **远端下载目录“必须全新”的检查过晚。** 当前到完成 deploy、status、env-after 后才 `mkdir` 检查预存在；若目录已存在，会在真实更新后才失去唯一下载证据。应在 run 封存后、首个远端 step 前先验证 remote verify 路径不存在且父目录为预期项目根，再在 download 前以原子方式创建。
4. **工具版本只声明、不验证。** `cloudbaseCliVersion='3.6.1'` 仅进入 contract 摘要，执行时不核对固定缓存 package 的实际版本或入口文件身份。应使用 Node 本地只读解析/哈希，在首个远端 step 前失败关闭；不得再调用 help/version、PATH、PowerShell 或 fallback。

## P2

1. `runId/authorizationId` 允许任意 8～128 位字母数字点划线并原样写入状态；手机号或身份字符串也可通过。建议限制为 coordinator 生成的非敏感固定前缀 + UUID/高熵随机 ID，并继续禁止路径分隔符/设备名。
2. deploy/status parser 对函数名与 success/status/filesCount 的关联较宽松；建议用已保存的真实成功输出样本补 parser fixture，确保目标 `api` 的唯一结果行与字段同源，任何额外函数/重复状态/模糊输出均 fail closed。

## 已通过的边界

- 真序列常量为 `environment_before -> deploy -> status -> environment_after -> download`，现有 fake 失败矩阵确认每步最多一次，失败/timeout/non-JSON 后无后续调用。
- run token 使用 `fs.openSync(..., 'wx')`，run id 正则不允许 `/` 或 `\`，成功/失败后的同 ID 重用均被现有测试拒绝。
- summary/state 不写 CLI 原始 stdout/stderr 或 env 明文；现有成功与 env 漂移测试均未出现固定 env 值。
- remote exact 检查要求根部精确 9 文件、固定 `node_modules/` 目录、逐文件 bytes/SHA-256、总字节和 manifest；但只有 P0-1/P0-2 修复后才具备真实执行意义。
- 命令面源码未发现 action/log/DB/role/hosting/miniprogram/review/git push 调用；真实命令适配器仅 `spawnSync` 一个固定 Node+tcb 入口和三个固定微信 CLI 模板。

## 分层结论

```yaml
evidence_layers:
  local_static:
    status: fail
    note: P0=2；实际部署源未核对，Windows batch 引用本地复现失败。
  local_mock:
    status: pass
    note: 既有 fake-adapter 22/22；不覆盖上述真实本地文件/Windows 进程语义。
  local_cloud_function:
    status: unverified
    note: 本任务仅审查部署控制面，不执行云函数业务测试。
  gui_devtools:
    status: unverified
    note: 本轮禁止且未操作 GUI。
  real_cloud_readonly:
    status: unverified
    note: 本轮真实 CLI/远端为 0。
  real_write:
    status: blocked
    note: runner P0 未关闭，禁止真实部署。
```

## 下一步

- 修复 owner：后端工程师 Agent。
- 修复后 QA 必须先跑新增的本地 package-integrity 与 Windows fake-batch integration tests，再跑完整 fake 矩阵、node check、validate/mock、敏感扫描和 diff-check。
- QA P0/P1 清零后才能交验收官 Agent；验收官只可准入中枢申请新的精确授权，不可直接执行。
- 是否触发暂停条件：是，`blocked_defect`；但不需要用户操作，先由后端修复。
- 无需用户转发，由 Codex 中枢继续分派。

---

# Prior summary exact-schema 扩展独立复测（2026-07-13 17:12 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-164600-runner-exact-schema-closure-qa
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T17:12:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 结论

- QA 结论：`FAIL_BLOCKED_DEFECT`，当前 `P0=0 / P1=1 / P2=0`；不准入 reviewer、授权、`execute` 或 git push。
- 后端 76 项和原独立 14 项均通过，但扩展 writer-reachability / evidence-consistency 矩阵新增 7 个失败反例。它们都在 prior ledger 扫描阶段被错误接受，随后才因原授权已消费返回 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`；预期应直接返回 `AUTHORIZATION_LEDGER_UNREADABLE`。
- 所有反例 `adapter=0`，没有发现授权 replay 到 adapter 或真实部署风险；本轮定级为 P1 审计账本语义完整性缺口，而不是 P0。
- 真实 execute/tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 全部为 0。

## 实际命令与结果

| 检查 | 实际结果 |
| --- | --- |
| runner / 主测试 / QA fixture `node --check` | 3/3 exit 0 |
| 主测试 | 76/76 pass |
| 原独立 QA 矩阵 | 14/14 pass |
| 扩展后独立 QA 矩阵 | 21 项：14 pass / 7 fail |
| `validate` | exit 0；`remoteExecuted=false`、`writes=0` |
| `mock` | exit 0；`remoteExecuted=false` |
| contract SHA-256 | `d59f9ee0447c3dee40e202119423f74cd6d692946558ed2462f7dd5a901f7875` |
| 目标 `git diff --check` | exit 0 |

## 新 P1：summary 只验证字段形状，未验证 writer 可达状态与证据交叉一致

扩展 fixture 已固化到 `scripts/cloudbase/test/deterministic-api-deploy-runner.qa-integrity.test.js`。以下七项均预期 `AUTHORIZATION_LEDGER_UNREADABLE`，实际返回 `AUTHORIZATION_ALIAS_ALREADY_CONSUMED`：

1. failed summary 中 `environment_before=not_started`，但后续 `deploy=passed`；当前未强制 step 为单调前缀状态机。
2. failed summary 中 `localGuard.candidate.manifest` 与 staging/expected contract 冲突。
3. failed summary 中 deploy step 未尝试，却存在根级 `deploy` evidence。
4. passed summary 中 `remotePackage.manifest` 与 expected contract 冲突。
5. passed summary 中 `deploy.filesCount` 与 expected contract 冲突。
6. passed summary 中 environment before/after digest 冲突，但 `environmentMatches=true`。
7. passed step 的 `exitCode=1` 仍被接受。

根因是 `validatePriorSummarySchema()` 已覆盖字段集合、类型、版本、时间格式、基础 step 结构和 required completion evidence，但还没有把 summary writer 的可达状态机及以下机械关系完整编码：

- steps 必须为连续前缀：passed*，至多一个 failed，之后只能 not_started；不得跨过未尝试步骤继续活动。
- 根级 evidence 必须与对应 step 的 attempts/status 一一对应。
- passed step 的 exitCode 必须为 0。
- expectedContract、localGuard candidate/staging、deploy filesCount、remotePackage files/bytes/manifest 必须交叉一致。
- environment before/after keys/valueDigest 与 `environmentMatches=true` 必须交叉一致。

## 历史矩阵与分层结论

- 历史 P0/P1 的 replay locks、token+summary 双账本、duplicate-key、alias/scope/text replay、summary path identity、final deploy TOCTOU、tool/candidate/staging 漂移、junction、parser、Windows 参数面继续保持通过。
- `local_static`: fail；strict schema 仍缺跨字段语义一致性。
- `local_mock`: fail；主测全绿但扩展 QA 21 项有 7 项反证。
- `local_cloud_function`: unverified；本任务未运行云函数业务测试。
- `gui_devtools`: unverified；本轮未操作 GUI。
- `real_cloud_readonly`: unverified；真实 CLI/远端为 0。
- `real_write`: blocked；P1 未关闭，禁止真实部署。
- 残余 OS 边界维持原结论：同用户一致删除/改写整棵 stateRoot 依赖 ACL/运维保护；Node 不能消除外部进程按 pathname 打开 staging 前的 OS 级竞态。本轮未引入 native helper 或远端状态。

## 下一步

- 下一步负责 agent：后端工程师 Agent；lane：`backend`。
- 只修复 summary writer-reachability 与跨字段机械一致性，保留新增七项及全部历史 P0/P1 为永久回归；修复后必须由全新测试工程师 Agent 独立复测。
- 是否触发暂停条件：`blocked_defect`，不需要用户操作。
- 无需用户转发，由 Codex 中枢继续分派。

---

# Replay-lock 修复后独立复测（2026-07-13 16:02 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-155600-runner-replay-lock-qa-retest
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T16:02:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 结论

- QA 结论：`FAIL_BLOCKED_DEFECT`；当前 `P0=1 / P1=1 / P2=0`，不准入 reviewer、授权申请或 `execute`。
- 后端本轮直接修复有效：authorization/scope/text 三个 lock 的单删、全删、rename+replace、同对象内容漂移在运行期均 fail closed；未篡改的旧 token 首行可作为第二账本阻止 fresh-run replay。原独立 8 项从 7/8 修复为 8/8，主测试 58/58。
- 新 P0：首轮失败并关闭 fd 后，旧 token 的 `run_sealed` 首行可被改写成其他 alias/scope/text；删除的三个 lock 会在 fresh run 中重建，而 ledger 因元数据不再匹配允许复用原授权到达 adapter。已有 summary 保留原消费元数据，但扫描器没有交叉核对。
- 新 P1：token ledger 首行只用普通 `JSON.parse`，不拒绝重复键，也不校验 canonical 字段集合与字段格式。含两个 `event` 键且末值为 `run_sealed` 的预置 token 被当作合法无关记录，runner 完整执行成功。
- 本轮真实 tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 均为0。

## 独立执行结果

| 检查 | 结果 |
| --- | --- |
| runner/test/QA fixture `node --check` | 均 exit 0 |
| 主测试 | 58/58 pass |
| 原独立攻击 fixture | 8/8 pass；旧 summary/final gate 与 lock 删除 replay 均关闭 |
| 扩展 token-ledger fixture | 10 项合计 8 pass / 2 fail；两个失败分别稳定复现 P0/P1 |
| `validate` | exit 0；`remoteExecuted=false`、`writes=0`；contract SHA-256=`34900e564d87532c60c8d920296dad181533f14898bd3c0a8eb66d52b4be283c` |
| `mock` | exit 0；`remoteExecuted=false` |
| 目标文件 `git diff --check` | exit 0；仅既有 worklog LF/CRLF 提示 |
| 敏感/固定命令面 | 无新增真实命令面；测试均使用本地 fixture/fake adapter |

## P0：关闭 fd 后改写 token 首行可恢复授权

复现：

1. 首轮 `environment_before` 内删除 authorization/scope/text 三个 lock，并抛 `QA_STOP`；首轮失败，deploy=0。
2. 首轮返回后读取旧 `run-*.jsonl`，只把第一行 `run_sealed` 的 `authorizationAlias`、`scopeDigest`、`authorizationTextSha256` 改成其他合法形态，保留 `event=run_sealed` 与其余行。
3. fresh run 使用新 runId，仅更新 `runIdSha256`，复用原 authorization alias/scope/text。
4. 扫描器认为旧 token 与当前授权无关，重新创建三个 lock，并调用 `environment_before`；QA 哨兵=`REPLAY_REACHED_ADAPTER`、calls=`[environment_before]`。

这证明当前“lock fd + token 首行”只保护运行期，不保护后续运行读取的消费真源。最小修复必须让每个历史 token 与同 runAlias summary 的原始消费元数据严格交叉核对；summary 缺失、身份不安全、字段不一致或任一内容异常都必须 `AUTHORIZATION_LEDGER_UNREADABLE` 且 adapter=0。若 threat model 要覆盖同一 OS 用户同时改写 token、summary 和全部 lock，则仅靠项目内无密钥文件无法建立不可伪造账本，应明确列为需要更强 ACL/外部可信存储的残余系统边界，不能声称绝对防恶意本机管理员。

## P1：duplicate/malformed token 可 fail open

- 预置 token 第一行含 `"event":"ignored","event":"run_sealed"`，并给出与当前授权不同的三个摘要。
- 普通 `JSON.parse` 选择最后一个 `event`，扫描器继续；实际 runner 返回 passed，adapter 完整执行。
- 修复要求：复用已有严格 duplicate-key 检查或等价实现；首行必须为精确 canonical `run_sealed` schema，字段缺失、额外、重复、类型/格式错误、文件名 runAlias 与 summary runAlias 不一致均 fail closed。不得因普通 malformed/duplicate token 忽略该记录后继续。

## 分层结论

```yaml
evidence_layers:
  local_static:
    status: fail
    note: 运行期 replay lock 身份已关闭，但跨运行 token ledger 可改写且 duplicate key 未严格解析，P0=1/P1=1。
  local_mock:
    status: fail
    note: 主测试58/58、原独立8/8通过；扩展10项中2项稳定失败并到达adapter/完整执行。
  local_cloud_function:
    status: unverified
    note: 本任务只测部署控制面，未执行云函数业务测试。
  gui_devtools:
    status: unverified
    note: 未操作GUI。
  real_cloud_readonly:
    status: unverified
    note: 真实CLI和远端操作为0。
  real_write:
    status: blocked
    note: replay ledger P0/P1未关闭，禁止真实部署。
```

## 下一步

- 下一步负责 agent：后端工程师 Agent；lane：`backend`。
- 严格解析 token ledger，并把 token/summary/file-name 的 canonical 消费字段交叉核对；修复后回派 QA 重跑扩展10项、主测试、validate/mock、敏感扫描与 diff-check。
- 是否触发暂停条件：`blocked_defect`；不需要用户操作。
- 无需用户转发，由 Codex 中枢继续分派。

---

# Parser 最终修复独立复测（2026-07-13 14:24 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-deterministic-runner-parser-qa-retest
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T14:24:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 最终结论

- QA 结论：`PASS_FOR_REVIEWER`，当前 `P0=0 / P1=0 / P2=0`。
- 上一轮唯一残留 P1 已关闭：deploy/status 同一目标行内重复、冲突、畸形或额外受信字段均 fail closed，不再选择首值。
- 准入验收官 Agent 进行只读最终评审；本结论不等于准入 `execute`，也不产生真实部署授权。
- 本轮真实 tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 均为 0。

## 实际复测结果

| 检查 | 结果 |
| --- | --- |
| 全量离线测试 | 35/35 pass |
| 独立 parser/env 定向矩阵 | 37/37 pass，`remoteExecuted=false` |
| 独立 download exact 定向矩阵 | 2/2 pass，`parserSurface=false`、`remoteExecuted=false` |
| runner/test `node --check` | 均 exit 0 |
| runner `validate` | exit 0；`remoteExecuted=false`、`writes=0`；contract SHA-256=`7c628b9dd77e5cf9a7a57e616b0518ae360500b3ee5d7533596fb6d4565efbcc` |
| runner `mock` | exit 0；`remoteExecuted=false` |
| 目标文件 `git diff --check` | exit 0；仅既有 worklog CRLF 提示 |
| 敏感信息 | 35 项测试继续验证 summary/state 不含 env 明文、raw run id 或授权原文；源码扫描未发现新增持久化面 |

说明：定向脚本调试阶段有两次 QA harness 预期错误码写窄，runner 均已安全拒绝；修正 harness 后，最终 37/37 与 2/2 均以 exit 0 完成，不计为产品失败或远端重试。

## 逐项关闭

- deploy：`success` 同值重复、异值重复；`filesCount` 同值重复、异值重复；unknown、false、大小写漂移、空值；缺失字段；额外 `status/availability/function` 受信字段，全部拒绝。历史成功 fixture 保持通过。
- status：同值重复、冲突重复、畸形、空值、非 Active、大小写漂移；额外 `success/availableStatus/filesCount/functionName` 受信字段，全部拒绝。历史成功 fixture 保持通过。
- env：function/status/availability/namespace/container/variables/key/value 的可信 alias 重复全部拒绝；完全重复 JSON key、Unicode 转义后等价 key、嵌套重复 key 均在 `JSON.parse` 前以 `JSON_DUPLICATE_KEY` 拒绝。历史成功 fixture 保持通过。
- download：只基于实际目录项、逐文件 bytes/SHA-256、总字节、manifest 与允许目录做 exact 核对；不存在文本 parser 或首值选择面。exact fixture 通过，额外根文件被拒绝。

## 分层结论

```yaml
evidence_layers:
  local_static:
    status: pass
    note: parser/env/download fail-closed 代码路径与固定命令面复核通过，P0/P1/P2 均为0。
  local_mock:
    status: pass
    note: 全量35/35、独立parser/env 37/37、download exact 2/2均通过。
  local_cloud_function:
    status: unverified
    note: 本任务仅验证部署控制面，不执行云函数业务测试。
  gui_devtools:
    status: unverified
    note: 本轮禁止且未操作GUI。
  real_cloud_readonly:
    status: unverified
    note: 本轮真实CLI/远端为0。
  real_write:
    status: blocked
    note: QA仅准入reviewer；execute仍须验收官与中枢另行治理及精确授权。
```

## 下一步

- 下一步负责 agent：验收官 Agent；lane：`reviewer`。
- 验收官只读复核 runner、测试、QA 报告和授权边界，决定是否允许中枢申请新的精确授权；不得直接执行。
- 是否触发暂停条件：否。
- 无需用户转发，由 Codex 中枢继续分派。

---

# 修复后独立复测（2026-07-13 14:08 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-deterministic-deploy-runner-qa-retest
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T14:08:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 复测结论

- QA 结论仍为 `FAIL_BLOCKED_DEFECT`，当前 `P0=0 / P1=1 / P2=0`；首轮两个 P0、四个 P1 和 run-id 敏感持久化问题均已关闭，但 parser 的“同一结果行重复且矛盾字段”仍未 fail closed。
- 不准入 reviewer、真实授权或 `execute`；修复 owner 仍为后端工程师 Agent，用户无需操作。
- 本轮未运行 `execute`、`tcb`、微信开发者工具 CLI、`npx` 或任何真实远端命令；env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 均为 0。

## 独立执行结果

| 检查 | 实际结果 |
| --- | --- |
| `E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.test.js` | 31/31 pass；含 Windows Unicode+空格 fake batch 的 deploy/status/download 真进程测试 |
| runner/test `node --check` | 均 exit 0 |
| runner `mock` | exit 0；`remoteExecuted=false` |
| 目标文件 `git diff --check` | exit 0 |
| 授权篡改矩阵 | AppID/environment/envDigest/contract/tool/steps/forbidden/remote 均 `AUTHORIZATION_SCOPE_MISMATCH`；scope digest、授权文本摘要、runId、alias 各自按专用错误码拒绝 |
| 敏感字段扫描 | 状态/summary 仅保留授权文本 SHA-256；未持久化 raw run id、授权原文或 env 明文 |
| deploy 同行重复字段负例 | `api success=true success=false filesCount=9` 被错误接受为 `{success:true, filesCount:9}` |
| status 同行重复字段负例 | `api status=Active status=UpdateFailed` 被错误接受为 `{status:'Active'}` |

说明：尝试执行仓库根级 `scripts/validate.js` 时发现该文件不存在，属于不适用命令，不计为 runner 失败；runner 自身 `mock`、语法、测试和 diff-check 均已独立执行。

## 已关闭项

- 本地 guard 在首个 adapter 调用前校验 candidate/staging 精确文件、字节、manifest 与逐文件 `Buffer.equals`，guard 失败时 adapter=0 且 run 已消费。
- Windows `.cmd` 使用 `shell=false` 与 `windowsVerbatimArguments=true`，本地 Unicode+空格 fake batch 三模板均 exit 0，参数逐项精确。
- authorization schema v2 将环境、函数、AppID、env 摘要、文件契约、工具、五步、禁止面、noRetry、remote 与 contract digest 纳入 canonical scope，并重算摘要。
- env `Namespace`、remote direct child/预不存在、实际 `@cloudbase/cli@3.6.1` package name/version/bin 均在首个 adapter 调用前 fail closed。
- raw run id 与授权原文不持久化，状态只写安全 hash alias。
- deploy/status 已拒绝额外结果行；剩余缺口仅为同一目标行内重复字段。

## 当前 P1

### P1-1：deploy/status parser 接受同一目标行内重复且矛盾字段

- 最小复现：`parseDeployOutput('api success=true success=false filesCount=9')` 返回成功；`parseStatusOutput('api status=Active status=UpdateFailed')` 也返回成功。
- 原因：parser 只用首个正则匹配值，没有先统计目标行中 `success`、`filesCount`、`status` 等受信字段的出现次数；现有 31 项测试只覆盖额外结果行，没有覆盖同一行重复键。
- 风险：CLI 若输出冲突/拼接状态，runner 可能选择首值并错误接受，违反“unknown/ambiguous 立即停止”和本轮明确的 repeated deploy/status 拒绝条件。
- 修复验收：目标函数唯一结果行内每个受信字段必须恰好出现一次；任意缺失、重复、冲突、未知附加结果字段均抛出安全错误码并停止。新增 deploy/status 同行重复字段负例，且完整离线矩阵仍全部通过。

## 分层结论

```yaml
evidence_layers:
  local_static:
    status: fail
    note: 首轮 P0/P1 基本关闭，但 deploy/status 同行重复字段仍被错误接受，P1=1。
  local_mock:
    status: fail
    note: 31/31 通过，但独立定向负例揭示测试缺口与 fail-closed 缺陷。
  local_cloud_function:
    status: unverified
    note: 本任务仅审查部署控制面，未执行云函数业务测试。
  gui_devtools:
    status: unverified
    note: 本轮禁止且未操作 GUI。
  real_cloud_readonly:
    status: unverified
    note: 本轮真实 CLI/远端为 0。
  real_write:
    status: blocked
    note: parser P1 未关闭，禁止真实部署。
```

## 下一步

- 下一步负责 agent：后端工程师 Agent；lane：`backend`。
- 修复 parser 对同一目标行重复字段的拒绝，并补两类负例；随后回派测试工程师 Agent 复测。
- 是否触发暂停条件：`blocked_defect`，但不需要用户参与。
- 无需用户转发，由 Codex 中枢继续分派。

---

# Replay / integrity 深层修复后独立复测（2026-07-13 14:55 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-deterministic-runner-replay-integrity-qa-retest
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T14:55:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 结论

- QA 结论：`FAIL_BLOCKED_DEFECT`，当前 `P0=2 / P1=1 / P2=0`；不准入 reviewer、授权申请或 `execute`。
- backend 的 44 项回归与深层 9 项均通过，但独立攻击 fixture 仍可绕过最后一次完整性快照和 canonical summary 路径身份。
- 本轮真实 tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 均为 0。

## 基线结果

- 全量离线测试：44/44 pass。
- 深层定向现有测试：9/9 pass。
- runner/test `node --check`、runner `validate`、runner `mock`、目标 `git diff --check` 均 exit 0；validate contract SHA-256=`65b9f7424e423c249f10ccc642ee910048643389cebbe0ca9dd9ca2a9aeda108`、`remoteExecuted=false`、`writes=0`。
- schema v3/scope v2 的 alias/scope/text/run token、工具内容摘要、state direct-child/reparse 初始检查、pre-existing summary、env-before 后第一轮 TOCTOU 测试均已覆盖，但不覆盖下述更晚窗口。

## P0-1：最后一次 snapshot 后仍可修改 staging 并进入 deploy

- 独立 fixture 使用 `AtomicRunState` 测试子类，在 runner 已完成 `captureImmutableSnapshot()` 并写入 `pre_deploy_integrity_passed` 事件后，立即把 staging `a.js` 从授权的 1 byte 改为 23 bytes；这精确模拟最后一次快照与 `adapter.run('deploy')` 之间的并发变化。
- 实际结果：`environment_before` 仅 1 次，但 deploy 仍被调用；完整五步执行，runner 返回 `passed`。这证明当前快照是可变路径的瞬时副本，不是 CLI 实际读取部署源的不可变绑定。
- 风险：真实链路可把未授权 staging 内容写入线上；事后 download 即使发现 manifest 不一致，真实部署已经发生，无法满足“漂移时 deploy=0”。
- 修复验收：部署 adapter 必须消费与授权快照同一不可变源；在 `pre_deploy_integrity_passed` 后分别修改 runner/tool/candidate/staging 的独立 fake 中，四种情形均必须 `environment_before<=1`、`deploy=0`，并留下 sealed 失败审计。仅把 hash 检查再向后移动一次不算关闭，必须证明 CLI 所读字节与已核验字节同一绑定。

## P0-2：已预留 summary 可被 rename + replacement 遮蔽

- 独立 fixture 在 `environment_before` 中把已用 `wx` 打开且仍由 runner 持有 fd 的 canonical summary 重命名为 `.moved`，随后在原 canonical 路径写入 `{"attacker":true}`。
- 实际结果：Windows 本地 rename 成功；runner 继续完成五步并返回 `passed`。同一 fd 最终把真实 `passed` 写入 `.moved` 文件，但 canonical summary 路径仍是攻击者 JSON。
- 风险：`begin()` 原子预留和 finish 使用同 fd 只能保护 inode 内容，不能保护路径到 inode 的映射；canonical 审计真源可被遮蔽而运行仍报告成功。
- 修复验收：在 begin 后、成功和失败 finish 前分别做 rename/unlink/replacement fixture；runner 必须在首个远端写前及最终返回前验证 canonical path 与预留 fd 身份一致，任何替换均不得返回 `passed`，并须在不可遮蔽的 sealed 审计位置保留失败证据。成功/失败 summary 均不得被预存在、覆盖、重命名或替代内容冒充。

## P1-1：单短横线或 Windows `/` 风格的 flag-shaped 值仍被 CLI parser 接受

- `--authorization-file -x`、`--authorization-file -authorization.json`、`--authorization-file /x` 均被 `parseCliArgs()` 接受；当前只拒绝以 `--` 开头的值。
- 修复验收：在固定 Windows CLI 语义下拒绝所有 flag-shaped 参数值，并补单短横线与 `/flag` 负例；合法固定三参数顺序保持一次通过。

## 分层结论

```yaml
evidence_layers:
  local_static:
    status: fail
    note: late TOCTOU 与 canonical summary 路径遮蔽均可绕过，P0=2；CLI flag-shaped 值 P1=1。
  local_mock:
    status: fail
    note: 现有44/44和深层9/9通过，但两个独立绕过 fixture 成功。
  local_cloud_function:
    status: unverified
    note: 未执行云函数业务测试。
  gui_devtools:
    status: unverified
    note: 本轮禁止且未操作GUI。
  real_cloud_readonly:
    status: unverified
    note: 真实CLI/远端为0。
  real_write:
    status: blocked
    note: P0未关闭，禁止真实部署。
```

## 下一步

- 下一步负责 agent：后端工程师 Agent；lane：`backend`。
- 先关闭两个 P0，再修 CLI flag-shaped P1；修复后回派测试工程师 Agent 使用上述同窗攻击 fixture 复测。
- 用户无需操作；无需用户转发，由 Codex 中枢继续分派。

---

# 最终完整性修复独立复测（2026-07-13 15:43 +08:00）

```text
message_type: handoff
request_id: REQ-20260713-153200-runner-final-integrity-qa
from_lane: qa
to_lane: coordinator
created_at: 2026-07-13T15:43:00+08:00
recorded_in: 当前对话 / docs/testing/CloudBase-api确定性单次部署运行器QA-20260713.md / docs/worklog.md
```

## 结论

- QA 结论：`FAIL_BLOCKED_DEFECT`；当前 `P0=1 / P1=0 / P2=0`，不准入 reviewer、授权申请或 `execute`。
- 上一轮两个 P0 已由独立 fixture 复现关闭：summary 路径身份/内容攻击 3/3 均在 `environment_before` 后停止且 deploy=0；runner/tool/candidate/staging 四个最终 pre-deploy 漂移窗口 4/4 均 deploy=0。
- 新 P0：authorization/scope/text 三个消费锁只以 `wx` 创建后立即关闭，后续不绑定路径身份或内容。首次运行中删除三个 `.lock` 并使首次 `environment_before` 失败后，换新 runId、复用同 authorization alias/scope/text 的第二次运行可重新创建锁并到达 adapter，实际错误码为测试哨兵 `REPLAY_REACHED_ADAPTER`，calls=`[environment_before]`。这直接绕过“一次用户授权只能消费一次”。
- 本轮真实 tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 均为 0。

## 实际命令与结果

| 检查 | 结果 |
| --- | --- |
| `E:\node.exe --check scripts\cloudbase\deterministic-api-deploy-runner.js` | exit 0 |
| `E:\node.exe --check scripts\cloudbase\test\deterministic-api-deploy-runner.test.js` | exit 0 |
| `E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.test.js` | 52/52 pass；Windows Unicode+空格、parser/env/download、alias/scope/text replay、junction、summary、TOCTOU、CLI args 均包含在内 |
| `E:\node.exe scripts\cloudbase\deterministic-api-deploy-runner.js validate` | 只读沙箱外复核 exit 0；`remoteExecuted=false`、`writes=0`；contract SHA-256=`cb7002da54b0bbf283c7fa8c56c8b799302aa72978f9c6dbd2b13f3f8e64f05d` |
| `E:\node.exe scripts\cloudbase\deterministic-api-deploy-runner.js mock` | exit 0；`remoteExecuted=false` |
| `E:\node.exe --check scripts\cloudbase\test\deterministic-api-deploy-runner.qa-integrity.test.js` | exit 0 |
| `E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.qa-integrity.test.js` | 8 项：7 pass / 1 fail；失败项正是新 P0 的预期 fail-closed 断言，被 `REPLAY_REACHED_ADAPTER` 反证 |
| 目标文件 `git diff --check` | exit 0 |
| 固定命令面/敏感面扫描 | 未发现新增 action/log/DB/role/hosting/miniprogram/git push 命令；唯一 `spawnSync` 仍在固定 RealAdapter；summary/state 现有 52 项继续验证不持久化 env 明文、raw run id 或授权原文 |

说明：首次沙箱内 `validate` 因工作区外固定 tcb 文件不可见返回 `FIXED_TCB_MISSING`；按只读权限在沙箱外对同一固定文件复核后 exit 0。该结果是沙箱可见性差异，不是 runner 或工具缺失，也未执行 tcb。

## 两项旧 P0 的独立证据

1. summary `rename + replacement`、`unlink`、同对象内容覆盖均返回 `AUDIT_SUMMARY_IDENTITY_LOST` 或 `AUDIT_SUMMARY_CONTENT_DRIFT`；summary 不得返回 passed，后续 adapter 未调用，攻击者文件未被写成成功审计。
2. 在 `pre_deploy_integrity_preparing` 事件后分别修改 runner、微信 CLI fixture、candidate、staging，四种情形均仅调用 `environment_before`，deploy=0；源码中生产 RealAdapter 的最后同步快照后直接调用冻结的 `RealAdapter.prototype.run('deploy')`，中间无 audit/callback/await/user hook。

## 新 P0 精确复现

复现文件：`scripts/cloudbase/test/deterministic-api-deploy-runner.qa-integrity.test.js`。

1. 首次 `begin()` 正常创建 run token、summary 与 `authorization-*`、`scope-*`、`text-*` 三个锁。
2. fake `environment_before` 删除三个 `.lock`，然后抛出 `QA_STOP`，首次运行失败且没有 deploy。
3. 使用全新 runId，只更新 `runIdSha256`，其余 authorization alias/scope/text 全部复用。
4. 第二次运行重新创建三个锁并到达 fake `environment_before`；测试哨兵返回 `REPLAY_REACHED_ADAPTER`，证明 replay 没有在 adapter=0 被拒绝。

修复验收必须同时满足：锁在整个运行内保留 fd、路径身份与内容绑定；任一 rename/unlink/replacement/content drift 立即 fail closed；首次失败留下的 canonical token/summary 消费记录必须在全新 runId 的再次运行前参与只读去重，不能只依赖可删除的三个 lock 路径；上述 fixture 必须变为 replay adapter=0，并回归全量 52 项与独立 8 项。

## 分层结论

```yaml
evidence_layers:
  local_static:
    status: fail
    note: 两项旧 P0 已关闭，但 authorization consumption lock 可删除后重建，新增 P0=1。
  local_mock:
    status: fail
    note: 基线52/52通过；独立攻击8项中7 pass/1 fail，失败项证明 replay 到达 adapter。
  local_cloud_function:
    status: unverified
    note: 本任务仅验证部署控制面，未执行云函数业务测试。
  gui_devtools:
    status: unverified
    note: 本轮禁止且未操作 GUI。
  real_cloud_readonly:
    status: unverified
    note: 真实 CLI 与远端操作均为0。
  real_write:
    status: blocked
    note: authorization replay P0 未关闭，禁止真实部署。
```

## 下一步

- 下一步负责 agent：后端工程师 Agent；lane：`backend`。
- 后端只修复 consumption lock/ledger 的身份与持久去重；不得执行任何真实 CLI。修复后回派测试工程师 Agent 先跑独立 8 项，再跑全量、validate/mock、敏感扫描与 diff-check。
- 是否触发暂停条件：`blocked_defect`；不需要用户操作。
- 无需用户转发，由 Codex 中枢继续分派。

---

# 当前有效 QA 结论索引（2026-07-13 23:15 +08:00）

- 本文件保留全部历史失败作为永久回归证据；按时间最新且当前有效的结论是上文 `Authorization/package 严格输入最终独立 QA（2026-07-13 23:15 +08:00）`。
- 当前有效结果：主测试 `89/89`、独立 QA `34/34`、contract SHA-256=`1bb909bdb1e28723849cf2dcf59424f19294a1f058e767c135fa7ee50f2f0d61`、`P0=0 / P1=0 / P2=0`、`PASS_FOR_REVIEWER`。
- production main 7 类严格 authorization 输入均为 state/token/lock/adapter=0；package 3 类均满足严格解析与 raw SHA 绑定；真实远端和 git push 操作仍为 0。
