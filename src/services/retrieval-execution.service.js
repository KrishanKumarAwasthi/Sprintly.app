const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const structuredRetrieval = require('./structured-retrieval.service');
const aiService = require('./ai.service');

const ALLOWED_OPERATIONS = [
  'BOARD_SUMMARY',
  'CARDS_BY_LIST',
  'OVERDUE_CARDS',
  'CARDS_BY_MEMBER',
  'CARDS_BY_LABEL',
  'CHECKLIST_STATS'
];

/**
 * Resolves entity names to authoritative IDs, safely scoped to the provided boardId.
 */
async function resolveEntities(boardId, entityReferences) {
  const resolved = {};
  if (!entityReferences) return resolved;

  if (entityReferences.listName) {
    const list = await prisma.list.findFirst({
      where: { 
        boardId, 
        title: { equals: entityReferences.listName, mode: 'insensitive' } 
      }
    });
    if (list) {
      resolved.listId = list.id;
      resolved.listName = list.title;
    } else {
      throw new Error(`I couldn't find a list named "${entityReferences.listName}" on this board. Please check the spelling.`);
    }
  }

  if (entityReferences.memberName) {
    const member = await prisma.member.findFirst({
      where: {
        name: { equals: entityReferences.memberName, mode: 'insensitive' },
        cards: { some: { card: { list: { boardId } } } }
      }
    });
    if (member) {
      resolved.memberId = member.id;
      resolved.memberName = member.name;
    } else {
      throw new Error(`I couldn't find a team member named "${entityReferences.memberName}" on this board.`);
    }
  }

  if (entityReferences.labelName) {
    const label = await prisma.label.findFirst({
      where: {
        name: { equals: entityReferences.labelName, mode: 'insensitive' },
        cards: { some: { card: { list: { boardId } } } }
      }
    });
    if (label) {
      resolved.labelId = label.id;
      resolved.labelName = label.name;
    } else {
      throw new Error(`I couldn't find a label named "${entityReferences.labelName}" on this board.`);
    }
  }

  return resolved;
}

/**
 * Executes a validated RetrievalPlan and returns authoritative, bounded results.
 */
async function executeRetrievalPlan(plan) {
  const { intent, semanticQuery, structuredOperation, entityReferences, boardId, semanticLimit, originalQuestion } = plan;

  const result = {
    boardId,
    intent,
    question: originalQuestion,
    results: {}
  };

  try {
    // 1. Resolve any named entities into IDs scoped to this board
    const resolvedEntities = await resolveEntities(boardId, entityReferences);
    if (Object.keys(resolvedEntities).length > 0) {
      result.results.resolvedEntities = resolvedEntities;
    }

    if (intent === 'STRUCTURED') {
      if (!ALLOWED_OPERATIONS.includes(structuredOperation)) {
        throw new Error(`Unknown structured operation: ${structuredOperation}`);
      }

      let data;
      switch (structuredOperation) {
        case 'BOARD_SUMMARY':
          data = await structuredRetrieval.getBoardSummary(boardId);
          break;
        case 'CARDS_BY_LIST':
          if (!resolvedEntities.listId) throw new Error("I couldn't identify the specific list from your question. Please make sure to include the list name.");
          data = await structuredRetrieval.getCardsByList(boardId, resolvedEntities.listId);
          break;
        case 'OVERDUE_CARDS':
          data = await structuredRetrieval.getOverdueCards(boardId);
          break;
        case 'CARDS_BY_MEMBER':
          if (!resolvedEntities.memberId) throw new Error("I couldn't identify the team member from your question. Please make sure to include their name.");
          data = await structuredRetrieval.getCardsByMember(boardId, resolvedEntities.memberId);
          break;
        case 'CARDS_BY_LABEL':
          if (!resolvedEntities.labelId) throw new Error("I couldn't identify the label from your question. Please make sure to include the label name.");
          data = await structuredRetrieval.getCardsByLabel(boardId, resolvedEntities.labelId);
          break;
        case 'CHECKLIST_STATS':
          data = await structuredRetrieval.getChecklistStats(boardId);
          break;
      }
      result.results.structuredData = data;
    } 
    else if (intent === 'SEMANTIC') {
      const candidates = await aiService.searchSimilarCards({ boardId, query: semanticQuery, limit: semanticLimit });
      result.results.cards = candidates;
    }
    else if (intent === 'HYBRID') {
      // 1. Retrieve candidates using semantic search (fetch slightly more to allow filtering)
      const fetchLimit = Math.max(semanticLimit || 10, 20);
      const candidates = await aiService.searchSimilarCards({ boardId, query: semanticQuery, limit: fetchLimit });
      
      if (candidates.length === 0) {
        result.results.cards = [];
        return result;
      }

      // 2. Authoritative filtering against actual PostgreSQL state
      const candidateIds = candidates.map(c => c.cardId);
      const isOverdue = structuredOperation === 'OVERDUE_CARDS';
      
      const validCards = await prisma.card.findMany({
        where: {
          id: { in: candidateIds },
          isArchived: false,
          ...(resolvedEntities.listId && { listId: resolvedEntities.listId }),
          ...(resolvedEntities.memberId && { members: { some: { memberId: resolvedEntities.memberId } } }),
          ...(resolvedEntities.labelId && { labels: { some: { labelId: resolvedEntities.labelId } } }),
          ...(isOverdue && { dueDate: { lt: new Date(), not: null } })
        },
        select: { id: true }
      });

      const validCardIds = new Set(validCards.map(c => c.id));
      
      // 3. Preserve semantic ordering, cap to requested limit
      result.results.cards = candidates
        .filter(c => validCardIds.has(c.cardId))
        .slice(0, semanticLimit);
        
      result.results.structuredConstraints = {
        listId: resolvedEntities.listId,
        memberId: resolvedEntities.memberId,
        labelId: resolvedEntities.labelId,
        isOverdue
      };
    }
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

module.exports = {
  executeRetrievalPlan,
  resolveEntities,
  ALLOWED_OPERATIONS
};
