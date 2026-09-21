import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  type SendTextMessageCommandOutput,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import type { OperationalLogger } from "../observability/operational-logger";

export interface AwsSmsDeliveryResult {
  provider: "aws-end-user-messaging-sms";
  messageId: string | null;
  destination: string;
  status: "accepted";
  timestamp: string;
  mode: "simulator";
}

export interface AwsSmsClient {
  send(command: SendTextMessageCommand): Promise<SendTextMessageCommandOutput>;
}

export interface AwsSmsProviderOptions {
  region: string;
  originationIdentity?: string;
  simulatorDestination?: string;
  logger: OperationalLogger;
  client?: AwsSmsClient;
}

export class AwsSmsSendError extends Error {
  readonly errorName: string;
  readonly errorCode: string | null;
  readonly httpStatus: number | null;

  constructor(error: unknown) {
    super("AWS End User Messaging SMS rejected the send request.");
    this.name = "AwsSmsSendError";
    const details = getAwsErrorDetails(error);
    this.errorName = details.errorName;
    this.errorCode = details.errorCode;
    this.httpStatus = details.httpStatus;
  }
}

export class AwsSmsProvider {
  readonly provider = "aws-end-user-messaging-sms" as const;

  private readonly region: string;
  private readonly originationIdentity?: string;
  private readonly simulatorDestination?: string;
  private readonly logger: OperationalLogger;
  private readonly client: AwsSmsClient;

  constructor(options: AwsSmsProviderOptions) {
    this.region = options.region;
    this.originationIdentity = options.originationIdentity?.trim() || undefined;
    this.simulatorDestination =
      options.simulatorDestination?.trim() || undefined;
    this.logger = options.logger;
    this.client =
      options.client ??
      new PinpointSMSVoiceV2Client({
        region: this.region,
        maxAttempts: 1,
      });
  }

  private async sendSimulatorMessage(
    destination: string,
    messageBody: string,
  ): Promise<AwsSmsDeliveryResult> {
    const normalizedDestination = destination.trim();
    const normalizedBody = messageBody.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedDestination)) {
      throw new Error("SMS destination must be a valid E.164 phone number.");
    }
    if (!normalizedBody || normalizedBody.length > 1_600) {
      throw new Error("SMS message must contain between 1 and 1600 characters.");
    }

    const mode = "simulator" as const;
    const startedAt = Date.now();
    this.logger.record("sms_send_started", {
      provider: this.provider,
      mode,
      destination: maskPhoneNumber(normalizedDestination),
      region: this.region,
    });

    try {
      const response = await this.client.send(
        new SendTextMessageCommand({
          DestinationPhoneNumber: normalizedDestination,
          MessageBody: normalizedBody,
          MessageType: "TRANSACTIONAL",
          ...(this.originationIdentity
            ? { OriginationIdentity: this.originationIdentity }
            : {}),
        }),
      );
      const timestamp = new Date().toISOString();
      this.logger.record("sms_send_succeeded", {
        provider: this.provider,
        mode,
        destination: maskPhoneNumber(normalizedDestination),
        messageId: response.MessageId ?? null,
        latencyMs: Date.now() - startedAt,
        region: this.region,
      });
      return {
        provider: this.provider,
        messageId: response.MessageId ?? null,
        destination: normalizedDestination,
        status: "accepted",
        timestamp,
        mode,
      };
    } catch (error) {
      const failure = new AwsSmsSendError(error);
      this.logger.record("sms_send_failed", {
        provider: this.provider,
        mode,
        destination: maskPhoneNumber(normalizedDestination),
        errorName: failure.errorName,
        errorCode: failure.errorCode,
        httpStatus: failure.httpStatus,
        latencyMs: Date.now() - startedAt,
        region: this.region,
      });
      throw failure;
    }
  }

  sendSimulator(
    destination: string,
    messageBody: string,
  ): Promise<AwsSmsDeliveryResult> {
    if (
      !this.simulatorDestination ||
      destination.trim() !== this.simulatorDestination
    ) {
      throw new Error(
        "SMS Simulator sends are restricted to an approved AWS simulator destination.",
      );
    }
    return this.sendSimulatorMessage(destination, messageBody);
  }
}

function maskPhoneNumber(value: string) {
  return value.length > 4 ? `***${value.slice(-4)}` : "****";
}

function getAwsErrorDetails(error: unknown): {
  errorName: string;
  errorCode: string | null;
  httpStatus: number | null;
} {
  if (!error || typeof error !== "object") {
    return { errorName: "UnknownError", errorCode: null, httpStatus: null };
  }
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return {
    errorName:
      typeof candidate.name === "string" ? candidate.name : "UnknownError",
    errorCode: typeof candidate.code === "string" ? candidate.code : null,
    httpStatus:
      typeof candidate.$metadata?.httpStatusCode === "number"
        ? candidate.$metadata.httpStatusCode
        : null,
  };
}