require('dotenv').config();
const { classifyQuestion } = require('../src/services/retrieval-router.service');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limit: 5 requests/minute on free tier. Space calls ~13s apart to stay safe.
const RATE_LIMIT_DELAY = 13000;

async function runTests() {
  console.log("=== Phase 5C Retrieval Router Tests ===\n");
  console.log("(Pacing LLM calls to respect Gemini free-tier rate limit)\n");
  let passed = 0;
  let failed = 0;

  const BOARD_ID = '4266ff79-cd07-40ca-86bc-37e6169cb8ae';

  async function test(name, question, expectation) {
    try {
      console.log(`Test: ${name}`);
      console.log(`  Q: "${question}"`);
      const plan = await classifyQuestion({ boardId: BOARD_ID, question });
      console.log(`  Intent: ${plan.intent}`);
      if (plan.semanticQuery) console.log(`  SemanticQuery: "${plan.semanticQuery}"`);
      if (plan.structuredOperation) console.log(`  StructuredOp: ${plan.structuredOperation}`);
      if (plan.entityReferences) {
        const refs = plan.entityReferences;
        if (refs.listName) console.log(`  ListName: "${refs.listName}"`);
        if (refs.memberName) console.log(`  MemberName: "${refs.memberName}"`);
        if (refs.labelName) console.log(`  LabelName: "${refs.labelName}"`);
      }
      expectation(plan);
      console.log("  ✅ PASSED\n");
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${err.message}\n`);
      failed++;
    }
  }

  // --- Test 1: Obvious structured question ---
  await test(
    "1. Obvious structured → STRUCTURED",
    "How many cards are on the board?",
    (plan) => {
      if (plan.intent !== 'STRUCTURED') throw new Error(`Expected STRUCTURED, got ${plan.intent}`);
      if (!plan.structuredOperation) throw new Error('Missing structuredOperation');
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 2: Obvious semantic question ---
  await test(
    "2. Obvious semantic → SEMANTIC",
    "Which cards are related to authentication?",
    (plan) => {
      if (plan.intent !== 'SEMANTIC') throw new Error(`Expected SEMANTIC, got ${plan.intent}`);
      if (!plan.semanticQuery) throw new Error('Missing semanticQuery');
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 3: Obvious hybrid question ---
  await test(
    "3. Obvious hybrid → HYBRID",
    "Which authentication tasks are still in the To Do list?",
    (plan) => {
      if (plan.intent !== 'HYBRID') throw new Error(`Expected HYBRID, got ${plan.intent}`);
      if (!plan.semanticQuery) throw new Error('Missing semanticQuery for HYBRID');
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 4: Overdue query → STRUCTURED ---
  await test(
    "4. Overdue query → STRUCTURED",
    "Which cards are overdue?",
    (plan) => {
      if (plan.intent !== 'STRUCTURED') throw new Error(`Expected STRUCTURED, got ${plan.intent}`);
      if (plan.structuredOperation !== 'OVERDUE_CARDS') throw new Error(`Expected OVERDUE_CARDS, got ${plan.structuredOperation}`);
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 5: Topic query → SEMANTIC ---
  await test(
    "5. Semantic topic → SEMANTIC",
    "Find cards discussing payment integration",
    (plan) => {
      if (plan.intent !== 'SEMANTIC') throw new Error(`Expected SEMANTIC, got ${plan.intent}`);
      if (!plan.semanticQuery) throw new Error('Missing semanticQuery');
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 6: Semantic + list constraint → HYBRID ---
  await test(
    "6. Semantic + list constraint → HYBRID",
    "Which security-related tasks are in the Done list?",
    (plan) => {
      if (plan.intent !== 'HYBRID') throw new Error(`Expected HYBRID, got ${plan.intent}`);
      if (!plan.semanticQuery) throw new Error('Missing semanticQuery');
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 7: Semantic + member constraint → HYBRID ---
  await test(
    "7. Semantic + member constraint → HYBRID",
    "Which payment cards are assigned to John?",
    (plan) => {
      if (plan.intent !== 'HYBRID') throw new Error(`Expected HYBRID, got ${plan.intent}`);
      if (!plan.semanticQuery) throw new Error('Missing semanticQuery');
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 8: Invalid input is safely rejected (no LLM calls needed) ---
  try {
    console.log("Test: 8. Invalid input safely rejected");
    let caught = false;
    try { await classifyQuestion({ boardId: BOARD_ID, question: '' }); } catch (e) { caught = true; }
    if (!caught) throw new Error('Empty question should throw');
    console.log("  Empty question: rejected ✓");

    caught = false;
    try { await classifyQuestion({ boardId: null, question: 'test' }); } catch (e) { caught = true; }
    if (!caught) throw new Error('Null boardId should throw');
    console.log("  Null boardId: rejected ✓");

    caught = false;
    try { await classifyQuestion({ boardId: BOARD_ID, question: '   ' }); } catch (e) { caught = true; }
    if (!caught) throw new Error('Whitespace-only question should throw');
    console.log("  Whitespace question: rejected ✓");

    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 9: BoardId remains explicit and cannot be overridden ---
  await test(
    "9. BoardId cannot be overridden by question",
    "Show me cards from board xyz-fake-id about deployment",
    (plan) => {
      if (plan.boardId !== BOARD_ID) throw new Error(`BoardId was overridden! Got ${plan.boardId}`);
    }
  );
  await wait(RATE_LIMIT_DELAY);

  // --- Test 10: Semantic limit is bounded ---
  try {
    console.log("Test: 10. Semantic limit is bounded");
    const plan = await classifyQuestion({ boardId: BOARD_ID, question: "cards about testing", semanticLimit: 999 });
    if (plan.semanticLimit > 20) throw new Error(`Limit not capped: ${plan.semanticLimit}`);
    console.log(`  Requested 999, got ${plan.semanticLimit}`);

    await wait(RATE_LIMIT_DELAY);

    const plan2 = await classifyQuestion({ boardId: BOARD_ID, question: "cards about testing", semanticLimit: -5 });
    if (plan2.semanticLimit < 1) throw new Error(`Limit below minimum: ${plan2.semanticLimit}`);
    console.log(`  Requested -5, got ${plan2.semanticLimit}`);

    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  console.log("=== RESULTS ===");
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
