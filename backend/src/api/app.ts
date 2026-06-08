import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './middleware/auth';
import authRouter from './routes/auth';
import emailRouter from './routes/email';
import domainsRouter from './routes/domains';
import apikeysRouter from './routes/apikeys';
import webhooksRouter from './routes/webhooks';
import suppressionsRouter from './routes/suppressions';
import smtpUsersRouter from './routes/smtpUsers';
import adminRouter from './routes/admin';
import trackingRouter from './routes/tracking';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? '*' }));
app.use(express.json({ limit: '10mb' }));

// Global rate limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Public routes
app.use('/api/v1/auth', authRouter);

// Tracking routes (no auth — accessed by email clients)
app.use('/t', trackingRouter);

// Protected routes
app.use('/api/v1/email', requireAuth, emailRouter);
app.use('/api/v1/domains', requireAuth, domainsRouter);
app.use('/api/v1/apikeys', requireAuth, apikeysRouter);
app.use('/api/v1/webhooks', requireAuth, webhooksRouter);
app.use('/api/v1/suppressions', requireAuth, suppressionsRouter);
app.use('/api/v1/smtp-users', requireAuth, smtpUsersRouter);
app.use('/api/v1/admin', requireAuth, adminRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
