# 台球厅私域运营小程序 MVP 数据模型

## 1. 通用约定

- 数据库按云开发集合/表设计，字段命名使用 `snake_case`。
- 所有业务表必须包含 `store_id`，即使 MVP 只有单门店，也按门店隔离。
- 时间字段统一存储服务端时间戳：`created_at`、`updated_at`、业务时间字段。
- 软删除使用 `is_deleted`，配置类数据默认不物理删除。
- 金额统一使用分：`price_cent`、`amount_cent`。
- 状态字段使用英文枚举，前端自行映射中文。

## 2. 用户与权限

### user

用户微信身份与授权信息。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 用户 ID |
| openid | string | 是 | 微信 openid，唯一 |
| unionid | string | 否 | 微信 unionid |
| nickname | string | 否 | 微信昵称，活动报名前需授权 |
| avatar_url | string | 否 | 头像 |
| phone | string | 否 | 授权手机号 |
| phone_authorized_at | timestamp | 否 | 手机号授权时间 |
| default_store_id | string | 否 | 默认门店 |
| status | enum | 是 | `active` / `blocked` |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 唯一索引：`openid`
- 普通索引：`phone`

### staff_user

员工、店长、管理员与门店权限。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 员工账号 ID |
| user_id | string | 是 | 关联 `user._id` |
| store_id | string | 是 | 所属门店 |
| role | enum | 是 | `staff` / `manager` / `admin` |
| display_name | string | 是 | 员工姓名 |
| phone | string | 否 | 员工手机号 |
| status | enum | 是 | `active` / `disabled` |
| permissions | array | 否 | 扩展权限点 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 唯一索引：`store_id + user_id`
- 普通索引：`store_id + role + status`

## 3. 门店与配置

### store

门店基础信息与预约规则。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 门店 ID |
| name | string | 是 | 门店名称 |
| address | string | 否 | 地址 |
| phone | string | 否 | 门店电话 |
| business_hours | object | 是 | MVP 默认 24 小时营业 |
| booking_rule | object | 是 | 预约规则 |
| status | enum | 是 | `active` / `disabled` |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

`booking_rule` 建议结构：

```json
{
  "min_advance_minutes": 30,
  "hold_minutes": 15,
  "min_duration_minutes": 60,
  "max_duration_minutes": 240,
  "slot_step_minutes": 30,
  "no_show_ban_days": 3,
  "allow_user_cancel": false
}
```

说明：
- `min_duration_minutes`、`max_duration_minutes`、`hold_minutes` 当前待产品确认，后端先做可配置。
- `allow_user_cancel` MVP 可默认关闭，P1 再开放用户主动取消。

### billiard_table

桌台基础配置。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 桌台 ID |
| store_id | string | 是 | 门店 ID |
| table_no | string | 是 | 桌号，如 `PT-01` |
| table_type | enum | 是 | `standard` / `silver` / `duya` / `gold` / `rose_gold` |
| table_type_name | string | 是 | 普台、乔氏银腿等 |
| area_name | string | 是 | 区域名称 |
| status | enum | 是 | `idle` / `reserved` / `in_use` / `cleaning` / `repairing` / `disabled` |
| enabled | boolean | 是 | 是否启用 |
| sort_order | number | 否 | 展示排序 |
| remark | string | 否 | 备注 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 唯一索引：`store_id + table_no`
- 普通索引：`store_id + table_type + status + enabled`

### table_status_log

桌台状态流水。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 流水 ID |
| store_id | string | 是 | 门店 ID |
| table_id | string | 是 | 桌台 ID |
| reservation_id | string | 否 | 关联预约 |
| from_status | enum | 否 | 变更前状态 |
| to_status | enum | 是 | 变更后状态 |
| operator_user_id | string | 是 | 操作人 |
| operator_role | enum | 是 | 操作角色 |
| reason | string | 否 | 原因 |
| created_at | timestamp | 是 | 创建时间 |

索引：
- 普通索引：`store_id + table_id + created_at`
- 普通索引：`store_id + reservation_id`

### price_rule

