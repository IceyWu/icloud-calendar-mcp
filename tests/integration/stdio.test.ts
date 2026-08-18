import { spawn } from "node:child_process";
import { once } from "node:events";

import { describe, expect, it } from "vitest";

describe("stdio MCP", () => {
  it("handshakes and lists tools/resources/prompts without stdout noise", async () => {
    const child = spawn(
      process.execPath,
      [process.env.TARBALL_CLI_PATH ?? "dist/cli.js"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ICLOUD_APP_PASSWORD: "xxxx-xxxx-xxxx-xxxx",
          ICLOUD_MCP_CONFIG: undefined,
          ICLOUD_USERNAME: "test@example.com",
        },
      }
    );
    let buffer = "";
    const replies: any[] = [];
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (s: string) => {
      buffer += s;
      let n;
      while ((n = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, n);
        buffer = buffer.slice(n + 1);
        if (line) {
          replies.push(JSON.parse(line));
        }
      }
    });
    const send = (x: unknown) => child.stdin.write(`${JSON.stringify(x)}\n`);
    send({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
        protocolVersion: "2025-06-18",
      },
    });
    await wait(() => replies.some((x) => x.id === 1));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ id: 2, jsonrpc: "2.0", method: "tools/list" });
    send({ id: 3, jsonrpc: "2.0", method: "resources/list" });
    send({ id: 4, jsonrpc: "2.0", method: "prompts/list" });
    await wait(
      () => replies.filter((x) => [2, 3, 4].includes(x.id)).length === 3
    );
    expect(
      replies.find((x) => x.id === 2).result.tools.map((x: any) => x.name)
    ).toContain("create_event");
    expect(replies.find((x) => x.id === 3).result.resources[0].uri).toBe(
      "calendar://calendars"
    );
    expect(replies.find((x) => x.id === 4).result.prompts).toHaveLength(3);
    child.kill();
    await once(child, "exit");
  }, 20_000);
});
async function wait(ok: () => boolean) {
  for (let i = 0; i < 100 && !ok(); i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!ok()) {
    throw new Error("timeout");
  }
}
