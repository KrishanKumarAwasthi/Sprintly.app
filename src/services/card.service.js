const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const AppError = require('../utils/AppError');
const { triggerEmbeddingSync } = require('./ai.service');

class CardService {
  async getCardsByListId(listId) {
    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw new AppError('List not found', 404);

    return prisma.card.findMany({
      where: { listId, isArchived: false },
      include: {
        labels: { include: { label: true } },
        members: { include: { member: true } },
        checklists: { include: { items: true } }
      },
      orderBy: { position: 'asc' },
    });
  }

  async searchCards({ query, labelId, memberId, dueDate }) {
    const where = {};

    if (query) {
      where.title = { contains: query, mode: 'insensitive' };
    }
    if (labelId) {
      // Some labelId matches
      where.labels = { some: { labelId } };
    }
    if (memberId) {
      where.members = { some: { memberId } };
    }
    if (dueDate) {
      // Less than equal to
      where.dueDate = { lte: new Date(dueDate) };
    }
    where.isArchived = false;

    return prisma.card.findMany({
      where,
      include: {
        labels: { include: { label: true } },
        members: { include: { member: true } },
        checklists: { include: { items: true } }
      },
      orderBy: { position: 'asc' },
    });
  }

  async createCard({ listId, title, description, dueDate, position }) {
    const list = await prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw new AppError('List not found', 404);

    const card = await prisma.card.create({
      data: {
        title,
        description,
        dueDate: (dueDate && dueDate.trim() !== "") ? new Date(dueDate) : null,
        position,
        listId,
      },
    });

    triggerEmbeddingSync(card.id);
    return card;
  }

  async updateCard(id, data) {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new AppError('Card not found', 404);
    //  if user moving move card to another list
    if (data.listId && data.listId !== card.listId) {
      const newList = await prisma.list.findUnique({ where: { id: data.listId } });
      if (!newList) throw new AppError('Target list not found', 404);
    }
    // Handle due date conversion and convert date to obj
    const updateData = { ...data };
    // spred op
    if (updateData.dueDate && updateData.dueDate.trim() !== "") {
      updateData.dueDate = new Date(updateData.dueDate);
    } else if (updateData.dueDate === null || updateData.dueDate === "") {
      updateData.dueDate = null;
    }

    const updatedCard = await prisma.card.update({
      where: { id },
      data: updateData,
    });

    if (data.title !== undefined || data.description !== undefined || data.listId !== undefined) {
      triggerEmbeddingSync(id);
    }

    return updatedCard;
  }

  async deleteCard(id) {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new AppError('Card not found', 404);

    await prisma.card.delete({ where: { id } });
  }

  async archiveCard(id) {
    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) throw new AppError('Card not found', 404);

    return prisma.card.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  async reorderCard(listId, sourceIndex, destinationIndex) {
    const cards = await prisma.card.findMany({
      where: { listId },
      orderBy: { position: 'asc' },
    });

    if (cards.length === 0) return null;
    if (sourceIndex < 0 || sourceIndex >= cards.length) throw new AppError('Invalid source index', 400);
    if (destinationIndex < 0 || destinationIndex >= cards.length) throw new AppError('Invalid destination index', 400);

    const draggedCard = cards[sourceIndex];
    if (sourceIndex === destinationIndex) return draggedCard;

    // Go to index, delete no of elm, insert x and modify arry
    cards.splice(sourceIndex, 1);
    cards.splice(destinationIndex, 0, draggedCard);

    let newPosition;
    if (destinationIndex === 0) {
      // start
      newPosition = cards[1] ? cards[1].position / 2 : 1000;
    } else if (destinationIndex === cards.length - 1) {
      // end
      newPosition = cards[cards.length - 2].position + 1000;
    } else {
      const prevPosition = cards[destinationIndex - 1].position;
      const nextPosition = cards[destinationIndex + 1].position;
      newPosition = (prevPosition + nextPosition) / 2;
    }

    return prisma.card.update({
      where: { id: draggedCard.id },
      data: { position: newPosition },
    });
  }

  async moveCard(cardId, sourceListId, destinationListId, destinationIndex) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.listId !== sourceListId) throw new AppError('Card not found in source list', 404);

    const destList = await prisma.list.findUnique({ where: { id: destinationListId } });
    if (!destList) throw new AppError('Destination list not found', 404);

    const destCards = await prisma.card.findMany({
      where: { listId: destinationListId },
      orderBy: { position: 'asc' },
    });

    // Handle destination index bounds safely
    let targetIndex = destinationIndex;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex > destCards.length) targetIndex = destCards.length;

    // Simulate inserting the card into the destination array
    destCards.splice(targetIndex, 0, card);

    let newPosition;
    if (targetIndex === 0) {
      newPosition = destCards[1] ? destCards[1].position / 2 : 1000;
    } else if (targetIndex === destCards.length - 1) {
      newPosition = destCards[targetIndex - 1].position + 1000;
    } else {
      const prevPosition = destCards[targetIndex - 1].position;
      const nextPosition = destCards[targetIndex + 1].position;
      newPosition = (prevPosition + nextPosition) / 2;
    }

    const updatedCard = await prisma.card.update({
      where: { id: cardId },
      data: { 
        position: newPosition,
        listId: destinationListId,
      },
    });

    triggerEmbeddingSync(cardId);
    return updatedCard;
  }
  async addLabel(cardId, labelId) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    const label = await prisma.label.findUnique({ where: { id: labelId } });

    if (!card) throw new AppError('Card not found', 404);
    if (!label) throw new AppError('Label not found', 404);

    const result = await prisma.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId } },
      update: {},
      create: { cardId, labelId },
    });

    triggerEmbeddingSync(cardId);
    return result;
  }

  async removeLabel(cardId, labelId) {
    const { count } = await prisma.cardLabel.deleteMany({
      where: { cardId, labelId },
    });

    if (count === 0) throw new AppError('Label is not assigned to this card', 404);

    triggerEmbeddingSync(cardId);
  }

  async assignMember(cardId, memberId) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    const member = await prisma.member.findUnique({ where: { id: memberId } });

    if (!card) throw new AppError('Card not found', 404);
    if (!member) throw new AppError('Member not found', 404);

    const result = await prisma.cardMember.upsert({
      where: { cardId_memberId: { cardId, memberId } },
      update: {},
      create: { cardId, memberId },
    });

    triggerEmbeddingSync(cardId);
    return result;
  }

  async removeMember(cardId, memberId) {
    const { count } = await prisma.cardMember.deleteMany({
      where: { cardId, memberId },
    });

    if (count === 0) throw new AppError('Member is not assigned to this card', 404);

    triggerEmbeddingSync(cardId);
  }
}

module.exports = new CardService();
