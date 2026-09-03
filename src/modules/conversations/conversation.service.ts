import { conversationRepository } from "./conversation.repository.js";
import { messageRepository } from "./message.repository.js";

export const conversationService = {
  async listByUser(userId: string) {
    return conversationRepository.findByUserId(userId);
  },

  async getById(conversationId: string, userId: string) {
    const conversation = await conversationRepository.findById(conversationId);
    if (!conversation || conversation.userId !== userId) return null;

    const messages = await messageRepository.findByConversationId(conversationId);
    return { conversation, messages };
  },
};