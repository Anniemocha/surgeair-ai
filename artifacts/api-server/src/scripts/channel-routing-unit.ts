import assert from "node:assert/strict";
import { createAirlineTools } from "../surgeair/airline-tools";
import { createSurgeAirStore, type Channel, type FlightRecord } from "../surgeair/domain";

for (const channel of ["SMS", "WhatsApp", "RCS"] as const) {
  const store = createSurgeAirStore();
  const tools = createAirlineTools(store);
  if (channel !== "SMS") {
    assert.deepEqual(store.selectConversationChannel(channel), { currentChannel: channel });
    assert.equal(store.getDashboard().orchestration.previousChannel, "SMS");
  }
  const before = store.captureState();
  const interpretation = await store.interpretMessage(
    "I need to arrive in Edinburgh before 6 PM.", "SG4821",
  );
  assert.equal(interpretation?.arrivalBefore, "18:00");
  const flights = await tools.execute<FlightRecord[]>("searchAlternativeFlights", {
    origin: "LIS", destination: "EDI", arrivalBefore: interpretation.arrivalBefore,
  });
  assert.deepEqual(flights.map((flight) => flight.flightNumber), ["SA218", "SA226"]);
  assert.equal(store.getDashboard().orchestration.currentChannel, channel);

  const choice = await store.interpretMessage(
    "The first option works for me.", "SG4821", flights.map((flight) => flight.flightNumber),
  );
  assert.equal(choice?.selectedFlight, "SA218");
  const pending = await tools.execute<ReturnType<typeof store.prepareRebooking>>(
    "prepareRebooking", { bookingReference: "SG4821", newFlight: choice.selectedFlight },
  );
  assert.ok(!("error" in pending));
  assert.equal(store.getDashboard().confirmationStatus, "Awaiting passenger confirmation");
  assert.equal(store.getDashboard().booking.currentFlight.flightNumber, "SA204");
  assert.equal(store.getDashboard().orchestration.currentChannel, channel);
  assert.equal(store.getDashboard().orchestration.previousChannel, channel === "SMS" ? null : "SMS");

  const events = store.captureState().events.slice(before.events.length);
  assert.ok(events.length >= 4);
  assert.ok(events.every((event) => event.channel === channel.toLowerCase()));
  assert.ok(events.every((event) => event.eventType !== "PASSENGER_MESSAGE_RECEIVED"));
  assert.equal(store.captureState().conversations[0]?.messages.length, before.conversations[0]?.messages.length);
  assert.equal(store.getDashboard().integrationStatus.find((entry) => entry.service === "WhatsApp")?.status, "SIMULATED");
  assert.equal(store.getDashboard().integrationStatus.find((entry) => entry.service === "RCS")?.status, "SIMULATED");

  // A genuine simulated inbound message can still use its selected adapter.
  if (channel !== "SMS") {
    await store.recordPassengerMessage(channel as Channel, "I need another option.");
    assert.equal(store.getDashboard().orchestration.currentChannel, channel);
    assert.equal(store.captureState().events.at(-1)?.channel, channel.toLowerCase());
  }

  // Test the recorded success state without invoking SES or an external booking service.
  assert.equal(store.getDashboard().activities.some((activity) => activity.label === "Email delivered via Amazon SES"), false);
  const confirmation = store.rebook("SG4821", "SA218", true);
  assert.ok("booking" in confirmation);
  store.markItinerarySent("Email", true);
  assert.equal(store.getDashboard().orchestration.currentChannel, channel);
  assert.equal(store.getDashboard().activities.some((activity) => activity.label === "Email delivered via Amazon SES"), true);
  assert.equal(store.captureState().events.at(-1)?.eventType, "ITINERARY_SENT");
  assert.equal(store.captureState().events.at(-1)?.channel, "email");
}

const ambiguous = createSurgeAirStore();
const unclear = await ambiguous.interpretMessage("I need to arrive by 6.", "SG4821");
assert.equal(unclear?.arrivalBefore, null);
assert.ok(unclear?.clarification);
assert.equal(ambiguous.getDashboard().orchestration.currentChannel, "SMS");

const noSuitable = createSurgeAirStore();
noSuitable.selectPassenger("SG9562");
const deadline = await noSuitable.interpretMessage("I need to arrive before 1 PM.", "SG9562");
assert.equal(deadline?.arrivalBefore, "13:00");
assert.deepEqual(await createAirlineTools(noSuitable).execute<FlightRecord[]>(
  "searchAlternativeFlights", { origin: "FRA", destination: "CPH", arrivalBefore: deadline.arrivalBefore },
), []);
assert.equal(noSuitable.getDashboard().orchestration.currentChannel, "SMS");
process.stdout.write("Channel routing, simulated channel use, clarification and SG9562 checks passed.\n");