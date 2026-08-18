import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { CalendarService } from "../../src/application/calendar-service.js";
import { Journal } from "../../src/infrastructure/journal.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { FakeCalDav } from "../fixtures/fake-caldav.js";

describe("MCP contracts", () => {
  it("returns structured and text content through the official client", async () => {
    const journal = new Journal(await mkdtemp(path.join(tmpdir(), "mcp-")));
    await journal.init();
    const server = createMcpServer(
      new CalendarService(new FakeCalDav(), journal)
    );
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    expect((await client.listTools()).tools).toHaveLength(8);
    expect((await client.listResources()).resources[0]?.uri).toBe(
      "calendar://calendars"
    );
    expect((await client.listPrompts()).prompts).toHaveLength(3);
    const result = await client.callTool({
      name: "list_calendars",
      arguments: {},
    });
    expect(result.structuredContent).toMatchObject({
      calendars: [{ name: "Test" }],
    });
    const bad = await client.callTool({
      name: "get_event",
      arguments: { event_handle: "bad" },
    });
    expect(bad.isError).toBe(true);
    await client.close();
    await server.close();
  });
});
