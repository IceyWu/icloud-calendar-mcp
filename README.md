<p align="center">
  <img src="assets/logo.svg" width="120" alt="iCloud Calendar MCP logo">
</p>

<h1 align="center">iCloud Calendar MCP</h1>

<p align="center">
  An MCP server for managing iCloud Calendar.
</p>

<p align="center">
  <strong>English</strong> · <a href="docs/README.zh-CN.md">简体中文</a>
</p>

## Setup

Requirements:

- Node.js 22.13 or later
- Your Apple Account email
- An Apple [app-specific password](https://support.apple.com/102654)

Add the server to your MCP client:

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

Use an app-specific password, not your Apple Account password.

## Tools

| Tool             | Purpose                     |
| ---------------- | --------------------------- |
| `list_calendars` | List calendars              |
| `list_events`    | List events in a time range |
| `get_event`      | Get an event                |
| `create_event`   | Create an event             |
| `update_event`   | Update an event             |
| `delete_event`   | Delete an event             |
| `find_conflicts` | Find overlapping events     |
| `free_busy`      | Return busy time ranges     |

Events can include time zones, all-day dates, recurrence rules, alarms, locations, descriptions, URLs, and attendees.

## Example requests

Once the server is connected, you can ask your MCP client:

> Show my calendars.

> What is on my calendar next week in Asia/Shanghai time?

> Add a project review to my Work calendar tomorrow from 2:00 PM to 3:00 PM, with a reminder 15 minutes before.

> Do I have any conflicts on Friday between 9:00 AM and noon?

> Move the project review to 4:00 PM and change the location to Meeting Room B.

> Add an all-day event called “Company holiday” on October 1.

> Delete the project review event.

For ambiguous requests, include the calendar, date, time, and time zone when possible.

## Behavior

- All-day event end dates are exclusive. A one-day event on August 18 uses `2026-08-18` to `2026-08-19`.
- Create, update, and delete operations accept a `request_id` for safe retries.
- Concurrent changes are detected with ETags.
- Whole recurring series can be updated or deleted. Unsupported occurrence-level changes return an error instead of modifying the series.

See [tool contracts](docs/tool-contracts.md) for complete inputs, outputs, and error codes.

## HTTP

stdio is the default transport. Streamable HTTP is optional:

```bash
ICLOUD_MCP_TRANSPORT=http \
ICLOUD_MCP_HTTP_TOKEN='replace-with-a-long-random-token' \
ICLOUD_MCP_HTTP_PORT=3000 \
npx -y icloud-calendar-mcp
```

HTTP mode requires a bearer token and listens on loopback by default. See [security](docs/security.md) before exposing it through a proxy.

## Development

```bash
pnpm install
pnpm check
```

See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), and [releasing](docs/releasing.md).

## License

[MIT](LICENSE)
