# CloudBase api 确定性单次部署运行器（2026-07-13）

```text
message_type: handoff
request_id: REQ-20260713-deterministic-deploy-runner
from_lane: backend
to_lane: coordinator
created_at: 2026-07-13T13:33:00+08:00
recorded_in: 当前对话 / docs/backend/CloudBase-api确定性单次部署运行器-20260713.md / docs/worklog.md
```

## 结论

- 已把最近三次止损中的临场 PowerShell/CLI 拼装替换为一个确定性的 Node.js 运行器；本轮只执行 `validate/mock/test`，没有构造或运行任何真实远端步骤。
- 根因不是 enrichment 候选包：三次分别为 PowerShell culture sort、PATH 中 `tcb` 不存在、PowerShell `ConvertFrom-Json` 解析失败。共同根因是高风险授权获得后仍由执行 Agent 临场选择解析器、排序器和命令入口，导致“执行计划”在授权后继续变化。
- 新运行器硬绑定候选/环境/函数/入口/命令语法/精确文件契约，并将真实顺序固定为 `environment_before -> deploy -> status -> environment_after -> download`。每个步骤最多一次，任何失败、超时、非 JSON、状态异常或核对不一致立即封死 run id，后续步骤为 0。
- `execute` 默认拒绝：当前授权 schema v3/scope v2 必须包含 `run-UUIDv4`、`auth-UUIDv4`、授权原文及其摘要、run id 摘要、版本化 canonical scope 和由运行器内部重算的 scope digest；scope 精确绑定环境/函数/AppID/env 值摘要/文件契约/固定工具内容身份/state 与 remote/五步顺序/禁止面/失败即停。
- QA 首轮发现的 P0/P1 已修复：原子 token 现于本地 guard 和首个 adapter 调用前创建；未来 `execute` 会先真实核对固定工具、缓存包 package.json、production candidate/staging exact 9-file 契约与逐文件 `Buffer.equals`、remote 安全且不存在；本轮仅以隔离 fixture 证明 guard 失败时 adapter=0、run 已消费，且不会把 expected 指纹冒充 actual，未读取或执行 production candidate/staging guard。
- 首轮 P0/P1 修复时本地测试 31/31 通过；Windows Unicode+空格路径 fake `.cmd` 对 deploy/status/download 均真实 exit=0 且 argv 逐项精确。后续 reviewer 深层修复后的当前结果见文末 44/44 与新动态 contract SHA。
- QA targeted retest 发现的最后一个 parser P1 已修复：deploy 的 `success/filesCount`、status 的 `status` 均须在唯一目标行恰好出现一次；同值重复、异值冲突、缺失、畸形/未知布尔值、额外 `status/availability/function/name` 等受信字段均 fail closed。env JSON 同步审计并拒绝 function/name、Namespace、status、availability、variables、Key/Value 的重复可信别名。download 不是 CLI stdout 字段解析器，而是本地目录 exact 文件/目录/bytes/SHA/manifest 检查，不存在首值正则模式。
- 修复后本地测试为 35/35；历史成功 fixture 仍可解析。新增负例覆盖 success 同值/异值重复、filesCount 重复、status 同值/异值重复、availability、function/name、未知布尔/状态、env 同类重复别名与 exact duplicate JSON key。

## 固定实现

### 路径与契约

- Node：`E:\node.exe`。
- CloudBase CLI：`C:\Users\宋\AppData\Local\npm-cache\_npx\9a8789722ddc2fbe\node_modules\@cloudbase\cli\bin\tcb`，契约版本 `3.6.1`。
- 微信开发者工具 CLI：`E:\微信web开发者工具\cli.bat`；因为 `.bat` 在 Node/Windows 下不能安全地按普通可执行文件直接启动，运行器只允许固定 `C:\Windows\System32\cmd.exe /d /s /c` 包装，并对全部固定 token 拒绝 `"&|<>^%!` 与换行，`shell=false`、`windowsVerbatimArguments=true`，不接受用户命令片段。
- 环境/函数/AppID：`cloud1-d2gp2ayiwab8f8a94` / `api` / `wx6a196f6ebfb27596`。
- staging：`.tmp_web_uid_enrichment_deploy_staging_20260713_v1/api`。
- remote verify：`.tmp_web_uid_enrichment_remote_verify_20260713_v1`。
- expected env：完整键集必须精确为 `ADMIN_WEB_AUTH_ALLOWED_APP_IDS` 单键，值必须匹配固定契约；值不写入状态日志/summary。
- remote exact：根部 9 files / 157,533 bytes / manifest `a0520bb158c30e6c07d4eb0220205ff8834ccd337bf8e5433a24ef3d2208a2cb`，逐文件 bytes/SHA-256 固定；根目录只额外允许远端安装生成的 `node_modules/`。

