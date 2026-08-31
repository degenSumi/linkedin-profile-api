import type { HttpClient, ProfileSource } from '../../core/ports.js';
import type { ProfileRef } from '../../core/profile-url.js';
import type { ProfileResult } from '../../core/types.js';
import { voyagerHeaders } from '../../linkedin/headers.js';
import type { LinkedInSessions } from '../../linkedin/session.js';
import { mapNormalizedProfile } from './normalized.js';
import { assertMeaningful, assertUsable, parseVoyagerJson } from './voyager.js';

const ENDPOINT = 'https://www.linkedin.com/voyager/api/graphql';

export class VoyagerGraphQlSource implements ProfileSource {
  readonly name = 'voyager-graphql';

  constructor(
    private readonly http: HttpClient,
    private readonly sessions: LinkedInSessions,
    private readonly queryId: string,
  ) {}

  async fetch(ref: ProfileRef): Promise<ProfileResult> {
    const session = await this.sessions.get();
    const response = await this.http.send({
      url:
        `${ENDPOINT}?includeWebMetadata=true` +
        // The live site sends memberIdentity, which accepts the public identifier as
        // well as the member URN id. vanityName is not a parameter this query takes.
        `&variables=(memberIdentity:${encodeURIComponent(ref.publicIdentifier)})` +
        `&queryId=${encodeURIComponent(this.queryId)}`,
      headers: voyagerHeaders(session),
      redirect: 'manual',
    });

    assertUsable(response, ref, this.sessions, 'Voyager GraphQL');

    const profile = mapNormalizedProfile(parseVoyagerJson(response.body, 'Voyager GraphQL'));
    assertMeaningful(profile, 'Voyager GraphQL');

    return {
      profile,
      source: 'voyager-graphql',
      partial: false,
      fetchedAt: new Date().toISOString(),
    };
  }
}

// The normalized response flattens every entity into `included`, tagged by $type,
// which keeps this mapper independent of the exact shape of the registered query.
