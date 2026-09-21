export interface PassengerInterpretation {
  intent: string;
  constraints: { arrivalBefore: string | null };
  requiresConfirmation: boolean;
}

export interface ModelProvider {
  interpretPassengerRequest(content: string): PassengerInterpretation;
  generateResponse(context: {
    intent: string;
    selectedFlight?: string | null;
    arrival?: string | null;
  }): string;
}

export class LocalModelProvider implements ModelProvider {
  interpretPassengerRequest(content: string) {
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

    return {
      intent: normalized.includes("confirm")
        ? "confirm_rebooking"
        : normalized.match(/sa\d{3}/)
          ? "select_alternative"
          : "find_alternative",
      constraints: { arrivalBefore },
      requiresConfirmation: !normalized.includes("confirm"),
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

export interface BedrockModelProvider extends ModelProvider {
  readonly provider: "amazon-bedrock";
}