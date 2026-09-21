import {
  GetBookingParams,
  GetFlightStatusParams,
  PrepareRebookingBody,
  RebookFlightBody,
  SearchAlternativeFlightsQueryParams,
  SendItineraryBody,
} from "@workspace/api-zod";
import { LocalOperationalLogger } from "../observability/operational-logger";
import { ToolRegistry } from "../tools/tool-registry";
import {
  SimulatedItinerarySender,
  surgeAirStore,
  type Channel,
} from "./domain";

const registry = new ToolRegistry(new LocalOperationalLogger());
const itinerarySender = new SimulatedItinerarySender();

registry.register({
  name: "getBooking",
  description: "Retrieve a passenger booking by booking reference.",
  inputSchema: GetBookingParams,
  execute: ({ bookingReference }) => surgeAirStore.getBooking(bookingReference),
});

registry.register({
  name: "getFlightStatus",
  description: "Retrieve current flight status and disruption information.",
  inputSchema: GetFlightStatusParams,
  execute: ({ flightNumber }) => surgeAirStore.getFlight(flightNumber),
});

registry.register({
  name: "searchAlternativeFlights",
  description:
    "Search available flights by route and optional arrival-before constraint.",
  inputSchema: SearchAlternativeFlightsQueryParams,
  execute: async ({ origin, destination, arrivalBefore }) => {
    await surgeAirStore.recordPassengerMessage(
      "WhatsApp",
      `I need to arrive before ${arrivalBefore ?? "the requested time"}.`,
    );
    return surgeAirStore.searchAlternatives(
      origin,
      destination,
      arrivalBefore,
    );
  },
});

registry.register({
  name: "prepareRebooking",
  description:
    "Record a selected alternative without changing the booking and request explicit confirmation.",
  inputSchema: PrepareRebookingBody,
  execute: async ({ bookingReference, newFlight }) => {
    await surgeAirStore.recordPassengerMessage(
      "RCS",
      `Take ${newFlight.toUpperCase()}.`,
    );
    return surgeAirStore.prepareRebooking(bookingReference, newFlight);
  },
});

registry.register({
  name: "rebookFlight",
  description:
    "Change a booking to a selected alternative only after explicit confirmation.",
  inputSchema: RebookFlightBody,
  execute: async ({ bookingReference, newFlight, confirmation }) => {
    if (confirmation) {
      await surgeAirStore.recordPassengerMessage("RCS", "Yes, confirm.");
    }
    return surgeAirStore.rebook(
      bookingReference,
      newFlight,
      confirmation,
    );
  },
});

registry.register({
  name: "sendItinerary",
  description: "Generate and simulate delivery of an updated itinerary.",
  inputSchema: SendItineraryBody,
  execute: async ({ bookingReference, channel }) => {
    const booking = surgeAirStore.getBooking(bookingReference);
    if (!booking) {
      return null;
    }
    const deliveryChannel = channel as Channel;
    const result = await itinerarySender.send(booking, deliveryChannel);
    surgeAirStore.markItinerarySent(deliveryChannel);
    return result;
  },
});

export const airlineTools = registry;