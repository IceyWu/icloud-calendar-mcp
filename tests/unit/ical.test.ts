import { describe, expect, it } from "vitest";

import { buildIcs, parseIcs, validateEvent } from "../../src/caldav/ical.js";
import { CalendarError } from "../../src/domain/errors.js";

describe("iCalendar", () => {
  it("round trips timed DST event, RRULE, alarm and attendee", () => {
    const input = {
      alarms: [{ triggerMinutesBefore: 15 }],
      attendees: [{ email: "a@example.com" as const }],
      end: "2026-03-08T03:30:00-04:00",
      rrule: "FREQ=WEEKLY;COUNT=3",
      start: "2026-03-08T01:30:00-05:00",
      timezone: "America/New_York",
      title: "DST meeting",
    };
    const ics = buildIcs("uid@test", input);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;COUNT=3");
    expect(ics).toContain("VALARM");
    expect(ics).toContain("ATTENDEE");
    expect(parseIcs(ics)[0]).toMatchObject({
      title: "DST meeting",
      uid: "uid@test",
    });
  });
  it("uses exclusive end for all-day events", () => {
    const ics = buildIcs("day@test", {
      allDay: true,
      end: "2026-08-20",
      start: "2026-08-18",
      timezone: "Asia/Shanghai",
      title: "Trip",
    });
    expect(ics).toContain("DTEND;VALUE=DATE:20260820");
    expect(parseIcs(ics)[0]).toMatchObject({
      allDay: true,
      end: "2026-08-20",
      start: "2026-08-18",
    });
  });
  it("rejects invalid ranges", () => {
    expect(() =>
      validateEvent({
        allDay: true,
        end: "2026-01-01",
        start: "2026-01-02",
        timezone: "UTC",
        title: "x",
      })
    ).toThrow(CalendarError);
  });
});
