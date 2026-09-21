import type { OperationalLogger } from "../observability/operational-logger";
import { BedrockModelProvider } from "../models/bedrock-model-provider";

const region = process.env.AWS_REGION;
const modelId = process.env.BEDROCK_MODEL_ID;
const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
if (!region || !modelId || !bearerToken) {
  throw new Error("Bedrock connectivity test configuration is incomplete.");
}

const logger: OperationalLogger = {
  record(type, details) {
    const safeDetails = Object.fromEntries(
      Object.entries(details).filter(
        ([key]) => !/token|authorization|credential|secret/i.test(key),
      ),
    );
    process.stdout.write(
      `${JSON.stringify({ operationalEvent: type, ...safeDetails })}\n`,
    );
  },
};

const provider = new BedrockModelProvider({
  region,
  modelId,
  bearerToken,
  logger,
});

const result = await provider.interpretPassengerRequest(
  "My flight has been delayed. I need to arrive in Edinburgh before 6 PM.",
  {
    passengerName: "Draymond Hillsend",
    bookingReference: "SG4821",
    currentFlight: "SA204",
    origin: "LIS",
    destination: "EDI",
    disruptionStatus: "Delayed by 3 hours",
    selectedFlight: null,
    confirmationStatus: "Not requested",
  },
);

const summary = {
  provider: result.provider,
  modelId,
  region,
  intent: result.intent,
  destination: result.destination,
  arrivalBefore: result.constraints.arrivalBefore,
  requiresTool: result.requiresTool,
  requiresConfirmation: result.requiresConfirmation,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (
  result.provider !== "amazon-bedrock" ||
  result.intent !== "find_alternative_flight" ||
  result.destination !== "EDI" ||
  result.constraints.arrivalBefore !== "18:00" ||
  result.requiresTool !== "searchAlternativeFlights" ||
  result.requiresConfirmation
) {
  throw new Error("Bedrock returned an unexpected operational decision.");
}