const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const AppError = require('../utils/AppError');
const { triggerEmbeddingSync } = require('./ai.service');

class MemberService {
  async getAllMembers() {
    return prisma.member.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getMemberById(id) {
    const member = await prisma.member.findUnique({ where: { id } });
    if (!member) throw new AppError('Member not found', 404);
    return member;
  }

  async createMember({ name }) {
    if (!name) throw new AppError('Name is required', 400);

    return prisma.member.create({
      data: { name },
    });
  }

  async deleteMember(id) {
    const member = await prisma.member.findUnique({ where: { id }, include: { cards: { select: { cardId: true } } } });
    if (!member) throw new AppError('Member not found', 404);

    const deletedMember = await prisma.member.delete({ where: { id } });

    member.cards.forEach(cardMember => triggerEmbeddingSync(cardMember.cardId));

    return deletedMember;
  }
}

module.exports = new MemberService();
