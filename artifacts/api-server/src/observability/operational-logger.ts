import { logger } from "../lib/logger";

export type OperationalLogType =
  | "incoming_message"
  | "outgoing_message"
  | "tool_call"
  | "agent_decision"
  | "channel_transition"
  | "model_request"
  | "bedrock_invocation_failed"
  | "sms_send_started"
  | "sms_send_succeeded"
  | "sms_send_failed"
  | "ses_send_started"
  | "ses_send_succeeded"
  | "ses_send_failed"
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
export type SmsVerificationStatus = "CONNECTED" | "NOT VERIFIED" | "ERROR";
export type SesVerificationStatus = "CONNECTED" | "NOT VERIFIED" | "ERROR";

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
  private smsVerificationStatus: SmsVerificationStatus = "NOT VERIFIED";
  private sesVerificationStatus: SesVerificationStatus = "NOT VERIFIED";

  private pendingBedrockFallback = false;

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

  getSmsVerificationStatus(): SmsVerificationStatus {
    return this.smsVerificationStatus;
  }

  getSesVerificationStatus(): SesVerificationStatus {
    return this.sesVerificationStatus;
  }

  private captureModelExecution(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ) {
    if (type === "sms_send_succeeded") {
      this.smsVerificationStatus = "CONNECTED";
      return;
    }
    if (type === "sms_send_failed") {
      this.smsVerificationStatus = "ERROR";
      return;
    }
    if (type === "ses_send_succeeded") {
      this.sesVerificationStatus = "CONNECTED";
      return;
    }
    if (type === "ses_send_failed") {
      this.sesVerificationStatus = "ERROR";
      return;
    }

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
        this.pendingBedrockFallback = false;
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
        this.pendingBedrockFallback = true;
      }
      return;
    }

    if (type === "agent_decision" && details.provider === "local") {
      if (this.pendingBedrockFallback) {
        this.pendingBedrockFallback = false;
        return;
      }
      this.latestModelExecution = {
        provider: "local",
        model: "Local Model",
        region: null,
        status: "local",
        latencyMs: null,
        fallbackReason: null,
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