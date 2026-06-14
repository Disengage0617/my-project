# MVP数据模型与接口协议：台球厅私域运营小程序

## 1. 数据模型

所有业务表保留 `store_id`，即使 MVP 只有单店，也按门店隔离。

### user

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 用户ID |
| `openid` | string | 微信 openid |
| `nick_name` | string | 微信昵称，授权后写入 |
| `phone` | string | 手机号，授权后写入 |
| `avatar_url` | string | 头像 |
| `created_at` | string | 创建时间 |
| `updated_at` | string | 更新时间 |

### staff_user

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 员工ID |
| `store_id` | string | 门店ID |
| `openid` | string | 绑定微信 |
| `name` | string | 员工姓名 |
| `role` | enum | `staff` / `manager` / `owner` |
| `enabled` | boolean | 是否启用 |

### store

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 门店ID |
| `name` | string | 门店名 |
| `business_hours` | string | 固定为 `24小时营业` |
| `table_count` | number | 固定 40 |
| `reservation_lead_minutes` | number | 固定 30 |
| `no_show_lock_days` | number | 固定 3 |

### billiard_table

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 桌台ID |
| `store_id` | string | 门店ID |
| `code` | string | 桌号，如 A01 |
| `area` | string | 普台区、银腿区、独牙区、金腿区、玫瑰金区 |
| `type` | enum | 普台、乔氏银腿、独牙、乔氏金腿、乔氏玫瑰金 |
| `status` | enum | 空闲、已预约、使用中、清洁中、维修中、停用 |
| `enabled` | boolean | 是否启用 |

### reservation

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 预约ID |
| `store_id` | string | 门店ID |
| `openid` | string | 用户 openid |
| `table_id` | string | 桌台ID |
| `assistant_id` | string | 可选助教ID |
| `start_time` | string | ISO 时间 |
| `end_time` | string | ISO 时间 |
| `people_count` | number | 人数 |
| `status` | enum | 待确认、待到店、待核实、已到店、进行中、已完成、已取消、未到店、已释放 |
| `arrival_submitted_at` | string | 用户提交到店时间 |
| `arrival_confirmed_at` | string | 员工确认到店时间 |
| `opened_at` | string | 开台时间 |
| `closed_at` | string | 关台时间 |
| `no_show_locked_until` | string | 爽约限制结束时间 |

### no_show_record

| 字段 | 类型 | 说明 |
|---|---|---|
| `_id` | string | 记录ID |
| `store_id` | string | 门店ID |
| `openid` | string | 用户 openid |
| `reservation_id` | string | 关联预约 |
| `status` | enum | 限制中、已解除、已过期 |
| `lock_until` | string | 限制结束时间 |
| `operator_openid` | string | 操作员工 |
| `release_reason` | string | 店长解除原因 |

### assistant / assistant_reservation

`assistant` 保存助教资料、标签、价格、状态；`assistant_reservation` 保存助教单独预约或随桌台预约产生的助教需求。

助教预约状态：`待确认`、`已确认`、`已完成`、`已取消`。

### campaign / campaign_registration

`campaign` 保存商家发布的活动，支持名额、审核、上下架；`campaign_registration` 保存用户报名记录。

活动报名状态：`待审核`、`报名成功`、`已取消`。

## 2. P0 接口协议

云函数统一入口：`api`，入参：

```json
{
  "action": "createReservation",
  "payload": {}
}
```

返回：

```json
{
  "ok": true,
  "data": {}
}
```

错误：

```json
{
  "ok": false,
  "code": "TABLE_TIME_CONFLICT",
  "message": "该桌台当前时段已被预约"
}
```

### 首页与基础

| action | 说明 |
|---|---|
| `getStoreOverview` | 门店概览、空桌数、空闲助教数、活动 |
| `getAvailableTables` | 桌台列表 |
| `getAssistants` | 助教列表 |
| `getCampaigns` | 活动列表 |

### 预约

| action | 入参 | 规则 |
|---|---|---|
| `createReservation` | `storeId, tableId, assistantId, startTime, endTime, peopleCount, remark` | 至少提前 30 分钟；同桌时段不可冲突；命中未到限制则拒绝 |
| `getMyReservations` | `storeId` | 只返回当前 openid |
| `submitArrival` | `reservationId` | `待到店 -> 待核实` |
| `confirmArrival` | `reservationId` | `待核实 -> 已到店` |
| `rejectArrival` | `reservationId` | `待核实 -> 待到店` |
| `markNoShow` | `reservationId, reason` | `待到店/待核实 -> 未到店`，写入 3 天限制 |
| `openTable` | `reservationId` | `已到店 -> 进行中`，桌台变 `使用中` |
| `closeTable` | `reservationId, nextTableStatus` | `进行中 -> 已完成`，桌台变 `空闲` 或 `清洁中` |
| `releaseReservation` | `reservationId, reason` | 超时释放 |

### 助教

| action | 入参 | 规则 |
|---|---|---|
| `createAssistantReservation` | `storeId, assistantId, startTime, endTime, remark` | 支持单独预约；同助教时段不可冲突 |

### 活动

| action | 入参 | 规则 |
|---|---|---|
| `getCampaignDetail` | `campaignId` | 活动详情 |
| `createCampaignRegistration` | `campaignId, profile, remark` | `profile.nickName` 和 `profile.phone` 必填；满额拒绝；需审核进入待审核 |

## 3. 桌台默认配置

| 区域 | 数量 | 编号 | 桌型 |
|---|---:|---|---|
| 普台区 | 12 | A01-A12 | 普台 |
| 银腿区 | 10 | B01-B10 | 乔氏银腿 |
| 独牙区 | 8 | C01-C08 | 独牙 |
| 金腿区 | 6 | D01-D06 | 乔氏金腿 |
| 玫瑰金区 | 4 | E01-E04 | 乔氏玫瑰金 |

