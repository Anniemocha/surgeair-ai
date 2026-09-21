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

const activities: ActivityRecord[] = [
  {
    id: "activity-1",
    label: "Flight disruption detected",
    detail: "SA204 delayed by 3 hours",
    status: "complete",
    timestamp: "10:02",
  },
  {
    id: "activity-2",
    label: "Passenger notified",
    detail: "SMS sent to Draymond Hillsend",
    status: "complete",
    timestamp: "10:03",
  },
];

function minutes(time: string): number {
  const [hours = "0", mins = "0"] = time.split(":");
  return Number(hours) * 60 + Number(mins);
}

function addActivity(label: string, detail: string) {
  activities.push({
    id: `activity-${activities.length + 1}`,
    label,
    detail,
    status: "complete",
    timestamp: new Date().toISOString(),
  });
}

function addMessage(channel: Channel, sender: string, text: string) {
  messages.push({
    id: `msg-${messages.length + 1}`,
    channel,
    sender,
    text,
    timestamp: new Date().toISOString(),
  });
}

export const surgeAirStore = {
  getBooking(reference: string) {
    return reference.toUpperCase() === booking.bookingReference ? booking : null;
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

  rebook(reference: string, newFlightNumber: string, confirmed: boolean) {
    if (!confirmed) {
      conversation.selectedFlight = newFlightNumber.toUpperCase();
      conversation.confirmationStatus = "Awaiting passenger confirmation";
      return { error: "Explicit passenger confirmation is required." } as const;
    }

    const target = flights.get(newFlightNumber.toUpperCase());
    if (reference.toUpperCase() !== booking.bookingReference || !target) {
      return { error: "Booking or flight not found." } as const;
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
    addMessage(
      "Email",
      "SurgeAir AI",
      `Your updated itinerary for ${booking.currentFlight.flightNumber} has been sent.`,
    );
  },

  getDashboard() {
    return {
      booking,
      disruption: flights.get("SA204")!,
      messages,
      activities,
      selectedAlternative: conversation.selectedFlight,
      confirmationStatus: conversation.confirmationStatus,
      actionStatus: conversation.rebookingStatus,
    };
  },
};