import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute } from '@hono/zod-openapi';
import { InvalidProfileUrlError } from '../core/errors.js';
import { fromPublicIdentifier, parseProfileUrl } from '../core/profile-url.js';
import type { Container } from '../container.js';
import type { AppEnv } from './middleware.js';
import { apiKeyAuth, rateLimit } from './middleware.js';
import {
  ErrorResponseSchema,
  HealthResponseSchema,
  ProfileQuerySchema,
  ProfileResponseSchema,
  toProfileResponse,
} from './schema.js';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorResponseSchema } },
});

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Service health and configuration state',
  responses: {
    200: {
      description: 'Service is reachable',
      content: { 'application/json': { schema: HealthResponseSchema } },
    },
  },
});

const profileRoute = createRoute({
  method: 'get',
  path: '/v1/profile',
  summary: 'Fetch a LinkedIn profile as structured JSON',
  request: { query: ProfileQuerySchema },
  security: [{ apiKey: [] }],
  responses: {
    200: {
      description: 'Profile data',
      content: { 'application/json': { schema: ProfileResponseSchema } },
    },
    400: errorResponse('The supplied URL or username is not a LinkedIn profile'),
    401: errorResponse('Missing or invalid API key'),
    404: errorResponse('No such profile'),
    429: errorResponse('Rate limit exceeded'),
    502: errorResponse('Every upstream source failed or LinkedIn blocked the request'),
    503: errorResponse('The deployment has no usable LinkedIn session'),
  },
});

export function registerRoutes(app: OpenAPIHono<AppEnv>, container: Container): void {
  app.openapi(healthRoute, (c) =>
    c.json({
      status: 'ok' as const,
      authRequired: !container.config.DISABLE_AUTH,
      sessionConfigured: container.sessionConfigured,
      sources: [...container.sources],
    }),
  );

  const guards = container.config.DISABLE_AUTH
    ? [rateLimit(container.rateLimiter)]
    : [apiKeyAuth(container.config.API_KEY), rateLimit(container.rateLimiter)];
  app.use('/v1/*', ...guards);

  app.openapi(profileRoute, async (c) => {
    const { url, username, refresh } = c.req.valid('query');
    if (!url && !username) {
      throw new InvalidProfileUrlError('Provide either a url or a username query parameter');
    }

    const ref = url ? parseProfileUrl(url) : fromPublicIdentifier(username ?? '');
    const result = await container.profiles.fetch(
      ref,
      refresh === 'true' ? { refresh: true } : undefined,
    );

    return c.json(toProfileResponse(ref, result), 200);
  });
}
