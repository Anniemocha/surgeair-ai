import assert from "node:assert/strict";
import type { InvokeAgentRuntimeCommandOutput } from "@aws-sdk/client-bedrock-agentcore";
import { AgentCoreModelProvider, type AgentCoreClient, type TurnExecution } from "../models/agentcore-model-provider";
import { LocalModelProvider, type ModelProvider } from "../models/model-provider";
import { SessionInvocations } from "../observability/session-invocations";

// All cloud clients in this script are injected fakes. No AWS requests are sent.
process.env.MODEL_PROVIDER = "local";
process.env.SMS_PROVIDER = "aws";
process.env.EMAIL_PROVIDER = "simulated";
const { createSurgeAirStore } = await import("../surgeair/domain");
const local = new LocalModelProvider();
let fallbackCalls = 0;
const direct: ModelProvider = {
  provider: "amazon-bedrock",
  async interpretPassengerRequest(text, context) {
    fallbackCalls++;
    return { ...await local.interpretPassengerRequest(text, context), provider: "amazon-bedrock" };
  },
  generateResponse: context => local.generateResponse(context),
};
let runtimeCalls = 0;
let capabilityCalls = 0;
const runtime: AgentCoreClient = {
  async send(command) {
    const body = JSON.parse(Buffer.from(command.input.payload as Uint8Array).toString());
    if (body.mode === "capabilities") {
      capabilityCalls++;
      assert.equal(body.message, undefined);
      return { contentType: "application/json", statusCode: 200, $metadata: {},
        response: { transformToString: async () => JSON.stringify({ mode: "capabilities", protocolVersion: 1, interpretationOnly: true }) },
      } as unknown as InvokeAgentRuntimeCommandOutput;
    }
    runtimeCalls++;
    assert.equal(body.mode, "interpret");
    assert.equal(body.context.bookingReference, "SG4821");
    const interpretation = { ...await local.interpretPassengerRequest(body.message, body.context), provider: "amazon-bedrock" };
    return { contentType: "application/json", statusCode: 200, $metadata: {},
      response: { transformToString: async () => JSON.stringify({ mode: "interpret", interpretation }) },
    } as unknown as InvokeAgentRuntimeCommandOutput;
  },
};
let smsCalls = 0;
const smsBodies: string[] = [];
const store = createSurgeAirStore({
  runtimeArn: "arn:aws:bedrock-agentcore:eu-north-1:000000000000:runtime/unit-test",
  model: direct, agentCoreClient: runtime, smsSimulatorDestination: "+12065550100",
  smsClient: { async send(command) {
    smsBodies.push(command.input.MessageBody!);
    return { MessageId: `unit-sms-${++smsCalls}`, $metadata: {} };
  } },
});
assert(store.getDashboard().integrationStatus.every(item => item.status !== "CONNECTED" && item.status !== "INVOKED"));
const [notification, duplicate] = await Promise.all([store.sendDemoSms("notification"), store.sendDemoSms("notification")]);
assert.equal(smsCalls, 1);
assert.deepEqual(notification, duplicate);
assert.equal(notification.messageId, "unit-sms-1");
const smsBadge = store.getDashboard().integrationStatus.find(item => item.service === "AWS End User Messaging SMS")!;
assert.equal(smsBadge.status, "INVOKED");
assert(smsBadge.invokedAt);

await store.interpretMessage("I need to arrive before 18:00", "SG4821");
store.searchAlternatives("LIS", "EDI", "18:00");
await store.interpretMessage("Book me on SA218", "SG4821", ["SA218", "SA226"]);
store.prepareRebooking("SG4821", "SA218");
store.getBooking("SG4821");
assert.equal(store.getDashboard().orchestration.currentAgentState, "Awaiting confirmation");
await store.interpretMessage("Yes, confirm", "SG4821", ["SA218", "SA226"]);
const booked = store.rebook("SG4821", "SA218", true);
assert("booking" in booked);
store.getBooking("SG4821");
assert.equal(store.getDashboard().orchestration.currentAgentState, "Rebooking completed");
assert.equal(store.getDashboard().orchestration.currentIntent, "confirm rebooking");
await store.sendDemoSms("confirmation");
await store.sendDemoSms("confirmation");
assert.equal(smsCalls, 2);
assert.match(smsBodies[1]!, /SA218.*11:30.*14:40.*SG4821/);
await store.interpretMessage("Thanks", "SG4821");
assert.equal(runtimeCalls, 4);
assert.equal(capabilityCalls, 1);
assert.equal(fallbackCalls, 0);
const history = store.getDashboard().orchestration.turnHistory;
assert.equal(history.length, 4);
assert(history.every(turn => turn.path === "AgentCore runtime" && turn.runtimeSessionId === history[0]!.runtimeSessionId));
assert.equal(store.getDashboard().integrationStatus.find(item => item.service === "Bedrock AgentCore")!.status, "INVOKED");
assert(store.getDashboard().activities.some(activity => activity.detail.includes("SMS sent via AWS End User Messaging, ID: unit-sms-2")));
const priorSession = store.getDashboard().orchestration.runtimeSessionId;
store.resetDemo();
assert.notEqual(store.getDashboard().orchestration.runtimeSessionId, priorSession);
assert.deepEqual(store.getDashboard().smsDeliveries, []);
assert.equal(store.getDashboard().orchestration.turnHistory.length, 0);
assert(store.getDashboard().integrationStatus.every(item => item.status !== "INVOKED"));

