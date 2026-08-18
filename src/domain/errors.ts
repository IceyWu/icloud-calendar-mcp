export type ErrorCode =
  | "AUTH_FAILED"
  | "CALENDAR_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "ETAG_CONFLICT"
  | "INVALID_EVENT"
  | "RATE_LIMITED"
  | "TEMPORARY_UNAVAILABLE"
  | "UNSUPPORTED_OPERATION";
export class CalendarError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "CalendarError";
  }
}
export function sanitizeError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text
    .replaceAll(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]")
    .replaceAll(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replaceAll(/https?:\/\/[^\s/]+[^\s]*/gi, "[URL REDACTED]")
    .replaceAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL REDACTED]");
}
