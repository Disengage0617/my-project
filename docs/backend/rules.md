# 台球厅私域运营小程序 MVP 后端规则

## 1. MVP 后端边界

- 一期不接支付、定金、退款、储值卡。
- 一期不接灯控、门禁、收银硬件，不做桌台二维码。
- 桌台状态由“用户提交到店 + 员工核实 + 员工开关台”驱动。
- 预约、助教、活动报名都必须由服务端做最终校验。
- 所有查询与写入必须按 `store_id` 隔离。

## 2. 预约创建规则

创建桌台预约按以下顺序校验：

1. 用户已登录。
2. 门店存在且启用。
3. 用户不在有效爽约限制期内。
4. 桌台存在、属于该门店、已启用，且状态不是 `repairing` / `disabled`。
5. `start_time >= now + min_advance_minutes`，MVP 默认 `30` 分钟。
6. `end_time > start_time`。
7. 预约时长满足门店配置：`min_duration_minutes <= duration <= max_duration_minutes`。
8. 时间粒度满足 `slot_step_minutes`，建议默认 30 分钟。
9. 获取短时锁。
10. 校验桌台时间冲突。
11. 如同时预约助教，校验助教可约与时间冲突。
12. 计算预计价格。
13. 创建预约，默认状态为 `pending_arrival`。
14. 更新客户档案预约次数与最近预约时间。

待产品确认项：
- 每次预约最短时长。
- 每次预约最长时长。
- 超时保留时间。
- 用户是否可主动取消预约。

后端建议默认值：

| 配置 | 默认值 |
|---|---:|
| `min_advance_minutes` | 30 |
| `hold_minutes` | 15 |
| `min_duration_minutes` | 60 |
| `max_duration_minutes` | 240 |
| `slot_step_minutes` | 30 |
| `no_show_ban_days` | 3 |
| `allow_user_cancel` | false |

## 3. 桌台冲突规则

同一门店、同一桌台，存在有效预约且时间区间重叠时，判定冲突。

冲突表达式：

```text
new_start < existing_end AND new_end > existing_start
```

有效冲突状态：

```text
pending_confirm
pending_arrival
pending_verify
arrived
in_progress
```

不参与冲突状态：

```text
completed
canceled
no_show
released
```

必须在这些场景执行冲突校验：

- 创建预约。
- 改期预约，P1。
- 更换桌台，P1。
- 开台前兜底校验。
- 释放超时预约后的重新预约。

并发控制：

- 创建预约前生成 `reservation_lock`。
- `lock_key` 建议：`table:{store_id}:{table_id}:{start_time}:{end_time}`。
- 锁过期时间建议 30-60 秒。
- 拿不到锁直接返回 `RESERVATION_CONFLICT` 或 `LOCK_BUSY`。
- 写入预约后释放锁；异常时依赖 TTL 清理。

## 4. 助教冲突规则

助教可单独预约，也可随桌台预约。

同一门店、同一助教，存在有效助教预约且时间区间重叠时，判定冲突。

冲突表达式：

```text
new_start < existing_end AND new_end > existing_start
```

有效冲突状态：

```text
pending_confirm
confirmed
serving
```

不参与冲突状态：

```text
completed
canceled
no_show
```

助教预约创建规则：

1. 用户已登录。
2. 助教存在、属于该门店、已启用。
3. 助教当前状态允许预约，MVP 建议仅 `idle` 可约。
4. 校验服务时间合法。
5. 获取助教短锁。
6. 校验助教时间冲突。
7. 创建助教预约，默认 `pending_confirm`。

随桌台预约助教：

- 在 `createReservation` 中同时传 `assistant_id`。
- 后端必须在同一事务内校验桌台冲突和助教冲突。
- 任一资源冲突，整单失败，不创建半成品。
- 创建成功后，桌台预约关联 `assistant_reservation_id`。

助教单独预约：

- 不要求绑定 `reservation_id`。
- 仍需员工或商家确认。
- 不影响桌台冲突校验。

## 5. 爽约限制规则

触发条件：

- 员工调用 `markNoShow`，将预约标记为 `no_show`。

处理动作：

