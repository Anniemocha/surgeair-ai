import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmationSummary, itineraryDeliverySummary } from "./confirmation-summary.ts";

test("confirmation includes the actual selected flight, route, times, and booking reference", () => {
  const booking = {
    bookingReference: "SG4821",
    origin: "LIS",
    destination: "EDI",
    currentFlight: { flightNumber: "SA218", departure: "11:30", arrival: "14:40" },
  };
  assert.equal(confirmationSummary(booking), "Confirmed: SA218, Lisbon (LIS) 11:30 to Edinburgh (EDI) 14:40. Booking reference SG4821.");
  assert.equal(
    confirmationSummary({ ...booking, currentFlight: { flightNumber: "SA226", departure: "13:10", arrival: "16:20" } }),
    "Confirmed: SA226, Lisbon (LIS) 13:10 to Edinburgh (EDI) 16:20. Booking reference SG4821.",
  );
});

test("other scenarios do not reuse the default flight, reference, or cities", () => {
  assert.equal(confirmationSummary({
    bookingReference: "SG9700", origin: "JFK", destination: "XYZ",
    currentFlight: { flightNumber: "SA970", departure: "18:00", arrival: "21:15" },
  }), "Confirmed: SA970, New York (JFK) 18:00 to XYZ 21:15. Booking reference SG9700.");
});

test("only actual SES acceptance is described as an email send", () => {
  assert.match(itineraryDeliverySummary({ sent: true, emailPreview: { provider: "amazon-ses" } }), /I've sent/);
  assert.match(itineraryDeliverySummary({ sent: true, emailPreview: { provider: "simulated" } }), /simulated/);
  assert.match(itineraryDeliverySummary({ sent: false }), /not sent/);
  assert.match(itineraryDeliverySummary({ sent: true }), /unavailable/);
});
