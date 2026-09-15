const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Default filter to ensure we only get active cards for the specific board
const getBaseCardFilter = (boardId) => ({
  list: { boardId },
  isArchived: false,
});

/**
 * Gets a high-level summary of the board.
 * @param {string} boardId 
 */
async function getBoardSummary(boardId) {
  const [board, totalCards, listCounts] = await Promise.all([
    prisma.board.findUnique({ where: { id: boardId } }),
    prisma.card.count({ where: getBaseCardFilter(boardId) }),
    prisma.list.findMany({
      where: { boardId },
      include: {
        _count: {
          select: { cards: { where: { isArchived: false } } }
        }
      }
    })
  ]);

  if (!board) throw new Error('Board not found');

  return {
    boardId,
    boardTitle: board.title,
    totalCards,
    lists: listCounts.map(l => ({
      listId: l.id,
      listTitle: l.title,
      cardCount: l._count.cards
    }))
  };
}

/**
 * Gets all cards in a specific list, validated against the boardId.
 * @param {string} boardId 
 * @param {string} listId 
 */
async function getCardsByList(boardId, listId) {
  const cards = await prisma.card.findMany({
    where: {
      ...getBaseCardFilter(boardId),
      listId
    },
    include: { list: true }
  });

  return {
    boardId,
    listId,
    count: cards.length,
    cards: cards.map(c => ({
      cardId: c.id,
      title: c.title,
      listTitle: c.list.title,
      dueDate: c.dueDate
    }))
  };
}

/**
 * Gets all overdue cards in the board.
 * @param {string} boardId 
 */
async function getOverdueCards(boardId) {
  const now = new Date();
  const cards = await prisma.card.findMany({
    where: {
      ...getBaseCardFilter(boardId),
      dueDate: {
        lt: now, // strictly before current date/time
        not: null
      }
    },
    include: { list: true }
  });

  return {
    boardId,
    count: cards.length,
    cards: cards.map(c => ({
      cardId: c.id,
      title: c.title,
      listTitle: c.list.title,
      dueDate: c.dueDate
    }))
  };
}

/**
 * Gets cards assigned to a specific member, validated against the boardId.
 * @param {string} boardId 
 * @param {string} memberId 
 */
async function getCardsByMember(boardId, memberId) {
  const cardMembers = await prisma.cardMember.findMany({
    where: {
      memberId,
      card: getBaseCardFilter(boardId)
    },
    include: {
      card: { include: { list: true } },
      member: true
    }
  });

  if (cardMembers.length === 0) {
    return { boardId, memberId, count: 0, cards: [] };
  }

  return {
    boardId,
    memberId,
    memberName: cardMembers[0].member.name,
    count: cardMembers.length,
    cards: cardMembers.map(cm => ({
      cardId: cm.card.id,
      title: cm.card.title,
      listTitle: cm.card.list.title,
      dueDate: cm.card.dueDate
    }))
  };
}

/**
 * Gets cards with a specific label, validated against the boardId.
 * @param {string} boardId 
 * @param {string} labelId 
 */
async function getCardsByLabel(boardId, labelId) {
  const cardLabels = await prisma.cardLabel.findMany({
    where: {
      labelId,
      card: getBaseCardFilter(boardId)
    },
    include: {
      card: { include: { list: true } },
      label: true
    }
  });

  if (cardLabels.length === 0) {
    return { boardId, labelId, count: 0, cards: [] };
  }

  return {
    boardId,
    labelId,
    labelName: cardLabels[0].label.name,
    count: cardLabels.length,
    cards: cardLabels.map(cl => ({
      cardId: cl.card.id,
      title: cl.card.title,
      listTitle: cl.card.list.title,
      dueDate: cl.card.dueDate
    }))
  };
}

/**
 * Gets overall checklist statistics for the entire board.
 * @param {string} boardId 
 */
async function getChecklistStats(boardId) {
  const checklists = await prisma.checklist.findMany({
    where: {
      card: getBaseCardFilter(boardId)
    },
    include: {
      items: true
    }
  });

  let totalItems = 0;
  let completedItems = 0;

  for (const list of checklists) {
    totalItems += list.items.length;
    completedItems += list.items.filter(item => item.completed).length;
  }

  return {
    boardId,
    totalChecklists: checklists.length,
    totalItems,
    completedItems,
    completionPercentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
  };
}

module.exports = {
  getBoardSummary,
  getCardsByList,
  getOverdueCards,
  getCardsByMember,
  getCardsByLabel,
  getChecklistStats
};
