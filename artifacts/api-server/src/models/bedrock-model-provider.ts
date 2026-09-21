import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { OperationalLogger } from "../observability/operational-logger";
import {
  LocalModelProvider,
  type ModelProvider,
  type PassengerContext,
  type PassengerInterpretation,
  type SurgeAirToolName,
} from "./model-provider";

const TOOL_NAMES = new Set<SurgeAirToolName>([
  "getBooking",
  "getFlightStatus",
  "searchAlternativeFlights",
  "rebookFlight",
  "sendItinerary",
]);

const SYSTEM_INSTRUCTIONS = `You are the language-understanding and decision-extraction layer for SurgeAir AI.
Interpret airline passenger messages and recommend the next safe operational action.
Available backend tools are getBooking, getFlightStatus, searchAlternativeFlights, rebookFlight, and sendItinerary.
You never execute tools and never modify booking state.
Selecting a flight is not authorization to rebook. A selection requires a later explicit confirmation.
When context already says the current flight is delayed and the passenger provides an arrival deadline, use:
- intent: "find_alternative_flight"
- requires_tool: "searchAlternativeFlights"
- requires_confirmation: false
Do not request getFlightStatus when the disruption status is already present in context.
For Edinburgh, normalize destination to "EDI". Normalize "6 PM" to "18:00".
Return only one JSON object with exactly these fields:
{
  "intent": string,
  "destination": string | null,
  "arrival_before": "HH:mm" | null,
  "selected_flight": string | null,
  "requires_tool": string | null,
  "requires_confirmation": boolean,
  "next_action": string
}
Do not include markdown, analysis, hidden reasoning, or any other text.`;

interface BedrockDecisionPayload {
  intent: string;
  destination: string | null;
  arrival_before: string | null;
  selected_flight: string | null;
  requires_tool: SurgeAirToolName | null;
  requires_confirmation: boolean;
  next_action: string;
}

export interface BedrockModelProviderOptions {
  region: string;
  modelId: string;
  bearerToken: string;
  logger: OperationalLogger;
  fallback?: ModelProvider;
  timeoutMs?: number;
}

export class BedrockModelProvider implements ModelProvider {
  readonly provider = "amazon-bedrock" as const;
  readonly region: string;
  readonly modelId: string;

  private readonly client: BedrockRuntimeClient;
  private readonly logger: OperationalLogger;
  private readonly fallback: ModelProvider;
  private readonly timeoutMs: number;

  constructor(options: BedrockModelProviderOptions) {
    this.region = options.region;
    this.modelId = options.modelId;
    this.logger = options.logger;
    this.fallback = options.fallback ?? new LocalModelProvider();
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.client = new BedrockRuntimeClient({
      region: options.region,
      token: { token: options.bearerToken },
      maxAttempts: 2,
    });
  }

  async interpretPassengerRequest(
    content: string,
    context: PassengerContext = {},
  ): Promise<PassengerInterpretation> {
    const startedAt = Date.now();
    this.logger.record("model_request", {
      provider: this.provider,
      modelId: this.modelId,
      region: this.region,
      status: "started",
    });

    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: SYSTEM_INSTRUCTIONS }],
          messages: [
            {
              role: "user",
              content: [
                {
                  text: JSON.stringify({
                    passenger_message: content,
                    context,
                  }),
                },
              ],
            },
          ],
          inferenceConfig: {
            maxTokens: 500,
            temperature: 0,
          },
        }),
        { abortSignal: AbortSignal.timeout(this.timeoutMs) },
      );

      const text = (response.output?.message?.content ?? [])
        .map((block) =>
          "text" in block && typeof block.text === "string" ? block.text : "",
        )
        .join("")
        .trim();
      const decision = validateDecision(parseJsonObject(text));
      const interpretation = toInterpretation(decision);

      this.logger.record("model_request", {
        provider: this.provider,
        modelId: this.modelId,
        region: this.region,
        status: "succeeded",
        latencyMs: Date.now() - startedAt,
        intent: interpretation.intent,
        tool: interpretation.requiresTool,
        confirmationRequired: interpretation.requiresConfirmation,
      });
      return interpretation;
    } catch (error) {
      const category = classifyBedrockFailure(error);
      this.logger.record("model_request", {
        provider: this.provider,
        modelId: this.modelId,
        region: this.region,
        status: "fallback",
        latencyMs: Date.now() - startedAt,
        errorCategory: category,
      });
      return this.fallback.interpretPassengerRequest(content, context);
    }
  }

  generateResponse(context: {
    intent: string;
    selectedFlight?: string | null;
    arrival?: string | null;
  }) {
    return this.fallback.generateResponse(context);
  }
}

