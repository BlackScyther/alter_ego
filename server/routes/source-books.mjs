import { Router } from 'express';
import { requireAnyGmToken } from '../auth.mjs';
import { getSourceBooks, updateSourceBook } from '../source-books.mjs';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ books: getSourceBooks() });
});

router.put('/:code', requireAnyGmToken, (req, res) => {
  try {
    const book = updateSourceBook(req.params.code, req.body ?? {});
    res.json({ code: req.params.code, ...book });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Update failed.' });
  }
});

export default router;
