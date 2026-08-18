# Contributing

Contributions are welcome.

## Development

Requires Node.js 22.13 or later and pnpm.

```bash
pnpm install
pnpm check
```

Use `pnpm format:write` to apply the project's Ultracite formatting and lint fixes.

## Pull requests

- Keep changes focused and explain any CalDAV compatibility impact.
- Add deterministic fake-adapter or HTTP fixture coverage for CalDAV changes.
- Do not make CI depend on a real Apple account.
- Never commit credentials, private event data, or complete private CalDAV URLs.
- Run `pnpm check` before opening a pull request.

Run `pnpm changeset` for user-visible changes and commit the generated file. Documentation, test-only, and internal CI changes do not require a changeset.
