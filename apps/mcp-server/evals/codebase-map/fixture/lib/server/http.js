// Serves the API over HTTP with the demo data: `npm start`.
import { createServer } from 'node:http';
import { createStore } from '../store/memory-store.js';
import { demoSeed } from '../store/seed.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 8080);

const app = createApp(createStore(demoSeed()));

createServer(async (incoming, outgoing) => {
  let text = '';
  for await (const chunk of incoming) text += chunk;
  const url = new URL(incoming.url, 'http://localhost');
  const response = app.handle({
    method: incoming.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    body: text === '' ? null : JSON.parse(text),
    today: new Date().toISOString().slice(0, 10),
  });
  outgoing.writeHead(response.status, { 'content-type': 'application/json' });
  outgoing.end(JSON.stringify(response.body));
}).listen(PORT);