价格规则。支持按桌型、时段、会员等级配置。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 价格规则 ID |
| store_id | string | 是 | 门店 ID |
| target_type | enum | 是 | `table` / `assistant` / `package` |
| table_type | enum | 否 | 桌型价格时必填 |
| assistant_id | string | 否 | 助教单独价格时可填 |
| start_time_of_day | string | 否 | 日内开始，如 `18:00` |
| end_time_of_day | string | 否 | 日内结束，如 `24:00` |
| price_cent | number | 是 | 每单位价格，单位分 |
| unit | enum | 是 | `hour` / `session` |
| member_level | enum | 否 | `normal` / `stored` 等 |
| discount_rate | number | 否 | 折扣，如 `0.9` |
| enabled | boolean | 是 | 是否启用 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 普通索引：`store_id + target_type + enabled`
- 普通索引：`store_id + table_type + start_time_of_day`

## 4. 预约闭环

### reservation

桌台预约主表。若随桌预约助教，可通过 `assistant_reservation_id` 或独立助教预约关联。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 预约 ID |
| store_id | string | 是 | 门店 ID |
| user_id | string | 是 | 预约用户 |
| table_id | string | 是 | 桌台 ID |
| table_type | enum | 是 | 冗余桌型，便于查询 |
| start_time | timestamp | 是 | 预约开始 |
| end_time | timestamp | 是 | 预约结束 |
| people_count | number | 否 | 人数 |
| assistant_required | boolean | 是 | 是否需要助教 |
| assistant_reservation_id | string | 否 | 关联助教预约 |
| estimated_amount_cent | number | 否 | 预计费用 |
| status | enum | 是 | 见状态机 |
| arrival_submitted_at | timestamp | 否 | 用户提交到店时间 |
| confirmed_at | timestamp | 否 | 员工确认预约时间 |
| arrival_confirmed_at | timestamp | 否 | 员工确认到店时间 |
| opened_at | timestamp | 否 | 开台时间 |
| closed_at | timestamp | 否 | 关台时间 |
| canceled_at | timestamp | 否 | 取消时间 |
| released_at | timestamp | 否 | 释放时间 |
| no_show_at | timestamp | 否 | 标记未到时间 |
| operator_user_id | string | 否 | 最近操作员工 |
| remark | string | 否 | 用户备注 |
| internal_remark | string | 否 | 员工备注 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

状态枚举：
- `pending_confirm`：待确认
- `pending_arrival`：待到店
- `pending_verify`：待核实
- `arrived`：已到店
- `in_progress`：进行中
- `completed`：已完成
- `canceled`：已取消
- `no_show`：未到店
- `released`：已释放

索引：
- 普通索引：`store_id + user_id + start_time`
- 普通索引：`store_id + table_id + start_time + end_time`
- 普通索引：`store_id + status + start_time`

强约束：
- 创建、改期、开台前必须按 `table_id` 做重叠区间冲突校验。
- 参与冲突的有效状态：`pending_confirm`、`pending_arrival`、`pending_verify`、`arrived`、`in_progress`。

### reservation_lock

短时锁，防止同桌同时间并发撞单。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 锁 ID |
| store_id | string | 是 | 门店 ID |
| resource_type | enum | 是 | `table` / `assistant` / `campaign` |
| resource_id | string | 是 | 资源 ID |
| start_time | timestamp | 否 | 预约资源锁开始 |
| end_time | timestamp | 否 | 预约资源锁结束 |
| lock_key | string | 是 | 锁唯一键 |
| owner_user_id | string | 是 | 持锁人 |
| expires_at | timestamp | 是 | 过期时间 |
| created_at | timestamp | 是 | 创建时间 |

索引：
- 唯一索引：`lock_key`
- TTL/过期清理索引：`expires_at`

### no_show_record

未到店与限制记录。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 记录 ID |
| store_id | string | 是 | 门店 ID |
| user_id | string | 是 | 用户 ID |
| reservation_id | string | 是 | 触发预约 |
| ban_start_at | timestamp | 是 | 限制开始 |
| ban_end_at | timestamp | 是 | 限制结束，默认开始后 3 天 |
| status | enum | 是 | `active` / `lifted` / `expired` |
| lifted_by | string | 否 | 解除人，仅店长/管理员 |
| lifted_at | timestamp | 否 | 解除时间 |
| lift_reason | string | 否 | 解除原因 |
| created_at | timestamp | 是 | 创建时间 |

索引：
- 普通索引：`store_id + user_id + status + ban_end_at`
- 唯一索引建议：`reservation_id`

