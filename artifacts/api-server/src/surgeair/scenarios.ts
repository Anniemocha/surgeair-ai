import type { FlightRecord } from "./domain";

export interface PassengerScenario {
  bookingReference: string;
  passengerId: string;
  passengerName: string;
  travelers: number;
  origin: string;
  destination: string;
  originalFlight: FlightRecord;
  alternatives: FlightRecord[];
  disruptionReason: string;
  scenarioType: string;
  suggestedRequirement: string;
  revisedDeparture?: string;
  revisedArrival?: string;
  terminal?: string;
}

function flight(
  flightNumber: string,
  origin: string,
  destination: string,
  departure: string,
  arrival: string,
  status: string,
  delayMinutes: number,
  gate: string,
  aircraft = "Airbus A320",
): FlightRecord {
  return {
    flightNumber, origin, destination, departure, arrival, status,
    delayMinutes, gate, aircraft,
  };
}

export const passengerScenarios: readonly PassengerScenario[] = [
  {
    bookingReference: "SG4821", passengerId: "PAX-1042",
    passengerName: "Draymond Hillsend", travelers: 1,
    origin: "LIS", destination: "EDI",
    originalFlight: flight("SA204", "LIS", "EDI", "10:15", "13:25", "Delayed", 180, "14"),
    alternatives: [
      flight("SA218", "LIS", "EDI", "11:30", "14:40", "Available", 0, "21", "Airbus A321neo"),
      flight("SA226", "LIS", "EDI", "13:10", "16:20", "Available", 0, "18", "Boeing 737-8"),
    ],
    disruptionReason: "A three-hour operational delay",
    scenarioType: "Delay · arrival deadline",
    suggestedRequirement: "I need to arrive before 18:00",
    revisedDeparture: "13:15", revisedArrival: "16:25", terminal: "1",
  },
  {
    bookingReference: "SG5102", passengerId: "PAX-5102",
    passengerName: "Elena Marquez", travelers: 1,
    origin: "LHR", destination: "AMS",
    originalFlight: flight("SA310", "LHR", "AMS", "09:10", "11:25", "Cancelled", 0, "B12"),
    alternatives: [
      flight("SA312", "LHR", "AMS", "11:20", "13:35", "Available", 0, "B18"),
      flight("SA316", "LHR", "AMS", "15:00", "17:15", "Available", 0, "B21"),
    ],
    disruptionReason: "Aircraft unavailable; the original flight was cancelled",
    scenarioType: "Cancellation", suggestedRequirement: "I need to arrive before 16:00",
    terminal: "2",
  },
  {
    bookingReference: "SG6214", passengerId: "PAX-6214",
    passengerName: "Daniel Okafor", travelers: 1,
    origin: "CDG", destination: "FCO",
    originalFlight: flight("SA420", "CDG", "FCO", "08:45", "10:50", "Connection Disrupted", 85, "D4"),
    alternatives: [
      flight("SA422", "CDG", "FCO", "12:20", "14:25", "Available", 0, "D8"),
      flight("SA428", "CDG", "FCO", "17:00", "19:05", "Available", 0, "D11"),
    ],
    disruptionReason: "Inbound connection delay makes the original departure unreachable",
    scenarioType: "Missed connection", suggestedRequirement: "I need to arrive before 18:00",
    revisedDeparture: "10:10", revisedArrival: "12:15", terminal: "2E",
  },
  {
    bookingReference: "SG7338", passengerId: "PAX-7338",
    passengerName: "Sophie Laurent", travelers: 1,
    origin: "MAD", destination: "BER",
    originalFlight: flight("SA530", "MAD", "BER", "12:10", "15:15", "Delayed", 55, "C9"),
    alternatives: [
      flight("SA532", "MAD", "BER", "13:35", "16:40", "Available", 0, "C12"),
      flight("SA536", "MAD", "BER", "16:25", "19:30", "Available", 0, "C15"),
    ],
    disruptionReason: "A short ground-handling delay",
    scenarioType: "Short delay", suggestedRequirement: "I need to arrive before 18:00",
    revisedDeparture: "13:05", revisedArrival: "16:10", terminal: "4",
  },
  {
    bookingReference: "SG8450", passengerId: "PAX-8450",
    passengerName: "Marcus Bennett", travelers: 3,
    origin: "DUB", destination: "BCN",
    originalFlight: flight("SA640", "DUB", "BCN", "10:30", "14:00", "Delayed", 210, "24"),
    alternatives: [
      flight("SA642", "DUB", "BCN", "11:45", "15:15", "Available", 0, "28"),
      flight("SA646", "DUB", "BCN", "15:30", "19:00", "Available", 0, "32"),
    ],
    disruptionReason: "Late inbound aircraft; three travelers are on this booking",
    scenarioType: "Group booking · significant delay",
    suggestedRequirement: "I need to arrive before 18:00",
    revisedDeparture: "14:00", revisedArrival: "17:30", terminal: "1",
  },
  {
    bookingReference: "SG9562", passengerId: "PAX-9562",
    passengerName: "Amara Nwosu", travelers: 1,
    origin: "FRA", destination: "CPH",
    originalFlight: flight("SA750", "FRA", "CPH", "10:00", "11:30", "Delayed", 140, "A6"),
    alternatives: [
      flight("SA752", "FRA", "CPH", "12:50", "14:20", "Available", 0, "A9"),
      flight("SA756", "FRA", "CPH", "16:15", "17:45", "Available", 0, "A12"),
    ],
    disruptionReason: "Weather-related arrival restrictions",
    scenarioType: "No suitable alternative", suggestedRequirement: "I need to arrive before 13:00",
    revisedDeparture: "12:20", revisedArrival: "13:50", terminal: "1",
  },
  {
    bookingReference: "SG1674", passengerId: "PAX-1674",
    passengerName: "Lukas Weber", travelers: 1,
    origin: "AMS", destination: "LIS",
    originalFlight: flight("SA860", "AMS", "LIS", "07:45", "10:45", "Delayed", 95, "F3"),
    alternatives: [
      flight("SA862", "AMS", "LIS", "11:30", "14:30", "Available", 0, "F7"),
      flight("SA866", "AMS", "LIS", "17:20", "20:20", "Available", 0, "F10"),
    ],
    disruptionReason: "A maintenance inspection delayed departure",
    scenarioType: "Later departure preferred",
    suggestedRequirement: "I need to arrive before 21:00",
    revisedDeparture: "09:20", revisedArrival: "12:20", terminal: "3",
  },
  {
    bookingReference: "SG2786", passengerId: "PAX-2786",
    passengerName: "Isabella Romano", travelers: 1,
    origin: "EDI", destination: "CDG",
    originalFlight: flight("SA970", "EDI", "CDG", "13:00", "15:50", "Cancelled", 0, "8"),
    alternatives: [
      flight("SA972", "EDI", "CDG", "16:10", "19:00", "Available", 0, "12"),
    ],
    disruptionReason: "The original departure was cancelled after a technical fault",
    scenarioType: "Cancellation · one alternative",
    suggestedRequirement: "I need to arrive before 20:00",
    terminal: "1",
  },
];