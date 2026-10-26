import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chronological, demoStatus, eventTime } from "./demo-presentation.ts";

test("display status follows notification, options, selection, confirmation and email delivery", () => {
  assert.equal(demoStatus({ notified: false }), "Not started");
  assert.equal(demoStatus({ notified: true }), "Awaiting passenger reply");
  assert.equal(demoStatus({ notified: true, optionsShown: true }), "Rebooking in progress");
  assert.equal(demoStatus({ notified: true, selected: true }), "Rebooking in progress");
  // A confirmed booking stays confirmed even if email is pending or fails.
  assert.equal(demoStatus({ notified: true, confirmed: true }), "Rebooked");
  assert.equal(demoStatus({ notified: true, confirmed: true, emailDelivered: true }), "Rebooked");
  assert.equal(demoStatus({ notified: true, cancelled: true }), "Rebooking cancelled");
  // Reset clears prior flags. A fresh, already-notified scenario is awaiting a
  // reply, whereas a genuinely empty demo has not started.
  assert.equal(demoStatus({ notified: false }), "Not started");
  assert.equal(demoStatus({ notified: true }), "Awaiting passenger reply");
});

test("legacy seeds use session time; real event times are preserved and sorted oldest first", () => {
  const start = "2026-10-26T12:30:00.000Z";
  assert.equal(eventTime("10:02", start), start);
  assert.equal(eventTime("10:03", start), start);
  const resetAt = "2026-10-26T13:05:00.000Z";
  assert.equal(eventTime("10:02", resetAt), resetAt);
  const later = "2026-10-26T12:30:32.000Z";
  assert.equal(eventTime(later, start), later);
  const events = [{ timestamp: later }, { timestamp: start }];
  assert.deepEqual(chronological(events).map(event => event.timestamp), [start, later]);
  assert.equal(events[0].timestamp, later);
});
