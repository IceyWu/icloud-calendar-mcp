# Tool contracts

所有工具结果同时含 JSON text 与同值 `structuredContent`。错误以 `{error:{code,message}}` 返回并设置 MCP `isError`。

## 公共时间合同

`start`/`end` 为半开区间 `[start,end)`。定时事件是含 offset 的 ISO 8601；`timezone` 为 IANA 时区。全天事件是 `YYYY-MM-DD` 且 end-exclusive。查询的 `limit` 上限受配置 `maxEvents` 约束；`cursor` 是 opaque，不应解析或持久假设其结构。

## 写入合同

`request_id` 为 8–128 个 `[A-Za-z0-9._:-]` 字符。相同 request_id + 相同操作 + 相同参数重放首次结果；相同 request_id 配不同 payload 被拒绝。`event_handle` 是本地持久 opaque 标识，不是 URL 或 UID。

事件字段：`title`、`start`、`end`、`timezone` 必填；`allDay`、`description`、`location`、`url`、`rrule`、`alarms[]`、`attendees[]` 可选。update 为 patch。

`scope` 默认 `whole_series`。当前安全能力矩阵：

| scope               | update                  | delete                  |
| ------------------- | ----------------------- | ----------------------- |
| `whole_series`      | 支持                    | 支持                    |
| `single_occurrence` | `UNSUPPORTED_OPERATION` | `UNSUPPORTED_OPERATION` |
| `this_and_future`   | `UNSUPPORTED_OPERATION` | `UNSUPPORTED_OPERATION` |

## Free/busy

`free_busy` 返回 `{busy:[{start,end}],source:"client_computed"}`。iCloud 对 CalDAV scheduling/free-busy 权限和部署差异较大，因此本实现从调用者可读的已展开事件计算并合并区间。它不声称包含调用者无权读取的事件。
