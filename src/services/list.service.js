const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const AppError = require('../utils/AppError');
const { triggerEmbeddingSync } = require('./ai.service');

class ListService {
  async getListsByBoardId(boardId) {
    // Optionally check if board exists first
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) throw new AppError('Board not found', 404);

    return prisma.list.findMany({
      where: { boardId },
      include: { cards: { orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' },
    });
  }

  async createList(boardId, title, position) {
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) throw new AppError('Board not found', 404);

    return prisma.list.create({
      data: {
        title,
        position,
        boardId,
      },
    });
  }

  async updateListTitle(id, title) {
    const list = await prisma.list.findUnique({ where: { id }, include: { cards: { select: { id: true } } } });
    if (!list) throw new AppError('List not found', 404);

    const updatedList = await prisma.list.update({
      where: { id },
      data: { title },
    });

    if (list.title !== title) {
      list.cards.forEach(card => triggerEmbeddingSync(card.id));
    }

    return updatedList;
  }

  async deleteList(id) {
    const list = await prisma.list.findUnique({ where: { id } });
    if (!list) throw new AppError('List not found', 404);

    await prisma.list.delete({ where: { id } });
  }

  async reorderList(boardId, sourceIndex, destinationIndex) {
    if (sourceIndex === destinationIndex) return;

    // 1. Fetch lists for the board to calculate adjacent positions
    const lists = await prisma.list.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });

    if (lists.length === 0) return;
    if (sourceIndex < 0 || sourceIndex >= lists.length) throw new AppError('Invalid source index', 400);
    if (destinationIndex < 0 || destinationIndex >= lists.length) throw new AppError('Invalid destination index', 400);

    const draggedList = lists[sourceIndex];
    
    // Simulate array drag operation locally
    lists.splice(sourceIndex, 1);
    lists.splice(destinationIndex, 0, draggedList);

    let newPosition;
    if (destinationIndex === 0) {
      // Moved to top: slice position in half
      newPosition = lists[1] ? lists[1].position / 2 : 1000;
    } else if (destinationIndex === lists.length - 1) {
      // Moved to bottom: add buffer
      newPosition = lists[lists.length - 2].position + 1000;
    } else {
      // Moved to middle: calculate median
      const prevPosition = lists[destinationIndex - 1].position;
      const nextPosition = lists[destinationIndex + 1].position;
      newPosition = (prevPosition + nextPosition) / 2;
    }

    // 2. Perform exactly 1 efficient update query
    return prisma.list.update({
      where: { id: draggedList.id },
      data: { position: newPosition },
    });
  }
}

module.exports = new ListService();
