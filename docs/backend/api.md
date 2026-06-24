# 台球厅私域运营小程序 MVP 云函数接口协议

## 1. 通用协议

### 调用约定

- 云函数命名使用小驼峰，如 `createReservation`。
- 入参统一包含 `store_id`，登录类接口除外。
- 所有写接口必须在服务端校验当前用户身份、角色、门店权限。
- 所有写接口成功后返回最新业务对象或关键 ID。

### 通用响应

```json
{
  "ok": true,
  "data": {}
}
```

失败响应：

```json
{
  "ok": false,
  "code": "RESERVATION_CONFLICT",
  "message": "该桌台当前时段已被预约"
}
```

说明：当前云函数入口 `cloudfunctions/api/index.js` 统一读取 `{ action, payload }`，成功返回 `{ ok: true, data }`，失败返回 `{ ok: false, code, message }`。各 action 文档中的“出参”均为 `data` 内部结构。

### 通用错误码

| 错误码 | 说明 |
|---|---|
| `UNAUTHORIZED` | 未登录 |
| `FORBIDDEN` | 无权限 |
| `INVALID_PARAMS` | 参数错误 |
| `STORE_NOT_FOUND` | 门店不存在 |
| `RESOURCE_NOT_FOUND` | 资源不存在 |
| `RESOURCE_DISABLED` | 资源已停用 |
| `RESERVATION_TOO_EARLY` | 未满足提前 30 分钟 |
| `RESERVATION_DURATION_INVALID` | 预约时长不合法 |
| `RESERVATION_CONFLICT` | 桌台预约冲突 |
| `ASSISTANT_CONFLICT` | 助教预约冲突 |
| `NO_SHOW_BANNED` | 爽约限制中 |
| `STATE_TRANSITION_INVALID` | 状态流转不允许 |
| `CAMPAIGN_FULL` | 活动名额已满 |
| `PHONE_REQUIRED` | 需要手机号授权 |
| `NICKNAME_REQUIRED` | 需要微信昵称授权 |

## 2. 登录与角色

### loginByWechat

微信登录，创建或更新用户。当前本地测试入口依赖云函数上下文 `OPENID`，也兼容测试 payload 中的 `openid`；真实微信登录以云函数上下文为准，不把本地 seam 当作真实云端验收。

入参：

```json
{
  "code": "wx-login-code"
}
```

出参：

```json
{
  "user": {
    "_id": "user_001",
    "openid": "openid",
    "nickname": "用户昵称",
    "phone": "13800000000"
  },
  "token": "session-token"
}
```

### authorizePhone

手机号授权。当前 P0 本地可测入口接受 `phone` / `phoneNumber` / `purePhoneNumber` 写入 `user`，并在传入 `store_id` 时同步 `customer_profile`；真实微信手机号解密需在云端联调阶段接入，不能用本地传参冒充真实授权验收。

入参：

```json
{
  "encrypted_data": "...",
  "iv": "..."
}
```

出参：

```json
{
  "phone": "13800000000",
  "phone_authorized_at": 1781341200000
}
```

### getCurrentRole

获取当前用户在指定门店的角色。

入参：

```json
{
  "store_id": "store_001"
}
```

权限：登录用户。无员工记录时返回 `role=user`、空权限。

出参：

```json
{
  "role": "manager",
  "permissions": ["reservation.write", "table.write"],
  "staff_user": {
    "_id": "staff_001",
    "display_name": "店长"
  }
}
```

## 3. 首页、门店与价格

### getStoreOverview

用户首页概览。

入参：

```json
{
  "store_id": "store_001"
}
```

出参：

```json
{
  "store": {
    "_id": "store_001",
    "name": "某某台球厅",
    "business_hours_text": "24小时营业"
  },
  "idle_table_count": 12,
  "idle_assistant_count": 3,
  "campaigns": [
    {
      "_id": "campaign_001",
      "title": "新人活动",
      "cover_url": "cloud://..."
    }
  ]
}
```

### getStoreDetail

门店详情和预约规则。

入参：

```json
{
  "store_id": "store_001"
}
```

出参：

```json
{
  "_id": "store_001",
  "name": "某某台球厅",
  "address": "门店地址",
  "phone": "门店电话",
  "business_hours": {
    "mode": "24h"
  },
  "booking_rule": {
    "min_advance_minutes": 30,
    "hold_minutes": 15,
    "min_duration_minutes": 60,
    "max_duration_minutes": 240
  }
}
```

### getPriceRules

获取价格规则。

入参：

```json
{
  "store_id": "store_001",
  "target_type": "table"
}
```

出参：

