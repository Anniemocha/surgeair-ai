import assert from "node:assert/strict";
import { createSurgeAirStore } from "../surgeair/domain";

const surgeAirStore = createSurgeAirStore();
const reference = "SG4821";
const selectedFlight = "SA218";
const initialFlight =
  surgeAirStore.getBooking(reference)?.currentFlight.flightNumber;
if (initialFlight !== "SA204") {
  throw new Error("Safety test requires the original SA204 booking.");
}

const selection = await surgeAirStore.recordPassengerMessage(
  "RCS",
  `Take ${selectedFlight}.`,
);
if (
  selection.selectedFlight !== selectedFlight ||
  !selection.requiresConfirmation ||
  surgeAirStore.getBooking(reference)?.currentFlight.flightNumber !== "SA204"
) {
  throw new Error("Selecting a flight changed the booking or skipped confirmation.");
}

const pending = surgeAirStore.prepareRebooking(reference, selectedFlight);
if (
  "error" in pending ||
  surgeAirStore.getBooking(reference)?.currentFlight.flightNumber !== "SA204"
) {
  throw new Error("Preparing a rebooking changed the booking.");
}

const prematureItinerary = await surgeAirStore.sendItinerary(
  reference,
  "Email",
);
if (!prematureItinerary || !("error" in prematureItinerary)) {
  throw new Error("An itinerary was sent before explicit confirmation.");
}

const wrongFlightAttempt = surgeAirStore.rebook(reference, "SA226", true);
if (
  "booking" in wrongFlightAttempt ||
  surgeAirStore.getBooking(reference)?.currentFlight.flightNumber !== "SA204"
) {
  throw new Error("A mismatched pending rebooking was authorized.");
}

await surgeAirStore.recordPassengerMessage("RCS", "Yes, confirm.");
const confirmed = surgeAirStore.rebook(reference, selectedFlight, true);
const finalFlight =
  surgeAirStore.getBooking(reference)?.currentFlight.flightNumber;
if (!("booking" in confirmed) || finalFlight !== selectedFlight) {
  throw new Error("Explicit confirmation did not complete the pending rebooking.");
}

const completedReply = "Your booking SA218 is already confirmed.";
for (const channel of ["RCS", "SMS", "WhatsApp"] as const) {
  surgeAirStore.selectConversationChannel(channel);
  const beforeDuplicate = surgeAirStore.captureState();
  for (const text of ["Yes, confirm.", "Book SA226 instead.", "The first option works for me."]) {
    const response = await surgeAirStore.interpretMessage(text, reference, ["SA218", "SA226"]);
    assert.equal(response?.clarification, completedReply);
    assert.equal(response?.selectedFlight, null);
  }
  assert.deepEqual(surgeAirStore.prepareRebooking(reference, "SA226"), { error: completedReply });
  assert.deepEqual(surgeAirStore.rebook(reference, "SA226", true), { error: completedReply });
  assert.deepEqual(surgeAirStore.rebook(reference, "SA226", false), { error: completedReply });
  assert.deepEqual(surgeAirStore.captureState(), beforeDuplicate);
  assert.equal(surgeAirStore.getDashboard().orchestration.currentChannel, channel);
  assert.equal(surgeAirStore.getDashboard().booking.currentFlight.flightNumber, "SA218");
  assert.equal(surgeAirStore.getDashboard().confirmationStatus, "Confirmed");
}

surgeAirStore.resetDemo();
assert.equal(surgeAirStore.getDashboard().booking.currentFlight.flightNumber, "SA204");
assert.equal(surgeAirStore.getDashboard().actionStatus, "Not started");
assert.equal("selectedFlight" in surgeAirStore.prepareRebooking(reference, selectedFlight), true);

process.stdout.write(
  `${JSON.stringify(
    {
      selectionIntent: selection.intent,
      selectedFlight: selection.selectedFlight,
      requiresConfirmation: selection.requiresConfirmation,
      beforeConfirmation: initialFlight,
      afterSelection: "SA204",
      mismatchedConfirmationBlocked: true,
      prematureItineraryBlocked: true,
      afterExplicitConfirmation: finalFlight,
    },
    null,
    2,
  )}\n`,
);