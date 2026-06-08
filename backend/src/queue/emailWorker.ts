import { Worker, Job } from 'bullmq';
import { prisma } from '../db/client';
import { logger } from '../db/logger';
import { redisConnection } from './emailQueue';
import { EmailJobData, processEmailJobData } from './emailProcessor';

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>('email', (job: Job<EmailJobData>) => processEmailJobData(job.data), {
    connection: redisConnection,
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.info(`Email job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed: ${err.message}`);
    if (job) {
      prisma.email
        .update({ where: { id: job.data.emailId }, data: { status: 'FAILED' } })
        .catch(() => {});
    }
  });

  logger.info('Email worker started');
  return worker;
}
