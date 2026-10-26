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
import {
  verifiedIntegrationProfile,
  verifiedReadinessEvidence,
} from "../config/verified-readiness-evidence";
import {
  InMemoryConversationRepository,
  type StoredConversation,
} from "../conversation/conversation-repository";
import {
  InMemoryEventStore,
  type SurgeAirEvent,
  type SurgeAirEventType,
} from "../events/event-store";
import { createModelProvider } from "../models/model-provider-factory";
import { extractClearArrivalBefore } from "../models/model-provider";
import { LocalOperationalLogger } from "../observability/operational-logger";
import { JsonReadinessStateStore } from "../observability/readiness-state-store";
import { MessageOrchestrator } from "../orchestration/message-orchestrator";
import { resolve } from "node:path";
import { passengerScenarios, type PassengerScenario } from "./scenarios";
import { maskEmailAddress } from "../channels/aws-ses-provider";
import type { ItineraryEmailPreview } from "@workspace/api-zod";

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

export interface DemoStateSnapshot {
  booking: BookingRecord;
  conversations: StoredConversation[];
  activities: ActivityRecord[];
  events: SurgeAirEvent[];
  emailPreview?: ItineraryEmailPreview;
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

const flights = new Map<string, FlightRecord>(
  passengerScenarios.flatMap((scenario) =>
    [scenario.originalFlight, ...scenario.alternatives].map(
      (flight) => [flight.flightNumber, flight] as const,
    ),
  ),
);

function scenarioFor(reference: string): PassengerScenario | undefined {
  return passengerScenarios.find(
    (scenario) => scenario.bookingReference === reference.toUpperCase(),
  );
}

export function createCanonicalDemoState(reference = "SG4821") {
  const scenario = scenarioFor(reference);
  if (!scenario) throw new Error("Passenger scenario not found.");
  const booking: BookingRecord = {
    bookingReference: scenario.bookingReference,
    passengerId: scenario.passengerId,
    passengerName: scenario.passengerName,
    currentFlight: { ...scenario.originalFlight },
    origin: scenario.origin,
    destination: scenario.destination,
    status: "Disrupted",
  };
  const conversation: ConversationState = {
    passengerId: booking.passengerId,
    passengerName: booking.passengerName,
    bookingReference: booking.bookingReference,
    currentFlight: scenario.originalFlight.flightNumber,
    origin: scenario.origin,
    destination: scenario.destination,
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
      text: scenario.bookingReference === "SG4821"
        ? "Flight SA204 from Lisbon to Edinburgh is delayed by 3 hours. I can help you find another option."
        : `Flight ${scenario.originalFlight.flightNumber} from ${scenario.origin} to ${scenario.destination} is ${scenario.originalFlight.status.toLowerCase()}. ${scenario.disruptionReason}. I can help you find another option.`,
      timestamp: "10:03",
    },
  ];
  return { booking, conversation, messages };
}

export function createSurgeAirStore() {
const { booking, conversation, messages } = createCanonicalDemoState();

let activeScenario = passengerScenarios[0]!;
let conversationId = "conv-sg4821-disruption";
// Display metadata only; no credentials or unmasked addresses leave the server.
let emailPreview: ItineraryEmailPreview | undefined;
const awsReadinessConfig = getAwsReadinessConfig();
const readinessStore = new JsonReadinessStateStore(
  resolve(process.cwd(), "data/integration-readiness.json"),
  verifiedReadinessEvidence,
);
const operationalLogger = new LocalOperationalLogger({
  bedrockVerified:
    awsReadinessConfig.verified.bedrock ||
    verifiedReadinessEvidence.bedrock?.status === "CONNECTED",
  bedrockModelId:
    awsReadinessConfig.bedrockModelId ??
    verifiedIntegrationProfile.bedrockModelId,
  region: awsReadinessConfig.region,
  smsVerified:
    awsReadinessConfig.verified.sms ||
    verifiedReadinessEvidence.sms?.status === "CONNECTED",
  sesVerified:
    awsReadinessConfig.verified.ses ||
    verifiedReadinessEvidence.ses?.status === "CONNECTED",
  agentCoreVerified:
    awsReadinessConfig.verified.agentCore ||
    verifiedReadinessEvidence.agentCore?.status === "CONNECTED",
  store: readinessStore,
});
const smsChannel = new SmsChannel(operationalLogger, {
  provider: awsReadinessConfig.channels.sms.provider,
  region: awsReadinessConfig.region,
  originationIdentity:
    awsReadinessConfig.channels.sms.originationIdentity ?? undefined,
  simulatorDestination:
    awsReadinessConfig.channels.sms.simulatorDestination ?? undefined,
});
const emailChannel = new EmailChannel(operationalLogger, {
  provider: awsReadinessConfig.channels.email.provider,
  region: awsReadinessConfig.region,
  fromEmail: awsReadinessConfig.channels.email.fromEmail ?? undefined,
  testDestination:
    awsReadinessConfig.channels.email.testDestination ?? undefined,
});
const simulatedItinerarySender = new SimulatedItinerarySender();
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
    emailChannel,
  ],
  conversationRepository,
  createModelProvider(operationalLogger),
  eventStore,
  operationalLogger,
);