1. 预约状态变为 `no_show`。
2. 释放该预约对桌台时段的占用。
3. 写入 `no_show_record`。
4. `ban_start_at = now`。
5. `ban_end_at = now + 3 days`。
6. `status = active`。
7. 更新 `customer_profile.no_show_count`。

创建预约前限制校验：

```text
存在 no_show_record
AND status = active
AND ban_start_at <= now
AND ban_end_at > now
```

命中后拒绝预约，返回 `NO_SHOW_BANNED`，并带上限制结束时间。

解除规则：

- 仅 `manager` / `admin` 可解除。
- 必须填写原因。
- 解除后 `status = lifted`。
- 必须记录 `lifted_by`、`lifted_at`、`lift_reason`。
- 必须写入 `audit_log`。

说明：
- `releaseReservation` 只表示释放超时预约，不自动写入爽约限制。
- 是否将超时释放自动视为爽约，当前待产品确认；MVP 建议由员工手动 `markNoShow`。

## 6. 预约状态机约束

### 预约状态

| 状态 | 中文 | 说明 |
|---|---|---|
| `pending_confirm` | 待确认 | 可选流程，需员工确认预约 |
| `pending_arrival` | 待到店 | 用户预约成功，等待到店 |
| `pending_verify` | 待核实 | 用户点击“我已到店” |
| `arrived` | 已到店 | 员工核实通过 |
| `in_progress` | 进行中 | 员工已开台 |
| `completed` | 已完成 | 员工关台完成 |
| `canceled` | 已取消 | 预约取消，P1 |
| `no_show` | 未到店 | 员工标记未到 |
| `released` | 已释放 | 超时或人工释放 |

### 允许流转

| 操作 | 来源状态 | 目标状态 | 操作人 |
|---|---|---|---|
| 创建预约 | 无 | `pending_arrival` | 用户 |
| 创建需确认预约 | 无 | `pending_confirm` | 用户 |
| 员工确认预约 | `pending_confirm` | `pending_arrival` | 员工及以上 |
| 用户提交到店 | `pending_arrival` | `pending_verify` | 预约本人 |
| 员工确认到店 | `pending_verify` | `arrived` | 员工及以上 |
| 员工驳回到店 | `pending_verify` | `pending_arrival` | 员工及以上 |
| 员工开台 | `arrived` | `in_progress` | 员工及以上 |
| 员工关台 | `in_progress` | `completed` | 员工及以上 |
| 员工标记未到 | `pending_arrival` / `pending_verify` / `arrived` | `no_show` | 员工及以上 |
| 释放预约 | `pending_arrival` / `pending_verify` | `released` | 员工及以上/定时任务 |
| 用户取消 | `pending_confirm` / `pending_arrival` | `canceled` | 预约本人，P1 |

禁止规则：

- `completed`、`canceled`、`no_show`、`released` 为终态，不允许继续开台。
- 未 `arrived` 的预约不能开台。
- 未 `in_progress` 的预约不能关台。
- 用户不能直接把预约改成 `arrived`、`in_progress`、`completed`、`no_show`。

## 7. 桌台状态约束

桌台状态：

| 状态 | 中文 | 说明 |
|---|---|---|
| `idle` | 空闲 | 可预约 |
| `reserved` | 已预约 | 有未来有效预约 |
| `in_use` | 使用中 | 已开台 |
| `cleaning` | 清洁中 | 关台后待清洁 |
| `repairing` | 维修中 | 不可预约 |
| `disabled` | 停用 | 不可预约 |

联动规则：

- 创建未来预约后，桌台当前状态不一定立即变为 `reserved`；首页可通过有效预约计算“已预约”展示。
- 员工开台成功后，桌台状态必须变为 `in_use`。
- 员工关台成功后，桌台状态必须变为 `idle` 或 `cleaning`。
- 员工手动切换桌台状态必须写 `table_status_log`。
- 桌台处于 `repairing` / `disabled` 时，不允许创建新预约。
- 桌台处于 `in_use` 时，不允许创建与当前使用时间重叠的预约。

## 8. 助教状态机约束

助教当前状态：

