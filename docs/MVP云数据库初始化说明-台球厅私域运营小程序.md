# MVP 云数据库初始化说明：台球厅私域运营小程序

## 1. 初始化目标

本说明用于初始化 MVP 演示门店云数据库基础数据。

种子脚本位置：

```bash
cloudfunctions/api/scripts/seed.js
```

默认门店：

```text
store_demo_001
```

脚本会写入以下集合：

| 集合 | 数量 | 说明 |
|---|---:|---|
| `store` | 1 | 演示门店，24 小时营业，提前 30 分钟预约，爽约限制 3 天 |
| `billiard_table` | 40 | A-E 五个区域共 40 张桌台 |
| `price_rule` | 3 | 凌晨优惠、日间标准、晚间黄金三段价格规则 |
| `assistant` | 2 | 两个可预约助教 |
| `campaign` | 2 | 新人活动和周末比赛活动 |

## 2. 运行方式

进入云函数目录：

```bash
cd cloudfunctions/api
```

安装依赖：

```bash
npm install
```

指定云开发环境并执行：

```bash
$env:WX_CLOUD_ENV="你的云开发环境ID"
npm run seed
```

macOS / Linux 可使用：

```bash
WX_CLOUD_ENV=你的云开发环境ID npm run seed
```

如果运行在微信云函数环境内，也可不传 `WX_CLOUD_ENV`，脚本会尝试使用 `cloud.DYNAMIC_CURRENT_ENV`。

成功输出示例：

```json
{
  "store": "store_demo_001",
  "tables": 40,
  "priceRules": 3,
  "assistants": 2,
  "campaigns": 2
}
```

## 3. 数据明细

### 门店

- `_id`: `store_demo_001`
- `name`: `星火台球俱乐部`
- `business_hours`: `24小时营业`
- `table_count`: `40`
- `reservation_lead_minutes`: `30`
- `no_show_lock_days`: `3`
- `booking_rule.min_advance_minutes`: `30`
- `booking_rule.no_show_ban_days`: `3`

### 桌台

| 区域 | 数量 | 编号 | 桌型 |
|---|---:|---|---|
| 普台区 | 12 | A01-A12 | 普台 |
| 银腿区 | 10 | B01-B10 | 乔氏银腿 |
| 独牙区 | 8 | C01-C08 | 独牙 |
| 金腿区 | 6 | D01-D06 | 乔氏金腿 |
| 玫瑰金区 | 4 | E01-E04 | 乔氏玫瑰金 |

桌台记录同时写入当前接口使用字段和 schema 字段：

- 当前接口字段：`code`、`area`、`type`、`status`、`enabled`
- schema 字段：`table_no`、`table_type`、`table_type_name`、`area_name`、`sort_order`

默认状态为 `空闲`，`enabled=true`。

### 三段价格规则

| 规则 ID | 时段 | 说明 |
|---|---|---|
| `store_demo_001_price_off_peak` | 00:00-08:00 | 凌晨优惠 |
| `store_demo_001_price_day` | 08:00-18:00 | 日间标准 |
| `store_demo_001_price_night` | 18:00-24:00 | 晚间黄金 |

每条价格规则使用 `prices_by_table_type` 保存五种桌型价格，金额单位为分。为兼容现有 schema，`price_cent` 存普台价格。

### 助教

| 助教 ID | 姓名 | 状态 | 价格 |
|---|---|---|---:|
| `store_demo_001_assistant_001` | 小乔 | 空闲 | 8800 分/小时 |
| `store_demo_001_assistant_002` | 阿宁 | 空闲 | 10800 分/小时 |

助教记录包含 `status=空闲` 和 `status_code=idle`，兼容当前接口和英文状态 schema。

### 活动

| 活动 ID | 标题 | 审核 | 名额 |
|---|---|---|---:|
| `store_demo_001_campaign_new_user` | 新人首练 2 小时特惠 | 否 | 100 |
| `store_demo_001_campaign_weekend_match` | 周末 8 人让局赛 | 是 | 8 |

活动记录包含 `status=已发布` 和 `status_code=published`，兼容当前接口和英文状态 schema。

## 4. 幂等说明

脚本使用固定 `_id` 写入数据，重复执行会覆盖同 ID 的演示基础数据，不会追加重复的 40 张桌台、2 个助教或 2 个活动。

注意：

- 脚本只初始化基础配置集合。
- 脚本不会清理 `reservation`、`assistant_reservation`、`campaign_registration`、`no_show_record` 等业务流水。
- 如需重置业务流水，请另行评估数据风险后手动处理。

## 5. 验收方式

执行后可通过云开发控制台确认：

1. `store` 中存在 `store_demo_001`。
2. `billiard_table` 按 `store_id=store_demo_001` 查询共有 40 条。
3. `price_rule` 按 `store_id=store_demo_001` 查询共有 3 条。
4. `assistant` 按 `store_id=store_demo_001` 查询共有 2 条。
5. `campaign` 按 `store_id=store_demo_001` 查询共有 2 条且状态为 `已发布`。

也可调用云函数 `api`：

- `getStoreOverview`：确认门店、空桌数、空闲助教数、活动列表正常。
- `getAvailableTables`：确认返回 40 张启用桌台。
- `getAssistants`：确认返回 2 个启用助教。
- `getCampaigns`：确认返回 2 个已发布活动。
