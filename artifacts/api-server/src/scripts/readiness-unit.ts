import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getAwsReadinessConfig,
  integrationReadiness,
} from "../config/aws";
import {
  verifiedIntegrationProfile,
  verifiedReadinessEvidence,
} from "../config/verified-readiness-evidence";
import { LocalOperationalLogger } from "../observability/operational-logger";
import { JsonReadinessStateStore } from "../observability/readiness-state-store";

const names = [
  "AWS_REGION",
  "BEDROCK_MODEL_ID",
  "BEDROCK_VERIFIED",
  "AGENTCORE_VERIFIED",
  "AGENTCORE_RUNTIME_NAME",
  "SMS_PROVIDER",
  "SMS_VERIFIED",
  "EMAIL_PROVIDER",
  "SES_VERIFIED",
  "AWS_WHATSAPP_ENABLED",
  "AWS_RCS_ENABLED",
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
process.env.SMS_PROVIDER = "simulated";
process.env.EMAIL_PROVIDER = "simulated";
process.env.AWS_WHATSAPP_ENABLED = "false";
process.env.AWS_RCS_ENABLED = "false";

const config = getAwsReadinessConfig();
assert.deepEqual(config.verified, {
  bedrock: true,
  agentCore: true,
  sms: true,
  ses: true,
});
assert.equal(config.agentCoreRuntimeName, "surgeair_ai_agent");
assert.equal(config.channels.sms.provider, "simulated");
assert.equal(config.channels.email.provider, "simulated");
assert.equal(config.channels.whatsapp, false);
assert.equal(config.channels.rcs, false);
assert.deepEqual(
  integrationReadiness
    .filter(({ service }) => service === "WhatsApp" || service === "RCS")
    .map(({ status }) => status),
  ["SIMULATED", "SIMULATED"],
);

const directory = mkdtempSync(join(tmpdir(), "surgeair-readiness-"));
const readinessPath = join(directory, "readiness.json");
const store = new JsonReadinessStateStore(
  readinessPath,
  verifiedReadinessEvidence,
);
assert.equal(
  existsSync(readinessPath),
  false,
  "bootstrap must not fabricate a runtime operation or write a state file",
);
const readiness = new LocalOperationalLogger({
  bedrockVerified: false,
  bedrockModelId: verifiedIntegrationProfile.bedrockModelId,
  region: verifiedIntegrationProfile.region,
  smsVerified: false,
  sesVerified: false,
  agentCoreVerified: false,
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
readiness.record("agentcore_invocation_failed", { provider: "test" });
readiness.record("model_request", {
  provider: "amazon-bedrock",
  status: "fallback",
});
assert.equal(readiness.getBedrockVerificationStatus(), "ERROR");
assert.equal(readiness.getSmsVerificationStatus(), "ERROR");
assert.equal(readiness.getSesVerificationStatus(), "ERROR");
assert.equal(readiness.getAgentCoreVerificationStatus(), "ERROR");

const afterRestart = new LocalOperationalLogger({
  store: new JsonReadinessStateStore(
    readinessPath,
    verifiedReadinessEvidence,
  ),
});
assert.equal(afterRestart.getBedrockVerificationStatus(), "ERROR");
assert.equal(afterRestart.getSmsVerificationStatus(), "ERROR");
assert.equal(afterRestart.getSesVerificationStatus(), "ERROR");
assert.equal(afterRestart.getAgentCoreVerificationStatus(), "ERROR");

afterRestart.record("agentcore_invocation_succeeded", { provider: "test" });
afterRestart.record("sms_send_succeeded", { provider: "test" });
afterRestart.record("ses_send_succeeded", { provider: "test" });
afterRestart.record("model_request", {
  provider: "amazon-bedrock",
  modelId: verifiedIntegrationProfile.bedrockModelId,
  region: verifiedIntegrationProfile.region,
  status: "succeeded",
  latencyMs: 1,
});
assert.equal(afterRestart.getBedrockVerificationStatus(), "CONNECTED");
assert.equal(afterRestart.getAgentCoreVerificationStatus(), "CONNECTED");
assert.equal(afterRestart.getSmsVerificationStatus(), "CONNECTED");
assert.equal(afterRestart.getSesVerificationStatus(), "CONNECTED");

const blockedParent = join(directory, "not-a-directory");
writeFileSync(blockedParent, "blocks runtime persistence");
const memoryOnlyReadiness = new LocalOperationalLogger({
  store: new JsonReadinessStateStore(
    join(blockedParent, "readiness.json"),
    verifiedReadinessEvidence,
  ),
});
assert.equal(memoryOnlyReadiness.getBedrockVerificationStatus(), "CONNECTED");
assert.equal(
  memoryOnlyReadiness.getAgentCoreVerificationStatus(),
  "CONNECTED",
);
assert.equal(memoryOnlyReadiness.getSmsVerificationStatus(), "CONNECTED");
assert.equal(memoryOnlyReadiness.getSesVerificationStatus(), "CONNECTED");
memoryOnlyReadiness.record("ses_send_failed", { provider: "test" });
assert.equal(memoryOnlyReadiness.getSesVerificationStatus(), "ERROR");

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