export type DemoStatus =
  | "Not started"
  | "Awaiting passenger reply"
  | "Rebooking in progress"
  | "Rebooked"
  | "Rebooking cancelled";

export function demoStatus(state: {
  notified: boolean;
  optionsShown?: boolean;
  selected?: boolean;
  confirmed?: boolean;
  emailDelivered?: boolean;
  cancelled?: boolean;
}): DemoStatus {
  if (state.confirmed && state.emailDelivered) return "Rebooked";
  if (state.cancelled && !state.confirmed) return "Rebooking cancelled";
  if (state.optionsShown || state.selected || state.confirmed) return "Rebooking in progress";
  return state.notified ? "Awaiting passenger reply" : "Not started";
}

// Legacy seed records carry clock-only placeholders. Give them the real session
// start time, without changing stored events or the timestamps of new actions.
export function eventTime(timestamp: string, startedAt: string): string {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(timestamp) ? startedAt : timestamp;
}

export function chronological<T extends { timestamp: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
