const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const AppError = require('../utils/AppError');
const { triggerEmbeddingSync } = require('./ai.service');

class LabelService {
  async getAllLabels() {
    return prisma.label.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createLabel({ name, color }) {
    if (!name || !color) throw new AppError('Name and color are required', 400);

    return prisma.label.create({
      data: { name, color },
    });
  }

  async getLabelById(id) {
    const label = await prisma.label.findUnique({ where: { id } });
    if (!label) throw new AppError('Label not found', 404);
    return label;
  }

  async deleteLabel(id) {
    const label = await prisma.label.findUnique({ where: { id }, include: { cards: { select: { cardId: true } } } });
    if (!label) throw new AppError('Label not found', 404);

    // Prisma handles Cascade delete for CardLabel relation automatically due to onDelete: Cascade in schema
    const deletedLabel = await prisma.label.delete({ where: { id } });

    label.cards.forEach(cardLabel => triggerEmbeddingSync(cardLabel.cardId));

    return deletedLabel;
  }
}

module.exports = new LabelService();
