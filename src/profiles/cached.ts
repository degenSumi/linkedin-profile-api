import type { FetchOptions, ProfileSource, Store } from '../core/ports.js';
import type { ProfileRef } from '../core/profile-url.js';
import type { ProfileResult } from '../core/types.js';

export interface CacheTtl {
  readonly full: number;
  /** Degraded answers expire quickly so a transient block is not served for a full TTL. */
  readonly partial: number;
}

/** Skips the wrapped source entirely while a fresh answer is still in the store. */
export class CachedSource implements ProfileSource {
  readonly name: string;

  constructor(
    private readonly source: ProfileSource,
    private readonly store: Store<ProfileResult>,
    private readonly ttl: CacheTtl,
  ) {
    this.name = source.name;
  }

  async fetch(ref: ProfileRef, options?: FetchOptions): Promise<ProfileResult> {
    const key = `profile:${ref.publicIdentifier}`;

    if (options?.refresh !== true) {
      const cached = await this.store.get(key);
      if (cached) {
        return cached;
      }
    }

    const result = await this.source.fetch(ref, options);
    await this.store.set(key, result, result.partial ? this.ttl.partial : this.ttl.full);
    return result;
  }
}
