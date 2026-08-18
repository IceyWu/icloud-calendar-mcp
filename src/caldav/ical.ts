import ICAL from "ical.js";
import { DateTime } from "luxon";

import { CalendarError } from "../domain/errors.js";
import type { EventInput } from "../domain/types.js";

function time(value: string, timezone: string, allDay: boolean): ICAL.Time {
  if (allDay) {
    const d = DateTime.fromISO(value, { zone: timezone });
    return new ICAL.Time(
      { day: d.day, isDate: true, month: d.month, year: d.year },
      ICAL.Timezone.localTimezone
    );
  }
  const d = DateTime.fromISO(value, { setZone: true });
  if (!d.isValid) {
    throw new CalendarError("INVALID_EVENT", `Invalid date-time: ${value}`);
  }
  const t = ICAL.Time.fromJSDate(d.toJSDate(), true);
  if (timezone !== "UTC") {
    t.zone = ICAL.TimezoneService.get(timezone) ?? ICAL.Timezone.utcTimezone;
  }
  return t;
}
export function buildIcs(uid: string, event: EventInput, sequence = 0): string {
  validateEvent(event);
  const cal = new ICAL.Component(["vcalendar", [], []]);
  cal.updatePropertyWithValue("prodid", "-//icloud-calendar-mcp//EN");
  cal.updatePropertyWithValue("version", "2.0");
  cal.updatePropertyWithValue("calscale", "GREGORIAN");
  const vevent = new ICAL.Component("vevent");
  const e = new ICAL.Event(vevent);
  e.uid = uid;
  e.summary = event.title;
  e.startDate = time(event.start, event.timezone, event.allDay ?? false);
  e.endDate = time(event.end, event.timezone, event.allDay ?? false);
  e.sequence = sequence;
  vevent.updatePropertyWithValue("dtstamp", ICAL.Time.now());
  if (event.description) {
    e.description = event.description;
  }
  if (event.location) {
    e.location = event.location;
  }
  if (event.url) {
    vevent.updatePropertyWithValue("url", event.url);
  }
  if (event.rrule) {
    vevent.updatePropertyWithValue("rrule", ICAL.Recur.fromString(event.rrule));
  }
  for (const a of event.alarms ?? []) {
    const alarm = new ICAL.Component("valarm");
    alarm.updatePropertyWithValue("action", "DISPLAY");
    alarm.updatePropertyWithValue("description", a.description ?? event.title);
    alarm.updatePropertyWithValue(
      "trigger",
      ICAL.Duration.fromSeconds(-a.triggerMinutesBefore * 60)
    );
    vevent.addSubcomponent(alarm);
  }
  for (const a of event.attendees ?? []) {
    const p = vevent.addPropertyWithValue("attendee", `mailto:${a.email}`);
    if (a.name) {
      p.setParameter("cn", a.name);
    }
    p.setParameter("role", a.role ?? "REQ-PARTICIPANT");
    p.setParameter("partstat", a.status ?? "NEEDS-ACTION");
  }
  cal.addSubcomponent(vevent);
  return cal.toString();
}
export function parseIcs(ics: string): (Omit<EventInput, "timezone"> & {
  uid: string;
  timezone: string;
  recurrenceId?: string;
})[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  return root.getAllSubcomponents("vevent").map((c) => {
    const e = new ICAL.Event(c);
    const allDay = e.startDate.isDate;
    const zone = e.startDate.zone?.tzid ?? "UTC";
    const iso = (t: ICAL.Time) =>
      allDay
        ? `${t.year.toString().padStart(4, "0")}-${t.month.toString().padStart(2, "0")}-${t.day.toString().padStart(2, "0")}`
        : DateTime.fromJSDate(t.toJSDate(), {
            zone: zone === "floating" ? "UTC" : zone,
          }).toISO()!;
    const r = c.getFirstPropertyValue("rrule") as ICAL.Recur | null;
    const url = c.getFirstPropertyValue("url");
    const recurrenceId = c.getFirstPropertyValue(
      "recurrence-id"
    ) as ICAL.Time | null;
    return {
      allDay,
      end: iso(e.endDate),
      start: iso(e.startDate),
      timezone: zone,
      title: e.summary,
      uid: e.uid,
      ...(e.description ? { description: e.description } : {}),
      ...(e.location ? { location: e.location } : {}),
      ...(typeof url === "string" ? { url } : {}),
      ...(r ? { rrule: r.toString() } : {}),
      ...(recurrenceId ? { recurrenceId: recurrenceId.toString() } : {}),
    };
  });
}
export function validateEvent(e: EventInput): void {
  const s = DateTime.fromISO(e.start, { zone: e.timezone });
  const end = DateTime.fromISO(e.end, { zone: e.timezone });
  if (!s.isValid || !end.isValid || end <= s) {
    throw new CalendarError("INVALID_EVENT", "end must be after start");
  }
  if (
    e.allDay &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(e.start) || !/^\d{4}-\d{2}-\d{2}$/.test(e.end))
  ) {
    throw new CalendarError(
      "INVALID_EVENT",
      "All-day dates must use YYYY-MM-DD with exclusive end"
    );
  }
  if (e.title.length > 1000) {
    throw new CalendarError("INVALID_EVENT", "title is too long");
  }
}
