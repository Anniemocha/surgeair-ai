import assert from "node:assert/strict";
import {
  AwsSesEmailProvider,
  AwsSesSendError,
  type AwsSesClient,
} from "../channels/aws-ses-provider";
import {
  EmailChannel,
  type NormalizedMessage,
} from "../channels/channel-adapters";
import { getAwsReadinessConfig } from "../config/aws";
import type {
  OperationalLogger,
  OperationalLogType,
} from "../observability/operational-logger";
import { LocalOperationalLogger } from "../observability/operational-logger";

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

const fromEmail = "verified-sender@example.com";
const destination = "verified-recipient@example.com";
const subject = "SurgeAir SES Integration Test";
const body =
  "SurgeAir AI successfully connected to Amazon SES. Booking SG4821 email delivery is ready.";

const successLogger = new CapturingLogger();
let sentInput: unknown = null;
const successClient: AwsSesClient = {
  async send(command) {
    sentInput = command.input;
    return {
      MessageId: "ses-message-123",
      $metadata: { requestId: "request-123" },
    };
  },
};
const successProvider = new AwsSesEmailProvider({
  region: "eu-north-1",
  fromEmail,
  logger: successLogger,
  client: successClient,
});
const delivery = await successProvider.send(
  destination,
  subject,
  body,
  "<p>SurgeAir email is ready.</p>",
);
assert.deepEqual(delivery, {
  success: true,
  provider: "amazon-ses",
  mode: "live",
  messageId: "ses-message-123",
  destination,
  status: "accepted",
  latencyMs: delivery.latencyMs,
});
assert.deepEqual(sentInput, {
  FromEmailAddress: fromEmail,
  Destination: {
    ToAddresses: [destination],
  },
  Content: {
    Simple: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Text: {
          Data: body,
          Charset: "UTF-8",
        },
        Html: {
          Data: "<p>SurgeAir email is ready.</p>",
          Charset: "UTF-8",
        },
      },
    },
  },
});
assert.deepEqual(
  successLogger.events.map((event) => event.type),
  ["ses_send_started", "ses_send_succeeded"],
);
const successLogs = JSON.stringify(successLogger.events);
assert.equal(successLogs.includes(destination), false);
assert.equal(successLogs.includes(fromEmail), false);
assert.equal(successLogs.includes(subject), false);
assert.equal(successLogs.includes(body), false);
assert.equal(successLogs.includes("v***@example.com"), true);

const failureLogger = new CapturingLogger();
const failureClient: AwsSesClient = {
  async send() {
    throw Object.assign(new Error("sensitive AWS provider message"), {
      name: "AccessDeniedException",
      code: "AccessDeniedException",
      $metadata: { httpStatusCode: 403, requestId: "request-denied" },
    });
  },
};
const failureProvider = new AwsSesEmailProvider({
  region: "eu-north-1",
  fromEmail,
  logger: failureLogger,
  client: failureClient,
});
await assert.rejects(
  () => failureProvider.send(destination, subject, body),
  (error: unknown) => {
    assert.equal(error instanceof AwsSesSendError, true);
    if (error instanceof AwsSesSendError) {
      assert.equal(error.errorName, "AccessDeniedException");
      assert.equal(error.errorCode, "AccessDeniedException");
      assert.equal(error.httpStatus, 403);
      assert.equal(error.requestId, "request-denied");
    }
    return true;
  },
);
const failureLogs = JSON.stringify(failureLogger.events);
assert.equal(failureLogs.includes("sensitive AWS provider message"), false);
assert.equal(failureLogs.includes(destination), false);

let channelSendCount = 0;
let channelDestination: unknown = null;
const awsChannel = new EmailChannel(new CapturingLogger(), {
  provider: "aws",
  region: "eu-north-1",
  fromEmail,
  testDestination: destination,
  client: {
    async send(command) {
      channelSendCount += 1;
      channelDestination = command.input.Destination?.ToAddresses?.[0];
      return { MessageId: "channel-email-1", $metadata: {} };
    },
  },
});
const channelDelivery = await awsChannel.sendTest(subject, body);
assert.equal(channelSendCount, 1);
assert.equal(channelDestination, destination);
assert.equal(channelDelivery.provider, "amazon-ses");
assert.equal(channelDelivery.messageId, "channel-email-1");

assert.throws(
  () =>
    new EmailChannel(new CapturingLogger(), {
      provider: "aws",
      region: "eu-north-1",
      fromEmail,
      client: successClient,
    }).sendTest(subject, body),
  /AWS_SES_TEST_DESTINATION is required/,
);

const simulatedChannel = new EmailChannel(new CapturingLogger());
const simulatedDelivery = await simulatedChannel.sendItinerary(subject, body);
assert.equal(simulatedDelivery.provider, "simulated");
assert.equal(simulatedDelivery.mode, "simulated");

const normalizedMessage: NormalizedMessage = {
  messageId: "local-email-1",
  conversationId: "conversation-1",
  passengerId: "passenger-1",
  bookingReference: "SG4821",
  channel: "email",
  direction: "outbound",
  content: body,
  timestamp: new Date().toISOString(),
};
assert.deepEqual(
  await simulatedChannel.sendMessage(normalizedMessage),
  normalizedMessage,
);

const previousEmailProvider = process.env.EMAIL_PROVIDER;
const previousFromEmail = process.env.AWS_SES_FROM_EMAIL;
const previousTestDestination = process.env.AWS_SES_TEST_DESTINATION;
process.env.EMAIL_PROVIDER = " AWS ";
process.env.AWS_SES_FROM_EMAIL = ` ${fromEmail} `;
process.env.AWS_SES_TEST_DESTINATION = ` ${destination} `;
const selectedConfig = getAwsReadinessConfig();
assert.equal(selectedConfig.channels.email.provider, "aws");
assert.equal(selectedConfig.channels.email.fromEmail, fromEmail);
assert.equal(selectedConfig.channels.email.testDestination, destination);
restoreEnvironment("EMAIL_PROVIDER", previousEmailProvider);
restoreEnvironment("AWS_SES_FROM_EMAIL", previousFromEmail);
restoreEnvironment("AWS_SES_TEST_DESTINATION", previousTestDestination);

const readinessLogger = new LocalOperationalLogger();
assert.equal(readinessLogger.getSesVerificationStatus(), "NOT VERIFIED");
readinessLogger.record("ses_send_failed", {
  provider: "amazon-ses",
});
assert.equal(readinessLogger.getSesVerificationStatus(), "ERROR");
readinessLogger.record("ses_send_succeeded", {
  provider: "amazon-ses",
});
assert.equal(readinessLogger.getSesVerificationStatus(), "CONNECTED");

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

process.stdout.write("Amazon SES provider unit checks passed.\n");