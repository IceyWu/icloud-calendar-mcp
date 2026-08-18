import type { CalDavObject, CalDavPort } from "../../src/caldav/client.js";
import { CalendarError } from "../../src/domain/errors.js";
import type { Calendar } from "../../src/domain/types.js";

export class FakeCalDav implements CalDavPort {
  conflictNextUpdate = false;
  readonly calendars: Calendar[] = [
    { id: "/calendars/test/", name: "Test", readOnly: false },
  ];
  readonly objects = new Map<string, CalDavObject>();
  calls = { create: 0, delete: 0, update: 0 };
  async listCalendars() {
    return this.calendars;
  }
  async query(calendarId: string) {
    return [...this.objects.values()].filter((x) =>
      x.href.startsWith(calendarId)
    );
  }
  async get(href: string) {
    const x = this.objects.get(href);
    if (!x) {
      throw new CalendarError("EVENT_NOT_FOUND", "missing");
    }
    return x;
  }
  async create(calendarId: string, uid: string, ics: string) {
    this.calls.create++;
    const href = `${calendarId}${uid}.ics`;
    if (this.objects.has(href)) {
      throw new CalendarError("ETAG_CONFLICT", "exists");
    }
    const x = { data: ics, etag: '"1"', href };
    this.objects.set(href, x);
    return x;
  }
  async update(href: string, etag: string, ics: string) {
    this.calls.update++;
    const old = await this.get(href);
    if (this.conflictNextUpdate) {
      this.conflictNextUpdate = false;
      throw new CalendarError("ETAG_CONFLICT", "concurrent write");
    }
    if (old.etag !== etag) {
      throw new CalendarError("ETAG_CONFLICT", "stale");
    }
    const x = { data: ics, etag: '"2"', href };
    this.objects.set(href, x);
    return x;
  }
  async delete(href: string, etag: string) {
    this.calls.delete++;
    const old = await this.get(href);
    if (old.etag !== etag) {
      throw new CalendarError("ETAG_CONFLICT", "stale");
    }
    this.objects.delete(href);
  }
}
