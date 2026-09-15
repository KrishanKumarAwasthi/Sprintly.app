require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cardService = require('../src/services/card.service');
const listService = require('../src/services/list.service');
const labelService = require('../src/services/label.service');
const memberService = require('../src/services/member.service');
const checklistService = require('../src/services/checklist.service');
const aiService = require('../src/services/ai.service');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTests() {
  console.log("Starting Phase 4 Tests...\n");

  // Setup: Create board and lists
  const board = await prisma.board.create({ data: { title: "Test Board" } });
  const listA = await listService.createList(board.id, "List A", 1000);
  const listB = await listService.createList(board.id, "List B", 2000);

  try {
    console.log("1. Test create card -> embedding created");
    const card = await cardService.createCard({ listId: listA.id, title: "Test Card", position: 1000 });
    await wait(5000); // wait for async sync
    let embedding = await prisma.cardEmbedding.findUnique({ where: { cardId: card.id } });
    if (!embedding) throw new Error("Embedding not created!");
    console.log("✅ Create card embedded successfully");

    let lastUpdatedAt = embedding.updatedAt;

    console.log("2. Test update title/description -> embedding updated");
    await cardService.updateCard(card.id, { description: "New Description" });
    await wait(5000);
    embedding = await prisma.cardEmbedding.findUnique({ where: { cardId: card.id } });
    if (embedding.updatedAt <= lastUpdatedAt) throw new Error("Embedding not updated after description change!");
    console.log("✅ Update card embedded successfully");
    lastUpdatedAt = embedding.updatedAt;

    console.log("3. Test move card -> embedding updated");
    await cardService.moveCard(card.id, listA.id, listB.id, 0);
    await wait(5000);
    embedding = await prisma.cardEmbedding.findUnique({ where: { cardId: card.id } });
    if (embedding.updatedAt <= lastUpdatedAt) throw new Error("Embedding not updated after moving list!");
    console.log("✅ Move card embedded successfully");
    lastUpdatedAt = embedding.updatedAt;

    console.log("4. Test label change -> embedding updated");
    const label = await labelService.createLabel({ name: "Urgent", color: "red" });
    await cardService.addLabel(card.id, label.id);
    await wait(5000);
    embedding = await prisma.cardEmbedding.findUnique({ where: { cardId: card.id } });
    if (embedding.updatedAt <= lastUpdatedAt) throw new Error("Embedding not updated after label change!");
    console.log("✅ Label change embedded successfully");
    lastUpdatedAt = embedding.updatedAt;

    console.log("5. Test member change -> embedding updated");
    const member = await memberService.createMember({ name: "Alice" });
    await cardService.assignMember(card.id, member.id);
    await wait(5000);
    embedding = await prisma.cardEmbedding.findUnique({ where: { cardId: card.id } });
    if (embedding.updatedAt <= lastUpdatedAt) throw new Error("Embedding not updated after member change!");
    console.log("✅ Member change embedded successfully");
    lastUpdatedAt = embedding.updatedAt;

    console.log("6. Test checklist change -> embedding updated");
    const checklist = await checklistService.createChecklist(card.id);
    await wait(5000);
    embedding = await prisma.cardEmbedding.findUnique({ where: { cardId: card.id } });
    if (embedding.updatedAt <= lastUpdatedAt) throw new Error("Embedding not updated after checklist creation!");
    console.log("✅ Checklist change embedded successfully");
    lastUpdatedAt = embedding.updatedAt;

    console.log("7. Test delete card -> embedding removed (Cascade)");
    await cardService.deleteCard(card.id);
    await wait(500);
    embedding = await prisma.cardEmbedding.findUnique({ where: { cardId: card.id } });
    if (embedding) throw new Error("Embedding still exists after card deletion!");
    console.log("✅ Card deletion cascaded successfully");

    console.log("8. Test Gemini failure -> primary CRUD still succeeds");
    // Mock the syncCardEmbedding to throw an error intentionally
    const originalSync = aiService.syncCardEmbedding;
    aiService.syncCardEmbedding = async () => { throw new Error("MOCKED GEMINI FAILURE"); };
    
    const card2 = await cardService.createCard({ listId: listA.id, title: "Test Card 2", position: 2000 });
    console.log("✅ Primary CRUD succeeded despite Gemini failure mock");
    
    // Restore mock
    aiService.syncCardEmbedding = originalSync;

    console.log("\nAll tests passed!");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    // Cleanup
    await prisma.board.delete({ where: { id: board.id } });
    await prisma.$disconnect();
  }
}

runTests();
