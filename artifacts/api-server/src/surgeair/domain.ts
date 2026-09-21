import {
  EmailChannel,
  RcsChannel,
  SmsChannel,
  WhatsAppChannel,
} from "../channels/channel-adapters";
import {
  getAwsReadinessConfig,
  integrationReadiness,
} from "../config/aws";
import { InMemoryConversationRepository } from "../conversation/conversation-repository";
import { InMemoryEventStore, type SurgeAirEventType } from "../events/event-store";
import { createModelProvider } from "../models/model-provider-factory";
import { LocalOperationalLogger } from "../observability/operational-logger";
import { MessageOrchestrator } from "../orchestration/message-orchestrator";

export type Channel = "SMS" | "WhatsApp" | "RCS" | "Email";

export interface FlightRecord {
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  status: string;
  delayMinutes: number;
  gate: string | null;
  aircraft: string | null;
}

export interface BookingRecord {
  bookingReference: string;
  passengerId: string;
  passengerName: string;
  currentFlight: FlightRecord;
  origin: string;
  destination: string;
  status: string;
}

export interface ActivityRecord {
  id: string;
  label: string;
  detail: string;
  status: string;
  timestamp: string;
}

export interface MessageRecord {
  id: string;
  channel: Channel;
  sender: string;
  text: string;
  timestamp: string;
}

export interface ConversationState {
  passengerId: string;
  passengerName: string;
  bookingReference: string;
  currentFlight: string;
  origin: string;
  destination: string;
  currentChannel: Channel;
  previousChannel: Channel | null;
  passengerRequest: string | null;
  detectedIntent: string | null;
  arrivalConstraint: string | null;
  alternativeFlights: string[];
  selectedFlight: string | null;
  confirmationStatus: string;
  rebookingStatus: string;
}

export interface ItinerarySender {
  send(
    booking: BookingRecord,
    channel: Channel,
  ): Promise<{ sent: boolean; channel: Channel; message: string; sentAt: string }>;
}

export class SimulatedItinerarySender implements ItinerarySender {
  async send(booking: BookingRecord, channel: Channel) {
    const sentAt = new Date().toISOString();
    return {
      sent: true,
      channel,
      message: `Updated itinerary for ${booking.bookingReference} on ${booking.currentFlight.flightNumber} simulated successfully.`,
      sentAt,
    };
  }
}

const flights = new Map<string, FlightRecord>([
  [
    "SA204",
    {
      flightNumber: "SA204",
      origin: "LIS",
      destination: "EDI",
      departure: "10:15",
      arrival: "13:25",
      status: "Delayed",
      delayMinutes: 180,
      gate: "14",
      aircraft: "Airbus A320",
    },
  ],
  [
    "SA218",
    {
      flightNumber: "SA218",
      origin: "LIS",
      destination: "EDI",
      departure: "11:30",
      arrival: "14:40",
      status: "Available",
      delayMinutes: 0,
      gate: "21",
      aircraft: "Airbus A321neo",
    },
  ],
  [
    "SA226",
    {
      flightNumber: "SA226",
      origin: "LIS",
      destination: "EDI",
      departure: "13:10",
      arrival: "16:20",
      status: "Available",
      delayMinutes: 0,
      gate: "18",
      aircraft: "Boeing 737-8",
    },
  ],
]);

const booking: BookingRecord = {
  bookingReference: "SG4821",
  passengerId: "PAX-1042",
  passengerName: "Draymond Hillsend",
  currentFlight: flights.get("SA204")!,
  origin: "LIS",
  destination: "EDI",
  status: "Disrupted",
};

const conversation: ConversationState = {
  passengerId: booking.passengerId,
  passengerName: booking.passengerName,
  bookingReference: booking.bookingReference,
  currentFlight: "SA204",
  origin: "LIS",
  destination: "EDI",
  currentChannel: "SMS",
  previousChannel: null,
  passengerRequest: null,
  detectedIntent: null,
  arrivalConstraint: null,
  alternativeFlights: [],
  selectedFlight: null,
  confirmationStatus: "Not requested",
  rebookingStatus: "Not started",
};

const messages: MessageRecord[] = [
  {
    id: "msg-1",
    channel: "SMS",
    sender: "SurgeAir AI",
    text: "Flight SA204 from Lisbon to Edinburgh is delayed by 3 hours. I can help you find another option.",
    timestamp: "10:03",
  },
];