## 5. 助教

### assistant

助教资料与当前状态。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 助教 ID |
| store_id | string | 是 | 门店 ID |
| name | string | 是 | 助教名称 |
| avatar_url | string | 否 | 头像 |
| tags | array | 否 | 标签 |
| intro | string | 否 | 简介 |
| service_price_cent | number | 否 | 服务价格，待确认 |
| service_unit | enum | 否 | `hour` / `session`，待确认 |
| status | enum | 是 | `off_shift` / `idle` / `reserved` / `serving` / `resting` / `checked_out` |
| enabled | boolean | 是 | 是否启用 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 普通索引：`store_id + status + enabled`

### assistant_status_log

助教状态流水。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 流水 ID |
| store_id | string | 是 | 门店 ID |
| assistant_id | string | 是 | 助教 ID |
| from_status | enum | 否 | 原状态 |
| to_status | enum | 是 | 新状态 |
| operator_user_id | string | 是 | 操作人 |
| reason | string | 否 | 原因 |
| created_at | timestamp | 是 | 创建时间 |

### assistant_reservation

助教预约，支持单独预约或绑定桌台预约。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 助教预约 ID |
| store_id | string | 是 | 门店 ID |
| user_id | string | 是 | 用户 ID |
| assistant_id | string | 是 | 助教 ID |
| reservation_id | string | 否 | 绑定桌台预约 |
| start_time | timestamp | 是 | 服务开始 |
| end_time | timestamp | 是 | 服务结束 |
| status | enum | 是 | `pending_confirm` / `confirmed` / `serving` / `completed` / `canceled` / `no_show` |
| estimated_amount_cent | number | 否 | 预计费用 |
| remark | string | 否 | 用户备注 |
| operator_user_id | string | 否 | 最近操作员工 |
| confirmed_at | timestamp | 否 | 确认时间 |
| started_at | timestamp | 否 | 开始服务时间 |
| completed_at | timestamp | 否 | 完成时间 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 普通索引：`store_id + assistant_id + start_time + end_time`
- 普通索引：`store_id + user_id + start_time`

有效冲突状态：
- `pending_confirm`、`confirmed`、`serving`

## 6. 活动与客户沉淀

### campaign

活动配置。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 活动 ID |
| store_id | string | 是 | 门店 ID |
| title | string | 是 | 标题 |
| cover_url | string | 否 | 封面 |
| campaign_type | enum | 是 | `new_user` / `package` / `match` / `member` / `other` |
| start_time | timestamp | 是 | 活动开始 |
| end_time | timestamp | 是 | 活动结束 |
| content | string | 否 | 活动介绍 |
| rules | string | 否 | 规则 |
| quota_limited | boolean | 是 | 是否限额 |
| quota_total | number | 否 | 总名额 |
| quota_used | number | 是 | 已用名额 |
| need_review | boolean | 是 | 是否需要审核 |
| member_only | boolean | 是 | 是否仅会员 |
| status | enum | 是 | `draft` / `published` / `offline` / `ended` |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 普通索引：`store_id + status + start_time`

### campaign_registration

活动报名。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 报名 ID |
| store_id | string | 是 | 门店 ID |
| campaign_id | string | 是 | 活动 ID |
| user_id | string | 是 | 用户 ID |
| nickname | string | 是 | 报名昵称 |
| phone | string | 是 | 联系手机号 |
| participant_count | number | 是 | 报名人数，默认 1 |
| status | enum | 是 | `pending_review` / `approved` / `rejected` / `canceled` |
| form_data | object | 否 | 扩展报名信息 |
| reviewed_by | string | 否 | 审核人 |
| reviewed_at | timestamp | 否 | 审核时间 |
| reject_reason | string | 否 | 审核拒绝原因 |
| quota_reserved | boolean | 否 | 是否已占用活动名额，用于拒绝/取消时回退 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 唯一索引建议：`campaign_id + user_id`
- 普通索引：`store_id + campaign_id + status`

### customer_profile

