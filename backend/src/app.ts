import { randomUUID } from 'node:crypto';
import express from 'express';

type DatabaseHealthCheck = () => Promise<void>;

export function createApp(checkDatabase?: DatabaseHealthCheck) {
  const app = express();

  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();

    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        }),
      );
    });

    next();
  });

  app.get('/health', async (_req, res) => {
    try {
      if (!checkDatabase) throw new Error('Database health check is not configured');
      await checkDatabase();
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'health_check_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      res.status(503).json({ status: 'error' });
    }
  });

  return app;
}

export const app = createApp();
