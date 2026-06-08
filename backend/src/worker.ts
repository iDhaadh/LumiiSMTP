import 'dotenv/config';
import { startEmailWorker } from './queue/emailWorker';
import { startWebhookWorker } from './queue/webhookWorker';
import { logger } from './db/logger';

startEmailWorker();
startWebhookWorker();

logger.info('Workers running');

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in worker', reason);
});
