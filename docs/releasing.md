# Releasing

1. 更新 `CHANGELOG.md` 和版本号，确认 Git worktree 只有预期变更。
2. `pnpm install --frozen-lockfile && pnpm check`。
3. `npm view icloud-calendar-mcp name version --json` 精确确认名称/版本。
4. `npm pack`，从生成 tarball 安装到临时目录并执行 CLI 的 MCP initialize smoke test。
5. `npm whoami` 确认正确账户。首次发布如需 OTP/浏览器登录，停下由维护者完成；不得绕过。
6. `npm publish --access public --provenance`。只有 registry 返回成功并能 `npm view` 到新版本后才宣布发布成功。

`.github/workflows/release.yml` 为 GitHub OIDC Trusted Publishing 准备；在 npm 后台配置对应仓库和 workflow 后才可使用。项目不伪造 repository URL，首次建立远程后再补 `package.json.repository`。
