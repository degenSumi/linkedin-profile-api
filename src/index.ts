import { Hono } from 'hono';
import { createApp } from './api/app.js';
import { buildContainer } from './container.js';

// Vercel's zero-config Hono detection scans the entrypoint for a direct `hono`
// import, which the OpenAPIHono app alone does not provide.
const app = new Hono();
app.route('/', createApp(buildContainer()));

export default app;
