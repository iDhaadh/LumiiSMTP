import fs from 'fs';
import { SMTPServer } from 'smtp-server';
import { authenticateApiKey, authenticateSmtpCredentials } from './auth';
import { handleEmailData } from './session';
import { logger } from '../db/logger';

function buildTlsOptions() {
  const certPath = process.env.SMTP_TLS_CERT;
  const keyPath = process.env.SMTP_TLS_KEY;
  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  }
  return undefined;
}

function createSmtpServer(options: {
  secure: boolean;
  hideSTARTTLS?: boolean;
  port: number;
}) {
  const tls = buildTlsOptions();

  const server = new SMTPServer({
    secure: options.secure,
    hideSTARTTLS: options.hideSTARTTLS ?? !tls,
    ...(tls ? { key: tls.key, cert: tls.cert } : {}),
    authMethods: ['PLAIN', 'LOGIN'],
    allowInsecureAuth: true,

    onAuth(auth, _session, callback) {
      const { username, password } = auth;

      const tryAuth = async () => {
        let userId: string | null = null;

        if (username === 'apikey' || username === 'api') {
          userId = await authenticateApiKey(password);
        } else {
          userId = await authenticateSmtpCredentials(username, password);
          if (!userId) {
            userId = await authenticateApiKey(password);
          }
        }

        if (!userId) {
          return callback(new Error('Invalid credentials'));
        }
        callback(null, { user: userId });
      };

      tryAuth().catch((err) => callback(err));
    },

    onData(stream, session, callback) {
      const userId = session.user as string;

      handleEmailData(userId, stream, session as any)
        .then(() => callback())
        .catch((err) => {
          logger.error('SMTP onData error', err);
          callback(err);
        });
    },

    onError(err) {
      logger.error('SMTP server error', err);
    },
  });

  server.listen(options.port, () => {
    logger.info(`SMTP server listening on port ${options.port} (${options.secure ? 'SSL' : 'STARTTLS/plain'})`);
  });

  return server;
}

export function startSmtpServers() {
  const tls = buildTlsOptions();

  // Port 25 — plain / STARTTLS
  createSmtpServer({ secure: false, port: 25 });

  // Port 587 — STARTTLS submission
  createSmtpServer({ secure: false, port: 587 });

  // Port 465 — implicit TLS (only if certs are available)
  if (tls) {
    createSmtpServer({ secure: true, port: 465 });
  } else {
    logger.warn('TLS certs not configured — port 465 (SMTPS) disabled');
  }
}