function parseJsonObject(text: string): unknown {
  const withoutFence = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Malformed Bedrock decision.");
  }
  return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
}

function validateDecision(value: unknown): BedrockDecisionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed Bedrock decision.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.intent !== "string" ||
    candidate.intent.length === 0 ||
    candidate.intent.length > 80 ||
    (candidate.destination !== null &&
      typeof candidate.destination !== "string") ||
    (candidate.arrival_before !== null &&
      (typeof candidate.arrival_before !== "string" ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate.arrival_before))) ||
    (candidate.selected_flight !== null &&
      (typeof candidate.selected_flight !== "string" ||
        !/^SA\d{3}$/i.test(candidate.selected_flight))) ||
    (candidate.requires_tool !== null &&
      (typeof candidate.requires_tool !== "string" ||
        !TOOL_NAMES.has(candidate.requires_tool as SurgeAirToolName))) ||
    typeof candidate.requires_confirmation !== "boolean" ||
    typeof candidate.next_action !== "string" ||
    candidate.next_action.length === 0 ||
    candidate.next_action.length > 300
  ) {
    throw new Error("Malformed Bedrock decision.");
  }

  return {
    intent: candidate.intent,
    destination:
      typeof candidate.destination === "string"
        ? candidate.destination.toUpperCase()
        : null,
    arrival_before:
      typeof candidate.arrival_before === "string"
        ? candidate.arrival_before
        : null,
    selected_flight:
      typeof candidate.selected_flight === "string"
        ? candidate.selected_flight.toUpperCase()
        : null,
    requires_tool:
      typeof candidate.requires_tool === "string"
        ? (candidate.requires_tool as SurgeAirToolName)
        : null,
    requires_confirmation: candidate.requires_confirmation,
    next_action: candidate.next_action,
  };
}

function toInterpretation(
  decision: BedrockDecisionPayload,
): PassengerInterpretation {
  const isSelection = decision.selected_flight !== null;
  return {
    intent: decision.intent,
    destination: decision.destination,
    constraints: { arrivalBefore: decision.arrival_before },
    selectedFlight: decision.selected_flight,
    requiresTool:
      isSelection && decision.requires_tool === "rebookFlight"
        ? null
        : decision.requires_tool,
    requiresConfirmation: isSelection
      ? true
      : decision.requires_confirmation,
    nextAction: decision.next_action,
    provider: "amazon-bedrock",
  };
}

function classifyBedrockFailure(error: unknown) {
  if (error instanceof SyntaxError) return "malformed_response";
  if (!(error instanceof Error)) return "unknown";
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return "timeout";
  }
  if (
    error.name === "AccessDeniedException" ||
    error.name === "UnrecognizedClientException"
  ) {
    return "access_denied";
  }
  if (
    error.name === "ThrottlingException" ||
    error.name === "TooManyRequestsException"
  ) {
    return "throttled";
  }
  if (error.message === "Malformed Bedrock decision.") {
    return "malformed_response";
  }
  if (error.name === "CredentialsProviderError") {
    return "authentication";
  }
  return "network_or_service_error";
}