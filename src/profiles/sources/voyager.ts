import {
  ProfileNotFoundError,
  UpstreamBlockedError,
  UpstreamUnavailableError,
} from '../../core/errors.js';
import type { HttpResponse } from '../../core/ports.js';
import type { ProfileRef } from '../../core/profile-url.js';
import type { Profile } from '../../core/types.js';
import type { LinkedInSessions } from '../../linkedin/session.js';

/**
 * Voyager requests are sent with `redirect: 'manual'` so that an expired session, which
 * LinkedIn answers with a bounce to the login page, surfaces as a rejected session rather
 * than as a redirect loop from fetch.
 */
export function assertUsable(
  response: HttpResponse,
  ref: ProfileRef,
  sessions: LinkedInSessions,
  endpoint: string,
): void {
  if (response.status === 404) {
    throw new ProfileNotFoundError(`No LinkedIn profile at /in/${ref.publicIdentifier}`);
  }

  const redirectedToLogin = response.status >= 300 && response.status < 400;
  // 999 is LinkedIn's "request denied" status for flagged sessions and IP ranges.
  const rejected = response.status === 401 || response.status === 403 || response.status === 999;

  if (redirectedToLogin || rejected) {
    sessions.invalidate();
    throw new UpstreamBlockedError(
      redirectedToLogin
        ? 'LinkedIn redirected the request to sign-in, so the session has expired'
        : `LinkedIn rejected the Voyager session (HTTP ${response.status})`,
    );
  }

  if (response.status !== 200) {
    throw new UpstreamUnavailableError(`${endpoint} returned HTTP ${response.status}`);
  }
}

export function parseVoyagerJson(body: string, endpoint: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new UpstreamUnavailableError(`${endpoint} returned a response that was not JSON`);
  }
}

/**
 * A logged-out or restricted Voyager response can still be a 200 carrying a profile
 * entity with nothing in it. Returning that as a complete answer would be a lie, so it
 * is treated as a source failure and the chain moves on.
 */
export function assertMeaningful(profile: Profile, endpoint: string): void {
  const hasIdentity = Boolean(profile.fullName ?? profile.headline ?? profile.summary);
  if (!hasIdentity && profile.experience.length === 0 && profile.education.length === 0) {
    throw new UpstreamUnavailableError(`${endpoint} returned an empty profile`);
  }
}
