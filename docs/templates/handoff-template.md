# Agent Handoff Template

```text
message_type: instruction / status / handoff / review / fix
request_id: REQ-YYYYMMDD-HHMMSS-简短任务名
from_lane: coordinator / product-planning / research / visual-design / frontend / backend / qa / reviewer / simple-helper
to_lane: 目标 lane
created_at: ISO 时间或当前日期时间
recorded_in: 当前对话 / docs/worklog.md / lanes/<lane>/worklog.md

消息内容：
- 背景：
- 任务：
- 输入材料：
- 允许改动范围：
- 禁止改动范围：
- 输出要求：
- 验证方式：
- 暂停条件：
- 完成内容：
- 改动文件：
- 验证结果：
- 剩余问题：
- 建议下一步负责 agent：
- 是否触发暂停条件：
```

