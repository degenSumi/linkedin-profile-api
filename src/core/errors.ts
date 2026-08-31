export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidProfileUrlError extends AppError {
  readonly status = 400;
  readonly code = 'invalid_profile_url';
}

export class UnauthorizedError extends AppError {
  readonly status = 401;
  readonly code = 'unauthorized';
}

export class ProfileNotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'profile_not_found';
}

export class RateLimitExceededError extends AppError {
  readonly status = 429;
  readonly code = 'rate_limit_exceeded';

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

export class UpstreamBlockedError extends AppError {
  readonly status = 502;
  readonly code = 'upstream_blocked';
}

export class UpstreamUnavailableError extends AppError {
  readonly status = 502;
  readonly code = 'upstream_unavailable';
}

export class SessionUnavailableError extends AppError {
  readonly status = 503;
  readonly code = 'session_unavailable';
}

export interface SourceFailure {
  readonly source: string;
  readonly reason: string;
}

export class AllSourcesFailedError extends AppError {
  readonly status = 502;
  readonly code = 'all_sources_failed';

  constructor(readonly failures: readonly SourceFailure[]) {
    super(
      `Every profile source failed: ${failures.map((f) => `${f.source} (${f.reason})`).join(', ')}`,
    );
  }
}

export class ConfigurationError extends AppError {
  readonly status = 503;
  readonly code = 'not_configured';
}
