import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";

describe("configuration", () => {
  it("loads minimum stdio environment", async () => {
    const config = await loadConfig({
      ICLOUD_USERNAME: "a@example.com",
      ICLOUD_APP_PASSWORD: "xxxx-xxxx",
    });
    expect(config.mode).toBe("stdio");
    expect(config.allowedHosts).toContain("localhost");
  });
  it("requires a strong token in HTTP mode", async () => {
    await expect(
      loadConfig({
        ICLOUD_USERNAME: "a@example.com",
        ICLOUD_APP_PASSWORD: "xxxx-xxxx",
        ICLOUD_MCP_TRANSPORT: "http",
        ICLOUD_MCP_HTTP_TOKEN: "short",
      })
    ).rejects.toThrow(/TOKEN/);
  });
  it("loads typed JSON settings", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "config-"));
    const file = path.join(dir, "config.json");
    await writeFile(
      file,
      JSON.stringify({
        timeoutMs: 5000,
        allowedOrigins: ["https://client.test"],
      })
    );
    const config = await loadConfig({
      ICLOUD_USERNAME: "a@example.com",
      ICLOUD_APP_PASSWORD: "xxxx-xxxx",
      ICLOUD_MCP_CONFIG: file,
    });
    expect(config.timeoutMs).toBe(5000);
  });
});
