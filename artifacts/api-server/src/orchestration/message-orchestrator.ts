import type {
  ChannelAdapter,
  NormalizedMessage,
} from "../channels/channel-adapters";
import type { ConversationRepository } from "../conversation/conversation-repository";
import type { EventStore } from "../events/event-store";
import type { ModelProvider } from "../models/model-provider";
import type { PassengerContext, PassengerInterpretation } from "../models/model-provider";
import type { OperationalLogger } from "../observability/operational-logger";

export class MessageOrchestrator {
  private readonly channels = new Map<string, ChannelAdapter>();

  constructor(
    adapters: ChannelAdapter[],
    private readonly conversations: ConversationRepository,
    private readonly model: ModelProvider,
    private readonly events: EventStore,
    private readonly logger: OperationalLogger,
  ) {
    for (const adapter of adapters) {
      this.channels.set(adapter.channel.toLowerCase(), adapter);
    }
  }

  async receive(message: NormalizedMessage) {
    const adapter = this.requireChannel(message.channel);
    const normalized = await adapter.receiveMessage(message);
    const conversation = this.conversations.get(message.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${message.conversationId} not found.`);
    }

    const interpretation = await this.model.interpretPassengerRequest(
      normalized.content,
      {
        passengerName: conversation.passengerName,
        bookingReference: conversation.bookingReference,
        currentFlight: conversation.currentFlight,
        origin: conversation.origin,
        destination: conversation.destination,
        disruptionStatus: conversation.rebookingStatus,
        selectedFlight: conversation.selectedFlight,
        confirmationStatus: conversation.confirmationStatus,
      },
    );
    const channel = adapter.channel;
    this.conversations.transitionChannel(message.conversationId, channel);
    const transitioned = this.conversations.get(message.conversationId);
    if (!transitioned) {
      throw new Error(`Conversation ${message.conversationId} not found.`);
    }
    this.conversations.addMessage(message.conversationId, {
      id: message.messageId,
      channel,
      sender: transitioned.passengerName,
      text: normalized.content,
      timestamp: normalized.timestamp,
    });
    this.conversations.save({
      ...this.conversations.get(message.conversationId)!,
      passengerRequest: normalized.content,
      detectedIntent: interpretation.intent,
      arrivalConstraint:
        interpretation.constraints.arrivalBefore ??
        transitioned.arrivalConstraint,
      selectedFlight:
        interpretation.selectedFlight ?? transitioned.selectedFlight,
      confirmationStatus:
        interpretation.selectedFlight && interpretation.requiresConfirmation
          ? "Awaiting passenger confirmation"
          : transitioned.confirmationStatus,
      currentAgentState: "Passenger request interpreted",
    });
    this.events.append({
      conversationId: message.conversationId,
      passengerId: message.passengerId,
      eventType: "PASSENGER_MESSAGE_RECEIVED",
      channel: message.channel,
      metadata: {
        intent: interpretation.intent,
        arrivalBefore: interpretation.constraints.arrivalBefore,
        selectedFlight: interpretation.selectedFlight,
        requiresTool: interpretation.requiresTool,
        requiresConfirmation: interpretation.requiresConfirmation,
      },
    });
    this.logger.record("agent_decision", {
      conversationId: message.conversationId,
      intent: interpretation.intent,
      provider: interpretation.provider,
      tool: interpretation.requiresTool,
      confirmationRequired: interpretation.requiresConfirmation,
    });
    return interpretation;
  }

  async interpret(
    content: string,
    context: PassengerContext,
  ): Promise<PassengerInterpretation> {
    return this.model.interpretPassengerRequest(content, context);
  }

  async send(message: NormalizedMessage) {
    return this.requireChannel(message.channel).sendMessage(message);
  }

  private requireChannel(channel: string) {
    const adapter = this.channels.get(channel.toLowerCase());
    if (!adapter) {
      throw new Error(`Channel ${channel} is not configured.`);
    }
    return adapter;
  }
}