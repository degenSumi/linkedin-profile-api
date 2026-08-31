import { describe, expect, it } from 'vitest';
import dashProfile from './fixtures/dash-profile.json' with { type: 'json' };
import { createApp } from '../src/api/app.js';
import { ProfileResponseSchema } from '../src/api/schema.js';
import { buildContainer } from '../src/container.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../src/core/ports.js';
import { loadConfig } from '../src/infra/config.js';

class FakeHttpClient implements HttpClient {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly reply: (request: HttpRequest) => Partial<HttpResponse>) {}

  send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return Promise.resolve({
      status: 200,
      headers: {},
      setCookie: [],
      body: '',
      ...this.reply(request),
    });
  }
}

const AUTH = { 'x-api-key': 'test-key' };

function appWith(reply: (request: HttpRequest) => Partial<HttpResponse>, env = {}) {
  const http = new FakeHttpClient(reply);
  const config = loadConfig({
    API_KEY: 'test-key',
    LI_AT: 'fake-cookie',
    RATE_LIMIT_PER_MINUTE: '100',
    ...env,
  });
  return { app: createApp(buildContainer(config, { http })), http };
}

const voyagerOk = () => ({ status: 200, body: JSON.stringify(dashProfile) });

describe('GET /health', () => {
  it('reports configuration state without an API key', async () => {
    const { app } = appWith(voyagerOk);
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      authRequired: true,
      sessionConfigured: true,
      sources: ['voyager-dash', 'public-html'],
    });
  });
});

describe('GET /v1/profile', () => {
  it('returns a profile that satisfies the published schema', async () => {
    const { app, http } = appWith(voyagerOk);
    const response = await app.request('/v1/profile?url=https://www.linkedin.com/in/ada-lovelace', {
      headers: AUTH,
    });

    expect(response.status).toBe(200);
    const body = ProfileResponseSchema.parse(await response.json());
    expect(body.publicIdentifier).toBe('ada-lovelace');
    expect(body.source).toBe('voyager-dash');
    expect(body.partial).toBe(false);
    expect(body.profile.fullName).toBe('Bill Gates');
    expect(http.requests[0]?.url).toContain('/identity/dash/profiles?q=memberIdentity');
    expect(http.requests[0]?.headers?.['csrf-token']).toBeTruthy();
  });

  it('accepts a bare username', async () => {
    const { app } = appWith(voyagerOk);
    const response = await app.request('/v1/profile?username=ada-lovelace', { headers: AUTH });

    expect(response.status).toBe(200);
  });

  it('serves a second identical request from cache', async () => {
    const { app, http } = appWith(voyagerOk);
    const url = '/v1/profile?username=ada-lovelace';

    const first = await app.request(url, { headers: AUTH });
    const second = await app.request(url, { headers: AUTH });

    expect(await second.json()).toEqual(await first.json());
    expect(http.requests).toHaveLength(1);
  });

  it('bypasses the cache when refresh=true', async () => {
    const { app, http } = appWith(voyagerOk);

    await app.request('/v1/profile?username=ada-lovelace', { headers: AUTH });
    await app.request('/v1/profile?username=ada-lovelace&refresh=true', { headers: AUTH });

    expect(http.requests).toHaveLength(2);
  });

  it('treats an empty Voyager payload as a source failure rather than a complete answer', async () => {
    const emptyProfile = {
      included: [{ $type: 'com.linkedin.voyager.dash.identity.profile.Profile' }],
    };
    const { app } = appWith((request) =>
      request.url.includes('/voyager/')
        ? { status: 200, body: JSON.stringify(emptyProfile) }
        : {
            status: 200,
            body: `<script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Ada Lovelace"}]}</script>`,
          },
    );

    const response = await app.request('/v1/profile?username=ada-lovelace', { headers: AUTH });
    const body = ProfileResponseSchema.parse(await response.json());

    expect(body.source).toBe('public-html');
    expect(body.profile.fullName).toBe('Ada Lovelace');
  });

  it('falls back to the public page when Voyager is blocked', async () => {
    const { app } = appWith((request) =>
      request.url.includes('/voyager/')
        ? { status: 999 }
        : {
            status: 200,
            body: `<script type="application/ld+json">{"@graph":[{"@type":"Person","name":"Ada Lovelace"}]}</script>`,
          },
    );

    const response = await app.request('/v1/profile?username=ada-lovelace', { headers: AUTH });
    const body = ProfileResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.source).toBe('public-html');
    expect(body.partial).toBe(true);
  });

  it('reports 404 when LinkedIn has no such profile', async () => {
    const { app } = appWith(() => ({ status: 404 }));
    const response = await app.request('/v1/profile?username=nobody-here', { headers: AUTH });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'profile_not_found' } });
  });

  it('reports 502 when every source fails', async () => {
    const { app } = appWith(() => ({ status: 500 }));
    const response = await app.request('/v1/profile?username=ada-lovelace', { headers: AUTH });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'all_sources_failed' } });
  });

  it('rejects a URL that is not a LinkedIn profile', async () => {
    const { app } = appWith(voyagerOk);
    const response = await app.request('/v1/profile?url=https://example.com/in/ada', {
      headers: AUTH,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_profile_url' } });
  });

  it('requires a url or username', async () => {
    const { app } = appWith(voyagerOk);
    expect((await app.request('/v1/profile', { headers: AUTH })).status).toBe(400);
  });

  it('rejects a request without an API key', async () => {
    const { app } = appWith(voyagerOk);
    const response = await app.request('/v1/profile?username=ada-lovelace');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('rate limits a burst from one caller', async () => {
    const { app } = appWith(voyagerOk, { RATE_LIMIT_PER_MINUTE: '2' });
    const send = () => app.request('/v1/profile?username=ada-lovelace', { headers: AUTH });

    await send();
    await send();
    const limited = await send();

    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('surfaces the missing-session reason when no source can answer', async () => {
    const { app } = appWith(() => ({ status: 200, body: '<html>auth wall</html>' }), {
      LI_AT: undefined,
    });
    const response = await app.request('/v1/profile?username=ada-lovelace', { headers: AUTH });

    expect(response.status).toBe(502);
    expect(await response.text()).toContain('No LinkedIn credentials are configured');
  });
});

describe('documentation', () => {
  it('publishes an OpenAPI document', async () => {
    const { app } = appWith(voyagerOk);
    const document = (await (await app.request('/openapi.json')).json()) as {
      paths: Record<string, unknown>;
    };

    expect(Object.keys(document.paths)).toContain('/v1/profile');
  });
});
