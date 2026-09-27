import assert from "node:assert/strict";
import { createSurgeAirStore } from "../surgeair/domain";
import { passengerScenarios } from "../surgeair/scenarios";

const store = createSurgeAirStore();
assert.equal(passengerScenarios.length, 8);
assert.equal(new Set(passengerScenarios.map((p) => p.passengerName)).size, 8);
assert.equal(new Set(passengerScenarios.map((p) => p.bookingReference)).size, 8);
assert.equal(
  new Set(passengerScenarios.flatMap((p) =>
    [p.originalFlight, ...p.alternatives].map((flight) => flight.flightNumber),
  )).size,
  passengerScenarios.reduce((total, p) => total + 1 + p.alternatives.length, 0),
);

for (const scenario of passengerScenarios) {
  assert.deepEqual(store.selectPassenger(scenario.bookingReference), {
    bookingReference: scenario.bookingReference,
  });
  const booking = store.getBooking(scenario.bookingReference);
  assert.equal(booking?.passengerName, scenario.passengerName);
  assert.equal(booking?.origin, scenario.origin);
  assert.equal(booking?.destination, scenario.destination);
  assert.equal(booking?.currentFlight.flightNumber, scenario.originalFlight.flightNumber);
  assert.equal(store.getFlight(scenario.originalFlight.flightNumber)?.status, scenario.originalFlight.status);
  assert.equal(store.getDashboard().disruption.flightNumber, scenario.originalFlight.flightNumber);
  assert.equal(store.listPassengers().find((p) => p.bookingReference === scenario.bookingReference)?.travelers, scenario.travelers);
  const matching = store.searchAlternatives(scenario.origin, scenario.destination);
  assert.deepEqual(matching.map((flight) => flight.flightNumber), scenario.alternatives.map((flight) => flight.flightNumber));
  assert.ok(matching.every((flight) => flight.origin === scenario.origin && flight.destination === scenario.destination));
  assert.ok(scenario.alternatives.every((flight) => flight.departure < flight.arrival));
  assert.equal(store.getBooking("NOT-FOUND"), null);
  assert.equal(store.prepareRebooking(scenario.bookingReference, "SA218").error !== undefined,
    scenario.bookingReference !== "SG4821");
}

assert.equal(store.selectPassenger("NOT-FOUND"), null);
store.selectPassenger("SG4821");
const original = store.getDashboard();
assert.equal(original.booking.passengerName, "Draymond Hillsend");
assert.equal(original.booking.origin, "LIS");
assert.equal(original.booking.destination, "EDI");
assert.equal(original.disruption.delayMinutes, 180);
assert.deepEqual(
  store.searchAlternatives("LIS", "EDI", "18:00").map((flight) => flight.flightNumber),
  ["SA218", "SA226"],
);
const pending = store.prepareRebooking("SG4821", "SA218");
assert.ok(!("error" in pending));
assert.equal(store.getBooking("SG4821")?.currentFlight.flightNumber, "SA204");
assert.ok("error" in (await store.sendItinerary("SG4821", "Email"))!);
assert.ok("error" in store.rebook("SG4821", "SA226", true));

store.selectPassenger("SG5102");
assert.equal(store.getDashboard().selectedAlternative, null);
assert.equal(store.getDashboard().confirmationStatus, "Not requested");
assert.equal(store.getDashboard().actionStatus, "Not started");
assert.equal(store.getDashboard().messages.length, 1);
assert.ok("error" in store.rebook("SG5102", "SA312", true));
assert.equal(store.getBooking("SG4821"), null);
assert.ok("error" in (await store.sendItinerary("SG5102", "Email"))!);

const cancelled = store.getDashboard();
assert.equal(cancelled.disruption.status, "Cancelled");
const newPending = store.prepareRebooking("SG5102", "SA312");
assert.ok(!("error" in newPending));
const confirmed = store.rebook("SG5102", "SA312", true);
assert.ok("booking" in confirmed);
assert.equal(store.getBooking("SG5102")?.currentFlight.flightNumber, "SA312");
assert.equal(store.getDashboard().confirmationStatus, "Confirmed");
// No delivery is performed: SES may be live in the development environment.
store.selectPassenger("SG6214");
assert.equal(store.getDashboard().disruption.status, "Connection Disrupted");
assert.equal(store.getDashboard().selectedAlternative, null);
assert.equal(store.getDashboard().confirmationStatus, "Not requested");
assert.equal(store.getDashboard().actionStatus, "Not started");

store.selectPassenger("SG9562");
assert.equal(store.searchAlternatives("FRA", "CPH", "13:00").length, 0);
assert.equal(store.getDashboard().selectedAlternative, null);
assert.equal(store.getDashboard().actionStatus, "Not started");

store.selectPassenger("SG8450");
assert.equal(store.listPassengers().find((p) => p.bookingReference === "SG8450")?.travelers, 3);
assert.equal(store.searchAlternatives("DUB", "BCN", "18:00").length, 1);
assert.equal(store.resetDemo().booking, "SG4821");
assert.equal(store.getDashboard().booking.currentFlight.flightNumber, "SA204");
assert.equal(store.getDashboard().confirmationStatus, "Not requested");

const separateSession = createSurgeAirStore();
assert.equal(separateSession.getDashboard().booking.bookingReference, "SG4821");
separateSession.selectPassenger("SG2786");
assert.equal(store.getDashboard().booking.bookingReference, "SG4821");
assert.equal(separateSession.getDashboard().booking.bookingReference, "SG2786");
assert.equal(separateSession.searchAlternatives("EDI", "CDG", "20:00").length, 1);
process.stdout.write("Passenger scenario and isolation checks passed.\n");