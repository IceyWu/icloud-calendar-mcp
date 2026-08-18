import { afterEach, describe, expect, it, vi } from "vitest";

import { ICloudCalDavClient } from "../../src/caldav/client.js";

const multistatus = (content: string) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response>${content}</d:response></d:multistatus>`;
const response = (
  body: string,
  status = 207,
  headers: Record<string, string> = {}
) => new Response(status === 204 ? null : body, { status, headers });

describe("iCloud CalDAV adapter", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("discovers principal/home and calendars only on fixed iCloud origin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          multistatus(
            "<d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat>"
          )
        )
      )
      .mockResolvedValueOnce(
        response(
          multistatus(
            "<d:href>/123/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/123/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat>"
          )
        )
      )
      .mockResolvedValueOnce(
        response(
          multistatus(
            "<d:href>/123/calendars/work/</d:href><d:propstat><d:prop><d:displayname>Work</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype></d:prop></d:propstat>"
          )
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const calendars = await new ICloudCalDavClient(
      "a@example.com",
      "app-pass"
    ).listCalendars();
    expect(calendars).toEqual([
      { id: "/123/calendars/work/", name: "Work", readOnly: false },
    ]);
    for (const call of fetchMock.mock.calls)
      expect(String(call[0])).toMatch(/^https:\/\/caldav\.icloud\.com/);
  });
  it("queries and performs conditional CRUD", async () => {
    const ics = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";
    const queryXml = multistatus(
      `<d:href>/c/e.ics</d:href><d:propstat><d:prop><d:getetag>&quot;1&quot;</d:getetag><c:calendar-data>${ics}</c:calendar-data></d:prop></d:propstat>`
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(queryXml))
      .mockResolvedValueOnce(response("", 201, { etag: '"1"' }))
      .mockResolvedValueOnce(response(ics, 200, { etag: '"1"' }))
      .mockResolvedValueOnce(response("", 204, { etag: '"2"' }))
      .mockResolvedValueOnce(response("", 204));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ICloudCalDavClient("a@example.com", "app-pass");
    expect(
      await client.query("/c/", "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")
    ).toMatchObject([{ href: "/c/e.ics" }]);
    expect((await client.create("/c/", "u", ics)).etag).toBe('"1"');
    expect((await client.get("/c/u.ics")).data).toBe(ics);
    expect((await client.update("/c/u.ics", '"1"', ics)).etag).toBe('"2"');
    await client.delete("/c/u.ics", '"2"');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "If-None-Match": "*" }),
      method: "PUT",
    });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "If-Match": '"1"' }),
    });
  });
  it("maps authentication and ETag failures to stable codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("", 401)));
    await expect(
      new ICloudCalDavClient("a@example.com", "bad").get("/c/e.ics")
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("", 412)));
    await expect(
      new ICloudCalDavClient("a@example.com", "bad").update(
        "/c/e.ics",
        '"x"',
        "ics"
      )
    ).rejects.toMatchObject({ code: "ETAG_CONFLICT" });
  });
  it("retries temporary failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("", 500))
      .mockResolvedValueOnce(response("ok", 200, { etag: '"1"' }));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await new ICloudCalDavClient("a@example.com", "pass").get("/c/e.ics"))
        .data
    ).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
