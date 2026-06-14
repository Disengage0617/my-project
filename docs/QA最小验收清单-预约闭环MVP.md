# QA最小验收清单：预约闭环 MVP

## 1. 本地自动化

- `npm test` 在 `cloudfunctions/api` 下通过。
- 预约时间规则通过：30 分钟内拒绝，30 分钟外允许，结束时间必须晚于开始时间。
- 同桌同时间段重复预约被拒绝。
- 短锁占用时创建预约返回 `LOCK_BUSY`。
- 桌台维修中或停用时不可创建预约。
- 创建预约可同时创建助教预约，并回写 `assistant_reservation_id`。

## 2. 用户预约闭环

- 用户创建预约后进入待到店状态。
- 仅预约本人可提交到店。
- 提交到店后进入待核实状态。
- 普通用户不能确认到店、开台、关台、标记未到。

## 3. 员工工作台闭环

- 只有本门店启用员工可查看/处理工作台预约。
- 跨门店员工处理预约返回 `FORBIDDEN`。
- 员工确认到店后预约进入已到店。
- 员工开台后预约进入进行中，桌台进入使用中，并写入 `table_status_log`。
- 员工关台后预约进入已完成，桌台进入空闲或清洁中，并写入 `table_status_log`。
- 员工状态变更写入 `audit_log`。

## 4. 爽约闭环

- 员工可将待到店、待核实、已到店预约标记为未到店。
- 标记未到店后写入 `no_show_record`。
- 用户在限制期内再次预约返回 `NO_SHOW_LOCKED`。
- 限制过期后用户可再次预约。
- 仅店长及以上可解除爽约限制。
- 解除爽约限制必须填写原因，并写入 `lifted_by`、`lifted_at`、`lift_reason` 和 `audit_log`。

## 5. 真实云环境联调

- 确认云数据库已初始化 `store`、`billiard_table`、`assistant`、`campaign`。
- 为测试员工 openid 写入 `staff_user`，字段至少包含 `store_id`、`openid`、`role`、`enabled`。
- 确认云数据库存在或自动创建集合：`reservation`、`assistant_reservation`、`reservation_lock`、`no_show_record`、`table_status_log`、`audit_log`。
- 用真实用户 openid 完成：创建预约 -> 提交到店 -> 员工确认到店 -> 开台 -> 关台。
- 用普通用户 openid 调员工接口，确认返回 `FORBIDDEN`。
- 用店长 openid 完成：标记未到 -> 预约被限制 -> 解除限制 -> 再次预约成功。

## 6. 暂未进入本轮的 P1

- 活动报名名额的事务扣减。
- 助教确认、服务中、完成的完整状态机。
- 用户主动取消、改期、更换桌台。
- 支付、储值、灯控、收银硬件。
