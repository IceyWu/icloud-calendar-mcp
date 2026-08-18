export type Scope = "whole_series" | "single_occurrence" | "this_and_future";
export interface Alarm {
  triggerMinutesBefore: number;
  description?: string;
}
export interface Attendee {
  email: string;
  name?: string;
  role?: "CHAIR" | "REQ-PARTICIPANT" | "OPT-PARTICIPANT";
  status?: "NEEDS-ACTION" | "ACCEPTED" | "DECLINED" | "TENTATIVE";
}
export interface EventInput {
  title: string;
  start: string;
  end: string;
  timezone: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  url?: string;
  rrule?: string;
  alarms?: Alarm[];
  attendees?: Attendee[];
}
export interface EventRecord extends EventInput {
  handle: string;
  uid: string;
  calendarId: string;
  etag: string;
  href: string;
  recurrenceId?: string;
  occurrenceStart?: string;
}
export interface Calendar {
  id: string;
  name: string;
  color?: string;
  readOnly: boolean;
}
export interface Page<T> {
  items: T[];
  nextCursor?: string;
  truncated: boolean;
}
