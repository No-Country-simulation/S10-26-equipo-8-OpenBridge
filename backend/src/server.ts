import { createApp } from './app.js';
import { createDb } from './db/client.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL: copiá backend/.env.example a backend/.env');

const port = Number(process.env.PORT) || 4000;
const { db } = createDb(url);

createApp({ db }).listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
