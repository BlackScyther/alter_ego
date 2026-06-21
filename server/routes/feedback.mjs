import { Router } from 'express';
import crypto from 'crypto';
import { requireAnyGmToken } from '../auth.mjs';
import {
  insertFeedback,
  getFeedback,
  listFeedback,
  getFeedbackStats,
  updateFeedbackStatus,
  deleteFeedback
} from '../db.mjs';
import { prepareFeedback, FEEDBACK_STATUSES } from '../validate-feedback.mjs';

const router = Router();

// Public: anyone (player or GM) may submit feedback.
router.post('/', (req, res) => {
  try {
    const record = prepareFeedback(req.body ?? {}, {
      userAgent: req.headers['user-agent']
    });
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    insertFeedback({ id, createdAt, ...record });
    res.status(201).json({ id, createdAt, status: 'open', ...record });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Submit failed.' });
  }
});

// GM only: list, stats, manage.
router.get('/', requireAnyGmToken, (req, res) => {
  const entries = listFeedback({
    category: req.query.category,
    status: req.query.status,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined
  });
  res.json({ entries });
});

router.get('/stats', requireAnyGmToken, (_req, res) => {
  res.json(getFeedbackStats());
});

router.patch('/:id', requireAnyGmToken, (req, res) => {
  const status = req.body?.status;
  if (!FEEDBACK_STATUSES.includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  const ok = updateFeedbackStatus(req.params.id, status);
  if (!ok) {
    res.status(404).json({ error: 'Feedback entry not found.' });
    return;
  }
  res.json(getFeedback(req.params.id));
});

router.delete('/:id', requireAnyGmToken, (req, res) => {
  const ok = deleteFeedback(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Feedback entry not found.' });
    return;
  }
  res.status(204).end();
});

export default router;