```json
{
  "rules": [
    {
      "table_type": "standard",
      "table_type_name": "普台",
      "start_time_of_day": "00:00",
      "end_time_of_day": "08:00",
      "price_cent": 2800,
      "unit": "hour"
    }
  ]
}
```

## 4. 桌台预约

### getAvailableTables

查询指定时段可约桌台。

入参：

```json
{
  "store_id": "store_001",
  "start_time": 1781344800000,
  "end_time": 1781348400000,
  "table_type": "standard"
}
```

出参：

```json
{
  "tables": [
    {
      "_id": "table_001",
      "table_no": "PT-01",
      "table_type": "standard",
      "table_type_name": "普台",
      "area_name": "普台区",
      "status": "idle",
      "available": true
    }
  ]
}
```

### createReservation

创建桌台预约。服务端必须执行爽约限制、提前时间、时长、桌台状态、短锁、冲突校验。

入参：

```json
{
  "store_id": "store_001",
  "table_id": "table_001",
  "start_time": 1781344800000,
  "end_time": 1781348400000,
  "people_count": 2,
  "assistant_required": false,
  "assistant_id": null,
  "remark": "靠窗优先"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "pending_arrival",
    "table_id": "table_001",
    "start_time": 1781344800000,
    "end_time": 1781348400000,
    "estimated_amount_cent": 3800
  }
}
```

说明：
- MVP 创建成功后默认进入 `pending_arrival`。
- 如门店打开人工确认，可进入 `pending_confirm`，再由员工 `confirmReservation` 转为 `pending_arrival`。
- 如果同时传入 `assistant_id`，需在同一事务内创建助教预约并校验助教冲突。

### getMyReservations

我的预约列表。

入参：

```json
{
  "store_id": "store_001",
  "status": "pending_arrival",
  "page": 1,
  "page_size": 20
}
```

出参：

```json
{
  "items": [
    {
      "_id": "reservation_001",
      "status": "pending_arrival",
      "table_no": "PT-01",
      "table_type_name": "普台",
      "start_time": 1781344800000,
      "end_time": 1781348400000
    }
  ],
  "total": 1
}
```

### getReservationDetail

预约详情。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001"
}
```

出参：

```json
{
  "_id": "reservation_001",
  "status": "pending_arrival",
  "tableCode": "PT-01",
  "table_code": "PT-01",
  "tableType": "普台",
  "table_type_name": "普台",
  "table": {
    "_id": "table_001",
    "table_id": "table_001",
    "table_no": "PT-01",
    "code": "PT-01",
    "name": "PT-01",
    "table_type": "standard",
    "table_type_name": "普台",
    "area_name": "普通区",
    "status": "idle",
    "enabled": true
  },
  "start_time": 1781344800000,
  "end_time": 1781348400000,
  "booking_rule": {
    "hold_minutes": 15,
    "allow_user_cancel": false
  }
}
```

说明：

- `table` 为后端补齐的桌台摘要，用于详情页展示桌台编号、桌型、区域和状态。
- `tableCode/table_code/tableType/table_type_name` 为兼容前端详情页的顶层别名，避免页面只能回退显示 `table_id`。
- 如果桌台记录不存在或不属于同一门店，`table` 返回 `null`，顶层桌台编号回退为 `table_id`。

### confirmReservation

员工确认预约。可选流程，默认 MVP 可跳过。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "pending_arrival"
  }
}
```

### submitArrival

用户提交“我已到店”。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "pending_verify",
    "arrival_submitted_at": 1781344700000
  }
}
```

约束：
- 仅预约本人可调用。
- 仅允许 `pending_arrival -> pending_verify`。

### confirmArrival

员工确认到店。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001",
  "remark": "已核实"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "arrived"
  }
}
```

约束：
- 仅允许 `pending_verify -> arrived`。

### rejectArrival

员工驳回用户误点到店。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001",
 "reason": "用户误点"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "pending_arrival"
  }
}
```

### markNoShow

员工标记未到店，并写入 3 天限制。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001",
  "reason": "预约未到店"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "no_show"
  },
  "no_show_record": {
    "_id": "no_show_001",
    "ban_end_at": 1781604000000,
    "status": "active"
  }
}
```

约束：
- 仅允许 `pending_arrival`、`pending_verify`、`arrived` 转为 `no_show`。
- 同步释放桌台预约占用。

### openTable

员工开台。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "in_progress"
  },
  "table": {
    "_id": "table_001",
    "status": "in_use"
  }
}
```

约束：
- 仅允许 `arrived -> in_progress`。
- 桌台必须未处于 `repairing` / `disabled`。
- 写入 `table_status_log`。

### closeTable

员工关台。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001",
  "next_table_status": "cleaning"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "completed"
  },
  "table": {
    "_id": "table_001",
    "status": "cleaning"
  }
}
```

