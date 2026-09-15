const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");

// Configure Gemini embeddings and explicitly request 768 dimensions
const embeddings = new GoogleGenerativeAIEmbeddings({
  modelName: "gemini-embedding-001",
  taskType: "RETRIEVAL_DOCUMENT",
  apiKey: process.env.GEMINI_API_KEY,
  // We explicitly configure 768 dimensions per requirements to avoid the 3072 default
  outputDimensionality: 768, 
});

// Separate instance for query-side embeddings using the correct RETRIEVAL_QUERY task type.
// Gemini recommends using RETRIEVAL_DOCUMENT for documents and RETRIEVAL_QUERY for queries.
const queryEmbeddings = new GoogleGenerativeAIEmbeddings({
  modelName: "gemini-embedding-001",
  taskType: "RETRIEVAL_QUERY",
  apiKey: process.env.GEMINI_API_KEY,
  outputDimensionality: 768,
});

/**
 * Synchronizes the embedding for a given card.
 * Fetches the card's current semantic state, constructs a RAG document,
 * generates the embedding, and upserts it into the CardEmbedding table.
 * 
 * @param {string} cardId - The ID of the card to sync.
 */
async function syncCardEmbedding(cardId) {
  try {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        list: true,
        labels: { include: { label: true } },
        members: { include: { member: true } },
        checklists: { include: { items: true } },
      },
    });

    if (!card) {
      // If the card doesn't exist (e.g. was deleted), remove the embedding to prevent orphans
      await prisma.$executeRaw`DELETE FROM "CardEmbedding" WHERE "cardId" = ${cardId}`;
      return;
    }

    const title = card.title;
    const listTitle = card.list ? card.list.title : "Unknown List";
    const description = card.description || "";
    const labelsStr = card.labels.map(l => l.label.name).join(", ");
    const membersStr = card.members.map(m => m.member.name).join(", ");
    
    let checklistsStr = "";
    if (card.checklists && card.checklists.length > 0) {
      const items = card.checklists.flatMap(c => c.items);
      checklistsStr = items.map(i => `- [${i.completed ? 'x' : ' '}] ${i.content}`).join("\n");
    }

    // Canonical RAG document representation
    const documentContent = `Title:
${title}

List:
${listTitle}

Description:
${description}

Members:
${membersStr}

Labels:
${labelsStr}

Checklist:
${checklistsStr}`;

    // Generate embedding
    const vector = await embeddings.embedQuery(documentContent);
    
    // Verify the actual returned vector length
    if (vector.length !== 768) {
       console.warn(`Warning: Expected embedding dimension 768, got ${vector.length}`);
    }

    // Convert vector array to pgvector string format: '[1.1, 2.2, ...]'
    const vectorString = `[${vector.join(',')}]`;

    // Upsert using raw SQL to support the Unsupported pgvector type
    await prisma.$executeRaw`
      INSERT INTO "CardEmbedding" ("id", "cardId", "boardId", "content", "embedding", "updatedAt")
      VALUES (gen_random_uuid(), ${cardId}, ${card.list.boardId}, ${documentContent}, ${vectorString}::vector, NOW())
      ON CONFLICT ("cardId") DO UPDATE SET
        "content" = EXCLUDED."content",
        "embedding" = EXCLUDED."embedding",
        "updatedAt" = NOW();
    `;

    console.log(`[AI] Successfully synced embedding for card ${cardId}`);
  } catch (error) {
    // We log the error but DO NOT throw it. Card CRUD must remain successful
    // even if Gemini embedding generation fails.
    console.error(`[AI] Failed to sync embedding for card ${cardId}:`, error.message);
  }
}

const MAX_QUERY_LENGTH = 1000;
const MAX_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_LIMIT = 5;

/**
 * Searches for semantically similar cards within a specific board.
 * 
 * Uses pgvector cosine distance (<=> operator) on the CardEmbedding table,
 * scoped by boardId. Returns current card state by joining with Card and List.
 *
 * @param {Object} params
 * @param {string} params.boardId - The board to search within (mandatory scope).
 * @param {string} params.query - Natural-language search query.
 * @param {number} [params.limit=5] - Maximum number of results (capped at 20).
 * @returns {Promise<Array>} Array of card results ordered by similarity.
 */
async function searchSimilarCards({ boardId, query, limit = DEFAULT_SEARCH_LIMIT }) {
  // --- Input validation ---
  if (!boardId || typeof boardId !== 'string') {
    throw new Error('boardId is required and must be a string');
  }
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('query is required and must be a non-empty string');
  }
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT));

  // --- Generate query embedding ---
  const queryVector = await queryEmbeddings.embedQuery(query.trim());

  if (queryVector.length !== 768) {
    throw new Error(`Expected query embedding dimension 768, got ${queryVector.length}`);
  }

  const vectorString = `[${queryVector.join(',')}]`;

  // --- Parameterized pgvector cosine distance query ---
  // Uses <=> operator for cosine distance (lower = more similar).
  // Joins with Card and List to return current authoritative state from PostgreSQL.
  // Board isolation is enforced via WHERE clause on CardEmbedding.boardId.
  const results = await prisma.$queryRaw`
    SELECT 
      ce."cardId",
      ce."boardId",
      c."listId",
      c."title",
      c."description",
      l."title" AS "listTitle",
      ce."content" AS "canonicalContent",
      (ce."embedding" <=> ${vectorString}::vector) AS "distance"
    FROM "CardEmbedding" ce
    JOIN "Card" c ON c."id" = ce."cardId"
    JOIN "List" l ON l."id" = c."listId"
    WHERE ce."boardId" = ${boardId}
      AND c."isArchived" = false
    ORDER BY ce."embedding" <=> ${vectorString}::vector ASC
    LIMIT ${safeLimit};
  `;

  // Convert distance to a similarity score (1 - cosine_distance) for convenience.
  // Cosine distance ranges from 0 (identical) to 2 (opposite).
  return results.map(row => ({
    cardId: row.cardId,
    boardId: row.boardId,
    listId: row.listId,
    title: row.title,
    description: row.description,
    listTitle: row.listTitle,
    canonicalContent: row.canonicalContent,
    distance: Number(row.distance),
    similarity: 1 - Number(row.distance),
  }));
}

module.exports = {
  syncCardEmbedding,
  triggerEmbeddingSync: (cardId) => {
    // Fire-and-forget synchronization. Will log errors internally but won't throw to caller.
    syncCardEmbedding(cardId).catch(err => {
      console.error(`[AI] Unhandled error during fire-and-forget sync for card ${cardId}:`, err);
    });
  },
  searchSimilarCards,
};

