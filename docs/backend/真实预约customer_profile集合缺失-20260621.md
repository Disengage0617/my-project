# 真实预约 customer_profile 集合缺失诊断与本地修复报告

message_type: handoff
request_id: REQ-20260621-真实预约customer_profile集合缺失
from_lane: backend
to_lane: coordinator
created_at: 2026-06-21T00:11:50+08:00
recorded_in: 当前对话 / docs/worklog.md / docs/agent-dispatch-state.md / docs/backend/真实预约customer_profile集合缺失-20260621.md

消息内容：
- 根因判断：
  - 用户真实页面报错为 `DATABASE_COLLECTION_NOT_EXIST customer_profile`，真实云数据库缺少 `customer_profile` 集合是直接原因。
  - 本地后端 `createReservation` 在创建预约后会沉淀客户资料，原逻辑默认 `customer_profile` 已存在；真实集合缺失时，该客户资料读写失败被外层包装为 `INTERNAL_ERROR`，导致预约提交链路对用户表现为失败。
  - 集合名与后端代码/真源一致，未发现 `customer_profile` 与其它集合名不一致问题。
  - 初始化说明此前只明确 seed 基础配置集合，未把 `customer_profile` 等空业务集合列为真实联调前必建项，属于云数据库初始化遗漏叠加代码缺失集合兼容不足。
- 修复/方案：
  - 本地后端补 `isCollectionNotFoundError` 和 `findOneOptionalCollection`，识别微信云数据库 `-502005`、`DATABASE_COLLECTION_NOT_EXIST`、`database collection not exists`。
  - `upsertCustomerProfile` 在 `customer_profile` 集合缺失时降级为返回 `null`，不再阻断预约、爽约、关台完成、活动报名等主链路。
  - `createReservation` 的客户资料读取改为可选集合读取，确保预约创建本身不因客户沉淀集合缺失而失败。
  - `markNoShow`、`closeTable`、`createCampaignRegistration` 的客户资料累计读取同步改为可选集合读取。
  - `getCustomers` 在集合缺失时返回空分页列表；`getCustomerProfile` 在集合缺失时返回业务错误 `RESOURCE_NOT_FOUND`，不再暴露内部数据库缺集合错误。
  - 初始化说明补充真实联调前必须创建空业务集合，特别标明 `customer_profile`。
  - 未部署、未创建真实集合、未写真实数据库。
- 改动文件：
  - `cloudfunctions/api/src/handlers.js`
  - `cloudfunctions/api/handlers.js`
  - `cloudfunctions/api/test/handler-flow.test.js`
  - `docs/MVP云数据库初始化说明-台球厅私域运营小程序.md`
  - `docs/backend/真实预约customer_profile集合缺失-20260621.md`
  - `docs/worklog.md`
- 接口变化：
  - 无新增 action，无 payload 结构变化，无成功响应结构变化。
  - `createReservation`：客户资料沉淀失败且原因为 `customer_profile` 集合不存在时，不再阻断预约创建。
  - `getCustomers`：`customer_profile` 集合不存在时返回空列表分页结果。
  - `getCustomerProfile`：`customer_profile` 集合不存在或查无资料时返回 `RESOURCE_NOT_FOUND`。
- 数据模型/集合变化：
  - 未修改真实云数据库。
  - 文档明确 `customer_profile` 是真实联调前必建业务集合，用于客户资料沉淀、手机号授权、预约/活动次数累计。
  - 文档同步列出其它建议预建空业务集合：`reservation`、`reservation_lock`、`assistant_reservation`、`campaign_registration`、`no_show_record`、`table_status_log`、`assistant_status_log`、`audit_log`、`user`、`staff_user`、`member_account`、`coupon`、`order`。
- 权限变化：
  - 无权限模型变化。
  - 后台客户列表/客户详情仍需员工权限；手机号脱敏规则不变。
