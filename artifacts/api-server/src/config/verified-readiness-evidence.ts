import type { ReadinessSeed } from "../observability/readiness-state-store";

/**
 * Backend-owned evidence from live operations completed before publishing the
 * hackathon deployment. Loading this seed performs no AWS operation and does
 * not imply that a new operation occurred during deployment startup.
 */
export const verifiedReadinessEvidence: ReadinessSeed = {
  bedrock: {
    status: "CONNECTED",
    source: "previous-live-runtime-verification",
  },
  agentCore: {
    status: "CONNECTED",
    source: "previous-live-runtime-verification",
  },
  sms: {
    status: "CONNECTED",
    source: "previous-live-runtime-verification",
  },
  ses: {
    status: "CONNECTED",
    source: "previous-live-runtime-verification",
  },
};

export const verifiedIntegrationProfile = {
  bedrockModelId: "eu.amazon.nova-2-lite-v1:0",
  region: "eu-north-1",
  agentCoreRuntimeName: "surgeair_ai_agent",
} as const;