const activities: ActivityRecord[] = canonicalActivities();

function canonicalActivities(): ActivityRecord[] {
  return [
    {
      id: "activity-1",
      label: "Flight disruption detected",
      detail: activeScenario.bookingReference === "SG4821"
        ? "SA204 delayed by 3 hours"
        : `${activeScenario.originalFlight.flightNumber}: ${activeScenario.disruptionReason}`,
      status: "COMPLETED",
      timestamp: "10:02",
    },
    {
      id: "activity-2",
      label: "Passenger notified",
      detail: `SMS sent to ${activeScenario.passengerName}`,
      status: "COMPLETED",
      timestamp: "10:03",
    },
  ];
}

function canonicalEvents(
  sourceBooking: BookingRecord = booking,
): SurgeAirEvent[] {
  return [
    {
      eventId: "evt-1",
      conversationId,
      passengerId: sourceBooking.passengerId,
      eventType: "FLIGHT_DISRUPTION_DETECTED",
      channel: "sms",
      timestamp: new Date().toISOString(),
      metadata: {
        flightNumber: activeScenario.originalFlight.flightNumber,
        delayMinutes: activeScenario.originalFlight.delayMinutes,
      },
    },
    {
      eventId: "evt-2",
      conversationId,
      passengerId: sourceBooking.passengerId,
      eventType: "PASSENGER_NOTIFIED",
      channel: "sms",
      timestamp: new Date().toISOString(),
      metadata: { bookingReference: sourceBooking.bookingReference },
    },
  ];
}

function createCanonicalDemoSnapshot(): DemoStateSnapshot {
  const canonical = createCanonicalDemoState(activeScenario.bookingReference);
  return {
    booking: {
      ...canonical.booking,
      currentFlight: { ...canonical.booking.currentFlight },
    },
    conversations: [
      {
        ...canonical.conversation,
        conversationId,
        messages: canonical.messages.map((message) => ({ ...message })),
        createdAt: "2025-01-01T10:03:00.000Z",
        updatedAt: "2025-01-01T10:03:00.000Z",
        lastToolCalled: null,
        currentAgentState: "Disruption detected",
      },
    ],
    activities: canonicalActivities(),
    events: canonicalEvents(canonical.booking),
  };
}

