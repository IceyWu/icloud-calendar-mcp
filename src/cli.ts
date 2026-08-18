#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CalendarService } from "./application/calendar-service.js";
import { ICloudCalDavClient } from "./caldav/client.js";
import { loadConfig } from "./config.js";
import { Journal } from "./infrastructure/journal.js";
import { Logger } from "./infrastructure/logger.js";
import { createMcpServer } from "./mcp/server.js";
import { startHttp } from "./transport/http.js";

async function main(): Promise<void> {
  const logger = new Logger();
  const config = await loadConfig();
  const journal = new Journal(config.dataDir);
  await journal.init();
  const client = new ICloudCalDavClient(
    config.username,
    config.password,
    config.timeoutMs
  );
  const service = new CalendarService(
    client,
    journal,
    config.readRatePerMinute,
    config.writeRatePerMinute,
    config.maxEvents
  );
  if (config.mode === "http") {
    startHttp(service, config, logger);
    return;
  }
  const server = createMcpServer(service);
  await server.connect(new StdioServerTransport());
  logger.info("stdio transport ready");
}
main().catch((error) => {
  new Logger().error("Fatal startup error", error);
  process.exitCode = 1;
});