### 唯一真实命令模板

命令语法来自既有成功报告 `docs/backend/WebUID运行时v2单次部署核验-20260712.md`、`docs/backend/同窗多助教预约规则线上生效部署-20260703.md` 和已缓存 CLI 3.6.1 源码；本轮没有执行 help/version/CLI。

1. env before/after：固定 Node 直接执行缓存 `bin/tcb fn detail api -e cloud1-d2gp2ayiwab8f8a94 --json`。
2. deploy：固定微信 CLI `cloud functions deploy --project <projectRoot> --appid wx6a196f6ebfb27596 --env cloud1-d2gp2ayiwab8f8a94 --paths <staging/api> --remote-npm-install --lang zh`。
3. status：固定微信 CLI `cloud functions info --project <projectRoot> --appid wx6a196f6ebfb27596 --env cloud1-d2gp2ayiwab8f8a94 --names api --lang zh`。
4. download：固定微信 CLI `cloud functions download --project <projectRoot> --appid wx6a196f6ebfb27596 --env cloud1-d2gp2ayiwab8f8a94 --name api --path <remoteVerifyDir> --lang zh`。

运行器没有 npx、PATH `tcb`、PowerShell、`localeCompare/Intl.Collator`、CLI fallback、工具切换、自动重试、action/log/DB/hosting/miniprogram/git 命令面。

## 一次性状态与审计

- 授权契约通过后、任何本地 guard 或 adapter 调用前，使用 `fs.openSync(token, 'wx')` 原子创建基于 run id SHA-256 的安全别名 token；同名文件存在即 `RUN_ID_ALREADY_CONSUMED`。guard 失败、远端失败、超时或成功都不删除、不覆盖 token，因此同一授权/run id 永远不能第二次执行。
- token/summary 不保存 raw run id 或授权原文，只保存安全别名与摘要；授权原文仅用于当次摘要一致性校验。
- token 创建后先执行本地 guard：四个固定工具均须为普通文件；缓存 `package.json` 必须是 `@cloudbase/cli@3.6.1` 且 `bin.tcb=bin/tcb` 并解析到固定入口；remote verify 必须是项目根下全新直接子目录；candidate/staging 必须 exact 文件集、总字节、manifest、逐文件摘要相同，且逐文件 `Buffer.equals`。
- 每个 step 在进程调用前 append `step_started` 并 `fsync`；返回且核验通过后 append `step_passed`；结束 append `run_finished`。进程崩溃时 token 仍保留并封死。
- summary 也使用 `wx` 独占创建；只记录 stdout/stderr SHA-256、状态、次数、授权文本 SHA-256、候选 manifest 和 remote exact 摘要。
- env 值、CLI 原始 stdout/stderr、raw run id、授权原文、uid/openId 不进入 summary。测试扫描持久化 summary，均未出现环境变量值、raw run id 或授权原文。

## 模式分离

- `validate`：只验证代码中的固定契约与命令白名单，不读取 candidate/staging、不给文件重算 manifest、不检查入口存在性、不运行 CLI、不访问网络。
- `mock`：只提示使用 fake-adapter 单测，不构造 `RealAdapter`。
- `execute`：未来获得新的精确授权后才可使用；必须提供 authorization JSON 与固定确认词。当前默认拒绝，且本轮未运行。

本实现没有第二次运行 reviewer fixed preflight，没有重新读取 candidate/staging 内容，没有创建/修改 remote verify 目录，也没有重新计算其 manifest。

## 测试矩阵