eventStore.append({
  conversationId,
  passengerId: booking.passengerId,
  eventType: "FLIGHT_DISRUPTION_DETECTED",
  channel: "sms",
  metadata: {
    flightNumber: activeScenario.originalFlight.flightNumber,
    delayMinutes: activeScenario.originalFlight.delayMinutes,
  },
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

function completedBookingReply(): string {
  return `Your booking has already been updated to ${booking.currentFlight.flightNumber}.`;
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

const store = {
  captureState(): DemoStateSnapshot {
    return {
      booking: {
        ...booking,
        currentFlight: { ...booking.currentFlight },
      },
      conversations: conversationRepository.snapshot(),
      activities: activities.map((activity) => ({ ...activity })),
      events: eventStore.snapshot(),
      ...(emailPreview ? { emailPreview: { ...emailPreview } } : {}),
    };
  },

  restoreState(snapshot: DemoStateSnapshot) {
    emailPreview = snapshot.emailPreview ? { ...snapshot.emailPreview } : undefined;
    activeScenario = scenarioFor(snapshot.booking.bookingReference) ?? activeScenario;
    conversationId = `conv-${activeScenario.bookingReference.toLowerCase()}-disruption`;
    Object.assign(booking, {
      ...snapshot.booking,
      currentFlight: { ...snapshot.booking.currentFlight },
    });
    const stored = snapshot.conversations.find(
      (item) => item.conversationId === conversationId,
    );
    if (stored) {
      Object.assign(conversation, {
        passengerId: stored.passengerId,
        passengerName: stored.passengerName,
        bookingReference: stored.bookingReference,
        currentFlight: stored.currentFlight,
        origin: stored.origin,
        destination: stored.destination,
        currentChannel: stored.currentChannel,
        previousChannel: stored.previousChannel,
        passengerRequest: stored.passengerRequest,
        detectedIntent: stored.detectedIntent,
        arrivalConstraint: stored.arrivalConstraint,
        alternativeFlights: [...stored.alternativeFlights],
        selectedFlight: stored.selectedFlight,
        confirmationStatus: stored.confirmationStatus,
        rebookingStatus: stored.rebookingStatus,
      });
    }
    conversationRepository.restore(snapshot.conversations);
    activities.splice(
      0,
      activities.length,
      ...snapshot.activities.map((activity) => ({ ...activity })),
    );
    eventStore.restore(snapshot.events);
  },

  resetDemo() {
    emailPreview = undefined;
    activeScenario = passengerScenarios[0]!;
    conversationId = "conv-sg4821-disruption";
    const canonical = createCanonicalDemoState();
    Object.assign(booking, {
      ...canonical.booking,
      currentFlight: { ...canonical.booking.currentFlight },
    });
    Object.assign(conversation, canonical.conversation, {
      alternativeFlights: [],
    });
    conversationRepository.restore([
      {
        ...canonical.conversation,
        conversationId,
        messages: canonical.messages.map((message) => ({ ...message })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastToolCalled: null,
        currentAgentState: "Disruption detected",
      },
    ]);
    activities.splice(0, activities.length, ...canonicalActivities());
    eventStore.restore(canonicalEvents());
    return {
      success: true as const,
      booking: "SG4821" as const,
      flight: "SA204" as const,
      status: "Disrupted" as const,
    };
  },

  listPassengers() {
    return passengerScenarios.map(({ passengerId: _passengerId, alternatives: _alternatives, ...scenario }) => ({
      ...scenario,
      originalFlight: { ...scenario.originalFlight },
    }));
  },

  selectPassenger(reference: string) {
    const next = scenarioFor(reference);
    if (!next) return null;
    emailPreview = undefined;
    activeScenario = next;
    conversationId = `conv-${next.bookingReference.toLowerCase()}-disruption`;
    const canonical = createCanonicalDemoState(next.bookingReference);
    Object.assign(booking, canonical.booking);
    Object.assign(conversation, canonical.conversation);
    conversationRepository.restore([{
      ...canonical.conversation,
      conversationId,
      messages: canonical.messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastToolCalled: null,
      currentAgentState: "Disruption detected",
    }]);
    activities.splice(0, activities.length, ...canonicalActivities());
    eventStore.restore(canonicalEvents(canonical.booking));
    return { bookingReference: next.bookingReference };
  },

  selectConversationChannel(channel: Exclude<Channel, "Email">) {
    const stored = conversationRepository.transitionChannel(conversationId, channel);
    conversation.currentChannel = stored.currentChannel;
    conversation.previousChannel = stored.previousChannel;
    return { currentChannel: stored.currentChannel };
  },

  async recordPassengerMessage(channel: Channel, content: string) {
    const result = await messageOrchestrator.receive({
      messageId: `inbound-${Date.now()}`,
      conversationId,
      passengerId: booking.passengerId,
      bookingReference: booking.bookingReference,
      channel: channel.toLowerCase() as Lowercase<Channel>,
      direction: "inbound",
      content,
      timestamp: new Date().toISOString(),
    });
    const stored = conversationRepository.get(conversationId)!;
    conversation.currentChannel = stored.currentChannel;
    conversation.previousChannel = stored.previousChannel;
    return result;
  },

  async interpretMessage(
    content: string,
    reference: string,
    presentedFlightNumbers: string[] = [],
  ) {
    if (reference.toUpperCase() !== booking.bookingReference) return null;
    if (booking.status === "Rebooked") {
      return {
        intent: "unknown" as const,
        arrivalBefore: null,
        selectedFlight: null,
        provider: "local" as const,
        clarification: completedBookingReply(),
      };
    }
    const routeAlternatives = activeScenario.alternatives
      .filter(
        (flight) =>
          flight.origin === booking.origin &&
          flight.destination === booking.destination &&
          flight.status === "Available",
      )
      .map((flight) => flight.flightNumber.toUpperCase());
    const searchedAlternatives = new Set(conversation.alternativeFlights);
    const presentedAlternatives = presentedFlightNumbers
      .map((flightNumber) => flightNumber.toUpperCase())
      .filter((flightNumber, index, list) =>
        routeAlternatives.includes(flightNumber) &&
        searchedAlternatives.has(flightNumber) &&
        list.indexOf(flightNumber) === index,
      );
    const interpretation = await messageOrchestrator.interpret(content, {
      passengerName: booking.passengerName,
      bookingReference: booking.bookingReference,
      currentFlight: booking.currentFlight.flightNumber,
      origin: booking.origin,
      destination: booking.destination,
      disruptionStatus: booking.currentFlight.status,
      presentedAlternatives,
    });

    const explicitFlight = content.toUpperCase().match(/\bSA\d{3}\b/)?.[0] ?? null;
    const acceptsPresentedOption =
      /^(?:(?:that|this|it)(?:\s+one)?\s+(?:works(?:\s+for\s+me)?|looks good|is fine|is okay)|(?:i(?:'ll| will)?\s+)?(?:take|choose|pick|book)\s+(?:that|this|it)(?:\s+one)?)[.!]?$/i.test(content.trim());
    const proposedFlight = interpretation.selectedFlight?.toUpperCase() ?? null;
    const selectedFlight =
      acceptsPresentedOption
        ? presentedAlternatives.length === 1 ? presentedAlternatives[0]! : null
        : proposedFlight && routeAlternatives.includes(proposedFlight) &&
          searchedAlternatives.has(proposedFlight) &&
          (presentedAlternatives.includes(proposedFlight) || explicitFlight === proposedFlight)
          ? proposedFlight
          : null;
    const groundedArrival = extractClearArrivalBefore(content);
    const arrivalBefore =
      groundedArrival && interpretation.constraints.arrivalBefore === groundedArrival
        ? groundedArrival
        : null;
    const timeNeedsClarification =
      /\b(?:before|by|no later than|later than|arrive(?:s|ing)? by)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.test(content) &&
      arrivalBefore === null;
    const selectionRequested =
      acceptsPresentedOption ||
      /\b(?:first|second|third|option\s*\d+|flight\s+SA\d{3}|SA\d{3})\b/i.test(content);
    const clarification = interpretation.destination &&
      interpretation.destination !== booking.destination
      ? `Your active booking goes to ${booking.destination}. Did you mean this booking's destination?`
      : timeNeedsClarification
      ? "Should that arrival time be AM or PM?"
      : selectionRequested && !selectedFlight
        ? presentedAlternatives.length
          ? "Which presented flight would you like to select?"
          : "Please provide the flight number you want to select."
        : null;

    return {
      intent: selectedFlight ? "select_alternative" : interpretation.intent,
      arrivalBefore,
      selectedFlight,
      provider: interpretation.provider,
      clarification,
    };
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
    if (booking.status === "Rebooked") return [];
    const constraint = arrivalBefore ? minutes(arrivalBefore) : Number.MAX_VALUE;
    const matches = [...flights.values()].filter(
      (flight) =>
        activeScenario.alternatives.some(
          (alternative) => alternative.flightNumber === flight.flightNumber,
        ) &&
        flight.origin === origin.toUpperCase() &&
        flight.destination === destination.toUpperCase() &&
        flight.origin === booking.origin &&
        flight.destination === booking.destination &&
        flight.status === "Available" &&
        minutes(flight.arrival) < constraint,
    );

    conversation.passengerRequest =
      arrivalBefore
        ? `I need to arrive before ${arrivalBefore}.`
        : "I need an alternative flight.";
    conversation.detectedIntent = "Find alternative flight";
    conversation.arrivalConstraint = arrivalBefore ?? null;
    conversation.alternativeFlights = matches.map(
      (flight) => flight.flightNumber,
    );
    appendEvent("CONSTRAINT_DETECTED", conversation.currentChannel, {
      arrivalBefore: arrivalBefore ?? null,
    });
    appendEvent("ALTERNATIVES_FOUND", conversation.currentChannel, {
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
    if (reference.toUpperCase() === booking.bookingReference && booking.status === "Rebooked") {
      return {
        error: completedBookingReply(),
      } as const;
    }
    const target = flights.get(newFlightNumber.toUpperCase());
    if (
      reference.toUpperCase() !== booking.bookingReference ||
      !target ||
      !activeScenario.alternatives.some((flight) => flight.flightNumber === target.flightNumber)
    ) {
      return { error: "Booking or flight not found." } as const;
    }

    conversation.selectedFlight = target.flightNumber;
    conversation.confirmationStatus = "Awaiting passenger confirmation";
    appendEvent("ALTERNATIVE_SELECTED", conversation.currentChannel, {
      flightNumber: target.flightNumber,
    });
    appendEvent("CONFIRMATION_REQUESTED", conversation.currentChannel, {
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
    if (reference.toUpperCase() === booking.bookingReference && booking.status === "Rebooked") {
      return {
        error: completedBookingReply(),
      } as const;
    }
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
    if (
      reference.toUpperCase() !== booking.bookingReference ||
      !target ||
      !activeScenario.alternatives.some((flight) => flight.flightNumber === target.flightNumber)
    ) {
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
    conversation.selectedFlight = target.flightNumber;
    conversation.confirmationStatus = "Confirmed";
    conversation.rebookingStatus = "Rebooked";
    conversation.currentFlight = target.flightNumber;
    appendEvent("ALTERNATIVE_SELECTED", conversation.currentChannel, {
      flightNumber: target.flightNumber,
    });
    appendEvent("CONFIRMATION_RECEIVED", conversation.currentChannel, {
      confirmationReceived: true,
    });
    appendEvent("REBOOKING_STARTED", conversation.currentChannel, {
      bookingReference: reference,
    });
    appendEvent("REBOOKING_COMPLETED", conversation.currentChannel, {
      previousFlight,
      currentFlight: target.flightNumber,
    });
    operationalLogger.record("rebooking_success", {
      bookingReference: reference,
      previousFlight,
      currentFlight: target.flightNumber,
    });
    addMessage(
      conversation.currentChannel,
      booking.passengerName,
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

  async sendItinerary(reference: string, channel: Channel) {
    if (reference.toUpperCase() !== booking.bookingReference) {
      return null;
    }
    const stored = conversationRepository.get(conversationId);
    if (
      !stored ||
      stored.confirmationStatus !== "Confirmed" ||
      stored.rebookingStatus !== "Rebooked" ||
      booking.status !== "Rebooked"
    ) {
      return {
        error:
          "The updated itinerary can only be sent after explicit rebooking confirmation.",
      } as const;
    }

    if (channel !== "Email") {
      const simulated = await simulatedItinerarySender.send(booking, channel);
      this.markItinerarySent(channel, false);
      return simulated;
    }

    const subject = `SurgeAir — Updated itinerary for ${booking.bookingReference}`;
    const body = [
      `Passenger: ${booking.passengerName}`,
      `Booking: ${booking.bookingReference}`,
      activeScenario.bookingReference === "SG4821"
        ? `Route: Lisbon (${booking.origin}) → Edinburgh (${booking.destination})`
        : `Route: ${booking.origin} → ${booking.destination}`,
      `Old flight: ${activeScenario.originalFlight.flightNumber}, ${activeScenario.originalFlight.status.toLowerCase()}${activeScenario.originalFlight.delayMinutes ? ` ${activeScenario.originalFlight.delayMinutes} minutes` : ""}`,
      `New flight: ${booking.currentFlight.flightNumber}`,
      `Departure: ${booking.currentFlight.departure}`,
      `Arrival: ${booking.currentFlight.arrival}`,
      ...(booking.currentFlight.gate ? [`Gate: ${booking.currentFlight.gate}`] : []),
      `Status: ${booking.status}`,
      ...(activeScenario.bookingReference === "SG4821"
        ? []
        : [`Travelers: ${activeScenario.travelers}`]),
      "",
      "Thank you for flying with SurgeAir. Safe travels!",
    ].join("\n");
    const delivery = await emailChannel.sendItinerary(subject, body);
    emailPreview = {
      from: maskEmailAddress(awsReadinessConfig.channels.email.fromEmail ?? ""),
      to: maskEmailAddress(delivery.destination),
      subject,
      body,
      provider: delivery.provider,
      messageId: delivery.messageId,
      sentAt: new Date().toISOString(),
    };
    this.markItinerarySent("Email", delivery.provider === "amazon-ses");
    return {
      sent: delivery.success,
      channel: "Email",
      message:
        delivery.provider === "amazon-ses"
          ? `Updated itinerary for ${booking.bookingReference} accepted by Amazon SES.`
          : `Updated itinerary for ${booking.bookingReference} simulated successfully.`,
      sentAt: new Date().toISOString(),
      emailPreview,
    };
  },

  markItinerarySent(channel: Channel, liveEmail = false) {
    addActivity(
      "Updated itinerary generated",
      `Itinerary for ${booking.currentFlight.flightNumber}`,
    );
    addActivity(
      liveEmail ? "Email delivered via Amazon SES" : "Email delivery simulated",
      booking.bookingReference,
    );
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

  getEmailProviderMode() {
    return awsReadinessConfig.channels.email.provider;
  },

  sendEmailIntegrationTest() {
    return emailChannel.sendTest(
      "SurgeAir SES Integration Test",
      "SurgeAir AI successfully connected to Amazon SES. Booking SG4821 email delivery is ready.",
    );
  },

  getDashboard() {
    const stored = conversationRepository.get(conversationId);
    if (!stored) {
      throw new Error("Demo conversation is unavailable.");
    }
    const modelExecution = operationalLogger.getLatestModelExecution();
    return {
      booking,
      disruption: activeScenario.originalFlight,
      messages: stored.messages,
      activities,
      ...(emailPreview ? { emailPreview } : {}),
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
              ...(operationalLogger.getBedrockVerificationStatus() ===
              "CONNECTED"
                ? {
                    detail: `${modelExecution.model} • ${awsReadinessConfig.region}`,
                  }
                : {}),
            }
          : integration.service === "Bedrock AgentCore"
            ? {
                ...integration,
                status: operationalLogger.getAgentCoreVerificationStatus(),
                ...(operationalLogger.getAgentCoreVerificationStatus() ===
                "CONNECTED"
                  ? {
                      detail: awsReadinessConfig.agentCoreRuntimeName
                        ? `Runtime: ${awsReadinessConfig.agentCoreRuntimeName} • Live Runtime`
                        : "Live Runtime",
                    }
                  : {}),
              }
          : integration.service === "AWS End User Messaging SMS"
            ? {
                ...integration,
                status:
                  awsReadinessConfig.channels.sms.provider === "simulated"
                    ? "SIMULATED"
                    : operationalLogger.getSmsVerificationStatus(),
                ...(awsReadinessConfig.channels.sms.simulatorDestination
                  ? {
                      detail: `AWS Simulator • ${awsReadinessConfig.region}`,
                    }
                  : {}),
              }
            : integration.service === "Amazon SES"
              ? {
                  ...integration,
                  status:
                    awsReadinessConfig.channels.email.provider === "simulated"
                      ? "SIMULATED"
                      : operationalLogger.getSesVerificationStatus(),
                  ...(operationalLogger.getSesVerificationStatus() ===
                  "CONNECTED"
                    ? {
                        detail: `Live Email • ${awsReadinessConfig.region}`,
                      }
                    : {}),
                }
            : integration,
      ),
    };
  },
};

return store;
}

export type SurgeAirStore = ReturnType<typeof createSurgeAirStore>;

export const surgeAirStore = createSurgeAirStore();