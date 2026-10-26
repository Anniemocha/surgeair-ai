type ConfirmedBooking = {
  bookingReference: string;
  origin: string;
  destination: string;
  currentFlight: { flightNumber: string; departure: string; arrival: string };
};

export function airportName(code: string): string {
  const cities: Record<string, string> = {
    LIS: "Lisbon", EDI: "Edinburgh", LHR: "London Heathrow", LGW: "London Gatwick",
    JFK: "New York", CDG: "Paris", AMS: "Amsterdam", FRA: "Frankfurt",
    MAD: "Madrid", DUB: "Dublin", BCN: "Barcelona", FCO: "Rome",
  };
  return cities[code] ? `${cities[code]} (${code})` : code;
}

export function confirmationSummary(booking: ConfirmedBooking): string {
  const flight = booking.currentFlight;
  return `Confirmed: ${flight.flightNumber}, ${airportName(booking.origin)} ${flight.departure} to ${airportName(booking.destination)} ${flight.arrival}. Booking reference ${booking.bookingReference}.`;
}

export function itineraryDeliverySummary(result: {
  sent: boolean;
  emailPreview?: { provider: string };
}): string {
  if (!result.sent) return "The itinerary email was not sent.";
  if (result.emailPreview?.provider === "amazon-ses") return "I've sent the updated itinerary to your email. Safe travels!";
  if (result.emailPreview?.provider === "simulated") return "Email delivery was simulated; no real itinerary email was sent.";
  return "The itinerary request completed, but delivery receipt details are unavailable.";
}
