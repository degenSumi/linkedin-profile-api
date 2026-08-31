import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { UpstreamUnavailableError } from '../core/errors.js';
import type { HttpClient, HttpRequest, HttpResponse } from '../core/ports.js';

export interface FetchHttpClientOptions {
  readonly timeoutMs: number;
  readonly proxyUrl?: string;
}

export class FetchHttpClient implements HttpClient {
  private readonly dispatcher: ProxyAgent | undefined;

  constructor(private readonly options: FetchHttpClientOptions) {
    this.dispatcher = options.proxyUrl ? new ProxyAgent(options.proxyUrl) : undefined;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    const signal = AbortSignal.timeout(this.options.timeoutMs);

    try {
      const response = await undiciFetch(request.url, {
        method: request.method ?? 'GET',
        headers: request.headers ?? {},
        body: request.body ?? null,
        redirect: request.redirect ?? 'follow',
        signal,
        ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      });

      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        setCookie: response.headers.getSetCookie(),
        body: await response.text(),
      };
    } catch (error) {
      throw new UpstreamUnavailableError(
        `Request to ${hostOf(request.url)} failed: ${describe(error)}`,
        { cause: error },
      );
    }
  }
}

export class RetryingHttpClient implements HttpClient {
  constructor(
    private readonly inner: HttpClient,
    private readonly attempts = 3,
    private readonly baseDelayMs = 300,
  ) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        const response = await this.inner.send(request);
        if (!isTransient(response.status) || attempt === this.attempts) {
          return response;
        }
      } catch (error) {
        lastError = error;
        if (attempt === this.attempts) {
          throw error;
        }
      }
      await delay(this.baseDelayMs * 2 ** (attempt - 1));
    }

    throw lastError instanceof Error ? lastError : new UpstreamUnavailableError('Request failed');
  }
}

function isTransient(status: number): boolean {
  return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
