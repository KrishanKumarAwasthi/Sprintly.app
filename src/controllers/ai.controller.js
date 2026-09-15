const aiService = require('../services/ai.service');
const routerService = require('../services/retrieval-router.service');
const executionService = require('../services/retrieval-execution.service');
const answerGenService = require('../services/answer-generation.service');

exports.searchSimilarCards = async (req, res) => {
  const { boardId, query, limit } = req.query;

  const results = await aiService.searchSimilarCards({
    boardId,
    query,
    limit: limit ? Number(limit) : undefined,
  });

  res.status(200).json({
    status: 'success',
    results: results.length,
    data: { cards: results },
  });
};

exports.chat = async (req, res) => {
  const { boardId, message } = req.body;
  
  if (!boardId || typeof boardId !== 'string') {
    return res.status(400).json({ status: 'fail', message: 'boardId is required' });
  }
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ status: 'fail', message: 'message is required' });
  }

  try {
    // 1. Classify Intent
    const plan = await routerService.classifyQuestion({ boardId, question: message });
    
    // 2. Execute Retrieval
    const retrievalResult = await executionService.executeRetrievalPlan(plan);
    
    if (retrievalResult.error) {
       // Caught errors in execution (like invalid board member lookup)
       return res.status(400).json({ status: 'fail', message: retrievalResult.error });
    }

    // 3. Generate Answer
    const { answer } = await answerGenService.generateBoardAnswer({
      question: message,
      retrievalResult
    });

    res.status(200).json({
      status: 'success',
      data: { answer, intent: plan.intent }
    });
  } catch (error) {
    console.error("[AI Chat Endpoint Error]", error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process AI chat request' // generic message to not leak details
    });
  }
};
