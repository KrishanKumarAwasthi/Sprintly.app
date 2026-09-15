const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { syncCardEmbedding } = require('../src/services/ai.service');

async function main() {
  console.log('--- Starting Vector Validation ---');
  
  // 1. Count active cards
  const totalCards = await prisma.card.count({
    where: { isArchived: false }
  });
  console.log(`Total active cards: ${totalCards}`);

  // 2. Count embeddings
  // We can just join or count
  const totalEmbeddings = await prisma.cardEmbedding.count({
    where: {
      card: { isArchived: false }
    }
  });
  console.log(`Total active card embeddings: ${totalEmbeddings}`);

  // 3. Find missing embeddings
  const cardsWithoutEmbeddings = await prisma.card.findMany({
    where: {
      isArchived: false,
      embedding: null
    },
    select: { id: true, title: true }
  });

  if (cardsWithoutEmbeddings.length > 0) {
    console.log(`Found ${cardsWithoutEmbeddings.length} active cards missing embeddings. Syncing now...`);
    for (const card of cardsWithoutEmbeddings) {
      console.log(`Syncing embedding for card: ${card.title} (${card.id})`);
      try {
        await syncCardEmbedding(card.id);
        console.log(` - Success`);
      } catch (err) {
        console.error(` - Failed: ${err.message}`);
      }
    }
  } else {
    console.log('All active cards have embeddings. 1:1 ratio is healthy.');
  }

  // 4. Find orphan embeddings (embeddings without a card, or an archived card)
  const orphans = await prisma.cardEmbedding.findMany({
    where: {
      card: { isArchived: true }
    },
    select: { id: true, cardId: true }
  });

  if (orphans.length > 0) {
    console.log(`Found ${orphans.length} orphan/archived embeddings. They should have been cleaned up by cascade or are intentionally kept but ignored in search. We can delete them to save space.`);
    for (const orphan of orphans) {
      await prisma.cardEmbedding.delete({ where: { id: orphan.id } });
      console.log(` - Deleted orphan embedding ${orphan.id} for card ${orphan.cardId}`);
    }
  } else {
    console.log('No orphan embeddings found.');
  }

  console.log('--- Vector Validation Complete ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
