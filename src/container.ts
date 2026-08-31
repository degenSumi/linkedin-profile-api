import type { HttpClient, ProfileSource } from './core/ports.js';
import type { ProfileResult } from './core/types.js';
import { hasCookieSession, hasCredentials, loadConfig } from './infra/config.js';
import type { Config } from './infra/config.js';
import { InMemoryTtlStore } from './infra/store.js';
import { FetchHttpClient, RetryingHttpClient } from './infra/http.js';
import { FixedWindowRateLimiter } from './infra/ratelimit.js';
import { LinkedInSessions } from './linkedin/session.js';
import { CachedSource } from './profiles/cached.js';
import { FallbackChain } from './profiles/fallback.js';
import { PublicHtmlSource } from './profiles/sources/public-html.js';
import { VoyagerGraphQlSource } from './profiles/sources/voyager-graphql.js';
import { VoyagerDashSource } from './profiles/sources/voyager-dash.js';

export interface Container {
  readonly config: Config;
  readonly profiles: ProfileSource;
  readonly rateLimiter: FixedWindowRateLimiter;
  readonly sources: readonly string[];
  readonly sessionConfigured: boolean;
}

export interface ContainerOverrides {
  readonly http?: HttpClient;
}

export function buildContainer(
  config: Config = loadConfig(),
  overrides: ContainerOverrides = {},
): Container {
  const http =
    overrides.http ??
    new RetryingHttpClient(
      new FetchHttpClient({
        timeoutMs: config.HTTP_TIMEOUT_MS,
        ...(config.PROXY_URL ? { proxyUrl: config.PROXY_URL } : {}),
      }),
    );

  const sessions = new LinkedInSessions(http, {
    liAt: config.LI_AT,
    jsessionId: config.LI_JSESSIONID,
    email: config.LINKEDIN_EMAIL,
    password: config.LINKEDIN_PASSWORD,
  });

  // The dash endpoint is the one that currently answers: the legacy profileView it
  // replaced now returns 410 Gone. GraphQL reads the same normalized documents but
  // needs a captured query id, so it sits behind. The public page needs no session
  // at all, which is why it is last rather than absent.
  // GraphQL is only wired in when its query id is configured, since an unconfigured source
  // would fail on every request and make /health advertise something that cannot answer.
  const sources = [
    new VoyagerDashSource(http, sessions),
    ...(config.VOYAGER_PROFILE_QUERY_ID
      ? [new VoyagerGraphQlSource(http, sessions, config.VOYAGER_PROFILE_QUERY_ID)]
      : []),
    new PublicHtmlSource(http),
  ];

  const profiles = new CachedSource(
    new FallbackChain(sources),
    new InMemoryTtlStore<ProfileResult>(),
    { full: config.CACHE_TTL_SECONDS, partial: config.PARTIAL_CACHE_TTL_SECONDS },
  );

  if (config.DISABLE_AUTH) {
    console.warn('auth_disabled', { detail: 'DISABLE_AUTH is set, so /v1 routes are unauthenticated' });
  }

  return {
    config,
    profiles,
    rateLimiter: new FixedWindowRateLimiter(config.RATE_LIMIT_PER_MINUTE),
    sources: sources.map((source) => source.name),
    sessionConfigured: hasCookieSession(config) || hasCredentials(config),
  };
}
