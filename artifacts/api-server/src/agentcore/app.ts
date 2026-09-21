import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getModelProviderConfiguration } from "../models/model-provider-factory";
import { surgeAirStore } from "../surgeair/domain";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = "0.0.0.0";
const BOOKING_REFERENCE = "SG4821";
const ORIGIN = "LIS";
const DESTINATION = "EDI";
const MAX_BODY_BYTES = 1_048_576;

const modelConfiguration = getModelProviderConfiguration({
  requestedProvider: process.env.MODEL_PROVIDER,
  region: process.env.AWS_REGION,
  modelId: process.env.BEDROCK_MODEL_ID,
  bearerToken: undefined,
});
process.stdout.write(
  `${JSON.stringify({
    event: "agentcore_model_configuration",
    requestedProvider: modelConfiguration.requestedProvider,
    selectedProvider: modelConfiguration.selectedProvider,
    region: modelConfiguration.region,
    modelIdConfigured: modelConfiguration.modelIdConfigured,
    bearerTokenPresent: modelConfiguration.bearerTokenPresent,
    credentialMode: modelConfiguration.credentialMode,
  })}\n`,
);

interface InvocationPayload {
  input?: unknown;
  message?: unknown;
  prompt?: unknown;
  text?: unknown;
  inputText?: unknown;
}

interface AgentCoreResponse {
  agent: "SurgeAir AI";
  message: string;
  interpretation: {
    intent: string;
    destination: string | null;
    arrivalBefore: string | null;
    selectedFlight: string | null;
    requiresTool: string | null;
    requiresConfirmation: boolean;
    nextAction: string;
    provider: "local" | "amazon-bedrock";
  };
  action:
    | {
        type: "alternatives_found";
        flights: string[];
      }
    | {
        type: "rebooking_confirmation_required";
        selectedFlight: string;
        message: string;
      }
    | {
        type: "rebooked";
        flight: string;
        message: string;
      }
    | {
        type: "rebooking_blocked";
        message: string;
      }
    | {
        type: "none";
      };
  booking: {
    bookingReference: string;
    currentFlight: string;
    status: string;
  };
}

class InvocationError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function handleInvocation(
  payload: unknown,
): Promise<AgentCoreResponse> {
  const message = extractPassengerMessage(payload);
  if (!message) {
    throw new InvocationError(
      400,
      "Invocation must include a passenger message.",
    );
  }

  const interpretation = await surgeAirStore.recordPassengerMessage(
    "SMS",
    message,
  );
  let action: AgentCoreResponse["action"] = { type: "none" };
  const explicitConfirmation =
    /^\s*(?:yes[,\s]+)?confirm(?:\s+(?:the\s+)?rebooking)?[.!]?\s*$/i.test(
      message,
    );

  if (explicitConfirmation) {
    const selectedFlight = surgeAirStore.getDashboard().selectedAlternative;
    if (!selectedFlight) {
      action = {
        type: "rebooking_blocked",
        message: "A pending rebooking selection is required before confirmation.",
      };
    } else {
      const result = surgeAirStore.rebook(
        BOOKING_REFERENCE,
        selectedFlight,
        true,
      );
      if ("error" in result) {
        action = {
          type: "rebooking_blocked",
          message: result.error ?? "Unable to complete the rebooking.",
        };
      } else {
        action = {
          type: "rebooked",
          flight: selectedFlight,
          message: result.message,
        };
      }
    }
  } else if (
    interpretation.requiresTool === "searchAlternativeFlights" &&
    interpretation.intent === "find_alternative_flight"
  ) {
    const alternatives = surgeAirStore.searchAlternatives(
      ORIGIN,
      DESTINATION,
      interpretation.constraints.arrivalBefore ?? undefined,
    );
    action = {
      type: "alternatives_found",
      flights: alternatives.map((flight) => flight.flightNumber),
    };
  } else if (
    interpretation.selectedFlight &&
    interpretation.requiresConfirmation
  ) {
    const pending = surgeAirStore.prepareRebooking(
      BOOKING_REFERENCE,
      interpretation.selectedFlight,
    );
    if ("error" in pending) {
      action = {
        type: "rebooking_blocked",
        message: pending.error ?? "Unable to prepare the rebooking.",
      };
    } else {
      action = {
        type: "rebooking_confirmation_required",
        selectedFlight: pending.selectedFlight,
        message: pending.message,
      };
    }
  }

  const booking = surgeAirStore.getBooking(BOOKING_REFERENCE);
  if (!booking) {
    throw new Error("Canonical SurgeAir booking is unavailable.");
  }

  return {
    agent: "SurgeAir AI",
    message,
    interpretation: {
      intent: interpretation.intent,
      destination: interpretation.destination,
      arrivalBefore: interpretation.constraints.arrivalBefore,
      selectedFlight: interpretation.selectedFlight,
      requiresTool: interpretation.requiresTool,
      requiresConfirmation: interpretation.requiresConfirmation,
      nextAction: interpretation.nextAction,
      provider: interpretation.provider,
    },
    action,
    booking: {
      bookingReference: booking.bookingReference,
      currentFlight: booking.currentFlight.flightNumber,
      status: booking.status,
    },
  };
}

function extractPassengerMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const candidate = payload as InvocationPayload;
  for (const value of [
    candidate.message,
    candidate.prompt,
    candidate.text,
    candidate.inputText,
  ]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  if (typeof candidate.input === "string" && candidate.input.trim()) {
    return candidate.input.trim();
  }
  if (candidate.input && typeof candidate.input === "object") {
    return extractPassengerMessage(candidate.input);
  }
  return null;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  const encoded = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(encoded),
  });
  response.end(encoded);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new InvocationError(413, "Invocation payload is too large.");
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new InvocationError(400, "Invocation payload must be valid JSON.");
  }
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const path = new URL(request.url ?? "/", `http://${HOST}`).pathname;

  if (method === "GET" && path === "/ping") {
    sendJson(response, 200, { status: "Healthy", agent: "SurgeAir AI" });
    return;
  }

  if (method === "POST" && path === "/invocations") {
    try {
      const result = await handleInvocation(await readJsonBody(request));
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = error instanceof InvocationError ? error.statusCode : 500;
      const message =
        error instanceof InvocationError
          ? error.message
          : "Invocation could not be processed.";
      sendJson(response, statusCode, { error: message });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found." });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `SurgeAir AgentCore runtime listening on ${HOST}:${PORT}\n`,
  );
});