| 场景 | 结果 |
| --- | --- |
| production 固定路径、顺序、manifest 元数据与命令白名单 | pass |
| Node/环境路径漂移、禁用命令词注入 | pass，执行前拒绝 |
| 缺 execute confirmation/authorization | pass，adapter calls=0 |
| 成功五步 | pass，顺序精确且每步=1 |
| env-before/deploy/status/env-after/download 各步首次失败 | pass，失败步后全部=0 |
| timeout | pass，无重试 |
| env 非 JSON | pass，deploy=0 |
| status 非 Active、env after 非 Available | pass，后续停止 |
| env 漂移 | pass，download=0，漂移值不落 summary |
| download 根部污染 | pass，exact fail，无重试 |
| download raw bytes/manifest 不一致 | pass，exact fail，无重试 |
| remote verify 路径预先存在/路径不安全 | pass，本地 guard 拒绝，adapter calls=0，run 已消费 |
| candidate 缺失、staging 污染、内容漂移 | pass，本地 guard 拒绝，adapter calls=0 |
| 固定 CLI package name/version/bin 漂移 | pass，本地 guard 拒绝，adapter calls=0 |
| env Namespace 漂移 | pass，deploy=0 |
| deploy/status 重复或歧义结果行 | pass，立即停止 |
| Windows Unicode+空格路径 fake `.cmd` | pass，deploy/status/download exit=0，shell=false，argv exact |
| success 后重复 run id | pass，第二 adapter calls=0 |
| failure 后重复 run id | pass，第二 adapter calls=0 |
| authorization binding/operation 顺序漂移 | pass，adapter calls=0 |
| 禁止操作计数与 summary 脱敏 | pass，禁止项全0 |

## 验证结果

```text
E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.test.js
tests 35 / pass 35 / fail 0

E:\node.exe --check scripts\cloudbase\deterministic-api-deploy-runner.js
exit 0

E:\node.exe --check scripts\cloudbase\test\deterministic-api-deploy-runner.test.js
exit 0

E:\node.exe scripts\cloudbase\deterministic-api-deploy-runner.js validate
ok=true / remoteExecuted=false / writes=0

E:\node.exe scripts\cloudbase\deterministic-api-deploy-runner.js mock
ok=true / remoteExecuted=false
```

本轮真实计数：tcb=0、微信 CLI=0、npx=0、env read/write=0/0、deploy=0、status=0、download=0、action/probe/log=0、DB/role/seed/delete/migration=0、hosting/miniprogram/review/git push=0。

## 改动文件

- `scripts/cloudbase/deterministic-api-deploy-runner.js`
- `scripts/cloudbase/test/deterministic-api-deploy-runner.test.js`
- `scripts/cloudbase/README.md`
- `docs/backend/CloudBase-api确定性单次部署运行器-20260713.md`
- `docs/worklog.md`

未改业务云函数、candidate/staging/remote verify、canonical 或 dispatch。

## 未实测与下一步

- 当前只证明本地确定性控制面；CloudBase 登录状态、远端服务、真实 `tcb --json` 响应和微信 CLI 真实运行仍未执行。本报告不表示 enrichment 已部署。
- QA 应独立复跑 35 项，并复核最后一个 parser P1：同行重复/冲突字段、exact duplicate JSON key、未知值、意外受信字段均 fail closed；同时回归 guard-before-adapter、canonical scope digest、Windows fake batch exact argv、Namespace、一次性 token、env 脱敏、失败即停和禁用命令面。
- reviewer 应确认：未来授权只允许通过该 runner 执行，不再给 Agent 临场拼命令；是否准入新的精确授权仍由 coordinator/reviewer 治理。
- 下一步负责 agent：测试工程师 Agent（lane=`qa`）。
- 是否触发暂停条件：否；本地实现已完成。任何 `execute`/远端操作仍必须等待新的精确授权。
- 无需用户转发，由 Codex 中枢继续分派。

## Reviewer 深层复现 P0/P1/P2 修复（2026-07-13 14:40 +08:00）

