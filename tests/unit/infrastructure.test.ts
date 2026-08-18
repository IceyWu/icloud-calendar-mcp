import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { sanitizeError } from "../../src/domain/errors.js";
import { Journal } from "../../src/infrastructure/journal.js";
import { RateLimiter } from "../../src/infrastructure/rate-limit.js";

describe("infrastructure", () => {
  it("persists handles and idempotency across restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "journal-"));
    const a = new Journal(dir);
    await a.init();
    const h = await a.putHandle("/c/", "/c/e.ics", "u", '"1"');
    await a.record("request-1", "create", "fp", { h });
    const b = new Journal(dir);
    await b.init();
    expect(b.getHandle(h)?.uid).toBe("u");
    expect(b.replay("request-1", "create", "fp")).toEqual({ h });
    expect(() => b.replay("request-1", "delete", "fp")).toThrow();
  });
  it("limits requests", () => {
    const r = new RateLimiter();
    r.take("x", 1, 1000);
    expect(() => r.take("x", 1, 1001)).toThrowError(/rate limit/i);
    r.take("x", 1, 62_000);
  });
  it("redacts credentials and private URLs", () => {
    const s = sanitizeError(
      new Error(
        "Basic abc123 https://caldav.icloud.com/private/u a@example.com Bearer secret"
      )
    );
    expect(s).not.toContain("abc123");
    expect(s).not.toContain("/private/u");
    expect(s).not.toContain("a@example.com");
    expect(s).not.toContain("secret");
  });
  it("keeps stdout clean in logger", async () => {
    const out = vi.spyOn(process.stdout, "write");
    const { Logger } = await import("../../src/infrastructure/logger.js");
    new Logger().info("hello");
    expect(out).not.toHaveBeenCalled();
    out.mockRestore();
  });
});