约束：
- 仅允许 `in_progress -> completed`。
- `next_table_status` 只能为 `idle` 或 `cleaning`。
- 写入 `table_status_log`。

### releaseReservation

释放超时未到店预约。

权限：`staff` 及以上；定时任务也可调用。

入参：

```json
{
  "store_id": "store_001",
  "reservation_id": "reservation_001",
  "reason": "超时未到店"
}
```

出参：

```json
{
  "reservation": {
    "_id": "reservation_001",
    "status": "released"
  }
}
```

约束：
- 仅允许 `pending_arrival`、`pending_verify` 释放。
- 释放不等同爽约；是否写入 `no_show_record` 由员工 `markNoShow` 决定。

## 5. 员工与桌台管理

### getTodayReservations

员工工作台今日预约。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "status": "pending_verify"
}
```

出参：

```json
{
  "items": [
    {
      "_id": "reservation_001",
      "status": "pending_verify",
      "table_no": "PT-01",
      "user_nickname": "用户昵称",
      "start_time": 1781344800000
    }
  ]
}
```

### updateTableStatus

手动切换桌台状态。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "table_id": "table_001",
  "to_status": "repairing",
  "reason": "球桌维修"
}
```

出参：

```json
{
  "table": {
    "_id": "table_001",
    "status": "repairing"
  }
}
```

约束：
- 若桌台存在有效预约或进行中预约，不能直接切到 `disabled`。
- 所有变更写入 `table_status_log`。

### manageStore / manageTables / managePriceRules

商家后台配置类接口，建议统一按 `action` 封装。

权限：`manager` / `admin`。

入参示例：

```json
{
  "store_id": "store_001",
  "action": "upsert",
  "payload": {}
}
```

出参：

```json
{
  "item": {}
}
```

约束：
- 关键配置变更必须写 `audit_log`。
- 配置写入必须做字段级校验：桌台/助教/活动/价格状态枚举受控，金额使用整数分，布尔字段必须为 boolean。
- `manageTables:disable` 必须检查该桌台是否存在有效预约；与 `updateTableStatus` 一致，有有效预约时返回 `TABLE_HAS_ACTIVE_RESERVATION`。
- `managePriceRules` 的 `price_cent` 必须为非负整数，不能使用浮点数。

## 6. 助教

### getAssistants

助教列表。

入参：

```json
{
  "store_id": "store_001",
  "start_time": 1781344800000,
  "end_time": 1781348400000
}
```

出参：

```json
{
  "items": [
    {
      "_id": "assistant_001",
      "name": "助教A",
      "status": "idle",
      "service_price_cent": 8000,
      "available": true
    }
  ]
}
```

### getAssistantDetail

助教详情。

入参：

```json
{
  "store_id": "store_001",
  "assistant_id": "assistant_001"
}
```

出参：

```json
{
  "_id": "assistant_001",
  "name": "助教A",
  "tags": ["基础教学"],
  "intro": "简介",
  "status": "idle"
}
```

### createAssistantReservation

创建助教预约，可单独预约，也可绑定桌台预约。

入参：

```json
{
  "store_id": "store_001",
  "assistant_id": "assistant_001",
  "reservation_id": null,
  "start_time": 1781344800000,
  "end_time": 1781348400000,
  "remark": "需要基础教学"
}
```

出参：

```json
{
  "assistant_reservation": {
    "_id": "assistant_reservation_001",
    "status": "pending_confirm"
  }
}
```

约束：
- 服务端必须校验同助教时段冲突。
- 助教当前状态必须允许预约：`idle` 或可预约配置命中。
- MVP 助教预约默认需员工确认。

### confirmAssistantReservation

员工确认助教预约。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "assistant_reservation_id": "assistant_reservation_001"
}
```

出参：

```json
{
  "assistant_reservation": {
    "_id": "assistant_reservation_001",
    "status": "confirmed"
  }
}
```

### updateAssistantStatus

切换助教状态。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "assistant_id": "assistant_001",
  "to_status": "resting",
  "reason": "休息"
}
```

出参：

```json
{
  "assistant": {
    "_id": "assistant_001",
    "status": "resting"
  }
}
```

约束：
- 助教正在 `serving` 时，不能直接切到 `checked_out`。
- 写入 `assistant_status_log`。

## 7. 活动

### getCampaigns

活动列表。

入参：

```json
{
  "store_id": "store_001",
  "status": "published",
  "page": 1,
  "page_size": 20
}
```

