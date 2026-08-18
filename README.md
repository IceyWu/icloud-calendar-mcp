# icloud-calendar-mcp

可靠、轻量的 Apple iCloud Calendar MCP Server。原生 TypeScript/Node.js，通过 CalDAV 直接连接 iCloud；不依赖 Java、Python、Go、AppleScript、macOS 或 Calendar.app。

> English summary: A production-oriented, cross-platform TypeScript MCP server for Apple iCloud Calendar. It provides guarded CalDAV CRUD, persistent opaque handles, idempotent writes, ETag concurrency control, recurrence expansion, stdio and secured Streamable HTTP transports.

## 安装

要求 Node.js 20 或更高版本。必须使用 Apple 的“应用专用密码”，不要使用 Apple 账户主密码。

```bash
npx icloud-calendar-mcp
```

创建应用专用密码：登录 [account.apple.com](https://account.apple.com/)，进入“登录和安全性”→“应用专用密码”。Apple 可能限制可同时激活的应用专用密码数量；撤销密码后本服务会收到 `AUTH_FAILED`。

stdio 客户端配置：

```json
{
  "mcpServers": {
    "icloud-calendar": {
      "command": "npx",
      "args": ["-y", "icloud-calendar-mcp"],
      "env": {
        "ICLOUD_USERNAME": "you@example.com",
        "ICLOUD_APP_PASSWORD": "xxxx-xxxx-xxxx-xxxx"
      }
    }
  }
}
```

stdout 只用于 JSON-RPC；所有日志写入 stderr。

## 工具与 MCP 内容

| 名称 | 说明 |
| --- | --- |
| `list_calendars` | 列出 iCloud 日历 |
| `list_events` | 按显式时间范围、时区、游标和上限查询；请求 CalDAV 服务端展开 occurrence |
| `get_event` | 用跨进程持久化的 opaque handle 读取事件 |
| `create_event` | 用 `request_id` 和稳定 UID 幂等创建 |
| `update_event` | 用持久 handle 和 `If-Match` 更新 |
| `delete_event` | 用持久 handle 和 `If-Match` 删除 |
| `find_conflicts` | 查找时间重叠事件 |
| `free_busy` | 从当前可读事件可靠地客户端计算忙碌区间 |

工具同时返回 `structuredContent` 和 text JSON，并声明 read-only/destructive/idempotent/open-world annotations。资源：`calendar://calendars`。显式用户模板 prompts：`schedule_event`、`reschedule_event`、`find_conflicts`；它们不替用户自主做日程决策。

事件支持定时/全天、标题、描述、地点、URL、RRULE、DISPLAY alarm 与参与者。参与者字段受 iCloud 和日历共享权限限制，本服务不会把“写入 ATTENDEE”误报为邀请已成功发送。

## 时间与重复事件语义

- 定时事件输入必须提供 ISO 8601 时间和 IANA `timezone`；输出也明确返回时区。
- 全天事件 `start`/`end` 使用 `YYYY-MM-DD`，`end` **不包含**在事件内。例如 8 月 18 日全天事件为 `start=2026-08-18`、`end=2026-08-19`。
- iCalendar 使用 `ical.js` 构建和解析，不用字符串拼接用户字段；测试覆盖 DST、UTC 和全天边界。
- `list_events` 通过 CalDAV `calendar-data/expand` 请求展开 RRULE occurrence。
- `whole_series` 支持更新/删除。`single_occurrence`、`this_and_future` 在未验证 iCloud recurrence exception 能力时返回 `UNSUPPORTED_OPERATION`，绝不静默改成整系列。

## HTTP 模式

HTTP 默认关闭。启用后只监听 loopback，且 bearer token 至少 24 字符：

```bash
ICLOUD_MCP_TRANSPORT=http \
ICLOUD_MCP_HTTP_TOKEN='replace-with-a-long-random-token' \
ICLOUD_MCP_HTTP_PORT=3000 \
npx icloud-calendar-mcp
```

- MCP endpoint：`POST /mcp`
- 健康检查：`GET /healthz`（不访问 Apple，也不泄露账户状态）
- 强制 bearer token；固定 Host allowlist；Origin 默认全部拒绝；1 MiB 默认请求上限；本地读写限流；超时和安全响应头边界。
- 通过 `ICLOUD_MCP_CONFIG=/absolute/path/config.json` 设置稳定参数，例如 `allowedHosts`、`allowedOrigins`、`timeoutMs`、`maxEvents`、读写限流和请求上限。凭据不允许放入该文件。

完整配置合同见 [docs/tool-contracts.md](docs/tool-contracts.md)，安全模型见 [docs/security.md](docs/security.md)。

## 可靠性

- create 的 UID 是 `request_id` 的稳定 SHA-256 派生值；重复请求不会生成第二事件。
- create 使用 `If-None-Match: *`，update/delete 使用已读取 ETag 的 `If-Match`。
- journal 以原子 rename 写入用户数据目录（默认 `~/.icloud-caldav-mcp/journal.json`，权限收紧），保存 request replay 和 opaque handle。
- 429/5xx/网络暂时失败采用有抖动的指数退避并尊重 `Retry-After`；缺失响应 ETag 时做 read-after-write 可见性轮询。
- 稳定错误码：`AUTH_FAILED`、`CALENDAR_NOT_FOUND`、`EVENT_NOT_FOUND`、`ETAG_CONFLICT`、`INVALID_EVENT`、`RATE_LIMITED`、`TEMPORARY_UNAVAILABLE`、`UNSUPPORTED_OPERATION`。

## 开发与真实账号 smoke test

```bash
pnpm install
pnpm check
pnpm pack
```

CI 使用 fake adapter/HTTP fixtures，不需要真实 Apple 账号。可选真实测试只在本机显式提供 `ICLOUD_USERNAME` 与 `ICLOUD_APP_PASSWORD` 后运行：`pnpm smoke:icloud`。当前 smoke 套件默认跳过写操作；首次真实验证建议先用专用测试日历手工验证 discovery/list/create/update/delete/recurrence exception 行为。

故障排查：401/403 检查应用专用密码；412 表示 ETag 并发冲突，请重新 `list_events`/`get_event`；429 等待后重试；unknown handle 表示 journal 被删除或数据目录改变。不要把完整 CalDAV URL、Authorization 或事件正文贴入 issue。

## License

MIT。实现为独立原创代码；公开项目仅用于接口与架构差距研究，没有复制第三方源码。
