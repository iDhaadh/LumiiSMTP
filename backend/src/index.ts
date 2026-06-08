import 'dotenv/config';
import app from './api/app';
import { startSmtpServers } from './smtp/server';
import { logger } from './db/logger';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen(PORT, () => {
  logger.info(`REST API listening on port ${PORT}`);
});

startSmtpServers();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});
