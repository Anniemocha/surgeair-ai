import type { Channel } from "../surgeair/domain";
import type { OperationalLogger } from "../observability/operational-logger";

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

export class SmsChannel extends SimulatedChannelAdapter {
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