const conversationId = "conv-sg4821-disruption";
const operationalLogger = new LocalOperationalLogger();
const awsReadinessConfig = getAwsReadinessConfig();
const smsChannel = new SmsChannel(operationalLogger, {
  provider: awsReadinessConfig.channels.sms.provider,
  region: awsReadinessConfig.region,
  originationIdentity:
    awsReadinessConfig.channels.sms.originationIdentity ?? undefined,
  simulatorDestination:
    awsReadinessConfig.channels.sms.simulatorDestination ?? undefined,
});
const eventStore = new InMemoryEventStore();
const conversationRepository = new InMemoryConversationRepository({
  ...conversation,
  conversationId,
  messages: [...messages],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastToolCalled: null,
  currentAgentState: "Disruption detected",
});
const messageOrchestrator = new MessageOrchestrator(
  [
    smsChannel,
    new WhatsAppChannel(operationalLogger),
    new RcsChannel(operationalLogger),
    new EmailChannel(operationalLogger),
  ],
  conversationRepository,
  createModelProvider(operationalLogger),
  eventStore,
  operationalLogger,
);

const activities: ActivityRecord[] = [
  {
    id: "activity-1",
    label: "Flight disruption detected",
    detail: "SA204 delayed by 3 hours",
    status: "COMPLETED",
    timestamp: "10:02",
  },
  {
    id: "activity-2",
    label: "Passenger notified",
    detail: "SMS sent to Draymond Hillsend",
    status: "COMPLETED",
    timestamp: "10:03",
  },
];

eventStore.append({
  conversationId,
  passengerId: booking.passengerId,
  eventType: "FLIGHT_DISRUPTION_DETECTED",
  channel: "sms",
  metadata: { flightNumber: "SA204", delayMinutes: 180 },
});
eventStore.append({
  conversationId,
  passengerId: booking.passengerId,
  eventType: "PASSENGER_NOTIFIED",
  channel: "sms",
  metadata: { bookingReference: booking.bookingReference },
});

function minutes(time: string): number {
  const [hours = "0", mins = "0"] = time.split(":");
  return Number(hours) * 60 + Number(mins);
}

function addActivity(label: string, detail: string) {
  activities.push({
    id: `activity-${activities.length + 1}`,
    label,
    detail,
    status: "COMPLETED",
    timestamp: new Date().toISOString(),
  });
}

function addActivityOnce(label: string, detail: string) {
  if (!activities.some((activity) => activity.label === label)) {
    addActivity(label, detail);
  }
}

function addMessage(channel: Channel, sender: string, text: string) {
  const stored = conversationRepository.get(conversationId);
  conversationRepository.addMessage(conversationId, {
    id: `msg-${(stored?.messages.length ?? 0) + 1}`,
    channel,
    sender,
    text,
    timestamp: new Date().toISOString(),
  });
}

function appendEvent(
  eventType: SurgeAirEventType,
  channel: Channel,
  metadata: Record<string, string | number | boolean | null>,
) {
  eventStore.append({
    conversationId,
    passengerId: booking.passengerId,
    eventType,
    channel: channel.toLowerCase(),
    metadata,
  });
}

function syncConversation(lastToolCalled: string | null, currentAgentState: string) {
  const stored = conversationRepository.get(conversationId);
  if (!stored) {
    throw new Error("Demo conversation is unavailable.");
  }
  conversationRepository.save({
    ...stored,
    ...conversation,
    messages: stored.messages,
    lastToolCalled,
    currentAgentState,
  });
}

