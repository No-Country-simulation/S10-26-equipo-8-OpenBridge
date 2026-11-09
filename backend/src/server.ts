import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { getDatabaseUrl } from './db/connection.js';

const port = Number(process.env.PORT) || 4000;
const databaseUrl = getDatabaseUrl();
const database = databaseUrl ? createDb(databaseUrl) : undefined;
const app = createApp(
  database ? async () => void (await database.pool.query('SELECT 1')) : undefined,
);

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
