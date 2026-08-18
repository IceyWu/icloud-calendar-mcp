<p align="center">
  <img src="../assets/logo.svg" width="120" alt="iCloud Calendar MCP 标志">
</p>

<h1 align="center">iCloud Calendar MCP</h1>

<p align="center">
  用于管理 iCloud 日历的 MCP Server。
</p>

<p align="center">
  <a href="../README.md">English</a> · <strong>简体中文</strong>
</p>

## 配置

需要：

- Node.js 22.13 或更高版本
- Apple 账户邮箱
- Apple [应用专用密码](https://support.apple.com/zh-cn/102654)

添加到 MCP 客户端：

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

请使用应用专用密码，不要使用 Apple 账户密码。

## 工具

| 工具             | 用途                 |
| ---------------- | -------------------- |
| `list_calendars` | 获取日历列表         |
| `list_events`    | 获取时间范围内的事件 |
| `get_event`      | 获取事件             |
| `create_event`   | 创建事件             |
| `update_event`   | 更新事件             |
| `delete_event`   | 删除事件             |
| `find_conflicts` | 查找时间冲突         |
| `free_busy`      | 获取忙碌时间段       |

事件支持时区、全天日期、重复规则、提醒、地点、描述、URL 和参与者。

## 对话示例

连接服务器后，可以直接对 MCP 客户端说：

> 显示我的日历列表。

> 用 Asia/Shanghai 时区查看我下周的日程。

> 明天下午 2 点到 3 点，在“工作”日历创建“项目评审”，提前 15 分钟提醒我。

> 检查本周五上午 9 点到 12 点有没有日程冲突。

> 把“项目评审”改到下午 4 点，地点改为 B 会议室。

> 在 10 月 1 日创建一个名为“公司假期”的全天事件。

> 删除“项目评审”事件。

如果指令可能有歧义，建议明确日历、日期、时间和时区。

## 行为说明

- 全天事件的结束日期不包含在事件内。8 月 18 日一天应填写 `2026-08-18` 到 `2026-08-19`。
- 创建、更新和删除接受 `request_id`，可安全重试。
- 使用 ETag 检测并发修改。
- 可以更新或删除整个重复系列。不支持的单次 occurrence 操作会返回错误，不会改动整个系列。

完整参数、返回值和错误码见[工具合同](tool-contracts.md)。

## HTTP

默认使用 stdio，也可以启用 Streamable HTTP：

```bash
ICLOUD_MCP_TRANSPORT=http \
ICLOUD_MCP_HTTP_TOKEN='replace-with-a-long-random-token' \
ICLOUD_MCP_HTTP_PORT=3000 \
npx -y icloud-calendar-mcp
```

HTTP 模式必须设置 bearer token，默认只监听 loopback。通过代理对外提供服务前，请阅读[安全文档](security.md)。

## 开发

```bash
pnpm install
pnpm check
```

其他文档：[架构](architecture.md)、[贡献指南](../CONTRIBUTING.md)、[发布流程](releasing.md)。

## License

[MIT](../LICENSE)
