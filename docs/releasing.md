# Releasing

1. 用户可见改动在 PR 中运行 `pnpm changeset`，选择 semver 级别并提交生成的 Markdown 文件。
2. CI 运行 `pnpm check`、`pnpm changeset:status` 和 `npm pack --dry-run`。
3. PR 合并到 `main` 后，`changesets/action` 创建或更新 Release PR；它统一修改版本和 changelog。
4. 合并 Release PR 后，同一 workflow 执行 `pnpm release`：完整质量门禁，然后 `changeset publish`。
5. npm 发布使用 GitHub OIDC Trusted Publishing 和 provenance，不在仓库配置长期 `NPM_TOKEN`。
6. 只有 registry 返回成功并能 `npm view` 到新版本后才宣布发布成功。

## Official MCP Registry

`package.json#mcpName` 与 `server.json#name` 必须保持一致。`pnpm changeset:version` 会在版本更新后自动运行 `pnpm registry:sync`，而 `pnpm check` 会验证 npm 包名、版本和 MCP Registry 元数据一致。

新 npm 版本可查询后，再运行：

```bash
mcp-publisher login github
mcp-publisher publish
```

不要在 npm 包发布前提交对应的 Registry 版本，因为官方 Registry 会验证 npm 中的包和 `mcpName`。

首次启用：先建立 GitHub remote；在 npm 包设置中新增 Trusted Publisher，精确填写实际 owner、repository、workflow 文件 `.github/workflows/release.yml`，不要填写 branch environment。项目不伪造 repository URL，建立远程后再补 `package.json.repository`。

首次包尚不存在时，npm 可能要求维护者先通过 CLI 发布一次或先建立包的 Trusted Publisher 关系，具体取决于 npm 当时的首次发布策略。遇到浏览器登录或 OTP 必须由维护者完成，不能绕过。
