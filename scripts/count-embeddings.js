require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const count = await p.cardEmbedding.count();
  console.log('CardEmbedding rows:', count);
  const cards = await p.card.count();
  console.log('Total cards:', cards);
  await p.$disconnect();
})();
