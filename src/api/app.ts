import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import type { Container } from '../container.js';
import { errorHandler, requestId } from './middleware.js';
import type { AppEnv } from './middleware.js';
import { registerRoutes } from './routes.js';

export function createApp(container: Container): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>();

  app.use('*', requestId());
  app.onError(errorHandler());

  registerRoutes(app, container);

  app.openAPIRegistry.registerComponent('securitySchemes', 'apiKey', {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
  });

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'LinkedIn Profile API', version: '1.0.0' },
  });

  const { API_KEY, DOCS_PREFILL_API_KEY } = container.config;
  const prefill =
    DOCS_PREFILL_API_KEY && API_KEY
      ? ({
          authentication: {
            preferredSecurityScheme: 'apiKey',
            securitySchemes: {
              apiKey: { type: 'apiKey', name: 'x-api-key', in: 'header', value: API_KEY },
            },
          },
        } as const)
      : {};

  app.get(
    '/docs',
    Scalar({ url: '/openapi.json', pageTitle: 'LinkedIn Profile API', ...prefill }),
  );
  app.get('/', (c) => c.redirect('/docs'));

  return app;
}
