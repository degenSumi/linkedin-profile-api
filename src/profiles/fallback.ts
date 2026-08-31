import { AllSourcesFailedError, ProfileNotFoundError } from '../core/errors.js';
import type { SourceFailure } from '../core/errors.js';
import type { FetchOptions, ProfileSource } from '../core/ports.js';
import type { ProfileRef } from '../core/profile-url.js';
import type { ProfileResult } from '../core/types.js';

/** Tries each source in turn and returns the first answer, so one blocked source is not fatal. */
export class FallbackChain implements ProfileSource {
  readonly name = 'fallback';

  constructor(private readonly sources: readonly ProfileSource[]) {
    if (sources.length === 0) {
      throw new Error('FallbackChain requires at least one source');
    }
  }

  async fetch(ref: ProfileRef, options?: FetchOptions): Promise<ProfileResult> {
    const failures: SourceFailure[] = [];

    for (const source of this.sources) {
      try {
        const result = await source.fetch(ref, options);
        return failures.length > 0 ? { ...result, degradedFrom: [...failures] } : result;
      } catch (error) {
        // A missing profile is an answer, not a source failure — later sources cannot do better.
        if (error instanceof ProfileNotFoundError) {
          throw error;
        }
        const failure = { source: source.name, reason: reasonOf(error) };
        // Surfaced even when a later source succeeds — otherwise a silently degraded
        // response looks identical to a healthy one in the logs.
        console.warn('profile_source_failed', failure);
        failures.push(failure);
      }
    }

    throw new AllSourcesFailedError(failures);
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
