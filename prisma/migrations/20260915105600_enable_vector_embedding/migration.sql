-- Create extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "CardEmbedding" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardEmbedding_cardId_key" ON "CardEmbedding"("cardId");

-- AddForeignKey
ALTER TABLE "CardEmbedding" ADD CONSTRAINT "CardEmbedding_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
