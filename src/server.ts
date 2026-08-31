import { serve } from '@hono/node-server';
import app from './index.js';

// Local only server entry point
// vercels takes index.ts
const port = Number(process.env['PORT'] ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`listening on http://localhost:${info.port} — docs at /docs`);
});
