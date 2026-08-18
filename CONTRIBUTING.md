# Contributing

需要 Node.js 20+ 与 pnpm。安装后运行 `pnpm check`。修改 CalDAV 逻辑必须增加 fake fixture 测试；CI 不允许依赖真实 Apple 账户。不要提交凭据、真实事件数据或完整私有 CalDAV URL。提交应保持小而聚焦，并说明协议兼容影响。

代码格式和 lint 由 Ultracite（Oxlint + Oxfmt）统一管理：`pnpm format:write`。
