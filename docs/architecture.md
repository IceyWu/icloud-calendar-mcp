# 架构与差距清单

数据流：transport（stdio/Streamable HTTP）→ MCP tools/resources/prompts → `CalendarService` → `CalDavPort` → iCloud CalDAV。journal、限流、日志和类型化配置为基础设施层。`CalDavPort` 允许 fake adapter 与未来多账户路由，而当前凭据模型保持单账户。

## 公开项目调研后的取舍

| 来源 | 吸收 | 本项目消除/规避的差距 |
| --- | --- | --- |
| `icloud-calendar-mcp/icloud-calendar-mcp` | iCloud 专项、条件写、安全边界、opaque handle、resources/prompts | npm 包为原生 Node.js，不包装 JAR，不要求 Java；handle 跨重启，不依赖“先查询再更新”的内存会话 |
| `dominik1001/caldav-mcp` | TypeScript、npm/npx、轻量分层 | 严格固定 iCloud origin；增加稳定 UID、journal、ETag、脱敏、重试、HTTP 防护和协议测试 |
| `roygabriel/mcp-icloud-calendar` | 超时/退避/限流、健康检查、无 PII 审计思路、未来多账户接口 | 当前只暴露最小凭据环境变量，不引入部署平台耦合 |
| `mike-tih/icloud-mcp` | stdio + Streamable HTTP、未来多用户边界 | HTTP 不裸奔：token、Host/Origin、大小、限流、loopback 监听均为强制边界 |

没有复制上述项目源码。协议实现依据 DAV/CalDAV/iCalendar 公共标准与官方 MCP SDK API。

## 关键不变量

1. 所有网络请求的解析后 origin 必须严格等于 `https://caldav.icloud.com`，只接受绝对路径落在该 origin。
2. stdout 只由 stdio transport 使用；应用日志只写 stderr。
3. 所有写操作必须有 `request_id`；create UID 稳定；update/delete 必须携带 ETag 条件。
4. occurrence 能力不足时安全失败，不能回退为 whole-series。
5. 日志不包含事件正文、账户邮箱、凭据或完整敏感 URL。

## 持久化与未来多账户

journal 是无原生依赖的 JSON snapshot，使用同目录临时文件 + 原子 rename。它适合单进程单账户和跨平台 npm 安装。`CalDavPort` 与 service 构造函数均不把账户写死到 domain 类型中；未来多账户可在 application 边界加入 `account_id` 路由和分账户 journal/limiter，无需重写 transport 或 CalDAV adapter。
