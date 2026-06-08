import crypto from 'crypto';
import { Worker, Job } from 'bullmq';
import { redisConnection } from './emailQueue';
import { logger } from '../db/logger';

interface WebhookJob {
  url: string;
  secret: string;
  payload: object;
}

async function processWebhookJob(job: Job<WebhookJob>) {
  const { url, secret, payload } = job.data;
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${sig}`,
    },
    body,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}`);
  }
}

export function startWebhookWorker() {
  const worker = new Worker<WebhookJob>('webhook', processWebhookJob, {
    connection: redisConnection as any,
    concurrency: 20,
  });

  worker.on('failed', (job, err) => {
    logger.warn(`Webhook job ${job?.id} failed: ${err.message}`);
  });

  logger.info('Webhook worker started');
  return worker;
}