- 验证命令：
  - `node --check cloudfunctions/api/src/handlers.js`
  - `node --check cloudfunctions/api/handlers.js`
  - `node --check cloudfunctions/api/test/handler-flow.test.js`
  - `cd cloudfunctions/api && npm test`
  - `git diff --check -- cloudfunctions/api/src/handlers.js cloudfunctions/api/handlers.js cloudfunctions/api/test/handler-flow.test.js docs/MVP云数据库初始化说明-台球厅私域运营小程序.md docs/backend/真实预约customer_profile集合缺失-20260621.md docs/worklog.md`
- 验证结果：
  - JS 语法检查均无输出。
  - `npm test` 通过：30/30，其中新增 `createReservation succeeds when customer_profile collection is missing` 覆盖缺集合场景。
  - `cloudfunctions/api/src/handlers.js` 与 `cloudfunctions/api/handlers.js` SHA256 一致：`9182651ABDCF953A5B1367D884204993CB7FDE432622152984F11F9D48DD8EBC`。
  - `git diff --check` 通过，退出码 0；仅出现 Git 的 LF/CRLF 换行提示。
- 未实测范围：
  - 未部署云函数，真实云端当前 `api` 是否已具备本地兼容逻辑未验证。
  - 未创建真实 `customer_profile` 集合，真实云数据库缺集合状态未改变。
  - 未在微信开发者工具、真机、体验版再次提交真实预约。
- 是否需要用户授权创建集合/部署/写库：
  - 需要部署授权：如要让真实页面使用本地兼容逻辑，需要部署/上传云函数 `api`。
  - 需要真实云数据库写配置授权：如要从根因上补齐真实集合，需要创建空集合 `customer_profile`，并建议同步创建其它空业务集合；这属于真实云数据库写配置操作。
  - 当前不需要删除/重置/迁移数据；本轮也未执行。
- 剩余问题：
  - 代码兼容只能避免主链路被客户沉淀集合缺失阻断；正式联调仍应补齐真实云数据库集合，否则客户沉淀、客户列表、手机号授权资料会缺失。
  - 由于未部署，用户当前真实页面报错不会因本轮本地修改自动消失。
- 建议下一步负责 agent：
  - Codex 中枢先向用户申请两档授权：1）部署云函数 `api`；2）在真实云数据库创建空业务集合，至少 `customer_profile`。
  - 授权后交由后端工程师 Agent 执行最小部署/建集合，并由测试工程师 Agent 做真实页面预约提交复测。
- 是否触发暂停条件：
  - 是。继续让真实页面生效需要部署授权；根因修复需要真实云数据库创建集合授权。本轮已停止在本地代码、测试和文档范围内。

## 授权部署与建集合执行记录

message_type: status
request_id: REQ-20260621-部署api并创建customer_profile集合
from_lane: backend
to_lane: coordinator
created_at: 2026-06-21T00:42:37+08:00
recorded_in: 当前对话 / docs/worklog.md / docs/agent-dispatch-state.md / docs/backend/真实预约customer_profile集合缺失-20260621.md

消息内容：
- 执行命令/工具：
  - 微信开发者工具 CLI：`E:\微信web开发者工具\cli.bat`。
  - 部署命令：`cli.bat cloud functions deploy --env cloud1-d2gp2ayiwab8f8a94 --paths C:\Users\宋\Documents\桌球小程序\cloudfunctions\api --remote-npm-install --project C:\Users\宋\Documents\桌球小程序`。
  - 部署后核对：`cli.bat cloud functions info --env cloud1-d2gp2ayiwab8f8a94 --names api --project C:\Users\宋\Documents\桌球小程序`。
  - 部署后隔离下载核对：`cli.bat cloud functions download --env cloud1-d2gp2ayiwab8f8a94 --name api --path .tmp_cloud_download_customer_profile_api_20260621 --project C:\Users\宋\Documents\桌球小程序`。
  - CloudBase CLI 探测：`npx --yes --package @cloudbase/cli tcb db nosql execute --help`、`npx --yes --package @cloudbase/cli tcb env login list`。
