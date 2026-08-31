import { InvalidProfileUrlError } from './errors.js';

export interface ProfileRef {
  readonly publicIdentifier: string;
  readonly canonicalUrl: string;
}

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
const PUBLIC_IDENTIFIER = /^[\p{L}\p{N}\-_%.]{1,100}$/u;

export function parseProfileUrl(input: string): ProfileRef {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new InvalidProfileUrlError('A LinkedIn profile URL is required');
  }

  const url = toUrl(trimmed);
  if (!LINKEDIN_HOST.test(url.hostname)) {
    throw new InvalidProfileUrlError(`Not a LinkedIn URL: ${trimmed}`);
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const marker = segments.findIndex((segment) => segment.toLowerCase() === 'in');
  const identifier = marker === -1 ? undefined : segments[marker + 1];
  if (!identifier) {
    throw new InvalidProfileUrlError(
      `Only personal profile URLs of the form linkedin.com/in/{username} are supported, got: ${trimmed}`,
    );
  }

  return fromPublicIdentifier(identifier);
}

export function fromPublicIdentifier(input: string): ProfileRef {
  const publicIdentifier = decodeURIComponent(input.trim()).replace(/\/+$/, '');
  if (!PUBLIC_IDENTIFIER.test(publicIdentifier)) {
    throw new InvalidProfileUrlError(`Not a valid LinkedIn username: ${input}`);
  }

  return {
    publicIdentifier,
    canonicalUrl: `https://www.linkedin.com/in/${encodeURIComponent(publicIdentifier)}`,
  };
}

function toUrl(value: string): URL {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme);
  } catch {
    throw new InvalidProfileUrlError(`Not a valid URL: ${value}`);
  }
}
