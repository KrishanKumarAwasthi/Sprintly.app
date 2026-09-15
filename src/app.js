require('express-async-errors'); // Must be loaded first
const express = require('express');
const cors = require('cors');

const { globalErrorHandler } = require('./middlewares/errorHandler');
const mockAuth = require('./middlewares/mockAuth');

// Import routes
const boardRoutes = require('./routes/board.routes');
const listRoutes = require('./routes/list.routes');
const cardRoutes = require('./routes/card.routes');
const checklistRoutes = require('./routes/checklist.routes');
const labelRoutes = require('./routes/label.routes');
const memberRoutes = require('./routes/member.routes');
const aiRoutes = require('./routes/ai.routes');

const app = express();

app.use(cors());
app.use(express.json());

// Apply mock auth globally
app.use(mockAuth);

// API Versioning routes
app.use('/api/v1/boards', boardRoutes);
app.use('/api/v1/lists', listRoutes);
app.use('/api/v1/cards', cardRoutes);
app.use('/api/v1/checklists', checklistRoutes);
app.use('/api/v1/labels', labelRoutes);
app.use('/api/v1/members', memberRoutes);
app.use('/api/v1/ai', aiRoutes);

// Unhandled routes
app.all('*', (req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server`
  });
});

// Global Error Handler
app.use(globalErrorHandler);

module.exports = app;
