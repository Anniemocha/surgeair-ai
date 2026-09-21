import assert from "node:assert/strict";
import {
  AwsSmsProvider,
  AwsSmsSendError,
  type AwsSmsClient,
} from "../channels/aws-sms-provider";
import {
  SmsChannel,
  type NormalizedMessage,
} from "../channels/channel-adapters";
import type {
  OperationalLogger,
  OperationalLogType,
} from "../observability/operational-logger";
import { LocalOperationalLogger } from "../observability/operational-logger";
import {
  isAuthorizedSmsTestRequest,
  SmsTestRateLimiter,
} from "../channels/sms-test-guard";

class CapturingLogger implements OperationalLogger {
  readonly events: Array<{
    type: OperationalLogType;
    details: Record<string, string | number | boolean | null>;
  }> = [];

  record(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ) {
    this.events.push({ type, details });
  }
}

const destination = "+15550100001";
const originator = "+15550100002";
const message = "SurgeAir: Flight SA204 has been delayed by 3 hours.";

const successLogger = new CapturingLogger();
let sentInput: unknown = null;
const successClient: AwsSmsClient = {
  async send(command) {
    sentInput = command.input;
    return {
      MessageId: "sms-message-123",
      $metadata: {},
    };
  },
};
const successProvider = new AwsSmsProvider({
  region: "eu-north-1",
  originationIdentity: originator,
  simulatorDestination: destination,
  logger: successLogger,
  client: successClient,
});
const delivery = await successProvider.sendSimulator(destination, message);
assert.equal(delivery.provider, "aws-end-user-messaging-sms");
assert.equal(delivery.mode, "simulator");
assert.equal(delivery.messageId, "sms-message-123");
assert.equal(delivery.destination, destination);
assert.equal(delivery.status, "accepted");
assert.deepEqual(sentInput, {
  DestinationPhoneNumber: destination,
  MessageBody: message,
  MessageType: "TRANSACTIONAL",
  OriginationIdentity: originator,
});
assert.deepEqual(
  successLogger.events.map((event) => event.type),
  ["sms_send_started", "sms_send_succeeded"],
);
const serializedSuccessLogs = JSON.stringify(successLogger.events);
assert.equal(serializedSuccessLogs.includes(destination), false);
assert.equal(serializedSuccessLogs.includes(message), false);
assert.equal(serializedSuccessLogs.includes("***0001"), true);
assert.throws(
  () => successProvider.sendSimulator("+15550100003", message),
  /restricted to an approved AWS simulator destination/,
);
let invalidConfigurationSendCount = 0;
const invalidConfigurationLogger = new LocalOperationalLogger();
const invalidConfigurationProvider = new AwsSmsProvider({
  region: "eu-north-1",
  simulatorDestination: "+15550100003",
  logger: invalidConfigurationLogger,
  client: {
    async send() {
      invalidConfigurationSendCount += 1;
      return { MessageId: "must-not-send", $metadata: {} };
    },
  },
});
assert.throws(
  () => invalidConfigurationProvider.sendSimulator(destination, message),
  /restricted to an approved AWS simulator destination/,
);
assert.equal(invalidConfigurationSendCount, 0);
assert.equal(
  invalidConfigurationLogger.getSmsVerificationStatus(),
  "NOT VERIFIED",
);

const failureLogger = new CapturingLogger();
const deniedError = Object.assign(new Error("sensitive provider message"), {
  name: "AccessDeniedException",
  code: "AccessDeniedException",
  $metadata: { httpStatusCode: 403 },
});
const failureClient: AwsSmsClient = {
  async send() {
    throw deniedError;
  },
};
const failureProvider = new AwsSmsProvider({
  region: "eu-north-1",
  simulatorDestination: destination,
  logger: failureLogger,
  client: failureClient,
});
await assert.rejects(
  () => failureProvider.sendSimulator(destination, message),
  (error: unknown) => {
    assert.equal(error instanceof AwsSmsSendError, true);
    if (error instanceof AwsSmsSendError) {
      assert.equal(error.errorName, "AccessDeniedException");
      assert.equal(error.errorCode, "AccessDeniedException");
      assert.equal(error.httpStatus, 403);
    }
    return true;
  },
);
const failedEvent = failureLogger.events.at(-1);
assert.equal(failedEvent?.type, "sms_send_failed");
assert.equal(failedEvent?.details.errorName, "AccessDeniedException");
assert.equal(failedEvent?.details.httpStatus, 403);
const serializedFailureLogs = JSON.stringify(failureLogger.events);
assert.equal(serializedFailureLogs.includes("sensitive provider message"), false);
assert.equal(serializedFailureLogs.includes(destination), false);

const simulatedLogger = new CapturingLogger();
const simulatedChannel = new SmsChannel(simulatedLogger);
const normalizedMessage: NormalizedMessage = {
  messageId: "local-message-1",
  conversationId: "conversation-1",
  passengerId: "passenger-1",
  bookingReference: "SG4821",
  channel: "sms",
  direction: "outbound",
  content: message,
  timestamp: new Date().toISOString(),
};
assert.deepEqual(
  await simulatedChannel.sendMessage(normalizedMessage),
  normalizedMessage,
);
assert.equal(simulatedLogger.events.at(-1)?.type, "outgoing_message");
assert.equal(
  simulatedLogger.events.some((event) => event.type.startsWith("sms_send_")),
  false,
);

let awsChannelSendCount = 0;
const awsChannel = new SmsChannel(new CapturingLogger(), {
  provider: "aws",
  region: "eu-north-1",
  originationIdentity: originator,
  simulatorDestination: destination,
  client: {
    async send() {
      awsChannelSendCount += 1;
      return { MessageId: "channel-message-1", $metadata: {} };
    },
  },
});
const awsNormalized = await awsChannel.sendMessage(normalizedMessage);
assert.equal(awsChannelSendCount, 1);
assert.equal(awsNormalized.messageId, "channel-message-1");
await assert.rejects(
  () =>
    new SmsChannel(new CapturingLogger(), {
      provider: "aws",
      region: "eu-north-1",
      client: successClient,
    }).sendSimulatorTest(message),
  /AWS_SMS_SIMULATOR_DESTINATION is required/,
);

assert.equal(isAuthorizedSmsTestRequest("secret", "secret"), true);
assert.equal(isAuthorizedSmsTestRequest("wrong", "secret"), false);
assert.equal(isAuthorizedSmsTestRequest(undefined, "secret"), false);
const limiter = new SmsTestRateLimiter(30_000);
assert.equal(limiter.tryAcquire(100_000), true);
assert.equal(limiter.tryAcquire(100_001), false);
assert.equal(limiter.tryAcquire(130_000), true);

const readinessLogger = new LocalOperationalLogger();
assert.equal(readinessLogger.getSmsVerificationStatus(), "NOT VERIFIED");
readinessLogger.record("sms_send_failed", {
  provider: "aws-end-user-messaging-sms",
});
assert.equal(readinessLogger.getSmsVerificationStatus(), "ERROR");
readinessLogger.record("sms_send_succeeded", {
  provider: "aws-end-user-messaging-sms",
});
assert.equal(readinessLogger.getSmsVerificationStatus(), "CONNECTED");

process.stdout.write("AWS SMS provider unit checks passed.\n");