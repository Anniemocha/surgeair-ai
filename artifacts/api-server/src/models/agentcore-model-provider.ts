import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand, type InvokeAgentRuntimeCommandOutput } from "@aws-sdk/client-bedrock-agentcore";
import type { ModelProvider, PassengerContext, PassengerInterpretation } from "./model-provider";
import type { OperationalLogger } from "../observability/operational-logger";

export interface TurnExecution {
  path: "AgentCore runtime" | "Direct Bedrock fallback";
  runtimeSessionId: string;
  timestamp: string;
  fallbackReason?: string;
  modelProvider?: string;
}
export interface AgentCoreClient {
  send(command: InvokeAgentRuntimeCommand, options?: { abortSignal?: AbortSignal }): Promise<InvokeAgentRuntimeCommandOutput>;
}

/** Runtime supplies interpretation only. Booking authorization stays in the API. */
export class AgentCoreModelProvider implements ModelProvider {
  readonly provider = "amazon-bedrock" as const;
  private client: AgentCoreClient;

  constructor(private options: {
    region: string;
    runtimeArn?: string;
    sessionId: () => string;
    fallback: ModelProvider;
    logger: OperationalLogger;
    onTurn: (turn: TurnExecution) => void;
    client?: AgentCoreClient;
    timeoutMs?: number;
  }) {
    this.client = options.client ?? new BedrockAgentCoreClient({ region: options.region, maxAttempts: 1 });
  }

  async interpretPassengerRequest(content: string, context?: PassengerContext): Promise<PassengerInterpretation> {
    const runtimeSessionId = this.options.sessionId();
    try {
      if (!this.options.runtimeArn) throw Object.assign(new Error("Runtime ARN not configured"), { name: "RuntimeNotConfigured" });
      const command = new InvokeAgentRuntimeCommand({
        agentRuntimeArn: this.options.runtimeArn,
        qualifier: "DEFAULT",
        runtimeSessionId,
        contentType: "application/json",
        accept: "application/json",
        payload: Buffer.from(JSON.stringify({ mode: "interpret", message: content, context })),
      });
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error("AgentCore invocation timed out"), { name: "AgentCoreTimeout" }));
        }, this.options.timeoutMs ?? 12_000);
      });
      let payload;
      try {
        payload = await Promise.race([(async () => {
          const response = await this.client.send(command, { abortSignal: controller.signal });
          if (response.statusCode && response.statusCode >= 400) throw Object.assign(new Error("Runtime rejected invocation"), { name: "AgentCoreRuntimeError" });
          return JSON.parse(await response.response!.transformToString());
        })(), deadline]);
      } finally { clearTimeout(timer); }
      this.options.logger.record("agentcore_invocation_succeeded", {
        runtimeSessionId, bedrockInvoked: payload.mode === "interpret" && payload.interpretation?.provider === "amazon-bedrock",
      });
      // Reject older, stateful runtimes rather than trusting their booking actions.
      if (payload.mode !== "interpret" || !isInterpretation(payload.interpretation)) {
        throw Object.assign(new Error("Runtime requires interpretation-only protocol"), { name: "RuntimeProtocolError" });
      }
      const interpretation: PassengerInterpretation = payload.interpretation;
      if (interpretation.provider !== "amazon-bedrock") throw Object.assign(new Error("Runtime used local model"), { name: "RuntimeModelUnavailable" });
      this.options.onTurn({ path: "AgentCore runtime", runtimeSessionId, timestamp: new Date().toISOString(), modelProvider: interpretation.provider });
      return interpretation;
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.name : "AgentCoreError";
      this.options.logger.record("agentcore_invocation_failed", { runtimeSessionId, errorName: fallbackReason, attempted: !!this.options.runtimeArn });
      const interpretation = await this.options.fallback.interpretPassengerRequest(content, context);
      this.options.onTurn({ path: "Direct Bedrock fallback", runtimeSessionId, timestamp: new Date().toISOString(), fallbackReason, modelProvider: interpretation.provider });
      return interpretation;
    }
  }

  generateResponse(context: Parameters<ModelProvider["generateResponse"]>[0]) {
    return this.options.fallback.generateResponse(context);
  }
}

function isInterpretation(value: unknown): value is PassengerInterpretation {
  if (!value || typeof value !== "object") return false;
  const v = value as PassengerInterpretation;
  return typeof v.intent === "string" && typeof v.nextAction === "string"
    && typeof v.requiresConfirmation === "boolean"
    && (v.destination === null || typeof v.destination === "string")
    && (v.selectedFlight === null || typeof v.selectedFlight === "string")
    && !!v.constraints && (v.constraints.arrivalBefore === null || typeof v.constraints.arrivalBefore === "string")
    && (v.requiresTool === null || ["getBooking", "getFlightStatus", "searchAlternativeFlights", "rebookFlight", "sendItinerary"].includes(v.requiresTool))
    && ["local", "amazon-bedrock"].includes(v.provider);
}
