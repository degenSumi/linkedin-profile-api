import type { ProfileResult } from './types.js';
import type { ProfileRef } from './profile-url.js';

export interface FetchOptions {
  readonly refresh?: boolean;
}

export interface ProfileSource {
  readonly name: string;
  fetch(ref: ProfileRef, options?: FetchOptions): Promise<ProfileResult>;
}

export interface HttpRequest {
  readonly url: string;
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly redirect?: 'follow' | 'manual';
}

export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly setCookie: readonly string[];
  readonly body: string;
}

export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}

export interface Store<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlSeconds: number): Promise<void>;
}
