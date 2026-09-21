import { logger } from "../lib/logger";
import type {
  IntegrationReadinessKey,
  ReadinessEvidenceSource,
  ReadinessStateStore,
} from "./readiness-state-store";

export type OperationalLogType =
  | "incoming_message"
  | "outgoing_message"
  | "tool_call"
  | "agent_decision"
  | "channel_transition"
  | "model_request"
  | "bedrock_invocation_failed"
  | "agentcore_invocation_succeeded"
  | "agentcore_invocation_failed"
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

export interface InitialReadinessState {
  bedrockVerified?: boolean;
  bedrockModelId?: string | null;
  region?: string | null;
  smsVerified?: boolean;
  sesVerified?: boolean;
  agentCoreVerified?: boolean;
  store?: ReadinessStateStore;
}

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
  private agentCoreVerificationStatus: BedrockVerificationStatus =
    "NOT VERIFIED";

  private pendingBedrockFallback = false;
  private readonly readinessStore?: ReadinessStateStore;

  constructor(initialState: InitialReadinessState = {}) {
    this.readinessStore = initialState.store;
    this.bedrockVerificationStatus = this.initialStatus(
      "bedrock",
      initialState.bedrockVerified,
    );
    this.agentCoreVerificationStatus = this.initialStatus(
      "agentCore",
      initialState.agentCoreVerified,
    );
    this.smsVerificationStatus = this.initialStatus(
      "sms",
      initialState.smsVerified,
    );
    this.sesVerificationStatus = this.initialStatus(
      "ses",
      initialState.sesVerified,
    );
    if (this.bedrockVerificationStatus === "CONNECTED") {
      this.bedrockVerificationStatus = "CONNECTED";
      this.latestModelExecution = {
        provider: "amazon-bedrock",
        model: modelDisplayName(initialState.bedrockModelId),
        region: initialState.region ?? null,
        status: "connected",
        latencyMs: null,
        fallbackReason: null,
      };
    }
  }

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

  getAgentCoreVerificationStatus(): BedrockVerificationStatus {
    return this.agentCoreVerificationStatus;
  }

  private captureModelExecution(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ) {
    if (type === "agentcore_invocation_succeeded") {
      this.setStatus("agentCore", "CONNECTED", "runtime-success");
      return;
    }
    if (type === "agentcore_invocation_failed") {
      this.setStatus("agentCore", "ERROR", "runtime-failure");
      return;
    }
    if (type === "sms_send_succeeded") {
      this.setStatus("sms", "CONNECTED", "runtime-success");
      return;
    }
    if (type === "sms_send_failed") {
      this.setStatus("sms", "ERROR", "runtime-failure");
      return;
    }
    if (type === "ses_send_succeeded") {
      this.setStatus("ses", "CONNECTED", "runtime-success");
      return;
    }
    if (type === "ses_send_failed") {
      this.setStatus("ses", "ERROR", "runtime-failure");
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
        this.setStatus("bedrock", "CONNECTED", "runtime-success");
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
        this.setStatus("bedrock", "ERROR", "runtime-failure");
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

  private initialStatus(
    key: IntegrationReadinessKey,
    verified: boolean | undefined,
  ): BedrockVerificationStatus {
    return this.readinessStore?.get(key) ?? (verified ? "CONNECTED" : "NOT VERIFIED");
  }

  private setStatus(
    key: IntegrationReadinessKey,
    status: BedrockVerificationStatus,
    source: ReadinessEvidenceSource,
  ) {
    if (key === "bedrock") this.bedrockVerificationStatus = status;
    if (key === "sms") this.smsVerificationStatus = status;
    if (key === "ses") this.sesVerificationStatus = status;
    if (key === "agentCore") this.agentCoreVerificationStatus = status;
    this.readinessStore?.set(key, status, source);
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