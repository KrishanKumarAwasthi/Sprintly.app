require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const retrievalService = require('../src/services/structured-retrieval.service');

async function runTests() {
  console.log("=== Phase 5B Structured Retrieval Tests ===\n");
  let passed = 0;
  let failed = 0;

  // --- Setup Temporary Data ---
  const boardA = await prisma.board.create({ data: { title: "Test Board A" } });
  const listA1 = await prisma.list.create({ data: { title: "List A1", position: 1, boardId: boardA.id } });
  const listA2 = await prisma.list.create({ data: { title: "List A2", position: 2, boardId: boardA.id } });
  
  const boardB = await prisma.board.create({ data: { title: "Test Board B (Isolation)" } });
  const listB1 = await prisma.list.create({ data: { title: "List B1", position: 1, boardId: boardB.id } });

  // Cards for Board A
  const card1 = await prisma.card.create({ data: { title: "Card 1", position: 1, listId: listA1.id, dueDate: new Date(Date.now() - 100000) } }); // overdue
  const card2 = await prisma.card.create({ data: { title: "Card 2", position: 2, listId: listA1.id, dueDate: new Date(Date.now() + 100000) } }); // future
  const card3 = await prisma.card.create({ data: { title: "Card 3", position: 1, listId: listA2.id } }); // no due date
  const cardArchived = await prisma.card.create({ data: { title: "Card Archived", position: 2, listId: listA2.id, isArchived: true } });

  // Cards for Board B
  const cardB1 = await prisma.card.create({ data: { title: "Card B1", position: 1, listId: listB1.id, dueDate: new Date(Date.now() - 100000) } }); // overdue

  // Setup Labels & Members
  const label = await prisma.label.create({ data: { name: "Bug", color: "red" } });
  await prisma.cardLabel.create({ data: { cardId: card1.id, labelId: label.id } });
  await prisma.cardLabel.create({ data: { cardId: cardB1.id, labelId: label.id } }); // attach same label to Board B card

  const member = await prisma.member.create({ data: { name: "Alice" } });
  await prisma.cardMember.create({ data: { cardId: card2.id, memberId: member.id } });
  await prisma.cardMember.create({ data: { cardId: cardB1.id, memberId: member.id } });

  // Setup Checklists
  const cl1 = await prisma.checklist.create({ data: { cardId: card1.id } });
  await prisma.checklistItem.create({ data: { content: "Item 1", completed: true, checklistId: cl1.id } });
  await prisma.checklistItem.create({ data: { content: "Item 2", completed: false, checklistId: cl1.id } });
  
  // Try to test
  try {
    console.log("Test 1: Board summary returns correct counts");
    const summary = await retrievalService.getBoardSummary(boardA.id);
    if (summary.totalCards !== 3) throw new Error(`Expected 3 total unarchived cards, got ${summary.totalCards}`);
    if (summary.lists.length !== 2) throw new Error(`Expected 2 lists, got ${summary.lists.length}`);
    const lA1 = summary.lists.find(l => l.listId === listA1.id);
    if (lA1.cardCount !== 2) throw new Error(`Expected 2 cards in List A1, got ${lA1.cardCount}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  try {
    console.log("Test 2: Retrieve cards by list");
    const res = await retrievalService.getCardsByList(boardA.id, listA1.id);
    if (res.count !== 2) throw new Error(`Expected 2 cards, got ${res.count}`);
    const titles = res.cards.map(c => c.title);
    if (!titles.includes("Card 1") || !titles.includes("Card 2")) throw new Error("Missing expected cards");
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  try {
    console.log("Test 3: Overdue cards correctly identified");
    const res = await retrievalService.getOverdueCards(boardA.id);
    if (res.count !== 1) throw new Error(`Expected 1 overdue card in board A, got ${res.count}`);
    if (res.cards[0].title !== "Card 1") throw new Error(`Expected Card 1, got ${res.cards[0].title}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  try {
    console.log("Test 4: Retrieve by member with board isolation");
    const res = await retrievalService.getCardsByMember(boardA.id, member.id);
    if (res.count !== 1) throw new Error(`Expected 1 card for member in board A, got ${res.count}`);
    if (res.cards[0].title !== "Card 2") throw new Error(`Expected Card 2, got ${res.cards[0].title}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  try {
    console.log("Test 5: Retrieve by label with board isolation");
    const res = await retrievalService.getCardsByLabel(boardA.id, label.id);
    if (res.count !== 1) throw new Error(`Expected 1 card for label in board A, got ${res.count}`);
    if (res.cards[0].title !== "Card 1") throw new Error(`Expected Card 1, got ${res.cards[0].title}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  try {
    console.log("Test 6: Checklist statistics are correct");
    const res = await retrievalService.getChecklistStats(boardA.id);
    if (res.totalItems !== 2) throw new Error(`Expected 2 total items, got ${res.totalItems}`);
    if (res.completedItems !== 1) throw new Error(`Expected 1 completed item, got ${res.completedItems}`);
    if (res.completionPercentage !== 50) throw new Error(`Expected 50% completion, got ${res.completionPercentage}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  try {
    console.log("Test 7: Cross-board IDs return no results");
    // Try to get cards from List B1 but using Board A's ID
    const res = await retrievalService.getCardsByList(boardA.id, listB1.id);
    if (res.count !== 0) throw new Error(`Expected 0 results due to isolation, got ${res.count}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  try {
    console.log("Test 8: Archived cards are excluded");
    // CardArchived is in List A2. List A2 has 1 active card (Card 3)
    const res = await retrievalService.getCardsByList(boardA.id, listA2.id);
    if (res.count !== 1) throw new Error(`Expected 1 active card, got ${res.count}`);
    if (res.cards[0].title !== "Card 3") throw new Error(`Expected Card 3, got ${res.cards[0].title}`);
    console.log("  ✅ PASSED\n");
    passed++;
  } catch (err) { console.error(`  ❌ FAILED: ${err.message}\n`); failed++; }

  console.log("=== RESULTS ===");
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  // Cleanup
  await prisma.board.delete({ where: { id: boardA.id } });
  await prisma.board.delete({ where: { id: boardB.id } });
  await prisma.label.delete({ where: { id: label.id } });
  await prisma.member.delete({ where: { id: member.id } });
  await prisma.$disconnect();
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
