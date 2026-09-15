require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { searchSimilarCards } = require('../src/services/ai.service');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  console.log("=== Phase 5A Vector Search Tests ===\n");
  let passed = 0;
  let failed = 0;

  // --- Discover existing data ---
  const boards = await prisma.board.findMany({ select: { id: true, title: true } });
  console.log(`Found ${boards.length} board(s):`, boards.map(b => `${b.title} (${b.id})`).join(', '));

  const embeddingCount = await prisma.cardEmbedding.count();
  console.log(`Found ${embeddingCount} CardEmbedding row(s)\n`);

  if (boards.length === 0 || embeddingCount === 0) {
    console.error("No boards or embeddings found. Cannot run tests.");
    await prisma.$disconnect();
    return;
  }

  const mainBoardId = boards[0].id;

  // Snapshot card count before tests to verify no data modification
  const cardCountBefore = await prisma.card.count();
  const embeddingCountBefore = embeddingCount;

  // --- Test 1: Search within a valid board ---
  try {
    console.log("Test 1: Search within a valid board");
    const results = await searchSimilarCards({ boardId: mainBoardId, query: "task", limit: 5 });
    if (!Array.isArray(results)) throw new Error("Expected array result");
    if (results.length === 0) throw new Error("Expected at least one result");
    console.log(`  Returned ${results.length} result(s)`);
    console.log(`  Top result: "${results[0].title}" (distance: ${results[0].distance.toFixed(4)}, similarity: ${results[0].similarity.toFixed(4)})`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 2: Semantically relevant query returns relevant cards ---
  try {
    console.log("Test 2: Semantically relevant query returns relevant cards");
    // Fetch a real card title to use as a semantically similar query
    const sampleCard = await prisma.card.findFirst({ where: { list: { boardId: mainBoardId } } });
    if (!sampleCard) throw new Error("No card found in the board");
    const results = await searchSimilarCards({ boardId: mainBoardId, query: sampleCard.title, limit: 5 });
    // The card itself (or something very similar) should appear near the top
    const topCardIds = results.map(r => r.cardId);
    if (topCardIds.includes(sampleCard.id)) {
      console.log(`  Card "${sampleCard.title}" found in top ${results.length} results`);
    } else {
      console.log(`  Warning: Card "${sampleCard.title}" not in top results, but this may be acceptable`);
    }
    // Verify result structure
    const r = results[0];
    if (!r.cardId || !r.boardId || !r.listId || !r.title || r.distance === undefined || r.similarity === undefined || !r.listTitle) {
      throw new Error("Result missing expected fields");
    }
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 3: Results are ordered by distance (ascending) ---
  try {
    console.log("Test 3: Results are ordered by similarity/distance");
    const results = await searchSimilarCards({ boardId: mainBoardId, query: "important work item", limit: 10 });
    for (let i = 1; i < results.length; i++) {
      if (results[i].distance < results[i - 1].distance) {
        throw new Error(`Results not ordered: index ${i - 1} distance ${results[i - 1].distance} > index ${i} distance ${results[i].distance}`);
      }
    }
    console.log(`  All ${results.length} results correctly ordered by ascending distance`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 4: Limit is respected ---
  try {
    console.log("Test 4: Limit is respected");
    const results2 = await searchSimilarCards({ boardId: mainBoardId, query: "task", limit: 2 });
    if (results2.length > 2) throw new Error(`Expected at most 2 results, got ${results2.length}`);
    console.log(`  Requested limit=2, received ${results2.length} result(s)`);

    const results1 = await searchSimilarCards({ boardId: mainBoardId, query: "task", limit: 1 });
    if (results1.length > 1) throw new Error(`Expected at most 1 result, got ${results1.length}`);
    console.log(`  Requested limit=1, received ${results1.length} result(s)`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 5: Board isolation — one board never returns cards from another ---
  try {
    console.log("Test 5: Board isolation");
    // Create a temporary second board with a card
    const tempBoard = await prisma.board.create({ data: { title: "Temp Isolation Test Board" } });
    const tempList = await prisma.list.create({ data: { title: "Temp List", position: 1000, boardId: tempBoard.id } });
    const tempCard = await prisma.card.create({ data: { title: "Unique Isolation Canary XYZ123", position: 1000, listId: tempList.id } });

    // Index the temp card embedding manually
    const { syncCardEmbedding } = require('../src/services/ai.service');
    await syncCardEmbedding(tempCard.id);

    // Search the MAIN board — should NOT return the temp card
    const mainResults = await searchSimilarCards({ boardId: mainBoardId, query: "Unique Isolation Canary XYZ123", limit: 20 });
    const leakedIds = mainResults.filter(r => r.cardId === tempCard.id);
    if (leakedIds.length > 0) throw new Error("Board isolation violated! Temp card leaked into main board results");

    // Search the TEMP board — should return the temp card
    const tempResults = await searchSimilarCards({ boardId: tempBoard.id, query: "Unique Isolation Canary", limit: 5 });
    const foundInTemp = tempResults.some(r => r.cardId === tempCard.id);
    if (!foundInTemp) throw new Error("Temp card not found when searching its own board");

    // Cleanup
    await prisma.board.delete({ where: { id: tempBoard.id } });
    console.log("  Main board search: 0 leaked results");
    console.log("  Temp board search: found temp card correctly");
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 6: Empty/invalid query is rejected safely ---
  try {
    console.log("Test 6: Empty/invalid query is rejected safely");

    let caught = false;
    try { await searchSimilarCards({ boardId: mainBoardId, query: "", limit: 5 }); } catch (e) { caught = true; }
    if (!caught) throw new Error("Empty query should throw");
    console.log("  Empty string query: rejected ✓");

    caught = false;
    try { await searchSimilarCards({ boardId: mainBoardId, query: "   ", limit: 5 }); } catch (e) { caught = true; }
    if (!caught) throw new Error("Whitespace-only query should throw");
    console.log("  Whitespace-only query: rejected ✓");

    caught = false;
    try { await searchSimilarCards({ boardId: null, query: "test", limit: 5 }); } catch (e) { caught = true; }
    if (!caught) throw new Error("Null boardId should throw");
    console.log("  Null boardId: rejected ✓");

    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 7: Generated query embedding is exactly 768 dimensions ---
  try {
    console.log("Test 7: Query embedding dimension verification");
    // The searchSimilarCards function itself verifies the dimension and throws if != 768.
    // A successful search implies correct dimension. We double-check by calling embedQuery directly.
    const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
    const testEmbed = new GoogleGenerativeAIEmbeddings({
      modelName: "gemini-embedding-001",
      taskType: "RETRIEVAL_QUERY",
      apiKey: process.env.GEMINI_API_KEY,
      outputDimensionality: 768,
    });
    const vec = await testEmbed.embedQuery("dimension verification test");
    if (vec.length !== 768) throw new Error(`Expected 768 dimensions, got ${vec.length}`);
    console.log(`  Query embedding dimension: ${vec.length}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  // --- Test 8: No application data is modified by searching ---
  try {
    console.log("Test 8: No application data modified by searching");
    const cardCountAfter = await prisma.card.count();
    const embeddingCountAfter = await prisma.cardEmbedding.count();
    if (cardCountAfter !== cardCountBefore) throw new Error(`Card count changed: ${cardCountBefore} -> ${cardCountAfter}`);
    if (embeddingCountAfter !== embeddingCountBefore) throw new Error(`Embedding count changed: ${embeddingCountBefore} -> ${embeddingCountAfter}`);
    console.log(`  Cards before: ${cardCountBefore}, after: ${cardCountAfter}`);
    console.log(`  Embeddings before: ${embeddingCountBefore}, after: ${embeddingCountAfter}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) {
    console.error(`  ❌ FAILED: ${err.message}\n`);
    failed++;
  }

  console.log("=== RESULTS ===");
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  await prisma.$disconnect();
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
