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
  surgeAirStore,
  type Channel,
  type SurgeAirStore,
} from "./domain";

export class UnsupportedItineraryChannelError extends Error {
  constructor(channel: string) {
    super(`Unsupported itinerary channel: ${channel}`);
    this.name = "UnsupportedItineraryChannelError";
  }
}

export function normalizeItineraryChannel(channel: string): Channel {
  switch (channel.trim().toLowerCase()) {
    case "sms":
      return "SMS";
    case "whatsapp":
      return "WhatsApp";
    case "rcs":
      return "RCS";
    case "email":
      return "Email";
    default:
      throw new UnsupportedItineraryChannelError(channel);
  }
}

export function createAirlineTools(store: SurgeAirStore) {
const registry = new ToolRegistry(new LocalOperationalLogger());

registry.register({
  name: "getBooking",
  description: "Retrieve a passenger booking by booking reference.",
  inputSchema: GetBookingParams,
  execute: ({ bookingReference }) => store.getBooking(bookingReference),
});

registry.register({
  name: "getFlightStatus",
  description: "Retrieve current flight status and disruption information.",
  inputSchema: GetFlightStatusParams,
  execute: ({ flightNumber }) => store.getFlight(flightNumber),
});

registry.register({
  name: "searchAlternativeFlights",
  description:
    "Search available flights by route and optional arrival-before constraint.",
  inputSchema: SearchAlternativeFlightsQueryParams,
  execute: async ({ origin, destination, arrivalBefore }) => {
    await store.recordPassengerMessage(
      "WhatsApp",
      `I need to arrive before ${arrivalBefore ?? "the requested time"}.`,
    );
    return store.searchAlternatives(
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
    await store.recordPassengerMessage(
      "RCS",
      `Take ${newFlight.toUpperCase()}.`,
    );
    return store.prepareRebooking(bookingReference, newFlight);
  },
});

registry.register({
  name: "rebookFlight",
  description:
    "Change a booking to a selected alternative only after explicit confirmation.",
  inputSchema: RebookFlightBody,
  execute: async ({ bookingReference, newFlight, confirmation }) => {
    if (confirmation) {
      await store.recordPassengerMessage("RCS", "Yes, confirm.");
    }
    return store.rebook(
      bookingReference,
      newFlight,
      confirmation,
    );
  },
});

registry.register({
  name: "sendItinerary",
  description:
    "Send an updated itinerary only after explicit rebooking confirmation.",
  inputSchema: {
    parse(value: unknown) {
      const input = SendItineraryBody.parse(value);
      return {
        ...input,
        channel: normalizeItineraryChannel(input.channel),
      };
    },
  },
    execute: ({ bookingReference, channel }) =>
    store.sendItinerary(bookingReference, channel),
});

return registry;
}

export const airlineTools = createAirlineTools(surgeAirStore);