| 状态 | 中文 | 是否可约 |
|---|---|---:|
| `off_shift` | 未上班 | 否 |
| `idle` | 空闲 | 是 |
| `reserved` | 已预约 | 否，除非预约时段不冲突 |
| `serving` | 上钟中 | 否 |
| `resting` | 休息中 | 否 |
| `checked_out` | 已下班 | 否 |

助教预约状态：

| 状态 | 中文 |
|---|---|
| `pending_confirm` | 待确认 |
| `confirmed` | 已确认 |
| `serving` | 服务中 |
| `completed` | 已完成 |
| `canceled` | 已取消 |
| `no_show` | 未到 |

允许流转：

| 操作 | 来源状态 | 目标状态 |
|---|---|---|
| 创建助教预约 | 无 | `pending_confirm` |
| 员工确认 | `pending_confirm` | `confirmed` |
| 开始服务 | `confirmed` | `serving` |
| 完成服务 | `serving` | `completed` |
| 取消 | `pending_confirm` / `confirmed` | `canceled` |
| 标记未到 | `pending_confirm` / `confirmed` | `no_show` |

## 9. 活动报名规则

报名创建前校验：

1. 用户已登录。
2. 活动存在、属于该门店、状态为 `published`。
3. 当前时间在活动报名允许范围内。
4. 用户已授权微信昵称。
5. 用户已授权手机号。
6. 若活动限会员，则校验会员身份，MVP 可先预留。
7. 若限制名额，则校验剩余名额。
8. 同一用户是否可重复报名，MVP 默认不允许。

限额扣减：

- 使用事务或 `campaign` 资源短锁。
- 判断 `quota_used + participant_count <= quota_total`。
- 成功后递增 `quota_used`。
- 失败返回 `CAMPAIGN_FULL`。

报名状态：

- `need_review = true`：创建后 `pending_review`。
- `need_review = false`：创建后 `approved`。

一期不做：

- 在线支付。
- 优惠券核销。
- 复杂报名审核流。

## 10. 权限约束

角色：

| 角色 | 说明 |
|---|---|
| `user` | 普通顾客 |
| `staff` | 员工 |
| `manager` | 店长/商家 |
| `admin` | 管理员 |

关键权限：

| 动作 | 最低角色 |
|---|---|
| 创建自己的预约 | `user` |
| 提交自己的到店 | `user` |
| 查看今日预约 | `staff` |
| 确认到店、驳回到店 | `staff` |
| 标记未到、开台、关台 | `staff` |
| 修改桌台状态 | `staff` |
| 管理门店/桌台/价格 | `manager` |
| 管理活动/助教 | `manager` |
| 查看客户列表 | `staff` |
| 查看完整手机号、导出客户 | `manager` |
| 解除爽约限制 | `manager` |

手机号脱敏：

- `staff` 查看手机号默认返回 `138****0000`。
- `manager` / `admin` 可看完整手机号。
- 普通员工不允许导出客户手机号。

## 11. 审计与日志

必须写 `audit_log` 的操作：

- 门店配置变更。
- 桌台新增、编辑、停用。
- 价格规则变更。
- 活动发布、下架、修改名额。
- 助教资料变更。
- 解除爽约限制。
- 客户手机号导出，若后续支持。

必须写业务流水的操作：

- 桌台状态变更写 `table_status_log`。
- 助教状态变更写 `assistant_status_log`。
- 预约状态变更更新预约时间戳和操作人。

## 12. 测试验收重点

- 提前 30 分钟以内预约被拒绝。
- 提前 30 分钟以外预约成功。
- 同桌同时间段重复预约被拒绝。
- 并发提交同桌同时间只有一单成功。
- 用户提交到店后，预约进入 `pending_verify`。
- 员工确认到店后，预约进入 `arrived`。
- 只有 `arrived` 可开台。
- 开台后预约进入 `in_progress`，桌台进入 `in_use`。
- 关台后预约进入 `completed`，桌台进入 `idle` 或 `cleaning`。
- 员工标记未到后，用户 3 天内不可预约。
- 店长解除限制后，用户可再次预约。
- 助教同时间重复预约被拒绝。
- 活动报名未授权手机号被拒绝。
- 活动满额后不可继续报名。
- 普通员工不可查看完整手机号或导出客户手机号。
