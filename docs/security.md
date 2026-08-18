# Security model

威胁边界包括恶意 MCP 输入、凭据泄漏、SSRF、并发覆盖、重复写入、HTTP 暴露、资源耗尽和日志隐私泄漏。

- 凭据只从 `ICLOUD_USERNAME`、`ICLOUD_APP_PASSWORD` 读取。只能使用可撤销的 Apple app-specific password。
- CalDAV origin 编译期固定为 `https://caldav.icloud.com`；DAV 返回 href 会重新按该 origin 解析校验。
- HTTP 仅绑定 `127.0.0.1`；bearer token、Host allowlist、Origin allowlist、body limit 和限流为强制控制。反向代理不得移除这些边界。
- 用户文本由 `ical.js` 属性 API 转义，避免 CRLF/property injection。
- ETag 和 stable UID 防止 lost update 与 crash-window duplicate。
- logger 仅记录操作状态，脱敏 Basic/Bearer、邮箱和 URL；不记录事件字段。
- journal 包含不透明定位信息和幂等结果，应视为敏感本地数据；默认目录/文件权限分别为 0700/0600（Windows 继承用户 ACL）。

安全问题请按根目录 `SECURITY.md` 私下报告。发布前运行 `pnpm check`、`npm pack --dry-run` 和密钥扫描；不要在 CI 注入真实 iCloud 凭据。
