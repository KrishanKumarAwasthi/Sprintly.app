const express = require('express');
const { z } = require('zod');
const aiController = require('../controllers/ai.controller');
const validateRequest = require('../middlewares/validateRequest');

const router = express.Router();

const searchSimilarCardsSchema = z.object({
  query: z.object({
    boardId: z.string().uuid('Invalid Board ID format'),
    query: z.string().min(1, 'Search query cannot be empty'),
    limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional(),
  }),
  params: z.object({}),
  body: z.object({}),
});

const chatSchema = z.object({
  body: z.object({
    boardId: z.string().uuid('Invalid Board ID format'),
    message: z.string().min(1, 'Message cannot be empty'),
  }),
  params: z.object({}),
  query: z.object({}),
});

router
  .route('/search')
  .get(validateRequest(searchSimilarCardsSchema), aiController.searchSimilarCards);

router
  .route('/chat')
  .post(validateRequest(chatSchema), aiController.chat);

module.exports = router;
