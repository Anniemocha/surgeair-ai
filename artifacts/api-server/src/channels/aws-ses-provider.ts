import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import type { OperationalLogger } from "../observability/operational-logger";

export interface AwsSesDeliveryResult {
  success: true;
  provider: "amazon-ses";
  mode: "live";
  messageId: string;
  destination: string;
  status: "accepted";
  latencyMs: number;
}

export interface AwsSesClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

export interface AwsSesEmailProviderOptions {
  region: string;
  fromEmail?: string;
  logger: OperationalLogger;
  client?: AwsSesClient;
}

export class AwsSesSendError extends Error {
  readonly errorName: string;
  readonly errorCode: string | null;
  readonly httpStatus: number | null;
  readonly requestId: string | null;

  constructor(error: unknown) {
    super("Amazon SES rejected the email send request.");
    this.name = "AwsSesSendError";
    const details = getAwsErrorDetails(error);
    this.errorName = details.errorName;
    this.errorCode = details.errorCode;
    this.httpStatus = details.httpStatus;
    this.requestId = details.requestId;
  }
}

export class AwsSesEmailProvider {
  readonly provider = "amazon-ses" as const;
  readonly mode = "live" as const;

  private readonly region: string;
  private readonly fromEmail?: string;
  private readonly logger: OperationalLogger;
  private readonly client: AwsSesClient;

  constructor(options: AwsSesEmailProviderOptions) {
    this.region = options.region;
    this.fromEmail = options.fromEmail?.trim() || undefined;
    this.logger = options.logger;
    this.client =
      options.client ??
      new SESv2Client({
        region: this.region,
        maxAttempts: 1,
      });
  }

  async send(
    recipient: string,
    subject: string,
    textBody: string,
    htmlBody?: string,
  ): Promise<AwsSesDeliveryResult> {
    const destination = normalizeEmail(recipient, "recipient");
    const fromEmail = normalizeEmail(this.fromEmail, "sender");
    const normalizedSubject = subject.trim();
    const normalizedText = textBody.trim();
    const normalizedHtml = htmlBody?.trim() || undefined;
    if (!normalizedSubject || normalizedSubject.length > 998) {
      throw new Error("Email subject must contain between 1 and 998 characters.");
    }
    if (!normalizedText) {
      throw new Error("Email text body is required.");
    }

    const startedAt = Date.now();
    this.logger.record("ses_send_started", {
      provider: this.provider,
      mode: this.mode,
      destination: maskEmailAddress(destination),
      region: this.region,
    });

    try {
      const response = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: fromEmail,
          Destination: {
            ToAddresses: [destination],
          },
          Content: {
            Simple: {
              Subject: {
                Data: normalizedSubject,
                Charset: "UTF-8",
              },
              Body: {
                Text: {
                  Data: normalizedText,
                  Charset: "UTF-8",
                },
                ...(normalizedHtml
                  ? {
                      Html: {
                        Data: normalizedHtml,
                        Charset: "UTF-8",
                      },
                    }
                  : {}),
              },
            },
          },
        }),
      );
      if (!response.MessageId) {
        throw Object.assign(new Error("Amazon SES did not return a message ID."), {
          name: "MissingMessageId",
          $metadata: response.$metadata,
        });
      }
      const latencyMs = Date.now() - startedAt;
      this.logger.record("ses_send_succeeded", {
        provider: this.provider,
        mode: this.mode,
        destination: maskEmailAddress(destination),
        messageId: response.MessageId,
        latencyMs,
        region: this.region,
      });
      return {
        success: true,
        provider: this.provider,
        mode: this.mode,
        messageId: response.MessageId,
        destination,
        status: "accepted",
        latencyMs,
      };
    } catch (error) {
      const failure = new AwsSesSendError(error);
      this.logger.record("ses_send_failed", {
        provider: this.provider,
        mode: this.mode,
        destination: maskEmailAddress(destination),
        errorName: failure.errorName,
        errorCode: failure.errorCode,
        httpStatus: failure.httpStatus,
        requestId: failure.requestId,
        latencyMs: Date.now() - startedAt,
        region: this.region,
      });
      throw failure;
    }
  }
}

export function maskEmailAddress(value: string) {
  const [local = "", domain = ""] = value.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible || "*"}***@${domain}`;
}

function normalizeEmail(value: string | undefined, label: string) {
  const normalized = value?.trim() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`A valid email ${label} is required.`);
  }
  return normalized;
}

function getAwsErrorDetails(error: unknown): {
  errorName: string;
  errorCode: string | null;
  httpStatus: number | null;
  requestId: string | null;
} {
  if (!error || typeof error !== "object") {
    return {
      errorName: "UnknownError",
      errorCode: null,
      httpStatus: null,
      requestId: null,
    };
  }
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    $metadata?: { httpStatusCode?: unknown; requestId?: unknown };
  };
  return {
    errorName:
      typeof candidate.name === "string" ? candidate.name : "UnknownError",
    errorCode: typeof candidate.code === "string" ? candidate.code : null,
    httpStatus:
      typeof candidate.$metadata?.httpStatusCode === "number"
        ? candidate.$metadata.httpStatusCode
        : null,
    requestId:
      typeof candidate.$metadata?.requestId === "string"
        ? candidate.$metadata.requestId
        : null,
  };
}