import { createSurgeAirStore } from "../surgeair/domain";

const store = createSurgeAirStore();
const reference = "SG4821";
const before = JSON.stringify(store.captureState());

const clearTime = await store.interpretMessage(
  "I need to arrive before six PM.",
  reference,
  ["SA218", "SA999"],
);
if (
  clearTime?.arrivalBefore !== "18:00" ||
  clearTime.selectedFlight !== null ||
  clearTime.provider !== "local"
) {
  throw new Error("Clear natural-language deadline was not safely interpreted.");
}

for (const [message, expected] of [
  ["I need to arrive in Edinburgh before 6 PM.", "18:00"],
  ["I need to get there before six in the evening.", "18:00"],
  ["I need to arrive before 1 PM.", "13:00"],
  ["I have to get there by one in the afternoon.", "13:00"],
  ["I need to arrive before 9:30 AM.", "09:30"],
  ["I need to arrive by 12 PM.", "12:00"],
  ["I need to arrive by 12 AM.", "00:00"],
  ["I need to arrive before 18:00.", "18:00"],
] as const) {
  const result = await store.interpretMessage(message, reference);
  if (result?.arrivalBefore !== expected || result.clarification) {
    throw new Error(`Incorrect deadline for "${message}": ${result?.arrivalBefore}`);
  }
}

const firstOption = await store.interpretMessage(
  "I'll take the first option.",
  reference,
  ["SA218", "SA999"],
);
if (firstOption?.selectedFlight !== "SA218" || firstOption.clarification !== null) {
  throw new Error("First option did not resolve to the validated presented flight.");
}

const preferred = await store.interpretMessage("I prefer SA218.", reference, ["SA218", "SA226"]);
if (preferred?.selectedFlight !== "SA218" || preferred.intent !== "select_alternative") {
  throw new Error("A preferred presented flight was not interpreted as selection.");
}

const invalidFlight = await store.interpretMessage(
  "I choose SA999.",
  reference,
  ["SA999"],
);
if (!invalidFlight || invalidFlight.selectedFlight !== null || !invalidFlight.clarification) {
  throw new Error("An ungrounded flight selection was not clarified.");
}

const ambiguousTime = await store.interpretMessage(
  "I need to arrive before 6.",
  reference,
);
if (ambiguousTime?.arrivalBefore !== null || !ambiguousTime?.clarification) {
  throw new Error("A bare hour was guessed instead of clarified.");
}

if (await store.interpretMessage("Find a flight.", "SG5102")) {
  throw new Error("Interpretation accepted a booking other than the active booking.");
}
if (JSON.stringify(store.captureState()) !== before) {
  throw new Error("Interpretation modified conversation or booking state.");
}
const sg9562 = createSurgeAirStore();
sg9562.selectPassenger("SG9562");
const noSuitableDeadline = await sg9562.interpretMessage(
  "I need to arrive before 1 PM.",
  "SG9562",
);
if (noSuitableDeadline?.arrivalBefore !== "13:00" ||
    sg9562.searchAlternatives("FRA", "CPH", noSuitableDeadline.arrivalBefore).length !== 0) {
  throw new Error("SG9562 must not invent an alternative before 13:00.");
}

process.stdout.write("Message interpretation safety checks passed.\n");