import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { corsOrigins, env } from './env';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import errorHandler from './plugins/error-handler';
import { registerRoutes } from './routes';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : { level: 'info' },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // Infra
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(errorHandler);

  // Health check (sem auth)
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // API
  await app.register(registerRoutes, { prefix: '/api' });

  return app;
}
