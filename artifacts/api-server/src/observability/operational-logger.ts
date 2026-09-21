import { logger } from "../lib/logger";

export type OperationalLogType =
  | "incoming_message"
  | "outgoing_message"
  | "tool_call"
  | "agent_decision"
  | "channel_transition"
  | "model_request"
  | "rebooking_attempt"
  | "rebooking_success"
  | "rebooking_failure"
  | "error";

export type ModelExecutionStatus =
  | "local"
  | "connected"
  | "fallback"
  | "error";

export interface ModelExecutionMetadata {
  provider: "local" | "amazon-bedrock";
  model: string;
  region: string | null;
  status: ModelExecutionStatus;
  latencyMs: number | null;
  fallbackReason: string | null;
}

export type BedrockVerificationStatus = "CONNECTED" | "NOT VERIFIED" | "ERROR";

export interface OperationalLogger {
  record(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ): void;
}

export class LocalOperationalLogger implements OperationalLogger {
  private latestModelExecution: ModelExecutionMetadata = {
    provider: "local",
    model: "Local Model",
    region: null,
    status: "local",
    latencyMs: null,
    fallbackReason: null,
  };

  private bedrockVerificationStatus: BedrockVerificationStatus =
    "NOT VERIFIED";

  record(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ) {
    this.captureModelExecution(type, details);
    logger.info({ operationalEvent: type, ...details }, "SurgeAir operation");
  }

  getLatestModelExecution(): ModelExecutionMetadata {
    return { ...this.latestModelExecution };
  }

  getBedrockVerificationStatus(): BedrockVerificationStatus {
    return this.bedrockVerificationStatus;
  }

  private captureModelExecution(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ) {
    if (type === "model_request") {
      const provider = details.provider;
      const status = details.status;
      if (provider !== "amazon-bedrock" || status === "started") return;

      if (status === "succeeded") {
        this.latestModelExecution = {
          provider: "amazon-bedrock",
          model: modelDisplayName(details.modelId),
          region: stringValue(details.region),
          status: "connected",
          latencyMs: numberValue(details.latencyMs),
          fallbackReason: null,
        };
        this.bedrockVerificationStatus = "CONNECTED";
      } else if (status === "fallback") {
        this.latestModelExecution = {
          provider: "local",
          model: "Local Model",
          region: null,
          status: "fallback",
          latencyMs: numberValue(details.latencyMs),
          fallbackReason: "Bedrock unavailable",
        };
        this.bedrockVerificationStatus = "ERROR";
      }
      return;
    }

    if (type === "agent_decision" && details.provider === "local") {
      const fallbackReason = stringValue(details.fallbackReason);
      this.latestModelExecution = {
        provider: "local",
        model: "Local Model",
        region: null,
        status: fallbackReason ? "fallback" : "local",
        latencyMs: fallbackReason
          ? this.latestModelExecution.latencyMs
          : null,
        fallbackReason,
      };
    }
  }
}

function stringValue(value: string | number | boolean | null | undefined) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: string | number | boolean | null | undefined) {
  return typeof value === "number" ? value : null;
}

function modelDisplayName(value: string | number | boolean | null | undefined) {
  if (typeof value !== "string") return "Unknown Model";
  return value.includes("nova-2-lite") ? "Nova 2 Lite" : value;
}