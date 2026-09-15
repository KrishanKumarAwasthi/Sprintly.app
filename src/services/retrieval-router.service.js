const { z } = require('zod');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');

// --- Zod schemas for validated retrieval plan output ---

const RetrievalIntent = z.enum(['STRUCTURED', 'SEMANTIC', 'HYBRID']);

const StructuredOperation = z.enum([
  'BOARD_SUMMARY',
  'CARDS_BY_LIST',
  'OVERDUE_CARDS',
  'CARDS_BY_MEMBER',
  'CARDS_BY_LABEL',
  'CHECKLIST_STATS',
]);

// Entity references extracted from the question (names, not IDs).
// Phase 5D will resolve these to actual UUIDs using the database.
const EntityReferences = z.object({
  listName: z.string().optional().describe('The name of the list mentioned in the question, if any.'),
  memberName: z.string().optional().describe('The name of the member/person mentioned in the question, if any.'),
  labelName: z.string().optional().describe('The name of the label mentioned in the question, if any.'),
}).describe('Entity names extracted from the question for later database resolution.');

const RetrievalPlanSchema = z.object({
  intent: RetrievalIntent.describe(
    'STRUCTURED for exact counts/filters/status queries. ' +
    'SEMANTIC for topic/concept similarity searches. ' +
    'HYBRID when both semantic relevance AND structured constraints are needed.'
  ),
  semanticQuery: z.string().optional().describe(
    'The semantic search phrase to use for vector similarity search. ' +
    'Required for SEMANTIC and HYBRID intents. ' +
    'Should capture the conceptual topic, not the full question.'
  ),
  structuredOperation: StructuredOperation.optional().describe(
    'The structured database operation to perform. ' +
    'Required for STRUCTURED intent, optional for HYBRID.'
  ),
  entityReferences: EntityReferences.optional().describe(
    'Named entities mentioned in the question. Never fabricate IDs.'
  ),
});

// --- Constants ---
const DEFAULT_SEMANTIC_LIMIT = 10;
const MAX_SEMANTIC_LIMIT = 20;
const MAX_QUESTION_LENGTH = 1000;

// --- LLM classifier ---
const classifierModel = new ChatGoogleGenerativeAI({
  model: 'gemini-3.6-flash',
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0, // deterministic classification
});

const CLASSIFICATION_SYSTEM_PROMPT = `You are a retrieval-intent classifier for a project management board application (like Trello).

Given a user's natural-language question about their board, determine the retrieval strategy.

Rules:
- STRUCTURED: Use when the question asks for exact counts, specific status, overdue items, items by member/label/list, or checklist statistics. These are answerable from database queries alone.
- SEMANTIC: Use when the question asks about a topic, concept, or keyword that requires semantic similarity search over card content. Examples: "cards about authentication", "tasks related to deployment".
- HYBRID: Use when the question combines a semantic topic with a structured constraint. Examples: "authentication cards that are overdue", "deployment tasks assigned to John", "security cards in the Done list".

For STRUCTURED intent:
- Choose the structuredOperation that best matches:
  - BOARD_SUMMARY: overall board stats, total card counts, cards per list
  - CARDS_BY_LIST: cards in a specific named list
  - OVERDUE_CARDS: cards past their due date
  - CARDS_BY_MEMBER: cards assigned to a specific person
  - CARDS_BY_LABEL: cards with a specific label
  - CHECKLIST_STATS: checklist completion statistics

For SEMANTIC intent:
- Extract the core semantic topic as semanticQuery (not the full question).

For HYBRID intent:
- Provide BOTH semanticQuery AND structuredOperation/entityReferences as appropriate.

Entity references:
- Extract list names, member names, and label names mentioned in the question.
- NEVER fabricate UUIDs or IDs. Only extract human-readable names.

When in doubt between STRUCTURED and HYBRID, prefer HYBRID for safety.
When in doubt between SEMANTIC and HYBRID, prefer HYBRID for safety.`;

/**
 * Classifies a user question into a validated retrieval plan.
 *
 * @param {Object} params
 * @param {string} params.boardId - The board scope (trusted, from application layer).
 * @param {string} params.question - The user's natural-language question.
 * @param {number} [params.semanticLimit] - Max results for semantic search (default 10, max 20).
 * @returns {Promise<Object>} A validated RetrievalPlan.
 */
async function classifyQuestion({ boardId, question, semanticLimit }) {
  // --- Input validation ---
  if (!boardId || typeof boardId !== 'string') {
    throw new Error('boardId is required and must be a string');
  }
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('question is required and must be a non-empty string');
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new Error(`question exceeds maximum length of ${MAX_QUESTION_LENGTH} characters`);
  }

  const safeLimit = Math.max(1, Math.min(
    Number(semanticLimit) || DEFAULT_SEMANTIC_LIMIT,
    MAX_SEMANTIC_LIMIT
  ));

  // --- LLM classification with structured output ---
  const structuredLlm = classifierModel.withStructuredOutput(RetrievalPlanSchema);

  let plan;
  try {
    plan = await structuredLlm.invoke([
      { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
      { role: 'human', content: question.trim() },
    ]);
  } catch (err) {
    throw new Error(`Classification failed: ${err.message}`);
  }

  // --- Validate the parsed plan against Zod ---
  const parseResult = RetrievalPlanSchema.safeParse(plan);
  if (!parseResult.success) {
    throw new Error(`Invalid classification output: ${parseResult.error.message}`);
  }

  const validatedPlan = parseResult.data;

  // --- Post-validation consistency checks ---

  // STRUCTURED must have a structuredOperation
  if (validatedPlan.intent === 'STRUCTURED' && !validatedPlan.structuredOperation) {
    // Fallback: if the LLM forgot, default to BOARD_SUMMARY
    validatedPlan.structuredOperation = 'BOARD_SUMMARY';
  }

  // SEMANTIC must have a semanticQuery
  if (validatedPlan.intent === 'SEMANTIC' && !validatedPlan.semanticQuery) {
    // Use the original question as the semantic query
    validatedPlan.semanticQuery = question.trim();
  }

  // HYBRID should have at least a semanticQuery
  if (validatedPlan.intent === 'HYBRID' && !validatedPlan.semanticQuery) {
    validatedPlan.semanticQuery = question.trim();
  }

  // --- Attach metadata that the caller controls ---
  return {
    ...validatedPlan,
    boardId,          // Always from the trusted caller, never from the question
    semanticLimit: safeLimit,
    originalQuestion: question.trim(),
  };
}

module.exports = {
  classifyQuestion,
  RetrievalPlanSchema,
  RetrievalIntent,
  StructuredOperation,
};