const failures = createSurgeAirStore({
  smsSimulatorDestination: "+12065550100",
  smsClient: { async send() { throw new Error("test failure"); } },
});
assert.equal((await failures.sendDemoSms("notification")).status, "failed");
assert.equal(failures.getDashboard().booking.currentFlight.flightNumber, "SA204");
assert(failures.getDashboard().activities.some(activity => activity.label === "SMS simulator call failed"));

const turns: TurnExecution[] = [];
const evidence = new SessionInvocations();
const base = { region: "eu-north-1", runtimeArn: "test-arn", sessionId: () => "unit-session-000000000000000000000000",
  fallback: direct, logger: { record: (type: Parameters<SessionInvocations["record"]>[0], metadata: Record<string, unknown>) => evidence.record(type, metadata) },
  onTurn: (turn: TurnExecution) => turns.push(turn),
};
const denied = new AgentCoreModelProvider({ ...base, client: { async send() { throw Object.assign(new Error("Denied"), { name: "AccessDeniedException" }); } } });
await denied.interpretPassengerRequest("arrive before 18:00");
assert.equal(turns.at(-1)!.path, "Direct Bedrock fallback");
assert.equal(turns.at(-1)!.fallbackReason, "AccessDeniedException");
assert.equal(turns.at(-1)!.fallbackError, "AccessDeniedException: Denied");
const fallbackStore = createSurgeAirStore({
  runtimeArn: "test-arn",
  model: direct,
  agentCoreClient: { async send() { throw Object.assign(new Error("Received error (400) from runtime."), { name: "RuntimeClientError" }); } },
});
await fallbackStore.interpretMessage("Arrive before 18:00", "SG4821");
assert.equal(fallbackStore.getDashboard().integrationStatus.find(item => item.service === "Bedrock AgentCore")!.status, "Configured, fallback active");
assert.equal(fallbackStore.getDashboard().orchestration.turnHistory[0].fallbackError, "RuntimeClientError: Received error (400) from runtime.");
assert(!fallbackStore.getDashboard().activities.some(item => item.detail?.includes("RuntimeClientError")));
fallbackStore.resetDemo();
assert.equal(fallbackStore.getDashboard().integrationStatus.find(item => item.service === "Bedrock AgentCore")!.status, "CONFIGURED");
const localFallbackStore = createSurgeAirStore({
  runtimeArn: "test-arn",
  model: { ...direct, interpretPassengerRequest: (text, context) => local.interpretPassengerRequest(text, context) },
  agentCoreClient: { async send() { throw new Error("Runtime unavailable"); } },
});
await localFallbackStore.interpretMessage("Arrive before 18:00", "SG4821");
assert.equal(localFallbackStore.getDashboard().integrationStatus.find(item => item.service === "Bedrock AgentCore")!.status, "ERROR");
const timeout = new AgentCoreModelProvider({ ...base, timeoutMs: 5, client: { send: () => new Promise(() => {}) } });
await timeout.interpretPassengerRequest("arrive before 18:00");
assert.equal(turns.at(-1)!.path, "Direct Bedrock fallback");
const legacy = new AgentCoreModelProvider({ ...base, client: { async send() {
  return { contentType: "application/json", $metadata: {}, response: { transformToString: async () => '{"action":{"type":"rebooked"}}' } } as unknown as InvokeAgentRuntimeCommandOutput;
} } });
await legacy.interpretPassengerRequest("arrive before 18:00");
assert.equal(turns.at(-1)!.fallbackReason, "RuntimeProtocolError");
assert.equal(fallbackCalls, 4);
console.log("Session-scoped AWS evidence, SMS idempotency/failure, per-turn AgentCore, and timeout/fallback checks passed.");
