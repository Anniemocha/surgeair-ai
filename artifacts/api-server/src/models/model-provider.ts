export type SurgeAirToolName =
  | "getBooking"
  | "getFlightStatus"
  | "searchAlternativeFlights"
  | "rebookFlight"
  | "sendItinerary";

export interface PassengerContext {
  passengerName?: string;
  bookingReference?: string;
  currentFlight?: string;
  origin?: string;
  destination?: string;
  disruptionStatus?: string;
  selectedFlight?: string | null;
  confirmationStatus?: string;
}

export interface PassengerInterpretation {
  intent: string;
  destination: string | null;
  constraints: { arrivalBefore: string | null };
  selectedFlight: string | null;
  requiresTool: SurgeAirToolName | null;
  requiresConfirmation: boolean;
  nextAction: string;
  provider: "local" | "amazon-bedrock";
}

export interface ModelProvider {
  readonly provider: "local" | "amazon-bedrock";
  interpretPassengerRequest(
    content: string,
    context?: PassengerContext,
  ): Promise<PassengerInterpretation>;
  generateResponse(context: {
    intent: string;
    selectedFlight?: string | null;
    arrival?: string | null;
  }): string;
}

export class LocalModelProvider implements ModelProvider {
  readonly provider = "local" as const;

  async interpretPassengerRequest(
    content: string,
  ): Promise<PassengerInterpretation> {
    const normalized = content.toLowerCase();
    const timeMatch = normalized.match(
      /(?:before|by)\s+([0-2]?\d)(?::([0-5]\d))?\s*(am|pm)?/,
    );
    let arrivalBefore: string | null = null;

    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minutes = timeMatch[2] ?? "00";
      const period = timeMatch[3];
      if (period === "pm" && hour < 12) hour += 12;
      if (period === "am" && hour === 12) hour = 0;
      arrivalBefore = `${String(hour).padStart(2, "0")}:${minutes}`;
    }

    const selectedFlight =
      content.toUpperCase().match(/\bSA\d{3}\b/)?.[0] ?? null;
    const intent = normalized.includes("confirm")
      ? "confirm_rebooking"
      : selectedFlight
        ? "select_alternative"
        : "find_alternative_flight";

    const requiresTool: SurgeAirToolName | null =
      intent === "find_alternative_flight"
        ? "searchAlternativeFlights"
        : intent === "confirm_rebooking"
          ? "rebookFlight"
          : null;

    return {
      intent,
      destination:
        normalized.includes("edinburgh") || /\bedi\b/i.test(content)
          ? "EDI"
          : null,
      constraints: { arrivalBefore },
      selectedFlight,
      requiresTool,
      requiresConfirmation: intent === "select_alternative",
      nextAction:
        intent === "select_alternative"
          ? "Ask the passenger for explicit confirmation."
          : intent === "confirm_rebooking"
            ? "Verify a pending rebooking before invoking the rebooking tool."
            : "Search for flights matching the passenger constraint.",
      provider: this.provider,
    };
  }

  generateResponse(context: {
    intent: string;
    selectedFlight?: string | null;
    arrival?: string | null;
  }) {
    if (context.intent === "select_alternative" && context.selectedFlight) {
      return `${context.selectedFlight} arrives in Edinburgh at ${context.arrival}. Would you like me to confirm this rebooking?`;
    }
    return "I can help find an alternative that matches your arrival time.";
  }
}