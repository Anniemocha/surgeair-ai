import { surgeAirStore } from "../surgeair/domain";

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