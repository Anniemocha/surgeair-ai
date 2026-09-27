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
  presentedAlternatives?: string[];
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
    context: PassengerContext = {},
  ): Promise<PassengerInterpretation> {
    const normalized = content.toLowerCase();
    const arrivalBefore = extractClearArrivalBefore(normalized);

    const explicitFlight = content.toUpperCase().match(/\bSA\d{3}\b/)?.[0] ?? null;
    const selectedOption = /\b(?:first|option\s*(?:1|one)|number\s*1)\b/i.test(content);
    const selectedFlight =
      explicitFlight ??
      (selectedOption ? context.presentedAlternatives?.[0] ?? null : null);
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

export function extractClearArrivalBefore(text: string): string | null {
  const numberWords: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const match = text.match(
    /\b(?:before|by|no later than|later than|arrive(?:s|ing)? by)\s+(?:(\d{1,2})(?::([0-5]\d))?|(\bone|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve\b))(?:\s*(a\.?m\.?|p\.?m\.?)|\s+in the (morning|afternoon|evening))?\b/i,
  );
  if (!match) return null;
  let hour = Number(match[1] ?? numberWords[match[3]?.toLowerCase() ?? ""]);
  const minute = match[2] ?? "00";
  const period = match[4]?.replaceAll(".", "").toLowerCase()
    ?? (match[5]?.toLowerCase() === "morning" ? "am" : match[5] ? "pm" : undefined);
  if (hour < 0 || hour > 23 || (period && (hour < 1 || hour > 12))) return null;
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  // Bare hours 1–12 have no deterministic AM/PM interpretation.
  if (!period && hour >= 1 && hour <= 12) return null;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}