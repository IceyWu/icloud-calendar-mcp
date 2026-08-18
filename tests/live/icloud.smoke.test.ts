import { describe, expect, it } from "vitest";

import { ICloudCalDavClient } from "../../src/caldav/client.js";

const enabled = Boolean(
  process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD
);

describe.skipIf(!enabled)("live iCloud smoke", () => {
  it("discovers calendars without logging credentials", async () => {
    const client = new ICloudCalDavClient(
      process.env.ICLOUD_USERNAME ?? "",
      process.env.ICLOUD_APP_PASSWORD ?? ""
    );
    const calendars = await client.listCalendars();
    expect(Array.isArray(calendars)).toBe(true);
  }, 60_000);
});
