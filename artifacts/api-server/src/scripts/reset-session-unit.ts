import assert from "node:assert/strict";
import { createServer } from "node:http";

process.env.NODE_ENV = "test";
process.env.MODEL_PROVIDER = "local";
process.env.SMS_PROVIDER = "simulated";
process.env.EMAIL_PROVIDER = "simulated";
process.env.AWS_SES_FROM_EMAIL = "sender@example.com";
process.env.AWS_SES_TEST_DESTINATION = "recipient@example.com";
process.env.AWS_WHATSAPP_ENABLED = "false";
process.env.AWS_RCS_ENABLED = "false";
process.env.SESSION_SECRET = "unit-test-session-secret";

const { default: app } = await import("../app");

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(
  path: string,
  options: RequestInit = {},
  cookie?: string,
) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  return {
    response,
    body: (await response.json()) as Record<string, unknown>,
    cookie: cookie ?? setCookie?.split(";")[0],
  };
}

const first = await request("/api/dashboard");
assert.equal(first.response.status, 200);
assert(first.cookie);
const readinessBeforeReset = (
  first.body.integrationStatus as Array<{ service: string; status: string }>
).map(({ service, status }) => ({ service, status }));

const selected = await request(
  "/api/bookings/rebook/prepare",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bookingReference: "SG4821", newFlight: "SA218" }),
  },
  first.cookie,
);
assert.equal(selected.response.status, 200);

const refreshed = await request("/api/dashboard", {}, first.cookie);
assert.equal(refreshed.response.status, 200);
assert.equal(refreshed.body.selectedAlternative, "SA218");
assert.equal(refreshed.body.confirmationStatus, "Awaiting passenger confirmation");

const rebooked = await request(
  "/api/bookings/rebook",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bookingReference: "SG4821",
      newFlight: "SA218",
      confirmation: true,
    }),
  },
  first.cookie,
);
assert.equal(rebooked.response.status, 200);
const itinerary = await request("/api/itinerary/send", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ bookingReference: "SG4821", channel: "EMAIL" }),
}, first.cookie);
assert.equal(itinerary.response.status, 200);
const preview = itinerary.body.emailPreview as {
  from: string; to: string; subject: string; body: string;
  messageId: string | null; provider: string;
};
assert.equal(preview.from, "s***@example.com");
assert.equal(preview.to, "r***@example.com");
assert.equal(preview.messageId, null);
assert.equal(preview.provider, "simulated");
assert.match(preview.body, /New flight: SA218/);
assert.match(preview.body, /Old flight: SA204, delayed 180 minutes/);
assert.match(preview.body, /Safe travels!/);
const savedPreview = await request("/api/dashboard", {}, first.cookie);
assert.deepEqual(savedPreview.body.emailPreview, preview);

const second = await request("/api/dashboard");
assert(second.cookie);
assert.equal(second.body.emailPreview, undefined);
assert.equal((second.body.booking as { currentFlight: { flightNumber: string } }).currentFlight.flightNumber, "SA204");

const [, secondSelected] = await Promise.all([
  request("/api/dashboard", {}, first.cookie),
  request(
    "/api/bookings/rebook/prepare",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingReference: "SG4821", newFlight: "SA226" }),
    },
    second.cookie,
  ),
]);
assert.equal(secondSelected.response.status, 200);
const firstDuringInterleave = await request(
  "/api/dashboard",
  {},
  first.cookie,
);
assert.equal(firstDuringInterleave.body.selectedAlternative, "SA218");
assert.equal(secondSelected.body.selectedFlight, "SA226");

const crossSite = await request(
  "/api/demo/reset",
  { method: "POST", headers: { origin: "https://attacker.invalid" } },
  first.cookie,
);
assert.equal(crossSite.response.status, 403);

const withBody = await request(
  "/api/demo/reset",
  {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({ booking: "SG4821" }),
  },
  first.cookie,
);
assert.equal(withBody.response.status, 400);

const reset = await request(
  "/api/demo/reset",
  { method: "POST", headers: { origin: baseUrl } },
  first.cookie,
);
assert.deepEqual(reset.body, {
  success: true,
  booking: "SG4821",
  flight: "SA204",
  status: "Disrupted",
});

const afterReset = await request("/api/dashboard", {}, first.cookie);
assert.equal(afterReset.body.emailPreview, undefined);
const resetBooking = afterReset.body.booking as {
  currentFlight: { flightNumber: string };
  status: string;
};
assert.equal(resetBooking.currentFlight.flightNumber, "SA204");
assert.equal(resetBooking.status, "Disrupted");
assert.equal(afterReset.body.selectedAlternative, null);
assert.equal(afterReset.body.confirmationStatus, "Not requested");
assert.equal(afterReset.body.actionStatus, "Not started");
assert.deepEqual(
  (
    afterReset.body.integrationStatus as Array<{
      service: string;
      status: string;
    }>
  ).map(({ service, status }) => ({ service, status })),
  readinessBeforeReset,
);

const staleConfirmation = await request(
  "/api/bookings/rebook",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bookingReference: "SG4821",
      newFlight: "SA218",
      confirmation: true,
    }),
  },
  first.cookie,
);
assert.equal(staleConfirmation.response.status, 400);
const afterStaleConfirmation = await request(
  "/api/dashboard",
  {},
  first.cookie,
);
assert.equal(
  (
    afterStaleConfirmation.body.booking as {
      currentFlight: { flightNumber: string };
    }
  ).currentFlight.flightNumber,
  "SA204",
);

const secondAfterReset = await request("/api/dashboard", {}, second.cookie);
const secondBooking = secondAfterReset.body.booking as {
  currentFlight: { flightNumber: string };
};
assert.equal(secondBooking.currentFlight.flightNumber, "SA204");
assert.equal(secondAfterReset.body.selectedAlternative, "SA226");

const resetSecond = await request(
  "/api/demo/reset",
  { method: "POST", headers: { origin: baseUrl } },
  second.cookie,
);
assert.equal(resetSecond.response.status, 200);
const secondAfterOwnReset = await request(
  "/api/dashboard",
  {},
  second.cookie,
);
assert.equal(secondAfterOwnReset.body.selectedAlternative, null);
assert.equal(secondAfterOwnReset.body.confirmationStatus, "Not requested");

await new Promise<void>((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);
process.stdout.write("Session-scoped demo reset checks passed.\n");