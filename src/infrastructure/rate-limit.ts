import { CalendarError } from "../domain/errors.js";

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  take(bucket: string, limit: number, now = Date.now()): void {
    const recent = (this.hits.get(bucket) ?? []).filter(
      (x) => now - x < 60_000
    );
    if (recent.length >= limit) {
      throw new CalendarError(
        "RATE_LIMITED",
        "Local rate limit exceeded",
        true
      );
    }
    recent.push(now);
    this.hits.set(bucket, recent);
  }
}
