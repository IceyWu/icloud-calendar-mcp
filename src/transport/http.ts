import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { CalendarService } from "../application/calendar-service.js";
import type { AppConfig } from "../config.js";
import type { Logger } from "../infrastructure/logger.js";
import { createMcpServer } from "../mcp/server.js";

export function startHttp(
  service: CalendarService,
  config: AppConfig,
  logger: Logger
) {
  const server = createServer(async (req, res) => {
    try {
      security(req, res, config);
      if (res.writableEnded) {
        return;
      }
      const path = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`
      ).pathname;
      if (path === "/healthz" && req.method === "GET") {
        json(res, 200, { status: "ok" });
        return;
      }
      if (path !== "/mcp") {
        json(res, 404, { error: "not_found" });
        return;
      }
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        json(res, 405, { error: "method_not_allowed" });
        return;
      }
      const body = await readJson(req, config.maxRequestBytes);
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      const mcp = createMcpServer(service);
      await mcp.connect(transport);
      res.on("close", () => {
        void transport.close();
        void mcp.close();
      });
      await transport.handleRequest(req, res, body);
    } catch (error) {
      logger.error("HTTP request failed", error);
      if (res.headersSent) {
        res.end();
      } else {
        json(res, (error as { status?: number }).status ?? 500, {
          error: "request_rejected",
        });
      }
    }
  });
  server.requestTimeout = config.timeoutMs + 5000;
  server.headersTimeout = 10_000;
  server.listen(config.httpPort, "127.0.0.1", () =>
    logger.info("HTTP transport listening", { port: config.httpPort })
  );
  return server;
}
function security(
  req: IncomingMessage,
  res: ServerResponse,
  c: AppConfig
): void {
  const host = (req.headers.host ?? "").split(":")[0] ?? "";
  if (!c.allowedHosts.includes(host)) {
    throw httpError(403);
  }
  const { origin } = req.headers;
  if (origin && !c.allowedOrigins.includes(origin)) {
    throw httpError(403);
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.url?.startsWith("/healthz")) {
    return;
  }
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = c.httpToken ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw httpError(401);
  }
}
async function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += b.length;
    if (size > max) {
      throw httpError(413);
    }
    chunks.push(b);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
}
function json(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(value));
}
function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}
