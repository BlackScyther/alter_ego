import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import campaignsRouter from './routes/campaigns.mjs';
import { getDb } from './db.mjs';

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

app.use(
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_PER_MIN) || 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'alter-ego-campaign-api' });
});

app.use('/api/campaigns', campaignsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Alter Ego campaign API listening on http://localhost:${PORT}`);
});
