import { createHash } from "node:crypto";

import type { CalDavPort } from "../caldav/client.js";
import { buildIcs, parseIcs } from "../caldav/ical.js";
import { CalendarError } from "../domain/errors.js";
import type {
  Calendar,
  EventInput,
  EventRecord,
  Page,
  Scope,
} from "../domain/types.js";
import type { Journal } from "../infrastructure/journal.js";
import { RateLimiter } from "../infrastructure/rate-limit.js";

export class CalendarService {
  private readonly limiter = new RateLimiter();
  constructor(
    private readonly client: CalDavPort,
    private readonly journal: Journal,
    private readonly readLimit = 60,
    private readonly writeLimit = 20,
    private readonly maxEvents = 200
  ) {}
  async listCalendars(): Promise<Calendar[]> {
    this.limiter.take("read", this.readLimit);
    return this.client.listCalendars();
  }
  async listEvents(
    calendarId: string,
    start: string,
    end: string,
    limit = 100,
    cursor?: string
  ): Promise<Page<EventRecord>> {
    this.limiter.take("read", this.readLimit);
    const safeLimit = Math.min(limit, this.maxEvents);
    const offset = cursor
      ? Number(Buffer.from(cursor, "base64url").toString())
      : 0;
    const objects = await this.client.query(calendarId, start, end);
    const records: EventRecord[] = [];
    for (const object of objects) {
      for (const e of parseIcs(object.data)) {
        const handle = await this.journal.putHandle(
          calendarId,
          object.href,
          e.uid,
          object.etag
        );
        records.push({
          ...e,
          calendarId,
          etag: object.etag,
          handle,
          href: object.href,
        });
      }
    }
    records.sort((a, b) => a.start.localeCompare(b.start));
    const items = records.slice(offset, offset + safeLimit);
    const next =
      offset + safeLimit < records.length
        ? Buffer.from(String(offset + safeLimit)).toString("base64url")
        : undefined;
    return {
      items,
      ...(next ? { nextCursor: next } : {}),
      truncated: Boolean(next),
    };
  }
  async getEvent(handle: string): Promise<EventRecord> {
    this.limiter.take("read", this.readLimit);
    const h = this.requireHandle(handle);
    const o = await this.client.get(h.href);
    const e = parseIcs(o.data)[0];
    if (!e) {
      throw new CalendarError("EVENT_NOT_FOUND", "Event data is empty");
    }
    await this.journal.updateEtag(handle, o.etag);
    return {
      ...e,
      calendarId: h.calendarId,
      etag: o.etag,
      handle,
      href: h.href,
    };
  }
  async createEvent(
    calendarId: string,
    event: EventInput,
    requestId: string
  ): Promise<EventRecord> {
    return this.idempotent(
      "create_event",
      requestId,
      { calendarId, event },
      async () => {
        this.limiter.take("write", this.writeLimit);
        const uid = stableUid(requestId);
        const o = await this.client.create(
          calendarId,
          uid,
          buildIcs(uid, event)
        );
        const handle = await this.journal.putHandle(
          calendarId,
          o.href,
          uid,
          o.etag
        );
        return {
          ...event,
          calendarId,
          etag: o.etag,
          handle,
          href: o.href,
          uid,
        };
      }
    );
  }
  async updateEvent(
    handle: string,
    patch: Partial<EventInput>,
    requestId: string,
    scope: Scope = "whole_series"
  ): Promise<EventRecord> {
    if (scope !== "whole_series") {
      throw new CalendarError(
        "UNSUPPORTED_OPERATION",
        `${scope} requires verified iCloud recurrence exception support; no whole-series fallback is performed`
      );
    }
    return this.idempotent(
      "update_event",
      requestId,
      { handle, patch, scope },
      async () => {
        this.limiter.take("write", this.writeLimit);
        const current = await this.getEvent(handle);
        const next = { ...current, ...patch };
        const o = await this.client.update(
          current.href,
          current.etag,
          buildIcs(current.uid, next, 1)
        );
        await this.journal.updateEtag(handle, o.etag);
        return { ...next, etag: o.etag };
      }
    );
  }
  async deleteEvent(
    handle: string,
    requestId: string,
    scope: Scope = "whole_series"
  ): Promise<{ deleted: true; handle: string }> {
    if (scope !== "whole_series") {
      throw new CalendarError(
        "UNSUPPORTED_OPERATION",
        `${scope} deletion is not safely supported; no whole-series fallback is performed`
      );
    }
    return this.idempotent(
      "delete_event",
      requestId,
      { handle, scope },
      async () => {
        this.limiter.take("write", this.writeLimit);
        const h = this.requireHandle(handle);
        await this.client.delete(h.href, h.etag);
        await this.journal.removeHandle(handle);
        return { deleted: true as const, handle };
      }
    );
  }
  async findConflicts(
    calendarId: string,
    start: string,
    end: string,
    excludeHandle?: string
  ): Promise<{ conflicts: EventRecord[]; hasConflict: boolean }> {
    const page = await this.listEvents(calendarId, start, end, this.maxEvents);
    const conflicts = page.items.filter(
      (e) => e.handle !== excludeHandle && e.start < end && e.end > start
    );
    return { conflicts, hasConflict: conflicts.length > 0 };
  }
  async freeBusy(
    calendarId: string,
    start: string,
    end: string
  ): Promise<{
    busy: { start: string; end: string }[];
    source: "client_computed";
  }> {
    const page = await this.listEvents(calendarId, start, end, this.maxEvents);
    return {
      busy: merge(page.items.map((e) => ({ end: e.end, start: e.start }))),
      source: "client_computed",
    };
  }
  private requireHandle(handle: string) {
    const h = this.journal.getHandle(handle);
    if (!h) {
      throw new CalendarError(
        "EVENT_NOT_FOUND",
        "Unknown or expired event handle; list events again"
      );
    }
    return h;
  }
  private async idempotent<T>(
    op: string,
    id: string,
    input: unknown,
    run: () => Promise<T>
  ): Promise<T> {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) {
      throw new CalendarError(
        "INVALID_EVENT",
        "request_id must be 8-128 safe characters"
      );
    }
    const fp = this.journal.fingerprint(input);
    const replay = this.journal.replay(id, op, fp);
    if (replay !== undefined) {
      return replay as T;
    }
    const result = await run();
    await this.journal.record(id, op, fp, result);
    return result;
  }
}
function stableUid(requestId: string): string {
  const digest = createHash("sha256")
    .update(requestId)
    .digest("hex")
    .slice(0, 24);
  return `${digest}@icloud-calendar-mcp`;
}
function merge(
  xs: { start: string; end: string }[]
): { start: string; end: string }[] {
  const sorted = [...xs].sort((a, b) => a.start.localeCompare(b.start));
  const out: { start: string; end: string }[] = [];
  for (const x of sorted) {
    const last = out.at(-1);
    if (last && x.start <= last.end) {
      if (x.end > last.end) {
        last.end = x.end;
      }
    } else {
      out.push({ ...x });
    }
  }
  return out;
}
