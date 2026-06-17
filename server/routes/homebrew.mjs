import { Router } from 'express';
import { requireAnyGmToken } from '../auth.mjs';
import {
  listHomebrewEntries,
  getHomebrewEntry,
  createHomebrewEntry,
  updateHomebrewEntry,
  deleteHomebrewEntry
} from '../homebrew.mjs';

const router = Router();

router.get('/', (req, res) => {
  const entries = listHomebrewEntries({
    category: req.query.category,
    search: req.query.search,
    sourceBook: req.query.sourceBook,
    limit: req.query.limit ? Number(req.query.limit) : undefined
  });
  res.json({ entries });
});

router.get('/:id', (req, res) => {
  const entry = getHomebrewEntry(req.params.id);
  if (!entry) {
    res.status(404).json({ error: 'Homebrew entry not found.' });
    return;
  }
  res.json(entry);
});

router.post('/', requireAnyGmToken, (req, res) => {
  try {
    const entry = createHomebrewEntry(req.body ?? {});
    res.status(201).json(entry);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Create failed.' });
  }
});

router.put('/:id', requireAnyGmToken, (req, res) => {
  try {
    const entry = updateHomebrewEntry(req.params.id, req.body ?? {});
    res.json(entry);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Update failed.' });
  }
});

router.delete('/:id', requireAnyGmToken, (req, res) => {
  const ok = deleteHomebrewEntry(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Homebrew entry not found.' });
    return;
  }
  res.status(204).end();
});

export default router;
