type Alternative = {
  flightNumber: string;
  departure: string;
  arrival: string;
};

export function distinctAlternatives<T extends { flightNumber: string }>(flights: readonly T[]): T[] {
  return [...new Map(flights.map((flight) => [flight.flightNumber.toUpperCase(), flight])).values()];
}

export function describeAlternatives(flights: readonly Alternative[], arrivalBefore: string): string {
  if (flights.length === 1) {
    const flight = flights[0]!;
    return `I found one suitable alternative arriving before ${arrivalBefore}: ${flight.flightNumber}, departing at ${flight.departure} and arriving at ${flight.arrival}. Which one would you prefer?`;
  }
  const options = flights.map((flight, index) =>
    `${index + 1}. ${flight.flightNumber} departing at ${flight.departure} and arriving at ${flight.arrival}`,
  ).join("\n");
  return `I found ${flights.length} alternative flights arriving before ${arrivalBefore}:\n\n${options}\n\nWhich one would you prefer?`;
}