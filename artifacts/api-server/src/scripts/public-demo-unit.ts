import assert from "node:assert/strict";
import type { Request } from "express";
import { resetMockUsage, advanceMockTime } from "./demo-db-mock";

// All delivery clients and the SQL adapter are fakes in this test build.
process.env.MODEL_PROVIDER = "local";
process.env.SMS_PROVIDER = "aws";
process.env.EMAIL_PROVIDER = "aws";
process.env.AWS_SES_FROM_EMAIL = "sender@example.invalid";
process.env.AWS_SES_TEST_DESTINATION = "recipient@example.invalid";
process.env.SESSION_SECRET = "public-demo-test-only-secret";
const { createSurgeAirStore } = await import("../surgeair/domain");
const { reserveDemoUsage } = await import("../surgeair/demo-limits");
let sms = 0, email = 0;
const store = createSurgeAirStore({
  runtimeArn: "",
  smsSimulatorDestination: "+12025550100", // Reserved fictional test number.
  smsClient: { async send() { return { MessageId: `mock-sms-${++sms}`, $metadata: {} }; } },
  emailClient: { async send() { return { MessageId: `mock-email-${++email}`, $metadata: {} }; } },
});
for (let run = 0; run < 3; run++) {
  if (run) store.resetDemo();
  assert.equal(store.getDashboard().booking.currentFlight.flightNumber, "SA204");
  assert.equal(store.getDashboard().emailPreview, undefined);
  assert.equal(store.getDashboard().orchestration.turnHistory.length, 0);
  assert.equal(store.getDashboard().orchestration.modelStatus, "Not invoked yet");
  assert.equal(store.getDashboard().activities.filter(item => item.label.startsWith("Tool call: ")).length, 0);
  assert(store.getDashboard().activities.every(item => !Number.isNaN(Date.parse(item.timestamp))));
  await store.sendDemoSms("notification");
  const deadline = await store.interpretMessage("Arrive before 18:00", "SG4821");
  assert.equal(deadline?.arrivalBefore, "18:00");
  store.searchAlternatives("LIS", "EDI", "18:00");
  store.prepareRebooking("SG4821", "SA218");
  const cancel = await store.interpretMessage("No, cancel", "SG4821", ["SA218"]);
  assert.equal(cancel?.clarification, "No problem, I haven't changed your booking. Want to see other options?");
  assert.equal(store.getDashboard().confirmationStatus, "Cancelled");
  assert.equal(store.getDashboard().booking.currentFlight.flightNumber, "SA204");
  store.prepareRebooking("SG4821", "SA218");
  await store.interpretMessage("Yes, confirm", "SG4821");
  assert("booking" in store.rebook("SG4821", "SA218", true));
  assert("error" in store.rebook("SG4821", "SA218", true));
  await Promise.all([store.sendDemoSms("confirmation"), store.sendDemoSms("confirmation")]);
  const results = await Promise.all([store.sendItinerary("SG4821", "Email"), store.sendItinerary("SG4821", "Email")]);
  assert(results.every(result => result && "sent" in result && result.sent));
  assert.equal(email, run + 1, "Concurrent requests must not send a second email");
  const again = await store.interpretMessage("YES", "SG4821");
  assert.equal(again?.clarification, "Your booking SA218 is already confirmed.");
  assert.equal(store.getDashboard().booking.currentFlight.flightNumber, "SA218");
}
assert.equal(sms, 6);
assert.equal(email, 3);
store.resetDemo();
assert.equal((await store.sendDemoSms("notification", false)).status, "skipped");
assert.equal(sms, 6);
assert(store.getDashboard().activities.some(activity => activity.label === "SMS skipped: demo limit"));
const time = await store.interpretMessage("I need to arrive by 4pm", "SG4821");
assert.equal(time?.arrivalBefore, "16:00");
assert(await store.interpretMessage("purple dishwasher", "SG4821"));
await assert.rejects(store.interpretMessage("x".repeat(301), "SG4821"));
const broken = createSurgeAirStore({
  runtimeArn: "", smsSimulatorDestination: "+12025550100",
  smsClient: { async send() { throw new Error("mock provider failure"); } },
});
assert.equal((await broken.sendDemoSms("notification")).status, "failed");
assert.equal(broken.getDashboard().booking.currentFlight.flightNumber, "SA204");