- 授权契约升级为 `schemaVersion=3 / scopeVersion=2`。一次执行现在以独立 `wx` 文件同时封死 run alias、authorization alias、scope digest、authorization-text digest；任一维度重放即拒绝，新 run id 不再绕过授权一次性。candidate/tool 等首次本地 guard 失败同样消费授权。
- scope 与 contract 新增 runner 源文件、Node、tcb bin、cache package.json、cmd.exe、微信 CLI 的 path、realpath、内容 SHA-256；package name/version/bin 契约仍须精确。授权后修改 fake 微信 CLI 的复现现在 adapter=0，且该授权已消费。最终动态 contract SHA-256=`65b9f7424e423c249f10ccc642ee910048643389cebbe0ca9dd9ca2a9aeda108`。
- stateDir 及 project/state realpath 已进入 scope/contract；state 只允许项目真实根目录下的绝对直接子目录。project/state `lstat` 必须为真实目录并拒绝 symlink/junction/reparse point，`realpath` 必须等于授权预期。Windows junction 复现未向外部目标写入任何文件；相对、嵌套、traversal、外部路径也全部 adapter=0。
- summary 在 begin 阶段以 `wx` 预留并写入 sealed 安全记录，最终 summary 在同一已预留 fd 上 truncate/write/fsync；预存在 summary 时 adapter=0，run 与授权均已消费，不再在 finish 阶段以 `EEXIST` 丢失本次审计。
- TOCTOU：初始 guard 快照包含 runner/tool/candidate/staging；`environment_before` 成功后、deploy adapter 调用前重新读取并精确比对。测试在该窗口修改 fake 微信 CLI，错误码 `PRE_DEPLOY_INTEGRITY_DRIFT`，adapter calls 仅 `environment_before`，deploy=0。
- CLI parser 仅接受固定顺序 `--run-id -> --authorization-file -> --confirm`；重复、未知、缺对、乱序、flag-shaped value、NUL/换行均拒绝。
- 新增 reviewer 复现及安全负例后，全量离线测试 `44/44`，定向深层测试 `9/9`；runner/test node check、validate/mock 通过。真实 execute/tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 均为 0。
- 同类审计：parser fail-closed、Windows fake batch、guard-before-adapter、Namespace、remote exact、脱敏与禁止命令面继续保持通过。当前仍只证明离线控制面，不表示远端部署完成。
- 下一步负责 agent：测试工程师 Agent（lane=`qa`）独立复跑 44 项和 reviewer 六个定向复现；QA 清零后再交 reviewer。

## Canonical summary、最终 deploy gate 与 replay lock 深层修复（2026-07-13 15:50 +08:00）

- 原因一：summary 仅持有 fd，未证明 canonical path 仍指向该 fd；Windows rename+replacement 后，旧实现会把最终结果写入 moved 文件并错误返回 passed。现以 `{bigint:true}` 的 `fstat/stat dev+ino` 为文件身份，叠加 parent/file realpath、`lstat` 普通非 reparse 类型、nlink及已知内容，在每个审计事件前后、adapter 前后和 summary finish 前后核对。rename、unlink、replacement、同对象内容漂移均返回稳定 `AUDIT_SUMMARY_*` 错误且结果为 failed；token仍可信时写入 `audit_failure_sealed`。
- 原因二：旧 `pre_deploy_integrity_passed` 事件位于最后 snapshot 与 deploy adapter 之间，可被测试 subclass 用作改写 hook。现在只先记录 `pre_deploy_integrity_preparing`；随后在同一同步调用链 capture/compare 后直接调用。production `RealAdapter` 内部在固定 `spawnSync` 前再次 capture/compare，且命令被复制为无 accessor 的冻结 primitive 数据；中间没有 state、日志、now、回调或可覆盖 deploy hook。runner/tool/candidate/staging 四类定向改写均 `environment_before=1 / deploy=0`。
- 新 QA P0：authorization/scope/text 三个 `.lock` 原先写后关闭；在 environment_before 中删除全部锁并失败后，新 runId 可重建锁并到达 adapter。现三锁均以 `wx+` 打开并在整个 run 持有 fd，纳入相同 path/fd/content 身份核对；任一删除、rename+replacement或内容漂移均 fail closed。
- 为保证失败或 crash 后仍已消费，run token 首行 `run_sealed` 同时作为第二消费账本。新 run 在创建 replay locks 前扫描既有普通 token；alias/scope/text 任一相同即 `*_ALREADY_CONSUMED`，adapter=0。首次运行删除全部三锁并抛错后，换新 runId 的独立 QA 哨兵 `REPLAY_REACHED_ADAPTER` 已关闭。
- 纯 Node 无法阻止同用户删除整个 stateRoot 的全部证据，也无法消除 `spawnSync` 后微信 CLI 按 pathname 打开 staging 前的 OS 级竞态；本轮仅关闭 runner-controlled 同步窗口并对可见漂移 fail closed。完全消除需要 native Windows share-lock handle 或经新授权的不可变部署副本，本轮未引入。

最终本地验证：

```text
主离线回归：58/58 pass
独立 QA integrity fixture：8/8 pass（原 7/8）
runner / 主测试 / QA fixture node --check：均 exit 0
validate：ok=true / remoteExecuted=false / writes=0
mock：ok=true / remoteExecuted=false
contract SHA-256：34900e564d87532c60c8d920296dad181533f14898bd3c0a8eb66d52b4be283c
```

本轮真实计数：execute=0、tcb=0、微信真实 CLI=0、npx=0、env read/write=0/0、deploy=0、status=0、download=0、action/log/DB/role/hosting/miniprogram/review/git push=0。

