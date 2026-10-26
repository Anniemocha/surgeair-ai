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
  private protocolSessionId?: string;
  private protocolCheck?: Promise<void>;

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
      await this.ensureInterpretationProtocol(runtimeSessionId);
      const payload = await this.invoke({ mode: "interpret", message: content, context }, runtimeSessionId);
      if (payload.mode !== "interpret" || !isInterpretation(payload.interpretation)) {
        throw Object.assign(new Error("Runtime requires interpretation-only protocol"), { name: "RuntimeProtocolError" });
      }
      const interpretation: PassengerInterpretation = payload.interpretation;
      this.options.logger.record("agentcore_invocation_succeeded", {
        runtimeSessionId, bedrockInvoked: interpretation.provider === "amazon-bedrock",
      });
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

  private async ensureInterpretationProtocol(runtimeSessionId: string) {
    if (this.protocolSessionId === runtimeSessionId && this.protocolCheck) return this.protocolCheck;
    this.protocolSessionId = runtimeSessionId;
    // No message in this probe: legacy runtimes cannot execute booking actions.
    const check = this.invoke({ mode: "capabilities" }, runtimeSessionId).then(payload => {
      if (payload.mode !== "capabilities" || payload.protocolVersion !== 1 || payload.interpretationOnly !== true) {
        throw Object.assign(new Error("Interpretation-only runtime update required"), { name: "RuntimeProtocolError" });
      }
      this.options.logger.record("agentcore_invocation_succeeded", { runtimeSessionId, bedrockInvoked: false, stage: "capabilities" });
    });
    this.protocolCheck = check;
    try { await check; } catch (error) {
      if (this.protocolCheck === check) this.protocolCheck = undefined;
      throw error;
    }
  }

  private async invoke(payload: Record<string, unknown>, runtimeSessionId: string) {
    const command = new InvokeAgentRuntimeCommand({
      agentRuntimeArn: this.options.runtimeArn!,
      qualifier: "DEFAULT",
      runtimeSessionId,
      contentType: "application/json",
      accept: "application/json",
      payload: Buffer.from(JSON.stringify(payload)),
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error("AgentCore invocation timed out"), { name: "AgentCoreTimeout" }));
      }, this.options.timeoutMs ?? 12_000);
    });
    try {
      return await Promise.race([(async () => {
        const response = await this.client.send(command, { abortSignal: controller.signal });
        if (response.statusCode && response.statusCode >= 400) {
          throw Object.assign(new Error("Runtime rejected invocation"), { name: payload.mode === "capabilities" ? "RuntimeProtocolError" : "AgentCoreRuntimeError" });
        }
        return JSON.parse(await response.response!.transformToString());
      })(), deadline]);
    } finally { clearTimeout(timer); }
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
