import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { CalendarService } from "../../src/application/calendar-service.js";
import { CalendarError } from "../../src/domain/errors.js";
import { Journal } from "../../src/infrastructure/journal.js";
import { FakeCalDav } from "../fixtures/fake-caldav.js";

describe("CalendarService", () => {
  let fake: FakeCalDav;
  let service: CalendarService;
  beforeEach(async () => {
    fake = new FakeCalDav();
    const j = new Journal(await mkdtemp(join(tmpdir(), "svc-")));
    await j.init();
    service = new CalendarService(fake, j, 100, 100, 100);
  });
  it("does CRUD with replay and handles", async () => {
    const e = {
      end: "2026-08-18T11:00:00+08:00",
      start: "2026-08-18T10:00:00+08:00",
      timezone: "Asia/Shanghai",
      title: "Meet",
    };
    const a = await service.createEvent("/calendars/test/", e, "request-0001");
    const replay = await service.createEvent(
      "/calendars/test/",
      e,
      "request-0001"
    );
    expect(replay).toEqual(a);
    expect(fake.calls.create).toBe(1);
    expect((await service.getEvent(a.handle)).title).toBe("Meet");
    const u = await service.updateEvent(
      a.handle,
      { title: "Changed" },
      "request-0002"
    );
    expect(u.title).toBe("Changed");
    expect(await service.deleteEvent(a.handle, "request-0003")).toMatchObject({
      deleted: true,
    });
    expect(fake.objects.size).toBe(0);
  });
  it("finds conflicts and computes merged busy ranges", async () => {
    const base = { timezone: "UTC" };
    await service.createEvent(
      "/calendars/test/",
      {
        ...base,
        end: "2026-08-18T11:00:00Z",
        start: "2026-08-18T10:00:00Z",
        title: "A",
      },
      "request-a1"
    );
    await service.createEvent(
      "/calendars/test/",
      {
        ...base,
        end: "2026-08-18T12:00:00Z",
        start: "2026-08-18T10:30:00Z",
        title: "B",
      },
      "request-b1"
    );
    expect(
      (
        await service.findConflicts(
          "/calendars/test/",
          "2026-08-18T10:15:00Z",
          "2026-08-18T10:45:00Z"
        )
      ).conflicts
    ).toHaveLength(2);
    expect(
      (
        await service.freeBusy(
          "/calendars/test/",
          "2026-08-18T00:00:00Z",
          "2026-08-19T00:00:00Z"
        )
      ).busy
    ).toHaveLength(1);
  });
  it("refuses unsafe recurrence scope and stale ETags", async () => {
    const e = await service.createEvent(
      "/calendars/test/",
      {
        end: "2026-01-01T11:00:00Z",
        rrule: "FREQ=DAILY",
        start: "2026-01-01T10:00:00Z",
        timezone: "UTC",
        title: "R",
      },
      "request-r1"
    );
    await expect(
      service.deleteEvent(e.handle, "request-r2", "single_occurrence")
    ).rejects.toMatchObject({ code: "UNSUPPORTED_OPERATION" });
    fake.conflictNextUpdate = true;
    await expect(
      service.updateEvent(e.handle, { title: "x" }, "request-r3")
    ).rejects.toBeInstanceOf(CalendarError);
  });
});