- 部署结果：
  - `api` 云函数部署成功，CLI 返回 `success=true`、`filesCount=11`、`packSize=48.2 KB`。
  - 部署后 `cloud functions info` 返回 `api` 状态为 `Active`，运行时 `Nodejs16.13`，超时 `3`。
  - 部署后隔离下载包中 `handlers.js` 与 `src/handlers.js` 均包含 `isCollectionNotFoundError`、`findOneOptionalCollection`、`customer_profile` 缺集合兼容逻辑。
  - 本地 `cloudfunctions/api/handlers.js`、下载包 `handlers.js`、下载包 `src/handlers.js` 的 SHA256 均为 `9182651ABDCF953A5B1367D884204993CB7FDE432622152984F11F9D48DD8EBC`。
- 集合创建/已存在结果：
  - 未完成创建 `customer_profile` 集合。
  - 微信开发者工具 CLI 仅提供 `cloud env` 与 `cloud functions`，没有数据库/集合创建命令。
  - 本地 `wx-server-sdk` 能力探测显示 `db.createCollection` 存在，但真实 DB 只读查询失败：`collection.get:fail -501007 invalid parameters. missing secretId or secretKey of tencent cloud`，说明本地 SDK 无法在缺少腾讯云密钥时访问真实 DB。
  - CloudBase CLI 具备 `db nosql execute` 能力，但当前身份检查失败：`No valid identity information, please use cloudbase login to login`。继续需要用户扫码/登录或提供可用 CloudBase 身份，属于暂停条件。
  - 未执行任何 `INSERT/UPDATE/DELETE/seed/bootstrapMvp`，未创建其它集合。
- 验证结果：
  - 部署前本地 `node --check cloudfunctions/api/index.js`、`node --check cloudfunctions/api/handlers.js`、`node --check cloudfunctions/api/src/handlers.js` 均通过。
  - 部署前 `cd cloudfunctions/api && npm test` 通过 30/30。
  - 云环境列表确认存在并指向 `cloud1-d2gp2ayiwab8f8a94`。
  - `api` 部署成功并通过 info/download/hash 核对。
  - 本轮临时下载目录 `.tmp_cloud_download_customer_profile_api_20260621` 已在核对后删除，避免保留临时依赖包。
- 未实测范围：
  - 未创建真实 `customer_profile` 集合。
  - 未真实调用 `createReservation` 写预约。
  - 未在微信开发者工具业务页面复测预约提交。
  - 未执行真实 DB 写入、迁移、删除、重置。
- 剩余问题：
  - 真实云函数 `api` 已更新，但真实 DB `customer_profile` 集合是否存在仍未被修复。
  - 如果真实页面在新版 `api` 生效后再次提交预约，代码兼容应避免客户资料集合缺失阻断主链路；但客户资料沉淀不会落库，后台客户列表仍可能为空。
  - 根因闭环仍需创建 `customer_profile` 空集合。
- 建议下一步负责 agent：
  - Codex 中枢向用户确认是否允许执行 `tcb login` 扫码/登录，或让用户在微信云开发控制台手动创建空集合 `customer_profile`。
  - 获得 CloudBase CLI 登录态后交后端工程师 Agent 仅执行 `customer_profile` 集合创建/存在验证；随后交测试工程师 Agent 做真实页面预约提交复测。
- 是否触发暂停条件：
  - 是。创建真实集合需要 CloudBase CLI 登录/密钥或用户在云开发控制台手动操作；本轮已完成部署，但按规则暂停，不继续越权登录或写库。

## CloudBase 登录后创建 customer_profile 集合记录

