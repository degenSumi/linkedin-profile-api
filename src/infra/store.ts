import type { Store } from '../core/ports.js';

interface Entry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export class InMemoryTtlStore<T> implements Store<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly maxEntries = 500) {}

  get(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }
}
