# Changesets

面向用户的改动必须在 PR 中加入 changeset：

```bash
pnpm changeset
```

选择 `patch`、`minor` 或 `major`，并写清用户可见变化。合并到 `main` 后，Changesets Action 会维护 Release PR；合并 Release PR 后自动通过 npm Trusted Publishing 发布。

仅文档、测试或 CI 内部变更可以不加 changeset，但应在 PR 描述中说明原因。
