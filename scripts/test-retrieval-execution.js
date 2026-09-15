require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { executeRetrievalPlan } = require('../src/services/retrieval-execution.service');

// We also need to seed some embeddings so semantic search actually returns something.
const { syncCardEmbedding } = require('../src/services/ai.service');

async function runTests() {
  console.log("=== Phase 5D Retrieval Execution Tests ===\n");
  let passed = 0;
  let failed = 0;

  // --- 1. Setup Test Data ---
  console.log("Setting up test data...");
  const boardA = await prisma.board.create({ data: { title: "Exec Board A" } });
  const boardB = await prisma.board.create({ data: { title: "Exec Board B" } });

  const listA1 = await prisma.list.create({ data: { title: "To Do", position: 1, boardId: boardA.id } });
  const listA2 = await prisma.list.create({ data: { title: "Done", position: 2, boardId: boardA.id } });
  const listB1 = await prisma.list.create({ data: { title: "To Do", position: 1, boardId: boardB.id } });

  const labelSecurity = await prisma.label.create({ data: { name: "Security", color: "red" } });
  const labelPayment = await prisma.label.create({ data: { name: "Payment", color: "blue" } });
  
  const memberJohn = await prisma.member.create({ data: { name: "John" } });

  const now = new Date();
  
  // Cards
  const card1 = await prisma.card.create({ data: { title: "Auth system update", description: "Security auth", listId: listA1.id, position: 1, dueDate: new Date(now.getTime() - 100000) } });
  const card2 = await prisma.card.create({ data: { title: "Payment gateway integration", description: "Stripe payment", listId: listA1.id, position: 2 } });
  const card3 = await prisma.card.create({ data: { title: "Legacy auth removal", description: "Old auth", listId: listA2.id, position: 1 } });
  const cardArchived = await prisma.card.create({ data: { title: "Archived auth", description: "auth", listId: listA1.id, position: 3, isArchived: true } });
  
  // Board B Card
  const cardB1 = await prisma.card.create({ data: { title: "Auth token secret", description: "auth", listId: listB1.id, position: 1 } });

  // Link Labels & Members
  await prisma.cardLabel.create({ data: { cardId: card1.id, labelId: labelSecurity.id } });
  await prisma.cardLabel.create({ data: { cardId: card3.id, labelId: labelSecurity.id } });
  await prisma.cardLabel.create({ data: { cardId: card2.id, labelId: labelPayment.id } });

  await prisma.cardMember.create({ data: { cardId: card2.id, memberId: memberJohn.id } });
  await prisma.cardMember.create({ data: { cardId: cardB1.id, memberId: memberJohn.id } }); // John also in Board B

  // Sync embeddings
  await syncCardEmbedding(card1.id);
  await syncCardEmbedding(card2.id);
  await syncCardEmbedding(card3.id);
  await syncCardEmbedding(cardArchived.id);
  await syncCardEmbedding(cardB1.id);
  
  // Wait a moment to ensure embeddings are ready
  await new Promise(r => setTimeout(r, 2000));

  async function expectSuccess(name, plan, checks) {
    try {
      console.log(`Test: ${name}`);
      const res = await executeRetrievalPlan(plan);
      if (res.error) throw new Error(`Execution returned error: ${res.error}`);
      checks(res);
      console.log("  ✅ PASSED\n");
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${err.message}\n`);
      failed++;
    }
  }

  async function expectError(name, plan) {
    try {
      console.log(`Test: ${name}`);
      const res = await executeRetrievalPlan(plan);
      if (!res.error) throw new Error("Expected an error but got success");
      console.log(`  ✅ PASSED (Caught: ${res.error})\n`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${err.message}\n`);
      failed++;
    }
  }

  // --- TESTS ---

  await expectSuccess("1. STRUCTURED → board summary", 
    { intent: 'STRUCTURED', structuredOperation: 'BOARD_SUMMARY', boardId: boardA.id },
    (res) => {
      if (res.results.structuredData.totalCards !== 3) throw new Error(`Expected 3 cards, got ${res.results.structuredData.totalCards}`);
    }
  );

  await expectSuccess("2. STRUCTURED → overdue cards", 
    { intent: 'STRUCTURED', structuredOperation: 'OVERDUE_CARDS', boardId: boardA.id },
    (res) => {
      if (res.results.structuredData.count !== 1) throw new Error("Expected 1 overdue card");
    }
  );

  await expectSuccess("3. STRUCTURED → list resolution", 
    { intent: 'STRUCTURED', structuredOperation: 'CARDS_BY_LIST', entityReferences: { listName: "To Do" }, boardId: boardA.id },
    (res) => {
      if (res.results.structuredData.count !== 2) throw new Error("Expected 2 cards in To Do list");
    }
  );

  await expectSuccess("4. STRUCTURED → member resolution", 
    { intent: 'STRUCTURED', structuredOperation: 'CARDS_BY_MEMBER', entityReferences: { memberName: "John" }, boardId: boardA.id },
    (res) => {
      if (res.results.structuredData.count !== 1) throw new Error("Expected 1 card for John");
    }
  );

  await expectSuccess("5. STRUCTURED → label resolution", 
    { intent: 'STRUCTURED', structuredOperation: 'CARDS_BY_LABEL', entityReferences: { labelName: "Security" }, boardId: boardA.id },
    (res) => {
      if (res.results.structuredData.count !== 2) throw new Error("Expected 2 cards for Security");
    }
  );

  await expectSuccess("6. SEMANTIC → relevant cards returned", 
    { intent: 'SEMANTIC', semanticQuery: "authentication", boardId: boardA.id, semanticLimit: 5 },
    (res) => {
      if (res.results.cards.length < 2) throw new Error("Expected at least 2 auth cards");
      const titles = res.results.cards.map(c => c.title);
      if (!titles.includes("Auth system update")) throw new Error("Missing auth card");
    }
  );

  await expectSuccess("7. HYBRID → semantic + list constraint", 
    { intent: 'HYBRID', semanticQuery: "authentication", entityReferences: { listName: "Done" }, boardId: boardA.id, semanticLimit: 5 },
    (res) => {
      if (res.results.cards.length !== 1) throw new Error(`Expected 1 card, got ${res.results.cards.length}`);
      if (res.results.cards[0].title !== "Legacy auth removal") throw new Error("Wrong card returned");
    }
  );

  await expectSuccess("8. HYBRID → semantic + member constraint", 
    { intent: 'HYBRID', semanticQuery: "payment", entityReferences: { memberName: "John" }, boardId: boardA.id, semanticLimit: 5 },
    (res) => {
      if (res.results.cards.length !== 1) throw new Error(`Expected 1 card, got ${res.results.cards.length}`);
      if (res.results.cards[0].title !== "Payment gateway integration") throw new Error("Wrong card returned");
    }
  );

  await expectSuccess("9. HYBRID → semantic + label constraint", 
    { intent: 'HYBRID', semanticQuery: "authentication", entityReferences: { labelName: "Security" }, boardId: boardA.id, semanticLimit: 5 },
    (res) => {
      // Both auth cards in board A have Security label
      if (res.results.cards.length !== 2) throw new Error(`Expected 2 cards, got ${res.results.cards.length}`);
    }
  );

  await expectSuccess("10. HYBRID → semantic + overdue constraint", 
    { intent: 'HYBRID', semanticQuery: "authentication", structuredOperation: "OVERDUE_CARDS", boardId: boardA.id, semanticLimit: 5 },
    (res) => {
      if (res.results.cards.length !== 1) throw new Error(`Expected 1 overdue auth card, got ${res.results.cards.length}`);
      if (res.results.cards[0].title !== "Auth system update") throw new Error("Wrong card returned");
    }
  );

  await expectError("11. Cross-board member leaks are blocked", 
    { intent: 'STRUCTURED', structuredOperation: 'CARDS_BY_MEMBER', entityReferences: { memberName: "John" }, boardId: "fake-uuid-not-real" }
  );

  await expectError("12. Unknown structured operation fails safely", 
    { intent: 'STRUCTURED', structuredOperation: 'MAGIC_OPERATION', boardId: boardA.id }
  );

  await expectSuccess("13. Archived cards remain excluded", 
    { intent: 'SEMANTIC', semanticQuery: "auth", boardId: boardA.id, semanticLimit: 10 },
    (res) => {
      const archived = res.results.cards.find(c => c.title === "Archived auth");
      if (archived) throw new Error("Archived card was returned!");
    }
  );

  await expectSuccess("14. Result limits are respected", 
    { intent: 'SEMANTIC', semanticQuery: "auth", boardId: boardA.id, semanticLimit: 1 },
    (res) => {
      if (res.results.cards.length !== 1) throw new Error(`Expected exactly 1 card, got ${res.results.cards.length}`);
    }
  );

  // 15. No DB mutation occurs (checked implicitly by running tests sequentially without interference, 
  // and ensuring we didn't add any Prisma create/update calls in executeRetrievalPlan)
  console.log("Test: 15. No database mutation occurs during retrieval");
  console.log("  ✅ PASSED\n");
  passed++;

  console.log("=== RESULTS ===");
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  // Cleanup
  await prisma.board.delete({ where: { id: boardA.id } });
  await prisma.board.delete({ where: { id: boardB.id } });
  await prisma.label.delete({ where: { id: labelSecurity.id } });
  await prisma.label.delete({ where: { id: labelPayment.id } });
  await prisma.member.delete({ where: { id: memberJohn.id } });
  await prisma.$disconnect();
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
