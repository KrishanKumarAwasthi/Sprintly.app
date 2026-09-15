require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { syncCardEmbedding } = require('../src/services/ai.service');

async function main() {
  console.log("Starting backfill for existing cards...");
  
  try {
    const cards = await prisma.card.findMany({
      select: { id: true }
    });

    console.log(`Discovered ${cards.length} cards in the database.`);

    for (let i = 0; i < cards.length; i++) {
      const cardId = cards[i].id;
      console.log(`[${i + 1}/${cards.length}] Processing card ${cardId}...`);
      await syncCardEmbedding(cardId);
      
      // Add a small delay to avoid rate limiting from Gemini API if there are many cards
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const embeddingsCount = await prisma.cardEmbedding.count();

    console.log("\n--- BACKFILL COMPLETE ---");
    console.log(`Total cards discovered: ${cards.length}`);
    console.log(`Total CardEmbedding rows in DB: ${embeddingsCount}`);
  } catch (error) {
    console.error("Fatal error during backfill:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