出参：

```json
{
  "items": [
    {
      "_id": "campaign_001",
      "title": "新人活动",
      "cover_url": "cloud://...",
      "start_time": 1781344800000,
      "end_time": 1781953200000,
      "quota_limited": true,
      "quota_left": 8
    }
  ],
  "total": 1
}
```

### getCampaignDetail

活动详情。

入参：

```json
{
  "store_id": "store_001",
  "campaign_id": "campaign_001"
}
```

出参：

```json
{
  "_id": "campaign_001",
  "title": "新人活动",
  "content": "活动介绍",
  "rules": "活动规则",
  "quota_limited": true,
  "quota_total": 20,
  "quota_used": 12,
  "need_review": false,
  "member_only": false
}
```

### createCampaignRegistration

活动报名。

入参：

```json
{
  "store_id": "store_001",
  "campaign_id": "campaign_001",
  "participant_count": 1,
  "form_data": {
    "remark": "晚上到"
  }
}
```

出参：

```json
{
  "registration": {
    "_id": "registration_001",
    "status": "approved"
  }
}
```

约束：
- 报名前必须存在 `nickname` 和 `phone`。
- 限额活动必须通过短锁或事务扣减 `quota_used`，禁止超报。
- `need_review=true` 时状态为 `pending_review`；否则为 `approved`。
- 当前实现使用 `reservation_lock` 的 `campaign:{store_id}:{campaign_id}` 资源锁保护报名创建、重复提交和名额扣减。

### manageCampaigns

商家活动配置。

权限：`manager` / `admin`。

入参：

```json
{
  "store_id": "store_001",
  "action": "publish",
  "campaign_id": "campaign_001",
  "payload": {}
}
```

出参：

```json
{
  "campaign": {
    "_id": "campaign_001",
    "status": "published"
  }
}
```

约束：
- `action` 支持 `upsert`、`update`、`publish`、`offline`。
- `title`、`campaign_type`、`status`、`quota_total`、`quota_used`、`need_review`、`member_only`、`start_time/end_time` 按字段规则校验。

### reviewCampaignRegistration

