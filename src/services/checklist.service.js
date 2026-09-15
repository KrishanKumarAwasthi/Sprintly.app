const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const AppError = require('../utils/AppError');
const { triggerEmbeddingSync } = require('./ai.service');

class ChecklistService {
  async createChecklist(cardId) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new AppError('Card not found', 404);

    const checklist = await prisma.checklist.create({
      data: { cardId },
    });

    triggerEmbeddingSync(cardId);
    return checklist;
  }

  async addChecklistItem(checklistId, content) {
    const checklist = await prisma.checklist.findUnique({ where: { id: checklistId } });
    if (!checklist) throw new AppError('Checklist not found', 404);

    const item = await prisma.checklistItem.create({
      data: {
        checklistId,
        content,
      },
    });

    triggerEmbeddingSync(checklist.cardId);
    return item;
  }

  async updateItemStatus(itemId, completed) {
    const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, include: { checklist: true } });
    if (!item) throw new AppError('Checklist item not found', 404);

    const updatedItem = await prisma.checklistItem.update({
      where: { id: itemId },
      data: { completed },
    });

    triggerEmbeddingSync(item.checklist.cardId);
    return updatedItem;
  }

  async deleteItem(itemId) {
    const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, include: { checklist: true } });
    if (!item) throw new AppError('Checklist item not found', 404);

    await prisma.checklistItem.delete({ where: { id: itemId } });
    triggerEmbeddingSync(item.checklist.cardId);
  }
}

module.exports = new ChecklistService();
