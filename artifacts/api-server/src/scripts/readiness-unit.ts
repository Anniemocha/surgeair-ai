import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAwsReadinessConfig } from "../config/aws";
import { LocalOperationalLogger } from "../observability/operational-logger";
import { JsonReadinessStateStore } from "../observability/readiness-state-store";

const names = [
  "AWS_REGION",
  "BEDROCK_MODEL_ID",
  "BEDROCK_VERIFIED",
  "AGENTCORE_VERIFIED",
  "AGENTCORE_RUNTIME_NAME",
  "SMS_VERIFIED",
  "SES_VERIFIED",
] as const;
const previous = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);

process.env.AWS_REGION = "eu-north-1";
process.env.BEDROCK_MODEL_ID = "eu.amazon.nova-2-lite-v1:0";
process.env.BEDROCK_VERIFIED = "true";
process.env.AGENTCORE_VERIFIED = "TRUE";
process.env.AGENTCORE_RUNTIME_NAME = "surgeair_ai_agent";
process.env.SMS_VERIFIED = "true";
process.env.SES_VERIFIED = "true";

const config = getAwsReadinessConfig();
assert.deepEqual(config.verified, {
  bedrock: true,
  agentCore: true,
  sms: true,
  ses: true,
});
assert.equal(config.agentCoreRuntimeName, "surgeair_ai_agent");

const directory = mkdtempSync(join(tmpdir(), "surgeair-readiness-"));
const readinessPath = join(directory, "readiness.json");
const store = new JsonReadinessStateStore(readinessPath, {
  bedrock: config.verified.bedrock,
  agentCore: config.verified.agentCore,
  sms: config.verified.sms,
  ses: config.verified.ses,
});
const readiness = new LocalOperationalLogger({
  bedrockVerified: config.verified.bedrock,
  bedrockModelId: config.bedrockModelId,
  region: config.region,
  smsVerified: config.verified.sms,
  sesVerified: config.verified.ses,
  agentCoreVerified: config.verified.agentCore,
  store,
});
assert.equal(readiness.getBedrockVerificationStatus(), "CONNECTED");
assert.equal(readiness.getSmsVerificationStatus(), "CONNECTED");
assert.equal(readiness.getSesVerificationStatus(), "CONNECTED");
assert.equal(readiness.getAgentCoreVerificationStatus(), "CONNECTED");
assert.deepEqual(readiness.getLatestModelExecution(), {
  provider: "amazon-bedrock",
  model: "Nova 2 Lite",
  region: "eu-north-1",
  status: "connected",
  latencyMs: null,
  fallbackReason: null,
});

readiness.record("sms_send_failed", { provider: "test" });
readiness.record("ses_send_failed", { provider: "test" });
readiness.record("model_request", {
  provider: "amazon-bedrock",
  status: "fallback",
});
assert.equal(readiness.getBedrockVerificationStatus(), "ERROR");
assert.equal(readiness.getSmsVerificationStatus(), "ERROR");
assert.equal(readiness.getSesVerificationStatus(), "ERROR");

const afterRestart = new LocalOperationalLogger({
  bedrockVerified: true,
  smsVerified: true,
  sesVerified: true,
  agentCoreVerified: true,
  store: new JsonReadinessStateStore(readinessPath, {
    bedrock: true,
    agentCore: true,
    sms: true,
    ses: true,
  }),
});
assert.equal(afterRestart.getBedrockVerificationStatus(), "ERROR");
assert.equal(afterRestart.getSmsVerificationStatus(), "ERROR");
assert.equal(afterRestart.getSesVerificationStatus(), "ERROR");
assert.equal(afterRestart.getAgentCoreVerificationStatus(), "CONNECTED");

for (const name of names) {
  const value = previous[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
rmSync(directory, { recursive: true, force: true });

process.stdout.write("Integration readiness unit checks passed.\n");