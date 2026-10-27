import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import cvRoutes from './routes/cv.js';
import jobRoutes from './routes/jobs.js';
import aiRoutes from './routes/ai.js';
import applicationRoutes from './routes/applications.js';
import exportRoutes from './routes/export.js';
import alertRoutes from './routes/alerts.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 4000;

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4000',
  'http://localhost:4001'
];
const extraOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: [...defaultOrigins, ...extraOrigins],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/alerts', alertRoutes);

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`JobFlow API running on port ${PORT}`);
  startScheduler();
});

export default app;