import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CalendarService } from "../application/calendar-service.js";
import { CalendarError, sanitizeError } from "../domain/errors.js";

const dateTime = z.string().min(10);
const requestId = z.string().min(8).max(128);
const scope = z
  .enum(["whole_series", "single_occurrence", "this_and_future"])
  .default("whole_series");
const eventShape = {
  alarms: z
    .array(
      z.object({
        triggerMinutesBefore: z.number().int().min(0).max(525600),
        description: z.string().optional(),
      })
    )
    .max(20)
    .optional(),
  allDay: z.boolean().optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        role: z
          .enum(["CHAIR", "REQ-PARTICIPANT", "OPT-PARTICIPANT"])
          .optional(),
        status: z
          .enum(["NEEDS-ACTION", "ACCEPTED", "DECLINED", "TENTATIVE"])
          .optional(),
      })
    )
    .max(100)
    .optional(),
  description: z.string().max(100000).optional(),
  end: dateTime,
  location: z.string().max(10000).optional(),
  rrule: z.string().max(2000).optional(),
  start: dateTime,
  timezone: z.string().min(1),
  title: z.string().min(1).max(1000),
  url: z.string().url().optional(),
};
const ok = (value: unknown) => ({
  content: [{ text: JSON.stringify(value), type: "text" as const }],
  structuredContent: value as Record<string, unknown>,
});
const safe =
  <T extends Record<string, unknown>>(fn: (args: T) => Promise<unknown>) =>
  async (args: T) => {
    try {
      return ok(await fn(args));
    } catch (error) {
      const c =
        error instanceof CalendarError ? error.code : "TEMPORARY_UNAVAILABLE";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: { code: c, message: sanitizeError(error) },
            }),
          },
        ],
        structuredContent: {
          error: { code: c, message: sanitizeError(error) },
        },
        isError: true,
      };
    }
  };
export function createMcpServer(service: CalendarService): McpServer {
  const server = new McpServer({
    name: "icloud-calendar-mcp",
    version: "0.1.0",
  });
  server.registerTool(
    "list_calendars",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "List iCloud calendars",
      inputSchema: {},
    },
    safe(async () => ({ calendars: await service.listCalendars() }))
  );
  server.registerTool(
    "list_events",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "List events in an explicit range with pagination",
      inputSchema: {
        calendar_id: z.string(),
        cursor: z.string().optional(),
        end: dateTime,
        limit: z.number().int().min(1).max(1000).default(100),
        start: dateTime,
        timezone: z.string(),
      },
    },
    safe(async (a) =>
      service.listEvents(a.calendar_id, a.start, a.end, a.limit, a.cursor)
    )
  );
  server.registerTool(
    "get_event",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "Get an event by persistent opaque handle",
      inputSchema: { event_handle: z.string() },
    },
    safe(async (a) => service.getEvent(a.event_handle))
  );
  server.registerTool(
    "create_event",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: "Create an event idempotently",
      inputSchema: {
        calendar_id: z.string(),
        request_id: requestId,
        ...eventShape,
      },
    },
    safe(async (a) => {
      const { calendar_id, request_id, ...event } = a;
      return service.createEvent(calendar_id, event, request_id);
    })
  );
  server.registerTool(
    "update_event",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: "Update an event using ETag concurrency control",
      inputSchema: {
        event_handle: z.string(),
        request_id: requestId,
        scope,
        ...Object.fromEntries(
          Object.entries(eventShape).map(([k, v]) => [k, v.optional()])
        ),
      },
    },
    safe(async (a) => {
      const { event_handle, request_id, scope: which, ...patch } = a;
      return service.updateEvent(event_handle, patch, request_id, which);
    })
  );
  server.registerTool(
    "delete_event",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: "Delete an event using ETag concurrency control",
      inputSchema: { event_handle: z.string(), request_id: requestId, scope },
    },
    safe(async (a) =>
      service.deleteEvent(a.event_handle, a.request_id, a.scope)
    )
  );
  server.registerTool(
    "find_conflicts",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "Find overlapping iCloud events",
      inputSchema: {
        calendar_id: z.string(),
        end: dateTime,
        exclude_event_handle: z.string().optional(),
        start: dateTime,
        timezone: z.string(),
      },
    },
    safe(async (a) =>
      service.findConflicts(
        a.calendar_id,
        a.start,
        a.end,
        a.exclude_event_handle,
        a.timezone
      )
    )
  );
  server.registerTool(
    "free_busy",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
      description: "Compute busy intervals from visible iCloud events",
      inputSchema: {
        calendar_id: z.string(),
        end: dateTime,
        start: dateTime,
        timezone: z.string(),
      },
    },
    safe(async (a) => service.freeBusy(a.calendar_id, a.start, a.end))
  );
  server.registerResource(
    "calendars",
    "calendar://calendars",
    { description: "Available iCloud calendars", mimeType: "application/json" },
    async () => ({
      contents: [
        {
          mimeType: "application/json",
          text: JSON.stringify({ calendars: await service.listCalendars() }),
          uri: "calendar://calendars",
        },
      ],
    })
  );
  const prompt = (
    name: string,
    text: (a: Record<string, string>) => string,
    argsSchema: Record<string, z.ZodString>
  ) =>
    server.registerPrompt(
      name,
      { argsSchema, description: `Explicit ${name} user template` },
      async (a) => ({
        messages: [{ content: { text: text(a), type: "text" }, role: "user" }],
      })
    );
  prompt(
    "schedule_event",
    (a) =>
      `Schedule ${a.title} between ${a.start} and ${a.end} in timezone ${a.timezone}. First check conflicts, then ask for confirmation before create_event.`,
    {
      end: z.string(),
      start: z.string(),
      timezone: z.string(),
      title: z.string(),
    }
  );
  prompt(
    "reschedule_event",
    (a) =>
      `Reschedule event handle ${a.event_handle} to ${a.start}-${a.end} (${a.timezone}). Check conflicts and preserve unspecified fields.`,
    {
      end: z.string(),
      event_handle: z.string(),
      start: z.string(),
      timezone: z.string(),
    }
  );
  prompt(
    "find_conflicts",
    (a) =>
      `Find conflicts in calendar ${a.calendar_id} from ${a.start} to ${a.end} (${a.timezone}) and summarize them without making changes.`,
    {
      calendar_id: z.string(),
      end: z.string(),
      start: z.string(),
      timezone: z.string(),
    }
  );
  return server;
}
