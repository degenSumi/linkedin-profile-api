import { describe, expect, it } from 'vitest';
import { AllSourcesFailedError, ProfileNotFoundError } from '../src/core/errors.js';
import type { ProfileSource } from '../src/core/ports.js';
import type { ProfileRef } from '../src/core/profile-url.js';
import type { Profile, ProfileResult, ProfileSourceName } from '../src/core/types.js';
import { InMemoryTtlStore } from '../src/infra/store.js';
import { CachedSource } from '../src/profiles/cached.js';
import { FallbackChain } from '../src/profiles/fallback.js';

const ref: ProfileRef = {
  publicIdentifier: 'ada-lovelace',
  canonicalUrl: 'https://www.linkedin.com/in/ada-lovelace',
};

const emptyProfile = { fullName: 'Ada Lovelace' } as Profile;

class StubProvider implements ProfileSource {
  calls = 0;

  constructor(
    readonly name: string,
    private readonly outcome: ProfileResult | Error,
  ) {}

  fetch(): Promise<ProfileResult> {
    this.calls += 1;
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

function result(source: ProfileSourceName, fetchedAt = '2026-08-30T00:00:00.000Z'): ProfileResult {
  return { profile: emptyProfile, source, partial: source === 'public-html', fetchedAt };
}

describe('FallbackChain', () => {
  it('returns the first source that succeeds', async () => {
    const first = new StubProvider('voyager-dash', result('voyager-dash'));
    const second = new StubProvider('public-html', result('public-html'));

    const outcome = await new FallbackChain([first, second]).fetch(ref);

    expect(outcome.source).toBe('voyager-dash');
    expect(second.calls).toBe(0);
  });

  it('falls through to a later source when an earlier one fails', async () => {
    const chain = new FallbackChain([
      new StubProvider('voyager-dash', new Error('blocked')),
      new StubProvider('public-html', result('public-html')),
    ]);

    const outcome = await chain.fetch(ref);

    expect(outcome.source).toBe('public-html');
    expect(outcome.partial).toBe(true);
  });

  it('reports why the earlier sources were skipped', async () => {
    const chain = new FallbackChain([
      new StubProvider('voyager-dash', new Error('the session has expired')),
      new StubProvider('public-html', result('public-html')),
    ]);

    const outcome = await chain.fetch(ref);

    expect(outcome.degradedFrom).toEqual([
      { source: 'voyager-dash', reason: 'the session has expired' },
    ]);
  });

  it('leaves the failure list off a response the primary source served', async () => {
    const chain = new FallbackChain([new StubProvider('voyager-dash', result('voyager-dash'))]);

    expect((await chain.fetch(ref)).degradedFrom).toBeUndefined();
  });

  it('stops immediately when a source reports the profile does not exist', async () => {
    const later = new StubProvider('public-html', result('public-html'));
    const chain = new FallbackChain([
      new StubProvider('voyager-dash', new ProfileNotFoundError('gone')),
      later,
    ]);

    await expect(chain.fetch(ref)).rejects.toBeInstanceOf(ProfileNotFoundError);
    expect(later.calls).toBe(0);
  });

  it('aggregates every failure when no source succeeds', async () => {
    const chain = new FallbackChain([
      new StubProvider('voyager-dash', new Error('blocked')),
      new StubProvider('public-html', new Error('auth wall')),
    ]);

    await expect(chain.fetch(ref)).rejects.toThrow(AllSourcesFailedError);
    await expect(chain.fetch(ref)).rejects.toThrow(/voyager-dash \(blocked\).*public-html/);
  });

  it('refuses to be constructed without a source', () => {
    expect(() => new FallbackChain([])).toThrow();
  });
});

const TTL = { full: 60, partial: 5 };

describe('CachedSource', () => {
  it('serves a repeat request without touching the inner provider', async () => {
    const inner = new StubProvider('voyager-dash', result('voyager-dash'));
    const cached = new CachedSource(inner, new InMemoryTtlStore(), TTL);

    const first = await cached.fetch(ref);
    const second = await cached.fetch(ref);

    expect(inner.calls).toBe(1);
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it('bypasses the cache when a refresh is requested', async () => {
    const inner = new StubProvider('voyager-dash', result('voyager-dash'));
    const cached = new CachedSource(inner, new InMemoryTtlStore(), TTL);

    await cached.fetch(ref);
    await cached.fetch(ref, { refresh: true });

    expect(inner.calls).toBe(2);
  });

  it('gives a degraded answer a shorter lifetime than a full one', async () => {
    const store = new InMemoryTtlStore<ProfileResult>();
    const ttls: number[] = [];
    const spy = {
      get: (key: string) => store.get(key),
      set: (key: string, value: ProfileResult, ttl: number) => {
        ttls.push(ttl);
        return store.set(key, value, ttl);
      },
    };

    await new CachedSource(
      new StubProvider('voyager-dash', result('voyager-dash')),
      spy,
      TTL,
    ).fetch(ref);
    await new CachedSource(new StubProvider('public-html', result('public-html')), spy, TTL).fetch(
      ref,
      { refresh: true },
    );

    expect(ttls).toEqual([TTL.full, TTL.partial]);
  });

  it('re-fetches once the entry has expired', async () => {
    const inner = new StubProvider('voyager-dash', result('voyager-dash'));
    const store = new InMemoryTtlStore<ProfileResult>();
    const cached = new CachedSource(inner, store, TTL);

    await cached.fetch(ref);
    await store.set('profile:ada-lovelace', result('voyager-dash'), -1);
    await cached.fetch(ref);

    expect(inner.calls).toBe(2);
  });
});