export const surgeAirStore = {
  async recordPassengerMessage(channel: Channel, content: string) {
    return messageOrchestrator.receive({
      messageId: `inbound-${Date.now()}`,
      conversationId,
      passengerId: booking.passengerId,
      bookingReference: booking.bookingReference,
      channel: channel.toLowerCase() as Lowercase<Channel>,
      direction: "inbound",
      content,
      timestamp: new Date().toISOString(),
    });
  },

  getBooking(reference: string) {
    const found =
      reference.toUpperCase() === booking.bookingReference ? booking : null;
    if (found) {
      addActivityOnce("Passenger identified", found.passengerName);
      addActivityOnce(
        "Booking retrieved",
        `Booking ${found.bookingReference} retrieved`,
      );
      appendEvent("BOOKING_RETRIEVED", conversation.currentChannel, {
        bookingReference: found.bookingReference,
      });
      syncConversation("getBooking", "Booking retrieved");
    }
    return found;
  },

  getFlight(flightNumber: string) {
    return flights.get(flightNumber.toUpperCase()) ?? null;
  },

  searchAlternatives(
    origin: string,
    destination: string,
    arrivalBefore?: string,
  ) {
    const constraint = arrivalBefore ? minutes(arrivalBefore) : Number.MAX_VALUE;
    const matches = [...flights.values()].filter(
      (flight) =>
        flight.origin === origin.toUpperCase() &&
        flight.destination === destination.toUpperCase() &&
        flight.status === "Available" &&
        minutes(flight.arrival) < constraint,
    );

    conversation.passengerRequest =
      "I need to arrive in Edinburgh before 6 PM.";
    conversation.detectedIntent = "Find alternative flight";
    conversation.arrivalConstraint = arrivalBefore ?? null;
    conversation.alternativeFlights = matches.map(
      (flight) => flight.flightNumber,
    );
    conversation.previousChannel = conversation.currentChannel;
    conversation.currentChannel = "WhatsApp";
    appendEvent("CONSTRAINT_DETECTED", "WhatsApp", {
      arrivalBefore: arrivalBefore ?? null,
    });
    appendEvent("ALTERNATIVES_FOUND", "WhatsApp", {
      flights: matches.map((flight) => flight.flightNumber).join(","),
    });
    syncConversation("searchAlternativeFlights", "Presenting alternatives");
    addActivity(
      "Arrival constraint detected",
      `Arrival before ${arrivalBefore ?? "requested time"}`,
    );
    addActivity(
      "Alternative flights searched",
      matches.map((flight) => flight.flightNumber).join(" and "),
    );
    return matches;
  },

  prepareRebooking(reference: string, newFlightNumber: string) {
    const target = flights.get(newFlightNumber.toUpperCase());
    if (reference.toUpperCase() !== booking.bookingReference || !target) {
      return { error: "Booking or flight not found." } as const;
    }

    conversation.previousChannel = conversation.currentChannel;
    conversation.currentChannel = "RCS";
    conversation.selectedFlight = target.flightNumber;
    conversation.confirmationStatus = "Awaiting passenger confirmation";
    appendEvent("ALTERNATIVE_SELECTED", "RCS", {
      flightNumber: target.flightNumber,
    });
    appendEvent("CONFIRMATION_REQUESTED", "RCS", {
      bookingReference: reference,
    });
    addActivityOnce("Alternative selected", target.flightNumber);
    addActivityOnce(
      "Confirmation requested",
      `Rebook ${reference} to ${target.flightNumber}`,
    );
    syncConversation("rebookFlight", "Awaiting confirmation");

    return {
      selectedFlight: target.flightNumber,
      confirmationStatus: conversation.confirmationStatus,
      message: `Explicit confirmation is required before rebooking to ${target.flightNumber}.`,
    } as const;
  },

  rebook(reference: string, newFlightNumber: string, confirmed: boolean) {
    if (!confirmed) {
      const pending = this.prepareRebooking(reference, newFlightNumber);
      if ("error" in pending) return pending;
      return { error: "Explicit passenger confirmation is required." } as const;
    }

    operationalLogger.record("rebooking_attempt", {
      bookingReference: reference,
      newFlight: newFlightNumber,
      confirmationReceived: confirmed,
    });
    const target = flights.get(newFlightNumber.toUpperCase());
    if (reference.toUpperCase() !== booking.bookingReference || !target) {
      operationalLogger.record("rebooking_failure", {
        bookingReference: reference,
        newFlight: newFlightNumber,
      });
      return { error: "Booking or flight not found." } as const;
    }
    const stored = conversationRepository.get(conversationId);
    if (
      !stored ||
      stored.confirmationStatus !== "Awaiting passenger confirmation" ||
      stored.selectedFlight !== target.flightNumber
    ) {
      operationalLogger.record("rebooking_failure", {
        bookingReference: reference,
        newFlight: newFlightNumber,
        reason: "missing_matching_pending_rebooking",
      });
      return {
        error:
          "A matching pending rebooking selection is required before confirmation.",
      } as const;
    }

    const previousFlight = booking.currentFlight.flightNumber;
    booking.currentFlight = target;
    booking.status = "Rebooked";
    conversation.previousChannel = conversation.currentChannel;
    conversation.currentChannel = "RCS";
    conversation.selectedFlight = target.flightNumber;
    conversation.confirmationStatus = "Confirmed";
    conversation.rebookingStatus = "Rebooked";
    conversation.currentFlight = target.flightNumber;
    appendEvent("ALTERNATIVE_SELECTED", "RCS", {
      flightNumber: target.flightNumber,
    });
    appendEvent("CONFIRMATION_RECEIVED", "RCS", {
      confirmationReceived: true,
    });
    appendEvent("REBOOKING_STARTED", "RCS", {
      bookingReference: reference,
    });
    appendEvent("REBOOKING_COMPLETED", "RCS", {
      previousFlight,
      currentFlight: target.flightNumber,
    });
    operationalLogger.record("rebooking_success", {
      bookingReference: reference,
      previousFlight,
      currentFlight: target.flightNumber,
    });
    addMessage(
      "RCS",
      "Draymond Hillsend",
      `Yes, confirm rebooking to ${target.flightNumber}.`,
    );
    addActivity("Explicit confirmation received", target.flightNumber);
    addActivity(
      "Booking updated",
      `${previousFlight} changed to ${target.flightNumber}`,
    );
    syncConversation("rebookFlight", "Rebooking completed");

    return {
      booking,
      actionStatus: "Rebooked",
      message: `${reference} successfully rebooked from ${previousFlight} to ${target.flightNumber}.`,
    } as const;
  },

  markItinerarySent(channel: Channel) {
    conversation.previousChannel = conversation.currentChannel;
    conversation.currentChannel = channel;
    addActivity(
      "Updated itinerary generated",
      `Itinerary for ${booking.currentFlight.flightNumber}`,
    );
    addActivity("Email delivery simulated", booking.bookingReference);
    appendEvent("ITINERARY_GENERATED", "Email", {
      flightNumber: booking.currentFlight.flightNumber,
    });
    appendEvent("ITINERARY_SENT", "Email", {
      bookingReference: booking.bookingReference,
    });
    addMessage(
      "Email",
      "SurgeAir AI",
      `Your updated itinerary for ${booking.currentFlight.flightNumber} has been sent.`,
    );
    syncConversation("sendItinerary", "Itinerary sent");
  },

  getSmsProviderMode() {
    return awsReadinessConfig.channels.sms.provider;
  },

  sendSmsSimulatorTest(message: string) {
    return smsChannel.sendSimulatorTest(message);
  },

  getDashboard() {
    const stored = conversationRepository.get(conversationId);
    if (!stored) {
      throw new Error("Demo conversation is unavailable.");
    }
    const modelExecution = operationalLogger.getLatestModelExecution();
    return {
      booking,
      disruption: flights.get("SA204")!,
      messages: stored.messages,
      activities,
      selectedAlternative: conversation.selectedFlight,
      confirmationStatus: conversation.confirmationStatus,
      actionStatus: conversation.rebookingStatus,
      orchestration: {
        conversationId,
        currentChannel: stored.currentChannel,
        previousChannel: stored.previousChannel,
        currentIntent: stored.detectedIntent,
        currentAgentState: stored.currentAgentState,
        lastToolCalled: stored.lastToolCalled,
        modelProvider: modelExecution.provider,
        model: modelExecution.model,
        region: modelExecution.region,
        modelStatus: modelExecution.status,
        modelLatencyMs: modelExecution.latencyMs,
        modelFallbackReason: modelExecution.fallbackReason,
      },
      integrationStatus: integrationReadiness.map((integration) =>
        integration.service === "Amazon Bedrock"
          ? {
              ...integration,
              status: operationalLogger.getBedrockVerificationStatus(),
            }
          : integration.service === "AWS End User Messaging SMS"
            ? {
                ...integration,
                status:
                  awsReadinessConfig.channels.sms.provider === "simulated"
                    ? "SIMULATED"
                    : operationalLogger.getSmsVerificationStatus(),
                ...(awsReadinessConfig.channels.sms.simulatorDestination
                  ? { detail: "AWS Simulator" }
                  : {}),
              }
            : integration,
      ),
    };
  },
};