客户沉淀档案。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 档案 ID |
| store_id | string | 是 | 门店 ID |
| user_id | string | 是 | 用户 ID |
| phone | string | 否 | 授权手机号 |
| nickname | string | 否 | 昵称 |
| reservation_count | number | 是 | 预约次数 |
| completed_count | number | 是 | 到店完成次数 |
| no_show_count | number | 是 | 未到店次数 |
| campaign_count | number | 是 | 活动报名次数 |
| last_reservation_at | timestamp | 否 | 最近预约时间 |
| last_arrival_at | timestamp | 否 | 最近到店时间 |
| preferred_table_type | enum | 否 | 偏好桌型 |
| tags | array | 否 | 标签 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 唯一索引：`store_id + user_id`
- 普通索引：`store_id + phone`

### member_account

会员/储值账户。第一期只读展示余额，不接微信支付和充值。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 账户 ID |
| store_id | string | 是 | 门店 ID |
| user_id | string | 是 | 用户 ID |
| balance_cent | number | 是 | 储值余额，单位分 |
| member_level_name | string | 否 | 会员等级展示名 |
| stored_value_enabled | boolean | 是 | 是否展示储值能力 |
| payment_enabled | boolean | 否 | 是否启用支付；MVP 一期为 false |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 唯一索引：`store_id + user_id`

### coupon

用户优惠券。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 优惠券 ID |
| store_id | string | 是 | 门店 ID |
| user_id | string | 是 | 用户 ID |
| title | string | 是 | 优惠券标题 |
| status | enum | 是 | `available` / `used` / `expired` |
| amount_cent | number | 否 | 优惠金额，单位分 |
| valid_from | timestamp | 否 | 生效时间 |
| valid_to | timestamp | 否 | 失效时间 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 普通索引：`store_id + user_id + status`

### order

用户订单/消费记录。第一期仅展示已有订单，不发起支付。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 订单 ID |
| store_id | string | 是 | 门店 ID |
| user_id | string | 是 | 用户 ID |
| title | string | 是 | 订单标题 |
| order_type | enum | 否 | `reservation` / `assistant` / `stored_value` / `other` |
| amount_cent | number | 否 | 订单金额，单位分 |
| status | enum | 是 | `pending` / `paid` / `completed` / `canceled` / `refunded` |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 普通索引：`store_id + user_id + created_at`

### audit_log

关键操作审计。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 日志 ID |
| store_id | string | 是 | 门店 ID |
| operator_user_id | string | 是 | 操作人 |
| operator_role | enum | 是 | 操作角色 |
| action | string | 是 | 操作名 |
| target_type | string | 是 | 目标类型 |
| target_id | string | 否 | 目标 ID |
| before | object | 否 | 变更前 |
| after | object | 否 | 变更后 |
| reason | string | 否 | 原因 |
| created_at | timestamp | 是 | 创建时间 |

索引：
- 普通索引：`store_id + action + created_at`
- 普通索引：`store_id + operator_user_id + created_at`

## 7. Web 后台与页面配置

### page_config

小程序页面配置，由 Web 后台编辑，小程序端读取 `published` 版本。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 配置 ID，建议 `store_id + page_key + status` |
| store_id | string | 是 | 门店 ID |
| page_key | string | 是 | 页面标识，例如 `home` |
| status | enum | 是 | `draft` / `published` |
| theme | object | 否 | 主题配置 |
| modules | array | 是 | 页面模块列表 |
| published_at | timestamp | 否 | 发布时间 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

`modules` 常用字段：
- `id`：模块 ID。
- `type`：模块类型，例如 `hero`、`activity_entry`、`assistant_entry`。
- `enabled`：是否启用。
- `sort_order`：排序。
- `title` / `subtitle` / `image_url` / `link`：展示内容。

索引：
- 普通索引：`store_id + page_key + status`

### asset

素材库，供 Web 后台上传/选择图片并绑定到页面配置、活动、助教等业务对象。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| _id | string | 是 | 素材 ID |
| store_id | string | 是 | 门店 ID |
| name | string | 是 | 素材名称 |
| type | enum | 是 | `hero` / `campaign` / `assistant` / `other` |
| url | string | 是 | 访问地址 |
| file_id | string | 否 | 云存储 fileID |
| status | enum | 是 | `active` / `deleted` |
| is_deleted | boolean | 是 | 是否软删除 |
| created_at | timestamp | 是 | 创建时间 |
| updated_at | timestamp | 是 | 更新时间 |

索引：
- 普通索引：`store_id + type + created_at`
- 普通索引：`store_id + status + created_at`
