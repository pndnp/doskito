import { buildApp } from './app.js';

const app = buildApp();
const port = Number(process.env.PORT ?? 3001);

async function start() {
  try {
    await app.listen({ host: '0.0.0.0', port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

await start();
