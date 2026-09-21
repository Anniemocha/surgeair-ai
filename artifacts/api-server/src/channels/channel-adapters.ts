import type { Channel } from "../surgeair/domain";
import type { OperationalLogger } from "../observability/operational-logger";
import {
  AwsSmsProvider,
  type AwsSmsClient,
  type AwsSmsDeliveryResult,
} from "./aws-sms-provider";
import {
  AwsSesEmailProvider,
  type AwsSesClient,
  type AwsSesDeliveryResult,
} from "./aws-ses-provider";

export interface NormalizedMessage {
  messageId: string;
  conversationId: string;
  passengerId: string;
  bookingReference: string;
  channel: Lowercase<Channel>;
  direction: "inbound" | "outbound";
  content: string;
  timestamp: string;
}

export interface ChannelAdapter {
  readonly channel: Channel;
  sendMessage(message: NormalizedMessage): Promise<NormalizedMessage>;
  receiveMessage(message: NormalizedMessage): Promise<NormalizedMessage>;
}

abstract class SimulatedChannelAdapter implements ChannelAdapter {
  abstract readonly channel: Channel;

  constructor(private readonly logger: OperationalLogger) {}

  async sendMessage(message: NormalizedMessage) {
    this.logger.record("outgoing_message", {
      conversationId: message.conversationId,
      channel: message.channel,
      messageId: message.messageId,
    });
    return message;
  }

  async receiveMessage(message: NormalizedMessage) {
    this.logger.record("incoming_message", {
      conversationId: message.conversationId,
      channel: message.channel,
      messageId: message.messageId,
    });
    return message;
  }
}

export interface SmsChannelOptions {
  provider: "aws" | "simulated";
  region: string;
  originationIdentity?: string;
  simulatorDestination?: string;
  client?: AwsSmsClient;
}

export class SmsChannel implements ChannelAdapter {
  readonly channel = "SMS" as const;

  private readonly simulated: SimulatedSmsChannel;
  private readonly awsProvider: AwsSmsProvider | null;
  private readonly simulatorDestination?: string;

  constructor(
    private readonly logger: OperationalLogger,
    private readonly options: SmsChannelOptions = {
      provider: "simulated",
      region: "eu-west-1",
    },
  ) {
    this.simulated = new SimulatedSmsChannel(logger);
    this.simulatorDestination =
      options.simulatorDestination?.trim() || undefined;
    this.awsProvider =
      options.provider === "aws"
        ? new AwsSmsProvider({
            region: options.region,
            originationIdentity: options.originationIdentity,
            simulatorDestination: this.simulatorDestination,
            logger,
            client: options.client,
          })
        : null;
  }

  async sendMessage(message: NormalizedMessage) {
    if (!this.awsProvider) {
      return this.simulated.sendMessage(message);
    }
    if (!this.simulatorDestination) {
      throw new Error(
        "AWS_SMS_SIMULATOR_DESTINATION is required for AWS SMS delivery.",
      );
    }
    const delivery = await this.awsProvider.sendSimulator(
      this.simulatorDestination,
      message.content,
    );
    this.logger.record("outgoing_message", {
      conversationId: message.conversationId,
      channel: message.channel,
      messageId: delivery.messageId ?? message.messageId,
    });
    return {
      ...message,
      messageId: delivery.messageId ?? message.messageId,
      timestamp: delivery.timestamp,
    };
  }

  receiveMessage(message: NormalizedMessage) {
    return this.simulated.receiveMessage(message);
  }

  isAwsSelected() {
    return this.awsProvider !== null;
  }

  async sendSimulatorTest(messageBody: string): Promise<AwsSmsDeliveryResult> {
    if (!this.awsProvider) {
      throw new Error("AWS SMS provider is not selected.");
    }
    if (!this.simulatorDestination) {
      throw new Error(
        "AWS_SMS_SIMULATOR_DESTINATION is required for the SMS test.",
      );
    }
    return this.awsProvider.sendSimulator(
      this.simulatorDestination,
      messageBody,
    );
  }
}

class SimulatedSmsChannel extends SimulatedChannelAdapter {
  readonly channel = "SMS" as const;
}

export class WhatsAppChannel extends SimulatedChannelAdapter {
  readonly channel = "WhatsApp" as const;
}

export class RcsChannel extends SimulatedChannelAdapter {
  readonly channel = "RCS" as const;
}

export interface EmailChannelOptions {
  provider: "aws" | "simulated";
  region: string;
  fromEmail?: string;
  testDestination?: string;
  client?: AwsSesClient;
}

export interface SimulatedEmailDeliveryResult {
  success: true;
  provider: "simulated";
  mode: "simulated";
  messageId: null;
  destination: string;
  status: "accepted";
  latencyMs: number;
}

export class EmailChannel implements ChannelAdapter {
  readonly channel = "Email" as const;

  private readonly simulated: SimulatedEmailChannel;
  private readonly awsProvider: AwsSesEmailProvider | null;
  private readonly testDestination?: string;

  constructor(
    private readonly logger: OperationalLogger,
    options: EmailChannelOptions = {
      provider: "simulated",
      region: "eu-west-1",
    },
  ) {
    this.simulated = new SimulatedEmailChannel(logger);
    this.testDestination = options.testDestination?.trim() || undefined;
    this.awsProvider =
      options.provider === "aws"
        ? new AwsSesEmailProvider({
            region: options.region,
            fromEmail: options.fromEmail,
            logger,
            client: options.client,
          })
        : null;
  }

  async sendMessage(message: NormalizedMessage) {
    if (!this.awsProvider) {
      return this.simulated.sendMessage(message);
    }
    const delivery = await this.sendConfiguredEmail(
      `SurgeAir notification for ${message.bookingReference}`,
      message.content,
    );
    this.logger.record("outgoing_message", {
      conversationId: message.conversationId,
      channel: message.channel,
      messageId: delivery.messageId,
    });
    return {
      ...message,
      messageId: delivery.messageId,
      timestamp: new Date().toISOString(),
    };
  }

  receiveMessage(message: NormalizedMessage) {
    return this.simulated.receiveMessage(message);
  }

  async sendItinerary(
    subject: string,
    textBody: string,
    htmlBody?: string,
  ): Promise<AwsSesDeliveryResult | SimulatedEmailDeliveryResult> {
    if (!this.awsProvider) {
      return {
        success: true,
        provider: "simulated",
        mode: "simulated",
        messageId: null,
        destination: this.testDestination ?? "local",
        status: "accepted",
        latencyMs: 0,
      };
    }
    return this.sendConfiguredEmail(subject, textBody, htmlBody);
  }

  sendTest(
    subject: string,
    textBody: string,
  ): Promise<AwsSesDeliveryResult> {
    if (!this.awsProvider) {
      throw new Error("Amazon SES provider is not selected.");
    }
    return this.sendConfiguredEmail(subject, textBody);
  }

  isAwsSelected() {
    return this.awsProvider !== null;
  }

  private sendConfiguredEmail(
    subject: string,
    textBody: string,
    htmlBody?: string,
  ): Promise<AwsSesDeliveryResult> {
    if (!this.awsProvider) {
      throw new Error("Amazon SES provider is not selected.");
    }
    if (!this.testDestination) {
      throw new Error(
        "AWS_SES_TEST_DESTINATION is required for Amazon SES delivery.",
      );
    }
    return this.awsProvider.send(
      this.testDestination,
      subject,
      textBody,
      htmlBody,
    );
  }
}

class SimulatedEmailChannel extends SimulatedChannelAdapter {
  readonly channel = "Email" as const;
}