活动报名审核。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "registration_id": "registration_001",
  "action": "approve",
  "reason": ""
}
```

出参：

```json
{
  "registration": {
    "_id": "registration_001",
    "status": "approved",
    "reviewed_by": "openid",
    "reviewed_at": "2026-06-20T12:00:00.000Z"
  }
}
```

约束：
- 只允许 `pending_review -> approved/rejected`。
- `reject` 必须填写 `reason`，写入 `reject_reason`。
- 拒绝已占用名额的报名时回退 `campaign.quota_used` / `registered_count`。
- 必须写 `audit_log`。

### getCampaignRegistrations

活动报名名单。

权限：`staff` 及以上；手机号完整展示仅 `manager` / `admin`。

入参：

```json
{
  "store_id": "store_001",
  "campaign_id": "campaign_001",
  "page": 1,
  "page_size": 20
}
```

出参：

```json
{
  "items": [
    {
      "_id": "registration_001",
      "nickname": "用户昵称",
      "phone": "138****0000",
      "status": "approved",
      "created_at": 1781341200000
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

约束：
- 支持 `campaign_id`、`status`、`page`、`page_size`。
- 普通员工手机号脱敏，`manager` / `admin` 可看完整手机号。

## 8. 客户与限制

### getMineCenter

我的中心汇总接口，供小程序“我的”页读取用户资料、授权状态、储值余额、优惠券、订单和预约摘要。第一期只读展示，不接微信支付和充值。

权限：登录用户本人。

入参：

```json
{
  "store_id": "store_001"
}
```

出参：

```json
{
  "profile": {
    "nickName": "用户昵称",
    "avatarUrl": "",
    "memberLevel": "普通会员",
    "phone": "13800000000",
    "phoneAuthorized": true,
    "reservationCount": 3,
    "noShowCount": 0
  },
  "auth": {
    "loggedIn": true,
    "openid": "openid_xxx",
    "profileAuthorized": true,
    "phoneAuthorized": true,
    "paymentEnabled": false
  },
  "wallet": {
    "balance_cent": 12000,
    "balanceCent": 12000,
    "balanceText": "¥120.00",
    "storedValueEnabled": true,
    "paymentEnabled": false,
    "rechargeEnabled": false
  },
  "summary": {
    "reservationCount": 3,
    "couponCount": 1,
    "orderCount": 1,
    "noShowLockCount": 0
  },
  "coupons": [],
  "orders": [],
  "reservations": [
    {
      "_id": "reservation_001",
      "tableCode": "A01",
      "tableType": "普台",
      "table": {
        "_id": "table_001",
        "table_no": "A01",
        "table_type_name": "普台"
      }
    }
  ],
  "assistantReservations": [],
  "campaignRegistrations": [],
  "noShowLocks": []
}
```

约束：
- 未授权手机号时 `phoneAuthorized=false`，`phone` 为空。
- 无储值账户时余额按 0 兜底。
- 第一期不接支付：`paymentEnabled=false`、`rechargeEnabled=false`。
- `reservations` 返回桌台摘要，避免页面直接展示原始 `table_id`。

### getCustomers

客户列表。

权限：`staff` 及以上；普通员工手机号脱敏。

入参：

```json
{
  "store_id": "store_001",
  "keyword": "138",
  "page": 1,
  "page_size": 20
}
```

出参：

```json
{
  "items": [
    {
      "user_id": "user_001",
      "nickname": "用户昵称",
      "phone": "138****0000",
      "reservation_count": 3,
      "last_arrival_at": 1781341200000
    }
  ],
  "total": 1
}
```

### liftNoShowBan

解除未到店限制。

权限：`manager` / `admin`。

入参：

```json
{
  "store_id": "store_001",
  "no_show_record_id": "no_show_001",
  "reason": "用户已电话说明原因"
}
```

出参：

```json
{
  "no_show_record": {
    "_id": "no_show_001",
    "status": "lifted",
    "lift_reason": "用户已电话说明原因"
  }
}
```

约束：
- 必须记录解除人、解除时间、原因。
- 写入 `audit_log`。

## 9. Web 后台管理

### getAdminDashboard

Web 后台概览。

权限：`manager` / `admin`。

入参：

```json
{
  "store_id": "store_001"
}
```

出参：

```json
{
  "overview": {},
  "metrics": {
    "reservation_count": 12,
    "waiting_review_count": 2,
    "customer_count": 30,
    "campaign_registration_count": 8,
    "no_show_active_count": 1,
    "free_table_count": 10,
    "free_assistant_count": 3
  },
  "recentReservations": [],
  "recentAuditLogs": []
}
```

### getAdminReservations

Web 后台预约列表，返回桌台摘要。

权限：`staff` 及以上。

入参：

```json
{
  "store_id": "store_001",
  "status": "pending_verify"
}
```

出参：

```json
{
  "items": [
    {
      "_id": "reservation_001",
      "table_id": "table_001",
      "tableCode": "A01",
      "tableType": "普台",
      "table": {
        "_id": "table_001",
        "table_no": "A01",
        "table_type_name": "普台"
      }
    }
  ],
  "total": 1
}
```

### getPageConfig

读取小程序页面配置。小程序端可读取 `published` 配置；无配置时返回默认首页配置。

权限：公开读取。

入参：

```json
{
  "store_id": "store_001",
  "page_key": "home",
  "status": "published"
}
```

出参：

```json
{
  "config": {
    "_id": "store_001_home_published",
    "store_id": "store_001",
    "page_key": "home",
    "status": "published",
    "theme": {},
    "modules": []
  }
}
```

### managePageConfig

保存或发布页面配置。

权限：`manager` / `admin`。

入参：

```json
{
  "store_id": "store_001",
  "page_key": "home",
  "action": "publish",
  "payload": {
    "theme": {},
    "modules": []
  }
}
```

出参：

```json
{
  "config": {
    "_id": "store_001_home_published",
    "status": "published"
  }
}
```

约束：
- `saveDraft` 写入 `draft`。
- `publish` 写入 `published` 并记录 `published_at`。
- 写入 `audit_log`。

### getAssets / manageAssets

素材库查询与管理。

权限：`manager` / `admin`。

查询入参：

```json
{
  "store_id": "store_001",
  "type": "hero",
  "includeDeleted": false
}
```

管理入参：

```json
{
  "store_id": "store_001",
  "asset_id": "asset_001",
  "action": "upsert",
  "payload": {
    "name": "首页 Hero",
    "type": "hero",
    "url": "/assets/hero.jpg",
    "file_id": "cloud://xxx"
  }
}
```

约束：
- `delete` 为软删除，写入 `is_deleted=true`、`status=deleted`。
- 默认查询不返回软删除素材；传 `includeDeleted=true` 可返回。
- 写入 `audit_log`。

### getAuditLogs

审计日志查询。

权限：`manager` / `admin`。

入参：

```json
{
  "store_id": "store_001",
  "action": "managePageConfig:publish",
  "target_type": "page_config"
}
```

出参：

```json
{
  "items": [],
  "total": 0
}
```
