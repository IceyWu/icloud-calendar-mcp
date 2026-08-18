import { XMLParser } from "fast-xml-parser";

import { CalendarError } from "../domain/errors.js";
import type { Calendar } from "../domain/types.js";

export interface CalDavObject {
  href: string;
  etag: string;
  data: string;
}
export interface CalDavPort {
  listCalendars(): Promise<Calendar[]>;
  query(
    calendarId: string,
    start: string,
    end: string
  ): Promise<CalDavObject[]>;
  get(href: string): Promise<CalDavObject>;
  create(calendarId: string, uid: string, ics: string): Promise<CalDavObject>;
  update(href: string, etag: string, ics: string): Promise<CalDavObject>;
  delete(href: string, etag: string): Promise<void>;
}
const ORIGIN = "https://caldav.icloud.com";
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: "#text",
});
function list<T>(x: T | T[] | undefined): T[] {
  return x === undefined ? [] : Array.isArray(x) ? x : [x];
}
function calendarProperty(response: any): any | undefined {
  return list(response?.propstat).find((propstat: any) => {
    const resourceType = propstat?.prop?.resourcetype;
    return (
      resourceType !== null &&
      typeof resourceType === "object" &&
      Object.hasOwn(resourceType, "calendar")
    );
  })?.prop;
}
function hasWritePrivilege(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Object.hasOwn(value, "write") || Object.hasOwn(value, "write-content")) {
    return true;
  }
  return Object.values(value).some((child) => hasWritePrivilege(child));
}
export class ICloudCalDavClient implements CalDavPort {
  private principal?: string;
  private home?: string;
  private origin = ORIGIN;
  private readonly originsByPath = new Map<string, string>();
  constructor(
    private readonly username: string,
    private readonly password: string,
    private readonly timeoutMs = 25_000
  ) {}
  async listCalendars(): Promise<Calendar[]> {
    await this.discover();
    const xml = await this.request(
      this.home!,
      "PROPFIND",
      `<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:prop><d:displayname/><d:resourcetype/><d:current-user-privilege-set/><cs:getctag/></d:prop></d:propfind>`,
      { Depth: "1" }
    );
    const doc = parser.parse(xml.body) as any;
    return list(doc.multistatus?.response)
      .map((response: any) => ({
        prop: calendarProperty(response),
        response,
      }))
      .filter((item) => item.prop !== undefined)
      .map(({ prop, response }) => ({
        id: this.safePath(String(response.href)),
        name: String(prop?.displayname ?? "Calendar"),
        readOnly: !hasWritePrivilege(prop?.["current-user-privilege-set"]),
      }));
  }
  async query(
    calendarId: string,
    start: string,
    end: string
  ): Promise<CalDavObject[]> {
    const path = this.safePath(calendarId);
    const body = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data><c:expand start="${utc(start)}" end="${utc(end)}"/></c:calendar-data></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${utc(start)}" end="${utc(end)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    const r = await this.request(path, "REPORT", body, { Depth: "1" });
    return this.objects(r.body);
  }
  async get(href: string): Promise<CalDavObject> {
    const path = this.safePath(href);
    const r = await this.request(path, "GET");
    return { data: r.body, etag: r.headers.get("etag") ?? "", href: path };
  }
  async create(
    calendarId: string,
    uid: string,
    ics: string
  ): Promise<CalDavObject> {
    const href = `${this.safePath(calendarId).replace(/\/?$/, "/")}${encodeURIComponent(uid)}.ics`;
    let r: { body: string; headers: Headers };
    try {
      r = await this.request(href, "PUT", ics, {
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*",
      });
    } catch (error) {
      if (error instanceof CalendarError && error.code === "ETAG_CONFLICT") {
        return this.visibleGet(href);
      }
      throw error;
    }
    return {
      data: ics,
      etag: r.headers.get("etag") ?? (await this.visibleGet(href)).etag,
      href,
    };
  }
  async update(href: string, etag: string, ics: string): Promise<CalDavObject> {
    const path = this.safePath(href);
    const r = await this.request(path, "PUT", ics, {
      "Content-Type": "text/calendar; charset=utf-8",
      "If-Match": etag,
    });
    return {
      data: ics,
      etag: r.headers.get("etag") ?? (await this.visibleGet(path)).etag,
      href: path,
    };
  }
  async delete(href: string, etag: string): Promise<void> {
    await this.request(this.safePath(href), "DELETE", undefined, {
      "If-Match": etag,
    });
  }
  private async visibleGet(href: string): Promise<CalDavObject> {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.get(href);
      } catch (error) {
        last = error;
        if (
          !(error instanceof CalendarError) ||
          error.code !== "EVENT_NOT_FOUND"
        ) {
          throw error;
        }
        await delay(100 * 2 ** attempt);
      }
    }
    throw last;
  }
  private async discover(): Promise<void> {
    if (this.home) {
      return;
    }
    const p = await this.request(
      "/",
      "PROPFIND",
      '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
      { Depth: "0" }
    );
    const pd = parser.parse(p.body) as any;
    this.principal = this.safePath(
      String(
        pd.multistatus?.response?.propstat?.prop?.["current-user-principal"]
          ?.href
      )
    );
    const h = await this.request(
      this.principal,
      "PROPFIND",
      '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
      { Depth: "0" }
    );
    const hd = parser.parse(h.body) as any;
    this.home = this.safePath(
      String(
        hd.multistatus?.response?.propstat?.prop?.["calendar-home-set"]?.href
      )
    );
  }
  private objects(xml: string): CalDavObject[] {
    const d = parser.parse(xml) as any;
    return list(d.multistatus?.response)
      .map((r: any) => ({
        data: String(r.propstat?.prop?.["calendar-data"] ?? ""),
        etag: String(r.propstat?.prop?.getetag ?? ""),
        href: this.safePath(String(r.href)),
      }))
      .filter((x) => x.data);
  }
  private safePath(value: string): string {
    const isAbsolute = /^[A-Za-z][A-Za-z\d+.-]*:/u.test(value);
    const u = new URL(value, this.origin);
    if (!isAllowedICloudOrigin(u.origin) || !u.pathname.startsWith("/")) {
      throw new CalendarError(
        "UNSUPPORTED_OPERATION",
        "Rejected non-iCloud CalDAV URL"
      );
    }
    if (isAbsolute) {
      this.origin = u.origin;
      this.originsByPath.set(u.pathname, u.origin);
    }
    return u.pathname;
  }
  private originForPath(path: string): string {
    const match = [...this.originsByPath.entries()]
      .filter(([prefix]) => path.startsWith(prefix))
      .sort(([left], [right]) => right.length - left.length)[0];
    return match?.[1] ?? this.origin;
  }
  private async fetchWithRedirects(
    path: string,
    method: string,
    body: string | undefined,
    headers: Record<string, string>
  ): Promise<Response> {
    let target = new URL(path, this.originForPath(path));
    for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
      const response = await fetch(target, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
          ...headers,
        },
        ...(body === undefined ? {} : { body }),
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) {
        throw new CalendarError(
          "TEMPORARY_UNAVAILABLE",
          "iCloud redirect did not include a Location header"
        );
      }
      target = new URL(location, target);
      if (!isAllowedICloudOrigin(target.origin)) {
        throw new CalendarError(
          "UNSUPPORTED_OPERATION",
          "Rejected non-iCloud CalDAV redirect"
        );
      }
      this.origin = target.origin;
    }
    throw new CalendarError(
      "TEMPORARY_UNAVAILABLE",
      "Too many iCloud CalDAV redirects",
      true
    );
  }
  private validateResponse(response: Response): void {
    const responseOrigin = new URL(response.url).origin;
    if (!isAllowedICloudOrigin(responseOrigin)) {
      throw new CalendarError(
        "UNSUPPORTED_OPERATION",
        "Rejected non-iCloud CalDAV redirect"
      );
    }
    this.origin = responseOrigin;
    if (response.status === 401 || response.status === 403) {
      throw new CalendarError(
        "AUTH_FAILED",
        `iCloud authentication or authorization failed (HTTP ${response.status})`
      );
    }
    if (response.status === 404) {
      throw new CalendarError("EVENT_NOT_FOUND", "CalDAV object not found");
    }
    if (response.status === 409 || response.status === 412) {
      throw new CalendarError("ETAG_CONFLICT", "CalDAV precondition failed");
    }
  }
  private async request(
    path: string,
    method: string,
    body?: string,
    headers: Record<string, string> = {}
  ): Promise<{ body: string; headers: Headers }> {
    let last: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await this.fetchWithRedirects(
          path,
          method,
          body,
          headers
        );
        this.validateResponse(response);
        if (response.status === 429) {
          last = new CalendarError(
            "RATE_LIMITED",
            "iCloud rate limited the request",
            true
          );
          await delay(retryMs(response, attempt));
          continue;
        }
        if (response.status >= 500) {
          last = new CalendarError(
            "TEMPORARY_UNAVAILABLE",
            "iCloud is temporarily unavailable",
            true
          );
          await delay(retryMs(response, attempt));
          continue;
        }
        if (!response.ok && response.status !== 207) {
          throw new CalendarError(
            "TEMPORARY_UNAVAILABLE",
            `CalDAV returned HTTP ${response.status}`,
            response.status >= 500
          );
        }
        return { body: await response.text(), headers: response.headers };
      } catch (error) {
        if (error instanceof CalendarError && !error.retryable) throw error;
        last = error;
        if (attempt < 3) {
          await delay(250 * 2 ** attempt);
        }
      }
    }
    throw last instanceof CalendarError
      ? last
      : new CalendarError(
          "TEMPORARY_UNAVAILABLE",
          "iCloud request failed",
          true
        );
  }
}
function utc(v: string): string {
  return new Date(v)
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
function isAllowedICloudOrigin(origin: string): boolean {
  const url = new URL(origin);
  return (
    url.protocol === "https:" &&
    (url.hostname === "caldav.icloud.com" ||
      /^p\d+-caldav\.icloud\.com$/u.test(url.hostname))
  );
}
function retryMs(r: Response, a: number): number {
  const x = r.headers.get("retry-after");
  return x && /^\d+$/.test(x)
    ? Number(x) * 1000
    : 250 * 2 ** a + Math.floor(Math.random() * 100);
}
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
