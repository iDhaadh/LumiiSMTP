import { logger } from '../db/logger';
import { EmailJobData, processEmailJobData } from './emailProcessor';

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export async function dispatchEmail(data: EmailJobData): Promise<void> {
  if (process.env.QUEUE_ENABLED === 'false') {
    // Dev mode: process immediately in-process, no Redis needed
    setImmediate(() => {
      processEmailJobData(data).catch((err) => {
        logger.error(`Direct email send failed for ${data.emailId}: ${err.message}`);
      });
    });
    return;
  }

  // Production mode: push to BullMQ (requires Redis >= 5)
  const { emailQueue } = await import('./emailQueue');
  await emailQueue.add('send', data, JOB_OPTIONS);
}
