import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface Entry {
  operation: string;
  fingerprint: string;
  result: unknown;
  at: string;
}
interface Handle {
  calendarId: string;
  href: string;
  uid: string;
  etag: string;
}
interface State {
  requests: Record<string, Entry>;
  handles: Record<string, Handle>;
}
export class Journal {
  private state: State = { handles: {}, requests: {} };
  private readonly path: string;
  constructor(dataDir: string) {
    this.path = join(dataDir, "journal.json");
  }
  async init(): Promise<void> {
    await mkdir(dirname(this.path), { mode: 0o700, recursive: true });
    try {
      this.state = JSON.parse(await readFile(this.path, "utf-8")) as State;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  replay(
    requestId: string,
    operation: string,
    fingerprint: string
  ): unknown | undefined {
    const e = this.state.requests[requestId];
    if (!e) {
      return undefined;
    }
    if (e.operation !== operation || e.fingerprint !== fingerprint) {
      throw new Error("request_id reused with different operation or payload");
    }
    return e.result;
  }
  async record(
    requestId: string,
    operation: string,
    fingerprint: string,
    result: unknown
  ): Promise<void> {
    this.state.requests[requestId] = {
      at: new Date().toISOString(),
      fingerprint,
      operation,
      result,
    };
    await this.flush();
  }
  async putHandle(
    calendarId: string,
    href: string,
    uid: string,
    etag: string
  ): Promise<string> {
    const handle = `evt_${randomUUID()}`;
    this.state.handles[handle] = { calendarId, etag, href, uid };
    await this.flush();
    return handle;
  }
  getHandle(handle: string): Handle | undefined {
    return this.state.handles[handle];
  }
  async updateEtag(handle: string, etag: string): Promise<void> {
    const h = this.state.handles[handle];
    if (h) {
      h.etag = etag;
      await this.flush();
    }
  }
  async removeHandle(handle: string): Promise<void> {
    delete this.state.handles[handle];
    await this.flush();
  }
  private async flush(): Promise<void> {
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    await rename(tmp, this.path);
  }
}
