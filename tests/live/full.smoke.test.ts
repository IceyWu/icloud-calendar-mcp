import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CalendarService } from "../../src/application/calendar-service.js";
import { ICloudCalDavClient } from "../../src/caldav/client.js";
import { CalendarError } from "../../src/domain/errors.js";
import { Journal } from "../../src/infrastructure/journal.js";

const enabled =
  process.env.ICLOUD_LIVE_WRITE === "1" &&
  Boolean(process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD);

describe.skipIf(!enabled)("live iCloud full feature smoke", () => {
  let service: CalendarService;
  let calendarId: string;
  const cleanup: { handle: string; requestId: string }[] = [];
  const marker = `icloud-calendar-mcp-${Date.now()}`;

  beforeAll(async () => {
    const journal = new Journal(
      await mkdtemp(path.join(tmpdir(), "icloud-live-"))
    );
    await journal.init();
    service = new CalendarService(
      new ICloudCalDavClient(
        process.env.ICLOUD_USERNAME ?? "",
        process.env.ICLOUD_APP_PASSWORD ?? ""
      ),
      journal,
      120,
      120,
      200
    );
    const calendars = await service.listCalendars();
    const candidates = calendars.filter((calendar) => !calendar.readOnly);
    for (const [index, candidate] of candidates.entries()) {
      try {
        const probe = await service.createEvent(
          candidate.id,
          {
            end: "2035-06-17T00:10:00Z",
            start: "2035-06-17T00:00:00Z",
            timezone: "UTC",
            title: `[TEST] ${marker} write probe`,
          },
          `${marker}-probe-create-${index}`
        );
        cleanup.push({
          handle: probe.handle,
          requestId: `${marker}-probe-cleanup-${index}`,
        });
        await service.deleteEvent(
          probe.handle,
          `${marker}-probe-delete-${index}`
        );
        cleanup.pop();
        calendarId = candidate.id;
        break;
      } catch (error) {
        if (
          error instanceof CalendarError &&
          error.code === "AUTH_FAILED" &&
          error.message.includes("HTTP 403")
        ) {
          continue;
        }
        throw error;
      }
    }
    if (!calendarId) {
      throw new Error(
        `No actually writable iCloud calendar found among ${candidates.length} candidates`
      );
    }
  }, 60_000);

  afterAll(async () => {
    for (let index = cleanup.length - 1; index >= 0; index--) {
      const item = cleanup[index];
      if (!item) continue;
      try {
        await service.deleteEvent(item.handle, item.requestId);
      } catch {
        // Cleanup is best effort; individual tests also delete on their success path.
      }
    }
  }, 60_000);

  it("covers timed CRUD, idempotency, conflicts and free/busy", async () => {
    const requestId = `${marker}-timed-create`;
    const created = await service.createEvent(
      calendarId,
      {
        alarms: [
          { description: "MCP smoke reminder", triggerMinutesBefore: 10 },
        ],
        description:
          "Temporary event created by the local full-feature smoke test.",
        end: "2035-06-18T11:00:00+08:00",
        location: "Local MCP smoke test",
        start: "2035-06-18T10:00:00+08:00",
        timezone: "Asia/Shanghai",
        title: `[TEST] ${marker} timed`,
        url: "https://github.com/IceyWu/icloud-calendar-mcp",
      },
      requestId
    );
    cleanup.push({
      handle: created.handle,
      requestId: `${marker}-timed-cleanup`,
    });

    const replay = await service.createEvent(
      calendarId,
      {
        alarms: [
          { description: "MCP smoke reminder", triggerMinutesBefore: 10 },
        ],
        description:
          "Temporary event created by the local full-feature smoke test.",
        end: "2035-06-18T11:00:00+08:00",
        location: "Local MCP smoke test",
        start: "2035-06-18T10:00:00+08:00",
        timezone: "Asia/Shanghai",
        title: `[TEST] ${marker} timed`,
        url: "https://github.com/IceyWu/icloud-calendar-mcp",
      },
      requestId
    );
    expect(replay.uid).toBe(created.uid);
    expect((await service.getEvent(created.handle)).title).toContain(marker);

    const listed = await service.listEvents(
      calendarId,
      "2035-06-18T00:00:00+08:00",
      "2035-06-19T00:00:00+08:00",
      50
    );
    expect(listed.items.some((event) => event.uid === created.uid)).toBe(true);

    const conflicts = await service.findConflicts(
      calendarId,
      "2035-06-18T10:30:00+08:00",
      "2035-06-18T10:45:00+08:00"
    );
    expect(conflicts.hasConflict).toBe(true);
    const busy = await service.freeBusy(
      calendarId,
      "2035-06-18T00:00:00+08:00",
      "2035-06-19T00:00:00+08:00"
    );
    expect(busy.busy.length).toBeGreaterThan(0);

    const updated = await service.updateEvent(
      created.handle,
      { title: `[TEST] ${marker} updated` },
      `${marker}-timed-update`
    );
    expect(updated.title).toContain("updated");
    await service.deleteEvent(created.handle, `${marker}-timed-delete`);
    cleanup.splice(
      cleanup.findIndex((item) => item.handle === created.handle),
      1
    );
  }, 90_000);

  it("covers all-day semantics", async () => {
    const created = await service.createEvent(
      calendarId,
      {
        allDay: true,
        end: "2035-06-21",
        start: "2035-06-20",
        timezone: "Asia/Shanghai",
        title: `[TEST] ${marker} all-day`,
      },
      `${marker}-all-day-create`
    );
    cleanup.push({
      handle: created.handle,
      requestId: `${marker}-all-day-cleanup`,
    });
    const read = await service.getEvent(created.handle);
    expect(read).toMatchObject({
      allDay: true,
      end: "2035-06-21",
      start: "2035-06-20",
    });
    await service.deleteEvent(created.handle, `${marker}-all-day-delete`);
    cleanup.splice(
      cleanup.findIndex((item) => item.handle === created.handle),
      1
    );
  }, 60_000);

  it("covers RRULE creation and occurrence expansion", async () => {
    const created = await service.createEvent(
      calendarId,
      {
        end: "2035-06-23T10:30:00+08:00",
        rrule: "FREQ=DAILY;COUNT=3",
        start: "2035-06-23T10:00:00+08:00",
        timezone: "Asia/Shanghai",
        title: `[TEST] ${marker} recurring`,
      },
      `${marker}-rrule-create`
    );
    cleanup.push({
      handle: created.handle,
      requestId: `${marker}-rrule-cleanup`,
    });
    const listed = await service.listEvents(
      calendarId,
      "2035-06-23T00:00:00+08:00",
      "2035-06-27T00:00:00+08:00",
      50
    );
    expect(
      listed.items.filter((event) => event.uid === created.uid).length
    ).toBe(3);
    await service.deleteEvent(created.handle, `${marker}-rrule-delete`);
    cleanup.splice(
      cleanup.findIndex((item) => item.handle === created.handle),
      1
    );
  }, 90_000);
});
