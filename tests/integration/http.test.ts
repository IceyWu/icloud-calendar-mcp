import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CalendarService } from "../../src/application/calendar-service.js";
import type { AppConfig } from "../../src/config.js";
import { Journal } from "../../src/infrastructure/journal.js";
import { Logger } from "../../src/infrastructure/logger.js";
import { startHttp } from "../../src/transport/http.js";
import { FakeCalDav } from "../fixtures/fake-caldav.js";

describe("HTTP security", () => {
  const servers: ReturnType<typeof startHttp>[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
    );
  });
  it("exposes health while protecting MCP, Host, origin and body size", async () => {
    const journal = new Journal(await mkdtemp(path.join(tmpdir(), "http-")));
    await journal.init();
    const config: AppConfig = {
      allowedHosts: ["127.0.0.1"],
      allowedOrigins: ["https://ok.test"],
      dataDir: "unused",
      httpPort: 0,
      httpToken: "a".repeat(24),
      maxEvents: 100,
      maxRequestBytes: 128,
      mode: "http",
      password: "xxxx-xxxx",
      readRatePerMinute: 60,
      timeoutMs: 2000,
      username: "a@example.com",
      writeRatePerMinute: 20,
    };
    const server = startHttp(
      new CalendarService(new FakeCalDav(), journal),
      config,
      new Logger()
    );
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          body: "{}",
        })
      ).status
    ).toBe(401);
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.httpToken}`,
            Origin: "https://evil.test",
          },
          body: "{}",
        })
      ).status
    ).toBe(403);
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.httpToken}` },
          body: "x".repeat(200),
        })
      ).status
    ).toBe(413);
  });
});
