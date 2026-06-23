import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import campaignsRouter from './routes/campaigns.mjs';
import homebrewRouter from './routes/homebrew.mjs';
import sourceBooksRouter from './routes/source-books.mjs';
import feedbackRouter from './routes/feedback.mjs';
import { getDb } from './db.mjs';
import { compendiumUsesSqlite } from './compendium.mjs';

const PORT = Number(process.env.PORT) || 3000;
const app = express();

getDb();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '512kb' }));

// Rate limit only the API; static assets must not be throttled.
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_PER_MIN) || 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'alter-ego-campaign-api',
    compendium: compendiumUsesSqlite() ? 'sqlite' : 'stub'
  });
});

app.use('/api/campaigns', campaignsRouter);
app.use('/api/homebrew', homebrewRouter);
app.use('/api/source-books', sourceBooksRouter);
app.use('/api/feedback', feedbackRouter);

// Optional single-container hosting: serve the built frontend and public data
// from this same Node process (same-origin, no CORS). Enabled by setting
// STATIC_DIR to the built app directory (e.g. /app/dist/app). PUBLIC_DATA_DIR,
// if set, is exposed at /data and should ONLY contain public files such as the
// compendium DB (alter_eger.db) and samples - never campaigns.db.
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const publicDataDir = process.env.PUBLIC_DATA_DIR;
  if (publicDataDir) {
    app.use('/data', express.static(publicDataDir));
  }
  app.use(express.static(staticDir, { extensions: ['html'] }));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Alter Ego campaign API listening on http://localhost:${PORT}`);
});