message_type: handoff
request_id: REQ-20260621-创建customer_profile集合登录续执行
from_lane: backend
to_lane: coordinator
created_at: 2026-06-21T00:49:12+08:00
recorded_in: 当前对话 / docs/agent-dispatch-state.md / docs/worklog.md / docs/backend/真实预约customer_profile集合缺失-20260621.md

消息内容：
- 登录方式：
  - 使用 CloudBase CLI 3.5.7 执行 `tcb login` 设备授权流程。
  - CLI 输出授权链接 `https://tcb.cloud.tencent.com/dev#/cli-auth?user_code=RB28-28UY&from=cli&flow=device`，用户码 `RB28-28UY`。
  - 用户完成网页登录授权后，CLI 返回 `login succeeded`。
  - CLI 询问是否收集 usage data 时，按用户此前“后续选择全部默认是”选择默认 `Yes`。
- 集合创建/已存在结果：
  - 目标环境：`cloud1-d2gp2ayiwab8f8a94`。
  - 创建命令通过 CloudBase CLI `db nosql execute` 执行，仅执行 Mongo 命令 `{ "create": "customer_profile" }`。
  - 创建结果返回 `ok: 1.0`，requestId 为 `6e567302-d7ea-460e-abd5-6fa65be7111c`。
  - 未创建其它集合，未写入任何文档，未删除/清空/迁移数据。
- 只读验证结果：
  - `listCollections` 按 `name=customer_profile` 查询返回 `name: customer_profile`、`type: collection`，requestId 为 `5fceb7eb-41de-4593-a9cb-14d835081738`。
  - `count customer_profile` 返回 `n: 0`、`ok: 1.0`，requestId 为 `5e327c15-bd75-40f1-96a5-f0e244f1e93a`。
  - 验证结论：真实云数据库中 `customer_profile` 集合已存在且当前为空。
- 执行命令：
  - `npx --yes --package @cloudbase/cli tcb login`
  - `node .../node_modules/@cloudbase/cli/bin/tcb db nosql execute -e cloud1-d2gp2ayiwab8f8a94 --command '[{"TableName":"customer_profile","CommandType":"COMMAND","Command":"{\"create\":\"customer_profile\"}"}]' --json`
  - `node .../node_modules/@cloudbase/cli/bin/tcb db nosql execute -e cloud1-d2gp2ayiwab8f8a94 --command '[{"TableName":"customer_profile","CommandType":"COMMAND","Command":"{\"listCollections\":1,\"filter\":{\"name\":\"customer_profile\"}}"}]' --json`
  - `node .../node_modules/@cloudbase/cli/bin/tcb db nosql execute -e cloud1-d2gp2ayiwab8f8a94 --command '[{"TableName":"customer_profile","CommandType":"COMMAND","Command":"{\"count\":\"customer_profile\",\"query\":{}}"}]' --json`
- 改动文件：
  - `docs/backend/真实预约customer_profile集合缺失-20260621.md`
  - `docs/worklog.md`
- 未实测范围：
  - 未真实提交预约写入 `reservation`。
  - 未在微信开发者工具页面复测。
  - 未验证客户资料沉淀写入，因为本轮禁止写入非空测试数据。
- 剩余问题：
  - 真实 `api` 已部署，`customer_profile` 空集合已创建；仍需 QA/用户在真实页面重新提交预约验证业务链路。
  - 若下一次真实预约触发其它缺失业务集合，例如 `reservation`、`reservation_lock`、`user` 等，应按最小授权单独处理，不得一次性创建无关集合。
- 建议下一步负责 agent：
  - 测试工程师 Agent：在微信开发者工具真实页面复测预约提交，重点观察是否仍出现 `DATABASE_COLLECTION_NOT_EXIST customer_profile` 或新的集合缺失错误。
  - Codex 中枢：根据 QA 结果决定是否继续申请其它真实集合/测试数据授权。
- 是否触发暂停条件：
  - 否。本轮授权内的 CloudBase 登录、`customer_profile` 空集合创建和只读验证已完成。
