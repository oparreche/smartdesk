import pino from 'pino';
import { env } from './env';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'smartdesk' },
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'authorization',
      'apiKey',
      'refresh_token',
      'access_token',
      'refreshToken',
      'accessToken',
      '*.password',
      '*.token',
      '*.secret',
      '*.authorization',
      '*.apiKey',
      '*.refresh_token',
      '*.access_token',
      'headers.authorization',
      'headers.cookie',
      'headers["x-api-key"]',
      'headers["x-auth-token"]',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service',
        },
      }
    : undefined,
});

export type Logger = typeof logger;
