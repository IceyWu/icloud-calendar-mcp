import { sanitizeError } from "../domain/errors.js";

export class Logger {
  info(message: string, fields: Record<string, unknown> = {}): void {
    this.write("info", message, fields);
  }
  error(message: string, error?: unknown): void {
    this.write("error", message, error ? { error: sanitizeError(error) } : {});
  }
  private write(
    level: string,
    message: string,
    fields: Record<string, unknown>
  ): void {
    process.stderr.write(
      `${JSON.stringify({ level, message, time: new Date().toISOString(), ...fields })}\n`
    );
  }
}
