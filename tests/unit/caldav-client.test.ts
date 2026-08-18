import { afterEach, describe, expect, it, vi } from "vitest";

import { ICloudCalDavClient } from "../../src/caldav/client.js";

const multistatus = (content: string) =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response>${content}</d:response></d:multistatus>`;
const response = (
  body: string,
  status = 207,
  headers: Record<string, string> = {},
  url = "https://caldav.icloud.com/test"
) => {
  const result = new Response(status === 204 ? null : body, {
    status,
    headers,
  });
  Object.defineProperty(result, "url", { value: url });
  return result;
};

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
          '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:displayname>Calendar Home</d:displayname><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/123/calendars/work/</d:href><d:propstat><d:prop><d:displayname>Work</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:current-user-privilege-set><d:privilege><d:write-content/></d:privilege></d:current-user-privilege-set></d:prop></d:propstat></d:response></d:multistatus>'
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
  it("accepts numbered Apple CalDAV shards and rejects other redirects", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response(
            "ok",
            200,
            { etag: '"1"' },
            "https://p123-caldav.icloud.com/123/event.ics"
          )
        )
    );
    const client = new ICloudCalDavClient("a@example.com", "app-pass");
    expect((await client.get("/123/event.ics")).data).toBe("ok");

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response("no", 200, {}, "https://example.com/event.ics")
        )
    );
    await expect(
      new ICloudCalDavClient("a@example.com", "app-pass").get("/event.ics")
    ).rejects.toMatchObject({ code: "UNSUPPORTED_OPERATION" });
  });
  it("replays authorization after a trusted Apple shard redirect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(
          "",
          302,
          { location: "https://p321-caldav.icloud.com/321/event.ics" },
          "https://caldav.icloud.com/event.ics"
        )
      )
      .mockResolvedValueOnce(
        response(
          "ok",
          200,
          { etag: '"1"' },
          "https://p321-caldav.icloud.com/321/event.ics"
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (
        await new ICloudCalDavClient("a@example.com", "app-pass").get(
          "/event.ics"
        )
      ).data
    ).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(
      /^https:\/\/p321-caldav\.icloud\.com/
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: expect.stringMatching(/^Basic /),
      }),
      method: "GET",
      redirect: "manual",
    });
  });
  it("routes each discovered calendar back to its own Apple shard", async () => {
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
          '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>https://p111-caldav.icloud.com/123/calendars/work/</d:href><d:propstat><d:prop><d:displayname>Work</d:displayname><d:resourcetype><c:calendar/></d:resourcetype><d:current-user-privilege-set><d:privilege><d:write/></d:privilege></d:current-user-privilege-set></d:prop></d:propstat></d:response><d:response><d:href>https://p222-caldav.icloud.com/123/calendars/other/</d:href><d:propstat><d:prop><d:displayname>Other</d:displayname><d:resourcetype><c:calendar/></d:resourcetype><d:current-user-privilege-set><d:privilege><d:write/></d:privilege></d:current-user-privilege-set></d:prop></d:propstat></d:response></d:multistatus>',
          207,
          {},
          "https://p999-caldav.icloud.com/123/calendars/"
        )
      )
      .mockResolvedValueOnce(
        response(
          "event",
          200,
          { etag: '"1"' },
          "https://p111-caldav.icloud.com/123/calendars/work/event.ics"
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new ICloudCalDavClient("a@example.com", "app-pass");
    await client.listCalendars();
    await client.get("/123/calendars/work/event.ics");
    expect(String(fetchMock.mock.calls[3]?.[0])).toMatch(
      /^https:\/\/p111-caldav\.icloud\.com/
    );
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