下一步负责 agent：测试工程师 Agent（lane=`qa`）独立复跑主测试与 `deterministic-api-deploy-runner.qa-integrity.test.js`，再交验收官；无需用户转发。

## Token + summary 严格双账本修复（2026-07-13 16:10 +08:00）

- QA 后续补验发现：仅扫描可修改 token 首行时，锁删除后的失败 run 可以通过改写 token消费字段绕过；普通 `JSON.parse` 还会让重复键覆盖前值。
- token首行现升级为 `schemaVersion=4 / ledgerVersion=1`，精确只允许 `at/event/schemaVersion/ledgerVersion/runAlias/authorizationAlias/scopeDigest/authorizationTextSha256`。alias、hex长度、时间、runAlias、类型、缺失/额外字段均严格校验；所有 token行和 summary都先通过既有 duplicate-key parser，重复键、畸形 JSON一律 fail closed。
- prior run不再只信 token。相同 runAlias必须同时存在普通非symlink token和summary；summary同为schema4/ledger1，并保存首次token seal整行SHA-256。runAlias、authorizationAlias、scope digest、authorization text digest、token seal SHA必须交叉一致。
- token或summary任一被删、改、替换、畸形、重复键、字段冲突或单边缺失，统一返回 `AUTHORIZATION_LEDGER_UNREADABLE`；发生在 replay锁创建前，adapter=0。授权证据不是可读且一致时绝不解释成“未消费”。
- 新矩阵覆盖：token消费元数据改写、duplicate/extra/missing/malformed token、token删除、summary删除、summary冲突、summary duplicate key及malformed summary；全部 fail closed。原summary/deploy/replay-lock回归继续通过。

最终本地验证：

```text
主离线回归：68/68 pass
独立 QA integrity fixture：10/10 pass
runner / 主测试 / QA fixture node --check：均 exit 0
validate：ok=true / remoteExecuted=false / writes=0
mock：ok=true / remoteExecuted=false
contract SHA-256：e6faa0d112851893444e2dfeb43f69a4cc1cfc3cfc81c822851da0c9e5314e4a
```

真实 execute/tcb/微信CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push仍全部为0。纯本地同用户若同时删除或一致改写整个stateRoot全部证据，纯文件方案无法提供硬件级不可篡改性，仍需本机ACL/运维保护；本轮未引入native helper或远端状态。

下一步负责 agent：测试工程师 Agent（lane=`qa`）独立复测68项和QA 10项，再交验收官；无需用户转发。

## Prior summary exact-schema 最终修复（2026-07-13 16:45 +08:00）

- 已按 writer 实际输出分别严格校验 `sealed`、`failed`、`passed` 三种合法 summary 形态；覆盖根级/嵌套字段集合、schema/ledger/scope 版本、类型、ISO 时间及先后顺序、step 顺序/次数/终态/输出摘要、failure 结构、脱敏标记和成功完成证据。
- extra、missing、wrong type/version/time/result/steps/error structure 均在 replay lock 创建和 adapter 调用前返回 `AUTHORIZATION_LEDGER_UNREADABLE`；QA 的 extra field、`scopeVersion` 字符串、非 ISO `startedAt` 三项 P1 已关闭。
- 主测试新增 8 项 summary 严格矩阵后 `76/76`；独立 QA integrity fixture `14/14`；三文件 `node --check`、validate/mock 均通过。
- contract SHA-256=`d59f9ee0447c3dee40e202119423f74cd6d692946558ed2462f7dd5a901f7875`。真实 execute/tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 全部为 0。
- 残余边界不变：同用户一致删除或改写整棵 stateRoot 依赖本机 ACL/运维保护；Node 无法消除外部进程按 pathname 打开 staging 前的 OS 级竞争窗口。本轮未扩展到 native helper 或远端状态。

下一步负责 agent：测试工程师 Agent（lane=`qa`）独立复测后交验收官；无需用户转发，由 Codex 中枢继续分派。

## Authorization/package JSON 严格输入边界（2026-07-13 22:50 +08:00）

