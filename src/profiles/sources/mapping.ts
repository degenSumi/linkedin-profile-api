import type { ImageSet, PartialDate } from '../../core/types.js';

/**
 * Helpers for reading LinkedIn's payloads, which arrive as `unknown` and omit whole
 * sections for sparse profiles. Traversing with these keeps the mappers free of `any`
 * and makes a missing field a `null` rather than a crash.
 */

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function pick(value: unknown, ...path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    const asRecord = record(current);
    if (!asRecord) {
      return undefined;
    }
    current = asRecord[key];
  }
  return current;
}

export function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

export function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function partialDate(raw: unknown): PartialDate | null {
  const month = integer(pick(raw, 'month'));
  const year = integer(pick(raw, 'year'));
  return month === null && year === null ? null : { month, year };
}

export function isNamed(value: { readonly name: string }): boolean {
  return value.name.length > 0;
}

// Vector images arrive as a root URL plus per-size path segments that must be concatenated.
export function vectorImage(raw: unknown): ImageSet {
  const rootUrl = text(pick(raw, 'rootUrl'));
  const artifacts = list(pick(raw, 'artifacts'))
    .map((artifact) => ({
      width: integer(pick(artifact, 'width')) ?? 0,
      segment: text(pick(artifact, 'fileIdentifyingUrlPathSegment')),
    }))
    .filter((artifact): artifact is { width: number; segment: string } => artifact.segment !== null)
    .sort((a, b) => a.width - b.width);

  if (!rootUrl || artifacts.length === 0) {
    return { small: null, medium: null, large: null, original: null };
  }

  const at = (index: number): string | null => {
    const artifact = artifacts[Math.min(index, artifacts.length - 1)];
    return artifact ? `${rootUrl}${artifact.segment}` : null;
  };

  return { small: at(0), medium: at(1), large: at(2), original: at(artifacts.length - 1) };
}
