export type SurgeAirEventType =
  | "FLIGHT_DISRUPTION_DETECTED"
  | "PASSENGER_NOTIFIED"
  | "PASSENGER_MESSAGE_RECEIVED"
  | "BOOKING_RETRIEVED"
  | "CONSTRAINT_DETECTED"
  | "ALTERNATIVES_FOUND"
  | "ALTERNATIVE_SELECTED"
  | "CONFIRMATION_REQUESTED"
  | "CONFIRMATION_RECEIVED"
  | "REBOOKING_STARTED"
  | "REBOOKING_COMPLETED"
  | "ITINERARY_GENERATED"
  | "ITINERARY_SENT";

export interface SurgeAirEvent {
  eventId: string;
  conversationId: string;
  passengerId: string;
  eventType: SurgeAirEventType;
  channel: string;
  timestamp: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface EventStore {
  append(
    event: Omit<SurgeAirEvent, "eventId" | "timestamp">,
  ): SurgeAirEvent;
  list(conversationId: string): SurgeAirEvent[];
}

export class InMemoryEventStore implements EventStore {
  private readonly events: SurgeAirEvent[] = [];

  append(event: Omit<SurgeAirEvent, "eventId" | "timestamp">) {
    const saved: SurgeAirEvent = {
      ...event,
      eventId: `evt-${this.events.length + 1}`,
      timestamp: new Date().toISOString(),
    };
    this.events.push(saved);
    return saved;
  }

  list(conversationId: string) {
    return this.events.filter(
      (event) => event.conversationId === conversationId,
    );
  }
}