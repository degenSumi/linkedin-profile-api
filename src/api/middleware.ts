import { timingSafeEqual } from 'node:crypto';
import type { Context, ErrorHandler, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  AppError,
  ConfigurationError,
  RateLimitExceededError,
  UnauthorizedError,
} from '../core/errors.js';
import type { FixedWindowRateLimiter } from '../infra/ratelimit.js';

export interface AppEnv {
  Variables: { requestId: string };
}

export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const id = c.req.header('x-request-id') ?? crypto.randomUUID();
    c.set('requestId', id);
    c.header('x-request-id', id);
    await next();
  };
}

export function apiKeyAuth(expected: string | undefined): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!expected) {
      throw new ConfigurationError('API_KEY is not set on this deployment');
    }

    const provided = c.req.header('x-api-key') ?? bearerToken(c.req.header('authorization'));
    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedError('A valid x-api-key header is required');
    }

    await next();
  };
}

export function rateLimit(limiter: FixedWindowRateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const verdict = await limiter.consume(clientKey(c));
    if (!verdict.allowed) {
      throw new RateLimitExceededError(
        `Rate limit exceeded, retry in ${verdict.retryAfterSeconds}s`,
        verdict.retryAfterSeconds,
      );
    }
    await next();
  };
}

export function errorHandler(): ErrorHandler<AppEnv> {
  return (error, c) => {
    const requestId = c.get('requestId') ?? '';

    if (error instanceof AppError) {
      if (error instanceof RateLimitExceededError) {
        c.header('retry-after', String(error.retryAfterSeconds));
      }
      return c.json(
        { error: { code: error.code, message: error.message, requestId } },
        error.status as ContentfulStatusCode,
      );
    }

    console.error('unhandled_error', { requestId, error });
    return c.json(
      { error: { code: 'internal_error', message: 'Unexpected server error', requestId } },
      500,
    );
  };
}

function clientKey(c: Context<AppEnv>): string {
  return (
    c.req.header('x-api-key') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anonymous'
  );
}

function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1];
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