- production `main()` 现在从 authorization-file raw text 开始使用递归 duplicate-key scanner；根对象、任意嵌套对象及数组内对象的重复键均在 stateDir、token、replay locks 和 adapter 前拒绝。
- authorization 根级只接受 7 个精确字段；完整 scope 的根与 candidate/staging/environment/tools/fixedIntegrity/state/remoteVerify 等嵌套对象做 exact field set、类型和格式预检。extra/missing/type/version/format 错误均不产生执行状态。
- 固定 CLI `package.json` 复用同一 strict parser。可信最小集合为根级 `name/version/bin` 与 `bin.tcb`；允许普通 npm 根元数据，bin 额外项只允许非空 string 映射且不参与可信契约。raw package bytes 的 SHA-256 继续进入 fixedIntegrity 与授权 scope。
- runner 中剩余两处直接 `JSON.parse` 均属于 strict parser 内部：一处只解析已经切分的 JSON string token；一处只在递归 duplicate-key 扫描通过后解析完整文本，均已代码注释边界。authorization/package/env/token/summary 外部 JSON 安全边界无普通解析入口。
- 永久测试新增：authorization root/nested duplicate、extra/missing/type/version/format、production main duplicate-file、package root/bin duplicate，以及 npm metadata 允许但 raw SHA 绑定。主测试 `89/89`，独立 QA fixture `23/23`。
- 三文件 node check、validate/mock 全部通过；contract SHA-256=`1bb909bdb1e28723849cf2dcf59424f19294a1f058e767c135fa7ee50f2f0d61`。真实 execute/tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 全部为 0；无新 blocker。

下一步负责 agent：测试工程师 Agent（lane=`qa`）独立复测后交验收官；无需用户转发，由 Codex 中枢继续分派。

## Prior summary 当前授权外部锚定（2026-07-13 17:48 +08:00）

- 对命中当前 authorization alias、scope digest 或 authorization-text digest 的 prior ledger，summary 不再只做内部自洽校验；其 environment/functionName、expectedContract files/bytes/manifest、environment before/after keys 与 valueDigest 必须等于当前 canonical config 锚点。
- environment 映射按 writer 真源机械生成：`keys=[config.expectedEnvironment.key]`，`valueDigest=SHA-256(stableJson([{key,value}]))`；不信任 summary 自报，也不误用 scope 中 raw value 的 SHA-256。
- 两项整组自洽改写已关闭：同时改写 expected/localGuard/deploy/remote 全套包契约；同时改写 before/after 环境 keys+digest。两者均在 replay locks 和 adapter 前返回 `AUTHORIZATION_LEDGER_UNREADABLE`。
- 为避免历史不同 scope 的无关合法账本被当前新契约误杀，外部锚只用于命中当前三类消费标识的 prior ledger；所有 prior token/summary 的 strict schema、token seal 和身份交叉核对仍无条件执行。
- 主测试新增两项锚定负例后 `78/78`，独立 QA fixture `23/23`；三文件 node check、validate/mock 均通过。contract SHA-256=`c02ef65b8cdc34a0d5203ada7decb2c2dfc4305c6d84eb55b86c16bbe5f4b1e2`。
- 真实 execute/tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 全部为 0；无新 blocker。

下一步负责 agent：测试工程师 Agent（lane=`qa`）独立复测后交验收官；无需用户转发，由 Codex 中枢继续分派。

## Summary writer 可达状态机修复（2026-07-13 17:20 +08:00）

- 校验已从“字段格式正确”提升为 writer 实际可达状态机：attempted steps 只能形成连续前缀，最多一个 failed 终止步骤，之后必须全部 `not_started`；passed step 必须带完整输出证据且 `exitCode=0`。
- root evidence 只能在对应步骤 passed 后存在；后续步骤开始前，前一步的 root evidence 必须已经写入。`localGuard` 的 candidate/staging 与 expected contract、deploy filesCount、remote files/bytes/manifest、environment before/after keys 和 digest 全部跨字段一致。
- QA 七项语义矛盾全部关闭：跳过 env-before 后 deploy passed、candidate/staging 冲突、未执行 deploy 却存在 root evidence、remote contract 冲突、deploy count 冲突、env before/after 冲突、passed step 非零 exit。
- 主测试 `76/76`，独立 QA integrity fixture `21/21`；三文件 node check、validate/mock 全部通过。contract SHA-256=`58a845eb75aca14118cb3b144418ba4ea9e78a4c07f4783014f5145f94314df8`。
- 真实 execute/tcb/微信 CLI/npx/env/deploy/status/download/action/log/DB/role/hosting/miniprogram/review/git push 全部为 0；残余 OS/运维边界不变。

下一步负责 agent：测试工程师 Agent（lane=`qa`）独立复测后交验收官；无需用户转发，由 Codex 中枢继续分派。