const request = (ip = "192.0.2.1") => ({ ip } as Request);
resetMockUsage();
for (let i = 0; i < 20; i++) assert(await reserveDemoUsage("chat", request()));
assert.equal(await reserveDemoUsage("chat", request()), false);
for (let batch = 0; batch < 4; batch++) {
  advanceMockTime(61_000);
  for (let i = 0; i < 20; i++) assert(await reserveDemoUsage("chat", request()));
}
advanceMockTime(61_000);
assert.equal(await reserveDemoUsage("chat", request()), false, "100 per 24 hours");
advanceMockTime(86_400_001);
assert(await reserveDemoUsage("chat", request()));
resetMockUsage();
for (const kind of ["booking", "email"] as const) {
  for (let i = 0; i < 5; i++) assert(await reserveDemoUsage(kind, request()));
  assert.equal(await reserveDemoUsage(kind, request()), false);
}
resetMockUsage();
const concurrent = await Promise.all(Array.from({ length: 10 }, () => reserveDemoUsage("sms", request())));
assert.equal(concurrent.filter(Boolean).length, 3);
for (let ip = 2; ip <= 10; ip++) {
  for (let i = 0; i < 3; i++) assert(await reserveDemoUsage("sms", request(`192.0.2.${ip}`)));
}
assert.equal(await reserveDemoUsage("sms", request("192.0.2.11")), false, "30 SMS across all IPs");
advanceMockTime(3_600_001);
assert.equal(await reserveDemoUsage("sms", request()), false, "Hourly reset must not bypass daily global quota");
store.resetDemo(); // Reset remains independent of every quota.
assert.equal(store.getDashboard().booking.currentFlight.flightNumber, "SA204");
advanceMockTime(86_400_001);
assert(await reserveDemoUsage("sms", request()));
console.log("PASS: three full mocked delivery flows, cancellation, duplicate confirmation/email, free text, input cap, SMS failure/skip, rolling quotas and concurrent quota reservations. Real SMS/email sent: 0.");

// Exercise the actual HTTP routes too, with an injected store whose SDK clients
// are fakes. No published app, AWS account, or persistent database is touched.
const { createServer } = await import("node:http");
const { default: express } = await import("express");
const { default: routes } = await import("../routes/surgeair");
resetMockUsage();
const httpStore = createSurgeAirStore({
  runtimeArn: "", smsSimulatorDestination: "+12025550100",
  smsClient: { async send() { return { MessageId: `mock-http-sms-${++sms}`, $metadata: {} }; } },
  emailClient: { async send() { return { MessageId: `mock-http-email-${++email}`, $metadata: {} }; } },
});
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.surgeAirStore = httpStore; next(); });
app.use("/api", routes);
const server = createServer(app);
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}/api`;
async function api<T = unknown>(path: string, body?: unknown, expected = 200): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(response.status, expected, `${path} HTTP status`);
  return await response.json() as T;
}
try {
  for (let run = 0; run < 3; run++) {
    await api("/demo/reset", {});
    const initial = await api<ReturnType<typeof httpStore.getDashboard>>("/dashboard");
    assert.equal(initial.emailPreview, undefined);
    assert.equal(initial.orchestration.modelStatus, "Not invoked yet");
    assert(!initial.activities.some((item: { label: string }) => item.label.startsWith("Tool call: ")));
    await api("/messages/interpret", { text: "Arrive before 18:00", bookingReference: "SG4821" });
    const options = await api<Array<{ flightNumber: string }>>("/flights/alternatives?origin=LIS&destination=EDI&arrivalBefore=18%3A00");
    assert(options.some((flight: { flightNumber: string }) => flight.flightNumber === "SA218"));
    await api("/bookings/rebook/prepare", { bookingReference: "SG4821", newFlight: "SA218" });
    await api("/messages/interpret", { text: "Yes, confirm", bookingReference: "SG4821" });
    const booked = await api<{ booking: { currentFlight: { flightNumber: string } } }>("/bookings/rebook", { bookingReference: "SG4821", newFlight: "SA218", confirmation: true });
    assert.equal(booked.booking.currentFlight.flightNumber, "SA218");
    const sent = await api<{ emailPreview: { messageId: string } }>("/itinerary/send", { bookingReference: "SG4821", channel: "EMAIL" });
    assert(sent.emailPreview.messageId.startsWith("mock-http-email-"));
    const repeated = await api<{ emailPreview: { messageId: string } }>("/itinerary/send", { bookingReference: "SG4821", channel: "EMAIL" });
    assert.equal(repeated.emailPreview.messageId, sent.emailPreview.messageId);
    const duplicate = await api<{ clarification: string }>("/messages/interpret", { text: "YES", bookingReference: "SG4821" });
    assert.equal(duplicate.clarification, "Your booking SA218 is already confirmed.");
    const final = await api<ReturnType<typeof httpStore.getDashboard>>("/dashboard");
    assert.equal(final.orchestration.modelProvider, "local");
    assert.equal(final.orchestration.modelStatus, "local");
    assert.equal(final.orchestration.executionPath, "Local model (simulated)");
    for (const tool of ["getBooking", "searchAlternatives", "bookFlight", "sendEmail"]) {
      assert(final.activities.some((item: { label: string }) => item.label === `Tool call: ${tool}`));
    }
    await api("/bookings/SG4821");
    const afterRead = await api<ReturnType<typeof httpStore.getDashboard>>("/dashboard");
    assert.equal(afterRead.activities.length, final.activities.length, "Passive reads cannot append agent tool calls");
    assert.equal(afterRead.orchestration.lastToolCalled, final.orchestration.lastToolCalled);
    assert.equal(email, 4 + run);
  }
  await api("/messages/interpret", { text: "x".repeat(301), bookingReference: "SG4821" }, 400);
  await api("/demo/reset", {});
  assert.equal(httpStore.getDashboard().booking.currentFlight.flightNumber, "SA204");
  assert(httpStore.getDashboard().activities.some(item => item.label === "SMS skipped: demo limit"));
  console.log("PASS: three end-to-end HTTP booking flows, email idempotency, tool summaries, 300-character rejection and reset after SMS exhaustion. Real SMS/email sent: 0.");
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
