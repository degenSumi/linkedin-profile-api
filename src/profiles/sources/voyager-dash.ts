import type { HttpClient, ProfileSource } from '../../core/ports.js';
import type { ProfileRef } from '../../core/profile-url.js';
import type { ProfileResult } from '../../core/types.js';
import { voyagerHeaders } from '../../linkedin/headers.js';
import type { LinkedInSessions } from '../../linkedin/session.js';
import { mapNormalizedProfile } from './normalized.js';
import { assertMeaningful, assertUsable, parseVoyagerJson } from './voyager.js';

const ENDPOINT = 'https://www.linkedin.com/voyager/api/identity/dash/profiles';

// The decoration selects how much of the graph LinkedIn inlines. Without it the response
// carries the profile alone; with it, positions, education and their companies come too.
const DEFAULT_DECORATION =
  'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-67';

export class VoyagerDashSource implements ProfileSource {
  readonly name = 'voyager-dash';

  constructor(
    private readonly http: HttpClient,
    private readonly sessions: LinkedInSessions,
    private readonly decorationId: string = DEFAULT_DECORATION,
  ) {}

  async fetch(ref: ProfileRef): Promise<ProfileResult> {
    const session = await this.sessions.get();
    const response = await this.http.send({
      url:
        `${ENDPOINT}?q=memberIdentity` +
        `&memberIdentity=${encodeURIComponent(ref.publicIdentifier)}` +
        `&decorationId=${encodeURIComponent(this.decorationId)}`,
      headers: voyagerHeaders(session),
      redirect: 'manual',
    });

    assertUsable(response, ref, this.sessions, 'Voyager dash profiles');

    const profile = mapNormalizedProfile(parseVoyagerJson(response.body, 'Voyager dash profiles'));
    assertMeaningful(profile, 'Voyager dash profiles');

    return {
      profile,
      source: 'voyager-dash',
      partial: false,
      fetchedAt: new Date().toISOString(),
    };
  }
}

