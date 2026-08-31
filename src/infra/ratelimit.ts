interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitVerdict {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  consume(key: string): Promise<RateLimitVerdict> {
    const now = Date.now();
    const current = this.windows.get(key);

    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return Promise.resolve({ allowed: true, retryAfterSeconds: 0 });
    }

    current.count += 1;
    const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
    return Promise.resolve({ allowed: current.count <= this.limit, retryAfterSeconds });
  }
}
