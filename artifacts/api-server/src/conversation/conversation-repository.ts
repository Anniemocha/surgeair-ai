import type { Channel, ConversationState, MessageRecord } from "../surgeair/domain";

export interface StoredConversation extends ConversationState {
  conversationId: string;
  messages: MessageRecord[];
  createdAt: string;
  updatedAt: string;
  lastToolCalled: string | null;
  currentAgentState: string;
}

export interface ConversationRepository {
  get(conversationId: string): StoredConversation | null;
  save(conversation: StoredConversation): StoredConversation;
  addMessage(conversationId: string, message: MessageRecord): StoredConversation;
  transitionChannel(
    conversationId: string,
    channel: Channel,
  ): StoredConversation;
}

export class InMemoryConversationRepository
  implements ConversationRepository
{
  private readonly conversations = new Map<string, StoredConversation>();

  constructor(seed?: StoredConversation) {
    if (seed) {
      this.conversations.set(seed.conversationId, seed);
    }
  }

  get(conversationId: string) {
    return this.conversations.get(conversationId) ?? null;
  }

  save(conversation: StoredConversation) {
    const saved = { ...conversation, updatedAt: new Date().toISOString() };
    this.conversations.set(saved.conversationId, saved);
    return saved;
  }

  addMessage(conversationId: string, message: MessageRecord) {
    const conversation = this.require(conversationId);
    return this.save({
      ...conversation,
      messages: [...conversation.messages, message],
    });
  }

  transitionChannel(conversationId: string, channel: Channel) {
    const conversation = this.require(conversationId);
    if (conversation.currentChannel === channel) {
      return conversation;
    }
    return this.save({
      ...conversation,
      previousChannel: conversation.currentChannel,
      currentChannel: channel,
    });
  }

  snapshot() {
    return [...this.conversations.values()].map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => ({ ...message })),
    }));
  }

  restore(conversations: StoredConversation[]) {
    this.conversations.clear();
    for (const conversation of conversations) {
      this.conversations.set(conversation.conversationId, {
        ...conversation,
        messages: conversation.messages.map((message) => ({ ...message })),
      });
    }
  }

  private require(conversationId: string) {
    const conversation = this.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found.`);
    }
    return conversation;
  }
}