import type { Channel } from "../surgeair/domain";
import type { OperationalLogger } from "../observability/operational-logger";
import {
  AwsSmsProvider,
  type AwsSmsClient,
  type AwsSmsDeliveryResult,
} from "./aws-sms-provider";

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

export class EmailChannel extends SimulatedChannelAdapter {
  readonly channel = "Email" as const;
}